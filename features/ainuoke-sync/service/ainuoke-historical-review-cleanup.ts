import { createOperationLogDraft, type OperationLogActor, type OperationLogDraft } from "../../operation-logs/model/operation-log.ts";
import type { AinuokeImportReview, AinuokeSyncState } from "../model/ainuoke.ts";
import type { AinuokeRepository } from "../repository/ainuoke-repository.ts";

export type ObsoleteHistoricalReviewCounts = {
  scheduleReviews: number;
  closingReviews: number;
  total: number;
};

export type ObsoleteHistoricalReviewCleanupResult = {
  state: AinuokeSyncState;
  removedScheduleReviews: number;
  removedClosingReviews: number;
  totalRemoved: number;
};

export type ObsoleteHistoricalReviewCleanupRepositories = {
  ainuoke: Pick<AinuokeRepository, "load" | "save">;
  operationLogs: { append(log: OperationLogDraft): Promise<unknown> };
};

const isObsoleteHistoricalReview = (review: AinuokeImportReview): boolean =>
  review.resolvedAt === null && (review.kind === "schedule_match" || review.kind === "closing_match");

export function countObsoleteHistoricalReviews(state: AinuokeSyncState): ObsoleteHistoricalReviewCounts {
  const scheduleReviews = state.reviews.filter((review) => review.kind === "schedule_match" && review.resolvedAt === null).length;
  const closingReviews = state.reviews.filter((review) => review.kind === "closing_match" && review.resolvedAt === null).length;
  return { scheduleReviews, closingReviews, total: scheduleReviews + closingReviews };
}

export function cleanupObsoleteHistoricalReviews(state: AinuokeSyncState): ObsoleteHistoricalReviewCleanupResult {
  const counts = countObsoleteHistoricalReviews(state);
  const next = structuredClone(state);
  next.reviews = next.reviews.filter((review) => !isObsoleteHistoricalReview(review));
  return {
    state: next,
    removedScheduleReviews: counts.scheduleReviews,
    removedClosingReviews: counts.closingReviews,
    totalRemoved: counts.total,
  };
}

function cleanupOperationLog(result: ObsoleteHistoricalReviewCleanupResult, actor: OperationLogActor, timestamp: string): OperationLogDraft {
  return createOperationLogDraft({
    actor,
    module: "艾诺科同步",
    entityType: "AinuokeImportReview",
    entityId: "obsolete-historical-review-backlog",
    action: "清理艾诺科旧迁移待确认",
    afterData: {
      objectType: "AinuokeImportReview",
      objectId: "obsolete-historical-review-backlog",
      objectName: "旧迁移待确认",
      values: {
        removedScheduleReviewCount: result.removedScheduleReviews,
        removedClosingReviewCount: result.removedClosingReviews,
        totalRemoved: result.totalRemoved,
      },
    },
    createdAt: timestamp,
  });
}

export async function commitObsoleteHistoricalReviewCleanup(input: {
  canResolveConflicts: boolean;
  actor: OperationLogActor;
  repositories: ObsoleteHistoricalReviewCleanupRepositories;
  timestamp?: string;
}): Promise<ObsoleteHistoricalReviewCleanupResult & { operationLog: OperationLogDraft | null }> {
  if (!input.canResolveConflicts) throw new Error("缺少 ainuoke.resolve_conflict 权限，不能清理旧迁移待确认");
  const current = await input.repositories.ainuoke.load();
  const cleanup = cleanupObsoleteHistoricalReviews(current);
  if (cleanup.totalRemoved === 0) return { ...cleanup, operationLog: null };

  const savedState = await input.repositories.ainuoke.save(cleanup.state);
  const operationLog = cleanupOperationLog(cleanup, input.actor, input.timestamp ?? new Date().toISOString());
  await input.repositories.operationLogs.append(operationLog);
  return { ...cleanup, state: savedState, operationLog };
}

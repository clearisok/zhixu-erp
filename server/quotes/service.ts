import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { QuoteConflictError, type QuoteRecord, type ServerQuote } from "./model.js";
import { createQuoteRepository, type QuoteMutationHook } from "./repository.js";
import { createServerQuoteDraft } from "./draft.js";
import { allocateQuoteCode } from "./numbering.js";
import { applyQuoteVersionCommand, type QuoteVersionCommand } from "./version-workflows.js";
import { applyEstimateCommand, type EstimateCommand } from "./estimate-workflows.js";

/** Internal Q1 persistence/import foundation. It is not exposed by the runtime
 * Browser API; callers here preserve exact historical aggregate identities. */
export function createQuoteService(pool: Pool) {
  const repository = createQuoteRepository(pool);
  return { createAggregate: repository.create, saveAggregate: repository.save, getById: repository.getById, list: repository.list };
}

export type QuoteMutationContext = {
  requestId?: string;
  method?: string;
  path?: string;
  workflowAction?: string;
};

export type QuoteRuntimeDependencies = {
  now?: () => Date;
  randomUuid?: () => string;
};

function requireChangedPermission(
  actor: TrustedIdentity,
  permission: PermissionKey,
  before: unknown,
  after: unknown,
): void {
  if (!isDeepStrictEqual(before, after)) requirePermission(actor.permissions, permission);
}

function priceVersionById(revision: ServerQuote["revisions"][number], id: string) {
  return revision.priceVersions.find((version) => version.id === id);
}
function authorizeEstimateRead(actor: TrustedIdentity, quote: ServerQuote): void {
  if (quote.activeEstimateCost || quote.estimateCostHistory.length) requirePermission(actor.permissions, "estimate.view");
}

/**
 * A full aggregate replacement can contain several independently permissioned
 * Quote operations. Keep the broad quote.edit gate, then enforce the existing
 * finer-grained permissions when those subdomains actually change.
 */
function authorizeReplacement(actor: TrustedIdentity, before: ServerQuote, after: ServerQuote): void {
  requirePermission(actor.permissions, "quote.edit");
  if (before.deletedAt !== after.deletedAt) {
    throw new HttpError(409, "quote_delete_not_supported", "Quote deletion is not available through this API");
  }

  requireChangedPermission(
    actor,
    "quote.revision.update",
    { defaultRevisionId: before.defaultRevisionId, revisionIds: before.revisions.map((revision) => revision.revisionId) },
    { defaultRevisionId: after.defaultRevisionId, revisionIds: after.revisions.map((revision) => revision.revisionId) },
  );
  requireChangedPermission(actor, "estimate.edit", {
    active: before.activeEstimateCost,
    history: before.estimateCostHistory,
  }, {
    active: after.activeEstimateCost,
    history: after.estimateCostHistory,
  });

  for (const nextRevision of after.revisions) {
    const previousRevision = before.revisions.find((revision) => revision.revisionId === nextRevision.revisionId);
    if (!previousRevision) continue;
    if (!isDeepStrictEqual(
      [previousRevision.imageAttachmentIds, previousRevision.fileAttachmentIds, previousRevision.styleImageAttachmentId],
      [nextRevision.imageAttachmentIds, nextRevision.fileAttachmentIds, nextRevision.styleImageAttachmentId],
    )) throw new HttpError(409, "quote_attachment_command_required", "Use the dedicated attachment command API");
    const previousIds = previousRevision.priceVersions.map((version) => version.id);
    const nextIds = nextRevision.priceVersions.map((version) => version.id);
    if (nextIds.some((id) => !previousIds.includes(id))) requirePermission(actor.permissions, "quote.price_version.create");
    if (previousIds.some((id) => !nextIds.includes(id))) requirePermission(actor.permissions, "quote.price_version.delete");
    for (const nextVersion of nextRevision.priceVersions) {
      const previousVersion = priceVersionById(previousRevision, nextVersion.id);
      if (!previousVersion) continue;
      requireChangedPermission(actor, "quote.settings.edit", previousVersion.pricingParameters, nextVersion.pricingParameters);
      requireChangedPermission(actor, "quote.cost.edit", {
        fabrics: previousVersion.fabrics,
        trims: previousVersion.trims,
        labor: previousVersion.labor,
        otherCosts: previousVersion.otherCosts,
      }, {
        fabrics: nextVersion.fabrics,
        trims: nextVersion.trims,
        labor: nextVersion.labor,
        otherCosts: nextVersion.otherCosts,
      });
      requireChangedPermission(actor, "quote.confirm", previousVersion.confirmation, nextVersion.confirmation);
    }
  }
}

function auditSnapshot(record: QuoteRecord | null) {
  if (!record) return null;
  const revision = record.quote.revisions.find((item) => item.revisionId === record.quote.defaultRevisionId);
  return {
    quoteCode: record.quote.quoteCode,
    quoteStyleNo: revision?.baseInfo.quoteStyleNo,
    styleName: revision?.baseInfo.styleName,
    revisionId: revision?.revisionId,
    revisionLabel: revision?.revisionLabel,
    values: {
      aggregateVersion: record.version,
      aggregateStatus: record.quote.aggregateStatus,
      revisionCount: record.quote.revisions.length,
      priceVersionCount: revision?.priceVersions.length ?? 0,
      estimateHistoryCount: record.quote.estimateCostHistory.length,
    },
  };
}

export function createTrustedQuoteService(pool: Pool, dependencies: QuoteRuntimeDependencies = {}) {
  const repository = createQuoteRepository(pool);
  const now = dependencies.now ?? (() => new Date());
  const nextUuid = dependencies.randomUuid ?? randomUUID;
  const audit = (actor: TrustedIdentity, context: QuoteMutationContext): QuoteMutationHook => async (client, mutation) => {
    await appendOperationLog(client, actor, {
      module: "报价中心",
      action: mutation.kind === "create" ? "创建报价" : "保存报价",
      entityType: "Quote",
      entityId: mutation.after.quote.id,
      quoteId: mutation.after.quote.id,
      context: {
        requestId: context.requestId ?? null,
        method: context.method ?? null,
        path: context.path ?? null,
      },
      beforeData: auditSnapshot(mutation.before),
      afterData: auditSnapshot(mutation.after),
      metadata: {
        mutationKind: mutation.kind,
        beforeVersion: mutation.before?.version ?? null,
        afterVersion: mutation.after.version,
        ...(context.workflowAction ? { workflowAction: context.workflowAction } : {}),
      },
    });
    // A new Revision inherits relationship rows in the repository transaction.
    // Each inherited link must retain the same trusted audit boundary.
    const oldIds = new Set(mutation.before?.quote.revisions.map((revision) => revision.revisionId) ?? []);
    for (const revision of mutation.after.quote.revisions) {
      if (oldIds.has(revision.revisionId)) continue;
      for (const attachmentId of [...revision.imageAttachmentIds, ...revision.fileAttachmentIds]) {
        await appendOperationLog(client, actor, {
          module: "报价中心", action: "关联附件", entityType: "Attachment", entityId: attachmentId,
          quoteId: mutation.after.quote.id,
          context: { revisionId: revision.revisionId },
          beforeData: null,
          afterData: { attachmentId, values: { revisionId: revision.revisionId } },
        });
      }
    }
  };

  return {
    getById: repository.getById,
    async getForActor(actor: TrustedIdentity, id: string) {
      requirePermission(actor.permissions, "quote.view");
      const record = await repository.getById(id);
      if (record) authorizeEstimateRead(actor, record.quote);
      return record;
    },
    list: repository.list,
    async estimateWorkflow(actor: TrustedIdentity, quoteId: string, command: EstimateCommand, context: QuoteMutationContext = {}) {
      requirePermission(actor.permissions, "quote.edit");
      requirePermission(actor.permissions, "estimate.view");
      requirePermission(actor.permissions, "estimate.edit");
      const before = await repository.getById(quoteId);
      if (!before) throw new HttpError(404, "quote_not_found", "Quote not found");
      if (before.version !== command.expectedVersion) throw new QuoteConflictError();
      const next = applyEstimateCommand(before.quote, command, { id: nextUuid, actor: actor.userName, now: now().toISOString() });
      return repository.save(next, command.expectedVersion, audit(actor, { ...context, workflowAction: command.action }));
    },
    async versionWorkflow(actor: TrustedIdentity, quoteId: string, command: QuoteVersionCommand, context: QuoteMutationContext = {}) {
      requirePermission(actor.permissions, "quote.edit");
      requirePermission(actor.permissions, command.action === "revision.create" ? "quote.revision.update" : command.action === "price.create" ? "quote.price_version.create" : command.action === "price.delete" ? "quote.price_version.delete" : "quote.edit");
      const before = await repository.getById(quoteId);
      if (!before) throw new HttpError(404, "quote_not_found", "Quote not found");
      if (before.version !== command.expectedVersion) throw new QuoteConflictError();
      const next = applyQuoteVersionCommand(before.quote, command, { id: nextUuid, actor: actor.userName, now: now().toISOString() });
      authorizeEstimateRead(actor, before.quote);
      authorizeReplacement(actor, before.quote, next);
      return repository.save(next, command.expectedVersion, audit(actor, { ...context, workflowAction: command.action }));
    },
    async createRuntimeDraft(actor: TrustedIdentity, context: QuoteMutationContext = {}) {
      requirePermission(actor.permissions, "quote.create");
      const createdAt = now();
      return repository.createGenerated(async (client) => createServerQuoteDraft({
        quoteId: nextUuid(),
        revisionId: nextUuid(),
        priceVersionId: nextUuid(),
        quoteCode: await allocateQuoteCode(client, createdAt),
      }, actor, createdAt), audit(actor, context));
    },
    async saveAggregate(actor: TrustedIdentity, input: ServerQuote, expectedVersion: number, context: QuoteMutationContext = {}) {
      const before = await repository.getById(input.id);
      if (!before) throw new HttpError(404, "quote_not_found", "Quote was not found");
      authorizeEstimateRead(actor, before.quote);
      if (!isDeepStrictEqual([before.quote.activeEstimateCost, before.quote.estimateCostHistory], [input.activeEstimateCost, input.estimateCostHistory])) {
        throw new HttpError(409, "estimate_command_required", "Use the dedicated Estimate command API");
      }
      authorizeReplacement(actor, before.quote, input);
      if (expectedVersion !== before.version) throw new QuoteConflictError();
      if (isDeepStrictEqual(before.quote, input)) return before;
      return repository.save(input, expectedVersion, audit(actor, context));
    },
  };
}

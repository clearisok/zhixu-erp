import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { HttpError } from "../http/errors.js";
import { productionResourceDate, productionResourceUuid } from "../production-resources/contract.js";
import { planDecimal } from "./contract.js";

/** Cumulative actual output, independent of planned quantity and commercial terms. */
export type ExecutionData = {
  status: "in_progress" | "completed";
  completedQuantity: string;
  actualStartDate: string | null;
  actualCompletedDate: string | null;
};
export type ExecutionIntent = {
  action: "record_execution";
  orderId: string;
  assignmentId: string;
  expectedAssignmentVersion: number;
  expectedExecutionVersion: number;
  expectedPlanVersion: number;
  data: ExecutionData;
  reason: string;
  replan: { expectedQueueVersion: number } | null;
};
export type ExecutionCommand = { requestId: string; intent: ExecutionIntent; previewHash: string };

const invalid = (): never => { throw new HttpError(400, "invalid_production_execution_intent", "Invalid production execution intent"); };
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
function version(value: unknown, min: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > 2_147_483_646) return invalid();
  return value;
}
function uuid(value: unknown): string { try { return productionResourceUuid(value); } catch { return invalid(); } }
function optionalDate(value: unknown): string | null { try { return value === null ? null : productionResourceDate(value); } catch { return invalid(); } }
export function parseExecutionData(value: unknown): ExecutionData {
  const row = exact(value, ["status", "completedQuantity", "actualStartDate", "actualCompletedDate"]);
  if (row.status !== "in_progress" && row.status !== "completed") return invalid();
  let completedQuantity: string;
  try { completedQuantity = planDecimal(row.completedQuantity); } catch { return invalid(); }
  const actualStartDate = optionalDate(row.actualStartDate), actualCompletedDate = optionalDate(row.actualCompletedDate);
  if (row.status === "completed" ? actualCompletedDate === null : actualCompletedDate !== null) return invalid();
  if (actualStartDate !== null && actualCompletedDate !== null && actualStartDate > actualCompletedDate) return invalid();
  return { status: row.status, completedQuantity, actualStartDate, actualCompletedDate };
}
export function parseExecutionIntent(value: unknown): ExecutionIntent {
  const row = exact(value, ["action", "orderId", "assignmentId", "expectedAssignmentVersion", "expectedExecutionVersion", "expectedPlanVersion", "data", "reason", "replan"]);
  if (row.action !== "record_execution" || typeof row.reason !== "string" || row.reason.length > 2000 || row.reason.includes("\0")
    || Array.from(row.reason).some(char => char.length === 1 && /[\uD800-\uDFFF]/u.test(char))) return invalid();
  const data = parseExecutionData(row.data);
  let replan: ExecutionIntent["replan"] = null;
  if (row.replan !== null) {
    const queue = exact(row.replan, ["expectedQueueVersion"]);
    if (data.status !== "completed") return invalid();
    replan = { expectedQueueVersion: version(queue.expectedQueueVersion, 0) };
  }
  return { action: row.action, orderId: uuid(row.orderId), assignmentId: uuid(row.assignmentId),
    expectedAssignmentVersion: version(row.expectedAssignmentVersion, 1), expectedExecutionVersion: version(row.expectedExecutionVersion, 0),
    expectedPlanVersion: version(row.expectedPlanVersion, 0), data, reason: row.reason, replan };
}
export function parseExecutionCommand(value: unknown): ExecutionCommand {
  const row = exact(value, ["requestId", "intent", "previewHash"]);
  if (typeof row.previewHash !== "string" || !/^[a-f0-9]{64}$/u.test(row.previewHash)) return invalid();
  return { requestId: uuid(row.requestId), intent: parseExecutionIntent(row.intent), previewHash: row.previewHash };
}
/** Used again for receipt access; a completed-only grant never permits queue writes. */
export function executionRequiredPermissions(intent: ExecutionIntent): PermissionKey[] {
  return ["order.view", "schedule.view", "schedule.complete", ...(intent.replan ? ["schedule.edit" as const] : [])];
}

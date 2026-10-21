import { HttpError } from "../http/errors.js";
import { canonicalDecimal } from "../quotes/decimal-projection.js";
import { canonicalPlanJson } from "./canonical-json.js";
import { parseExecutionData, parseExecutionIntent, type ExecutionData, type ExecutionIntent } from "./execution-contract.js";
import { previewInternalQueue, queuePlanningRowIsProtected, SCHEDULE_PLANNING_LIMITS, type QueuePlanningInput, type QueuePlanningRow } from "./planning-preview.js";
import type { StoredAssignment } from "./repository.js";

export type ExecutionFacts = ExecutionData & { version: number };
const fail = (status: number, code: string): never => { throw new HttpError(status, code, code); };
function compare(a: string, b: string): number {
  const [aw, af = ""] = a.split("."), [bw, bf = ""] = b.split("."), scale = Math.max(af.length, bf.length);
  const left = BigInt(aw + af.padEnd(scale, "0")), right = BigInt(bw + bf.padEnd(scale, "0"));
  return left < right ? -1 : left > right ? 1 : 0;
}
function currentFacts(value: ExecutionFacts | null): ExecutionFacts | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value.version) || value.version < 1 || value.version > 2_147_483_647) return fail(503, "production_execution_snapshot_invalid");
  try {
    const { version, ...data } = value;
    return { ...parseExecutionData(data), version };
  } catch { return fail(503, "production_execution_snapshot_invalid"); }
}
/** Actual attribution stays locked even after a later correction reduces output to zero. */
export function assertExecutionAttributionUnchanged(before: Pick<StoredAssignment, "executionType" | "productionGroupId" | "outsourceFactoryId" | "colorId">,
  next: { executionType: "internal" | "outsource"; executorId: string; colorId: string | null }, execution: ExecutionFacts | null) {
  if (currentFacts(execution) && (before.executionType !== next.executionType
    || (before.productionGroupId ?? before.outsourceFactoryId) !== next.executorId || before.colorId !== next.colorId)) {
    fail(409, "production_execution_attribution_locked");
  }
}
/** A cancelled assignment's real output remains visible, but its unmade plan is not reserved. */
export function projectExecutionQuantities(assignments: readonly { status: "planned" | "cancelled"; plannedQuantity: string; execution: ExecutionFacts | null }[]) {
  if (!Array.isArray(assignments) || assignments.length > SCHEDULE_PLANNING_LIMITS.queueRows) fail(422, "production_order_plan_limit");
  const add = (a: string, b: string) => {
    const [aw, af = ""] = a.split("."), [bw, bf = ""] = b.split("."), scale = Math.max(af.length, bf.length);
    const n = BigInt(aw + af.padEnd(scale, "0")) + BigInt(bw + bf.padEnd(scale, "0"));
    const digits = n.toString().padStart(scale + 1, "0");
    return canonicalDecimal(scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
  };
  const subtract = (a: string, b: string) => {
    if (compare(a, b) <= 0) return "0";
    const [aw, af = ""] = a.split("."), [bw, bf = ""] = b.split("."), scale = Math.max(af.length, bf.length);
    const n = BigInt(aw + af.padEnd(scale, "0")) - BigInt(bw + bf.padEnd(scale, "0"));
    const digits = n.toString().padStart(scale + 1, "0");
    return canonicalDecimal(scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
  };
  let completedQuantity = "0", activePlannedQuantity = "0", outstandingPlannedQuantity = "0";
  for (const row of assignments) {
    // Reuse the strict decimal/date contract without treating absent execution as a stored zero fact.
    const planned = parseExecutionData({ status: "in_progress", completedQuantity: row.plannedQuantity, actualStartDate: null, actualCompletedDate: null }).completedQuantity;
    const execution = currentFacts(row.execution), completed = execution?.completedQuantity ?? "0";
    completedQuantity = add(completedQuantity, completed);
    if (row.status === "planned") {
      activePlannedQuantity = add(activePlannedQuantity, planned);
      if (execution?.status !== "completed") outstandingPlannedQuantity = add(outstandingPlannedQuantity, subtract(planned, completed));
    } else if (row.status !== "cancelled") fail(503, "production_assignment_snapshot_invalid");
  }
  return { completedQuantity, activePlannedQuantity, outstandingPlannedQuantity, accountedQuantity: add(completedQuantity, outstandingPlannedQuantity) };
}
export function executionQueueRow(assignment: StoredAssignment, execution: ExecutionFacts | null): QueuePlanningRow {
  const facts = currentFacts(execution);
  if (assignment.executionType !== "internal" || !assignment.productionGroupId || assignment.queueSequence === null) return fail(409, "production_internal_queue_required");
  return { id: assignment.id, salesOrderId: assignment.orderId, productionGroupId: assignment.productionGroupId, version: assignment.version,
    queueSequence: assignment.queueSequence, createdAt: assignment.createdAt, status: assignment.status === "cancelled" ? "cancelled" : facts?.status ?? "planned",
    dateMode: assignment.dateMode, requiredWorkdays: assignment.requiredWorkdays, completedQuantity: facts?.completedQuantity ?? "0",
    actualStartDate: facts?.actualStartDate ?? null, actualCompletedDate: facts?.actualCompletedDate ?? null,
    plannedStartDate: assignment.plannedStartDate, firstProductionDate: assignment.firstProductionDate, plannedEndDate: assignment.plannedEndDate,
    nonWorkingDayCount: assignment.nonWorkingDayCount ?? 0 };
}
/** Pure only: the service must still freeze scope, refresh grants, fingerprint and transact. */
export function previewExecutionChange(input: {
  intent: ExecutionIntent; assignment: StoredAssignment; execution: ExecutionFacts | null; planVersion: number;
  queue: Omit<QueuePlanningInput, "anchorDate"> | null;
}) {
  const intent = parseExecutionIntent(input.intent), before = currentFacts(input.execution), assignment = input.assignment;
  if (assignment.id !== intent.assignmentId || assignment.orderId !== intent.orderId) fail(409, "production_assignment_order_conflict");
  if (assignment.version !== intent.expectedAssignmentVersion) fail(409, "production_assignment_version_conflict");
  if ((before?.version ?? 0) !== intent.expectedExecutionVersion) fail(409, "production_execution_version_conflict");
  if (input.planVersion !== intent.expectedPlanVersion) fail(409, "production_order_plan_version_conflict");
  if ((before?.version ?? 0) >= 2_147_483_647) fail(409, "production_execution_version_exhausted");
  const { version: _version, ...oldData } = before ?? { version: 0 };
  void _version;
  const changed = before === null || canonicalPlanJson(oldData) !== canonicalPlanJson(intent.data);
  const reasonRequired = before && (compare(intent.data.completedQuantity, before.completedQuantity) < 0
    || before.actualStartDate !== null && intent.data.actualStartDate !== before.actualStartDate
    || before.actualCompletedDate !== null && intent.data.actualCompletedDate !== before.actualCompletedDate
    || before.status === "completed" && intent.data.status !== "completed");
  if (changed && (reasonRequired || assignment.status === "cancelled") && !intent.reason.trim()) fail(409, "production_execution_reason_required");
  if (assignment.status === "cancelled" && !before) fail(409, "production_cancelled_assignment_has_no_execution");
  const after: ExecutionFacts = { ...intent.data, version: (before?.version ?? 0) + Number(changed) };
  const warnings = compare(after.completedQuantity, assignment.plannedQuantity) > 0 ? [{ kind: "production_over_completed", assignmentId: assignment.id }] : [];
  let queuePreview: ReturnType<typeof previewInternalQueue> | null = null;
  let replannableAssignmentIds: string[] = [];
  if (intent.replan) {
    if (assignment.executionType !== "internal" || !assignment.productionGroupId || assignment.status === "cancelled") fail(409, "production_internal_queue_required");
    const queue = input.queue;
    if (!queue || queue.resources.group.id !== assignment.productionGroupId) return fail(409, "production_execution_queue_changed");
    if (queue.queueVersion !== intent.replan.expectedQueueVersion) fail(409, "production_queue_version_conflict");
    const target = queue.assignments.filter(row => row.id === assignment.id);
    if (target.length !== 1 || canonicalPlanJson(target[0]) !== canonicalPlanJson(executionQueueRow(assignment, before))) fail(409, "production_execution_queue_changed");
    const ordered = [...queue.assignments].sort((a, b) => a.queueSequence - b.queueSequence || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const targetIndex = ordered.findIndex(row => row.id === assignment.id);
    replannableAssignmentIds = ordered.slice(targetIndex + 1).filter(row => !queuePlanningRowIsProtected(row)).map(row => row.id);
    // Earlier plans still constrain the queue, but finishing this row must not
    // move or refresh their adopted resources. No saved dateMode is changed.
    const earlier = new Set(ordered.slice(0, targetIndex).map(row => row.id));
    queuePreview = previewInternalQueue({ ...queue, anchorDate: intent.data.actualCompletedDate!, assignments: queue.assignments.map(row =>
      row.id === assignment.id ? executionQueueRow(assignment, after) : earlier.has(row.id) ? { ...row, dateMode: "manual_fixed" } : row) });
  } else if (input.queue !== null) fail(503, "production_unrequested_queue_preview");
  return { intent, before, after, changed, warnings, queuePreview, replannableAssignmentIds };
}

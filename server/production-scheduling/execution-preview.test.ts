import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../http/errors.js";
import type { ExecutionIntent } from "./execution-contract.js";
import { assertExecutionAttributionUnchanged, executionQueueRow, previewExecutionChange, projectExecutionQuantities, type ExecutionFacts } from "./execution-preview.js";
import type { StoredAssignment, ResourceFacts } from "./repository.js";
import { SchedulePlanningError } from "./planning-preview.js";

const id = (n: number) => `60000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const timestamp = "2026-10-21T00:00:00.000Z";
const facts = (): Extract<ResourceFacts, { executionType: "internal" }> => ({ schemaVersion: "production-resource.v1", executionType: "internal",
  group: { kind: "groups", id: id(10), version: 1, createdAt: timestamp, updatedAt: timestamp, name: "原生产组", enabled: true, shortName: "", productionSiteId: id(11), sortOrder: 0, remark: "" },
  site: { kind: "sites", id: id(11), version: 1, createdAt: timestamp, updatedAt: timestamp, name: "原生产地点", enabled: true, countryCode: null, productionCalendarId: id(12), preProductionSampleLeadDays: 0, remark: "" },
  calendar: { kind: "calendars", id: id(12), version: 1, createdAt: timestamp, updatedAt: timestamp, name: "原日历", enabled: true, workingWeekdays: [1, 2, 3, 4, 5], exceptions: [], remark: "" } });
const assignment = (n = 1, patch: Partial<StoredAssignment> = {}): StoredAssignment => ({ id: id(n), orderId: id(100 + n), version: 2, executionType: "internal", productionGroupId: id(10), outsourceFactoryId: null,
  colorId: id(20), colorNameSnapshot: "原颜色", plannedQuantity: "30", durationMode: "workdays", dailyOutputSnapshot: "15", requiredWorkdays: 2,
  dateMode: "auto_queue", plannedStartDate: "2027-01-04", firstProductionDate: "2027-01-04", plannedEndDate: "2027-01-05", nonWorkingDayCount: 0, queueSequence: n,
  resourceSnapshotHash: "a".repeat(64), resourceFacts: facts(), status: "planned", remark: "", createdBy: "1", updatedBy: "1", createdAt: timestamp, updatedAt: timestamp, ...patch });
const intent = (row = assignment()): ExecutionIntent => ({ action: "record_execution", orderId: row.orderId, assignmentId: row.id,
  expectedAssignmentVersion: row.version, expectedExecutionVersion: 0, expectedPlanVersion: 4,
  data: { status: "completed", completedQuantity: "30", actualStartDate: null, actualCompletedDate: "2027-01-06" }, reason: "", replan: null });
const input = () => ({ intent: intent(), assignment: assignment(), execution: null as ExecutionFacts | null, planVersion: 4, queue: null });
const code = (run: () => unknown, value: string) => assert.throws(run, (error: unknown) => error instanceof HttpError && error.code === value);
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }

test("first execution preserves explicit zero/unknown start and never mutates assignment or quote facts", () => {
  const value = input(); value.intent.data.completedQuantity = "0"; const before = structuredClone(value);
  const result = previewExecutionChange(freeze(value));
  assert.deepEqual(value, before); assert.equal(result.before, null); assert.equal(result.after.version, 1); assert.equal(result.after.completedQuantity, "0");
  assert.equal(result.after.actualStartDate, null); assert.equal(result.queuePreview, null); assert.equal(result.changed, true);
  assert.equal("plannedQuantity" in result.after, false); assert.equal("resourceFacts" in result.after, false);
});
test("separate assignment/execution/collection CAS and stable physical owner all participate", () => {
  for (const [key, value, error] of [["expectedAssignmentVersion", 1, "production_assignment_version_conflict"], ["expectedExecutionVersion", 1, "production_execution_version_conflict"], ["expectedPlanVersion", 3, "production_order_plan_version_conflict"]] as const) {
    const row = input(); row.intent[key] = value; code(() => previewExecutionChange(row), error);
  }
  for (const key of ["orderId", "assignmentId"] as const) { const row = input(); row.intent[key] = id(999); code(() => previewExecutionChange(row), "production_assignment_order_conflict"); }
});
test("reducing a cumulative actual requires a reason and retains exact decimals beyond JS integer range", () => {
  const value = input(); value.execution = { ...value.intent.data, completedQuantity: "9007199254740993.0002", version: 4 }; value.intent.expectedExecutionVersion = 4;
  value.intent.data.completedQuantity = "9007199254740993.0001";
  code(() => previewExecutionChange(value), "production_execution_reason_required"); value.intent.reason = "核对原始记录后更正";
  const result = previewExecutionChange(value); assert.equal(result.after.version, 5); assert.equal(result.after.completedQuantity, "9007199254740993.0001");
  assert.equal(result.before!.completedQuantity, "9007199254740993.0002"); assert.equal(result.warnings[0].kind, "production_over_completed");
});
test("corrections to dates or an ended state require a reason; exact same values are a no-op", () => {
  const value = input(); value.execution = { ...value.intent.data, version: 3 }; value.intent.expectedExecutionVersion = 3;
  const same = previewExecutionChange(value); assert.equal(same.changed, false); assert.equal(same.after.version, 3);
  value.execution.actualStartDate = "2027-01-01"; value.intent.data.actualStartDate = "2027-01-01";
  for (const data of [{ ...value.intent.data, actualCompletedDate: "2027-01-07" }, { ...value.intent.data, actualStartDate: "2027-01-02" }, { ...value.intent.data, status: "in_progress" as const, actualCompletedDate: null }]) {
    code(() => previewExecutionChange({ ...value, intent: { ...value.intent, data } }), "production_execution_reason_required");
    assert.equal(previewExecutionChange({ ...value, intent: { ...value.intent, data, reason: "更正执行事实" } }).changed, true);
  }
});
test("normal progress and first completion add facts without inventing a correction reason", () => {
  const value = input(); value.execution = { status: "in_progress", completedQuantity: "10", actualStartDate: null, actualCompletedDate: null, version: 2 }; value.intent.expectedExecutionVersion = 2;
  value.intent.data.actualStartDate = "2027-01-04";
  const result = previewExecutionChange(value); assert.equal(result.after.status, "completed"); assert.equal(result.after.version, 3);
  assert.equal(result.intent.reason, ""); assert.equal(result.before!.actualStartDate, null);
});
test("cancelled plan cannot gain its first execution; existing output may be explicitly corrected", () => {
  const value = input(); value.assignment.status = "cancelled";
  code(() => previewExecutionChange(value), "production_execution_reason_required"); value.intent.reason = "历史核对";
  code(() => previewExecutionChange(value), "production_cancelled_assignment_has_no_execution");
  value.execution = { ...value.intent.data, completedQuantity: "20", version: 1 }; value.intent.expectedExecutionVersion = 1;
  const result = previewExecutionChange(value); assert.equal(result.after.completedQuantity, "30"); assert.equal(result.after.version, 2);
});
test("any recorded execution locks physical executor and color, including later corrected zero", () => {
  const row = assignment(), current: ExecutionFacts = { status: "in_progress", completedQuantity: "0", actualStartDate: null, actualCompletedDate: null, version: 2 };
  const next = { executionType: row.executionType, executorId: row.productionGroupId!, colorId: row.colorId };
  assert.doesNotThrow(() => assertExecutionAttributionUnchanged(row, next, current));
  for (const patch of [{ executionType: "outsource" as const }, { executorId: id(99) }, { colorId: id(99) }, { colorId: null }]) {
    code(() => assertExecutionAttributionUnchanged(row, { ...next, ...patch }, current), "production_execution_attribution_locked");
    assert.doesNotThrow(() => assertExecutionAttributionUnchanged(row, { ...next, ...patch }, null));
  }
});
test("cancelled and ended output is never lost or added to remaining planned work", () => {
  const execution = (quantity: string, status: ExecutionFacts["status"] = "completed"): ExecutionFacts => ({ status, completedQuantity: quantity, actualStartDate: null, actualCompletedDate: status === "completed" ? "2027-01-06" : null, version: 1 });
  const result = projectExecutionQuantities([
    { status: "cancelled", plannedQuantity: "100", execution: execution("20.25") },
    { status: "planned", plannedQuantity: "79.75", execution: null },
    { status: "planned", plannedQuantity: "30", execution: execution("10", "in_progress") },
    { status: "planned", plannedQuantity: "40", execution: execution("30") },
  ]);
  assert.deepEqual(result, { completedQuantity: "60.25", activePlannedQuantity: "149.75", outstandingPlannedQuantity: "99.75", accountedQuantity: "160" });
  assert.deepEqual(projectExecutionQuantities([{ status: "cancelled", plannedQuantity: "100", execution: null }]), { completedQuantity: "0", activePlannedQuantity: "0", outstandingPlannedQuantity: "0", accountedQuantity: "0" });
  assert.equal(projectExecutionQuantities([{ status: "planned", plannedQuantity: "1", execution: execution("2", "in_progress") }]).outstandingPlannedQuantity, "0");
});
test("fractional projections and very large quantities remain exact", () => {
  assert.equal(projectExecutionQuantities([{ status: "planned", plannedQuantity: "9007199254740993.0001", execution: null }, { status: "planned", plannedQuantity: "0.0002", execution: null }]).accountedQuantity, "9007199254740993.0003");
});
test("explicit completion replan preserves target and already-started/fixed rows, changes only eligible future plans", () => {
  const value = input(), resources = facts(), second = assignment(2, { plannedStartDate: "2027-01-05", firstProductionDate: "2027-01-06", plannedEndDate: "2027-01-07" }), fixed = assignment(3, { dateMode: "manual_fixed", plannedStartDate: "2027-02-01", firstProductionDate: null, plannedEndDate: "2027-02-02", nonWorkingDayCount: null });
  const started = assignment(4, { plannedStartDate: "2027-02-02", firstProductionDate: "2027-02-03", plannedEndDate: "2027-02-04" });
  const active: ExecutionFacts = { status: "in_progress", completedQuantity: "1", actualStartDate: "2027-01-01", actualCompletedDate: null, version: 1 };
  const queue = { queueVersion: 6, resources, assignments: [executionQueueRow(started, active), executionQueueRow(second, null), executionQueueRow(fixed, null), executionQueueRow(value.assignment, null)] };
  const before = structuredClone(queue);
  const result = previewExecutionChange(freeze({ ...value, intent: { ...value.intent, replan: { expectedQueueVersion: 6 } }, queue }));
  assert.deepEqual(queue, before); assert.deepEqual(result.queuePreview!.changes.map(row => row.assignmentId), [second.id]);
  assert.equal(result.queuePreview!.changes[0].after.plannedStartDate, "2027-01-06");
  assert.equal(result.queuePreview!.changes[0].after.firstProductionDate, "2027-01-07");
  assert.equal(result.queuePreview!.changes[0].after.plannedEndDate, "2027-01-08");
  assert.deepEqual(result.queuePreview!.protectedAssignmentIds, [value.assignment.id, fixed.id, started.id]);
  assert.deepEqual(result.replannableAssignmentIds, [second.id]);
});
test("completion of a later row never moves or re-adopts resources for preceding unstarted plans", () => {
  const earlier = assignment(1, { plannedStartDate: "2027-01-04", plannedEndDate: "2027-01-10" });
  const target = assignment(2, { plannedStartDate: "2027-01-10", firstProductionDate: "2027-01-11", plannedEndDate: "2027-01-12" });
  const future = assignment(3, { plannedStartDate: "2027-01-12", firstProductionDate: "2027-01-13", plannedEndDate: "2027-01-14" });
  const value = { ...input(), assignment: target, intent: { ...intent(target), replan: { expectedQueueVersion: 6 } }, queue: { queueVersion: 6, resources: facts(), assignments: [earlier, target, future].map(row => executionQueueRow(row, null)) } };
  const result = previewExecutionChange(value);
  assert.deepEqual(result.replannableAssignmentIds, [future.id]); assert.equal(result.queuePreview!.changes.some(row => row.assignmentId === earlier.id), false);
  assert.equal(earlier.plannedEndDate, "2027-01-10"); assert.equal(result.queuePreview!.changes[0].after.plannedStartDate, "2027-01-10");
});
test("an already-started downstream row with unknown end rejects the entire replan preview", () => {
  const value = input(), started = executionQueueRow(assignment(2), { status: "in_progress", completedQuantity: "1", actualStartDate: "2027-01-01", actualCompletedDate: null, version: 1 });
  started.firstProductionDate = null; started.plannedEndDate = null;
  const queue = { queueVersion: 6, resources: facts(), assignments: [executionQueueRow(value.assignment, null), started, executionQueueRow(assignment(3), null)] };
  const before = structuredClone(queue);
  assert.throws(() => previewExecutionChange(freeze({ ...value, intent: { ...value.intent, replan: { expectedQueueVersion: 6 } }, queue })),
    (error: unknown) => error instanceof SchedulePlanningError && error.code === "schedule_queue_anchor_missing");
  assert.deepEqual(queue, before);
});
test("wrong queue/version/target fact and unrequested queue previews are rejected", () => {
  const value = input(), queue = { queueVersion: 6, resources: facts(), assignments: [executionQueueRow(value.assignment, null)] };
  const combined = { ...value, intent: { ...value.intent, replan: { expectedQueueVersion: 6 } }, queue };
  code(() => previewExecutionChange({ ...combined, queue: null }), "production_execution_queue_changed");
  code(() => previewExecutionChange({ ...combined, queue: { ...queue, queueVersion: 7 } }), "production_queue_version_conflict");
  code(() => previewExecutionChange({ ...combined, queue: { ...queue, assignments: [{ ...queue.assignments[0], completedQuantity: "1" }] } }), "production_execution_queue_changed");
  code(() => previewExecutionChange({ ...combined, queue: { ...queue, assignments: [] } }), "production_execution_queue_changed");
  code(() => previewExecutionChange({ ...value, queue }), "production_unrequested_queue_preview");
});
test("outsourced/cancelled execution cannot request an internal replan", () => {
  const value = input(); value.intent.replan = { expectedQueueVersion: 0 };
  code(() => previewExecutionChange({ ...value, assignment: { ...value.assignment, executionType: "outsource", productionGroupId: null, outsourceFactoryId: id(98) } }), "production_internal_queue_required");
  const cancelled = { ...value.assignment, status: "cancelled" as const }; value.execution = { ...value.intent.data, version: 1 }; value.intent.expectedExecutionVersion = 1;
  code(() => previewExecutionChange({ ...value, assignment: cancelled }), "production_internal_queue_required");
});
test("corrupt persisted execution snapshots are rejected rather than replaced with a default zero", () => {
  for (const execution of [{ ...intent().data, version: 0 }, { ...intent().data, completedQuantity: "NaN", version: 1 }, { ...intent().data, actualStartDate: "2028-01-01", version: 1 }]) {
    code(() => previewExecutionChange({ ...input(), execution }), "production_execution_snapshot_invalid");
  }
});

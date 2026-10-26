import test from "node:test";
import assert from "node:assert/strict";
import { calculateScheduleDates, ScheduleScanLimitError } from "../../features/production-scheduling/service/production-scheduling-service.js";
import {
  previewInternalQueue, queuePlanningRowIsProtected, SchedulePlanningError, SCHEDULE_PLANNING_LIMITS,
  type QueuePlanningInput, type QueuePlanningRow, type QueueResourceSnapshot,
} from "./planning-preview.js";

const id = (value: number) => `40000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const resources = (): QueueResourceSnapshot => ({
  group: { id: id(1), version: 2, enabled: true, productionSiteId: id(2) },
  site: { id: id(2), version: 3, enabled: true, productionCalendarId: id(3) },
  calendar: { id: id(3), version: 4, enabled: true, workingWeekdays: [1, 2, 3, 4, 5, 6], exceptions: [] },
});
const row = (sequence: number, patch: Partial<QueuePlanningRow> = {}): QueuePlanningRow => ({
  id: id(10 + sequence), salesOrderId: id(100 + sequence), productionGroupId: id(1), version: 1,
  queueSequence: sequence, createdAt: "2026-10-20T00:00:00.000Z", status: "planned", dateMode: "auto_queue",
  requiredWorkdays: 2, completedQuantity: "0", actualStartDate: null, actualCompletedDate: null,
  plannedStartDate: null, firstProductionDate: null, plannedEndDate: null, nonWorkingDayCount: 0, ...patch,
});
const input = (assignments: QueuePlanningRow[] = []): QueuePlanningInput => ({
  queueVersion: 0, anchorDate: "2026-09-05", resources: resources(), assignments,
});
function rejects(value: QueuePlanningInput, code: string) {
  assert.throws(() => previewInternalQueue(value), (error: unknown) => error instanceof SchedulePlanningError && error.code === code);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test("empty preview is deterministic, explicit, version-bound and seed-free", () => {
  const value = input(), before = structuredClone(value);
  const result = previewInternalQueue(freeze(value));
  assert.deepEqual(value, before);
  assert.equal(result.queueVersion, 0);
  assert.equal(result.anchorDate, value.anchorDate);
  assert.deepEqual(result.expectedAssignments, []);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.resources, before.resources);
  assert.equal(result.scannedDays, 0);
  assert.notEqual(result.resources, value.resources);
});

test("real queue order, not input storage order, drives every handoff", () => {
  const a = row(1), b = row(2), c = row(3);
  const result = previewInternalQueue(input([c, a, b]));
  for (const permutation of [[a, b, c], [b, c, a], [b, a, c], [a, c, b], [c, b, a]]) {
    assert.deepEqual(previewInternalQueue(input(permutation)), result);
  }
  assert.deepEqual(result.expectedAssignments.map(item => item.id), [a.id, b.id, c.id]);
  assert.deepEqual(result.changes.map(item => [item.after.plannedStartDate, item.after.firstProductionDate, item.after.plannedEndDate]), [
    ["2026-09-05", "2026-09-05", "2026-09-07"],
    ["2026-09-07", "2026-09-08", "2026-09-09"],
    ["2026-09-09", "2026-09-10", "2026-09-11"],
  ]);
});

test("tied sequences sort by creation timestamp, then stable UUID", () => {
  const a = row(1, { queueSequence: 1, createdAt: "2026-10-20T00:00:01.000Z" });
  const b = row(2, { queueSequence: 1 }), c = row(3, { queueSequence: 1 });
  assert.deepEqual(previewInternalQueue(input([c, a, b])).expectedAssignments.map(item => item.id), [b.id, c.id, a.id]);
});

test("exception dates and handoff use the existing shared date calculation", () => {
  const value = input([row(1), row(2)]);
  value.anchorDate = "2028-02-28";
  value.resources.calendar.workingWeekdays = [0, 1, 2, 3, 4, 5, 6];
  value.resources.calendar.exceptions = [{ date: "2028-02-29", type: "non_working", name: "休息" }];
  const result = previewInternalQueue(value);
  assert.equal(result.changes[0].after.plannedEndDate, "2028-03-01");
  assert.equal(result.changes[0].after.nonWorkingDayCount, 1);
  assert.equal(result.changes[1].after.firstProductionDate, "2028-03-02");
  assert.equal(result.changes[1].after.plannedEndDate, "2028-03-03");
  assert.equal(result.scannedDays, 5);
});

test("fixed, started, partially completed and completed rows never move", () => {
  const protectedPatches: Partial<QueuePlanningRow>[] = [
    { dateMode: "manual_fixed" }, { status: "in_progress" }, { actualStartDate: "2026-09-01" },
    { completedQuantity: "0.001" }, { status: "completed", actualCompletedDate: "2026-09-03" },
    { actualCompletedDate: "2026-09-03" },
  ];
  for (const patch of protectedPatches) {
    const a = row(1, { plannedStartDate: "2026-09-01", firstProductionDate: "2026-09-01", plannedEndDate: "2026-09-04", nonWorkingDayCount: 2, ...patch });
    const b = row(2), value = input([b, a]), before = structuredClone(value);
    assert.equal(queuePlanningRowIsProtected(a), true);
    const result = previewInternalQueue(freeze(value));
    assert.deepEqual(value, before);
    assert.deepEqual(result.protectedAssignmentIds, [a.id]);
    assert.ok(result.changes.every(item => item.assignmentId !== a.id));
    assert.equal(result.changes[0].after.plannedStartDate, a.actualCompletedDate ?? a.plannedEndDate);
  }
});

test("changed calendars cannot rewrite protected historical dates", () => {
  const a = row(1, { dateMode: "manual_fixed", plannedStartDate: "2026-09-01", plannedEndDate: "2026-09-04" });
  const value = input([a, row(2)]), first = previewInternalQueue(value);
  value.resources.calendar.version += 1;
  value.resources.calendar.workingWeekdays = [1];
  const second = previewInternalQueue(value);
  assert.deepEqual(second.protectedAssignmentIds, [a.id]);
  assert.notDeepEqual(second.changes, first.changes);
  assert.ok(second.changes.every(item => item.assignmentId !== a.id));
  assert.equal(second.resources.calendar.version, 5);
});

test("fixed overlap is visible and never moves the serial queue cursor backward", () => {
  const a = row(1, { dateMode: "manual_fixed", plannedStartDate: "2026-09-10", plannedEndDate: "2026-09-20" });
  const b = row(2, { dateMode: "manual_fixed", plannedStartDate: "2026-09-01", plannedEndDate: "2026-09-02" });
  const c = row(3), result = previewInternalQueue(input([c, b, a]));
  assert.deepEqual(result.warnings, [{ kind: "protected_overlap", assignmentId: b.id, previousEndDate: "2026-09-20" }]);
  assert.deepEqual(result.protectedAssignmentIds, [a.id, b.id]);
  assert.equal(result.changes[0].after.plannedStartDate, "2026-09-20");
  assert.equal(result.changes[0].after.firstProductionDate, "2026-09-21");
});

test("missing protected end does not become today's date or a guessed anchor", () => {
  const a = row(1, { dateMode: "manual_fixed" });
  const only = previewInternalQueue(input([a]));
  assert.deepEqual(only.changes, []);
  assert.deepEqual(only.warnings, [{ kind: "protected_end_missing", assignmentId: a.id, previousEndDate: null }]);
  rejects(input([a, row(2)]), "schedule_queue_anchor_missing");
});

test("cancelled rows neither anchor nor get new planned dates", () => {
  const a = row(1, { status: "cancelled", plannedStartDate: "2026-12-01", plannedEndDate: "2026-12-31" });
  const b = row(2), result = previewInternalQueue(input([a, b]));
  assert.deepEqual(result.expectedAssignments, [{ id: b.id, version: b.version }]);
  assert.equal(result.changes[0].after.plannedStartDate, "2026-09-05");
});

test("existing first date is retained, no hidden current-day default", () => {
  const a = row(1, { plannedStartDate: "2026-10-01" });
  assert.equal(previewInternalQueue(input([a])).changes[0].after.plannedStartDate, "2026-10-01");
  const value = input([row(1)]);
  value.anchorDate = "";
  rejects(value, "schedule_planning_snapshot_invalid");
});

test("version and adopted resource facts remain explicit in preview", () => {
  const value = input([row(1, { version: 9 })]);
  value.queueVersion = 7;
  const result = previewInternalQueue(value);
  assert.equal(result.queueVersion, 7);
  assert.equal(result.expectedAssignments[0].version, 9);
  assert.equal(result.changes[0].expectedVersion, 9);
  assert.deepEqual(result.resources, value.resources);
});

test("same saved dates and counters produce no synthetic change", () => {
  const a = row(1), first = previewInternalQueue(input([a]));
  const after = { ...a, ...first.changes[0].after };
  assert.deepEqual(previewInternalQueue(input([after])).changes, []);
});

test("strict real dates, unique exceptions/weekdays and valid quantities fail closed", () => {
  const invalidValues: QueuePlanningInput[] = [];
  for (const anchorDate of ["0000-01-01", "2026-02-29", "2028-02-30", "2026-1-01"]) invalidValues.push({ ...input(), anchorDate });
  for (const completedQuantity of ["-1", "NaN", "1e3", "", "0.1.2"]) invalidValues.push(input([row(1, { completedQuantity })]));
  for (const requiredWorkdays of [0, -1, NaN, Infinity, 1.5, SCHEDULE_PLANNING_LIMITS.workdays + 1]) invalidValues.push(input([row(1, { requiredWorkdays })]));
  const duplicates = input(); duplicates.resources.calendar.workingWeekdays = [1, 1]; invalidValues.push(duplicates);
  const empty = input(); empty.resources.calendar.workingWeekdays = []; invalidValues.push(empty);
  const repeated = input(); repeated.resources.calendar.exceptions = [
    { date: "2026-09-05", type: "working", name: "加班" }, { date: "2026-09-05", type: "non_working", name: "休息" },
  ]; invalidValues.push(repeated);
  invalidValues.push(input([row(1, { actualStartDate: "2026-09-05", actualCompletedDate: "2026-09-04" })]));
  invalidValues.push(input([row(1, { firstProductionDate: "2026-09-05" })]));
  for (const value of invalidValues) rejects(value, "schedule_planning_snapshot_invalid");
});

test("duplicate IDs, cross-group membership and changed/disabled parent resources reject", () => {
  rejects(input([row(1), row(1)]), "schedule_planning_snapshot_invalid");
  rejects(input([row(1, { productionGroupId: id(9) })]), "schedule_queue_group_mismatch");
  const changed = input(); changed.resources.group.productionSiteId = id(9);
  rejects(changed, "schedule_resource_relationship_changed");
  for (const kind of ["group", "site", "calendar"] as const) {
    const value = input(); value.resources[kind].enabled = false;
    rejects(value, "schedule_resources_disabled");
  }
});

test("array holes and excess queue rows cannot bypass validation or disappear", () => {
  rejects(input(new Array<QueuePlanningRow>(1)), "schedule_planning_snapshot_invalid");
  rejects(input(Array.from({ length: SCHEDULE_PLANNING_LIMITS.queueRows + 1 }, (_, index) => row(index + 1))), "schedule_queue_limit_exceeded");
});

test("scan budget counts all rows and rest dates, exact limit succeeds", () => {
  const value = input([row(1, { requiredWorkdays: 18_300 }), row(2, { requiredWorkdays: 18_300 })]);
  value.anchorDate = "2000-01-01";
  value.resources.calendar.workingWeekdays = [0, 1, 2, 3, 4, 5, 6];
  assert.equal(previewInternalQueue(value).scannedDays, SCHEDULE_PLANNING_LIMITS.scanDays);
  const before = structuredClone(value);
  value.assignments.push(row(3, { requiredWorkdays: 1 }));
  rejects(value, "schedule_scan_limit_exceeded");
  assert.deepEqual(value.assignments.slice(0, 2), before.assignments);
  const sparse = input([row(1, { requiredWorkdays: 6_000 })]);
  sparse.resources.calendar.workingWeekdays = [1];
  rejects(sparse, "schedule_scan_limit_exceeded");
});

test("calendar year overflow is a bounded failure, not a malformed saved date", () => {
  const value = input([row(1)]); value.anchorDate = "9999-12-31";
  value.resources.calendar.workingWeekdays = [0, 1, 2, 3, 4, 5, 6];
  rejects(value, "schedule_scan_limit_exceeded");
});

test("additive shared scan limit keeps the original valid date formula", () => {
  const value = { startDate: "2026-09-05", requiredWorkdays: 2, calendar: resources().calendar, handoffStart: true };
  assert.deepEqual(calculateScheduleDates({ ...value, scanLimit: 3 }), calculateScheduleDates(value));
  for (const scanLimit of [0, -1, NaN, Infinity, 1.5, 2]) {
    assert.throws(() => calculateScheduleDates({ ...value, scanLimit }), ScheduleScanLimitError);
  }
});

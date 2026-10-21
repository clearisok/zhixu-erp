import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../http/errors.js";
import { executionRequiredPermissions, parseExecutionCommand, parseExecutionData, parseExecutionIntent, type ExecutionIntent } from "./execution-contract.js";

const id = (n: number) => `60000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const intent = (): ExecutionIntent => ({ action: "record_execution", orderId: id(1), assignmentId: id(2), expectedAssignmentVersion: 1,
  expectedExecutionVersion: 0, expectedPlanVersion: 2, data: { status: "completed", completedQuantity: "10.25", actualStartDate: null, actualCompletedDate: "2028-02-29" }, reason: "", replan: null });
const invalid = (run: () => unknown) => assert.throws(run, (error: unknown) => error instanceof HttpError && error.status === 400 && error.code === "invalid_production_execution_intent");

test("execution input preserves exact quantity, explicit zero, unknown start and correction reason", () => {
  const value = intent(); value.data.completedQuantity = "0009007199254740993.000100"; value.reason = "  修正 原记录  ";
  const parsed = parseExecutionIntent(value);
  assert.equal(parsed.data.completedQuantity, "9007199254740993.0001"); assert.equal(parsed.data.actualStartDate, null);
  assert.equal(parsed.reason, value.reason); assert.notEqual(parsed, value); assert.notEqual(parsed.data, value.data);
  assert.equal(parseExecutionData({ ...value.data, completedQuantity: "0" }).completedQuantity, "0");
  assert.equal(parseExecutionData({ status: "in_progress", completedQuantity: "0", actualStartDate: null, actualCompletedDate: null }).actualStartDate, null);
});
test("only execution and explicit queue version are accepted, never actor/price/plan changes", () => {
  const value = intent();
  for (const key of ["actorId", "executorId", "colorId", "plannedQuantity", "currency", "laborPrice", "salesPrice", "createdAt"]) invalid(() => parseExecutionIntent({ ...value, [key]: "spoof" }));
  for (const key of ["actorId", "plannedQuantity", "price", "version"]) invalid(() => parseExecutionIntent({ ...value, data: { ...value.data, [key]: "spoof" } }));
  for (const key of Object.keys(value)) { const raw = { ...value } as Record<string, unknown>; delete raw[key]; invalid(() => parseExecutionIntent(raw)); }
  invalid(() => parseExecutionIntent({ ...value, action: "complete" }));
  invalid(() => parseExecutionIntent({ ...value, replan: { expectedQueueVersion: 0, anchorDate: "2028-03-01" } }));
});
test("all independent versions and stable identities fail closed", () => {
  const value = intent();
  for (const key of ["expectedExecutionVersion", "expectedPlanVersion", "expectedAssignmentVersion"]) {
    for (const n of [-1, 1.5, NaN, Infinity, 2147483647, "1", null]) invalid(() => parseExecutionIntent({ ...value, [key]: n }));
  }
  invalid(() => parseExecutionIntent({ ...value, expectedAssignmentVersion: 0 }));
  for (const key of ["orderId", "assignmentId"]) for (const n of ["", "style-001", "not-a-uuid", null]) invalid(() => parseExecutionIntent({ ...value, [key]: n }));
  assert.equal(parseExecutionIntent({ ...value, expectedExecutionVersion: 2147483646 }).expectedExecutionVersion, 2147483646);
});
test("quantity, Unicode, real dates and state/date consistency are validated without defaults", () => {
  const value = intent();
  for (const n of [null, 1, -1, "", "NaN", "Infinity", "1e3", "-0", ".1", "1.", "0".repeat(129)]) invalid(() => parseExecutionIntent({ ...value, data: { ...value.data, completedQuantity: n } }));
  for (const actualCompletedDate of ["2026-02-29", "2028-02-30", "0000-01-01", "2028-2-29", "2028-02-29T00:00:00Z", null]) invalid(() => parseExecutionIntent({ ...value, data: { ...value.data, actualCompletedDate } }));
  invalid(() => parseExecutionIntent({ ...value, data: { ...value.data, actualStartDate: "2028-03-01" } }));
  invalid(() => parseExecutionIntent({ ...value, data: { ...value.data, status: "in_progress" } }));
  for (const reason of ["x\0y", "\uD800", "x".repeat(2001), null]) invalid(() => parseExecutionIntent({ ...value, reason }));
  assert.equal(parseExecutionIntent({ ...value, reason: "纠正😀" }).reason, "纠正😀");
});
test("only ended execution can explicitly request replan; edit grant remains independent", () => {
  const value = intent();
  assert.deepEqual(executionRequiredPermissions(value), ["order.view", "schedule.view", "schedule.complete"]);
  const combined = parseExecutionIntent({ ...value, replan: { expectedQueueVersion: 4 } });
  assert.deepEqual(executionRequiredPermissions(combined), ["order.view", "schedule.view", "schedule.complete", "schedule.edit"]);
  invalid(() => parseExecutionIntent({ ...combined, data: { ...combined.data, status: "in_progress", actualCompletedDate: null } }));
  for (const expectedQueueVersion of [-1, "0", 1.1, 2147483647]) invalid(() => parseExecutionIntent({ ...combined, replan: { expectedQueueVersion } }));
});
test("command validates exact request and preview digest for later same-command recovery", () => {
  const value = { requestId: id(3), intent: intent(), previewHash: "a".repeat(64) };
  assert.deepEqual(parseExecutionCommand(value), value);
  for (const previewHash of ["", "A".repeat(64), "a".repeat(63), null]) invalid(() => parseExecutionCommand({ ...value, previewHash }));
  invalid(() => parseExecutionCommand({ ...value, requestId: "request" }));
  invalid(() => parseExecutionCommand({ ...value, actorId: id(4) }));
});

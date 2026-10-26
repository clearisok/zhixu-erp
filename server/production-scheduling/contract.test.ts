import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { derivePlanDuration, parsePlanCommand, parsePlanIntent, type PlanData } from "./contract.js";
import { stableOrderColorId, orderColorBusinessKey } from "../sales-orders/color-identities.js";

const data = (): PlanData => ({ executionType: "internal", executorId: randomUUID(), colorId: null, plannedQuantity: "100",
  duration: { mode: "average_daily_output", dailyOutput: "30" }, dates: { mode: "auto_queue", startDate: "2027-01-01" }, remark: "" });
const intent = () => ({ action: "create", orderId: randomUUID(), expectedPlanVersion: 0, assignmentId: null, expectedVersion: 0, data: data() });
test("production plan contract: explicit intent, no client identity, completion or money", () => {
  assert.equal(parsePlanIntent(intent()).action, "create");
  for (const key of ["actorId", "status", "completedQuantity", "actualStartDate", "outsourceUnitPrice", "currency", "version"]) {
    assert.throws(() => parsePlanIntent({ ...intent(), [key]: "spoof" }));
    const input = intent(); assert.throws(() => parsePlanIntent({ ...input, data: { ...input.data, [key]: "spoof" } }));
  }
  const input = { requestId: randomUUID(), intent: intent(), previewHash: "a".repeat(64) };
  assert.deepEqual(parsePlanCommand(input), input);
  for (const previewHash of ["", "A".repeat(64), "a".repeat(63), 1]) assert.throws(() => parsePlanCommand({ ...input, previewHash }));
});
test("duration uses exact decimal ceil, including zero and values above JS precision", () => {
  assert.deepEqual(derivePlanDuration(data()), { requiredWorkdays: 4, dailyOutputSnapshot: "30" });
  assert.deepEqual(derivePlanDuration({ plannedQuantity: "0", duration: { mode: "average_daily_output", dailyOutput: "2.5" } }), { requiredWorkdays: 1, dailyOutputSnapshot: "2.5" });
  assert.deepEqual(derivePlanDuration({ plannedQuantity: "9007199254740993", duration: { mode: "average_daily_output", dailyOutput: "9007199254740992" } }), { requiredWorkdays: 2, dailyOutputSnapshot: "9007199254740992" });
  assert.deepEqual(derivePlanDuration({ plannedQuantity: "1.000000000000000001", duration: { mode: "workdays", workdays: 1 } }), { requiredWorkdays: 1, dailyOutputSnapshot: "2" });
  assert.deepEqual(derivePlanDuration({ plannedQuantity: "0", duration: { mode: "workdays", workdays: 3 } }), { requiredWorkdays: 3, dailyOutputSnapshot: "0" });
  assert.throws(() => derivePlanDuration({ plannedQuantity: "36601", duration: { mode: "average_daily_output", dailyOutput: "1" } }), /supported duration/u);
});
test("invalid quantity, versions, missing dates and noncanonical structures are refused", () => {
  for (const plannedQuantity of ["-1", "1e2", "NaN", "Infinity", 1, "", " 1", ".1", "1."]) {
    const input = intent(); assert.throws(() => parsePlanIntent({ ...input, data: { ...input.data, plannedQuantity } }));
  }
  for (const expectedPlanVersion of [-1, 1.5, "0", 2147483647]) assert.throws(() => parsePlanIntent({ ...intent(), expectedPlanVersion }));
  const input = intent();
  for (const startDate of ["2027-02-29", "0000-01-01", "2027-1-1", "2027-01-01T00:00:00Z", null]) assert.throws(() => parsePlanIntent({ ...input, data: { ...input.data, dates: { mode: "auto_queue", startDate } } }));
  assert.throws(() => parsePlanIntent({ ...input, data: { ...input.data, dates: { mode: "manual_fixed", startDate: "2027-02-01", endDate: "2027-01-01" } } }));
  assert.throws(() => parsePlanIntent({ ...input, data: { ...input.data, executionType: "outsource" } }));
  assert.throws(() => parsePlanIntent({ ...input, data: { ...input.data, duration: { mode: "average_daily_output", dailyOutput: "0" } } }));
  const canonical = parsePlanIntent({ ...input, data: { ...input.data, plannedQuantity: "0001.5000" } });
  assert.equal(canonical.action, "create"); if (canonical.action === "create") assert.equal(canonical.data.plannedQuantity, "1.5");
});
test("replan has bounded full permutation and explicit anchor; color identity ignores quantity", () => {
  const groupId = randomUUID(), id = randomUUID(), raw = { action: "replan", groupId, expectedQueueVersion: 0, anchorDate: "2027-01-01", orderedAssignmentIds: [id] };
  assert.deepEqual(parsePlanIntent(raw), raw);
  assert.throws(() => parsePlanIntent({ ...raw, orderedAssignmentIds: [id, id] }));
  assert.throws(() => parsePlanIntent({ ...raw, orderedAssignmentIds: Array.from({ length: 501 }, randomUUID) }));
  const order = randomUUID(), key = orderColorBusinessKey("  富贵红  A ");
  assert.equal(stableOrderColorId(order, key), stableOrderColorId(order.toUpperCase(), orderColorBusinessKey("富贵红 a")));
  assert.notEqual(stableOrderColorId(order, key), stableOrderColorId(randomUUID(), key));
});

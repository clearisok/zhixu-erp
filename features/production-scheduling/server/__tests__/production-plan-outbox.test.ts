import assert from "node:assert/strict";
import test from "node:test";
import { canonicalProductionPlanCommand } from "../production-plan-client";
import { acknowledgeProductionPlanPending, productionPlanPendingKey, readProductionPlanPending, saveProductionPlanPending } from "../production-plan-outbox";
import { parseExecutionCommand } from "../../../../server/production-scheduling/execution-contract";
const userId = "11111111-1111-4111-8111-111111111111", orderId = "22222222-2222-4222-8222-222222222222", requestId = "33333333-3333-4333-8333-333333333333";
const scope = { userId }, command = canonicalProductionPlanCommand({ requestId, previewHash: "a".repeat(64), intent: { action: "create", orderId, expectedPlanVersion: 0, assignmentId: null, expectedVersion: 0,
  data: { executionType: "outsource", executorId: userId, colorId: null, plannedQuantity: "0", duration: { mode: "workdays", workdays: 2 }, dates: { mode: "manual_fixed", startDate: "2027-01-01", endDate: "2027-01-02" }, remark: "" } } });
class MemoryStorage { values = new Map<string, string>(); reads: string[] = []; getItem(key: string) { this.reads.push(key); return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); } }
test("tab pending survives refresh-style reads and same request does not replace its original evidence", () => {
  const storage = new MemoryStorage(); saveProductionPlanPending(storage, scope, command); const raw = storage.getItem(productionPlanPendingKey(scope));
  assert.deepEqual(readProductionPlanPending(storage, scope), command); saveProductionPlanPending(storage, scope, command); assert.equal(storage.getItem(productionPlanPendingKey(scope)), raw);
  acknowledgeProductionPlanPending(storage, scope, command); assert.equal(readProductionPlanPending(storage, scope), null);
});
test("actors and Browser namespaces remain isolated; all planning scopes share one unresolved actor slot", () => {
  const storage = new MemoryStorage(); storage.setItem("zhixu.erp.local.production-scheduling", "long-term-sentinel"); saveProductionPlanPending(storage, scope, command);
  assert.equal(readProductionPlanPending(storage, { userId: orderId }), null);
  assert.ok(storage.reads.every(key => key.startsWith("zhixu.server.production-plan.pending.v1.")));
  const replan = canonicalProductionPlanCommand({ ...command, intent: { action: "replan", groupId: orderId, expectedQueueVersion: 0, anchorDate: "2027-01-01", orderedAssignmentIds: [] } });
  assert.throws(() => saveProductionPlanPending(storage, scope, replan)); assert.throws(() => acknowledgeProductionPlanPending(storage, scope, replan));
  assert.deepEqual(readProductionPlanPending(storage, scope), command); assert.equal(storage.values.get("zhixu.erp.local.production-scheduling"), "long-term-sentinel");
});
test("changed request, preview, quantity or metadata cannot overwrite or acknowledge unresolved work", () => {
  const storage = new MemoryStorage(); saveProductionPlanPending(storage, scope, command);
  for (const changed of [{ ...command, requestId: orderId }, { ...command, previewHash: "b".repeat(64) }, { ...command, intent: { ...command.intent, expectedPlanVersion: 3 } }]) {
    assert.throws(() => saveProductionPlanPending(storage, scope, changed)); assert.throws(() => acknowledgeProductionPlanPending(storage, scope, changed));
  }
  assert.deepEqual(readProductionPlanPending(storage, scope), command);
});
test("corrupt, future, wrong-actor and noncanonical records stay byte-identical", () => {
  const base = { schemaVersion: 1, userId, savedAt: "2026-10-20T00:00:00.000Z", command };
  for (const raw of ["not-json", JSON.stringify({ ...base, schemaVersion: 2 }), JSON.stringify({ ...base, userId: orderId }), JSON.stringify({ ...base, extra: "unknown" }), JSON.stringify({ ...base, savedAt: "2026-10-20" }), JSON.stringify({ ...base, command: { ...command, password: "never" } }), "中".repeat(400000)]) {
    const storage = new MemoryStorage(); storage.setItem(productionPlanPendingKey(scope), raw);
    assert.throws(() => readProductionPlanPending(storage, scope)); assert.throws(() => saveProductionPlanPending(storage, scope, command)); assert.throws(() => acknowledgeProductionPlanPending(storage, scope, command));
    assert.equal(storage.getItem(productionPlanPendingKey(scope)), raw);
  }
});
test("unavailable, dishonest or unremovable storage has no memory fallback", () => {
  assert.throws(() => saveProductionPlanPending({ getItem() { throw Error("unavailable"); }, setItem() {} }, scope, command));
  assert.throws(() => saveProductionPlanPending({ getItem() { return null; }, setItem() {} }, scope, command));
  const storage = new MemoryStorage(); saveProductionPlanPending(storage, scope, command);
  assert.throws(() => acknowledgeProductionPlanPending({ getItem: storage.getItem.bind(storage), removeItem() {} }, scope, command)); assert.deepEqual(readProductionPlanPending(storage, scope), command);
});

test("execution and plan use the same original actor slot without overwriting pending bytes", () => {
  const execution = parseExecutionCommand({ requestId, previewHash: "c".repeat(64), intent: { action: "record_execution", orderId, assignmentId: userId,
    expectedAssignmentVersion: 1, expectedExecutionVersion: 0, expectedPlanVersion: 0, data: { status: "completed", completedQuantity: "0", actualStartDate: null, actualCompletedDate: "2027-01-02" }, reason: "", replan: null } });
  for (const [first, second] of [[command, execution], [execution, command]]) {
    const storage = new MemoryStorage(); storage.setItem("zhixu.erp.local.production-scheduling", "long-term-original");
    saveProductionPlanPending(storage, scope, first); const original = storage.getItem(productionPlanPendingKey(scope));
    assert.deepEqual(readProductionPlanPending(storage, scope), first);
    assert.throws(() => saveProductionPlanPending(storage, scope, second)); assert.throws(() => acknowledgeProductionPlanPending(storage, scope, second));
    assert.equal(storage.getItem(productionPlanPendingKey(scope)), original);
    acknowledgeProductionPlanPending(storage, scope, first); saveProductionPlanPending(storage, scope, second);
    assert.deepEqual(readProductionPlanPending(storage, scope), second);
    assert.equal(storage.getItem("zhixu.erp.local.production-scheduling"), "long-term-original");
  }
  const raw = JSON.stringify({ schemaVersion: 1, userId, savedAt: "2026-10-20T00:00:00.000Z", command: { ...execution, intent: { ...execution.intent, price: "never" } } });
  const storage = new MemoryStorage(); storage.setItem(productionPlanPendingKey(scope), raw);
  assert.throws(() => readProductionPlanPending(storage, scope)); assert.equal(storage.getItem(productionPlanPendingKey(scope)), raw);
});

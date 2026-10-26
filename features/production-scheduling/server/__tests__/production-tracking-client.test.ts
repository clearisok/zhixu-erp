import assert from "node:assert/strict";
import test from "node:test";
import { planHash } from "../../../../server/production-scheduling/repository";
import { parseOrderTrackingCommand } from "../../../../server/production-scheduling/tracking-contract";
import { parsePlanCommand } from "../../../../server/production-scheduling/contract";
import { parseExecutionCommand } from "../../../../server/production-scheduling/execution-contract";
import { createProductionPlanClient, productionPlanFingerprint } from "../production-plan-client";
import { acknowledgeProductionPlanPending, productionPlanPendingKey, readProductionPlanPending, saveProductionPlanPending } from "../production-plan-outbox";
import { orderId, groupId, requestId, time } from "./production-plan-read-fixture";

const trackingId = "58b466da-a030-4136-bf10-0ef0dfccf730", userId = "4299421b-5153-4966-aea9-02de214ac52f";
const hub = { id: groupId, name: "合成集货仓", enabled: true, remark: " 合成备注 ", version: 2 };
const order = { id: orderId, orderNo: "SO-000000001", version: 1, lifecycleState: "draft", identity: {
  originalOrderId: orderId, effectiveOrderId: orderId, attributionChangeId: null, attributionVersion: 0, historicalDuplicate: false,
} };
const scope = { order, tracking: null, currentHub: null, canEdit: true };
const command = parseOrderTrackingCommand({ requestId, intent: { action: "set_order_tracking", orderId, expectedVersion: 0, data: { supplyHubId: hub.id, remark: " 明确选择 " } }, previewHash: "b".repeat(64) });
const tracking = { id: trackingId, orderId, version: 1, ...command.intent.data, hubSnapshot: hub, createdAt: time, updatedAt: time };
const preview = { intent: command.intent, before: null, after: { ...command.intent.data, hubSnapshot: hub }, changed: true, order, previewHash: command.previewHash };
const outcome = { requestId, payloadHash: planHash(command), status: "applied", changed: true, tracking, operationId: "operation-" + requestId, replayed: false };
function client(value: unknown, status = 200, calls: { path: string; init?: RequestInit }[] = []) {
  return createProductionPlanClient((async (path, init) => { calls.push({ path: String(path), init }); return Response.json(value, { status }); }) as typeof fetch);
}
class MemoryStorage {
  values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); }
}
test("tracking joins the exact old actor/tab outbox; plans/execution stay byte-identical and cannot overwrite it", () => {
  const plan = parsePlanCommand({ requestId, previewHash: "c".repeat(64), intent: { action: "cancel", orderId, assignmentId: groupId, expectedVersion: 1, expectedPlanVersion: 0, reason: "合成" } });
  const execution = parseExecutionCommand({ requestId, previewHash: "c".repeat(64), intent: { action: "record_execution", orderId, assignmentId: groupId, expectedAssignmentVersion: 1, expectedExecutionVersion: 0, expectedPlanVersion: 0,
    data: { status: "in_progress", completedQuantity: "0", actualStartDate: null, actualCompletedDate: null }, reason: "", replan: null } });
  for (const previous of [plan, execution, command]) {
    const storage = new MemoryStorage(), owner = { userId }; storage.setItem("zhixu.erp.local.production-scheduling", "Browser-original");
    const raw = JSON.stringify({ schemaVersion: 1, userId, savedAt: time, command: previous }); storage.setItem(productionPlanPendingKey(owner), raw);
    assert.deepEqual(readProductionPlanPending(storage, owner), previous);
    for (const next of [plan, execution, command].filter(item => item !== previous)) {
      assert.throws(() => saveProductionPlanPending(storage, owner, next)); assert.throws(() => acknowledgeProductionPlanPending(storage, owner, next));
      assert.equal(storage.getItem(productionPlanPendingKey(owner)), raw);
    }
    acknowledgeProductionPlanPending(storage, owner, previous); saveProductionPlanPending(storage, owner, command);
    assert.deepEqual(readProductionPlanPending(storage, owner), command); assert.equal(storage.getItem("zhixu.erp.local.production-scheduling"), "Browser-original");
  }
});
test("tracking reads and previews are exact non-monetary projections; current warehouse never overwrites history", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  assert.deepEqual(await client({ ...scope, price: "secret" }, 200, calls).orderTracking(orderId), scope);
  const read = await client({ ...scope, tracking, currentHub: { ...hub, name: "已改名", version: 3, enabled: false, salePrice: "secret" } }).orderTracking(orderId);
  assert.equal(read.tracking?.hubSnapshot?.name, hub.name); assert.equal(read.currentHub?.name, "已改名"); assert.equal(JSON.stringify(read).includes("secret"), false);
  assert.deepEqual(await client({ ...preview, token: "secret" }, 200, calls).orderTrackingPreview(command.intent, scope), preview);
  assert.deepEqual(calls.map(item => item.path), ["/api/v1/production-scheduling/order-tracking/orders/" + orderId, "/api/v1/production-scheduling/order-tracking/preview"]);
  assert.equal(calls[1].init?.credentials, "include"); assert.equal(calls[1].init?.cache, "no-store");
  for (const patch of [{ currentHub: hub }, { canEdit: "true" }, { order: { ...order, id: groupId } }, { tracking: { ...tracking, orderId: groupId }, currentHub: hub },
    { tracking, currentHub: { ...hub, id: requestId } }, { tracking, currentHub: { ...hub, version: 1 } }, { order: { ...order, lifecycleState: "completed" } }]) await assert.rejects(() => client({ ...scope, ...patch }).orderTracking(orderId));
  for (const patch of [{ changed: false }, { intent: { ...command.intent, expectedVersion: 1 } }, { before: tracking }, { after: { ...preview.after, remark: "different" } }, { after: { ...preview.after, hubSnapshot: null } },
    { after: { ...preview.after, hubSnapshot: { ...hub, enabled: false } } }, { previewHash: "invalid" }]) await assert.rejects(() => client({ ...preview, ...patch }).orderTrackingPreview(command.intent, scope));
});
test("tracking executes and reads saved receipts through the same digest/transport without a new writer", async () => {
  assert.equal(await productionPlanFingerprint(command), planHash(command)); const calls: { path: string; init?: RequestInit }[] = [];
  const result = await client({ ...outcome, token: "secret" }, 200, calls).execute(command); assert.equal(result.status, "applied"); assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(calls[0].path, "/api/v1/production-scheduling/order-tracking/commands");
  for (const state of ["unknown", "pending", "known"] as const) {
    const requests: { path: string; init?: RequestInit }[] = [], receipt = await client({ state, requestId, result: state === "known" ? outcome : null }, 200, requests).receipt(command);
    assert.equal(receipt.state, state); assert.equal(requests.length, 1); assert.equal(requests[0].init?.method, "GET");
  }
  for (const patch of [{ requestId: groupId }, { payloadHash: "a".repeat(64) }, { changed: false }, { tracking: { ...tracking, orderId: groupId } }, { tracking: { ...tracking, version: 2 } },
    { tracking: { ...tracking, supplyHubId: null } }, { tracking: { ...tracking, remark: "different" } }, { operationId: null }, { replayed: "false" }]) await assert.rejects(() => client({ ...outcome, ...patch }).execute(command));
  for (const status of [404, 409, 422]) {
    const rejected = { requestId, payloadHash: planHash(command), status: "rejected", error: { status, code: "order_tracking_preview_changed", message: "secret" }, replayed: false };
    assert.equal((await client(rejected, status).execute(command)).status, "rejected");
    await assert.rejects(() => client({ error: rejected.error }, status).execute(command));
  }
});
test("empty initial no-op, explicit clearing and unchanged saved facts remain distinct", async () => {
  const empty = parseOrderTrackingCommand({ ...command, intent: { ...command.intent, data: { supplyHubId: null, remark: "" } } });
  const noop = { ...outcome, payloadHash: planHash(empty), changed: false, operationId: null, tracking: null };
  assert.equal((await client(noop).execute(empty)).status, "applied");
  await assert.rejects(() => client({ ...noop, changed: true, operationId: outcome.operationId, tracking: { ...tracking, supplyHubId: null, hubSnapshot: null, remark: "" } }).execute(empty));
  const clear = parseOrderTrackingCommand({ ...empty, intent: { ...empty.intent, expectedVersion: 1 } });
  assert.equal((await client({ ...outcome, payloadHash: planHash(clear), tracking: { ...tracking, version: 2, supplyHubId: null, hubSnapshot: null, remark: "" } }).execute(clear)).status, "applied");
  await assert.rejects(() => client({ ...noop, payloadHash: planHash(clear) }).execute(clear));
});
test("tracking history has exact stable 25-item anchors and each event keeps its own warehouse facts", async () => {
  const head = { ...tracking, version: 26 }, rows = Array.from({ length: 25 }, (_, index) => { const version = 26 - index; return { version, requestId, operationId: outcome.operationId, recordedAt: time,
    snapshot: { id: trackingId, sales_order_id: orderId, supply_hub_id: hub.id, hub_snapshot: { ...hub, name: "当时仓" + version }, remark: "当时备注" + version, version, created_at: time, updated_at: time } }; });
  const raw = { order, tracking: head, history: rows, asOfVersion: 26, offset: 0, limit: 25, hasMore: true, nextOffset: 25 };
  const result = await client({ ...raw, price: "secret" }).orderTrackingHistory(orderId);
  assert.equal(result.history[0].snapshot.hubSnapshot?.name, "当时仓26"); assert.equal(JSON.stringify(result).includes("secret"), false);
  const tail = { ...raw, offset: 25, hasMore: false, nextOffset: null, history: [{ ...rows[0], version: 1, snapshot: { ...rows[0].snapshot, version: 1 } }] };
  assert.equal((await client(tail).orderTrackingHistory(orderId, 25, 26)).history[0].version, 1);
  for (const patch of [{ limit: 50 }, { nextOffset: 50 }, { hasMore: false }, { asOfVersion: 25 }, { history: rows.slice(1) }, { history: [rows[1], rows[0], ...rows.slice(2)] },
    { history: rows.map((item, i) => i ? item : { ...item, snapshot: { ...item.snapshot, id: requestId } }) }]) await assert.rejects(() => client({ ...raw, ...patch }).orderTrackingHistory(orderId, 0, 26));
  assert.deepEqual((await client({ order, tracking: null, history: [], asOfVersion: 0, offset: 0, limit: 25, hasMore: false, nextOffset: null }).orderTrackingHistory(orderId)).history, []);
});
test("tracking lease changes never accept a prior response or issue another POST", async () => {
  let current = true, calls = 0;
  const api = createProductionPlanClient((async () => { calls++; current = false; return Response.json(outcome); }) as typeof fetch);
  await assert.rejects(() => api.execute(command, () => current), { code: "plan_owner_changed" }); assert.equal(calls, 1);
  current = false; await assert.rejects(() => api.receipt(command, () => current), { code: "plan_owner_changed" }); assert.equal(calls, 1);
});

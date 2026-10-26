import assert from "node:assert/strict";
import test from "node:test";
import { createProductionPlanClient } from "../production-plan-client";
import { assignmentId, groupId, orderId, orderRead, orderSummary, requestId, resourceHash, resources, savedAssignment, time } from "./production-plan-read-fixture";
const query = { search: "SYN 空格", allocation: "remaining" as const, offset: 0, limit: 20 };
const directory = { items: [orderSummary], total: 1, offset: 0, limit: 20, hasMore: false };
function client(value: unknown, calls: { path: string; init?: RequestInit }[] = []) {
  return createProductionPlanClient((async (path, init) => { calls.push({ path: String(path), init }); return Response.json(value); }) as typeof fetch);
}
test("read directories use session GETs and project only the non-monetary whitelist", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const result = await client({ ...directory, salePrice: "99", items: [{ ...orderSummary, salePrice: "99", confirmedLaborPrice: "8" }] }, calls).orders(query);
  assert.deepEqual(result, directory); assert.equal(calls.length, 1); assert.equal(calls[0].init?.method, "GET"); assert.equal(calls[0].init?.credentials, "include"); assert.equal(calls[0].init?.body, undefined);
  assert.equal(new URL("https://synthetic" + calls[0].path).searchParams.get("search"), "SYN 空格");
});
test("wrong identities, false pages, untrusted eligibility and missing resource ownership are rejected", async () => {
  for (const value of [{ ...directory, total: 0 }, { ...directory, offset: 1 }, { ...directory, hasMore: true }, { ...directory, items: [orderSummary, orderSummary] },
    { ...directory, items: [{ ...orderSummary, eligible: false }] }, { ...directory, items: [{ ...orderSummary, businessType: "unclassified" }] }]) await assert.rejects(() => client(value).orders(query));
  for (const value of [{ ...orderRead, summary: { ...orderSummary, id: groupId } }, { ...orderRead, resources: {} }, { ...orderRead, canCreate: "true" },
    { ...orderRead, assignments: [{ ...savedAssignment, orderId: groupId }] }]) await assert.rejects(() => client(value).order(orderId));
});
test("exact aggregate decimals exceed one assignment's precision without number conversion; unknown stays unknown", async () => {
  const huge = "9".repeat(131), result = await client({ ...directory, items: [{ ...orderSummary, plannedQuantity: huge }] }).orders(query);
  assert.equal(result.items[0].plannedQuantity, huge);
  const unknown = { ...orderSummary, quantity: null, remainingQuantity: null, overassignedQuantity: null, allocationState: "unknown" };
  const values = await client({ ...directory, items: [unknown] }).orders({ ...query, allocation: "all" }); assert.equal(values.items[0].quantity, null);
  await assert.rejects(() => client({ ...directory, items: [{ ...unknown, remainingQuantity: "0" }] }).orders({ ...query, allocation: "all" }));
});
test("queue order summaries include historical owners without turning them into new executable candidates", async () => {
  const historical = { ...orderSummary, effectiveOrderId: groupId, eligible: false };
  const queue = { groupId, group: { id: groupId, name: "当前组名", version: 2, enabled: false }, version: 3, assignments: [savedAssignment], resources, ordersById: { [orderId]: historical } };
  const value = await client(queue).queue(groupId); assert.equal(value.ordersById[orderId].eligible, false); assert.equal(value.assignments[0].plannedQuantity, "30");
  await assert.rejects(() => client({ ...queue, groupId: orderId }).queue(groupId)); await assert.rejects(() => client({ ...queue, ordersById: {} }).queue(groupId));
});
test("group directory rejects rows outside the requested enabled/relevant scope", async () => {
  const row = { id: groupId, name: "合成组", shortName: "", enabled: false, resourcesEnabled: false, canCreate: false, version: 1, queueVersion: 0,
    assignmentCount: 0, plannedQuantity: "0", headAssignmentId: null, headOrderId: null, plannedThroughDate: null, siteName: "地点", calendarName: "日历" };
  const data = { items: [row], ordersById: {}, total: 1, offset: 0, limit: 20, hasMore: false }, input = { search: "", status: "all" as const, offset: 0, limit: 20 };
  assert.equal((await client(data).groups(input)).items[0].enabled, false);
  await assert.rejects(() => client(data).groups({ ...input, status: "relevant" }));
  await assert.rejects(() => client(data).groups({ ...input, status: "enabled" }));
  assert.equal((await client(data).groups({ ...input, status: "disabled" })).items.length, 1);
});
test("history preserves its anchor and old resource names while dropping unrelated raw fields", async () => {
  const raw = { assignment: savedAssignment, resources, resourceSnapshot: { privateData: "not-rendered" }, asOfVersion: 1, offset: 0, limit: 50, hasMore: false, nextOffset: null,
    history: [{ version: 1, requestId, operationId: "synthetic", reason: "合成", recordedAt: time, snapshot: { id: assignmentId, sales_order_id: orderId, version: 1,
      resource_snapshot_hash: resourceHash, execution_type: "internal", production_group_id: groupId, outsource_factory_id: null, planned_quantity: "30", planned_start_date: "2027-01-04", planned_end_date: "2027-01-05", color_name_snapshot: null, remark: "原备注", status: "planned", salePrice: "999" } }] };
  const result = await client(raw).history(assignmentId, 0, 1); assert.equal(result.history[0].snapshot.plannedQuantity, "30"); assert.equal(result.resources[resourceHash].group?.name, "采用的原组名");
  assert.equal(/privateData|salePrice/u.test(JSON.stringify(result)), false);
  for (const value of [{ ...raw, asOfVersion: 2 }, { ...raw, hasMore: true, nextOffset: 50 }, { ...raw, resources: {} }]) await assert.rejects(() => client(value).history(assignmentId, 0, 1));
});
test("a late read response, including old 401, cannot cross a captured session lease", async () => {
  let finish!: (response: Response) => void, active = true, calls = 0;
  const pending = createProductionPlanClient((() => { calls++; return new Promise<Response>(resolve => { finish = resolve; }); }) as typeof fetch).orders(query, () => active);
  active = false; finish(Response.json({ error: { code: "authentication_required" } }, { status: 401 }));
  await assert.rejects(() => pending, (error: unknown) => (error as { code: string }).code === "plan_owner_changed"); assert.equal(calls, 1);
});

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { canonicalResourceCommand, createProductionResourceClient, resourceCommandFingerprint, transportPlanDisplayName } from "../production-resource-client";
import { acknowledgeResourcePending, readResourcePending, resourcePendingKey, saveResourcePending } from "../production-resource-outbox";

const requestId = randomUUID(), id = randomUUID(), hubId = randomUUID(), siteId = randomUUID(), modeId = randomUUID(), secondId = randomUUID();
const time = "2026-10-21T00:00:00.000Z";
const mode = { modeId: null as string | null, name: "合成海运", enabled: true, remark: "保留格式\n", transitDays: 12, sortOrder: 0 };
const input = { requestId, action: "create", kind: "transport-plans", resourceId: null as string | null, expectedVersion: 0, data: { name: "仓 → 地点", enabled: true, remark: "", supplyHubId: hubId, productionSiteId: siteId, modes: [mode] } };
const client = (value: unknown, status = 200, calls: string[] = []) => createProductionResourceClient((async (url) => { calls.push(String(url)); return Response.json(value, { status }); }) as typeof fetch);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonicalResourceCommand(value))).digest("hex");
function applied(value = input, resourcePatch: Record<string, unknown> = {}, envelope: Record<string, unknown> = {}) {
  return { requestId: value.requestId, kind: value.kind, payloadHash: hash(value), status: "applied", changed: true, replayed: false, operationId: "operation-" + id,
    resource: { id, kind: "transport-plans", version: 1, createdAt: time, updatedAt: time, ...value.data, modes: value.data.modes.map((item, index) => ({ ...item, modeId: index === 0 ? modeId : secondId })), ...resourcePatch }, ...envelope };
}
test("logistics canonical payload and browser SHA use the same service command", async () => {
  const command = canonicalResourceCommand(input); assert.equal(command.kind, "transport-plans"); assert.equal(await resourceCommandFingerprint(command), hash(input));
  const result = await client(applied()).execute(command); assert.equal(result.status, "applied"); if (result.status === "applied") assert.equal(result.resource.kind, "transport-plans");
});
test("valid long parent names produce a bounded display title without changing either identity or splitting Unicode", () => {
  for (const [hub, site] of [["仓".repeat(100), "厂".repeat(100)], ["仓".repeat(200), "厂"], ["😀".repeat(100), "🧵".repeat(100)]]) {
    const name = transportPlanDisplayName(hub, site); assert.ok(name.length <= 200);
    const command = canonicalResourceCommand({ ...input, data: { ...input.data, name } });
    assert.equal(command.kind, "transport-plans"); if (command.kind === "transport-plans") { assert.equal(command.data.supplyHubId, hubId); assert.equal(command.data.productionSiteId, siteId); }
    assert.equal(name.includes("�"), false); assert.ok(name.includes(" → "));
  }
  assert.equal(transportPlanDisplayName("合成仓", "合成工厂"), "合成仓 → 合成工厂");
});
test("generated IDs are accepted only for new rows, with exact order, values and complete retained membership", async () => {
  const update = { ...input, action: "update", resourceId: id, expectedVersion: 2, data: { ...input.data, modes: [{ ...mode, modeId }, { ...mode, name: "加急" }] } };
  const command = canonicalResourceCommand(update);
  const valid = applied(update, { version: 3 }); assert.equal((await client(valid).execute(command)).status, "applied");
  for (const modes of [
    [{ ...mode, modeId: null }, { ...mode, modeId: secondId, name: "加急" }],
    [{ ...mode, modeId: secondId }, { ...mode, modeId, name: "加急" }],
    [{ ...mode, modeId }, { ...mode, modeId, name: "加急" }],
    [{ ...mode, modeId }],
    [{ ...mode, modeId, transitDays: 0 }, { ...mode, modeId: secondId, name: "加急" }],
  ]) await assert.rejects(() => client({ ...valid, resource: { ...valid.resource, modes } }).execute(command));
  await assert.rejects(() => client({ ...valid, changed: false, operationId: null, resource: { ...valid.resource, version: 2 } }).execute(command));
});
test("list summaries validate counts without manufacturing an empty detail list; details require saved mode IDs", async () => {
  const resource = applied().resource, { modes: _modes, ...summary } = resource; void _modes;
  const query = { search: "", status: "all" as const, offset: 0, limit: 20 };
  const page = await client({ items: [{ ...summary, modeCount: 1, enabledModeCount: 1 }], total: 1, offset: 0, limit: 20, canEdit: true }).list("transport-plans", query);
  assert.equal(Object.hasOwn(page.items[0], "modes"), false);
  for (const counts of [{ modeCount: 0, enabledModeCount: 0 }, { modeCount: 101, enabledModeCount: 1 }, { modeCount: 1, enabledModeCount: 2 }, { modeCount: 1, enabledModeCount: -1 }])
    await assert.rejects(() => client({ items: [{ ...summary, ...counts }], total: 1, offset: 0, limit: 20, canEdit: true }).list("transport-plans", query));
  await assert.rejects(() => client({ resource: summary }).read("transport-plans", id));
  await assert.rejects(() => client({ resource: { ...resource, modes: [mode] } }).read("transport-plans", id));
  assert.equal((await client({ resource }).read("transport-plans", id)).id, id);
});
test("only the scoped and hash-verified 422 capacity receipt is terminal; bare errors keep the request unresolved", async () => {
  const command = canonicalResourceCommand(input), rejected = { requestId, kind: "transport-plans", status: "rejected", payloadHash: hash(input), error: { status: 422, code: "logistics_result_too_large" }, replayed: false };
  assert.equal((await client(rejected, 422).execute(command)).status, "rejected");
  assert.equal((await client({ state: "known", requestId, result: rejected }).receipt(command)).state, "known");
  for (const data of [{ ...rejected, payloadHash: "0".repeat(64) }, { ...rejected, error: { status: 422, code: "production_resource_not_found" } }, { error: { code: "logistics_result_too_large" } }])
    await assert.rejects(() => client(data, 422).execute(command), error => error instanceof Error && !(error as { knownNotApplied?: boolean }).knownNotApplied);
});
test("new logistics pending scopes preserve exact IDs/bytes and cannot acknowledge another request or actor", () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const scope = { userId: randomUUID(), kind: "transport-plans" as const }, command = canonicalResourceCommand(input);
  saveResourcePending(storage, scope, command); const original = values.get(resourcePendingKey(scope));
  assert.deepEqual(readResourcePending(storage, scope), command); saveResourcePending(storage, scope, command); assert.equal(values.get(resourcePendingKey(scope)), original);
  assert.equal(readResourcePending(storage, { ...scope, kind: "hubs" }), null); assert.equal(readResourcePending(storage, { ...scope, userId: randomUUID() }), null);
  assert.throws(() => acknowledgeResourcePending(storage, scope, canonicalResourceCommand({ ...input, requestId: randomUUID() })));
  assert.equal(values.get(resourcePendingKey(scope)), original); acknowledgeResourcePending(storage, scope, command); assert.equal(values.size, 0);
});
test("Hub service-route counts are list-only nonnegative facts and never enter a detail or save command", async () => {
  const resource = { id: hubId, kind: "hubs", version: 1, createdAt: time, updatedAt: time, name: "合成仓", enabled: true, remark: "" };
  const query = { search: "", status: "all" as const, offset: 0, limit: 20 };
  const result = await client({ items: [{ ...resource, enabledRouteCount: 3 }], total: 1, offset: 0, limit: 20, canEdit: true }).list("hubs", query);
  assert.equal(result.items[0].kind, "hubs"); if (result.items[0].kind === "hubs") assert.equal(result.items[0].enabledRouteCount, 3);
  await assert.rejects(() => client({ items: [{ ...resource, enabledRouteCount: -1 }], total: 1, offset: 0, limit: 20, canEdit: true }).list("hubs", query));
  const detail = await client({ resource: { ...resource, enabledRouteCount: 3 } }).read("hubs", hubId); assert.equal(Object.hasOwn(detail, "enabledRouteCount"), false);
});

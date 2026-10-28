import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createMaterialArrivalsClient, materialArrivalCommandDigest, parseMaterialArrivalRead, MaterialArrivalError } from "../material-arrivals-client.ts";
import { acknowledgeMaterialArrivalPending, materialArrivalPendingKey, readMaterialArrivalPending, saveMaterialArrivalPending } from "../material-arrivals-pending.ts";
import { arrivalDraftBalance, arrivalDraftIntent } from "../material-arrival-draft.ts";
import type { ArrivalCommand } from "../../../../server/material-arrivals/contract.ts";

class MemoryStorage {
  values = new Map<string, string>(); writes = 0; removes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.values.set(key, value); }
  removeItem(key: string) { this.removes++; this.values.delete(key); }
}
const orderId = randomUUID(), canonicalKey = "material-trim-abc", scope = { userId: randomUUID() };
const command = (): ArrivalCommand => ({ requestId: randomUUID(), previewHash: "b".repeat(64), intent: { action: "replace_arrival_plan", orderId, canonicalKey, expectedVersion: 0, batches: [] } });
const source = { sourceKey: "synthetic-demo", runId: randomUUID(), contentHash: "a".repeat(64), sourceLinkId: randomUUID(), capturedOrderVersion: 1 };
const read = () => ({ order: { id: orderId, orderNo: "SO-SYNTHETIC", version: 1, lifecycleState: "draft", identity: { originalOrderId: orderId, effectiveOrderId: orderId, attributionChangeId: null, attributionVersion: 0, historicalDuplicate: false } },
  source: { status: "ready", generation: source, demands: [], factoryExcluded: 0 }, tracking: null, canEdit: true, plans: [],
  logistics: { schemaVersion: "material-arrival-logistics.v1", orderId, status: "ready", planVersion: 0, assignment: null, supplyHubId: null,
    settings: { productionGroups: [], productionSites: [], supplyHubs: [], supplyRoutes: [], transportModes: [] }, versions: { hub: null, route: null, modes: [] }, issues: [] } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("pending slot preserves original command and every unrelated Browser or actor record", () => {
  const storage = new MemoryStorage(), c = command(), other = { userId: randomUUID() };
  storage.values.set("zhixu.erp.local.quotes", "LONG-LIVED-QUOTES"); storage.values.set("zhixu.server.production-plan.pending.v1." + scope.userId, "OTHER-OWNER");
  saveMaterialArrivalPending(storage, scope, c); const raw = storage.getItem(materialArrivalPendingKey(scope));
  assert.deepEqual(readMaterialArrivalPending(storage, scope), c); assert.equal(readMaterialArrivalPending(storage, other), null);
  saveMaterialArrivalPending(storage, scope, structuredClone(c)); assert.equal(storage.getItem(materialArrivalPendingKey(scope)), raw); assert.equal(storage.writes, 1);
  assert.throws(() => saveMaterialArrivalPending(storage, scope, command())); assert.throws(() => acknowledgeMaterialArrivalPending(storage, scope, command()));
  assert.equal(storage.getItem(materialArrivalPendingKey(scope)), raw); acknowledgeMaterialArrivalPending(storage, scope, c);
  assert.equal(storage.getItem("zhixu.erp.local.quotes"), "LONG-LIVED-QUOTES"); assert.equal(storage.getItem("zhixu.server.production-plan.pending.v1." + scope.userId), "OTHER-OWNER"); assert.equal(storage.removes, 1);
});
test("malformed, future and wrong-owner pending bytes are retained and cannot be replaced or acknowledged", () => {
  const c = command(), fixtures = ["{bad", JSON.stringify({ schemaVersion: 2, userId: scope.userId, savedAt: new Date().toISOString(), command: c }),
    JSON.stringify({ schemaVersion: 1, userId: randomUUID(), savedAt: new Date().toISOString(), command: c }),
    JSON.stringify({ schemaVersion: 1, userId: scope.userId, savedAt: new Date().toISOString(), command: { ...c, actorId: scope.userId } })];
  for (const raw of fixtures) { const storage = new MemoryStorage(); storage.values.set(materialArrivalPendingKey(scope), raw);
    assert.throws(() => readMaterialArrivalPending(storage, scope)); assert.throws(() => saveMaterialArrivalPending(storage, scope, c)); assert.throws(() => acknowledgeMaterialArrivalPending(storage, scope, c));
    assert.equal(storage.getItem(materialArrivalPendingKey(scope)), raw); assert.equal(storage.writes, 0); assert.equal(storage.removes, 0); }
  const broken = { getItem: () => null, setItem: () => undefined }; assert.throws(() => saveMaterialArrivalPending(broken, scope, c), /unavailable/u);
});
test("draft allocation balances remain exact beyond safe integers; invalid or scientific inputs are unknown, never zero", () => {
  const id = randomUUID(), drafts = [{ id: randomUUID(), expectedArrivalAtHubDate: "2027-01-01", quantities: { [id]: "9007199254740990.123456788" } },
    { id: randomUUID(), expectedArrivalAtHubDate: "2027-01-02", quantities: { [id]: "3.000000001" } }];
  assert.deepEqual(arrivalDraftBalance("9007199254740993.123456789", id, drafts), { allocated: "9007199254740993.123456789", remaining: "0", excess: null });
  assert.equal(arrivalDraftBalance("1", id, drafts).excess, "9007199254740992.123456789");
  const huge = arrivalDraftBalance("1", id, drafts.map(d => ({ ...d, quantities: { [id]: "9".repeat(128) } }))); assert.equal(huge.allocated?.length, 129); assert.equal(huge.excess?.length, 129); assert.equal(huge.remaining, "0");
  for (const value of ["1e3", "-1", "bad"]) assert.equal(arrivalDraftBalance("1", id, [{ ...drafts[0], quantities: { [id]: value } }]).allocated, null);
  const intent = arrivalDraftIntent(orderId, canonicalKey, 0, [{ ...drafts[0], quantities: { [id]: "0001.5000", [randomUUID()]: "0" } }]); assert.equal(intent.batches[0].allocations[0].quantity, "1.5"); assert.equal(intent.batches[0].allocations.length, 1);
});
test("read validation strips non-owned payload and refuses a foreign order or fabricated default Hub", () => {
  const raw = { ...read(), salePrice: "PRIVATE", remark: "PRIVATE" }, parsed = parseMaterialArrivalRead(raw, orderId); assert.equal(JSON.stringify(parsed).includes("PRIVATE"), false);
  assert.throws(() => parseMaterialArrivalRead(read(), randomUUID()));
  const fake = read(); fake.logistics.settings.supplyHubs = [{ id: randomUUID(), name: "default", enabled: true }] as never; assert.throws(() => parseMaterialArrivalRead(fake, orderId));
});
test("preview and submit use one explicit request, verify domain rejection digest, and never auto retry unknown results", async () => {
  const c = command(), digest = await materialArrivalCommandDigest(c), calls: { path: string; init?: RequestInit }[] = [];
  let mode = "preview";
  const client = createMaterialArrivalsClient(async (path, init) => { calls.push({ path, init });
    if (mode === "preview") return response({ intent: c.intent, order: read().order, before: null, after: { dateSource: "manual", batches: [], demands: [], source, tracking: null }, changed: false, sourceStatus: "ready", previewHash: c.previewHash });
    if (mode === "reject") return response({ requestId: c.requestId, status: "rejected", error: { status: 409, code: "material_arrival_preview_changed" }, payloadHash: digest }, 409);
    if (mode === "unknown") return response({ state: "unknown", requestId: c.requestId });
    if (mode === "pending") return response({ state: "pending", requestId: c.requestId });
    if (mode === "mismatch") return response({ state: "known", requestId: c.requestId, payloadHash: "f".repeat(64), result: { requestId: c.requestId, status: "applied", changed: false, operationId: null, plan: null } });
    throw new TypeError("synthetic dropped reply");
  });
  await client.preview(c.intent, parseMaterialArrivalRead(read(), orderId), () => true); assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.credentials, "include"); assert.equal(calls[0].init?.cache, "no-store"); assert.equal(new Headers(calls[0].init?.headers).get("X-Zhixu-Request"), "1");
  mode = "reject"; assert.equal((await client.submit(c, () => true)).status, "rejected"); assert.equal(calls.length, 2);
  mode = "unknown"; assert.equal((await client.receipt(c, () => true)).state, "unknown"); mode = "pending"; assert.equal((await client.receipt(c, () => true)).state, "pending"); assert.equal(calls.length, 4);
  mode = "mismatch"; await assert.rejects(client.receipt(c, () => true), (e: unknown) => e instanceof MaterialArrivalError && e.code === "arrival_receipt_mismatch");
  mode = "network"; await assert.rejects(client.submit(c, () => true)); assert.equal(calls.length, 6); assert.equal(calls.filter(c0 => c0.path.endsWith("/commands")).length, 2);
});
test("late reply and asynchronous digest cannot act for a remounted or switched identity", async () => {
  const first = {}, owner = { token: first }, isCurrent = () => owner.token === first;
  const client = createMaterialArrivalsClient(async () => { owner.token = {}; return response({ error: { code: "authentication_required" } }, 401); });
  await assert.rejects(client.read(orderId, isCurrent), (e: unknown) => e instanceof MaterialArrivalError && e.code === "arrival_owner_changed" && e.status === 0);
  owner.token = first; const pending = materialArrivalCommandDigest(command(), isCurrent); owner.token = {}; await assert.rejects(pending, (e: unknown) => e instanceof MaterialArrivalError && e.code === "arrival_owner_changed");
});

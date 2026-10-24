import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { startContinuousFixture } from "./ainuoke-continuous-fixture.js";
import { freshMaterialBundle } from "./ainuoke-binding-fixture.js";
import { captureSource } from "../ainuoke-source/service.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { executeProductionResourceCommand } from "../production-resources/service.js";
import { parseLogisticsResourceCommand } from "../production-resources/logistics-contract.js";
import { executeOrderTracking, previewOrderTracking } from "../production-scheduling/tracking-service.js";
import { createMaterialArrivalsClient } from "../../features/style-progress/server/material-arrivals-client.js";
import type { ArrivalCommand } from "../material-arrivals/contract.js";

test("arrival HTTP client accepts source color sets within existing byte budgets and verifies durable outcomes", { timeout: 180000 }, async t => {
  const x = await startContinuousFixture(resolve("dist/client"), { materialArrivals: true }); t.after(() => x.close());
  const actor = await loadExistingBootstrapActor(x.pool, x.users[0]), cookie = await x.login(x.users[0]), current = () => true;
  const client = createMaterialArrivalsClient((path, init) => fetch(x.base + path, { ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers)), Cookie: cookie, Origin: x.base } }));
  const resource = await executeProductionResourceCommand(x.pool, actor, parseLogisticsResourceCommand({ requestId: randomUUID(), kind: "hubs", action: "create", resourceId: null,
    expectedVersion: 0, data: { name: "合成容量核验仓", enabled: true, remark: "" } }));
  assert.equal(resource.status, "applied"); if (resource.status !== "applied") assert.fail();
  const tracking = await previewOrderTracking(x.pool, actor, { action: "set_order_tracking", orderId: x.orderId, expectedVersion: 0, data: { supplyHubId: resource.resource.id, remark: "" } });
  assert.equal((await executeOrderTracking(x.pool, actor, { requestId: randomUUID(), intent: tracking.intent, previewHash: tracking.previewHash })).status, "applied");
  const capture = (count: number) => captureSource(x.pool, actor, { sourceKey: "synthetic-demo", accountFingerprint: "a".repeat(64), maxAgeMs: 600000, collect: async () => {
    const bundle = freshMaterialBundle(), colors = Array.from({ length: count }, (_, n) => n.toString(36).padStart(3, "0")).join(",");
    for (const pages of Object.values(bundle.materials)) for (const page of pages) for (const row of page.rows)
      if (row.values.GoodsNo === "SYNTHETIC-MAT-ready") row.values.StyleColor = colors;
    return bundle;
  } });
  const readDemand = async () => { const read = await client.read(x.orderId, current), demand = read.source.demands.find(d => d.materialCode === "SYNTHETIC-MAT-ready"); assert.ok(demand); return { read, demand }; };
  const preview = async (scope: Awaited<ReturnType<typeof readDemand>>) => client.preview({ action: "replace_arrival_plan", orderId: x.orderId,
    canonicalKey: scope.demand.canonicalKey, expectedVersion: scope.read.plans.find(p => p.plan.canonicalKey === scope.demand.canonicalKey)?.plan.version ?? 0,
    batches: [{ id: randomUUID(), expectedArrivalAtHubDate: "2027-01-11", allocations: [{ materialDemandId: scope.demand.id, quantity: "1" }] }] }, scope.read, current);
  await capture(1001);
  const valid = await readDemand(); assert.equal(valid.demand.garmentColors.length, 1001); assert.equal(valid.demand.identity.garmentColors.length, 1001);
  const bytes = (await x.pool.query<{ bytes: number }>("SELECT octet_length($1::jsonb::text) AS bytes", [valid.demand.identity])).rows[0].bytes;
  assert.ok(bytes > 7000 && bytes <= 8192); assert.ok(Buffer.byteLength(JSON.stringify(valid.demand.identity)) < 8000);
  const first = await preview(valid), command: ArrivalCommand = { requestId: randomUUID(), intent: first.intent, previewHash: first.previewHash };
  const result = await client.submit(command, current); assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail();
  assert.equal(result.plan?.data.demands[0].garmentColors.length, 1001);
  const receipt = await client.receipt(command, current); assert.equal(receipt.state, "known"); if (receipt.state !== "known") assert.fail(); assert.equal(receipt.result.status, "applied");
  const saved = await client.read(x.orderId, current); assert.equal(saved.plans[0].plan.version, 1); assert.equal(saved.plans[0].plan.data.demands[0].identity.garmentColors.length, 1001);
  const history = await client.history(x.orderId, valid.demand.canonicalKey, 0, 1, current);
  assert.equal(history.history[0].snapshot.data.demands[0].garmentColors.length, 1001);
  t.diagnostic(`1001 colors: actual HTTP save/receipt/read/history, PostgreSQL identity bytes=${bytes}`);
  await capture(1200);
  const oversized = await readDemand(); assert.equal(oversized.demand.garmentColors.length, 1200);
  const oversizedBytes = (await x.pool.query<{ bytes: number }>("SELECT octet_length($1::jsonb::text) AS bytes", [oversized.demand.identity])).rows[0].bytes;
  assert.ok(oversizedBytes > 8192); assert.ok(Buffer.byteLength(JSON.stringify(oversized.demand.identity)) < 8000);
  const second = await preview(oversized), rejected: ArrivalCommand = { requestId: randomUUID(), intent: second.intent, previewHash: second.previewHash };
  const counts = async () => (await x.pool.query(`SELECT (SELECT count(*) FROM material_arrival_plans)::int plans,
    (SELECT count(*) FROM material_arrival_plan_versions)::int versions,(SELECT count(*) FROM material_arrival_demands)::int demands`)).rows[0];
  const before = await counts(), outcome = await client.submit(rejected, current);
  assert.equal(outcome.status, "rejected"); if (outcome.status !== "rejected") assert.fail(); assert.equal(outcome.error.code, "material_arrival_projection_limit"); assert.equal(outcome.error.status, 422);
  assert.deepEqual(await counts(), before); assert.equal((await client.submit(rejected, current)).status, "rejected");
  const known = await client.receipt(rejected, current); assert.equal(known.state, "known"); if (known.state !== "known") assert.fail(); assert.equal(known.result.status, "rejected");
  assert.deepEqual(await counts(), before); assert.equal((await client.history(x.orderId, valid.demand.canonicalKey, 0, 1, current)).history[0].snapshot.version, 1);
  assert.deepEqual(x.errors, []); t.diagnostic(`1200 colors: source read/preview accepted; existing PostgreSQL ${oversizedBytes} byte identity rejected with original known422 receipt and no business writes`);
});

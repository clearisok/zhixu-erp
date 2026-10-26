import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import type { SourceBundle } from "../ainuoke-source/contract.js";
import { captureSource } from "../ainuoke-source/service.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { parseLogisticsResourceCommand } from "../production-resources/logistics-contract.js";
import { executeProductionResourceCommand } from "../production-resources/service.js";
import { executeOrderTracking, previewOrderTracking } from "../production-scheduling/tracking-service.js";
import { readMaterialArrivals, materialArrivalRequestLock } from "../material-arrivals/service.js";
import type { ArrivalIntent } from "../material-arrivals/contract.js";
import { persistArrivalPlan, type ArrivalBasis } from "../material-arrivals/store.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { writeAttributionHeadInTransaction } from "../sales-orders/effective-attribution.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { collectFullNormalizationEvidence } from "../sales-orders/normalization-full-evidence.js";
import { parseAttributionProposal } from "../sales-orders/normalization-execution-model.js";
import { startContinuousFixture } from "./ainuoke-continuous-fixture.js";
import { freshMaterialBundle } from "./ainuoke-binding-fixture.js";

test("Server manual material arrivals: source evidence, stable demand, atomic commands and history", { timeout: 240000 }, async t => {
  const x = await startContinuousFixture(resolve("dist/client"), { materialArrivals: true }); t.after(() => x.close());
  const admin = await loadExistingBootstrapActor(x.pool, x.users[0]);
  const grants: PermissionKey[] = ["order.view", "ainuoke.view", "style_progress.read", "style_progress.edit"];
  async function user(name: string, permissions: PermissionKey[]) {
    const row = (await x.pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic-arrival',gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [name])).rows[0];
    await x.pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [name]); await x.pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, name]);
    for (const key of permissions) await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [name, key]);
    const response = await fetch(x.base + "/api/v1/auth/login", { method: "POST", headers: { Origin: x.base, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: name, password: "synthetic-arrival" }) }); assert.equal(response.status, 200);
    const actor: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, username: name, userName: "UNTRUSTED", permissions };
    return { actor, cookie: response.headers.get("set-cookie")!.split(";")[0], roleId: name };
  }
  const editor = await user("arrival.editor", grants), second = await user("arrival.second", grants), viewer = await user("arrival.viewer", grants.filter(key => key !== "style_progress.edit"));
  async function request(path: string, body?: unknown, cookie: string | null = editor.cookie, headers: Record<string, string> = {}) {
    const response = await fetch(x.base + "/api/v1/material-arrivals" + path, { method: body === undefined ? "GET" : "POST", headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { Origin: x.base, "Content-Type": "application/json", "X-Zhixu-Request": "1" }), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const text = await response.text(); return { status: response.status, body: JSON.parse(text), text };
  }
  const state = async () => { const r = await request("/orders/" + x.orderId); assert.equal(r.status, 200, r.text); return r.body; };
  async function capture(mutate?: (bundle: SourceBundle) => void) {
    return captureSource(x.pool, admin, { sourceKey: "synthetic-demo", accountFingerprint: "a".repeat(64), maxAgeMs: 600000, collect: async () => {
      const b = freshMaterialBundle(); mutate?.(b); for (const pages of Object.values(b.materials)) for (const page of pages) page.total = pages.reduce((n, p) => n + p.rows.length, 0); return b;
    } });
  }
  const targetRows = (bundle: SourceBundle) => Object.values(bundle.materials).flatMap(pages => pages.flatMap(page => page.rows)).filter(row => row.values.GoodsNo === "SYNTHETIC-MAT-ready");
  async function hub(name: string) {
    const result = await executeProductionResourceCommand(x.pool, admin, parseLogisticsResourceCommand({ action: "create", requestId: randomUUID(), kind: "hubs", resourceId: null, expectedVersion: 0, data: { name, enabled: true, remark: "合成" } }));
    assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail(); return result.resource.id;
  }
  async function setHub(id: string | null) {
    const current = (await x.pool.query("SELECT version FROM production_order_execution_trackings WHERE sales_order_id=$1", [x.orderId])).rows[0];
    const intent = { action: "set_order_tracking", orderId: x.orderId, expectedVersion: current?.version ?? 0, data: { supplyHubId: id, remark: "PRIVATE-PRODUCTION-REMARK" } };
    const preview = await previewOrderTracking(x.pool, admin, intent), result = await executeOrderTracking(x.pool, admin, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash }); assert.equal(result.status, "applied");
  }
  const warehouse = await hub("合成到仓计划原仓"), alternate = await hub("合成到仓计划新仓");
  const count = async (table: string) => (await x.pool.query("SELECT count(*)::int n FROM " + table)).rows[0].n;
  const demand = async () => (await state()).source.demands.find((row: { materialCode: string }) => row.materialCode === "SYNTHETIC-MAT-ready");
  const initialDemand = await demand(), key: string = initialDemand.canonicalKey, stableId: string = initialDemand.id;
  const currentPlan = async () => (await state()).plans.find((row: { plan: { canonicalKey: string } }) => row.plan.canonicalKey === key)?.plan ?? null;
  async function intent(batches?: ArrivalIntent["batches"]): Promise<ArrivalIntent> {
    const current = await currentPlan(); return { action: "replace_arrival_plan", orderId: x.orderId, canonicalKey: key, expectedVersion: current?.version ?? 0,
      batches: batches ?? [{ id: randomUUID(), expectedArrivalAtHubDate: "2027-01-11", allocations: [{ materialDemandId: stableId, quantity: "40" }] },
        { id: randomUUID(), expectedArrivalAtHubDate: "2027-01-15", allocations: [{ materialDemandId: stableId, quantity: "20" }] }] };
  }
  async function command(value: ArrivalIntent, cookie = editor.cookie) {
    const p = await request("/preview", value, cookie); assert.equal(p.status, 200, p.text); return { requestId: randomUUID(), intent: p.body.intent as ArrivalIntent, previewHash: p.body.previewHash as string };
  }
  async function save(value: ArrivalIntent, cookie = editor.cookie) {
    const c = await command(value, cookie), r = await request("/commands", c, cookie); assert.equal(r.status, 200, r.text); return { command: c, result: r.body };
  }
  async function waitForLock(fragment: string) {
    const until = Date.now() + 5000;
    while (Date.now() < until) { if ((await x.pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE $1 AND pid<>pg_backend_pid()", ["%" + fragment + "%"])).rows[0].n) return; await new Promise(done => setTimeout(done, 15)); }
    assert.fail("synthetic transaction did not reach the expected lock");
  }
  await t.test("GET and preview never register demands, seed batches, or use a default hub", async () => {
    const s = await state(); assert.equal(s.source.status, "ready"); assert.equal(s.tracking, null); assert.deepEqual(s.plans, []);
    assert.equal(await count("material_arrival_demands"), 0); assert.equal(await count("material_arrival_plans"), 0);
    assert.equal((await request("/preview", await intent())).body.error.code, "material_arrival_hub_missing");
    const empty = await save(await intent([])); assert.equal(empty.result.changed, false); assert.equal(empty.result.plan, null);
    assert.equal(await count("material_arrival_demands"), 0); assert.equal(await count("material_arrival_plans"), 0);
    await setHub(warehouse);
  });
  await t.test("HTTP auth, write permission, strict input and mutation boundaries are independent of production or money grants", async () => {
    assert.equal((await request("/orders/" + x.orderId, undefined, null)).status, 401);
    assert.equal((await request("/orders/" + x.orderId, undefined, viewer.cookie)).status, 200);
    assert.equal((await request("/preview", await intent(), viewer.cookie)).status, 403);
    assert.equal((await request("/preview", await intent(), editor.cookie, { Origin: "https://invalid.example" })).status, 403);
    assert.equal((await request("/preview", { ...await intent(), actor: admin.userId })).status, 400);
    assert.equal((await request("/orders/" + x.orderId + "?price=1")).status, 400);
    assert.equal((await request("/commands/" + randomUUID(), {})).status, 405);
  });
  await t.test("maximum structural command receives a durable domain rejection instead of overflowing the receipt store", async () => {
    const value = await intent(), foreign = randomUUID();
    value.batches = Array.from({ length: 100 }, () => ({ id: randomUUID(), expectedArrivalAtHubDate: "2027-01-11", allocations: [
      { materialDemandId: stableId, quantity: "9".repeat(128) }, { materialDemandId: foreign, quantity: "9".repeat(128) },
    ] }));
    const payload = { requestId: randomUUID(), intent: value, previewHash: "f".repeat(64) }, bytes = Buffer.byteLength(JSON.stringify(payload));
    assert.ok(bytes > 32768 && bytes < 60000);
    const first = await request("/commands", payload); assert.equal(first.status, 409, first.text); assert.equal(first.body.status, "rejected");
    const repeated = await request("/commands", payload); assert.equal(repeated.status, 409, repeated.text); assert.equal(repeated.body.replayed, true);
    const receipt = await request("/commands/" + payload.requestId); assert.equal(receipt.body.state, "known"); assert.equal(receipt.body.result.error.code, "material_arrival_demand_unmatched");
  });
  await t.test("source identities within compact JSON limits reject PostgreSQL expansion with a durable capacity receipt", async () => {
    try {
      const colors = Array.from({ length: 1200 }, (_, n) => n.toString(36).padStart(3, "0")).join(",");
      await capture(bundle => { for (const row of targetRows(bundle)) row.values.StyleColor = colors; });
      const large = await demand();
      assert.ok(Buffer.byteLength(JSON.stringify(large.identity)) < 8000);
      const pgBytes = (await x.pool.query<{ bytes: number }>("SELECT octet_length($1::jsonb::text) AS bytes", [large.identity])).rows[0].bytes;
      assert.ok(pgBytes > 8192); t.diagnostic(`synthetic identity compact=${Buffer.byteLength(JSON.stringify(large.identity))}, pg=${pgBytes}`);
      const c = await command(await intent([{ id: randomUUID(), expectedArrivalAtHubDate: "2027-01-11", allocations: [{ materialDemandId: large.id, quantity: "1" }] }]));
      const tables = ["material_arrival_demands", "material_arrival_plans", "material_arrival_plan_versions"];
      const before = await Promise.all(tables.map(count)), commands = await count("material_arrival_commands");
      const first = await request("/commands", c); assert.equal(first.status, 422, first.text);
      assert.equal(first.body.status, "rejected"); assert.equal(first.body.error.code, "material_arrival_projection_limit");
      assert.deepEqual(await Promise.all(tables.map(count)), before);
      assert.equal(await count("material_arrival_commands"), commands + 1);
      const replay = await request("/commands", c); assert.equal(replay.status, 422); assert.equal(replay.body.replayed, true);
      const receipt = await request("/commands/" + c.requestId); assert.equal(receipt.body.state, "known");
      assert.equal(receipt.body.result.error.code, "material_arrival_projection_limit");
      assert.equal(await count("material_arrival_commands"), commands + 1);
      await capture(bundle => { for (const row of targetRows(bundle)) row.values.StyleColor = Array.from({ length: 1000 }, (_, n) => n.toString(36).padStart(3, "0")).join(","); });
      const neighbor = await demand();
      const neighborBytes = (await x.pool.query<{ bytes: number }>("SELECT octet_length($1::jsonb::text) AS bytes", [neighbor.identity])).rows[0].bytes;
      assert.ok(neighborBytes > 7000 && neighborBytes <= 8192);
      const preview = await request("/preview", await intent([{ id: randomUUID(), expectedArrivalAtHubDate: "2027-01-11", allocations: [{ materialDemandId: neighbor.id, quantity: "1" }] }]));
      assert.equal(preview.status, 200, preview.text);
      const client = await x.pool.connect();
      try {
        await client.query("BEGIN");
        const plan = await persistArrivalPlan(client, admin, x.orderId, key, neighbor.canonicalIdentity, null,
          preview.body.after as ArrivalBasis, randomUUID(), "operation-" + randomUUID());
        assert.equal(plan.version, 1); assert.equal(plan.data.demands[0].id, neighbor.id);
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      } finally { await client.query("ROLLBACK"); client.release(); }
      assert.deepEqual(await Promise.all(tables.map(count)), before);
      assert.equal(await count("material_arrival_commands"), commands + 1);
      t.diagnostic(`synthetic neighboring identity pg=${neighborBytes}; persisted with valid deferred history then explicitly rolled back`);
    } finally { await capture(); }
  });
  let originalCommand: Awaited<ReturnType<typeof command>>;
  await t.test("partial batches are one atomic version with frozen hub/evidence, immutable history and business audit only", async () => {
    const protectedTables = ["sales_orders", "sales_order_source_links", "ainuoke_sales_order_contract_mirrors", "ainuoke_sales_order_color_mirrors", "production_schedule_assignments", "production_schedule_executions", "sales_order_commercial_versions"];
    const snapshot = () => Promise.all(protectedTables.map(async name => (await x.pool.query("SELECT to_jsonb(t)::text payload FROM " + name + " t ORDER BY payload")).rows));
    const before = await snapshot(), r = await save(await intent()); originalCommand = r.command;
    assert.equal(r.result.plan.version, 1); assert.equal(r.result.plan.data.batches.length, 2); assert.equal(r.result.plan.supplyHubId, warehouse);
    assert.equal(r.result.plan.data.demands[0].id, stableId); assert.equal(r.result.plan.data.demands[0].requiredQuantity, "100");
    assert.deepEqual(await snapshot(), before); assert.equal(await count("material_arrival_plan_versions"), 1);
    const repeated = await request("/commands", r.command); assert.equal(repeated.body.replayed, true); assert.deepEqual(repeated.body.plan, r.result.plan);
    const noop = await save(await intent(r.result.plan.data.batches)); assert.equal(noop.result.changed, false); assert.equal(noop.result.plan.version, 1);
    for (const text of [JSON.stringify(await state()), JSON.stringify(r.result), JSON.stringify((await x.pool.query("SELECT before_data,after_data,metadata FROM operation_logs WHERE entity_type='MaterialExpectedArrivalPlan'")).rows)])
      for (const forbidden of ["sourcePricing", "unitPrice", "cgprice", "protected-commercial-sentinel", "confirmedGarmentPrice", "password", "PRIVATE-PRODUCTION-REMARK"]) assert.equal(text.includes(forbidden), false, forbidden);
    const audit = (await x.pool.query("SELECT actor_name,action,after_data FROM operation_logs WHERE entity_type='MaterialExpectedArrivalPlan'")).rows[0];
    assert.equal(audit.actor_name, editor.actor.username); assert.equal(audit.action, "修改预计到仓计划"); assert.ok(audit.after_data.values.批次.includes("40个"));
  });
  await t.test("capacity is cumulative across batches, units and physical order/material boundaries cannot be forged", async () => {
    const tooMuch = await intent(); tooMuch.batches[0].allocations[0].quantity = "90";
    assert.equal((await request("/preview", tooMuch)).body.error.code, "material_arrival_overallocated");
    const another = (await state()).source.demands.find((row: { canonicalKey: string; eligibility: string }) => row.canonicalKey !== key && row.eligibility === "eligible");
    const mixed = await intent(); mixed.batches[0].allocations[0].materialDemandId = another.id;
    assert.equal((await request("/preview", mixed)).body.error.code, "material_arrival_demand_unmatched");
    const foreign = await intent(); foreign.batches[0].allocations[0].materialDemandId = randomUUID(); assert.equal((await request("/preview", foreign)).status, 409);
    await capture(b => { for (const row of targetRows(b)) row.values.TotalNum = "0.3"; });
    const tiny = await intent(); tiny.batches[0].allocations[0].quantity = "0.1"; tiny.batches[1].allocations[0].quantity = "0.2";
    const exact = await save(tiny); assert.equal(exact.result.plan.data.demands[0].requiredQuantity, "0.3");
    tiny.expectedVersion = exact.result.plan.version; tiny.batches[1].allocations[0].quantity = "0.2000000000000000001";
    assert.equal((await request("/preview", tiny)).body.error.code, "material_arrival_overallocated"); await capture();
  });
  await t.test("quantity changes retain stable identity and preserve manual values; decreases flag over-allocation without clipping", async () => {
    const old = await currentPlan(); await capture(b => { for (const row of targetRows(b)) row.values.TotalNum = 200; });
    assert.equal((await demand()).id, stableId); assert.notEqual((await demand()).sourceDemandId, initialDemand.sourceDemandId);
    assert.deepEqual((await currentPlan()).data, old.data);
    await capture(b => { for (const row of targetRows(b)) row.values.TotalNum = 0; });
    assert.ok((await state()).plans.find((row: { plan: { canonicalKey: string } }) => row.plan.canonicalKey === key).issues.includes("overallocated"));
    assert.deepEqual((await currentPlan()).data, old.data); await capture();
  });
  await t.test("unit changes, missing units, factory and ambiguous generations preserve plans and require explicit reconciliation", async () => {
    const previous = await currentPlan();
    await capture(b => { for (const row of targetRows(b)) row.values.QtyUnit = "条"; });
    let s = await state(); assert.ok(s.plans.find((r: { plan: { canonicalKey: string } }) => r.plan.canonicalKey === key).issues.includes("unit_changed"));
    // A unit change cannot reinterpret an existing numeric allocation by simply
    // resaving it. Clearing first is the explicit boundary for a fresh unit plan.
    assert.equal((await request("/preview", await intent(previous.data.batches))).body.error.code, "material_arrival_unit_changed");
    await save(await intent([]));
    const newUnit = await save(await intent(previous.data.batches)); assert.equal(newUnit.result.plan.data.demands[0].unit, "条");
    const history = await request(`/orders/${x.orderId}/materials/${key}/history`);
    assert.ok(history.body.history.some((row: { snapshot: { data: { demands: { unit: string }[] } } }) => row.snapshot.data.demands.some(d => d.unit === "个")));
    await save(await intent([])); await capture(); await save(await intent(previous.data.batches));
    const preserved = await currentPlan();
    for (const mutate of [
      (b: SourceBundle) => { for (const row of targetRows(b)) row.values.QtyUnit = null; },
      (b: SourceBundle) => { for (const row of targetRows(b)) row.values.SupplyType = "厂供"; },
      (b: SourceBundle) => { const page = Object.values(b.materials)[0][0], row = structuredClone(targetRows(b)[0]); row.sourceRowIdentity += "-split"; row.values.id = String(row.values.id) + "-split"; row.values.TotalNum = 150; page.rows.push(row); },
    ]) {
      await capture(mutate); s = await state(); assert.deepEqual((await currentPlan()).data, preserved.data);
      assert.ok(s.plans.find((r: { plan: { canonicalKey: string } }) => r.plan.canonicalKey === key).issues.includes("demand_unavailable"));
      assert.equal((await request("/preview", await intent(previous.data.batches))).status, 409);
    }
    await capture();
  });
  await t.test("new Source generation invalidates a preview but does not mutate the plan or original receipt", async () => {
    const plan = await currentPlan(), value = await command(await intent(plan.data.batches));
    await capture(b => { for (const row of targetRows(b)) row.values.cgdh = "SYNTHETIC-NEW-PO"; });
    const r = await request("/commands", value); assert.equal(r.status, 409, r.text); assert.equal(r.body.error.code, "material_arrival_preview_changed");
    assert.equal((await request("/commands", value)).body.replayed, true); assert.deepEqual(await currentPlan(), plan);
    assert.equal((await request("/commands/" + originalCommand.requestId)).body.result.plan.version, 1);
    assert.equal((await request("/commands", { ...value, previewHash: "f".repeat(64) })).body.error.code, "material_arrival_request_conflict");
  });
  await t.test("hub movement keeps old meaning until explicit resave; clearing a hub does not move arrival dates", async () => {
    const old = await currentPlan(), pending = await command(await intent(old.data.batches)); await setHub(alternate);
    assert.equal((await request("/commands", pending)).body.error.code, "material_arrival_preview_changed");
    assert.ok((await state()).plans.find((r: { plan: { canonicalKey: string } }) => r.plan.canonicalKey === key).issues.includes("hub_changed"));
    assert.equal((await currentPlan()).data.tracking.supplyHubId, warehouse);
    const r = await save(await intent(old.data.batches)); assert.equal(r.result.changed, true); assert.equal(r.result.plan.supplyHubId, alternate);
    await setHub(null); assert.equal((await request("/preview", await intent(old.data.batches))).body.error.code, "material_arrival_hub_missing");
    const cleared = await save(await intent([])); assert.equal(cleared.result.plan.data.batches.length, 0); assert.equal(cleared.result.plan.supplyHubId, null);
    await setHub(alternate); await save(await intent());
  });
  await t.test("a committed command with a dropped HTTP reply is recovered by its original UUID without another revision", async () => {
    const value = await command(await intent()), before = await count("material_arrival_plan_versions");
    let forwarded = 0, status = 0, failure: unknown = null;
    const proxy = createServer(async (_request, response) => {
      try { forwarded++; status = (await request("/commands", value)).status; } catch (error) { failure = error; } finally { response.destroy(); }
    });
    await new Promise<void>(done => proxy.listen(0, "127.0.0.1", done)); const address = proxy.address(); assert.ok(address && typeof address === "object");
    try {
      await assert.rejects(() => fetch(`http://127.0.0.1:${address.port}/drop-committed-reply`, { method: "POST", body: JSON.stringify(value), signal: AbortSignal.timeout(10000) }));
      assert.equal(forwarded, 1); assert.equal(status, 200); assert.equal(failure, null);
      const receipt = await request("/commands/" + value.requestId); assert.equal(receipt.body.state, "known"); assert.equal(receipt.body.result.status, "applied");
      assert.equal((await request("/commands", value)).body.replayed, true); assert.equal(await count("material_arrival_plan_versions"), before + 1);
    } finally { await new Promise<void>(done => proxy.close(() => done())); }
  });
  await t.test("two actors racing the same first material plan get one success and one durable conflict", async () => {
    const row = (await state()).source.demands.find((d: { canonicalKey: string; eligibility: string }) => d.canonicalKey !== key && d.eligibility === "eligible");
    const value: ArrivalIntent = { action: "replace_arrival_plan", orderId: x.orderId, canonicalKey: row.canonicalKey, expectedVersion: 0,
      batches: [{ id: randomUUID(), expectedArrivalAtHubDate: "2027-01-16", allocations: [{ materialDemandId: row.id, quantity: "1" }] }] };
    const a = await command(value), b = await command(value, second.cookie), replies = await Promise.all([request("/commands", a), request("/commands", b, second.cookie)]);
    assert.deepEqual(replies.map(row => row.status).sort(), [200, 409]);
    assert.equal((await x.pool.query("SELECT count(*)::int n FROM material_arrival_plans WHERE sales_order_id=$1 AND canonical_key=$2", [x.orderId, row.canonicalKey])).rows[0].n, 1);
    assert.equal((await request("/commands/" + a.requestId, undefined, second.cookie)).body.state, "unknown");
  });
  await t.test("source publisher and arrival writer share profile-before-order lock order and never mix generations", async () => {
    const value = await command(await intent()), blocker = await x.pool.connect(); let publishing: ReturnType<typeof capture> | undefined, saving: ReturnType<typeof request> | undefined;
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE", [x.orderId]);
      publishing = capture(b => { for (const row of targetRows(b)) row.values.cgdh = "SYNTHETIC-LOCK-ORDER"; });
      await waitForLock("FOR SHARE OF o,m,l"); saving = request("/commands", value); await waitForLock("SELECT source_key FROM ainuoke_source_profiles");
      await blocker.query("COMMIT"); await publishing; const result = await saving; assert.equal(result.status, 409, result.text); assert.equal(result.body.error.code, "material_arrival_preview_changed");
    } finally { await blocker.query("ROLLBACK"); blocker.release(); await Promise.allSettled([publishing, saving].filter(Boolean)); }
  });
  await t.test("revocation while waiting is fresh, and receipt pending/unknown never replays a write", async () => {
    const value = await command(await intent()), blocker = await x.pool.connect(); let saving: ReturnType<typeof request> | undefined;
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM app_roles WHERE id=$1 FOR UPDATE", [editor.roleId]);
      saving = request("/commands", value); await waitForLock("ORDER BY r.id FOR SHARE OF r");
      await blocker.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='style_progress.edit'", [editor.roleId]); await blocker.query("COMMIT");
      assert.equal((await saving).status, 403); assert.equal((await request("/commands/" + originalCommand.requestId)).status, 403);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); await Promise.allSettled([saving].filter(Boolean)); await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'style_progress.edit') ON CONFLICT DO NOTHING", [editor.roleId]); }
    const id = randomUUID(), lock = await x.pool.connect();
    try { await lock.query("BEGIN"); await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [materialArrivalRequestLock(editor.actor, id)]); assert.equal((await request("/commands/" + id)).body.state, "pending"); }
    finally { await lock.query("ROLLBACK"); lock.release(); }
    assert.equal((await request("/commands/" + id)).body.state, "unknown");
  });
  await t.test("failed source retains plans and known receipts, explicit clear never invents source-following batches", async () => {
    await x.pool.query("UPDATE ainuoke_source_profiles SET last_error_code='synthetic_source_error' WHERE source_key='synthetic-demo'");
    const s = await state(); assert.equal(s.source.status, "source_failed"); assert.ok(s.plans.some((r: { issues: string[] }) => r.issues.includes("source_unavailable")));
    assert.equal((await request("/commands/" + originalCommand.requestId)).body.state, "known");
    const none = await readMaterialArrivals(x.pool, editor.actor, x.orderId, null); assert.equal(none.source.status, "not_connected"); assert.ok(none.plans.length);
    const cleared = await save(await intent([])); assert.deepEqual(cleared.result.plan.data.batches, []); await capture(); await save(await intent());
  });
  await t.test("audit failure rolls back demand/head/history/command atomically and leaves an unknown receipt", async () => {
    const value = await command(await intent()), tables = ["material_arrival_demands", "material_arrival_plans", "material_arrival_plan_versions", "material_arrival_commands", "material_arrival_command_orders"], before = await Promise.all(tables.map(count));
    await x.pool.query("CREATE FUNCTION synthetic_arrival_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='MaterialExpectedArrivalPlan' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await x.pool.query("CREATE TRIGGER synthetic_arrival_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_arrival_audit_failure()");
    try { assert.equal((await request("/commands", value)).status, 500); assert.deepEqual(await Promise.all(tables.map(count)), before); assert.equal((await request("/commands/" + value.requestId)).body.state, "unknown"); }
    finally { await x.pool.query("DROP TRIGGER synthetic_arrival_audit_failure ON operation_logs"); await x.pool.query("DROP FUNCTION synthetic_arrival_audit_failure()"); }
  });
  await t.test("history paging is anchored and every new reference contributes its full immutable fingerprint", async () => {
    for (let i = 0; i < 28; i++) { const value = await intent(); value.batches[0].expectedArrivalAtHubDate = "2027-02-" + String(i + 1).padStart(2, "0"); await save(value); }
    const first = await request(`/orders/${x.orderId}/materials/${key}/history`); assert.equal(first.status, 200, first.text); assert.equal(first.body.history.length, 25); assert.equal(first.body.hasMore, true);
    const anchor = first.body.asOfVersion; await save(await intent());
    const secondPage = await request(`/orders/${x.orderId}/materials/${key}/history?offset=25&asOfVersion=${anchor}`);
    assert.equal(secondPage.status, 200); assert.ok(secondPage.body.history.length); assert.ok(secondPage.body.history.every((v: { version: number }) => v.version <= anchor - 25));
    const alias = (await createSalesOrder(x.pool, { creationSource: "manual" })).id, pair = [x.orderId, alias].sort(), client = await x.pool.connect();
    try {
      const refs = await normalizationReferences(client); for (const table of ["material_arrival_demands", "material_arrival_plans", "material_arrival_plan_versions", "material_arrival_command_orders"]) assert.ok(refs.some(([name]) => name === table));
      const caseId = (await client.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, admin.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
      await client.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic','{}')", [caseId, admin.internalUserId, randomUUID(), "b".repeat(64)]);
      const proposal = parseAttributionProposal({ changeType: "normalize", caseVersion: 1, assignments: pair.map(id => ({ originalOrderId: id, effectiveOrderId: x.orderId })), reason: "Synthetic", recoveryPlanHash: "c".repeat(64) });
      const inventory = await collectFullNormalizationEvidence(client, caseId, proposal, { coverage: "unavailable", reason: "not-connected" });
      assert.deepEqual(inventory.unknownReferences, []); assert.ok(inventory.blockers.includes("production_finance_coverage_unavailable"));
      assert.ok(inventory.references.find(row => row.orderId === x.orderId && row.relation === "material_arrival_commands")!.count > 0);
      await client.query("ALTER TABLE material_arrival_plan_versions RENAME TO synthetic_hidden_arrival_history");
      try { await assert.rejects(() => normalizationReferences(client), { code: "material_arrival_reference_schema_incomplete" }); assert.equal((await request("/orders/" + x.orderId)).status, 503); }
      finally { await client.query("ALTER TABLE synthetic_hidden_arrival_history RENAME TO material_arrival_plan_versions"); }
    } finally { client.release(); }
  });
  await t.test("SQL protects immutable identity, exact capacity, per-event history and frozen orders", async () => {
    const plan = await currentPlan();
    for (const table of ["material_arrival_demands", "material_arrival_plans", "material_arrival_plan_versions", "material_arrival_commands", "material_arrival_command_orders"])
      await assert.rejects(() => x.pool.query("DELETE FROM " + table), { code: "23514" });
    await assert.rejects(() => x.pool.query("UPDATE material_arrival_plans SET version=version+2 WHERE id=$1", [plan.id]), { code: "23514" });
    const forged = structuredClone(plan.data); forged.batches[0].allocations[0].quantity = "999999999999999999999.99";
    await assert.rejects(() => x.pool.query("UPDATE material_arrival_plans SET version=version+1,data=$2 WHERE id=$1", [plan.id, forged]), { code: "23514" });
    const noHistory = await x.pool.connect();
    try { await noHistory.query("BEGIN"); const next = structuredClone(plan.data); next.batches[0].expectedArrivalAtHubDate = "2027-03-01";
      await noHistory.query("UPDATE material_arrival_plans SET version=version+1,data=$2 WHERE id=$1", [plan.id, next]); await assert.rejects(() => noHistory.query("COMMIT"), { code: "23514" }); }
    finally { await noHistory.query("ROLLBACK"); noHistory.release(); }
    const pending = await command(await intent()); await x.pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1", [x.orderId]);
    assert.equal((await state()).canEdit, false); assert.equal((await request("/commands", pending)).body.error.code, "material_arrival_order_read_only");
    assert.equal((await request("/commands/" + originalCommand.requestId)).body.state, "known");
    await assert.rejects(() => x.pool.query("UPDATE material_arrival_plans SET version=version+1,data=data||'{\"invalid\":1}' WHERE id=$1", [plan.id]), { code: "23514" });
  });
  await t.test("effective attribution changes keep physical plans/history in place and reject a pre-change intent", async () => {
    const plan = await currentPlan(), oldIntent: ArrivalIntent = { action: "replace_arrival_plan", orderId: x.orderId, canonicalKey: key, expectedVersion: plan.version, batches: plan.data.batches };
    const effective = (await createSalesOrder(x.pool, { creationSource: "manual" })).id, pair = [x.orderId, effective].sort(), client = await x.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
      const caseId = (await client.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, admin.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
      await client.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic','{}')", [caseId, admin.internalUserId, randomUUID(), "b".repeat(64)]);
      const change = (await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic only') RETURNING id", [caseId, admin.internalUserId, randomUUID(), "d".repeat(64)])).rows[0].id;
      for (const id of pair) await client.query("INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_version) VALUES($1,$2,$3,0)", [change, id, effective]);
      for (const id of pair) await writeAttributionHeadInTransaction(client, change, id); await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    const old = await state(); assert.equal(old.order.identity.effectiveOrderId, effective); assert.equal(old.canEdit, false); assert.deepEqual(await currentPlan(), plan);
    assert.deepEqual((await request("/orders/" + effective)).body.plans, []);
    const rejected = await request("/commands", { requestId: randomUUID(), intent: oldIntent, previewHash: "f".repeat(64) });
    assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, "historical_duplicate_order_read_only");
    await assert.rejects(() => x.pool.query("UPDATE material_arrival_plans SET version=version+1,data=data||'{\"invalid\":1}' WHERE id=$1", [plan.id]), { code: "23514" });
    assert.equal((await request("/commands/" + originalCommand.requestId)).body.state, "known");
  });
  assert.ok(x.errors.every(row => !JSON.stringify(row).includes("protected-commercial-sentinel")));
});

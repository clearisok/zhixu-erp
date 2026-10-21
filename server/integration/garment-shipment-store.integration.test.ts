import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg, { type Pool, type PoolClient } from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import type { TrustedIdentity } from "../auth/session.js";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { createSalesOrder, replaceCurrentAinuokeColorSlice } from "../sales-orders/repository.js";
import { writeAttributionHeadInTransaction } from "../sales-orders/effective-attribution.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { collectFullNormalizationEvidence } from "../sales-orders/normalization-full-evidence.js";
import { parseAttributionProposal } from "../sales-orders/normalization-execution-model.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";
import { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } from "../sales-orders/processing-batch-service.js";
import { createApp } from "../app.js";
import { hash } from "../ainuoke-source/contract.js";
import { createGarmentShipmentReader, garmentShipmentReadConfig, prepareGarmentPublication, publishGarmentObservation, type GarmentPublicationContext } from "../ainuoke-source/garment-shipment-store.js";

const sourceKey = "synthetic-garment", fingerprint = "a".repeat(64), grants: PermissionKey[] = ["order.view", "ainuoke.view", "ainuoke.sync"];
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
function sample(context: GarmentPublicationContext, total = 127, offset = 0) {
  const page = (pass: number, n: number) => ({ schemaVersion: "ainuoke-garment-shipment-page.v1", reportId: "6086979", sourceFingerprint: context.sourceFingerprint,
    queryContext: { match: "exact", salesContractNo: context.salesContractNo }, page: n, pageSize: 100, reportedTotal: total,
    capturedAt: new Date(context.preparedAt + pass * 1000 + n + offset).toISOString(), rawResponseSha256: hash([context.preparedAt, pass, n, offset]),
    rows: Array.from({ length: Math.min(100, total - (n - 1) * 100) }, (_, i): Record<string, string | null> => ({
      id: "SYN-ROW-" + ((n - 1) * 100 + i), ExpContractNo: context.salesContractNo, billno: "SYN-OUT-1", CnColor: i % 2 ? "红色" : "蓝色", QtyUnit: "件",
      Num: "9007199254740993.000000000001", outdate: "2026-10-11", FDate: "2026-10-07", indate: "2026-10-07", styleNum: "100", ycyNum: "10", UsableNum: "90",
      wxprice: "PRICE-SENTINEL-987654321", remark: "NOTES-SENTINEL-123456789" })) });
  return { scope: { sourceFingerprint: context.sourceFingerprint, salesContractNo: context.salesContractNo },
    input: { schemaVersion: "ainuoke-garment-shipment-input.v1", firstPass: Array.from({ length: Math.max(1, Math.ceil(total / 100)) }, (_, i) => page(1, i + 1)),
      secondPass: Array.from({ length: Math.max(1, Math.ceil(total / 100)) }, (_, i) => page(2, i + 1)) } };
}

test("garment read switch is independent, explicit and session-only", () => {
  assert.equal(garmentShipmentReadConfig({}, "session"), null);
  assert.equal(garmentShipmentReadConfig({ ZHIXU_AINUOKE_SOURCE_READ: "snapshot", ZHIXU_AINUOKE_SOURCE_KEY: sourceKey }, "session"), null);
  assert.deepEqual(garmentShipmentReadConfig({ ZHIXU_AINUOKE_GARMENT_SHIPMENT_READ: "snapshot", ZHIXU_AINUOKE_SOURCE_KEY: sourceKey }, "session"), { sourceKey });
  for (const values of [{ ZHIXU_AINUOKE_GARMENT_SHIPMENT_READ: "live", ZHIXU_AINUOKE_SOURCE_KEY: sourceKey },
    { ZHIXU_AINUOKE_GARMENT_SHIPMENT_READ: "snapshot", ZHIXU_AINUOKE_SOURCE_KEY: "bad / scope" }])
    assert.throws(() => garmentShipmentReadConfig(values, "session"), code("invalid_garment_source_configuration"));
  assert.throws(() => garmentShipmentReadConfig({ ZHIXU_AINUOKE_GARMENT_SHIPMENT_READ: "snapshot", ZHIXU_AINUOKE_SOURCE_KEY: sourceKey }, "local-single-user"));
});

test("garment observation ownership, immutable SQL, trusted HTTP, CAS and current authorization", { timeout: 240000 }, async t => {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase("garment_observations"), max: 15 });
  const servers: ReturnType<typeof createServer>[] = [], logged: Record<string, unknown>[] = [];
  t.after(async () => { for (const server of servers) await new Promise<void>(done => server.close(() => done())); try { await pool.end(); } finally { await db.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool, { username: "shipment.admin", displayName: "合成出货管理员", password: "synthetic-shipment" });
  const admin = await loadExistingBootstrapActor(pool, "shipment.admin");
  let clock = Date.now(), orderNumber = 0;
  const reader = createGarmentShipmentReader(pool, { sourceKey }, () => clock);
  async function start(connected = true, local = false) {
    const server = createServer(createApp({ pool, allowedOrigins: ["http://shipment.invalid"], security: { secureCookies: false, sessionTtlSeconds: 3600 },
      logger: { error: event => logged.push(event) }, ...(connected ? { orderGarmentShipmentRead: reader } : {}),
      ...(local ? { identityAuthority: { mode: "local-single-user" as const, verify: async () => undefined, resolve: async () => { throw Error("must not resolve local"); } } } : {}) }));
    servers.push(server); await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address === "object");
    return `http://127.0.0.1:${address.port}`;
  }
  const base = await start(), disconnected = await start(false), local = await start(true, true);
  async function user(name: string, permissions: PermissionKey[]) {
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic',gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [name])).rows[0];
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [name]); await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, name]);
    for (const key of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [name, key]);
    const login = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: "http://shipment.invalid", "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: name, password: "synthetic" }) }); assert.equal(login.status, 200);
    return { actor: { internalUserId: row.id, userId: row.public_id, username: name, userName: "UNTRUSTED", permissions: [] } as TrustedIdentity,
      roleId: name, cookie: login.headers.get("set-cookie")!.split(";")[0] };
  }
  const editor = await user("shipment.editor", grants), viewer = await user("shipment.viewer", grants.filter(key => key !== "ainuoke.sync")), denied = await user("shipment.denied", ["order.view"]);
  async function contract() {
    const n = ++orderNumber;
    return (await createAinuokeSalesOrder(pool, admin, { source: { sourceId: "SYN-SHIP-" + n, sourceRowIdentity: "SYN-SHIP-" + n, salesContractNo: "SYN-SC-" + n,
      insideOrderNo: "SYN-FACTORY-" + n, lifecycleStatusRaw: "生效", contractDate: "2026-10-01", contractDeliveryDate: "2026-11-01", styleNo: "SYN-STYLE",
      companyNameSnapshot: "合成公司", customerNameSnapshot: "合成客户", brandNameSnapshot: "合成品牌", quantity: 100, sourceHash: hash(n), fetchedAt: new Date(clock).toISOString() },
      colors: [{ sourceLineIdentity: "SYN-BLUE-" + n, colorName: "蓝色", quantity: 60, deliveryDate: "2026-11-01", sourceHash: hash([n, "blue"]) },
        { sourceLineIdentity: "SYN-RED-" + n, colorName: "红色", quantity: 40, deliveryDate: "2026-11-01", sourceHash: hash([n, "red"]) }] })).salesOrder.id;
  }
  const orderId = await contract(), path = `/api/v1/sales-orders/${orderId}/garment-shipments`;
  const http = (suffix = "", cookie: string | null = viewer.cookie, method = "GET", endpoint = base) => fetch(endpoint + path + suffix, { method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === "GET" ? {} : { Origin: "http://shipment.invalid", "X-Zhixu-Request": "1", "Content-Type": "application/json" }) }, ...(method === "GET" ? {} : { body: "{}" }) });
  async function target(id = orderId, enabled = true) {
    await pool.query("INSERT INTO ainuoke_garment_shipment_targets(source_key,sales_order_id,account_fingerprint,freshness_ms,enabled,verification_sha256) VALUES($1,$2,$3,60000,$4,$5)", [sourceKey, id, fingerprint, enabled, enabled ? hash("synthetic-filter-proof") : null]);
  }
  const prepare = (id = orderId, actor = editor.actor) => prepareGarmentPublication(pool, actor, sourceKey, id, clock);
  async function publish(context: GarmentPublicationContext, total = 127, offset = 0, actor = editor.actor) {
    const data = sample(context, total, offset); clock = Math.max(clock, context.preparedAt + 5000 + offset);
    return publishGarmentObservation(pool, actor, context, data.input, data.scope, clock);
  }
  const count = async (table: string) => (await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n as number;
  async function current() {
    const value = await reader.read(viewer.actor, orderId); if (!("publicationId" in value)) assert.fail("expected observed snapshot"); return value;
  }
  async function waitForLock(fragment: string) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if ((await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock' AND query LIKE $1", ["%" + fragment + "%"])).rows[0].n) return;
      await new Promise(done => setTimeout(done, 15));
    }
    assert.fail("publication did not wait at the expected lock");
  }

  await t.test("default disabled, trusted session, no selectors/writer/fallback and fresh domain permission", async () => {
    assert.equal((await http("", null)).status, 401); assert.equal((await http("", viewer.cookie, "GET", disconnected)).status, 503);
    assert.equal((await http("", null, "GET", local)).status, 503); assert.equal((await http("?contract=SYN-SC-1")).status, 400);
    assert.equal((await http("", viewer.cookie, "POST")).status, 405); assert.equal((await http("", denied.cookie)).status, 403);
    assert.equal((await http("/history?beforeGeneration=bad")).status, 400); assert.equal((await http("/history?beforeGeneration=1&beforeGeneration=2")).status, 400);
    assert.equal((await reader.read(viewer.actor, orderId)).sourceStatus, "not_connected");
    await assert.rejects(prepare, code("garment_source_not_connected")); await assert.rejects(() => prepare(orderId, viewer.actor), { status: 403 });
    await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)", [sourceKey, fingerprint]); await target(orderId, false);
    assert.equal((await reader.read(viewer.actor, orderId)).sourceStatus, "not_connected");
    await pool.query("UPDATE ainuoke_garment_shipment_targets SET enabled=true,verification_sha256=$2,version=version+1 WHERE source_key=$1", [sourceKey, hash("synthetic-filter-proof")]);
    assert.equal((await reader.read(viewer.actor, orderId)).sourceStatus, "not_captured");
  });

  let first!: Awaited<ReturnType<typeof publish>>;
  await t.test("lossless 2-page snapshot, stable per-color mapping, restart, no amounts or source notes in DTO/audit", async () => {
    const context = await prepare(); first = await publish(context);
    assert.equal(first.generation, 1); assert.equal(first.alreadyPublished, false); assert.deepEqual(await publish(context), { ...first, alreadyPublished: true });
    const value = await current(); assert.equal(value.schemaVersion, "order-garment-shipments.v1"); assert.equal(value.rows.length, 127);
    assert.deepEqual(value.rows[0].quantity, { state: "known", raw: "9007199254740993.000000000001", value: "9007199254740993.000000000001" });
    assert.equal(value.rows[0].colorMatch.state, "matched"); assert.deepEqual(value.rows[0].businessDate, { state: "known", raw: "2026-10-11", value: "2026-10-11" });
    const restarted = createGarmentShipmentReader(pool, { sourceKey }, () => clock); assert.deepEqual(await restarted.read(viewer.actor, orderId), value);
    const response = await http(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const serialized = JSON.stringify({ dto: await response.json(), audit: (await pool.query("SELECT to_jsonb(l) FROM operation_logs l WHERE entity_id=$1", [first.publicationId])).rows });
    assert.equal(/SENTINEL|wxprice|NOTES-SENTINEL/.test(serialized), false);
    assert.equal(await count("ainuoke_garment_shipment_color_matches"), 127);
  });

  await t.test("freshness is labelled history, quantities do not re-map colors, rename and ambiguity stay explicit", async () => {
    const old = await current(), oldId = old.rows[0].colorMatch.state === "matched" ? old.rows[0].colorMatch.orderColorId : assert.fail();
    clock += 70000; const stale = await current(); assert.equal(stale.freshness, "stale"); assert.deepEqual(stale.rows, old.rows);
    await replaceCurrentAinuokeColorSlice(pool, orderId, [{ sourceLineIdentity: "SYN-QTY-CHANGED", colorName: "蓝色", quantity: 999, deliveryDate: null, sourceHash: hash("qty") },
      { sourceLineIdentity: "SYN-RED-QTY", colorName: "红色", quantity: 40, deliveryDate: null, sourceHash: hash("red") }]);
    assert.equal((await current()).colorBasisChanged, false); assert.deepEqual((await current()).rows[0].colorMatch, old.rows[0].colorMatch);
    const context = await prepare(); await replaceCurrentAinuokeColorSlice(pool, orderId, [{ sourceLineIdentity: "SYN-RENAMED", colorName: "海蓝色", quantity: 999, deliveryDate: null, sourceHash: hash("rename") }]);
    await assert.rejects(() => publish(context), code("garment_binding_changed")); assert.equal((await current()).colorBasisChanged, true);
    await publish(await prepare(), 1); assert.equal((await current()).rows[0].colorMatch.state, "unmatched");
    await replaceCurrentAinuokeColorSlice(pool, orderId, [{ sourceLineIdentity: "SYN-DUP-1", colorName: "蓝色", quantity: 1, deliveryDate: null, sourceHash: "1" },
      { sourceLineIdentity: "SYN-DUP-2", colorName: "蓝色", quantity: 2, deliveryDate: null, sourceHash: "2" }]);
    await publish(await prepare(), 1); assert.equal((await current()).rows[0].colorMatch.state, "ambiguous");
    const history = await reader.read(viewer.actor, orderId, first.publicationId); assert.ok("publicationId" in history);
    assert.equal(history.rows[0].colorMatch.state === "matched" && history.rows[0].colorMatch.orderColorId, oldId);
  });

  await t.test("head CAS serializes two operators; retry never duplicates, empty does not erase prior observations", async () => {
    const context = await prepare(), data = sample(context, 1); clock += 5000;
    const results = await Promise.all([publishGarmentObservation(pool, editor.actor, context, data.input, data.scope, clock), publishGarmentObservation(pool, admin, context, data.input, data.scope, clock)]);
    assert.equal(results[0].publicationId, results[1].publicationId); assert.equal(results.filter(row => !row.alreadyPublished).length, 1);
    const stale = await prepare(); await publish(stale, 2);
    await assert.rejects(() => publish(stale, 3, 1), code("garment_generation_conflict"));
    await publish(await prepare(), 0); const empty = await current(); assert.equal(empty.sourceStatus, "observed_empty"); assert.equal(empty.disappearanceMeaning, "unknown_not_cancellation");
    const history = await reader.history(viewer.actor, orderId); assert.ok(history.records.length >= 6);
    assert.ok(history.records.some(record => record.publicationId === first.publicationId));
    assert.equal((await reader.read(viewer.actor, orderId, first.publicationId)).rows.length, 127);
  });

  await t.test("zero, negative, invalid, unknown quantities and dates keep separate evidence without partial totals", async () => {
    const context = await prepare(), data = sample(context, 5);
    for (const pass of [data.input.firstPass, data.input.secondPass]) {
      pass[0].rows[0].Num = "0"; pass[0].rows[1].Num = "-12.5"; pass[0].rows[2].Num = null;
      pass[0].rows[3].Num = "not-a-number"; pass[0].rows[4].QtyUnit = "千克";
      pass[0].rows[2].outdate = ""; pass[0].rows[3].outdate = "2026-02-30"; pass[0].rows[4].CnColor = null;
    }
    clock += 5000; await publishGarmentObservation(pool, editor.actor, context, data.input, data.scope, clock);
    const value = await current(); assert.deepEqual(value.rows.map(row => row.quantity.state), ["known", "known", "unknown", "invalid", "known"]);
    assert.equal(value.rows[1].quantity.state === "known" && value.rows[1].quantity.value, "-12.5");
    assert.equal(value.rows[2].businessDate.state, "unknown"); assert.equal(value.rows[3].businessDate.state, "invalid");
    assert.equal(value.rows[4].colorMatch.state, "missing_source_color"); assert.equal(value.aggregation, "none_observations_not_event_ledger");
  });

  await t.test("SQL history/ownership/generation guards and audit failure preserve the complete prior state", async () => {
    for (const statement of ["UPDATE ainuoke_garment_shipment_snapshots SET generation=generation", "DELETE FROM ainuoke_garment_shipment_snapshots",
      "UPDATE ainuoke_garment_shipment_color_matches SET match_state=match_state", "DELETE FROM ainuoke_garment_shipment_color_matches",
      "DELETE FROM ainuoke_garment_shipment_heads", "UPDATE ainuoke_garment_shipment_heads SET generation=generation+2", "DELETE FROM ainuoke_garment_shipment_targets"])
      await assert.rejects(() => pool.query(statement), (error: unknown) => (error as { code: string }).code === "23514");
    const before = await count("ainuoke_garment_shipment_snapshots"), head = await current(), context = await prepare();
    await pool.query("CREATE FUNCTION synthetic_reject_shipment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'sourceReportId'='6086979' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await pool.query("CREATE TRIGGER synthetic_shipment_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_reject_shipment_audit()");
    try { await assert.rejects(() => publish(context), /synthetic audit failure/); } finally { await pool.query("DROP TRIGGER synthetic_shipment_audit ON operation_logs"); await pool.query("DROP FUNCTION synthetic_reject_shipment_audit()"); }
    assert.equal(await count("ainuoke_garment_shipment_snapshots"), before); assert.equal((await current()).publicationId, head.publicationId);
  });
  await t.test("COMMIT acknowledgement loss can be resolved by the original capture without another snapshot", async () => {
    const context = await prepare(), data = sample(context, 1); clock += 5000;
    const dropped = { connect: async () => {
      const client = await pool.connect(), query = client.query.bind(client);
      return { query: async (text: string, values?: unknown[]) => { const result = await query(text, values); if (text === "COMMIT") throw Error("synthetic commit acknowledgement lost"); return result; }, release: () => client.release() } as unknown as PoolClient;
    } } as unknown as Pool;
    await assert.rejects(() => publishGarmentObservation(dropped, editor.actor, context, data.input, data.scope, clock), /acknowledgement lost/);
    const before = await count("ainuoke_garment_shipment_snapshots"), resolved = await publishGarmentObservation(pool, editor.actor, context, data.input, data.scope, clock);
    assert.equal(resolved.alreadyPublished, true); assert.equal(await count("ainuoke_garment_shipment_snapshots"), before);
    assert.equal((await current()).publicationId, resolved.publicationId);
  });

  await t.test("late original receipts survive capture expiry and later heads; expired new captures cannot publish", async () => {
    const context = await prepare(), data = sample(context, 1); clock += 5000;
    const original = await publishGarmentObservation(pool, editor.actor, context, data.input, data.scope, clock);
    clock += 190000; await publish(await prepare(), 2);
    const before = await count("ainuoke_garment_shipment_snapshots"), head = await current();
    assert.deepEqual(await publishGarmentObservation(pool, editor.actor, context, data.input, data.scope, clock), { ...original, alreadyPublished: true });
    assert.equal(await count("ainuoke_garment_shipment_snapshots"), before); assert.equal((await current()).publicationId, head.publicationId);
    await assert.rejects(() => publishGarmentObservation(pool, editor.actor, { ...context, generation: context.generation + 1 }, data.input, data.scope, clock), code("garment_capture_retry_conflict"));
    const expired = await prepare(), notPublished = sample(expired, 1); clock += 190000;
    await assert.rejects(() => publishGarmentObservation(pool, editor.actor, expired, notPublished.input, notPublished.scope, clock), code("garment_capture_expired"));
    assert.equal(await count("ainuoke_garment_shipment_snapshots"), before);
  });

  await t.test("history pagination and detail preserve 25-row boundaries and prevent cross-order access", async () => {
    for (let index = 0; index < 26; index++) await publish(await prepare(), 1);
    const firstPage = await reader.history(viewer.actor, orderId); assert.equal(firstPage.records.length, 25); assert.ok(firstPage.nextBeforeGeneration);
    const secondPage = await reader.history(viewer.actor, orderId, firstPage.nextBeforeGeneration!); assert.ok(secondPage.records.length > 0);
    assert.equal(secondPage.records.some(row => firstPage.records.some(firstRow => row.publicationId === firstRow.publicationId)), false);
    const response = await http("/history?beforeGeneration=" + firstPage.nextBeforeGeneration); assert.equal(response.status, 200);
    const other = await contract(); await target(other);
    await assert.rejects(() => reader.read(viewer.actor, other, first.publicationId), code("garment_observation_not_found"));
    await assert.rejects(() => reader.read(viewer.actor, orderId, "not-a-uuid"), code("invalid_garment_source_request"));
    assert.equal((await http("/history?limit=100")).status, 400);
  });

  await t.test("frozen color references cannot be injected from a different physical order", async () => {
    const owner = await contract(), other = await contract(); await target(owner); await target(other);
    const ownReceipt = await publish(await prepare(owner), 1), otherReceipt = await publish(await prepare(other), 1);
    const row = (await pool.query("SELECT * FROM ainuoke_garment_shipment_snapshots WHERE id=$1", [ownReceipt.publicationId])).rows[0];
    const foreign = (await pool.query("SELECT order_color_id::text id FROM ainuoke_garment_shipment_color_matches WHERE snapshot_id=$1", [otherReceipt.publicationId])).rows[0].id;
    const id = randomUUID(), snapshotId = hash(["synthetic-invalid-color", id]), payload = structuredClone(row.payload);
    payload.snapshotId = snapshotId; payload.rows[0].colorMatch.orderColorId = foreign;
    const cloned: Record<string, unknown> = { ...row, id, snapshot_id: snapshotId, generation: row.generation + 1,
      publication_context: { ...row.publication_context, generation: row.generation }, payload };
    delete cloned.created_at;
    const jsonColumns = new Set(["input", "scope", "publication_context", "color_basis", "payload"]), names = Object.keys(cloned);
    const client = await pool.connect(); await client.query("BEGIN");
    try {
      await client.query(`INSERT INTO ainuoke_garment_shipment_snapshots(${names.join(",")}) VALUES(${names.map((_, i) => "$" + (i + 1)).join(",")})`, names.map(name => jsonColumns.has(name) ? JSON.stringify(cloned[name]) : cloned[name]));
      await assert.rejects(() => client.query("INSERT INTO ainuoke_garment_shipment_color_matches(snapshot_id,sales_order_id,source_record_id,match_state,order_color_id) VALUES($1,$2,$3,'matched',$4)",
        [id, owner, payload.rows[0].sourceRecordId, foreign]), (error: unknown) => (error as { code?: string }).code === "23503");
    } finally { await client.query("ROLLBACK"); client.release(); }
    assert.equal((await pool.query("SELECT count(*)::int n FROM ainuoke_garment_shipment_snapshots WHERE id=$1", [id])).rows[0].n, 0);
  });

  await t.test("large legal captures use summary-only history, and expanded storage over budget rejects atomically", async () => {
    const id = await contract(); await target(id); const context = await prepare(id), data = sample(context, 1000);
    for (const pass of [data.input.firstPass, data.input.secondPass]) for (const page of pass) for (const row of page.rows) {
      row.remark = "R".repeat(2048); row.wxprice = "W".repeat(2048);
    }
    clock += 5000; await publishGarmentObservation(pool, editor.actor, context, data.input, data.scope, clock);
    const statements: string[] = [], tracedPool = { connect: async () => {
      const client = await pool.connect(), query = client.query.bind(client);
      return { query: (text: string, values?: unknown[]) => { statements.push(text); return query(text, values); }, release: () => client.release() } as unknown as PoolClient;
    } } as unknown as Pool;
    const history = await createGarmentShipmentReader(tracedPool, { sourceKey }, () => clock).history(viewer.actor, id);
    assert.equal(history.records[0].rowCount, 1000); assert.equal(JSON.stringify(history).includes("WWWW"), false);
    const summary = statements.find(text => text.includes("ORDER BY generation DESC LIMIT 26")); assert.ok(summary);
    assert.equal(/s\.(?:input|payload|color_basis)(?:\s|,)/.test(summary), false); assert.ok(summary.includes("s.row_count"));
    const tooLarge = await prepare(id), oversized = sample(tooLarge, 2000);
    for (const pass of [oversized.input.firstPass, oversized.input.secondPass]) for (const page of pass) for (const row of page.rows) {
      for (const key of Object.keys(row)) if (!["id", "ExpContractNo"].includes(key)) delete row[key];
      row.Num = "N".repeat(1900); row.outdate = "D".repeat(1900);
    }
    assert.ok(Buffer.byteLength(JSON.stringify(oversized.input)) < 16777216);
    const before = await count("ainuoke_garment_shipment_snapshots"); clock += 5000;
    await assert.rejects(() => publishGarmentObservation(pool, editor.actor, tooLarge, oversized.input, oversized.scope, clock), { status: 422, code: "garment_observation_storage_limit" });
    assert.equal(await count("ainuoke_garment_shipment_snapshots"), before);
    assert.equal((await reader.history(viewer.actor, id)).records.length, 1);
  });

  await t.test("publication waiting on role or user cannot use revoked grants or a disabled identity", async () => {
    const subject = await user("shipment.revoked", grants), context = await prepare(), data = sample(context, 1); clock += 5000;
    const blocker = await pool.connect(); await blocker.query("BEGIN"); await blocker.query("SELECT id FROM app_roles WHERE id=$1 FOR UPDATE", [subject.roleId]);
    const result = publishGarmentObservation(pool, subject.actor, context, data.input, data.scope, clock);
    const rejected = assert.rejects(result, { status: 403 });
    try { await waitForLock("SELECT r.id FROM app_roles"); await blocker.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='ainuoke.sync'", [subject.roleId]); await blocker.query("COMMIT"); } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    await rejected;
    const disabled = await user("shipment.disabled", grants), context2 = await prepare(), data2 = sample(context2, 1); clock += 5000;
    const blockUser = await pool.connect(); await blockUser.query("BEGIN"); await blockUser.query("UPDATE app_users SET active=false WHERE id=$1", [disabled.actor.internalUserId]);
    const deniedWrite = assert.rejects(() => publishGarmentObservation(pool, disabled.actor, context2, data2.input, data2.scope, clock), { status: 401 });
    try { await waitForLock("SELECT username,display_name FROM app_users"); await blockUser.query("COMMIT"); } finally { await blockUser.query("ROLLBACK"); blockUser.release(); }
    await deniedWrite;
  });

  await t.test("profile, target and account changes invalidate prepared captures and hide disconnected data", async () => {
    const context = await prepare(); await pool.query("UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key=$1", [sourceKey]);
    await assert.rejects(() => publish(context), code("garment_source_not_connected")); assert.equal((await reader.read(viewer.actor, orderId)).sourceStatus, "not_connected");
    await pool.query("UPDATE ainuoke_source_profiles SET enabled=true,account_fingerprint=$2 WHERE source_key=$1", [sourceKey, "b".repeat(64)]);
    await assert.rejects(() => publish(context), code("garment_source_not_connected")); assert.equal((await reader.history(viewer.actor, orderId)).records.length, 0);
    await pool.query("UPDATE ainuoke_source_profiles SET account_fingerprint=$2 WHERE source_key=$1", [sourceKey, fingerprint]);
    await pool.query("UPDATE ainuoke_garment_shipment_targets SET freshness_ms=120000,version=version+1 WHERE source_key=$1", [sourceKey]);
    await assert.rejects(() => publish(context), code("garment_binding_changed")); assert.equal((await current()).targetPolicyChanged, true);
  });

  await t.test("independent processing batch has no garment source, and a label alone cannot forge business provenance", async () => {
    const q = createSyntheticQuoteFixture("shipment-processing", "processing");
    for (const revision of q.revisions) { revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; }
    const revision = q.revisions.find(row => row.revisionId === q.defaultRevisionId)!, price = revision.priceVersions[0];
    price.confirmation = { quotedGarmentPrice: 0, quotedLaborPrice: 25, confirmedGarmentPrice: null, confirmedLaborPrice: 25, note: "合成", confirmedAt: "2026-10-21T00:00:00Z" };
    await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(q));
    const batch = await createProcessingBatch(pool, admin, { requestId: randomUUID(), quoteId: q.id, revisionId: revision.revisionId, priceVersionId: price.id,
      customerName: "合成", businessStyleNo: "SYN-PROCESSING", quantity: "10", orderDate: "2026-10-21", deliveryDate: null, customerReference: "", deliveryRequirements: "", referenceOrderId: null });
    const preview = await previewProcessingBatch(pool, admin, batch.batchId), confirmed = await confirmProcessingBatch(pool, admin, batch.batchId, { requestId: randomUUID(), expectedVersion: batch.version, sourceFingerprint: preview.candidate.fingerprint });
    const consumed = await consumeProcessingBatches(pool, admin, { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version! }] });
    assert.equal(consumed.results[0].status, "created"); const id = (consumed.results[0] as { salesOrderId: string }).salesOrderId;
    assert.equal((await reader.read(viewer.actor, id)).sourceStatus, "not_applicable"); await assert.rejects(() => prepare(id), code("garment_source_not_applicable"));
    const manual = await createSalesOrder(pool, { creationSource: "manual" }); await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'processing')", [manual.id]);
    await assert.rejects(() => reader.read(viewer.actor, manual.id), code("trusted_contract_required"));
  });

  await t.test("source owner differs from effective SO: freeze whole group, reject stale colors, register every reference", async () => {
    const primary = (await createSalesOrder(pool, { creationSource: "manual" })).id, pair = [primary, orderId].sort();
    const caseId = (await pool.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, admin.internalUserId, randomUUID(), hash("shipment-case")])).rows[0].id;
    await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic shipment references','{}')", [caseId, admin.internalUserId, randomUUID(), hash("shipment-event")]);
    const inspection = await pool.connect();
    try {
      await inspection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const refs = await normalizationReferences(inspection);
      assert.equal(refs.filter(([table]) => table.startsWith("ainuoke_garment_shipment_")).length, 5);
      const proposal = parseAttributionProposal({ changeType: "normalize", caseVersion: 1, assignments: pair.map(id => ({ originalOrderId: id, effectiveOrderId: primary })), reason: "Synthetic shipment references", recoveryPlanHash: hash("recovery") });
      const full = await collectFullNormalizationEvidence(inspection, caseId, proposal, { coverage: "unavailable", reason: "synthetic-no-external-ledger" });
      assert.deepEqual(full.unknownReferences, []); assert.ok(full.blockers.includes("production_finance_coverage_unavailable"));
      assert.ok(full.references.filter(row => row.relation.startsWith("ainuoke_garment_shipment_") && row.orderId === orderId).every(row => row.count > 0));
      await inspection.query("COMMIT");
    } finally { await inspection.query("ROLLBACK"); inspection.release(); }
    const mapping = await pool.connect();
    try {
      await mapping.query("BEGIN"); await mapping.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
      const change = (await mapping.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic shipment ownership') RETURNING id", [caseId, admin.internalUserId, randomUUID(), hash("shipment-change")])).rows[0].id;
      for (const id of pair) await mapping.query("INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,NULL,0)", [change, id, primary]);
      for (const id of pair) await writeAttributionHeadInTransaction(mapping, change, id); await mapping.query("COMMIT");
    } finally { await mapping.query("ROLLBACK"); mapping.release(); }
    await assert.rejects(() => reader.read(viewer.actor, orderId), code("garment_order_not_available")); await target(primary);
    const context = await prepare(primary); assert.equal(context.sourceOwnerOrderId, orderId); assert.equal((await reader.read(viewer.actor, primary)).sourceStatus, "not_captured");
    const refresh = await pool.connect(); await refresh.query("BEGIN"); await refresh.query("SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE", [orderId]);
    const write = assert.rejects(() => publish(context, 1), code("garment_binding_changed"));
    try { await waitForLock("ORDER BY id LIMIT 2001 FOR UPDATE"); await replaceCurrentAinuokeColorSlice(refresh, orderId, [{ sourceLineIdentity: "SYN-PHYSICAL-NEW", colorName: "新颜色", quantity: 100, deliveryDate: null, sourceHash: hash("physical") }]); await refresh.query("COMMIT"); }
    finally { await refresh.query("ROLLBACK"); refresh.release(); }
    await write; assert.equal((await reader.read(viewer.actor, primary)).sourceStatus, "not_captured");
    await publish(await prepare(primary), 1); const value = await reader.read(viewer.actor, primary); assert.ok("publicationId" in value); assert.equal(value.rows[0].colorMatch.state, "unmatched");
    assert.equal((await pool.query("SELECT count(*)::int n FROM ainuoke_garment_shipment_snapshots WHERE sales_order_id=$1", [orderId])).rows[0].n >= 6, true);
  });
  assert.equal(JSON.stringify(logged).includes("SENTINEL"), false);
});

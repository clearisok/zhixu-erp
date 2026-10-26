import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { parseLogisticsResourceCommand } from "../production-resources/logistics-contract.js";
import { executeProductionResourceCommand } from "../production-resources/service.js";
import { planHash } from "../production-scheduling/repository.js";
import type { OrderTrackingIntent } from "../production-scheduling/tracking-contract.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { writeAttributionHeadInTransaction } from "../sales-orders/effective-attribution.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { collectFullNormalizationEvidence } from "../sales-orders/normalization-full-evidence.js";
import { parseAttributionProposal } from "../sales-orders/normalization-execution-model.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } from "../sales-orders/processing-batch-service.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

test("explicit order logistics context: trusted HTTP, atomic history, concurrency and physical order protection", { timeout: 240000 }, async t => {
  const postgres = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await postgres.createDatabase("order_tracking"), max: 12 });
  const allowedOrigins: string[] = [], errors: Record<string, unknown>[] = [];
  const server = createServer(createApp({ pool, allowedOrigins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: value => errors.push(value) } }));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); try { await pool.end(); } finally { await postgres.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`; allowedOrigins.push(base);
  async function user(name: string, permissions: PermissionKey[]) {
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic-tracking',gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [name])).rows[0];
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [name]); await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, name]);
    for (const permission of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [name, permission]);
    const response = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: base, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: name, password: "synthetic-tracking" }) }); assert.equal(response.status, 200);
    const actor: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, username: name, userName: "UNTRUSTED", permissions };
    return { actor, cookie: response.headers.get("set-cookie")!.split(";")[0], roleId: name };
  }
  const grants: PermissionKey[] = ["order.view", "schedule.view", "schedule.edit", "ainuoke.sync", "settings.production_infrastructure.edit"];
  const editor = await user("tracking.editor", grants), second = await user("tracking.second", grants), viewer = await user("tracking.viewer", ["order.view", "schedule.view"]),
    scheduleOnly = await user("tracking.schedule", ["schedule.view", "schedule.edit"]);
  async function request(path: string, body?: unknown, cookie: string | null = editor.cookie, headers: Record<string, string> = {}) {
    const response = await fetch(base + "/api/v1/production-scheduling" + path, { method: body === undefined ? "GET" : "POST", headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { Origin: base, "Content-Type": "application/json", "X-Zhixu-Request": "1" }), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const text = await response.text(); return { status: response.status, body: JSON.parse(text), text };
  }
  async function hub(name: string, enabled = true) {
    const result = await executeProductionResourceCommand(pool, editor.actor, parseLogisticsResourceCommand({ requestId: randomUUID(), action: "create", kind: "hubs", resourceId: null, expectedVersion: 0, data: { name, enabled, remark: "合成仓库" } }));
    assert.equal(result.status, "applied"); if (result.status !== "applied" || result.resource.kind !== "hubs") assert.fail(); return result.resource;
  }
  async function changeHub(id: string, name: string, enabled = true) {
    const current = (await pool.query("SELECT version FROM production_supply_hubs WHERE id=$1", [id])).rows[0];
    const result = await executeProductionResourceCommand(pool, editor.actor, parseLogisticsResourceCommand({ requestId: randomUUID(), action: "update", kind: "hubs", resourceId: id, expectedVersion: current.version, data: { name, enabled, remark: "合成仓库" } }));
    assert.equal(result.status, "applied");
  }
  let serial = 0;
  async function order() {
    const suffix = ++serial;
    return (await createAinuokeSalesOrder(pool, editor.actor, { source: { sourceId: "SYN-TRACK-" + suffix, sourceRowIdentity: "SYN-TRACK-ROW-" + suffix, salesContractNo: "SYN-TRACK-" + suffix, insideOrderNo: "SYNTHETIC-TRACK-" + suffix,
      lifecycleStatusRaw: "生效", contractDate: "2027-01-01", contractDeliveryDate: "2027-02-01", styleNo: "SYNTHETIC", companyNameSnapshot: "Synthetic", customerNameSnapshot: "Synthetic", brandNameSnapshot: "Synthetic", quantity: 100, sourceHash: "SYN-TRACK-HASH-" + suffix, fetchedAt: "2026-10-21T00:00:00Z" }, colors: [] })).salesOrder.id;
  }
  async function intent(orderId: string, supplyHubId: string | null, remark = ""): Promise<OrderTrackingIntent> {
    const current = await request("/order-tracking/orders/" + orderId); assert.equal(current.status, 200, current.text);
    return { action: "set_order_tracking", orderId, expectedVersion: current.body.tracking?.version ?? 0, data: { supplyHubId, remark } };
  }
  async function command(input: OrderTrackingIntent, cookie = editor.cookie) {
    const preview = await request("/order-tracking/preview", input, cookie); assert.equal(preview.status, 200, preview.text);
    return { requestId: randomUUID(), intent: preview.body.intent as OrderTrackingIntent, previewHash: preview.body.previewHash as string };
  }
  async function save(input: OrderTrackingIntent, cookie = editor.cookie) {
    const value = await command(input, cookie), reply = await request("/order-tracking/commands", value, cookie); assert.equal(reply.status, 200, reply.text); return { value, ...reply.body };
  }
  const main = await order(), firstHub = await hub("合成宁波仓"), otherHub = await hub("合成另一仓"), disabled = await hub("停用合成仓", false);
  const legacyTables = ["sales_orders", "sales_order_source_links", "ainuoke_sales_order_contract_mirrors", "ainuoke_sales_order_color_mirrors", "sales_order_identity_profiles", "sales_order_delivery_plans", "sales_order_commercial_versions", "production_order_plan_heads", "production_schedule_assignments", "production_schedule_executions"];
  const snapshot = (tables = legacyTables) => Promise.all(tables.map(async table => ({ table, rows: (await pool.query("SELECT to_jsonb(row)::text payload FROM " + table + " row ORDER BY payload")).rows })));
  const original = await snapshot();
  await t.test("empty schema and no default warehouse; no-op never invents an order fact or audit", async () => {
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []);
    const read = await request("/order-tracking/orders/" + main); assert.equal(read.body.tracking, null); assert.equal(read.body.currentHub, null); assert.equal(read.body.canEdit, true);
    const empty = await request("/order-tracking/history/" + main + "?asOfVersion=0"); assert.equal(empty.body.asOfVersion, 0); assert.deepEqual(empty.body.history, []);
    const noop = await save(await intent(main, null)); assert.equal(noop.changed, false); assert.equal(noop.tracking, null); assert.equal(noop.operationId, null);
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_order_execution_trackings")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_type='OrderExecutionTracking'")).rows[0].n, 0);
    assert.deepEqual(await snapshot(), original);
  });
  await t.test("trusted domain, read/write permissions and mutation boundary are enforced at HTTP", async () => {
    const input = await intent(main, firstHub.id);
    assert.equal((await request("/order-tracking/preview", input, null)).status, 401);
    for (const cookie of [viewer.cookie, scheduleOnly.cookie]) assert.equal((await request("/order-tracking/preview", input, cookie)).status, 403);
    assert.equal((await request("/order-tracking/orders/" + main, undefined, scheduleOnly.cookie)).status, 403);
    assert.equal((await request("/order-tracking/preview", input, editor.cookie, { Origin: "https://invalid.example" })).status, 403);
    assert.equal((await request("/order-tracking/preview", { ...input, actorId: editor.actor.userId })).status, 400);
    assert.equal((await request("/order-tracking/preview?unexpected=1", input)).status, 400);
    assert.equal((await request("/order-tracking/orders/" + randomUUID())).status, 404);
    assert.equal((await request("/order-tracking/orders/" + main + "?actor=1")).status, 400);
    const untrusted = (await createSalesOrder(pool, { creationSource: "manual" })).id;
    assert.equal((await request("/order-tracking/preview", { ...input, orderId: untrusted })).body.error.code, "trusted_contract_required");
    assert.equal((await request("/order-tracking/orders/" + untrusted)).body.canEdit, false);
    assert.equal((await request("/order-tracking/preview", { ...input, data: { supplyHubId: disabled.id, remark: "" } })).body.error.code, "production_supply_hub_disabled");
  });
  let saved: Awaited<ReturnType<typeof save>>;
  await t.test("one actor/request across endpoints; same concurrent command and lost receipt return one exact revision", async () => {
    const value = await command(await intent(main, firstHub.id, " 首次明确选择 "));
    const results = await Promise.all([request("/order-tracking/commands", value), request("/order-tracking/commands", value)]);
    assert.deepEqual(results.map(row => row.status), [200, 200]); assert.deepEqual(results.map(row => row.body.replayed).sort(), [false, true]);
    saved = { value, ...results[0].body }; assert.equal(saved.tracking.version, 1); assert.equal(saved.tracking.hubSnapshot.name, "合成宁波仓");
    const receipt = await request("/commands/" + value.requestId); assert.equal(receipt.body.state, "known"); assert.equal(receipt.body.result.payloadHash, planHash(value));
    assert.equal((await request("/commands/" + value.requestId, undefined, second.cookie)).body.state, "unknown");
    assert.equal((await request("/order-tracking/commands", value)).body.tracking.id, saved.tracking.id);
    assert.equal((await request("/order-tracking/commands", { ...value, previewHash: "0".repeat(64) })).body.error.code, "production_plan_request_conflict");
    assert.equal((await request("/commands", value)).status, 400);
    assert.equal((await request("/commands", { requestId: value.requestId, intent: { action: "cancel", orderId: main, assignmentId: randomUUID(), expectedVersion: 1, expectedPlanVersion: 0, reason: "同编号不能跨入口复用" }, previewHash: "a".repeat(64) })).body.error.code, "production_plan_request_conflict");
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_order_execution_tracking_versions WHERE sales_order_id=$1", [main])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT actor_name FROM operation_logs WHERE operation_id=$1", [saved.operationId])).rows[0].actor_name, "tracking.editor");
    assert.equal(/salePrice|confirmedLabor|USD|CNY/u.test(JSON.stringify(results)), false);
  });
  await t.test("a request in flight is pending, unknown remains unknown, neither invents a completed write", async () => {
    const id = randomUUID(), client = await pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`production-plan:${editor.actor.internalUserId}:${id}`]);
      assert.equal((await request("/commands/" + id)).body.state, "pending");
    } finally { await client.query("ROLLBACK"); client.release(); }
    assert.equal((await request("/commands/" + id)).body.state, "unknown");
  });
  await t.test("COMMIT followed by a dropped HTTP reply is recovered from the original receipt without another revision", async () => {
    const id = await order(), value = await command(await intent(id, otherHub.id, "提交后丢回复"));
    let forwarded = 0, upstreamStatus = 0, proxyError: unknown = null;
    const proxy = createServer(async (_request, response) => {
      try { forwarded++; upstreamStatus = (await request("/order-tracking/commands", value)).status; }
      catch (error) { proxyError = error; }
      finally { response.destroy(); }
    });
    await new Promise<void>(done => proxy.listen(0, "127.0.0.1", done)); const address = proxy.address(); assert.ok(address && typeof address === "object");
    try {
      await assert.rejects(() => fetch(`http://127.0.0.1:${address.port}/drop-committed-reply`, { method: "POST", body: JSON.stringify(value), signal: AbortSignal.timeout(10000) }));
      assert.equal(forwarded, 1); assert.equal(upstreamStatus, 200); assert.equal(proxyError, null);
      const receipt = (await request("/commands/" + value.requestId)).body; assert.equal(receipt.state, "known"); assert.equal(receipt.result.tracking.version, 1);
      assert.equal((await request("/order-tracking/commands", value)).body.replayed, true);
      assert.equal((await request("/order-tracking/history/" + id)).body.history.length, 1);
    } finally { await new Promise<void>(done => proxy.close(() => done())); }
  });
  await t.test("clear is explicit, identity is stable, unchanged writes do not refresh historical facts", async () => {
    const clear = await save(await intent(main, null, "")); assert.equal(clear.tracking.id, saved.tracking.id); assert.equal(clear.tracking.version, 2); assert.equal(clear.tracking.supplyHubId, null); assert.equal(clear.tracking.hubSnapshot, null);
    const noop = await save(await intent(main, null, "")); assert.equal(noop.changed, false); assert.equal(noop.operationId, null); assert.equal(noop.tracking.version, 2);
    assert.deepEqual((await request("/order-tracking/history/" + main)).body.history.map((row: { version: number }) => row.version), [2, 1]);
    const own = await pool.query("SELECT to_jsonb(row)::text payload FROM sales_orders row WHERE id=$1", [main]);
    assert.deepEqual(own.rows, original[0].rows); // tracking does not bump or rewrite SO creation/lifecycle/version
  });
  await t.test("two users with different requests race on first-write CAS; losing command is durably rejected", async () => {
    const id = await order(), a = await command(await intent(id, firstHub.id)), b = await command(await intent(id, otherHub.id), second.cookie);
    const result = await Promise.all([request("/order-tracking/commands", a), request("/order-tracking/commands", b, second.cookie)]);
    assert.deepEqual(result.map(row => row.status).sort(), [200, 409]);
    const losing = result.findIndex(row => row.status === 409), requestValue = losing === 0 ? a : b, cookie = losing === 0 ? editor.cookie : second.cookie;
    assert.equal((await request("/commands/" + requestValue.requestId, undefined, cookie)).body.result.error.code, "order_tracking_version_conflict");
    assert.equal((await request("/order-tracking/commands", requestValue, cookie)).body.replayed, true);
    assert.equal((await request("/order-tracking/history/" + id)).body.history.length, 1);
  });
  await t.test("hub changes invalidate previews, preserve past names and permit retained disabled references", async () => {
    const value = await command(await intent(main, firstHub.id, "旧预览")); await changeHub(firstHub.id, "合成仓新名称");
    const stale = await request("/order-tracking/commands", value); assert.equal(stale.status, 409); assert.equal(stale.body.error.code, "order_tracking_preview_changed");
    assert.equal((await request("/commands/" + value.requestId)).body.result.status, "rejected");
    const current = await save(await intent(main, firstHub.id, "新预览")); assert.equal(current.tracking.hubSnapshot.name, "合成仓新名称");
    await changeHub(firstHub.id, "合成仓已停用", false);
    const read = await request("/order-tracking/orders/" + main); assert.equal(read.body.tracking.hubSnapshot.name, "合成仓新名称"); assert.equal(read.body.currentHub.name, "合成仓已停用"); assert.equal(read.body.currentHub.enabled, false);
    const retained = await save(await intent(main, firstHub.id, "只改备注")); assert.equal(retained.tracking.hubSnapshot.enabled, false);
    const history = await request("/order-tracking/history/" + main); assert.equal(history.body.history.at(-1).snapshot.hub_snapshot.name, "合成宁波仓");
    assert.equal((await request("/order-tracking/commands", saved.value)).body.tracking.hubSnapshot.name, "合成宁波仓");
  });
  await t.test("history anchor remains stable across pages and later changes", async () => {
    const id = await order(); for (let n = 1; n <= 51; n++) await save(await intent(id, null, "合成历史" + n));
    const page = (await request("/order-tracking/history/" + id)).body; assert.equal(page.history.length, 25); assert.equal(page.limit, 25); assert.equal(page.asOfVersion, 51); assert.equal(page.hasMore, true);
    await save(await intent(id, null, "合成历史52"));
    const next = (await request(`/order-tracking/history/${id}?offset=${page.nextOffset}&asOfVersion=${page.asOfVersion}`)).body;
    assert.equal(next.tracking.version, 52); assert.equal(next.asOfVersion, 51); assert.deepEqual(next.history.map((row: { version: number }) => row.version), Array.from({ length: 25 }, (_, i) => 26 - i));
    const last = (await request(`/order-tracking/history/${id}?offset=${next.nextOffset}&asOfVersion=${page.asOfVersion}`)).body;
    assert.deepEqual(last.history.map((row: { version: number }) => row.version), [1]); assert.equal(last.history[0].snapshot.remark, "合成历史1");
    for (const query of ["asOfVersion=0", "asOfVersion=999", "offset=0&offset=1"]) assert.equal((await request(`/order-tracking/history/${id}?${query}`)).status, 400);
  });
  await t.test("maximum escaped remarks retain every full snapshot within 1MiB through all anchored pages", async () => {
    const result = await executeProductionResourceCommand(pool, editor.actor, parseLogisticsResourceCommand({ requestId: randomUUID(), action: "create", kind: "hubs", resourceId: null, expectedVersion: 0,
      data: { name: "合成长备注仓", enabled: true, remark: "\u0001".repeat(2000) } })); assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail();
    const id = await order(); for (let n = 1; n <= 51; n++) await save(await intent(id, result.resource.id, "\u0002".repeat(1997) + String(n).padStart(3, "0")));
    const versions: number[] = []; let offset = 0;
    do {
      const page = await request(`/order-tracking/history/${id}?offset=${offset}&asOfVersion=51`); assert.equal(page.status, 200, page.text); assert.ok(Buffer.byteLength(page.text) <= 1048576);
      for (const row of page.body.history) { versions.push(row.version); assert.equal(row.snapshot.hub_snapshot.remark, "\u0001".repeat(2000)); assert.equal(row.snapshot.remark, "\u0002".repeat(1997) + String(row.version).padStart(3, "0")); }
      if (!page.body.hasMore) break; offset = page.body.nextOffset;
    } while (true);
    assert.deepEqual(versions, Array.from({ length: 51 }, (_, i) => 51 - i));
  });
  await t.test("consumed processing orders are eligible without monetary permissions; a profile alone is never a batch", async () => {
    const batchActor = await user("tracking.batch", [...grants, "quote.view", "commercial.labor.view", "order.processing.batch.manage", "order.processing.consume"]);
    const quote = createSyntheticQuoteFixture("tracking-processing-synthetic", "processing");
    for (const revision of quote.revisions) { revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; }
    const revision = quote.revisions.find(row => row.revisionId === quote.defaultRevisionId)!, price = revision.priceVersions[0];
    price.pricingParameters.laborCurrency = "USD"; price.confirmation = { quotedGarmentPrice: 99, quotedLaborPrice: 8, confirmedGarmentPrice: null, confirmedLaborPrice: 8, note: "Synthetic", confirmedAt: "2026-10-21T00:00:00Z" };
    await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(quote));
    const batch = await createProcessingBatch(pool, batchActor.actor, { requestId: randomUUID(), quoteId: quote.id, revisionId: revision.revisionId, priceVersionId: price.id, customerName: "Synthetic", businessStyleNo: "SYN-PROCESS-TRACK", quantity: "70", orderDate: "2027-01-01", deliveryDate: "2027-02-01", customerReference: "", deliveryRequirements: "", referenceOrderId: null });
    const preview = await previewProcessingBatch(pool, batchActor.actor, batch.batchId), confirmed = await confirmProcessingBatch(pool, batchActor.actor, batch.batchId, { requestId: randomUUID(), expectedVersion: batch.version, sourceFingerprint: preview.candidate.fingerprint });
    const consumed = await consumeProcessingBatches(pool, batchActor.actor, { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version }] }); assert.equal(consumed.results[0].status, "created");
    const id = (consumed.results[0] as { salesOrderId: string }).salesOrderId, applied = await save(await intent(id, otherHub.id)); assert.equal(applied.tracking.orderId, id);
    assert.equal(/salePrice|confirmedLabor|laborPrice|USD|CNY/u.test((await request("/order-tracking/orders/" + id)).text), false);
    assert.equal((await pool.query("SELECT count(*)::int n FROM sales_order_source_links WHERE sales_order_id=$1", [id])).rows[0].n, 0);
    const spoof = (await createSalesOrder(pool, { creationSource: "manual" })).id; await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'processing')", [spoof]);
    assert.equal((await request("/order-tracking/preview", { action: "set_order_tracking", orderId: spoof, expectedVersion: 0, data: { supplyHubId: otherHub.id, remark: "" } })).body.error.code, "trusted_contract_required");
  });
  await t.test("audit failure rolls back tracking, revision, command and successful order bridge", async () => {
    const id = await order(), value = await command(await intent(id, otherHub.id)), tables = ["production_order_execution_trackings", "production_order_execution_tracking_versions", "production_schedule_commands", "production_schedule_command_orders", "operation_logs"], before = await snapshot(tables);
    await pool.query(`CREATE FUNCTION tracking_synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${id}' THEN RAISE EXCEPTION 'synthetic tracking audit failure'; END IF; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER tracking_synthetic_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION tracking_synthetic_audit_failure()");
    try { assert.equal((await request("/order-tracking/commands", value)).status, 500); assert.deepEqual(await snapshot(tables), before); assert.equal((await request("/commands/" + value.requestId)).body.state, "unknown"); }
    finally { await pool.query("DROP TRIGGER tracking_synthetic_audit_failure ON operation_logs"); await pool.query("DROP FUNCTION tracking_synthetic_audit_failure()"); }
    assert.equal((await request("/order-tracking/commands", value)).status, 200);
  });
  await t.test("SQL prevents deletes, identity moves, forged hub/actor snapshots and missing intermediate revisions", async () => {
    const client = await pool.connect();
    const rejects = async (sql: string | string[], args: unknown[] = []) => { await client.query("BEGIN"); try {
      await assert.rejects(async () => { for (const statement of Array.isArray(sql) ? sql : [sql]) await client.query(statement, args); await client.query("SET CONSTRAINTS ALL IMMEDIATE"); }, (error: unknown) => (error as { code: string }).code === "23514");
    } finally { await client.query("ROLLBACK"); } };
    const advance = "UPDATE production_order_execution_trackings SET version=version+1,remark=remark||'x' WHERE sales_order_id=$1";
    const revision = `INSERT INTO production_order_execution_tracking_versions(tracking_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id)
      SELECT id,sales_order_id,version,production_order_tracking_row_snapshot(t),updated_by,gen_random_uuid(),'synthetic' FROM production_order_execution_trackings t WHERE sales_order_id=$1`;
    try {
      await rejects("DELETE FROM production_order_execution_trackings WHERE sales_order_id=$1", [main]);
      await rejects("DELETE FROM production_order_execution_tracking_versions WHERE sales_order_id=$1", [main]);
      await rejects("UPDATE production_order_execution_tracking_versions SET operation_id='rewritten' WHERE sales_order_id=$1", [main]);
      await rejects("UPDATE production_order_execution_trackings SET version=version+2,remark='skip' WHERE sales_order_id=$1", [main]);
      await rejects("UPDATE production_order_execution_trackings SET version=version+1,sales_order_id=$2,remark='move' WHERE sales_order_id=$1", [main, await order()]);
      await rejects("UPDATE production_order_execution_trackings SET version=version+1,hub_snapshot=hub_snapshot||'{\"name\":\"forged\"}',remark='forge' WHERE sales_order_id=$1", [main]);
      await rejects(advance, [main]); await rejects([advance, advance, revision], [main]);
      await rejects(revision.replace("updated_by,gen_random_uuid()", "updated_by+1000,gen_random_uuid()"), [main]);
    } finally { client.release(); }
  });
  await t.test("tracking and full history are registered in normalization evidence; partial schema is unavailable", async () => {
    const alias = (await createSalesOrder(pool, { creationSource: "manual" })).id, pair = [main, alias].sort(), client = await pool.connect();
    try {
      const refs = await normalizationReferences(client); for (const table of ["production_order_execution_trackings", "production_order_execution_tracking_versions"]) assert.ok(refs.some(([name]) => name === table));
      const caseId = (await client.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, editor.actor.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
      await client.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic','{}')", [caseId, editor.actor.internalUserId, randomUUID(), "b".repeat(64)]);
      const proposal = parseAttributionProposal({ changeType: "normalize", caseVersion: 1, assignments: pair.map(id => ({ originalOrderId: id, effectiveOrderId: main })), reason: "Synthetic", recoveryPlanHash: "c".repeat(64) });
      const inventory = await collectFullNormalizationEvidence(client, caseId, proposal, { coverage: "unavailable", reason: "not-connected" });
      assert.deepEqual(inventory.unknownReferences, []); assert.ok(inventory.blockers.includes("production_finance_coverage_unavailable"));
      assert.ok(inventory.references.find(row => row.orderId === main && row.relation === "production_order_execution_tracking_versions")!.count >= 4);
      await client.query("ALTER TABLE production_order_execution_tracking_versions RENAME TO tracking_history_synthetic_hidden");
      try {
        await assert.rejects(() => normalizationReferences(client), { code: "production_tracking_reference_schema_incomplete" });
        assert.equal((await request("/order-tracking/orders/" + main)).status, 503);
        assert.equal((await request("/orders/" + main)).status, 200);
      } finally { await client.query("ALTER TABLE tracking_history_synthetic_hidden RENAME TO production_order_execution_tracking_versions"); }
    } finally { client.release(); }
  });
  await t.test("historical physical order remains readable; all new writes, including raw SQL, are blocked", async () => {
    const id = await order(), effective = (await createSalesOrder(pool, { creationSource: "manual" })).id; await save(await intent(id, otherHub.id)); const value = await command(await intent(id, otherHub.id, "冻结前预览"));
    const pair = [id, effective].sort(), client = await pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
      const caseId = (await client.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, editor.actor.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
      await client.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic','{}')", [caseId, editor.actor.internalUserId, randomUUID(), "b".repeat(64)]);
      const change = (await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic only') RETURNING id", [caseId, editor.actor.internalUserId, randomUUID(), "d".repeat(64)])).rows[0].id;
      for (const original of pair) await client.query("INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_version) VALUES($1,$2,$3,0)", [change, original, effective]);
      for (const original of pair) await writeAttributionHeadInTransaction(client, change, original); await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    const read = await request("/order-tracking/orders/" + id); assert.equal(read.body.tracking.orderId, id); assert.equal(read.body.canEdit, false); assert.equal(read.body.order.identity.effectiveOrderId, effective);
    assert.equal((await request("/order-tracking/orders/" + effective)).body.tracking, null);
    assert.equal((await request("/order-tracking/commands", value)).body.error.code, "historical_duplicate_order_read_only");
    await assert.rejects(() => pool.query("UPDATE production_order_execution_trackings SET version=version+1,remark='forbidden' WHERE sales_order_id=$1", [id]), { code: "23514" });
    assert.equal((await request("/order-tracking/history/" + id)).body.history.length, 1);
  });
  await t.test("completed/cancelled and fresh grant revocation block new commands and saved receipt access", async () => {
    for (const state of ["completed", "cancelled"]) {
      const id = await order(); await save(await intent(id, otherHub.id)); const value = await command(await intent(id, otherHub.id, "冻结前"));
      await pool.query("UPDATE sales_orders SET lifecycle_state=$2,version=version+1 WHERE id=$1", [id, state]);
      assert.equal((await request("/order-tracking/orders/" + id)).body.canEdit, false); assert.equal((await request("/order-tracking/commands", value)).body.error.code, "production_order_read_only");
      await assert.rejects(() => pool.query("UPDATE production_order_execution_trackings SET version=version+1,remark='forbidden' WHERE sales_order_id=$1", [id]), { code: "23514" });
    }
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='schedule.edit'", [editor.roleId]);
    assert.equal((await request("/commands/" + saved.value.requestId)).status, 403); assert.equal((await request("/order-tracking/commands", saved.value)).status, 403);
    assert.equal((await request("/order-tracking/orders/" + main, undefined, viewer.cookie)).status, 200);
    assert.equal((await request("/order-tracking/history/" + main, undefined, viewer.cookie)).status, 200);
  });
  assert.equal(errors.length, 1, JSON.stringify(errors));
});

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { createApp } from "../app.js";
import { createIdentityAuthority } from "../auth/identity-authority.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { executeProductionResourceCommand, readProductionResource, type ProductionResource } from "../production-resources/service.js";
import { parseProductionResourceCommand, type ProductionResourceType } from "../production-resources/contract.js";
import { type PlanData, type PlanIntent } from "../production-scheduling/contract.js";
import { planHash } from "../production-scheduling/repository.js";
import { listProductionPlanOrders } from "../production-scheduling/service.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { createSalesOrder, replaceCurrentAinuokeColorSlice, createOrUpdateSourceLink, upsertCurrentAinuokeContractMirror } from "../sales-orders/repository.js";
import { writeAttributionHeadInTransaction } from "../sales-orders/effective-attribution.js";
import { collectFullNormalizationEvidence } from "../sales-orders/normalization-full-evidence.js";
import { parseAttributionProposal } from "../sales-orders/normalization-execution-model.js";
import { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } from "../sales-orders/processing-batch-service.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";
import { lockProductionResourceScope } from "../production-resources/snapshot-lock.js";
import { previewSaleAdjustment } from "../sales-orders/sale-adjustment-service.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createProductionPlanClient, productionPlanFingerprint } from "../../features/production-scheduling/server/production-plan-client.js";

const keys: PermissionKey[] = ["order.view", "schedule.view", "schedule.create", "schedule.edit", "ainuoke.sync", "settings.production_infrastructure.edit", "settings.production_group.edit", "settings.outsource_factory.edit"];
test("Gate6B planning: empty schema, real PostgreSQL and trusted HTTP atomic commands", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("production_scheduling"), max: 12 });
  const allowedOrigins: string[] = [], errors: Record<string, unknown>[] = [], expectedErrorIds: string[] = [];
  const server = createServer(createApp({ pool, allowedOrigins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: event => errors.push(event) } }));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); try { await pool.end(); } finally { await postgres.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`; allowedOrigins.push(base);
  async function user(name: string, permissions: PermissionKey[]) {
    const row = (await pool.query<{ id: string; public_id: string }>("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic-plan',gen_salt('bf',4)),$2,'viewer') RETURNING id::text,public_id::text", [name, "合成排单 " + name])).rows[0];
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [name]); await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, name]);
    for (const key of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [name, key]);
    const login = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: base, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: name, password: "synthetic-plan" }) }); assert.equal(login.status, 200);
    const actor: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, userName: "UNTRUSTED CALLER NAME", username: name, permissions };
    return { actor, cookie: login.headers.get("set-cookie")!.split(";")[0], roleId: name };
  }
  const editor = await user("plan.editor", keys), other = await user("plan.other", keys), viewer = await user("plan.viewer", ["order.view", "schedule.view"]), quoteOnly = await user("plan.quote", ["quote.view"]);
  async function request(path: string, body?: unknown, cookie: string | null = editor.cookie, method = body === undefined ? "GET" : "POST", headers: Record<string, string> = {}) {
    const response = await fetch(base + "/api/v1/production-scheduling" + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { Origin: base, "Content-Type": "application/json", "X-Zhixu-Request": "1" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); return { status: response.status, body: JSON.parse(text), text };
  }
  async function preview(intent: PlanIntent, cookie = editor.cookie) { const result = await request("/preview", intent, cookie); assert.equal(result.status, 200, result.text); return result.body; }
  async function command(intent: PlanIntent, cookie = editor.cookie) { const result = await preview(intent, cookie); return { requestId: randomUUID(), intent: result.intent as PlanIntent, previewHash: String(result.previewHash) }; }
  async function save(intent: PlanIntent) { const input = await command(intent); const result = await request("/commands", input); assert.equal(result.status, 200, result.text); return result.body; }
  async function resource(kind: ProductionResourceType, data: unknown): Promise<ProductionResource> {
    const result = await executeProductionResourceCommand(pool, editor.actor, parseProductionResourceCommand({ requestId: randomUUID(), action: "create", kind, resourceId: null, expectedVersion: 0, data }));
    assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail(JSON.stringify(result)); return result.resource;
  }
  async function changeResource(row: ProductionResource, patch: Record<string, unknown>) {
    const { id, kind, version, createdAt: _c, updatedAt: _u, ...data } = row; void _c; void _u;
    const result = await executeProductionResourceCommand(pool, editor.actor, parseProductionResourceCommand({ requestId: randomUUID(), action: "update", kind, resourceId: id, expectedVersion: version, data: { ...data, ...patch } }));
    assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail(JSON.stringify(result)); return result.resource;
  }
  const calendar = await resource("calendars", { name: "合成日历", enabled: true, remark: "", workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
  const site = await resource("sites", { name: "合成地点", enabled: true, remark: "", countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
  const group = await resource("groups", { name: "合成生产组", enabled: true, remark: "", shortName: "组一", productionSiteId: site.id, sortOrder: 0 });
  const secondGroup = await resource("groups", { name: "合成生产组二", enabled: true, remark: "", shortName: "组二", productionSiteId: site.id, sortOrder: 1 });
  const factory = await resource("factories", { name: "合成外发厂", enabled: true, remark: "", shortName: "外发", contactPerson: "", phone: "" });
  let serial = 0;
  async function order(colors = true) {
    const n = ++serial;
    const result = await createAinuokeSalesOrder(pool, editor.actor, { source: { sourceId: "PLAN-" + n, sourceRowIdentity: "PLAN-ROW-" + n, salesContractNo: "SYN-PLAN-" + n, insideOrderNo: "SYN-FACTORY-" + n,
      lifecycleStatusRaw: "生效", contractDate: "2027-01-01", contractDeliveryDate: "2027-02-01", styleNo: "SYNTHETIC-PLAN", companyNameSnapshot: "Synthetic", customerNameSnapshot: "Synthetic", brandNameSnapshot: "Synthetic", quantity: 100, sourceHash: "SYN-HASH-" + n, fetchedAt: "2026-10-20T00:00:00Z" },
    colors: colors ? [{ sourceLineIdentity: "PLAN-COLOR-" + n, colorName: "富贵红", quantity: 100, deliveryDate: "2027-02-01", sourceHash: "COLOR-HASH-" + n }] : [] });
    return result.salesOrder.id;
  }
  const a = await order(), b = await order();
  const planData = (patch: Partial<PlanData> = {}): PlanData => ({ executionType: "internal", executorId: group.id, colorId: null, plannedQuantity: "30", duration: { mode: "workdays", workdays: 2 }, dates: { mode: "auto_queue", startDate: "2027-01-04" }, remark: "", ...patch });
  async function createIntent(id: string, data = planData()): Promise<PlanIntent> { const current = await request("/orders/" + id); return { action: "create", orderId: id, expectedPlanVersion: current.body.order.planVersion, assignmentId: null, expectedVersion: 0, data }; }
  const count = async (table: string) => (await pool.query<{ n: number }>("SELECT count(*)::int n FROM " + table)).rows[0].n;
  async function waitLock(pattern: string) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) { if ((await pool.query<{ ready: boolean }>("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1) ready", [pattern])).rows[0].ready) return; await new Promise(done => setTimeout(done, 20)); }
    assert.fail("Expected database lock wait: " + pattern);
  }
  await t.test("new schema is empty/idempotent and no quote adoption or new grants are required", async () => {
    for (const table of ["production_schedule_assignments", "production_schedule_plan_versions", "production_schedule_commands", "production_schedule_resource_snapshots"]) assert.equal(await count(table), 0);
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []); await verifyMigrationsCurrent(pool, resolve("database/migrations"));
    const read = await request("/orders/" + a); assert.equal(read.status, 200); assert.deepEqual(read.body.assignments, []); assert.equal(read.body.order.colors.length, 1);
    assert.equal(read.body.order.quantity, "100"); assert.equal(read.body.order.deliveryPlans[0].quantity, "100");
    assert.equal(await count("sales_order_commercial_versions"), 0); assert.equal(editor.actor.permissions.includes("commercial.sale.view"), false);
  });
  await t.test("trusted session, domain grants, mutation boundary and strict payload are enforced", async () => {
    const input = await createIntent(a);
    assert.equal((await request("/orders/" + a, undefined, null)).status, 401); assert.equal((await request("/orders/" + a, undefined, quoteOnly.cookie)).status, 403);
    assert.equal((await request("/orders/" + a, undefined, viewer.cookie)).body.canCreate, false);
    assert.equal((await request("/preview", input, viewer.cookie)).status, 403);
    assert.equal((await request("/preview", input, editor.cookie, "POST", { Origin: "https://invalid.example" })).status, 403);
    assert.equal((await request("/preview", input, editor.cookie, "POST", { "X-Zhixu-Request": "0" })).status, 403);
    assert.equal((await request("/preview?actor=spoof", input)).status, 400);
    assert.equal((await request("/preview", { ...input, completedQuantity: "20" })).status, 400);
    assert.equal((await request("/orders/" + a, {}, editor.cookie, "DELETE")).status, 405);
    assert.equal((await request("/assignments/" + randomUUID() + "?offset=0&offset=1")).status, 400);
    assert.equal((await request("/groups/" + randomUUID())).status, 404);
    const local = createServer(createApp({ pool, identityAuthority: createIdentityAuthority(pool, "local-single-user") }));
    try { await new Promise<void>(done => local.listen(0, "127.0.0.1", done)); const p = local.address(); assert.ok(p && typeof p === "object"); assert.equal((await fetch(`http://127.0.0.1:${p.port}/api/v1/production-scheduling/orders/${a}`)).status, 404); }
    finally { await new Promise<void>(done => local.close(() => done())); }
    assert.equal(await count("production_schedule_commands"), 0);
  });
  let firstId = "";
  await t.test("same request concurrently creates one stable assignment, revision, receipt and audit", async () => {
    const read = await request("/orders/" + a), colorId = read.body.order.colors[0].id;
    const input = await command(await createIntent(a, planData({ colorId })));
    const replies = await Promise.all([request("/commands", input), request("/commands", input)]); assert.deepEqual(replies.map(r => r.status), [200, 200]);
    firstId = replies[0].body.assignments[0].id; assert.equal(firstId, replies[1].body.assignments[0].id); assert.deepEqual(replies.map(r => r.body.replayed).sort(), [false, true]);
    assert.equal(replies[0].body.payloadHash, planHash(input)); assert.equal(replies[0].body.assignments[0].plannedEndDate, "2027-01-05");
    assert.equal(await count("production_schedule_assignments"), 1); assert.equal(await count("production_schedule_plan_versions"), 1);
    const audit = (await pool.query("SELECT actor_name,after_data FROM operation_logs WHERE entity_id=$1", [firstId])).rows; assert.equal(audit.length, 1); assert.equal(audit[0].actor_name, "合成排单 plan.editor");
    assert.equal((await request("/commands/" + input.requestId)).body.result.payloadHash, planHash(input));
    assert.equal((await request("/commands/" + input.requestId, undefined, other.cookie)).body.state, "unknown");
    assert.equal((await request("/commands", { ...input, previewHash: "0".repeat(64) })).body.error.code, "production_plan_request_conflict");
    const details = await request("/assignments/" + firstId); assert.equal(details.body.history[0].snapshot.planned_quantity, "30");
    assert.equal(details.body.resourceSnapshot.calendar.name, "合成日历"); assert.equal(await count("sales_order_color_identities"), 1);
  });
  await t.test("different commands with one order CAS have one winner and durable loser", async () => {
    const intent = await createIntent(a), x = await command(intent), y = await command(intent);
    const replies = await Promise.all([request("/commands", x), request("/commands", y)]); assert.deepEqual(replies.map(r => r.status).sort(), [200, 409]);
    const loser = replies[0].status === 409 ? x : y; const replay = await request("/commands", loser); assert.equal(replay.status, 409); assert.equal(replay.body.replayed, true);
    assert.equal((await request("/commands/" + loser.requestId)).body.result.status, "rejected");
  });
  await t.test("queue append uses existing end and source quantity changes do not change color identity", async () => {
    const before = await request("/orders/" + b), oldColor = before.body.order.colors[0].id;
    const input = await command(await createIntent(b)); const reply = await request("/commands", input); assert.equal(reply.status, 200, reply.text);
    const queue = await request("/groups/" + group.id); const prior = queue.body.assignments.at(-2), last = queue.body.assignments.at(-1);
    assert.equal(last.plannedStartDate, prior.plannedEndDate); assert.ok(last.firstProductionDate > prior.plannedEndDate);
    await replaceCurrentAinuokeColorSlice(pool, b, [{ sourceLineIdentity: "CHANGED-ROW", colorName: "富贵红", quantity: 110, deliveryDate: "2027-02-01", sourceHash: "CHANGED-HASH" }]);
    assert.equal((await request("/orders/" + b)).body.order.colors[0].id, oldColor);
    assert.equal((await request("/commands/" + input.requestId)).body.result.assignments[0].id, last.id);
  });
  await t.test("preview becomes a durable conflict after source, resource or queue changes", async () => {
    const id = await order(), sourceInput = await command(await createIntent(id));
    await replaceCurrentAinuokeColorSlice(pool, id, [{ sourceLineIdentity: "NEW-COLOR-ROW", colorName: "蓝色", quantity: 100, deliveryDate: null, sourceHash: "NEW-HASH" }]);
    assert.equal((await request("/commands", sourceInput)).body.error.code, "production_plan_preview_changed");
    const resourceInput = await command(await createIntent(id, planData({ executorId: secondGroup.id })));
    await changeResource(secondGroup, { name: "已改名称组二" });
    assert.equal((await request("/commands", resourceInput)).body.error.code, "production_plan_preview_changed");
    const queued = await command(await createIntent(id)); await save(await createIntent(b));
    assert.equal((await request("/commands", queued)).body.error.code, "production_plan_preview_changed");
  });
  await t.test("adopted resource facts are immutable; an ordinary edit does not adopt changed calendars", async () => {
    const details = await request("/assignments/" + firstId), oldSnapshot = details.body.resourceSnapshot;
    await changeResource(calendar, { name: "新日历名称", workingWeekdays: [0, 1, 2, 3, 4, 5, 6] });
    const read = await request("/orders/" + a), row = read.body.assignments.find((item: AssignmentShape) => item.id === firstId);
    const intent: PlanIntent = { action: "update", orderId: a, expectedPlanVersion: read.body.order.planVersion, assignmentId: firstId, expectedVersion: row.version,
      reason: "只修改说明", data: planData({ colorId: row.colorId, plannedQuantity: row.plannedQuantity, remark: "新备注" }) };
    const result = await save(intent); assert.equal(result.assignments[0].resourceSnapshotHash, row.resourceSnapshotHash);
    assert.deepEqual((await request("/assignments/" + firstId)).body.resourceSnapshot, oldSnapshot);
    assert.equal((await request("/assignments/" + firstId)).body.history.length, 2);
  });
  await t.test("over-assignment warns without mutating customer demand; outsource decimals remain exact", async () => {
    const id = await order(), before = (await pool.query("SELECT to_jsonb(p) row FROM sales_order_delivery_plans p WHERE sales_order_id=$1", [id])).rows;
    const intent = await createIntent(id, planData({ plannedQuantity: "9007199254740993.0000000001", executionType: "outsource", executorId: factory.id,
      dates: { mode: "manual_fixed", startDate: "2027-01-04", endDate: "2027-01-06" }, duration: { mode: "workdays", workdays: 2 } }));
    const planned = await preview(intent); assert.ok(planned.warnings.some((warning: { kind: string }) => warning.kind === "order_over_assigned"));
    const reply = await save(intent), row = reply.assignments[0]; assert.equal(row.plannedQuantity, "9007199254740993.0000000001"); assert.equal(row.nonWorkingDayCount, null);
    const details = await request("/assignments/" + row.id); assert.equal(details.body.history[0].snapshot.planned_quantity, row.plannedQuantity);
    assert.deepEqual((await pool.query("SELECT to_jsonb(p) row FROM sales_order_delivery_plans p WHERE sales_order_id=$1", [id])).rows, before);
    for (const key of ["unitPrice", "outsourceUnitPrice", "salePrice", "laborPrice", "currency", "completedQuantity"]) assert.equal(Object.hasOwn(row, key), false);
  });
  await t.test("explicit multi-order replan changes versions together; fixed dates and history stay intact", async () => {
    const fixed = await save(await createIntent(b, planData({ dates: { mode: "manual_fixed", startDate: "2027-01-01", endDate: "2027-01-02" } })));
    const fixedId = fixed.assignments[0].id, before = await request("/groups/" + group.id);
    const raw: PlanIntent = { action: "replan", groupId: group.id, expectedQueueVersion: before.body.version, anchorDate: "2027-01-04", orderedAssignmentIds: null };
    const planned = await preview(raw); assert.ok(planned.warnings.some((warning: { kind: string }) => warning.kind === "protected_overlap"));
    const result = await save(raw); assert.ok(result.assignments.length > 0); assert.equal(new Set(result.orderVersions.map((row: { orderId: string }) => row.orderId)).size, 2);
    const after = await request("/assignments/" + fixedId); assert.equal(after.body.assignment.plannedStartDate, "2027-01-01"); assert.equal(after.body.history.length, 1);
    const changed = await request("/assignments/" + firstId); assert.equal(changed.body.resourceSnapshot.calendar.name, "新日历名称");
    const stale = { requestId: randomUUID(), intent: raw, previewHash: planned.previewHash }; assert.equal((await request("/commands", stale)).body.error.code, "production_queue_version_conflict");
    const bad = { ...raw, expectedQueueVersion: result.queueVersions[0].version, orderedAssignmentIds: [firstId] }; assert.equal((await request("/preview", bad)).body.error.code, "production_queue_members_changed");
  });
  await t.test("pending original request is distinguishable; unknown is never treated as permission to repost", async () => {
    const requestId = randomUUID(), blocker = await pool.connect();
    try { await blocker.query("BEGIN"); await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`production-plan:${editor.actor.internalUserId}:${requestId}`]);
      assert.equal((await request("/commands/" + requestId)).body.state, "pending"); await blocker.query("COMMIT");
      assert.equal((await request("/commands/" + requestId)).body.state, "unknown");
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  await t.test("audit failure rolls back assignment, version, queue head, color and receipt", async () => {
    const id = await order(), input = await command(await createIntent(id, planData({ executorId: secondGroup.id }))), before = await count("production_schedule_assignments");
    await pool.query("CREATE FUNCTION fail_synthetic_plan_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='ScheduleAssignment' THEN RAISE EXCEPTION 'synthetic audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_plan_audit_fail BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION fail_synthetic_plan_audit()");
    try { const failed = await request("/commands", input); assert.equal(failed.status, 500); assert.equal(failed.body.error.code, "internal_error"); expectedErrorIds.push(failed.body.error.requestId); }
    finally { await pool.query("DROP TRIGGER synthetic_plan_audit_fail ON operation_logs; DROP FUNCTION fail_synthetic_plan_audit()"); }
    assert.equal(await count("production_schedule_assignments"), before); assert.equal((await request("/commands/" + input.requestId)).body.state, "unknown"); assert.equal((await request("/orders/" + id)).body.order.planVersion, 0);
    const retry = await request("/commands", input); assert.equal(retry.status, 200, retry.text);
  });
  await t.test("SQL forbids deleting identities/history, missing intermediate revisions and forged past versions", async () => {
    const sqlCode = (error: unknown) => (error as { code: string }).code === "23514";
    for (const sql of ["DELETE FROM production_schedule_assignments WHERE id=$1", "UPDATE production_schedule_assignments SET remark='unversioned' WHERE id=$1", "UPDATE production_schedule_assignments SET version=version+1,remark='no history' WHERE id=$1", "DELETE FROM production_schedule_plan_versions WHERE assignment_id=$1"]) await assert.rejects(() => pool.query(sql, [firstId]), sqlCode);
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("UPDATE production_schedule_assignments SET version=version+1,remark='intermediate missing' WHERE id=$1", [firstId]);
      await connection.query("UPDATE production_schedule_assignments SET version=version+1,remark='latest only' WHERE id=$1", [firstId]);
      await connection.query("INSERT INTO production_schedule_plan_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason) SELECT id,sales_order_id,version,production_plan_row_snapshot(a),$2,$3,'synthetic','' FROM production_schedule_assignments a WHERE id=$1", [firstId, editor.actor.internalUserId, randomUUID()]);
      await assert.rejects(() => connection.query("COMMIT"), sqlCode);
    } finally { await connection.query("ROLLBACK"); connection.release(); }
    await assert.rejects(() => pool.query("INSERT INTO production_schedule_plan_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason) SELECT id,sales_order_id,version-1,'{}',$2,$3,'synthetic','' FROM production_schedule_assignments WHERE id=$1", [firstId, editor.actor.internalUserId, randomUUID()]), sqlCode);
    const snapshotHash = (await request("/assignments/" + firstId)).body.assignment.resourceSnapshotHash;
    await assert.rejects(() => pool.query("UPDATE production_schedule_resource_snapshots SET facts='{}' WHERE hash=$1", [snapshotHash]), sqlCode);
  });
  await t.test("source color collection writes wait for its physical parent freeze", async () => {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN"); await connection.query("SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE", [b]);
      let done = false; const pending = replaceCurrentAinuokeColorSlice(pool, b, [{ sourceLineIdentity: "PARENT-LOCKED", colorName: "富贵红", quantity: 120, deliveryDate: null, sourceHash: "parent-frozen" }]).then(() => { done = true; });
      await waitLock("SELECT id FROM sales_orders WHERE id=%FOR KEY SHARE%"); assert.equal(done, false);
      await connection.query("COMMIT"); await pending;
    } finally { await connection.query("ROLLBACK"); connection.release(); }
  });
  await t.test("direct legacy SQL color deletion also obeys the parent collection fence", async () => {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN"); await connection.query("SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE", [b]);
      let done = false; const pending = pool.query("DELETE FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1", [b]).then(() => { done = true; });
      await waitLock("DELETE FROM ainuoke_sales_order_color_mirrors%"); assert.equal(done, false);
      const before = await connection.query("SELECT color_name FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1", [b]); assert.equal(before.rows.length, 1);
      await connection.query("COMMIT"); await pending;
    } finally { await connection.query("ROLLBACK"); connection.release(); }
  });
  await t.test("master mutation completes before a waiting plan freezes resources and invalidates its preview", async () => {
    const id = await order(), input = await command(await createIntent(id, planData({ executorId: secondGroup.id }))), connection = await pool.connect();
    try {
      await connection.query("BEGIN"); await lockProductionResourceScope(connection, "write");
      let done = false; const pending = request("/commands", input).then(result => { done = true; return result; });
      await waitLock("SELECT pg_advisory_xact_lock_shared(hashtextextended('production-resource-snapshot-v1'%"); assert.equal(done, false);
      await connection.query("UPDATE production_groups SET name='冻结前完成的资料修改',version=version+1 WHERE id=$1", [secondGroup.id]); await connection.query("COMMIT");
      const result = await pending; assert.equal(result.status, 409, result.text); assert.equal(result.body.error.code, "production_plan_preview_changed");
      assert.equal((await request("/orders/" + id)).body.assignments.length, 0);
    } finally { await connection.query("ROLLBACK"); connection.release(); }
  });
  await t.test("move between groups versions both queues and never silently reschedules remaining assignments", async () => {
    const id = await order(), original = await save(await createIntent(id, planData({ executorId: secondGroup.id }))), row = original.assignments[0];
    const oldQueue = await request("/groups/" + secondGroup.id), newQueue = await request("/groups/" + group.id);
    const intent: PlanIntent = { action: "update", orderId: id, expectedPlanVersion: original.orderVersions[0].version, assignmentId: row.id, expectedVersion: row.version, reason: "更换执行方", data: planData() };
    const oldTarget = await command(intent); await save(await createIntent(b));
    assert.equal((await request("/commands", oldTarget)).body.error.code, "production_plan_preview_changed");
    const result = await save(intent); assert.equal(result.assignments.length, 1); assert.equal(result.assignments[0].productionGroupId, group.id);
    assert.equal(result.queueVersions.find((item: { groupId: string }) => item.groupId === secondGroup.id).version, oldQueue.body.version + 1);
    assert.ok(result.queueVersions.find((item: { groupId: string }) => item.groupId === group.id).version > newQueue.body.version);
    const current = await request("/orders/" + id), saved = current.body.assignments[0];
    const stable: PlanIntent = { ...intent, expectedPlanVersion: current.body.order.planVersion, expectedVersion: saved.version };
    const noop = await save(stable); assert.equal(noop.changed, false); assert.equal(noop.operationId, null); assert.equal(noop.assignments.length, 0);
    const invalidColor = await createIntent(id, planData({ colorId: (await request("/orders/" + a)).body.order.colors[0].id }));
    assert.equal((await request("/preview", invalidColor)).body.error.code, "production_order_color_changed");
  });
  await t.test("disabled historical executors stay readable and editable; new adoption and replan are blocked", async () => {
    const id = await order(), currentGroup = await readProductionResource(pool, editor.actor, "groups", secondGroup.id);
    const original = await save(await createIntent(id, planData({ executorId: secondGroup.id }))), row = original.assignments[0];
    const disabled = await changeResource(currentGroup, { enabled: false });
    const newIntent = await createIntent(id, planData({ executorId: secondGroup.id })); assert.equal((await request("/preview", newIntent)).body.error.code, "production_resources_disabled");
    const edit: PlanIntent = { action: "update", orderId: id, expectedPlanVersion: original.orderVersions[0].version, assignmentId: row.id, expectedVersion: row.version, reason: "说明", data: planData({ executorId: secondGroup.id, remark: "保留历史资料" }) };
    const edited = await save(edit); assert.equal(edited.assignments[0].resourceSnapshotHash, row.resourceSnapshotHash);
    const queue = await request("/groups/" + secondGroup.id);
    assert.equal((await request("/preview", { action: "replan", groupId: secondGroup.id, expectedQueueVersion: queue.body.version, anchorDate: "2027-01-04", orderedAssignmentIds: null })).body.error.code, "production_resources_disabled");
    await changeResource(disabled, { enabled: true });
  });
  await t.test("fresh revocation blocks saving a cached preview and reading its command receipt", async () => {
    const id = await order(), input = await command(await createIntent(id), other.cookie);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='schedule.create'", [other.roleId]);
    assert.equal((await request("/commands", input, other.cookie)).status, 403);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='schedule.edit'", [other.roleId]);
    assert.equal((await request("/commands/" + input.requestId, undefined, other.cookie)).status, 403);
    await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'schedule.create'),($1,'schedule.edit')", [other.roleId]);
  });
  await t.test("fresh actor waits for the role lock and sees revoked permission before any planning write", async () => {
    const id = await order(), input = await command(await createIntent(id), other.cookie), connection = await pool.connect();
    try {
      await connection.query("BEGIN"); await connection.query("SELECT id FROM app_roles WHERE id=$1 FOR UPDATE", [other.roleId]);
      const pending = request("/commands", input, other.cookie); await waitLock("SELECT r.id FROM app_roles r JOIN app_user_roles%FOR SHARE OF r%");
      await connection.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='schedule.create'", [other.roleId]); await connection.query("COMMIT");
      assert.equal((await pending).status, 403); assert.equal((await request("/orders/" + id)).body.order.planVersion, 0);
      assert.equal((await pool.query("SELECT count(*)::int n FROM production_schedule_commands WHERE actor_id=$1 AND request_id=$2", [other.actor.internalUserId, input.requestId])).rows[0].n, 0);
    } finally { await connection.query("ROLLBACK"); connection.release(); await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'schedule.create') ON CONFLICT DO NOTHING", [other.roleId]); }
  });
  await t.test("effective plan freezes a different physical source owner; source refresh never moves old delivery demand", async () => {
    // Synthetic historical metadata fixture, not the guarded normalization
    // execution service and not authorization to normalize any real order.
    const source = await order(), target = (await createSalesOrder(pool, { creationSource: "manual" })).id, pair = [source, target].sort();
    const sourcePlan = await save(await createIntent(source, planData({ executorId: secondGroup.id, plannedQuantity: "7" })));
    const caseId = (await pool.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, editor.actor.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
    await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic old identity','{}')", [caseId, editor.actor.internalUserId, randomUUID(), "b".repeat(64)]);
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN"); await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
      const change = (await connection.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic old identity') RETURNING id", [caseId, editor.actor.internalUserId, randomUUID(), "d".repeat(64)])).rows[0].id;
      for (const id of pair) await connection.query("INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_version) VALUES($1,$2,$3,0)", [change, id, target]);
      for (const id of pair) await writeAttributionHeadInTransaction(connection, change, id); await connection.query("COMMIT");
      const read = await request("/orders/" + target); assert.equal(read.body.order.quantity, "100"); assert.deepEqual(read.body.order.deliveryPlans, []);
      const colorId = read.body.order.colors[0].id, input = await command(await createIntent(target, planData({ executorId: secondGroup.id, colorId })));
      const lockName = "synthetic-production-plan-pause-" + randomUUID();
      await connection.query("BEGIN"); await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [lockName]);
      await pool.query(`CREATE FUNCTION synthetic_plan_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='ScheduleAssignment' AND NEW.after_data->>'orderId'='${target}' THEN PERFORM pg_advisory_xact_lock(hashtextextended('${lockName}',0)); END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_plan_pause BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_plan_pause()`);
      let planDone = false, sourceDone = false;
      const pending = request("/commands", input).then(value => { planDone = true; return value; });
      await waitLock("INSERT INTO operation_logs%");
      const refreshed = replaceCurrentAinuokeColorSlice(pool, source, [{ sourceLineIdentity: "PHYSICAL-SOURCE-REFRESH", colorName: "蓝色", quantity: 120, deliveryDate: "2027-02-03", sourceHash: "physical-new" }]).then(() => { sourceDone = true; });
      await waitLock("SELECT id FROM sales_orders WHERE id=%FOR KEY SHARE%"); assert.equal(planDone, false); assert.equal(sourceDone, false);
      await connection.query("COMMIT"); const saved = await pending; assert.equal(saved.status, 200, saved.text); await refreshed;
      const details = await request("/assignments/" + saved.body.assignments[0].id); assert.equal(details.body.assignment.colorId, colorId); assert.equal(details.body.assignment.colorNameSnapshot, "富贵红");
      const current = await request("/orders/" + target); assert.equal(current.body.order.colors[0].colorName, "蓝色"); assert.deepEqual(current.body.order.deliveryPlans, []);
      assert.equal(current.body.summary.plannedQuantity, "30");
      const sourceRead = await request("/orders/" + source); assert.equal(sourceRead.body.summary.plannedQuantity, "7"); assert.equal(sourceRead.body.canEdit, false);
      const queueRead = await request("/groups/" + secondGroup.id);
      assert.ok(queueRead.body.assignments.some((row: { id: string }) => row.id === sourcePlan.assignments[0].id));
      assert.equal(queueRead.body.ordersById[source].eligible, false); assert.equal(queueRead.body.ordersById[source].effectiveOrderId, target);
      assert.equal((await request("/orders?allocation=all&search=" + sourceRead.body.order.orderNo)).body.total, 0);
      assert.equal((await pool.query("SELECT quantity::text FROM sales_order_delivery_plans WHERE sales_order_id=$1", [source])).rows[0].quantity, "100");
      await pool.query("DROP TRIGGER synthetic_plan_pause ON operation_logs; DROP FUNCTION synthetic_plan_pause()");
      // Reverse ordering: a committed source mutation must invalidate the old
      // preview after the plan has waited for that physical parent.
      const stale = await command(await createIntent(target, planData({ executorId: secondGroup.id })));
      await connection.query("BEGIN"); await connection.query("SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE", [source]);
      const waiting = request("/commands", stale); await waitLock("SELECT id::text FROM sales_orders WHERE id IN%FOR UPDATE%");
      await connection.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=121 WHERE sales_order_id=$1", [source]); await connection.query("COMMIT");
      assert.equal((await waiting).body.error.code, "production_plan_preview_changed");
    } finally {
      await connection.query("ROLLBACK"); connection.release();
      await pool.query("DROP TRIGGER IF EXISTS synthetic_plan_pause ON operation_logs; DROP FUNCTION IF EXISTS synthetic_plan_pause()");
    }
  });
  await t.test("cancel is an appended version; completed orders block all new planning", async () => {
    const id = await order(), created = await save(await createIntent(id)), row = created.assignments[0];
    const cancelled = await save({ action: "cancel", orderId: id, expectedPlanVersion: created.orderVersions[0].version, assignmentId: row.id, expectedVersion: row.version, reason: "取消合成排单" });
    assert.equal(cancelled.assignments[0].status, "cancelled"); assert.equal((await request("/assignments/" + row.id)).body.history.length, 2);
    await pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1", [id]);
    assert.equal((await request("/preview", await createIntent(id))).body.error.code, "production_order_frozen");
  });
  await t.test("batch price preview and multi-order replan lock expanded physical groups in the same global order", async () => {
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push((await createSalesOrder(pool, { creationSource: "ainuoke" })).id);
    ids.sort(); const [sourceTwo, rootOne, rootTwo, sourceOne] = ids;
    // Adversarial physical groups {02,04} and {01,03}; sorting just the roots
    // takes the groups in the opposite order to the globally smallest source.
    for (const [source, root] of [[sourceOne, rootOne], [sourceTwo, rootTwo]]) {
      const key = "SYN-LOCK-" + randomUUID();
      await createOrUpdateSourceLink(pool, { salesOrderId: source, sourceSystem: "ainuoke", sourceEntityType: "sales_contract", externalId: key, salesContractNo: key, insideOrderNo: key });
      await upsertCurrentAinuokeContractMirror(pool, source, { sourceId: key, sourceRowIdentity: key, salesContractNo: key, insideOrderNo: key, lifecycleStatusRaw: "生效", contractDate: "2027-01-01", contractDeliveryDate: "2027-02-01", styleNo: "SYNTHETIC-LOCK", companyNameSnapshot: "Synthetic", customerNameSnapshot: "Synthetic", brandNameSnapshot: "Synthetic", quantity: 100, sourceHash: key, fetchedAt: "2026-10-20T00:00:00Z" });
      const pair = [source, root].sort(), connection = await pool.connect();
      try {
        await connection.query("BEGIN"); await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
        const caseId = (await connection.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, editor.actor.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
        await connection.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic lock fixture','{}')", [caseId, editor.actor.internalUserId, randomUUID(), "b".repeat(64)]);
        const change = (await connection.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic lock fixture') RETURNING id", [caseId, editor.actor.internalUserId, randomUUID(), "d".repeat(64)])).rows[0].id;
        for (const id of pair) await connection.query("INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_version) VALUES($1,$2,$3,0)", [change, id, root]);
        for (const id of pair) await writeAttributionHeadInTransaction(connection, change, id); await connection.query("COMMIT");
      } finally { await connection.query("ROLLBACK"); connection.release(); }
    }
    const queueGroup = await resource("groups", { name: "交错锁验证组", shortName: "锁", enabled: true, productionSiteId: site.id, sortOrder: 2, remark: "" });
    await save(await createIntent(rootOne, planData({ executorId: queueGroup.id }))); await save(await createIntent(rootTwo, planData({ executorId: queueGroup.id })));
    const queue = await request("/groups/" + queueGroup.id), input = await command({ action: "replan", groupId: queueGroup.id, expectedQueueVersion: queue.body.version, anchorDate: "2027-01-04", orderedAssignmentIds: queue.body.assignments.map((row: { id: string }) => row.id).reverse() });
    const pricing = await user("plan.price", [...keys, "quote.view", "quote.order_price.adjust", "commercial.sale.view", "commercial.sale.edit"]), blocker = await pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE", [sourceTwo]);
      const planPending = request("/commands", input); await waitLock("SELECT id::text FROM sales_orders WHERE id IN%FOR UPDATE%");
      const pricePending = previewSaleAdjustment(pool, pricing.actor, { items: [{ salesOrderId: rootOne }, { salesOrderId: rootTwo }], rule: { kind: "amount", value: "-1" } });
      const deadline = Date.now() + 4000; let waiting = 0;
      while (Date.now() < deadline) { waiting = (await pool.query<{ n: number }>("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id::text FROM sales_orders WHERE id IN%FOR UPDATE%'")).rows[0].n; if (waiting === 2) break; await new Promise(done => setTimeout(done, 20)); }
      assert.equal(waiting, 2); await blocker.query("COMMIT");
      const [planned, priced] = await Promise.all([planPending, pricePending]); assert.equal(planned.status, 200, planned.text);
      assert.equal(priced.items.length, 2); assert.ok(priced.items.every(item => item.status === "failed" && item.code === "order_commercial_basis_required"));
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  await t.test("normalization inventories direct and indirect plan bytes but external coverage stays unavailable", async () => {
    const alias = (await createSalesOrder(pool, { creationSource: "manual" })).id, pair = [a, alias].sort();
    const caseId = (await pool.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, editor.actor.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
    await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic','{}')", [caseId, editor.actor.internalUserId, randomUUID(), "b".repeat(64)]);
    const proposal = parseAttributionProposal({ changeType: "normalize", caseVersion: 1, assignments: pair.map(id => ({ originalOrderId: id, effectiveOrderId: a })), reason: "Synthetic", recoveryPlanHash: "c".repeat(64) });
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const inventory = await collectFullNormalizationEvidence(connection, caseId, proposal, { coverage: "unavailable", reason: "not-connected" }); await connection.query("COMMIT");
      assert.deepEqual(inventory.unknownReferences, []); assert.ok(inventory.blockers.includes("production_finance_coverage_unavailable"));
      for (const relation of ["production_schedule_assignments", "production_schedule_plan_versions", "production_schedule_resource_snapshots", "production_schedule_commands", "production_group_plan_heads"]) assert.ok(inventory.references.some(row => row.relation === relation && row.orderId === a && row.count > 0), relation);
      await connection.query("BEGIN"); await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
      const change = (await connection.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic metadata only') RETURNING id", [caseId, editor.actor.internalUserId, randomUUID(), "d".repeat(64)])).rows[0].id;
      for (const id of pair) await connection.query("INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_version) VALUES($1,$2,$3,0)", [change, id, a]);
      for (const id of pair) await writeAttributionHeadInTransaction(connection, change, id); await connection.query("COMMIT");
      assert.equal((await request("/preview", await createIntent(alias))).body.error.code, "historical_duplicate_order_read_only");
      await assert.rejects(() => pool.query("INSERT INTO production_order_plan_heads(sales_order_id,version) VALUES($1,1)", [alias]), (e: unknown) => (e as { code: string }).code === "23514");
    } finally { await connection.query("ROLLBACK"); connection.release(); }
  });
  await t.test("legitimate processing batch plans use non-monetary order facts without commercial permissions", async () => {
    const batchActor = await user("plan.batch", [...keys, "quote.view", "commercial.labor.view", "order.processing.batch.manage", "order.processing.consume"]);
    const quote = createSyntheticQuoteFixture("planning-processing-synthetic", "processing");
    for (const revision of quote.revisions) { revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; }
    const revision = quote.revisions.find(row => row.revisionId === quote.defaultRevisionId)!, price = revision.priceVersions[0];
    price.pricingParameters.laborCurrency = "USD"; price.confirmation = { quotedGarmentPrice: 99, quotedLaborPrice: 8, confirmedGarmentPrice: null, confirmedLaborPrice: 8, note: "Synthetic", confirmedAt: "2026-10-20T00:00:00Z" };
    await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(quote));
    const batch = await createProcessingBatch(pool, batchActor.actor, { requestId: randomUUID(), quoteId: quote.id, revisionId: revision.revisionId, priceVersionId: price.id, customerName: "Synthetic", businessStyleNo: "SYN-PROCESS-PLAN", quantity: "70", orderDate: "2027-01-01", deliveryDate: "2027-02-01", customerReference: "", deliveryRequirements: "", referenceOrderId: null });
    const preview = await previewProcessingBatch(pool, batchActor.actor, batch.batchId), confirmed = await confirmProcessingBatch(pool, batchActor.actor, batch.batchId, { requestId: randomUUID(), expectedVersion: batch.version, sourceFingerprint: preview.candidate.fingerprint });
    const consumed = await consumeProcessingBatches(pool, batchActor.actor, { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version }] });
    assert.equal(consumed.results[0].status, "created"); const id = (consumed.results[0] as { salesOrderId: string }).salesOrderId;
    const read = await request("/orders/" + id); assert.equal(read.status, 200, read.text); assert.equal(read.body.order.quantity, "70"); assert.deepEqual(read.body.order.colors, []); assert.equal(read.body.order.styleNo, "SYN-PROCESS-PLAN");
    const result = await save(await createIntent(id)); assert.equal(result.assignments[0].orderId, id);
    assert.equal(/confirmedLabor|laborPrice|salePrice|USD|CNY/u.test(JSON.stringify((await request("/orders/" + id)).body)), false);
    const listed = await request("/orders?allocation=all&search=SYN-PROCESS-PLAN");
    assert.equal(listed.status, 200, listed.text); assert.equal(listed.body.total, 1); assert.equal(listed.body.items[0].businessType, "processing");
    assert.equal(listed.body.items[0].plannedQuantity, "30"); assert.equal(/Labor|salePrice|USD|CNY/u.test(listed.text), false);
  });
  await t.test("browser client previews and verifies actual API create, replay, edit, cancel and replan receipts", async () => {
    const client = createProductionPlanClient(((path, init) => fetch(base + String(path), { ...init,
      headers: { ...init?.headers, Cookie: editor.cookie, Origin: base } })) as typeof fetch);
    const id = await order(), clientGroup = await resource("groups", { name: "客户端合成组", shortName: "客户端", enabled: true, productionSiteId: site.id, sortOrder: 3, remark: "" });
    const intent = await createIntent(id, planData({ executorId: clientGroup.id })), previewed = await client.preview(intent);
    const input = { requestId: randomUUID(), intent: previewed.intent, previewHash: previewed.previewHash };
    assert.equal(await productionPlanFingerprint(input), planHash(input));
    const created = await client.execute(input); assert.equal(created.status, "applied"); if (created.status !== "applied") assert.fail();
    assert.equal(created.assignments[0].orderId, id); assert.equal((await client.execute(input)).replayed, true);
    assert.equal((await client.receipt(input)).state, "known");
    const first = created.assignments[0], next = { action: "update" as const, orderId: id, assignmentId: first.id, expectedVersion: first.version, expectedPlanVersion: created.orderVersions[0].version,
      data: planData({ executorId: clientGroup.id, remark: "合成客户端修改" }), reason: "合成验证" };
    const editPreview = await client.preview(next), edited = await client.execute({ requestId: randomUUID(), intent: editPreview.intent, previewHash: editPreview.previewHash });
    assert.equal(edited.status, "applied"); if (edited.status !== "applied") assert.fail();
    const queue = await request("/groups/" + clientGroup.id), replan = { action: "replan" as const, groupId: clientGroup.id, expectedQueueVersion: queue.body.version, anchorDate: "2027-01-11", orderedAssignmentIds: null };
    const queuePreview = await client.preview(replan), replanned = await client.execute({ requestId: randomUUID(), intent: queuePreview.intent, previewHash: queuePreview.previewHash });
    assert.equal(replanned.status, "applied"); if (replanned.status !== "applied") assert.fail();
    // The original formula retains the saved first start. A new fallback anchor
    // alone is a legitimate no-op, not a synthetic assignment revision.
    assert.equal(replanned.changed, false); assert.deepEqual(replanned.assignments, []);
    const live = edited.assignments[0], cancel = { action: "cancel" as const, orderId: id, assignmentId: live.id, expectedVersion: live.version, expectedPlanVersion: replanned.orderVersions[0].version, reason: "合成取消" };
    const cancelPreview = await client.preview(cancel), cancelled = await client.execute({ requestId: randomUUID(), intent: cancelPreview.intent, previewHash: cancelPreview.previewHash });
    assert.equal(cancelled.status, "applied"); if (cancelled.status === "applied") assert.equal(cancelled.assignments[0].status, "cancelled");
    const staleInput = { ...input, requestId: randomUUID() }, rejected = await client.execute(staleInput);
    assert.equal(rejected.status, "rejected"); assert.equal((await client.receipt(staleInput)).state, "known");
  });
  await t.test("directory queries enforce live grants, session and strict query boundaries", async () => {
    for (const path of ["/orders", "/groups"]) {
      assert.equal((await request(path, undefined, null)).status, 401); assert.equal((await request(path, undefined, quoteOnly.cookie)).status, 403);
      assert.equal((await request(path, undefined, viewer.cookie)).status, 200);
      assert.equal((await request(path + "?limit=101")).status, 400); assert.equal((await request(path + "?search=a&search=b")).status, 400);
    }
    const revoked = await user("plan.revoked.directory", ["order.view", "schedule.view"]);
    assert.equal((await request("/orders", undefined, revoked.cookie)).status, 200);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='schedule.view'", [revoked.roleId]);
    assert.equal((await request("/orders", undefined, revoked.cookie)).status, 403); assert.equal((await request("/groups", undefined, revoked.cookie)).status, 403);
    assert.equal((await request("/orders?status=all")).status, 400); assert.equal((await request("/groups?allocation=all")).status, 400);
  });
  await t.test("global order totals aggregate internal and outsource plans before filters and paging with exact decimals", async () => {
    const ids = [await order(), await order(), await order()];
    for (const [index, id] of ids.entries()) await pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET inside_order_no=$2,customer_name_snapshot='查询测试客户' WHERE sales_order_id=$1", [id, "POOL-SLICE-" + index]);
    await pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET quantity=9007199254740993.25 WHERE sales_order_id=$1", [ids[0]]);
    await save(await createIntent(ids[0], planData({ executorId: secondGroup.id, plannedQuantity: "9007199254740992.1" })));
    const external = await save(await createIntent(ids[0], planData({ executionType: "outsource", executorId: factory.id, plannedQuantity: "0.15", dates: { mode: "manual_fixed", startDate: "2027-01-04", endDate: "2027-01-05" } })));
    const cancelled = await save(await createIntent(ids[0], planData({ executorId: secondGroup.id, plannedQuantity: "50" })));
    await save({ action: "cancel", orderId: ids[0], assignmentId: cancelled.assignments[0].id, expectedVersion: 1, expectedPlanVersion: cancelled.orderVersions[0].version, reason: "合成取消不计量" });
    await save(await createIntent(ids[1], planData({ executorId: secondGroup.id, plannedQuantity: "100.25" })));
    const first = await request("/orders?search=POOL-SLICE%20查询测试&limit=1");
    assert.equal(first.status, 200, first.text); assert.equal(first.body.total, 2); assert.equal(first.body.items.length, 1); assert.equal(first.body.hasMore, true);
    const second = await request("/orders?search=POOL-SLICE%20查询测试&limit=1&offset=1");
    assert.equal(second.body.total, 2); assert.equal(second.body.hasMore, false); assert.notEqual(first.body.items[0].id, second.body.items[0].id);
    const beyond = await request("/orders?search=POOL-SLICE&offset=99"); assert.equal(beyond.body.total, 2); assert.deepEqual(beyond.body.items, []);
    const all = await request("/orders?allocation=all&search=POOL-SLICE"); assert.equal(all.body.total, 3);
    const large = all.body.items.find((row: { id: string }) => row.id === ids[0]);
    assert.equal(large.quantity, "9007199254740993.25"); assert.equal(large.plannedQuantity, "9007199254740992.25"); assert.equal(large.remainingQuantity, "1"); assert.equal(large.assignmentCount, 2); assert.equal(large.allocationState, "partial");
    const over = (await request("/orders?allocation=overassigned&search=POOL-SLICE")).body;
    assert.equal(over.total, 1); assert.equal(over.items[0].id, ids[1]); assert.equal(over.items[0].overassignedQuantity, "0.25"); assert.equal(over.items[0].remainingQuantity, "0");
    assert.equal((await request("/orders?search=POOL-SLICE%20no-such-token")).body.total, 0);
    assert.equal((await request("/orders?allocation=all&search=9007199254740993.25")).body.total, 0);
    assert.equal((await request("/orders?allocation=all&search=POOL-SLICE%25")).body.total, 0);
    assert.equal(external.assignments[0].executionType, "outsource");
  });
  await t.test("untrusted and unknown order facts remain readable but never advertise executable candidates", async () => {
    const missing = (await createSalesOrder(pool, { creationSource: "manual" })).id;
    const detail = await request("/orders/" + missing); assert.equal(detail.status, 200, detail.text); assert.equal(detail.body.summary.quantity, null);
    assert.equal(detail.body.summary.remainingQuantity, null); assert.equal(detail.body.summary.allocationState, "unknown"); assert.equal(detail.body.canCreate, false); assert.equal(detail.body.canEdit, false);
    const mismatched = (await createSalesOrder(pool, { creationSource: "ainuoke" })).id, fake = randomUUID();
    await pool.query("INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,quantity,source_hash,fetched_at) VALUES($1,$2,$2,$2,'UNTRUSTED-STYLE',100,'synthetic',now())", [mismatched, fake]);
    await createOrUpdateSourceLink(pool, { salesOrderId: mismatched, sourceSystem: "ainuoke", sourceEntityType: "sales_contract", externalId: fake + "-mismatch", salesContractNo: fake });
    const invalid = await request("/orders/" + mismatched); assert.equal(invalid.body.summary.businessType, "unclassified"); assert.equal(invalid.body.canCreate, false);
    const profileOnly = (await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: "synthetic-no-consumption", sourceRevisionId: "R1", sourcePriceVersionId: "V1" })).id;
    await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'processing')", [profileOnly]);
    const unconsumed = await request("/orders/" + profileOnly); assert.equal(unconsumed.body.summary.businessType, "unclassified"); assert.equal(unconsumed.body.canCreate, false); assert.equal(unconsumed.body.canEdit, false);
    const orders = await request("/orders?allocation=all&limit=100"); assert.equal(orders.body.items.some((row: { id: string }) => [missing, mismatched, profileOnly].includes(row.id)), false);
  });
  await t.test("count and page retain one database snapshot when source quantity changes between the two queries", async () => {
    const id = await order(); await pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET inside_order_no='REPEATABLE-POOL' WHERE sales_order_id=$1", [id]);
    let interleaved = false;
    const scopedPool = { connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, { get(target, key) {
        if (key === "query") return async (...args: unknown[]) => {
          const result = await Reflect.apply(target.query, target, args);
          if (typeof args[0] === "string" && args[0].includes("SELECT count(*)::text total FROM filtered")) {
            assert.equal(interleaved, false); interleaved = true;
            await pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET quantity=0 WHERE sales_order_id=$1", [id]);
          }
          return result;
        };
        const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
      } });
    } } as unknown as pg.Pool;
    const result = await listProductionPlanOrders(scopedPool, editor.actor, new URLSearchParams("search=REPEATABLE-POOL"));
    assert.equal(interleaved, true); assert.equal(result.total, 1); assert.equal(result.items[0].quantity, "100"); assert.equal(result.items[0].allocationState, "unassigned");
    assert.equal((await request("/orders?search=REPEATABLE-POOL")).body.total, 0);
    const current = await request("/orders/" + id); assert.equal(current.body.summary.quantity, "0"); assert.equal(current.body.summary.allocationState, "allocated");
  });
  await t.test("group overview retains disabled queues and completed order summaries while using existing natural sort", async () => {
    const group2 = await resource("groups", { name: "读取组2", shortName: "read2", enabled: true, productionSiteId: site.id, sortOrder: 20, remark: "" });
    const group10 = await resource("groups", { name: "读取组10", shortName: "read10", enabled: true, productionSiteId: site.id, sortOrder: 20, remark: "" });
    const unused = await resource("groups", { name: "读取组空停用", shortName: "empty", enabled: false, productionSiteId: site.id, sortOrder: 20, remark: "" });
    const id = await order(); const saved = await save(await createIntent(id, planData({ executorId: group2.id, plannedQuantity: "10.125" })));
    await pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1", [id]);
    await changeResource(group2, { enabled: false });
    const overview = await request("/groups?search=读取组"); assert.equal(overview.status, 200, overview.text); assert.equal(overview.body.total, 2);
    assert.deepEqual(overview.body.items.map((row: { id: string }) => row.id), [group2.id, group10.id]);
    const first = overview.body.items[0]; assert.equal(first.enabled, false); assert.equal(first.canCreate, false); assert.equal(first.plannedQuantity, "10.125"); assert.equal(first.headAssignmentId, saved.assignments[0].id);
    assert.equal(overview.body.ordersById[id].eligible, false); assert.equal(overview.body.ordersById[id].lifecycleState, "completed");
    const queue = await request("/groups/" + group2.id); assert.equal(queue.body.assignments.length, 1); assert.equal(queue.body.ordersById[id].orderNo, overview.body.ordersById[id].orderNo);
    const hidden = await request("/groups?status=all&search=读取组&limit=1&offset=2"); assert.equal(hidden.body.total, 3); assert.equal(hidden.body.items[0].id, unused.id); assert.equal(hidden.body.hasMore, false);
    assert.equal((await request("/orders?allocation=all&search=" + encodeURIComponent(queue.body.ordersById[id].orderNo))).body.total, 0);
  });
  await t.test("history version anchors prevent duplicate pages and resource names come from each adopted snapshot", async () => {
    let historyGroup = await resource("groups", { name: "历史读取原名称", shortName: "history", enabled: true, productionSiteId: site.id, sortOrder: 21, remark: "" });
    const id = await order(); let saved = await save(await createIntent(id, planData({ executorId: historyGroup.id })));
    const assignmentId = saved.assignments[0].id, oldHash = saved.assignments[0].resourceSnapshotHash;
    historyGroup = await changeResource(historyGroup, { name: "历史读取采用后名称" });
    const queue = await request("/groups/" + historyGroup.id);
    saved = await save({ action: "replan", groupId: historyGroup.id, expectedQueueVersion: queue.body.version, anchorDate: "2027-01-04", orderedAssignmentIds: null });
    assert.equal(saved.changed, true); const newHash = saved.assignments[0].resourceSnapshotHash; assert.notEqual(oldHash, newHash);
    for (let index = 0; index < 50; index++) saved = await save({ action: "update", orderId: id, assignmentId, expectedVersion: saved.assignments[0].version, expectedPlanVersion: saved.orderVersions[0].version,
      reason: "合成历史读取", data: planData({ executorId: historyGroup.id, remark: "版本 " + index }) });
    const page1 = await request("/assignments/" + assignmentId); assert.equal(page1.status, 200, page1.text); assert.equal(page1.body.asOfVersion, 52); assert.equal(page1.body.hasMore, true); assert.equal(page1.body.nextOffset, 50);
    assert.equal(page1.body.history.length, 50); assert.deepEqual(page1.body.history.map((row: { version: number }) => row.version), Array.from({ length: 50 }, (_, i) => 52 - i));
    saved = await save({ action: "update", orderId: id, assignmentId, expectedVersion: 52, expectedPlanVersion: saved.orderVersions[0].version, reason: "翻页期间追加", data: planData({ executorId: historyGroup.id, remark: "追加53" }) });
    await changeResource(historyGroup, { name: "当前主数据名称不能补造历史" });
    const page2 = await request("/assignments/" + assignmentId + "?offset=50&asOfVersion=52");
    assert.equal(page2.body.assignment.version, 53); assert.equal(page2.body.asOfVersion, 52); assert.equal(page2.body.hasMore, false); assert.equal(page2.body.nextOffset, null);
    assert.deepEqual(page2.body.history.map((row: { version: number }) => row.version), [2, 1]);
    assert.equal(page2.body.resources[oldHash].group.name, "历史读取原名称"); assert.equal(page2.body.resources[newHash].group.name, "历史读取采用后名称");
    assert.equal(page2.text.includes("当前主数据名称不能补造历史"), false); assert.equal((await request("/assignments/" + assignmentId + "?asOfVersion=54")).status, 400);
    assert.equal((await request("/assignments/" + assignmentId + "?offset=99&asOfVersion=52")).body.history.length, 0);
  });
  await t.test("cross-order capacity changes produce durable 422 rejection receipts and allow a new preview elsewhere", async () => {
    const crowded = await resource("groups", { name: "合成容量边界组", shortName: "capacity", enabled: true, productionSiteId: site.id, sortOrder: 50, remark: "" });
    const bulkOrder = await order(), target = await order();
    const fixed = planData({ executorId: crowded.id, plannedQuantity: "1", duration: { mode: "workdays", workdays: 1 }, dates: { mode: "manual_fixed", startDate: "2027-01-04", endDate: "2027-01-04" } });
    const first = (await save(await createIntent(bulkOrder, fixed))).assignments[0];
    // Owned synthetic boundary fixture: retain every SQL revision constraint.
    // Seed 498 additional physical rows, then use the real API for row 500.
    const seed = await pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query(`INSERT INTO production_schedule_assignments(sales_order_id,execution_type,production_group_id,planned_quantity,duration_mode,daily_output_snapshot,required_workdays,
        date_mode,planned_start_date,planned_end_date,queue_sequence,resource_snapshot_hash,created_by,updated_by,remark)
        SELECT $1,'internal',$2,1,'workdays',1,1,'manual_fixed','2027-01-04','2027-01-04',i,$3,$4,$4,'Synthetic capacity fixture'
        FROM generate_series(2,499) i`, [bulkOrder, crowded.id, first.resourceSnapshotHash, editor.actor.internalUserId]);
      await seed.query(`INSERT INTO production_schedule_plan_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
        SELECT id,sales_order_id,version,production_plan_row_snapshot(a),$2,gen_random_uuid(),'synthetic-capacity-fixture','Owned test fixture'
        FROM production_schedule_assignments a WHERE sales_order_id=$1 AND id<>$3`, [bulkOrder, editor.actor.internalUserId, first.id]);
      await seed.query("UPDATE production_order_plan_heads SET version=version+1 WHERE sales_order_id=$1", [bulkOrder]);
      await seed.query("UPDATE production_group_plan_heads SET version=version+1 WHERE production_group_id=$1", [crowded.id]);
      await seed.query("COMMIT");
    } finally { await seed.query("ROLLBACK"); seed.release(); }
    const original = await command(await createIntent(target, fixed));
    await save(await createIntent(bulkOrder, fixed));
    const before = await count("production_schedule_assignments"), rejected = await request("/commands", original);
    assert.equal(rejected.status, 422, rejected.text); assert.equal(rejected.body.status, "rejected"); assert.equal(rejected.body.error.code, "production_queue_limit");
    assert.equal(await count("production_schedule_assignments"), before); assert.equal((await request("/orders/" + target)).body.order.planVersion, 0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_schedule_commands WHERE actor_id=$1 AND request_id=$2", [editor.actor.internalUserId, original.requestId])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_schedule_command_orders WHERE actor_id=$1 AND request_id=$2", [editor.actor.internalUserId, original.requestId])).rows[0].n, 0);
    const client = createProductionPlanClient(((path, init) => fetch(base + String(path), { ...init, headers: { ...init?.headers, Cookie: editor.cookie, Origin: base } })) as typeof fetch);
    const receipt = await client.receipt(original); assert.equal(receipt.state, "known"); if (receipt.state === "known") assert.equal(receipt.result.status, "rejected");
    assert.equal((await client.execute(original)).status, "rejected");
    const next = await createIntent(target, planData({ executorId: secondGroup.id })); assert.equal((await save(next)).status, "applied");
  });
  assert.deepEqual(errors.map(error => error.requestId), expectedErrorIds); assert.ok(errors.every(error => error.event === "unhandled_request_error" && error.errorType === "error"));
});
type AssignmentShape = { id: string };

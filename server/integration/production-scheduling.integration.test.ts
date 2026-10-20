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
  });
  assert.deepEqual(errors.map(error => error.requestId), expectedErrorIds); assert.ok(errors.every(error => error.event === "unhandled_request_error" && error.errorType === "error"));
});
type AssignmentShape = { id: string };

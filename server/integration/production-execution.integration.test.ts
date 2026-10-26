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
import { parseProductionResourceCommand, type ProductionResourceType } from "../production-resources/contract.js";
import { executeProductionResourceCommand } from "../production-resources/service.js";
import type { PlanData, PlanIntent } from "../production-scheduling/contract.js";
import type { ExecutionData, ExecutionIntent } from "../production-scheduling/execution-contract.js";
import { planHash } from "../production-scheduling/repository.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { createSalesOrder, replaceCurrentAinuokeColorSlice } from "../sales-orders/repository.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { collectFullNormalizationEvidence } from "../sales-orders/normalization-full-evidence.js";
import { parseAttributionProposal } from "../sales-orders/normalization-execution-model.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createProductionPlanClient } from "../../features/production-scheduling/server/production-plan-client.js";

test("Gate6C execution ledger: actual PostgreSQL, trusted HTTP, original attribution and atomic replanning", { timeout: 240000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("production_execution"), max: 12 });
  const allowedOrigins: string[] = [], errors: Record<string, unknown>[] = [];
  const server = createServer(createApp({ pool, allowedOrigins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: value => errors.push(value) } }));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); try { await pool.end(); } finally { await postgres.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`; allowedOrigins.push(base);
  const all: PermissionKey[] = ["order.view", "schedule.view", "schedule.create", "schedule.edit", "schedule.complete", "ainuoke.sync", "settings.production_infrastructure.edit", "settings.production_group.edit", "settings.outsource_factory.edit"];
  async function user(name: string, permissions: PermissionKey[]) {
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic-execution',gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [name])).rows[0];
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [name]); await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, name]);
    for (const key of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [name, key]);
    const login = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: base, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: name, password: "synthetic-execution" }) }); assert.equal(login.status, 200);
    const actor: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, userName: "UNTRUSTED", username: name, permissions };
    return { actor, cookie: login.headers.get("set-cookie")!.split(";")[0], roleId: name };
  }
  const editor = await user("execution.editor", all), completeOnly = await user("execution.complete", ["order.view", "schedule.view", "schedule.complete"]),
    planOnly = await user("execution.plan", ["order.view", "schedule.view", "schedule.create", "schedule.edit"]), viewer = await user("execution.viewer", ["order.view", "schedule.view"]);
  async function request(path: string, body?: unknown, cookie: string | null = editor.cookie, headers: Record<string, string> = {}) {
    const response = await fetch(base + "/api/v1/production-scheduling" + path, { method: body === undefined ? "GET" : "POST", headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { Origin: base, "Content-Type": "application/json", "X-Zhixu-Request": "1" }), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const text = await response.text(); return { status: response.status, body: JSON.parse(text), text };
  }
  async function resource(kind: ProductionResourceType, data: unknown) {
    const result = await executeProductionResourceCommand(pool, editor.actor, parseProductionResourceCommand({ requestId: randomUUID(), action: "create", kind, resourceId: null, expectedVersion: 0, data }));
    assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail(); return result.resource;
  }
  const calendar = await resource("calendars", { name: "执行合成日历", enabled: true, remark: "", workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
  const site = await resource("sites", { name: "执行合成地点", enabled: true, remark: "", countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
  let serial = 0;
  const group = () => resource("groups", { name: "执行合成组" + ++serial, enabled: true, remark: "", shortName: "合成", productionSiteId: site.id, sortOrder: serial });
  const factory = await resource("factories", { name: "执行合成外发厂", enabled: true, remark: "", shortName: "合成", contactPerson: "", phone: "" });
  async function order() {
    const n = ++serial;
    const result = await createAinuokeSalesOrder(pool, editor.actor, { source: { sourceId: "EXEC-" + n, sourceRowIdentity: "EXEC-ROW-" + n, salesContractNo: "SYN-EXEC-" + n, insideOrderNo: "SYN-FACTORY-" + n,
      lifecycleStatusRaw: "生效", contractDate: "2027-01-01", contractDeliveryDate: "2027-02-01", styleNo: "SYNTHETIC-EXEC", companyNameSnapshot: "Synthetic", customerNameSnapshot: "Synthetic", brandNameSnapshot: "Synthetic", quantity: 100, sourceHash: "SYN-EXEC-HASH-" + n, fetchedAt: "2026-10-21T00:00:00Z" },
    colors: [{ sourceLineIdentity: "EXEC-COLOR-" + n, colorName: "红色", quantity: 100, deliveryDate: "2027-02-01", sourceHash: "EXEC-COLOR-HASH-" + n }] }); return result.salesOrder.id;
  }
  async function savePlan(intent: PlanIntent) {
    const preview = await request("/preview", intent); assert.equal(preview.status, 200, preview.text);
    const result = await request("/commands", { requestId: randomUUID(), intent: preview.body.intent, previewHash: preview.body.previewHash }); assert.equal(result.status, 200, result.text); return result.body;
  }
  async function create(orderId: string, executorId: string, patch: Partial<PlanData> = {}) {
    const current = await request("/orders/" + orderId);
    const result = await savePlan({ action: "create", orderId, assignmentId: null, expectedVersion: 0, expectedPlanVersion: current.body.order.planVersion,
      data: { executionType: "internal", executorId, colorId: null, plannedQuantity: "30", duration: { mode: "workdays", workdays: 2 }, dates: { mode: "auto_queue", startDate: "2027-01-04" }, remark: "", ...patch } });
    return result.assignments[0].id as string;
  }
  async function intent(id: string, data: Partial<ExecutionData> = {}, replan = false, reason = ""): Promise<ExecutionIntent> {
    const read = await request("/assignments/" + id), row = read.body.assignment, order = await request("/orders/" + row.orderId);
    return { action: "record_execution", orderId: row.orderId, assignmentId: id, expectedAssignmentVersion: row.version, expectedExecutionVersion: read.body.execution?.version ?? 0,
      expectedPlanVersion: order.body.order.planVersion, data: { status: "in_progress", completedQuantity: "10.125", actualStartDate: null, actualCompletedDate: null, ...data }, reason,
      replan: replan ? { expectedQueueVersion: (await request("/groups/" + row.productionGroupId)).body.version } : null };
  }
  async function command(input: ExecutionIntent, cookie = editor.cookie) {
    const preview = await request("/execution/preview", input, cookie); assert.equal(preview.status, 200, preview.text);
    return { requestId: randomUUID(), intent: preview.body.intent as ExecutionIntent, previewHash: preview.body.previewHash as string };
  }
  async function save(input: ExecutionIntent, cookie = editor.cookie) {
    const value = await command(input, cookie), reply = await request("/execution/commands", value, cookie); assert.equal(reply.status, 200, reply.text); return { value, ...reply.body };
  }
  const a = await order(), g = await group(), first = await create(a, g.id);
  await t.test("empty/idempotent execution schema; domain/mutation/payload boundaries and complete-only grant", async () => {
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_schedule_executions")).rows[0].n, 0);
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []);
    const value = await intent(first);
    assert.equal((await request("/execution/preview", value, null)).status, 401);
    for (const cookie of [viewer.cookie, planOnly.cookie]) assert.equal((await request("/execution/preview", value, cookie)).status, 403);
    assert.equal((await request("/execution/preview", value, editor.cookie, { Origin: "https://invalid.example" })).status, 403);
    assert.equal((await request("/execution/preview", { ...value, actorId: editor.actor.userId })).status, 400);
    assert.equal((await request("/execution/preview", { ...value, data: { ...value.data, completedQuantity: "1e3" } })).status, 400);
    assert.equal((await request("/execution/preview?actor=spoof", value)).status, 400);
    const saved = await save(value, completeOnly.cookie);
    assert.equal(saved.execution.completedQuantity, "10.125"); assert.equal(saved.execution.actualStartDate, null);
    assert.equal((await request("/commands/" + saved.value.requestId, undefined, completeOnly.cookie)).body.result.execution.version, 1);
    assert.equal((await request("/commands/" + saved.value.requestId)).body.state, "unknown");
    assert.equal((await pool.query("SELECT count(*)::int n FROM sales_order_commercial_versions")).rows[0].n, 0);
    assert.equal(/confirmedLabor|salePrice|USD|CNY/u.test(JSON.stringify(saved)), false);
  });
  await t.test("same request concurrent and lost receipt replay has one immutable event; no-op and changed-content conflict", async () => {
    const value = await command(await intent(first, { completedQuantity: "20.25", actualStartDate: "2027-01-04" }));
    const replies = await Promise.all([request("/execution/commands", value), request("/execution/commands", value)]); assert.deepEqual(replies.map(row => row.status), [200, 200]);
    assert.deepEqual(replies.map(row => row.body.replayed).sort(), [false, true]); assert.equal(replies[0].body.payloadHash, planHash(value));
    assert.equal((await request("/execution/commands", value)).body.execution.version, 2);
    assert.equal((await request("/execution/commands", { ...value, previewHash: "0".repeat(64) })).body.error.code, "production_plan_request_conflict");
    const noop = await save(await intent(first, { completedQuantity: "20.25", actualStartDate: "2027-01-04" })); assert.equal(noop.changed, false); assert.equal(noop.operationId, null);
    const history = await request("/executions/" + first); assert.deepEqual(history.body.history.map((row: { version: number }) => row.version), [2, 1]);
    assert.equal(history.body.history[1].snapshot.completed_quantity, "10.125"); assert.equal(history.body.history[0].snapshot.assignment_version, 1);
    const audits = (await pool.query("SELECT actor_name FROM operation_logs WHERE entity_id=$1 AND action='修改完成数量'", [first])).rows;
    assert.deepEqual(audits.map(row => row.actor_name).sort(), ["execution.complete", "execution.editor"]);
  });
  await t.test("reductions/date corrections/reopen require reason; zero correction never unlocks executor or color", async () => {
    const reduce = await intent(first, { completedQuantity: "0", actualStartDate: "2027-01-04" });
    assert.equal((await request("/execution/preview", reduce)).body.error.code, "production_execution_reason_required");
    await save({ ...reduce, reason: "合成更正" });
    const read = await request("/assignments/" + first), current = await request("/orders/" + a), another = await group();
    const data: PlanData = { executionType: "internal", executorId: another.id, colorId: null, plannedQuantity: "30", duration: { mode: "workdays", workdays: 2 }, dates: { mode: "auto_queue", startDate: read.body.assignment.plannedStartDate }, remark: "" };
    const edit = { action: "update", orderId: a, assignmentId: first, expectedVersion: read.body.assignment.version, expectedPlanVersion: current.body.order.planVersion, data, reason: "更正不允许搬产出" };
    assert.equal((await request("/preview", edit)).body.error.code, "production_execution_attribution_locked");
    assert.equal((await request("/preview", { ...edit, data: { ...data, executorId: g.id, colorId: current.body.order.colors[0].id } })).body.error.code, "production_execution_attribution_locked");
    const completed = await save(await intent(first, { status: "completed", completedQuantity: "35.25", actualStartDate: "2027-01-04", actualCompletedDate: "2027-01-06" }));
    assert.equal(completed.execution.completedQuantity, "35.25");
    const reopen = await intent(first, { completedQuantity: "35.25", actualStartDate: "2027-01-04" });
    assert.equal((await request("/execution/preview", reopen)).body.error.code, "production_execution_reason_required");
    await save({ ...reopen, reason: "重新登记在制" });
    const correction = await intent(first, { completedQuantity: "35.25", actualStartDate: "2027-01-05" });
    assert.equal((await request("/execution/preview", correction)).body.error.code, "production_execution_reason_required");
  });
  await t.test("cancel retains original output; released remainder is new assignment and exact totals precede filtering", async () => {
    const row = (await request("/assignments/" + first)).body.assignment, current = await request("/orders/" + a);
    const cancel: PlanIntent = { action: "cancel", orderId: a, assignmentId: first, expectedVersion: row.version, expectedPlanVersion: current.body.order.planVersion, reason: "剩余另排" };
    assert.equal((await request("/preview", { ...cancel, reason: "" })).body.error.code, "production_execution_reason_required");
    await savePlan(cancel);
    const after = await request("/orders/" + a); assert.equal(after.body.summary.completedQuantity, "35.25"); assert.equal(after.body.summary.plannedQuantity, "0");
    assert.equal(after.body.summary.outstandingPlannedQuantity, "0"); assert.equal(after.body.summary.remainingQuantity, "64.75");
    const next = await create(a, g.id, { plannedQuantity: "64.75" }); assert.notEqual(first, next);
    const listed = await request("/orders?allocation=allocated&search=" + after.body.order.orderNo); assert.equal(listed.body.total, 1); assert.equal(listed.body.items[0].accountedQuantity, "100");
    const history = await request("/executions/" + first); assert.equal(history.body.execution.completedQuantity, "35.25"); assert.equal(history.body.assignment.status, "cancelled");
    const correction = await intent(first, { completedQuantity: "35.25", actualStartDate: "2027-01-04" });
    assert.equal((await request("/execution/preview", { ...correction, data: { ...correction.data, completedQuantity: "35" } })).body.error.code, "production_execution_reason_required");
    const never = await create(await order(), g.id); const n = (await request("/assignments/" + never)).body.assignment, o = await request("/orders/" + n.orderId);
    await savePlan({ action: "cancel", orderId: n.orderId, assignmentId: never, expectedVersion: n.version, expectedPlanVersion: o.body.order.planVersion, reason: "未开工取消" });
    assert.equal((await request("/execution/preview", await intent(never, {}, false, "无既有执行事实"))).body.error.code, "production_cancelled_assignment_has_no_execution");
  });
  await t.test("completion/replan is explicit dual permission, protects prefix/started/fixed and keeps one operation", async () => {
    const groupRow = await group(), before = await create(await order(), groupRow.id), target = await create(await order(), groupRow.id), downstream = await create(await order(), groupRow.id);
    const fixed = await create(await order(), groupRow.id, { dates: { mode: "manual_fixed", startDate: "2027-02-10", endDate: "2027-02-11" } });
    const started = await create(await order(), groupRow.id); await save(await intent(started, { actualStartDate: "2027-02-12", completedQuantity: "1" }));
    const original = (await request("/groups/" + groupRow.id)).body.assignments;
    const input = await intent(target, { status: "completed", completedQuantity: "25", actualCompletedDate: "2027-01-05" }, true);
    assert.equal((await request("/execution/preview", input, completeOnly.cookie)).status, 403);
    const value = await command(input), preview = await request("/execution/preview", input); assert.deepEqual(preview.body.replannableAssignmentIds, [downstream]);
    const result = await request("/execution/commands", value); assert.equal(result.status, 200, result.text); assert.equal(result.body.execution.status, "completed");
    const queue = (await request("/groups/" + groupRow.id)).body;
    for (const id of [before, target, fixed, started]) assert.deepEqual(queue.assignments.find((row: { id: string }) => row.id === id), original.find((row: { id: string }) => row.id === id));
    assert.equal(queue.assignments.find((row: { id: string }) => row.id === downstream).plannedStartDate, "2027-01-05");
    const events = (await pool.query("SELECT operation_sequence FROM operation_logs WHERE operation_id=$1 ORDER BY operation_sequence", [result.body.operationId])).rows;
    assert.deepEqual(events.map(row => row.operation_sequence), [0, 1]);
    assert.equal((await request("/orders/" + input.orderId)).body.summary.remainingQuantity, "75");
    const plainReplan = { action: "replan", groupId: groupRow.id, expectedQueueVersion: queue.version, anchorDate: "2027-01-04", orderedAssignmentIds: null };
    const normalPreview = await request("/preview", plainReplan); assert.equal(normalPreview.status, 200, normalPreview.text);
    assert.equal(normalPreview.body.changes.some((change: { after: { id: string } }) => [target, started, fixed].includes(change.after.id)), false);
  });
  await t.test("execution invalidates old queue/order preview; source changes give durable rejection; concurrent CAS one winner", async () => {
    const groupRow = await group(), id = await create(await order(), groupRow.id), input = await intent(id);
    const x = await command(input), y = await command(input);
    const replies = await Promise.all([request("/execution/commands", x), request("/execution/commands", y)]); assert.deepEqual(replies.map(row => row.status).sort(), [200, 409]);
    const loser = replies[0].status === 409 ? x : y; assert.equal((await request("/commands/" + loser.requestId)).body.result.status, "rejected");
    assert.equal((await request("/execution/commands", loser)).body.replayed, true);
    const stale = await command(await intent(id, { completedQuantity: "11" }));
    await replaceCurrentAinuokeColorSlice(pool, input.orderId, [{ sourceLineIdentity: "SYN-UPDATED-COLOR", colorName: "蓝色", quantity: 110, deliveryDate: null, sourceHash: "SYN-UPDATE" }]);
    const rejected = await request("/execution/commands", stale); assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, "production_execution_preview_changed");
    assert.equal((await pool.query("SELECT count(*)::int n FROM production_schedule_command_orders WHERE request_id=$1", [stale.requestId])).rows[0].n, 0);
    const q = (await request("/groups/" + groupRow.id)).body, replan: PlanIntent = { action: "replan", groupId: groupRow.id, expectedQueueVersion: q.version, anchorDate: "2027-01-04", orderedAssignmentIds: null };
    const p = await request("/preview", replan); assert.equal(p.status, 200);
    await save(await intent(id, { completedQuantity: "12" }));
    assert.equal((await request("/commands", { requestId: randomUUID(), intent: p.body.intent, previewHash: p.body.previewHash })).body.error.code, "production_queue_version_conflict");
  });
  await t.test("failed audit rolls back actual event, downstream plans, heads, receipt and all audit rows", async () => {
    const groupRow = await group(), id = await create(await order(), groupRow.id); await create(await order(), groupRow.id);
    const value = await command(await intent(id, { status: "completed", completedQuantity: "30", actualCompletedDate: "2027-01-04" }, true));
    const tables = ["production_schedule_assignments", "production_schedule_executions", "production_schedule_execution_versions", "production_schedule_plan_versions", "production_order_plan_heads", "production_group_plan_heads", "production_schedule_commands", "operation_logs"];
    const snapshot = () => Promise.all(tables.map(async table => (await pool.query("SELECT to_jsonb(row)::text bytes FROM " + table + " row ORDER BY bytes")).rows));
    const before = await snapshot();
    await pool.query(`CREATE FUNCTION execution_synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${id}' THEN RAISE EXCEPTION 'synthetic execution audit failure'; END IF; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER execution_synthetic_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION execution_synthetic_audit_failure()");
    try { assert.equal((await request("/execution/commands", value)).status, 500); assert.deepEqual(await snapshot(), before); assert.equal((await request("/commands/" + value.requestId)).body.state, "unknown"); }
    finally { await pool.query("DROP TRIGGER execution_synthetic_audit_failure ON operation_logs"); await pool.query("DROP FUNCTION execution_synthetic_audit_failure()"); }
    assert.equal((await request("/execution/commands", value)).status, 200);
  });
  await t.test("outsource output stays physical, disabled adopted master can complete, no internal replan", async () => {
    const id = await create(await order(), factory.id, { executionType: "outsource", dates: { mode: "manual_fixed", startDate: "2027-01-04", endDate: "2027-01-05" } });
    const { id: resourceId, version, kind, createdAt: _c, updatedAt: _u, ...data } = factory; void _c; void _u;
    await executeProductionResourceCommand(pool, editor.actor, parseProductionResourceCommand({ action: "update", kind, resourceId, expectedVersion: version, requestId: randomUUID(), data: { ...data, enabled: false } }));
    const saved = await save(await intent(id, { status: "completed", completedQuantity: "30.000000001", actualCompletedDate: "2027-01-05" }));
    assert.equal(saved.execution.completedQuantity, "30.000000001"); assert.equal(saved.execution.attribution.outsourceFactoryId, factory.id); assert.deepEqual(saved.queueVersions, []);
    assert.equal((await request("/execution/preview", { ...(await intent(id, { status: "completed", completedQuantity: "30.000000001", actualCompletedDate: "2027-01-05" })), replan: { expectedQueueVersion: 0 } })).body.error.code, "production_internal_queue_required");
  });
  await t.test("existing browser read client accepts a fully ended group without inventing a queue head", async () => {
    const groupRow = await group(), id = await create(await order(), groupRow.id);
    await save(await intent(id, { status: "completed", completedQuantity: "12.5", actualCompletedDate: "2027-01-05" }));
    const client = createProductionPlanClient(((path, init) => fetch(base + String(path), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Cookie: editor.cookie } })) as typeof fetch);
    const result = await client.groups({ search: groupRow.name, status: "all", offset: 0, limit: 50 });
    assert.equal(result.total, 1); const row = result.items[0]; assert.equal(row.assignmentCount, 1); assert.equal(row.pendingAssignmentCount, 0);
    assert.equal(row.headAssignmentId, null); assert.equal(row.plannedThroughDate, null); assert.equal(row.completedQuantity, "12.5"); assert.equal(row.outstandingPlannedQuantity, "0");
    const read = await client.order((await request("/assignments/" + id)).body.assignment.orderId);
    assert.equal(read.summary.completedQuantity, "12.5"); assert.equal(read.summary.remainingQuantity, "87.5");
  });
  await t.test("execution history has its own stable version cursor when new actual events arrive between pages", async () => {
    const id = await create(await order(), (await group()).id);
    const empty = await request("/executions/" + id); assert.equal(empty.body.asOfVersion, 0); assert.equal(empty.body.execution, null); assert.deepEqual(empty.body.history, []);
    for (let quantity = 1; quantity <= 51; quantity++) await save(await intent(id, { completedQuantity: String(quantity) }));
    const page = await request("/executions/" + id); assert.equal(page.body.history.length, 50); assert.equal(page.body.asOfVersion, 51); assert.equal(page.body.hasMore, true);
    await save(await intent(id, { completedQuantity: "52" }));
    const next = await request(`/executions/${id}?offset=${page.body.nextOffset}&asOfVersion=${page.body.asOfVersion}`);
    assert.equal(next.body.execution.version, 52); assert.equal(next.body.asOfVersion, 51); assert.deepEqual(next.body.history.map((row: { version: number }) => row.version), [1]);
    assert.equal(next.body.history[0].snapshot.completed_quantity, "1"); assert.equal(next.body.hasMore, false);
    assert.equal((await request(`/executions/${id}?asOfVersion=999`)).status, 400);
    assert.equal((await request(`/executions/${id}?offset=0&offset=1`)).status, 400);
  });
  await t.test("SQL prevents history deletion, forged attribution, missing intermediate events and reasonless corrections", async () => {
    const client = await pool.connect();
    const rejects = async (sql: string | string[], args: unknown[] = []) => {
      await client.query("BEGIN"); try { await assert.rejects(async () => { for (const statement of Array.isArray(sql) ? sql : [sql]) await client.query(statement, args); await client.query("SET CONSTRAINTS ALL IMMEDIATE"); }, (error: unknown) => (error as { code: string }).code === "23514"); }
      finally { await client.query("ROLLBACK"); }
    };
    try {
      await rejects("DELETE FROM production_schedule_executions WHERE assignment_id=$1", [first]);
      await rejects("DELETE FROM production_schedule_execution_versions WHERE assignment_id=$1", [first]);
      await rejects("DELETE FROM production_schedule_execution_epochs WHERE assignment_id=$1", [first]);
      await rejects("UPDATE production_schedule_execution_versions SET reason='rewritten' WHERE assignment_id=$1", [first]);
      await rejects("UPDATE production_schedule_executions SET sales_order_id=$2,version=version+1 WHERE assignment_id=$1", [first, await order()]);
      await rejects("UPDATE production_schedule_executions SET version=version+1,attribution=attribution||'{\"colorId\":null}'::jsonb||'{\"resourceSnapshotHash\":\"forged\"}'::jsonb WHERE assignment_id=$1", [first]);
      await rejects("UPDATE production_schedule_executions SET version=version+1,assignment_version=(SELECT version FROM production_schedule_assignments WHERE id=$1) WHERE assignment_id=$1", [first]);
      await rejects(["UPDATE production_schedule_executions SET version=version+1,completed_quantity=0,assignment_version=(SELECT version FROM production_schedule_assignments WHERE id=$1) WHERE assignment_id=$1",
        `INSERT INTO production_schedule_execution_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
        SELECT assignment_id,sales_order_id,version,production_execution_row_snapshot(e),updated_by,gen_random_uuid(),'synthetic','' FROM production_schedule_executions e WHERE assignment_id=$1`], [first]);
      const advance = "UPDATE production_schedule_executions SET version=version+1,assignment_version=(SELECT version FROM production_schedule_assignments WHERE id=$1) WHERE assignment_id=$1";
      await rejects([advance, advance, `INSERT INTO production_schedule_execution_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
        SELECT assignment_id,sales_order_id,version,production_execution_row_snapshot(e),updated_by,gen_random_uuid(),'synthetic','only last revision is insufficient' FROM production_schedule_executions e WHERE assignment_id=$1`], [first]);
    } finally { client.release(); }
  });
  await t.test("a stale repeatable-read SQL writer cannot miss the first actual event and move its executor", async () => {
    const originalGroup = await group(), replacement = await group(), id = await create(await order(), originalGroup.id), client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await client.query("SELECT version FROM production_schedule_assignments WHERE id=$1", [id]);
      await save(await intent(id, { completedQuantity: "1" }));
      await assert.rejects(async () => {
        await client.query("UPDATE production_schedule_assignments SET version=version+1,production_group_id=$2 WHERE id=$1", [id, replacement.id]);
        await client.query(`INSERT INTO production_schedule_plan_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
          SELECT id,sales_order_id,version,production_plan_row_snapshot(a),updated_by,gen_random_uuid(),'synthetic-stale','attempted stale move' FROM production_schedule_assignments a WHERE id=$1`, [id]);
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      }, (error: unknown) => ["23514", "40001"].includes((error as { code: string }).code));
    } finally { await client.query("ROLLBACK"); client.release(); }
    assert.equal((await request("/assignments/" + id)).body.assignment.productionGroupId, originalGroup.id);
    assert.equal((await request("/executions/" + id)).body.execution.attribution.productionGroupId, originalGroup.id);
  });
  await t.test("all execution versions enter reference evidence; independent schema/fence guard and frozen orders", async () => {
    const alias = (await createSalesOrder(pool, { creationSource: "manual" })).id, pair = [a, alias].sort(), connection = await pool.connect();
    try {
      const refs = await normalizationReferences(connection); for (const table of ["production_schedule_executions", "production_schedule_execution_versions"]) assert.ok(refs.some(([name]) => name === table));
      const caseId = (await connection.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, editor.actor.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
      await connection.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic','{}')", [caseId, editor.actor.internalUserId, randomUUID(), "b".repeat(64)]);
      const proposal = parseAttributionProposal({ changeType: "normalize", caseVersion: 1, assignments: pair.map(id => ({ originalOrderId: id, effectiveOrderId: a })), reason: "Synthetic", recoveryPlanHash: "c".repeat(64) });
      const inventory = await collectFullNormalizationEvidence(connection, caseId, proposal, { coverage: "unavailable", reason: "not-connected" });
      assert.deepEqual(inventory.unknownReferences, []); assert.ok(inventory.blockers.includes("production_finance_coverage_unavailable"));
      const versions = inventory.references.find(row => row.orderId === a && row.relation === "production_schedule_execution_versions")!; assert.ok(versions.count >= 5);
      assert.ok(inventory.references.some(row => row.orderId === a && row.relation === "production_schedule_execution_epochs" && row.count > 0));
      await connection.query("ALTER TABLE production_schedule_execution_versions RENAME TO execution_versions_guard_synthetic");
      try { await assert.rejects(() => normalizationReferences(connection), (error: unknown) => (error as { code: string }).code === "production_execution_reference_schema_incomplete"); }
      finally { await connection.query("ALTER TABLE execution_versions_guard_synthetic RENAME TO production_schedule_execution_versions"); }
      const pending = await command(await intent(first, { completedQuantity: "35.5", actualStartDate: "2027-01-04" }, false, "取消后更正"));
      await pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1", [a]);
      assert.equal((await request("/execution/commands", pending)).body.error.code, "production_order_frozen");
      assert.equal((await request("/executions/" + first)).status, 200);
    } finally { connection.release(); }
  });
  await t.test("fresh permission revocation also protects saved receipts and never grants monetary access", async () => {
    const id = await create(await order(), (await group()).id), saved = await save(await intent(id), completeOnly.cookie);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='schedule.complete'", [completeOnly.roleId]);
    assert.equal((await request("/commands/" + saved.value.requestId, undefined, completeOnly.cookie)).status, 403);
    assert.equal((await request("/execution/commands", saved.value, completeOnly.cookie)).status, 403);
    assert.equal((await request("/executions/" + id, undefined, viewer.cookie)).status, 200);
    const dual = await user("execution.revocable", ["order.view", "schedule.view", "schedule.complete", "schedule.edit"]);
    const x = await create(await order(), (await group()).id), savedDual = await save(await intent(x, { status: "completed", actualCompletedDate: "2027-01-06" }, true), dual.cookie);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='schedule.edit'", [dual.roleId]);
    assert.equal((await request("/commands/" + savedDual.value.requestId, undefined, dual.cookie)).status, 403);
    assert.equal((await request("/execution/commands", savedDual.value, dual.cookie)).status, 403);
  });
  assert.equal(errors.length, 1, JSON.stringify(errors));
});

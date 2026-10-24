import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { createProductionPlanClient } from "../../features/production-scheduling/server/production-plan-client.js";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { parseProductionResourceCommand, type ProductionResourceType } from "../production-resources/contract.js";
import { executeProductionResourceCommand } from "../production-resources/service.js";
import type { PlanIntent } from "../production-scheduling/contract.js";
import { executeProductionPlan, previewProductionPlan, readOrderProductionPlans } from "../production-scheduling/service.js";
import { readOrderPlanFacts } from "../production-scheduling/repository.js";
import { executeProductionExecution, previewProductionExecution } from "../production-scheduling/execution-service.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { readDeliveryPlanSet } from "../sales-orders/delivery-plan-repository.js";
import { updateDeliveryPlans } from "../sales-orders/delivery-plan-service.js";
import { writeAttributionHeadInTransaction } from "../sales-orders/effective-attribution.js";
import { startDisposablePostgres } from "./postgres-container.js";

const code = (expected: string) => (error: unknown) => (error as { code: string }).code === expected;

test("current-fact delivery coverage: real PostgreSQL snapshots and original non-monetary detail GET", { timeout: 180000 }, async t => {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase("delivery_coverage"), max: 8 });
  t.after(async () => { try { await pool.end(); } finally { await db.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  const permissions: PermissionKey[] = ["order.view", "order.edit", "schedule.view", "schedule.create", "schedule.edit", "schedule.complete", "ainuoke.sync",
    "settings.production_infrastructure.edit", "settings.production_group.edit", "settings.outsource_factory.edit"];
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('coverage.editor',crypt('synthetic',gen_salt('bf',4)),'交期合成用户','viewer') RETURNING id::text,public_id::text")).rows[0];
  await pool.query("INSERT INTO app_roles(id,name) VALUES('coverage.role','交期合成角色')");
  await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'coverage.role')", [user.id]);
  for (const permission of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('coverage.role',$1)", [permission]);
  const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "coverage.editor", userName: "untrusted", permissions };
  async function resource(kind: ProductionResourceType, data: unknown) {
    const saved = await executeProductionResourceCommand(pool, actor, parseProductionResourceCommand({ requestId: randomUUID(), action: "create", kind, resourceId: null, expectedVersion: 0, data }));
    assert.equal(saved.status, "applied"); if (saved.status !== "applied") assert.fail(); return saved.resource;
  }
  const calendar = await resource("calendars", { name: "交期日历", enabled: true, remark: "", workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
  const site = await resource("sites", { name: "交期地点", enabled: true, remark: "", countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
  const group = await resource("groups", { name: "交期组", enabled: true, remark: "", shortName: "交期", productionSiteId: site.id, sortOrder: 0 });
  const factory = await resource("factories", { name: "交期外发厂", enabled: true, remark: "", shortName: "外发", contactPerson: "", phone: "" });
  let serial = 0;
  async function order(deliveryDate: string | null = "2027-01-10") {
    const n = ++serial, created = await createAinuokeSalesOrder(pool, actor, { source: { sourceId: "COV-" + n, sourceRowIdentity: "COV-ROW-" + n,
      salesContractNo: "SYN-COV-" + n, insideOrderNo: "SYN-COV-FACTORY-" + n, lifecycleStatusRaw: "生效", contractDate: "2027-01-01", contractDeliveryDate: deliveryDate,
      styleNo: "SYNTHETIC-COVERAGE", companyNameSnapshot: "Synthetic", customerNameSnapshot: "Synthetic", brandNameSnapshot: "Synthetic", quantity: 100,
      sourceHash: "COV-HASH-" + n, fetchedAt: "2026-10-22T00:00:00Z" }, colors: [] });
    return created.salesOrder.id;
  }
  const read = (id: string) => readOrderProductionPlans(pool, actor, id);
  async function demands(id: string, rows: { deliveryDate: string; quantity: string }[]) {
    const current = await readDeliveryPlanSet(pool, id);
    return updateDeliveryPlans(pool, actor, id, { requestId: randomUUID(), expectedVersion: current.version,
      upserts: rows.map(row => ({ id: null, ...row })), voidIds: current.plans.filter(row => row.voidedAt === null).map(row => row.id) });
  }
  async function savePlan(intent: PlanIntent) {
    const preview = await previewProductionPlan(pool, actor, intent), saved = await executeProductionPlan(pool, actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
    assert.equal(saved.status, "applied"); if (saved.status !== "applied") assert.fail(); return saved;
  }
  async function create(id: string, quantity: string, endDate: string, outsource = false) {
    const current = await read(id), saved = await savePlan({ action: "create", orderId: id, assignmentId: null, expectedVersion: 0, expectedPlanVersion: current.order.planVersion,
      data: { executionType: outsource ? "outsource" : "internal", executorId: outsource ? factory.id : group.id, colorId: null, plannedQuantity: quantity,
        duration: { mode: "workdays", workdays: 1 }, dates: { mode: "manual_fixed", startDate: endDate, endDate }, remark: "合成" } });
    return saved.assignments[0].id;
  }
  async function complete(id: string, assignmentId: string, quantity: string, ended = false, reason = "") {
    const current = await read(id), assignment = current.assignments.find(row => row.id === assignmentId)!;
    const intent = { action: "record_execution", orderId: id, assignmentId, expectedAssignmentVersion: assignment.version,
      expectedExecutionVersion: current.executions[assignmentId]?.version ?? 0, expectedPlanVersion: current.order.planVersion,
      data: { completedQuantity: quantity, status: ended ? "completed" : "in_progress", actualStartDate: null, actualCompletedDate: ended ? "2027-01-11" : null }, reason, replan: null };
    const preview = await previewProductionExecution(pool, actor, intent), saved = await executeProductionExecution(pool, actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
    assert.equal(saved.status, "applied");
  }
  async function cancel(id: string, assignmentId: string) {
    const current = await read(id), row = current.assignments.find(row => row.id === assignmentId)!;
    await savePlan({ action: "cancel", orderId: id, assignmentId, expectedVersion: row.version, expectedPlanVersion: current.order.planVersion, reason: "剩余另排" });
  }
  const counts = async () => (await pool.query(`SELECT
    (SELECT count(*) FROM operation_logs)::int audits,(SELECT count(*) FROM production_schedule_commands)::int commands,
    (SELECT count(*) FROM sales_order_delivery_plan_requests)::int receipts,
    (SELECT count(*) FROM production_schedule_execution_versions)::int executions`)).rows[0];

  await t.test("existing GET uses only active DeliveryPlans and returns cumulative exact coverage", async () => {
    const id = await order(); await demands(id, [{ deliveryDate: "2027-01-10", quantity: "20.1" }, { deliveryDate: "2027-01-10", quantity: "9.9" }, { deliveryDate: "2027-01-12", quantity: "70" }]);
    const internal = await create(id, "40", "2027-01-09"), outsourced = await create(id, "50", "2027-01-12", true);
    await complete(id, internal, "10"); await complete(id, outsourced, "5");
    const before = await counts(), result = await read(id); assert.deepEqual(await counts(), before);
    assert.equal(result.deliveryCoverage.completedQuantity, "15"); assert.equal(result.deliveryCoverage.outstandingPlannedQuantity, "75");
    assert.deepEqual(result.deliveryCoverage.checkpoints.map(row => [row.demandQuantity, row.cumulativeDemandQuantity, row.expectedOutstandingQuantity, row.availableQuantity, row.gapQuantity]),
      [["30", "30", "30", "45", "0"], ["70", "100", "75", "90", "10"]]);
    assert.equal(result.deliveryCoverage.checkpoints[0].planIds.length, 2);
    assert.equal(/Price|Currency|CNY|USD|Labor|commercial|CCT/u.test(JSON.stringify(result)), false);
  });
  await t.test("cancelled actual output, completed short output and zero corrections preserve original semantics", async () => {
    const id = await order(), cancelled = await create(id, "40", "2027-01-09"), ended = await create(id, "50", "2027-01-09", true);
    await complete(id, cancelled, "10"); await cancel(id, cancelled); await complete(id, ended, "20", true);
    let result = await read(id); assert.equal(result.deliveryCoverage.completedQuantity, "30"); assert.equal(result.deliveryCoverage.outstandingPlannedQuantity, "0");
    assert.equal(result.deliveryCoverage.checkpoints[0].gapQuantity, "70");
    await complete(id, cancelled, "0", false, "真实更正保留历史归属");
    result = await read(id); assert.equal(result.deliveryCoverage.completedQuantity, "20"); assert.equal(result.deliveryCoverage.checkpoints[0].gapQuantity, "80");
    assert.equal(result.assignments.find(row => row.id === cancelled)!.status, "cancelled");
    // Master disable does not erase adopted facts or block historical reads.
    const factoryData = { name: "交期外发厂", enabled: false, remark: "", shortName: "外发", contactPerson: "", phone: "" };
    const disable = await executeProductionResourceCommand(pool, actor, parseProductionResourceCommand({ requestId: randomUUID(), action: "update", kind: "factories", resourceId: factory.id, expectedVersion: factory.version, data: factoryData }));
    assert.equal(disable.status, "applied");
    assert.equal((await read(id)).deliveryCoverage.completedQuantity, "20");
    const enable = await executeProductionResourceCommand(pool, actor, parseProductionResourceCommand({ requestId: randomUUID(), action: "update", kind: "factories", resourceId: factory.id, expectedVersion: factory.version + 1, data: { ...factoryData, enabled: true } }));
    assert.equal(enable.status, "applied");
  });
  await t.test("missing/undated/voided plans remain unassessed, never using a source-date fallback", async () => {
    const missing = await order(null); assert.equal((await read(missing)).deliveryCoverage.assessment, "unassessed");
    await pool.query("INSERT INTO sales_order_delivery_plans(sales_order_id,is_derived_default,delivery_date,quantity) VALUES($1,true,NULL,10)", [missing]);
    const undated = await read(missing); assert.equal(undated.deliveryCoverage.assessment, "unassessed"); assert.equal(undated.deliveryCoverage.undatedPlans[0].quantity, "10");
    const id = await order(); await demands(id, []); const result = await read(id);
    assert.equal(result.order.deliveryDate, "2027-01-10"); assert.deepEqual(result.order.deliveryPlans, []);
    assert.equal(result.deliveryCoverage.assessment, "unassessed"); assert.deepEqual(result.deliveryCoverage.checkpoints, []);
  });
  await t.test("real READ ONLY REPEATABLE READ never mixes old demand with newly committed execution", async () => {
    const id = await order(), assignment = await create(id, "30", "2027-01-09"); await complete(id, assignment, "10");
    const paused = pauseDeliveryRead(pool), pending = readOrderProductionPlans(paused.pool, actor, id);
    try {
      await Promise.race([paused.reached, pending.then(() => assert.fail("read barrier not reached"))]);
      await demands(id, [{ deliveryDate: "2027-01-10", quantity: "200" }]); await complete(id, assignment, "20");
    } finally { paused.resume(); }
    const old = await pending, fresh = await read(id);
    assert.equal(old.deliveryCoverage.completedQuantity, "10"); assert.equal(old.deliveryCoverage.checkpoints[0].cumulativeDemandQuantity, "100");
    assert.equal(old.deliveryCoverage.checkpoints[0].gapQuantity, "70"); assert.equal(old.summary.completedQuantity, "10");
    assert.equal(fresh.deliveryCoverage.completedQuantity, "20"); assert.equal(fresh.deliveryCoverage.checkpoints[0].cumulativeDemandQuantity, "200");
    assert.equal(fresh.deliveryCoverage.checkpoints[0].gapQuantity, "170");
  });
  await t.test("historical alias output and DeliveryPlans are not combined with its effective root", async () => {
    const alias = await order(), assignment = await create(alias, "30", "2027-01-09"); await complete(alias, assignment, "7");
    const root = (await createSalesOrder(pool, { creationSource: "manual" })).id; await syntheticAlias(pool, actor, alias, root);
    const old = await read(alias), current = await read(root);
    assert.equal(old.order.effectiveOrderId, root); assert.equal(old.deliveryCoverage.completedQuantity, "7");
    assert.equal(old.deliveryCoverage.checkpoints[0].gapQuantity, "70");
    assert.equal(current.order.quantity, "100"); assert.equal(current.deliveryCoverage.completedQuantity, "0");
    assert.equal(current.deliveryCoverage.assessment, "unassessed"); assert.equal(current.assignments.length, 0);
  });
  await t.test("complete capacity is rejected, never silently truncated, without writing receipts or audit", async () => {
    const tooMany = await order(); await pool.query(`INSERT INTO sales_order_delivery_plans(sales_order_id,delivery_date,quantity)
      SELECT $1::uuid,'2027-01-01'::date,1 FROM generate_series(1,1000)`, [tooMany]);
    const before = await counts(); await assert.rejects(() => read(tooMany), code("production_delivery_projection_limit")); assert.deepEqual(await counts(), before);
    const tooLarge = await order(null);
    await pool.query(`INSERT INTO sales_order_delivery_plans(sales_order_id,delivery_date,quantity)
      SELECT $1::uuid,'2027-01-01'::date+n,repeat('9',320)::numeric FROM generate_series(1,1000) n`, [tooLarge]);
    const connection = await pool.connect();
    try { assert.ok(Buffer.byteLength(JSON.stringify(await readOrderPlanFacts(connection, tooLarge))) < 1024 * 1024); } finally { connection.release(); }
    const beforeLarge = await counts(); await assert.rejects(() => read(tooLarge), code("production_plan_read_too_large")); assert.deepEqual(await counts(), beforeLarge);
  });
  await t.test("trusted existing HTTP GET, fresh revoke/archive, no-store and no write or new money grants", async () => {
    const id = await order(), origins: string[] = [], server = createServer(createApp({ pool, allowedOrigins: origins, security: { secureCookies: false, sessionTtlSeconds: 3600 } }));
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`; origins.push(base);
    try {
      const login = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: base, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: "coverage.editor", password: "synthetic" }) });
      assert.equal(login.status, 200); const cookie = login.headers.get("set-cookie")!.split(";")[0], url = base + "/api/v1/production-scheduling/orders/" + id;
      assert.equal((await fetch(url)).status, 401);
      const before = await counts(), response = await fetch(url, { headers: { Cookie: cookie } }); assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal((await response.json()).deliveryCoverage.schemaVersion, "production-delivery-coverage.v1");
      const oldClient = createProductionPlanClient((input, init) => fetch(base + String(input), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Cookie: cookie } }));
      const compatible = await oldClient.order(id); assert.equal(compatible.order.id, id); assert.equal(Object.hasOwn(compatible, "deliveryCoverage"), false);
      assert.deepEqual(await counts(), before); assert.equal((await fetch(url + "?actor=spoof", { headers: { Cookie: cookie } })).status, 400);
      await pool.query("DELETE FROM app_role_permissions WHERE role_id='coverage.role' AND permission_key='schedule.view'");
      await assert.rejects(() => read(id), code("permission_denied")); assert.equal((await fetch(url, { headers: { Cookie: cookie } })).status, 403);
      await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('coverage.role','schedule.view')");
      await pool.query("UPDATE app_users SET archived_at=now(),active=false WHERE id=$1", [actor.internalUserId]);
      await assert.rejects(() => read(id)); assert.equal((await fetch(url, { headers: { Cookie: cookie } })).status, 401);
    } finally { await new Promise<void>(done => server.close(() => done())); }
  });
});

function pauseDeliveryRead(pool: pg.Pool) {
  let arrived!: () => void, resume!: () => void, held = false;
  const reached = new Promise<void>(done => { arrived = done; }), continued = new Promise<void>(done => { resume = done; });
  return { reached, resume, pool: new Proxy(pool, { get(target, key) {
    if (key === "connect") return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, property) {
        if (property === "query") return async (sql: string, values?: unknown[]) => {
          const result = await connection.query(sql, values);
          if (!held && sql.includes("FROM sales_order_delivery_plans WHERE")) { held = true; arrived(); await continued; }
          return result;
        };
        const value = Reflect.get(connection, property); return typeof value === "function" ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } }) };
}

async function syntheticAlias(pool: pg.Pool, actor: TrustedIdentity, alias: string, primary: string) {
  const pair = [alias, primary].sort(), caseId = (await pool.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, actor.internalUserId, randomUUID(), "a".repeat(64)])).rows[0].id;
  await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic only','{}')", [caseId, actor.internalUserId, randomUUID(), "b".repeat(64)]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
    const change = (await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic only') RETURNING id", [caseId, actor.internalUserId, randomUUID(), "c".repeat(64)])).rows[0].id;
    for (const id of pair) await client.query("INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_version) VALUES($1,$2,$3,0)", [change, id, primary]);
    for (const id of pair) await writeAttributionHeadInTransaction(client, change, id); await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

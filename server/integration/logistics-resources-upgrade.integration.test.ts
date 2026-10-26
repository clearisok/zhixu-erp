import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { inspectMigrationStatus, PendingMigrationsError, runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { parseProductionResourceCommand } from "../production-resources/contract.js";
import { parseLogisticsResourceCommand } from "../production-resources/logistics-contract.js";
import { executeProductionResourceCommand, listProductionResources, readProductionResourceReceipt } from "../production-resources/service.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { executeProductionPlan, previewProductionPlan, readOrderProductionPlans } from "../production-scheduling/service.js";
import { executeProductionExecution, previewProductionExecution } from "../production-scheduling/execution-service.js";
import { startDisposablePostgres } from "./postgres-container.js";

test("0036 to 0037 preserves existing plans, actual output, resources, receipts, identities and grants byte-for-byte", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await postgres.createDatabase("logistics_upgrade") });
  t.after(async () => { try { await pool.end(); } finally { await postgres.stop(); } });
  const prefix = await mkdtemp(join(tmpdir(), "zhixu-logistics-prefix36-"));
  try {
    for (const file of await readdir("database/migrations")) if (file.endsWith(".sql") && Number(file.slice(0, 4)) <= 36) await copyFile(join("database/migrations", file), join(prefix, file));
    await runMigrations(pool, prefix);
  } finally {
    const distance = relative(resolve(tmpdir()), resolve(prefix)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance)); await rm(prefix, { recursive: true });
  }
  await synchronizePermissionCatalog(pool);
  const permissions: PermissionKey[] = ["order.view", "ainuoke.sync", "schedule.view", "schedule.create", "schedule.edit", "schedule.complete", "settings.production_infrastructure.edit", "settings.production_group.edit"];
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('logistics.upgrade','unused','合成升级','viewer') RETURNING id::text,public_id::text")).rows[0];
  await pool.query("INSERT INTO app_roles(id,name) VALUES('logistics.upgrade','合成升级角色')"); await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'logistics.upgrade')", [user.id]);
  for (const permission of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('logistics.upgrade',$1)", [permission]);
  const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "logistics.upgrade", userName: "UNTRUSTED", permissions };
  async function resource(kind: "calendars" | "sites" | "groups", data: unknown) {
    const command = parseProductionResourceCommand({ action: "create", requestId: randomUUID(), kind, resourceId: null, expectedVersion: 0, data });
    const result = await executeProductionResourceCommand(pool, actor, command); assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail(); return { command, ...result };
  }
  const calendar = await resource("calendars", { name: "旧合成日历", enabled: true, remark: "保留", workingWeekdays: [1, 2, 3, 4, 5], exceptions: [{ date: "2027-01-01", type: "non_working", name: "旧假日" }] });
  const site = await resource("sites", { name: "旧合成地点", enabled: true, remark: "保留", countryCode: null, productionCalendarId: calendar.resource.id, preProductionSampleLeadDays: 0 });
  const group = await resource("groups", { name: "旧合成组", enabled: true, remark: "保留", shortName: "旧组", productionSiteId: site.resource.id, sortOrder: 0 });
  const order = await createAinuokeSalesOrder(pool, actor, { source: { sourceId: "SYN-LOGISTICS-UPGRADE", sourceRowIdentity: "SYN-LOGISTICS-UPGRADE-ROW", salesContractNo: "SYN-LOGISTICS-UPGRADE", insideOrderNo: "SYNTHETIC-FACTORY", lifecycleStatusRaw: "生效", contractDate: "2027-01-01", contractDeliveryDate: "2027-02-01", styleNo: "SYNTHETIC", companyNameSnapshot: "Synthetic", customerNameSnapshot: "Synthetic", brandNameSnapshot: "Synthetic", quantity: 100, sourceHash: "synthetic-upgrade-source", fetchedAt: "2026-10-21T00:00:00Z" }, colors: [{ sourceLineIdentity: "SYN-LOGISTICS-COLOR", colorName: "合成红", quantity: 100, deliveryDate: "2027-02-01", sourceHash: "synthetic-upgrade-color" }] });
  const orderId = order.salesOrder.id;
  const planPreview = await previewProductionPlan(pool, actor, { action: "create", orderId, assignmentId: null, expectedVersion: 0, expectedPlanVersion: 0,
    data: { executionType: "internal", executorId: group.resource.id, colorId: null, plannedQuantity: "30", duration: { mode: "workdays", workdays: 2 }, dates: { mode: "auto_queue", startDate: "2027-01-04" }, remark: "保留已排单" } });
  const plan = await executeProductionPlan(pool, actor, { requestId: randomUUID(), intent: planPreview.intent, previewHash: planPreview.previewHash }); assert.equal(plan.status, "applied"); if (plan.status !== "applied") assert.fail();
  const assignment = plan.assignments[0], current = await readOrderProductionPlans(pool, actor, orderId);
  const executionPreview = await previewProductionExecution(pool, actor, { action: "record_execution", orderId, assignmentId: assignment.id, expectedAssignmentVersion: assignment.version,
    expectedExecutionVersion: 0, expectedPlanVersion: current.order.planVersion, data: { status: "in_progress", completedQuantity: "10.125", actualStartDate: "2027-01-04", actualCompletedDate: null }, reason: "", replan: null });
  const execution = await executeProductionExecution(pool, actor, { requestId: randomUUID(), intent: executionPreview.intent, previewHash: executionPreview.previewHash }); assert.equal(execution.status, "applied");
  const tables = (await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(row => row.tablename);
  const snapshot = () => Promise.all(tables.map(async table => ({ table, rows: (await pool.query(`SELECT to_jsonb(row)::text payload FROM "${table}" row ORDER BY payload`)).rows })));
  const before = await snapshot();
  await t.test("old resources work on 0036 while logistics and verify-only startup fail closed", async () => {
    await assert.rejects(() => verifyMigrationsCurrent(pool, resolve("database/migrations")), PendingMigrationsError);
    assert.deepEqual((await inspectMigrationStatus(pool, resolve("database/migrations"))).pending, ["0037_production_logistics_resources.sql"]);
    const receipt = await readProductionResourceReceipt(pool, actor, calendar.command.requestId); assert.equal(receipt.state, "known");
    await assert.rejects(() => listProductionResources(pool, actor, "hubs", { search: "", status: "all", offset: 0, limit: 20 }), { status: 503, code: "production_resources_unavailable" });
    await assert.rejects(() => executeProductionResourceCommand(pool, actor, parseLogisticsResourceCommand({ action: "create", requestId: randomUUID(), kind: "hubs", resourceId: null, expectedVersion: 0, data: { name: "不应写入", enabled: true, remark: "" } })), { status: 503 });
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("the new migration only adds empty logistics tables and expands the receipt kind constraint", async () => {
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, ["0037_production_logistics_resources.sql"]);
    assert.deepEqual(await snapshot(), before); await verifyMigrationsCurrent(pool, resolve("database/migrations"));
    for (const table of ["production_supply_hubs", "production_supply_routes", "production_transport_modes"]) assert.equal((await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0);
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []);
    const replay = await executeProductionResourceCommand(pool, actor, calendar.command); assert.equal(replay.status, "applied"); assert.equal(replay.replayed, true); if (replay.status === "applied") assert.deepEqual(replay.resource, calendar.resource);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await pool.query("SELECT completed_quantity::text FROM production_schedule_executions WHERE assignment_id=$1", [assignment.id])).rows[0].completed_quantity, "10.125");
  });
});

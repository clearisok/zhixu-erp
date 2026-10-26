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
import { parseManagedResourceCommand } from "../production-resources/managed-contract.js";
import { executeProductionResourceCommand, readProductionResourceReceipt } from "../production-resources/service.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { executeProductionPlan, previewProductionPlan, readOrderProductionPlans, readProductionPlanReceipt } from "../production-scheduling/service.js";
import { executeProductionExecution, previewProductionExecution } from "../production-scheduling/execution-service.js";
import { previewOrderTracking, readOrderTracking } from "../production-scheduling/tracking-service.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { migrationFilesAfter } from "./current-migration-ledger-fixture.js";

test("0037 to 0038 adds empty tracking only, preserves existing Source/plans/execution/resources/receipts/grants bytes", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await postgres.createDatabase("order_tracking_upgrade") });
  t.after(async () => { try { await pool.end(); } finally { await postgres.stop(); } });
  const prefix = await mkdtemp(join(tmpdir(), "zhixu-tracking-prefix37-"));
  try {
    for (const file of await readdir("database/migrations")) if (file.endsWith(".sql") && Number(file.slice(0, 4)) <= 37) await copyFile(join("database/migrations", file), join(prefix, file));
    await runMigrations(pool, prefix);
  } finally {
    const distance = relative(resolve(tmpdir()), resolve(prefix)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance)); await rm(prefix, { recursive: true });
  }
  await synchronizePermissionCatalog(pool);
  const permissions: PermissionKey[] = ["order.view", "ainuoke.sync", "schedule.view", "schedule.create", "schedule.edit", "schedule.complete", "settings.production_infrastructure.edit", "settings.production_group.edit"];
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('tracking.upgrade','unused','合成升级','viewer') RETURNING id::text,public_id::text")).rows[0];
  await pool.query("INSERT INTO app_roles(id,name) VALUES('tracking.upgrade','合成升级角色')"); await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'tracking.upgrade')", [user.id]);
  for (const permission of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('tracking.upgrade',$1)", [permission]);
  const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "tracking.upgrade", userName: "UNTRUSTED", permissions };
  async function resource(kind: "calendars" | "sites" | "groups" | "hubs", data: unknown) {
    const command = parseManagedResourceCommand({ action: "create", requestId: randomUUID(), kind, resourceId: null, expectedVersion: 0, data });
    const result = await executeProductionResourceCommand(pool, actor, command); assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail(); return { command, ...result };
  }
  const calendar = await resource("calendars", { name: "旧合成日历", enabled: true, remark: "保留", workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
  const site = await resource("sites", { name: "旧合成地点", enabled: true, remark: "保留", countryCode: null, productionCalendarId: calendar.resource.id, preProductionSampleLeadDays: 0 });
  const group = await resource("groups", { name: "旧合成组", enabled: true, remark: "保留", shortName: "旧组", productionSiteId: site.resource.id, sortOrder: 0 });
  const hub = await resource("hubs", { name: "旧合成仓", enabled: true, remark: "不当作默认" });
  const order = await createAinuokeSalesOrder(pool, actor, { source: { sourceId: "SYN-TRACKING-UPGRADE", sourceRowIdentity: "SYN-TRACKING-UPGRADE-ROW", salesContractNo: "SYN-TRACKING-UPGRADE", insideOrderNo: "SYNTHETIC-FACTORY", lifecycleStatusRaw: "生效", contractDate: "2027-01-01", contractDeliveryDate: "2027-02-01", styleNo: "SYNTHETIC", companyNameSnapshot: "Synthetic", customerNameSnapshot: "Synthetic", brandNameSnapshot: "Synthetic", quantity: 100, sourceHash: "synthetic-upgrade-source", fetchedAt: "2026-10-21T00:00:00Z" }, colors: [{ sourceLineIdentity: "SYN-TRACKING-COLOR", colorName: "合成红", quantity: 100, deliveryDate: "2027-02-01", sourceHash: "synthetic-upgrade-color" }] });
  const orderId = order.salesOrder.id;
  const planPreview = await previewProductionPlan(pool, actor, { action: "create", orderId, assignmentId: null, expectedVersion: 0, expectedPlanVersion: 0,
    data: { executionType: "internal", executorId: group.resource.id, colorId: null, plannedQuantity: "30", duration: { mode: "workdays", workdays: 2 }, dates: { mode: "auto_queue", startDate: "2027-01-04" }, remark: "保留已排单" } });
  const planCommand = { requestId: randomUUID(), intent: planPreview.intent, previewHash: planPreview.previewHash };
  const plan = await executeProductionPlan(pool, actor, planCommand); assert.equal(plan.status, "applied"); if (plan.status !== "applied") assert.fail();
  const assignment = plan.assignments[0], current = await readOrderProductionPlans(pool, actor, orderId);
  const executionPreview = await previewProductionExecution(pool, actor, { action: "record_execution", orderId, assignmentId: assignment.id, expectedAssignmentVersion: assignment.version,
    expectedExecutionVersion: 0, expectedPlanVersion: current.order.planVersion, data: { status: "in_progress", completedQuantity: "10.125", actualStartDate: "2027-01-04", actualCompletedDate: null }, reason: "", replan: null });
  const execution = await executeProductionExecution(pool, actor, { requestId: randomUUID(), intent: executionPreview.intent, previewHash: executionPreview.previewHash }); assert.equal(execution.status, "applied");
  const tables = (await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(row => row.tablename);
  const snapshot = () => Promise.all(tables.map(async table => ({ table, rows: (await pool.query(`SELECT to_jsonb(row)::text payload FROM "${table}" row ORDER BY payload`)).rows })));
  const before = await snapshot();
  await t.test("new capability fails closed on prefix37 while existing production and reference reads work", async () => {
    await assert.rejects(() => verifyMigrationsCurrent(pool, resolve("database/migrations")), PendingMigrationsError);
    assert.deepEqual((await inspectMigrationStatus(pool, resolve("database/migrations"))).pending, migrationFilesAfter(37));
    const client = await pool.connect(); try { assert.equal((await normalizationReferences(client)).some(([table]) => table === "production_order_execution_trackings"), false); } finally { client.release(); }
    await assert.rejects(() => readOrderTracking(pool, actor, orderId), { status: 503, code: "order_tracking_unavailable" });
    await assert.rejects(() => previewOrderTracking(pool, actor, { action: "set_order_tracking", orderId, expectedVersion: 0, data: { supplyHubId: hub.resource.id, remark: "" } }), { status: 503, code: "order_tracking_unavailable" });
    assert.equal((await readOrderProductionPlans(pool, actor, orderId)).summary.completedQuantity, "10.125");
    assert.equal((await readProductionPlanReceipt(pool, actor, planCommand.requestId)).state, "known");
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("forward migration has no row rewrite, seed or default; old successful commands still replay exactly", async () => {
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, migrationFilesAfter(37));
    assert.deepEqual(await snapshot(), before); await verifyMigrationsCurrent(pool, resolve("database/migrations"));
    for (const table of ["production_order_execution_trackings", "production_order_execution_tracking_versions"]) assert.equal((await pool.query("SELECT count(*)::int n FROM " + table)).rows[0].n, 0);
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []);
    const read = await readOrderTracking(pool, actor, orderId); assert.equal(read.tracking, null); assert.equal(read.currentHub, null); assert.equal(read.canEdit, true);
    const replay = await executeProductionPlan(pool, actor, planCommand); assert.equal(replay.replayed, true); if (replay.status !== "applied") assert.fail(); assert.deepEqual(replay.assignments, plan.assignments);
    assert.equal((await readProductionResourceReceipt(pool, actor, hub.command.requestId)).state, "known");
    assert.deepEqual(await snapshot(), before);
  });
});

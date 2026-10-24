import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { replaceCurrentAinuokeColorSlice } from "../sales-orders/repository.js";
import { parseProductionResourceCommand } from "../production-resources/contract.js";
import { executeProductionResourceCommand } from "../production-resources/service.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { bumpPlanHeads, currentResourceFacts, persistAssignment, planHash, storeResourceFacts, type StoredAssignment } from "../production-scheduling/repository.js";

test("0034 to 0035 then 0036 preserves synthetic resources, identity, source, demand, plans, receipts and grant bytes", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await postgres.createDatabase("production_plan_upgrade") });
  t.after(async () => { try { await pool.end(); } finally { await postgres.stop(); } });
  const prefix = await mkdtemp(join(tmpdir(), "zhixu-plan-prefix34-"));
  try {
    for (const file of await readdir("database/migrations")) if (file.endsWith(".sql") && Number(file.slice(0, 4)) <= 34) await copyFile(join("database/migrations", file), join(prefix, file));
    await runMigrations(pool, prefix);
  } finally {
    const distance = relative(resolve(tmpdir()), resolve(prefix)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance)); await rm(prefix, { recursive: true });
  }
  await synchronizePermissionCatalog(pool);
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('plan-upgrade-synthetic','unused','Synthetic','viewer') RETURNING id::text,public_id::text")).rows[0];
  await pool.query("INSERT INTO app_roles(id,name) VALUES('plan-upgrade-synthetic','Synthetic')"); await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'plan-upgrade-synthetic')", [user.id]);
  await pool.query("INSERT INTO app_role_permissions SELECT 'plan-upgrade-synthetic',key FROM app_permissions WHERE key IN ('order.view','ainuoke.sync','settings.production_infrastructure.edit','settings.production_group.edit')");
  const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "plan-upgrade-synthetic", userName: "Untrusted", permissions: ["order.view", "ainuoke.sync", "settings.production_infrastructure.edit", "settings.production_group.edit"] };
  const calendar = await executeProductionResourceCommand(pool, actor, parseProductionResourceCommand({ action: "create", requestId: randomUUID(), kind: "calendars", resourceId: null, expectedVersion: 0,
    data: { name: "合成既有日历", enabled: true, remark: "保留", workingWeekdays: [1, 2, 3, 4, 5], exceptions: [{ date: "2027-01-01", type: "non_working", name: "旧例外" }] } }));
  assert.equal(calendar.status, "applied");
  const order = await createAinuokeSalesOrder(pool, actor, { source: { sourceId: "SYN-PLAN-UPGRADE", sourceRowIdentity: "SYN-PLAN-UPGRADE-ROW", salesContractNo: "SYN-PLAN-UPGRADE", insideOrderNo: "SYN-FACTORY-UPGRADE", lifecycleStatusRaw: "生效", contractDate: "2026-10-01", contractDeliveryDate: "2027-01-20", styleNo: "SYNTHETIC", companyNameSnapshot: "Synthetic", customerNameSnapshot: "Synthetic", brandNameSnapshot: "Synthetic", quantity: 100, sourceHash: "synthetic-source", fetchedAt: "2026-10-20T00:00:00Z" },
    colors: [{ sourceLineIdentity: "SYN-COLOR-UPGRADE", colorName: "红色", quantity: 100, deliveryDate: "2027-01-20", sourceHash: "synthetic-color" }] });
  const tables = ["app_users", "app_roles", "app_user_roles", "app_role_permissions", "production_calendars", "production_calendar_exceptions", "production_sites", "production_groups", "production_outsource_factories", "production_resource_commands", "sales_orders", "sales_order_source_links", "ainuoke_sales_order_contract_mirrors", "ainuoke_sales_order_color_mirrors", "sales_order_delivery_plan_sets", "sales_order_delivery_plans", "operation_logs"];
  const snapshot = () => Promise.all(tables.map(async table => (await pool.query("SELECT to_jsonb(row)::text payload FROM " + table + " row ORDER BY payload")).rows));
  const before = await snapshot();
  const prefix35 = await mkdtemp(join(tmpdir(), "zhixu-plan-prefix35-"));
  try {
    for (const file of await readdir("database/migrations")) if (file.endsWith(".sql") && Number(file.slice(0, 4)) <= 35) await copyFile(join("database/migrations", file), join(prefix35, file));
    assert.deepEqual((await runMigrations(pool, prefix35)).applied, ["0035_production_schedule_plans.sql"]);
    assert.deepEqual(await snapshot(), before); await verifyMigrationsCurrent(pool, prefix35);
  } finally {
    const distance = relative(resolve(tmpdir()), resolve(prefix35)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance)); await rm(prefix35, { recursive: true });
  }
  for (const table of ["production_order_plan_heads", "production_group_plan_heads", "production_schedule_assignments", "production_schedule_plan_versions", "production_schedule_resource_snapshots", "production_schedule_commands", "production_schedule_command_orders"]) assert.equal((await pool.query("SELECT count(*)::int n FROM " + table)).rows[0].n, 0);
  const resource = async (kind: "sites" | "groups", data: unknown) => {
    const result = await executeProductionResourceCommand(pool, actor, parseProductionResourceCommand({ action: "create", requestId: randomUUID(), kind, resourceId: null, expectedVersion: 0, data }));
    assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail(); return result.resource;
  };
  assert.equal(calendar.status, "applied"); if (calendar.status !== "applied") assert.fail();
  const site = await resource("sites", { name: "既有地点", enabled: true, remark: "保留", countryCode: null, productionCalendarId: calendar.resource.id, preProductionSampleLeadDays: 0 });
  const group = await resource("groups", { name: "既有组", enabled: true, remark: "保留", shortName: "旧组", productionSiteId: site.id, sortOrder: 0 });
  const client = await pool.connect();
  const assignmentId = randomUUID(), requestId = randomUUID();
  try {
    await client.query("BEGIN");
    const resources = await currentResourceFacts(client, "internal", group.id, false), hash = await storeResourceFacts(client, resources), now = new Date().toISOString();
    const row: StoredAssignment = { id: assignmentId, orderId: order.salesOrder.id, version: 1, executionType: "internal", productionGroupId: group.id, outsourceFactoryId: null,
      colorId: null, colorNameSnapshot: null, plannedQuantity: "10.25", durationMode: "workdays", dailyOutputSnapshot: "5.125", requiredWorkdays: 2,
      dateMode: "manual_fixed", plannedStartDate: "2027-01-04", firstProductionDate: null, plannedEndDate: "2027-01-05", nonWorkingDayCount: null, queueSequence: 1,
      resourceSnapshotHash: hash, resourceFacts: resources, status: "planned", remark: "existing plan bytes", createdBy: actor.internalUserId, updatedBy: actor.internalUserId, createdAt: now, updatedAt: now };
    await persistAssignment(client, row, true);
    await client.query(`INSERT INTO production_schedule_plan_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
      SELECT id,sales_order_id,version,production_plan_row_snapshot(a),$2,$3,'synthetic-existing','' FROM production_schedule_assignments a WHERE id=$1`, [assignmentId, actor.internalUserId, requestId]);
    const command = { requestId, intent: { action: "create" }, previewHash: "a".repeat(64) };
    await client.query("INSERT INTO production_schedule_commands(actor_id,request_id,action,payload_hash,command,result) VALUES($1,$2,'create',$3,$4,$5)", [actor.internalUserId, requestId, planHash(command), command, { requestId, status: "applied" }]);
    await client.query("INSERT INTO production_schedule_command_orders(actor_id,request_id,sales_order_id) VALUES($1,$2,$3)", [actor.internalUserId, requestId, order.salesOrder.id]);
    await bumpPlanHeads(client, [order.salesOrder.id], [group.id]);
    assert.equal((await normalizationReferences(client)).some(([table]) => table === "production_schedule_executions"), false);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  tables.push("production_order_plan_heads", "production_group_plan_heads", "production_schedule_assignments", "production_schedule_plan_versions", "production_schedule_resource_snapshots", "production_schedule_commands", "production_schedule_command_orders");
  const before36 = await snapshot();
  assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, ["0036_production_execution_facts.sql"]);
  assert.deepEqual(await snapshot(), before36); await verifyMigrationsCurrent(pool, resolve("database/migrations"));
  for (const table of ["production_schedule_executions", "production_schedule_execution_versions"]) assert.equal((await pool.query("SELECT count(*)::int n FROM " + table)).rows[0].n, 0);
  assert.deepEqual((await pool.query("SELECT assignment_id::text,version::text FROM production_schedule_execution_epochs")).rows, [{ assignment_id: assignmentId, version: "0" }]);
  await replaceCurrentAinuokeColorSlice(pool, order.salesOrder.id, [{ sourceLineIdentity: "SYN-COLOR-AFTER-UPGRADE", colorName: "红色", quantity: 101, deliveryDate: "2027-01-20", sourceHash: "synthetic-after" }]);
  assert.equal((await pool.query("SELECT quantity::text FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1", [order.salesOrder.id])).rows[0].quantity, "101");
  assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []);
});

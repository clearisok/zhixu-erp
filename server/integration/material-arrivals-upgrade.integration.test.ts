import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations, verifyMigrationsCurrent, inspectMigrationStatus, PendingMigrationsError } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { bindOrders, previewBindings } from "../ainuoke-source/binding.js";
import { captureSource } from "../ainuoke-source/service.js";
import { createPersistedMaterialPorts } from "../ainuoke-source/reader.js";
import { createOrderMaterialReader } from "../../features/ainuoke-material-progress/read-service.js";
import { bindingBundle, freshMaterialBundle } from "./ainuoke-binding-fixture.js";
import { executeProductionResourceCommand, readProductionResourceReceipt } from "../production-resources/service.js";
import { parseLogisticsResourceCommand } from "../production-resources/logistics-contract.js";
import { executeOrderTracking, previewOrderTracking, readOrderTracking } from "../production-scheduling/tracking-service.js";
import { readMaterialArrivals } from "../material-arrivals/service.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { migrationFilesAfter } from "./current-migration-ledger-fixture.js";

test("0038 to 0039 creates empty arrival owner and preserves nonempty Source/tracking/receipts/roles byte for byte", { timeout: 120000 }, async t => {
  const postgres = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await postgres.createDatabase("arrival_upgrade") });
  t.after(async () => { try { await pool.end(); } finally { await postgres.stop(); } });
  const prefix = await mkdtemp(join(tmpdir(), "zhixu-arrival-prefix38-"));
  try {
    for (const name of await readdir("database/migrations")) if (name.endsWith(".sql") && Number(name.slice(0, 4)) <= 38) await copyFile(join("database/migrations", name), join(prefix, name));
    await runMigrations(pool, prefix);
  } finally {
    const distance = relative(resolve(tmpdir()), resolve(prefix)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance)); await rm(prefix, { recursive: true });
  }
  await synchronizePermissionCatalog(pool); await bootstrapAdmin(pool, { username: "arrival.upgrade", displayName: "合成到仓升级", password: "synthetic-upgrade" });
  const actor = await loadExistingBootstrapActor(pool, "arrival.upgrade"), source = { sourceKey: "synthetic-upgrade", accountFingerprint: "a".repeat(64) };
  const bundle = bindingBundle(), preview = await previewBindings(bundle), bound = await bindOrders(pool, actor, { ...source, expectedPreview: preview.reviewHash, collect: async () => bundle });
  const orderId = bound.orderIds[0]; await captureSource(pool, actor, { ...source, maxAgeMs: 600000, collect: async () => freshMaterialBundle() });
  const hubCommand = parseLogisticsResourceCommand({ action: "create", requestId: randomUUID(), kind: "hubs", resourceId: null, expectedVersion: 0, data: { name: "合成升级仓", enabled: true, remark: "升级前保持" } });
  const hub = await executeProductionResourceCommand(pool, actor, hubCommand); assert.equal(hub.status, "applied"); if (hub.status !== "applied") assert.fail();
  const tracking = await previewOrderTracking(pool, actor, { action: "set_order_tracking", orderId, expectedVersion: 0, data: { supplyHubId: hub.resource.id, remark: "合成升级保留备注" } });
  const command = { requestId: randomUUID(), intent: tracking.intent, previewHash: tracking.previewHash }, saved = await executeOrderTracking(pool, actor, command); assert.equal(saved.status, "applied");
  const config = { sourceKey: source.sourceKey, maxAgeMs: 1800000 }, material = await createOrderMaterialReader(createPersistedMaterialPorts(pool, config))(actor, { salesOrderId: orderId }); assert.equal(material.status, 200);
  const tables = (await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(row => row.tablename);
  const snapshot = () => Promise.all(tables.map(async table => ({ table, rows: (await pool.query(`SELECT to_jsonb(row)::text payload FROM "${table}" row ORDER BY payload`)).rows })));
  const before = await snapshot();
  await t.test("old schema fails closed for arrivals while original source and tracking remain readable", async () => {
    await assert.rejects(() => verifyMigrationsCurrent(pool, resolve("database/migrations")), PendingMigrationsError);
    assert.deepEqual((await inspectMigrationStatus(pool, resolve("database/migrations"))).pending, migrationFilesAfter(38));
    await assert.rejects(() => readMaterialArrivals(pool, actor, orderId, config), { status: 503, code: "material_arrivals_unavailable" });
    const client = await pool.connect(); try { assert.equal((await normalizationReferences(client)).some(([table]) => table === "material_arrival_plans"), false); } finally { client.release(); }
    assert.equal((await readOrderTracking(pool, actor, orderId)).tracking?.remark, "合成升级保留备注"); assert.deepEqual(await snapshot(), before);
  });
  await t.test("forward upgrade seeds nothing and preserves every old public row and receipt", async () => {
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, migrationFilesAfter(38));
    await verifyMigrationsCurrent(pool, resolve("database/migrations")); assert.deepEqual(await snapshot(), before);
    for (const table of ["material_arrival_demands", "material_arrival_plans", "material_arrival_plan_versions", "material_arrival_commands", "material_arrival_command_orders"]) assert.equal((await pool.query("SELECT count(*)::int n FROM " + table)).rows[0].n, 0);
    const result = await readMaterialArrivals(pool, actor, orderId, config); assert.equal(result.source.status, "ready"); assert.ok(result.source.demands.length); assert.deepEqual(result.plans, []);
    assert.deepEqual(await createOrderMaterialReader(createPersistedMaterialPorts(pool, config))(actor, { salesOrderId: orderId }), material);
    const replay = await executeOrderTracking(pool, actor, command); assert.equal(replay.replayed, true); if (replay.status !== "applied" || saved.status !== "applied") assert.fail(); assert.deepEqual(replay.tracking, saved.tracking);
    assert.equal((await readProductionResourceReceipt(pool, actor, hubCommand.requestId)).state, "known");
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []); assert.deepEqual(await snapshot(), before);
  });
});

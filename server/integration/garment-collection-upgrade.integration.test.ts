import {historicalSourceFixture} from './historical-source-fixture.js';
import test from "node:test";
import { freezeExistingPublicRows } from "./legacy-row-snapshot-fixture.js";
import assert from "node:assert/strict";
import { mkdtemp, readdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations, verifyMigrationsCurrent, PendingMigrationsError } from "../db/migration-runner.js";
import { CURRENT_MIGRATION_FILES } from "./current-migration-ledger-fixture.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { accountFingerprint } from "../ainuoke-source/collector.js";
import { hash } from "../ainuoke-source/contract.js";
import { garmentCollectionProof, planGarmentCollection } from "../ainuoke-source/garment-collection-control.js";
import { prepareGarmentPublication, createGarmentShipmentReader } from "../ainuoke-source/garment-shipment-store.js";
import { validateGarmentCollectionResult } from "../ainuoke-source/garment-collection-worker.js";
import { collectionRequest, workerFrame, configFor } from "./garment-collection-fixture.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";

test("0042 to 0043 preserves nonempty old source/order/history rows and leaves collection disabled", { timeout: 120000 }, async t => {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase("garment_control_upgrade") });
  t.after(async () => { try { await pool.end(); } finally { await db.stop(); } });
  const prefix = await mkdtemp(join(tmpdir(), "zhixu-garment-control-prefix42-"));
  try {
    for (const name of await readdir("database/migrations")) if (name.endsWith(".sql") && Number(name.slice(0, 4)) <= 42)
      await copyFile(join("database/migrations", name), join(prefix, name));
    await runMigrations(pool, prefix);
  } finally {
    const distance = relative(resolve(tmpdir()), resolve(prefix)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance)); await rm(prefix, { recursive: true });
  }
  await synchronizePermissionCatalog(pool); await bootstrapAdmin(pool, { username: "garment.collector", displayName: "合成升级账号", password: "synthetic-upgrade" });
  const actor = await loadExistingBootstrapActor(pool, "garment.collector"), clock = Date.now();
  const order = (await createAinuokeSalesOrder(pool, actor, { source: { sourceId: "SYN-UPGRADE-G", sourceRowIdentity: "SYN-UPGRADE-G", salesContractNo: "SYN-UPGRADE-C1",
    insideOrderNo: "SYN-FACTORY", lifecycleStatusRaw: "生效", contractDate: "2026-10-01", contractDeliveryDate: "2026-11-01", styleNo: "SYN-STYLE",
    companyNameSnapshot: "合成公司", customerNameSnapshot: "合成客户", brandNameSnapshot: "合成品牌", quantity: 100, sourceHash: hash("old-so"), fetchedAt: new Date(clock).toISOString() },
    colors: [{ sourceLineIdentity: "SYN-BLUE", colorName: "合成蓝", quantity: 100, deliveryDate: "2026-11-01", sourceHash: hash("old-color") }] })).salesOrder;
  const request = collectionRequest(order.id, "SYN-UPGRADE-C1", clock), proof = garmentCollectionProof(request, clock), fingerprint = accountFingerprint(configFor());
  await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)", [request.config.sourceKey, fingerprint]);
  await pool.query("INSERT INTO ainuoke_garment_shipment_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256,freshness_ms) VALUES($1,$2,$3,true,$4,60000)",
    [request.config.sourceKey, order.id, fingerprint, proof.verificationSha256]);
  const context = await prepareGarmentPublication(pool, actor, request.config.sourceKey, order.id, clock);
  const scope = { sourceFingerprint: fingerprint, salesContractNo: "SYN-UPGRADE-C1" }, collected = validateGarmentCollectionResult(workerFrame(scope, clock + 100), request.config, scope, clock + 100);
  const legacy=await historicalSourceFixture();
  try{await legacy.publishGarmentObservation(pool, actor, context, collected.input, scope, clock + 100);}finally{await legacy.close();}
  const tables = (await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(row => row.tablename);
  const snapshot = await freezeExistingPublicRows(pool, tables);
  const before = await snapshot();
  await t.test("missing command schema is rejected without a migration, target change or upstream request", async () => {
    await assert.rejects(() => verifyMigrationsCurrent(pool, resolve("database/migrations")), PendingMigrationsError);
    await assert.rejects(() => planGarmentCollection(pool, actor, request, { requestId: randomUUID(), expiresAt: new Date(clock + 60000).toISOString() }, clock + 100),
      { code: "garment_collection_commands_unavailable" });
    assert.deepEqual(await snapshot(), before);
    const client = await pool.connect(); try { assert.equal((await normalizationReferences(client)).some(([table]) => table === "ainuoke_garment_collection_commands"), false); }
    finally { client.release(); }
  });
  await t.test("additive migration, exact ledger, repeat verification and old publication remain intact", async () => {
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied,
      CURRENT_MIGRATION_FILES.filter(file => Number(file.slice(0, 4)) > 42));
    assert.deepEqual(await snapshot(), before);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ainuoke_garment_collection_commands")).rows[0].n, 0);
    await verifyMigrationsCurrent(pool, resolve("database/migrations")); assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []);
    const reader = createGarmentShipmentReader(pool, { sourceKey: request.config.sourceKey }, () => clock + 100);
    const value = await reader.read(actor, order.id); assert.ok("publicationId" in value); assert.equal(value.rows.length, 1);
    assert.deepEqual(await snapshot(), before);
  });
});

import test from "node:test";
import { freezeExistingPublicRows } from "./legacy-row-snapshot-fixture.js";
import assert from "node:assert/strict";
import { mkdtemp, readdir, copyFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations, verifyMigrationsCurrent, PendingMigrationsError } from "../db/migration-runner.js";
import { CURRENT_MIGRATION_FILES, migrationFilesAfter } from "./current-migration-ledger-fixture.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { hash } from "../ainuoke-source/contract.js";
import { accountFingerprint } from "../ainuoke-source/collector.js";
import { garmentCollectionProof, planGarmentCollection, collectGarmentOnce } from "../ainuoke-source/garment-collection-control.js";
import { createGarmentShipmentReader } from "../ainuoke-source/garment-shipment-store.js";
import { planGarmentTarget } from "../ainuoke-source/garment-target-control.js";
import { collectionRequest, configFor, workerFrame } from "./garment-collection-fixture.js";
import { historicalSourceFixture } from "./historical-source-fixture.js";

test("0043 nonempty upgrade preserves all old bytes and creates only an empty target receipt ledger", { timeout: 120000 }, async t => {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase("garment_target_upgrade") });
  t.after(async () => { try { await pool.end(); } finally { await db.stop(); } });
  const nativeTemp = realpathSync.native(tmpdir()), prefix = await mkdtemp(join(nativeTemp, "zhixu-garment-target-prefix43-"));
  try {
    for (const name of await readdir("database/migrations")) if (name.endsWith(".sql") && Number(name.slice(0, 4)) <= 43)
      await copyFile(join("database/migrations", name), join(prefix, name));
    await runMigrations(pool, prefix);
  } finally {
    const distance = relative(nativeTemp, resolve(prefix)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance));
    await rm(prefix, { recursive: true });
  }
  await synchronizePermissionCatalog(pool); await bootstrapAdmin(pool, { username: "garment.collector", displayName: "合成目标升级账号", password: "synthetic-target-upgrade" });
  const actor = await loadExistingBootstrapActor(pool, "garment.collector"); let clock = Date.now();
  const order = (await createAinuokeSalesOrder(pool, actor, { source: { sourceId: "SYN-TARGET-UPGRADE", sourceRowIdentity: "SYN-TARGET-UPGRADE",
    salesContractNo: "SYN-TARGET-UPGRADE-C1", insideOrderNo: "SYN-FACTORY", lifecycleStatusRaw: "生效", contractDate: "2026-10-01",
    contractDeliveryDate: "2026-11-01", styleNo: "SYN-STYLE", companyNameSnapshot: "合成公司", customerNameSnapshot: "合成客户", brandNameSnapshot: "合成品牌",
    quantity: 100, sourceHash: hash("synthetic-old-target"), fetchedAt: new Date(clock).toISOString() },
    colors: [{ sourceLineIdentity: "SYN-BLUE", colorName: "合成蓝", quantity: 100, deliveryDate: "2026-11-01", sourceHash: hash("synthetic-old-color") }] })).salesOrder;
  const request = collectionRequest(order.id, "SYN-TARGET-UPGRADE-C1", clock), proof = garmentCollectionProof(request, clock);
  await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)", [request.config.sourceKey, accountFingerprint(configFor())]);
  await pool.query("INSERT INTO ainuoke_garment_shipment_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256,freshness_ms) VALUES($1,$2,$3,true,$4,60000)",
    [request.config.sourceKey, order.id, accountFingerprint(configFor()), proof.verificationSha256]);
  const permit = { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() }, plan = await planGarmentCollection(pool, actor, request, permit, clock);
  let sourceCalls=0;await assert.rejects(collectGarmentOnce(pool,actor,request,{...permit,scopeHash:plan.scopeHash},{now:()=>clock,collect:async()=>{sourceCalls++;throw Error('unreachable Source');}}),{code:'sync_audit_migration_required'});assert.equal(sourceCalls,0);
  const legacy=await historicalSourceFixture();t.after(()=>legacy.close());
  await legacy.collectGarmentOnce(pool, actor, request, { ...permit, scopeHash: plan.scopeHash }, { now: () => clock, collect: async (_config, scope) => {
    clock += 100; return workerFrame(scope, clock);
  } });
  const tables = (await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(row => row.tablename);
  const snapshot = await freezeExistingPublicRows(pool, tables);
  const before = await snapshot(), reader = createGarmentShipmentReader(pool, { sourceKey: request.config.sourceKey }, () => clock), oldView = await reader.read(actor, order.id);
  await t.test("verify-only and plan reject old schema without mutations or a Source call", async () => {
    await assert.rejects(() => verifyMigrationsCurrent(pool, resolve("database/migrations")), PendingMigrationsError);
    await assert.rejects(() => planGarmentTarget(pool, actor, { action: "enable", request, freshnessMs: 120000 },
      { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() }, () => clock), { code: "garment_target_commands_unavailable" });
    assert.deepEqual(await snapshot(), before);
    const client = await pool.connect(); try { assert.equal((await normalizationReferences(client)).some(([table]) => table === "ainuoke_garment_target_commands"), false); }
    finally { client.release(); }
  });
  await t.test("forward-only migration and exact ledger preserve old targets, commands and publications", async () => {
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, migrationFilesAfter(43));
    assert.deepEqual(await snapshot(), before); assert.deepEqual(await reader.read(actor, order.id), oldView);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ainuoke_garment_target_commands")).rows[0].n, 0);
    assert.deepEqual((await pool.query("SELECT filename FROM schema_migrations ORDER BY filename")).rows.map(row => row.filename), CURRENT_MIGRATION_FILES);
    await verifyMigrationsCurrent(pool, resolve("database/migrations")); assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []);
    const client = await pool.connect(); try { assert.equal((await normalizationReferences(client)).filter(([table]) => table === "ainuoke_garment_target_commands").length, 2); }
    finally { client.release(); }
  });
});

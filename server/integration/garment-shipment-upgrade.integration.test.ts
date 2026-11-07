import test from "node:test";
import { freezeExistingPublicRows } from "./legacy-row-snapshot-fixture.js";
import assert from "node:assert/strict";
import { mkdtemp, readdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations, verifyMigrationsCurrent, PendingMigrationsError } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { bindOrders, previewBindings } from "../ainuoke-source/binding.js";
import { captureSource } from "../ainuoke-source/service.js";
import { bindingBundle, freshMaterialBundle } from "./ainuoke-binding-fixture.js";
import { createGarmentShipmentReader } from "../ainuoke-source/garment-shipment-store.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { migrationFilesAfter } from "./current-migration-ledger-fixture.js";

test("0039 to 0040 is empty, additive, idempotent and preserves all old public rows", { timeout: 120000 }, async t => {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase("garment_upgrade") });
  t.after(async () => { try { await pool.end(); } finally { await db.stop(); } });
  const prefix = await mkdtemp(join(tmpdir(), "zhixu-garment-prefix39-"));
  try {
    for (const name of await readdir("database/migrations")) if (name.endsWith(".sql") && Number(name.slice(0, 4)) <= 39)
      await copyFile(join("database/migrations", name), join(prefix, name));
    await runMigrations(pool, prefix);
  } finally {
    const distance = relative(resolve(tmpdir()), resolve(prefix)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance)); await rm(prefix, { recursive: true });
  }
  await synchronizePermissionCatalog(pool); await bootstrapAdmin(pool, { username: "garment.upgrade", displayName: "合成出货升级", password: "synthetic-upgrade" });
  const actor = await loadExistingBootstrapActor(pool, "garment.upgrade"), source = { sourceKey: "synthetic-garment-upgrade", accountFingerprint: "a".repeat(64) };
  const bundle = bindingBundle(), preview = await previewBindings(bundle), bound = await bindOrders(pool, actor, { ...source, expectedPreview: preview.reviewHash, collect: async () => bundle });
  const orderId = bound.orderIds[0]; await captureSource(pool, actor, { ...source, maxAgeMs: 600000, collect: async () => freshMaterialBundle() });
  const oldTables = (await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(row => row.tablename);
  const snapshot = await freezeExistingPublicRows(pool, oldTables);
  const before = await snapshot(), reader = createGarmentShipmentReader(pool, { sourceKey: source.sourceKey });
  await t.test("old and partial schema fail closed without mutation or fallback", async () => {
    await assert.rejects(() => verifyMigrationsCurrent(pool, resolve("database/migrations")), PendingMigrationsError);
    await assert.rejects(() => reader.read(actor, orderId), { status: 503, code: "garment_observations_unavailable" });
    const client = await pool.connect(); try { assert.equal((await normalizationReferences(client)).some(([table]) => table.startsWith("ainuoke_garment_shipment_")), false); } finally { client.release(); }
    await pool.query("CREATE TABLE ainuoke_garment_shipment_targets(synthetic_id integer)");
    try {
      await assert.rejects(() => reader.read(actor, orderId), { status: 503, code: "garment_observations_unavailable" });
      const partial = await pool.connect(); try { await assert.rejects(() => normalizationReferences(partial), { status: 503, code: "garment_reference_schema_incomplete" }); } finally { partial.release(); }
    } finally { await pool.query("DROP TABLE ainuoke_garment_shipment_targets"); }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test("forward migration seeds no target/snapshot/color/head or permissions and changes no old rows", async () => {
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, migrationFilesAfter(39));
    assert.deepEqual(await snapshot(), before); await verifyMigrationsCurrent(pool, resolve("database/migrations"));
    for (const table of ["ainuoke_garment_shipment_targets", "ainuoke_garment_shipment_snapshots", "ainuoke_garment_shipment_color_matches", "ainuoke_garment_shipment_heads"])
      assert.equal((await pool.query("SELECT count(*)::int n FROM " + table)).rows[0].n, 0);
    assert.equal((await reader.read(actor, orderId)).sourceStatus, "not_connected"); assert.deepEqual((await reader.history(actor, orderId)).records, []);
    assert.deepEqual((await runMigrations(pool, resolve("database/migrations"))).applied, []); assert.deepEqual(await snapshot(), before);
  });
});

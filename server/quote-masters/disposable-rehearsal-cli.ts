import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { discoverMigrations, inspectMigrationStatus, runMigrations } from "../db/migration-runner.js";
import { importQuoteMasterSettingsProjection, inspectDefaultTrimSchema, QuoteMasterSettingsMigrationError, QuoteMasterSettingsPostCommitError, readQuoteMasterSettingsRowCounts } from "../integration/quote-master-settings-migration-import.js";
import { inspectQ3SourceFile, type Q3RehearsalProof } from "./import-readiness.js";

const { Pool } = pg;
const migrationsDirectory = resolve("database/migrations");

async function main(): Promise<void> {
  const prepareOnly = process.argv.length === 3 && process.argv[2] === "prepare-guarded-test";
  if (!prepareOnly && process.argv.length !== 2) throw new Error("disposable_rehearsal_mode_invalid");
  const successDatabase = process.env.Q3_DISPOSABLE_SUCCESS_DB;
  const rollbackDatabase = process.env.Q3_DISPOSABLE_ROLLBACK_DB;
  const password = process.env.DB_PASSWORD;
  const reviewedCommit = process.env.Q3_REVIEWED_COMMIT;
  if (process.env.DATABASE_URL || process.env.DB_HOST !== "127.0.0.1" || process.env.DB_PORT !== "5432" ||
    !successDatabase?.startsWith("zhixu_it_q3_") || (!prepareOnly && !rollbackDatabase?.startsWith("zhixu_it_q3_")) ||
    (!prepareOnly && successDatabase === rollbackDatabase) || !password || !reviewedCommit || process.env.ZHIXU_GIT_COMMIT !== reviewedCommit) {
    throw new Error("disposable_rehearsal_environment_invalid");
  }
  const options = (database: string) => ({ host: "127.0.0.1", port: 5432, database, user: "postgres", password, max: 2, connectionTimeoutMillis: 3000 });
  if (prepareOnly) {
    const target = new Pool(options(successDatabase!));
    try {
      const version = Number((await target.query<{ server_version_num: string }>("SHOW server_version_num")).rows[0].server_version_num);
      if (version < 160000 || version >= 170000) throw new Error("disposable_postgres_major_mismatch");
      await runMigrations(target, migrationsDirectory);
      const counts = await readQuoteMasterSettingsRowCounts(target);
      if (counts.total !== 0) throw new Error("disposable_target_not_empty");
      process.stdout.write(JSON.stringify({ event: "q3_disposable_guarded_target_ready", rows: counts.total }) + "\n");
      return;
    } finally { await target.end(); }
  }
  const source = await inspectQ3SourceFile("/input/source.json");
  if (source.identity.fileSha256 !== process.env.Q3_EXPECTED_FILE_SHA256 || source.identity.sourceHash !== process.env.Q3_EXPECTED_SOURCE_HASH || source.identity.blockers !== 0) {
    throw new Error("disposable_rehearsal_source_mismatch");
  }
  const success = new Pool(options(successDatabase!));
  const rollback = new Pool(options(rollbackDatabase!));
  try {
    const version = Number((await success.query<{ server_version_num: string }>("SHOW server_version_num")).rows[0].server_version_num);
    if (version < 160000 || version >= 170000) throw new Error("disposable_postgres_major_mismatch");
    await runMigrations(success, migrationsDirectory);
    await runMigrations(rollback, migrationsDirectory);
    const migrations = await discoverMigrations(migrationsDirectory);
    const ledger = migrations.map(({ version: migrationVersion, filename, checksum }) => ({ version: migrationVersion, filename, checksum }));
    if (ledger.length !== 7 || ledger.some((row, index) => Number(row.version) !== index + 1)) throw new Error("disposable_migration_set_invalid");
    const status = await inspectMigrationStatus(success, migrationsDirectory);
    if (status.integrity !== "valid" || status.pending.length || JSON.stringify(status.applied) !== JSON.stringify(ledger.map((item) => item.filename))) throw new Error("disposable_ledger_invalid");
    const initial = await readQuoteMasterSettingsRowCounts(success);
    if (initial.total !== 0) throw new Error("disposable_target_not_empty");
    let rolledBack = false;
    try { await importQuoteMasterSettingsProjection(rollback, source.report, { intentionalFailureAfterBrands: true }); }
    catch (error) { rolledBack = error instanceof QuoteMasterSettingsMigrationError && error.code === "intentional_rehearsal_failure"; if (!rolledBack) throw error; }
    if ((await readQuoteMasterSettingsRowCounts(rollback)).total !== 0) throw new Error("disposable_rollback_failed");
    let postCommitUnverified = false;
    try { await importQuoteMasterSettingsProjection(rollback, source.report, { intentionalPostCommitReadbackFailure: true }); }
    catch (error) { postCommitUnverified = error instanceof QuoteMasterSettingsPostCommitError; if (!postCommitUnverified) throw error; }
    if (!postCommitUnverified || (await readQuoteMasterSettingsRowCounts(rollback)).total !== source.identity.projectedCounts.total) {
      throw new Error("disposable_post_commit_outcome_misclassified");
    }
    const imported = await importQuoteMasterSettingsProjection(success, source.report);
    if (!imported.contentHashesEqual || imported.postgresContentHash !== source.identity.projectionContentHash) throw new Error("disposable_readback_mismatch");
    let secondRejected = false;
    try { await importQuoteMasterSettingsProjection(success, source.report); }
    catch (error) { secondRejected = error instanceof QuoteMasterSettingsMigrationError && error.code === "target_not_empty"; if (!secondRejected) throw error; }
    if (!secondRejected) throw new Error("disposable_second_import_not_rejected");
    const schema = await inspectDefaultTrimSchema(success);
    if (!schema.exact || schema.quantity || schema.usage) throw new Error("disposable_default_trim_schema_invalid");
    const fk = await success.query<{ broken_brand: number; broken_trim: number; bad_default: number }>(`SELECT
      (SELECT count(*)::int FROM quote_master_customer_salespeople s LEFT JOIN quote_master_brands b ON b.id=s.brand_id WHERE b.id IS NULL) AS broken_brand,
      (SELECT count(*)::int FROM quote_master_default_trim_configs d LEFT JOIN quote_master_trims t ON t.id=d.trim_library_item_id WHERE t.id IS NULL) AS broken_trim,
      (SELECT count(*)::int FROM quote_global_settings g LEFT JOIN quote_manufacturing_presets p ON p.id=g.default_manufacturing_preset_id WHERE g.default_manufacturing_preset_id IS NOT NULL AND (p.id IS NULL OR p.status<>'active')) AS bad_default`);
    if (fk.rows[0].broken_brand || fk.rows[0].broken_trim || fk.rows[0].bad_default) throw new Error("disposable_fk_reconciliation_failed");
    const proof: Omit<Q3RehearsalProof, "disposableContainerRemoved"> & { disposableContainerRemoved: false } = {
      proofVersion: 1, result: "PASS", sourceFileSha256: source.identity.fileSha256, sourceHash: source.identity.sourceHash,
      projectionContentHash: source.identity.projectionContentHash, projectedCounts: source.identity.projectedCounts,
      reviewedCommit, migrationLedger: ledger, postgresMajor: 16, rehearsedAt: new Date().toISOString(),
      importCounts: imported.rowCounts, readbackCounts: await readQuoteMasterSettingsRowCounts(success),
      readbackContentHash: imported.postgresContentHash, rollbackValidated: true, postCommitUnverifiedValidated: true, secondImportRejected: true,
      disposableContainerRemoved: false,
    };
    // The outer harness publishes the proof only after actual container removal.
    await writeFile("/evidence/proof.candidate.json", `${JSON.stringify(proof, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(JSON.stringify({ event: "q3_disposable_rehearsal_candidate", result: "PASS", sourceHash: source.identity.sourceHash, rows: imported.rowCounts.total }) + "\n");
  } finally {
    await Promise.all([success.end(), rollback.end()]);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ event: "q3_disposable_rehearsal_failed", code: error instanceof Error ? error.message : "unknown_failure" }) + "\n");
  process.exitCode = 1;
});

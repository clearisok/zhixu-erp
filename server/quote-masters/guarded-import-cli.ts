import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { discoverMigrations, inspectMigrationStatus } from "../db/migration-runner.js";
import { parseMigrationExecutionEvidence, type MigrationExecutionEvidence } from "../db/migration-evidence.js";
import { importQuoteMasterSettingsProjection, QuoteMasterSettingsCommitUnknownError, QuoteMasterSettingsMigrationError, QuoteMasterSettingsPostCommitError, readQuoteMasterSettingsRowCounts } from "../integration/quote-master-settings-migration-import.js";
import { inspectQ3SourceFile, readHashedEvidence, validateFreezeEvidence, validateRehearsalProof, type Q3FreezeEvidence, type Q3RehearsalProof, type Q3SourceIdentity } from "./import-readiness.js";

const { Pool } = pg;
const migrationsDirectory = resolve("database/migrations");
const mode = process.argv[2];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function preflightIntent(): void {
  if ((mode !== "verify" && mode !== "execute") || process.argv.length !== 3 || process.env.DATABASE_URL ||
    required("DB_HOST") !== "127.0.0.1" || required("DB_PORT") !== "5432" ||
    !/^[A-Za-z0-9_.-]{1,63}$/u.test(required("DB_NAME")) || !/^[A-Za-z0-9_.-]{1,63}$/u.test(required("DB_USER")) ||
    !/^[0-9a-f]{40}$/u.test(required("Q3_ACTUAL_HEAD")) || process.env.ZHIXU_GIT_COMMIT !== process.env.Q3_ACTUAL_HEAD) {
    throw new Error("guarded_import_environment_invalid");
  }
  if (mode === "execute" && required("Q3_CONFIRM_IMPORT") !== "I_UNDERSTAND_Q3_IMPORT_IS_IRREVERSIBLE") throw new Error("independent_import_confirmation_missing");
}

async function inspectDatabase(pool: pg.Pool): Promise<{ version: string; ledger: Q3RehearsalProof["migrationLedger"]; counts: Awaited<ReturnType<typeof readQuoteMasterSettingsRowCounts>> }> {
  const migrations = await discoverMigrations(migrationsDirectory);
  const ledger = migrations.map(({ version, filename, checksum }) => ({ version, filename, checksum }));
  if (ledger.length !== 7 || ledger.some((item, index) => Number(item.version) !== index + 1)) throw new Error("migration_set_mismatch");
  const status = await inspectMigrationStatus(pool, migrationsDirectory);
  if (!status.ledgerExists || status.integrity !== "valid" || status.pending.length || JSON.stringify(status.applied) !== JSON.stringify(ledger.map((item) => item.filename))) throw new Error("migration_ledger_not_current");
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    try {
      const identity = await client.query<{ database: string; read_only: string; version: string }>("SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only, current_setting('server_version') AS version");
      if (identity.rows[0].database !== required("DB_NAME") || identity.rows[0].read_only !== "on" || !identity.rows[0].version.startsWith("16.")) throw new Error("database_identity_mismatch");
      const counts = await readQuoteMasterSettingsRowCounts(client);
      if (counts.total !== 0) throw new Error("q3_target_not_empty");
      await client.query("COMMIT");
      return { version: identity.rows[0].version.match(/^\d+\.\d+/u)?.[0] ?? "", ledger, counts };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  } finally { client.release(); }
}

async function assertPostCommitInvariants(pool: pg.Pool, source: Q3SourceIdentity): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    try {
      const counts = await readQuoteMasterSettingsRowCounts(client);
      const expected = source.projectedCounts;
      if ((Object.keys(expected) as Array<keyof typeof expected>).some((key) => counts[key] !== expected[key])) throw new Error("post_commit_counts_mismatch");
      const invalid = await client.query<{ bad_brand: number; bad_trim: number; bad_default: number }>(`SELECT
        (SELECT count(*)::int FROM quote_master_customer_salespeople s LEFT JOIN quote_master_brands b ON b.id=s.brand_id WHERE b.id IS NULL) AS bad_brand,
        (SELECT count(*)::int FROM quote_master_default_trim_configs d LEFT JOIN quote_master_trims t ON t.id=d.trim_library_item_id WHERE t.id IS NULL) AS bad_trim,
        (SELECT count(*)::int FROM quote_global_settings g LEFT JOIN quote_manufacturing_presets p ON p.id=g.default_manufacturing_preset_id WHERE g.default_manufacturing_preset_id IS NOT NULL AND (p.id IS NULL OR p.status<>'active')) AS bad_default`);
      if (invalid.rows[0].bad_brand || invalid.rows[0].bad_trim || invalid.rows[0].bad_default) throw new Error("post_commit_invariants_failed");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  } finally { client.release(); }
}

async function persistEvidence(evidence: MigrationExecutionEvidence, replaceExisting: boolean): Promise<void> {
  const path = "/evidence/import-evidence.json";
  const serialized = `${JSON.stringify(parseMigrationExecutionEvidence(evidence), null, 2)}\n`;
  if (!replaceExisting) { await writeFile(path, serialized, { flag: "wx", mode: 0o600 }); return; }
  const temporary = `/evidence/import-evidence.${randomUUID()}.tmp`;
  await writeFile(temporary, serialized, { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

async function main(): Promise<void> {
  preflightIntent();
  const source = await inspectQ3SourceFile("/input/source.json");
  const identity = source.identity;
  if (identity.blockers || identity.fileSha256 !== required("Q3_EXPECTED_FILE_SHA256") || identity.sourceHash !== required("Q3_EXPECTED_SOURCE_HASH") || identity.projectionContentHash !== required("Q3_EXPECTED_PROJECTION_HASH")) throw new Error("immutable_source_mismatch");
  if (identity.capture.origin !== required("Q3_EXPECTED_BROWSER_ORIGIN") || identity.capture.namespace !== required("Q3_EXPECTED_NAMESPACE") ||
    identity.capture.environment !== required("Q3_EXPECTED_ENVIRONMENT") || identity.capture.schemaVersion !== Number(required("Q3_EXPECTED_SCHEMA_VERSION")) ||
    identity.capture.backupVersion !== 1) throw new Error("source_capture_identity_mismatch");
  const proof = await readHashedEvidence<Q3RehearsalProof>("/input/proof.json", required("Q3_EXPECTED_PROOF_SHA256"));
  const freeze = await readHashedEvidence<Q3FreezeEvidence>("/input/freeze.json", required("Q3_EXPECTED_FREEZE_SHA256"));
  validateFreezeEvidence(freeze, { origin: required("Q3_EXPECTED_BROWSER_ORIGIN"), namespace: identity.capture.namespace, schemaVersion: identity.capture.schemaVersion, commit: required("Q3_REVIEWED_COMMIT"), buildId: required("Q3_EXPECTED_FROZEN_BUILD_ID") });
  if (identity.capture.origin !== freeze.browserOrigin || identity.capture.timestamp < freeze.freezeStartedAt ||
    Date.parse(identity.capture.timestamp) > Date.now() || Date.parse(proof.rehearsedAt) < Date.parse(identity.capture.timestamp)) throw new Error("source_not_captured_in_freeze_window");
  const pool = new Pool({ host: "127.0.0.1", port: 5432, database: required("DB_NAME"), user: required("DB_USER"), password: required("DB_PASSWORD"), max: 3, connectionTimeoutMillis: 5000, application_name: "zhixu-q3-guarded-import" });
  try {
    const state = await inspectDatabase(pool);
    validateRehearsalProof(proof, identity, required("Q3_REVIEWED_COMMIT"), state.ledger);
    const assertSourceUnchanged = async (): Promise<void> => {
      const current = (await inspectQ3SourceFile("/input/source.json")).identity;
      if (current.fileSha256 !== identity.fileSha256 || current.bytes !== identity.bytes ||
        current.sourceHash !== identity.sourceHash || current.projectionContentHash !== identity.projectionContentHash) {
        throw new Error("immutable_source_changed");
      }
    };
    await assertSourceUnchanged();
    if (mode === "verify") {
      process.stdout.write(JSON.stringify({ event: "q3_import_verify_only", ready: true,
        sourceFileSha256: identity.fileSha256, sourceBytes: identity.bytes, capture: identity.capture,
        sourceHash: identity.sourceHash, projectionContentHash: identity.projectionContentHash,
        projectedCounts: identity.projectedCounts, blockers: identity.blockers, warnings: identity.warnings,
        targetFingerprint: required("Q3_TARGET_FINGERPRINT") }) + "\n");
      return;
    }
    const startedAt = new Date().toISOString();
    const evidence: MigrationExecutionEvidence = {
      evidenceVersion: 1, executionId: `q3-import-${randomUUID()}`, executionType: "quote_master_settings_import", outcome: "PREPARED",
      startedAt, finishedAt: startedAt, operator: required("Q3_OPERATOR_LABEL"), authorizationRef: required("Q3_AUTHORIZATION_REF"),
      repoCommit: required("Q3_ACTUAL_HEAD"), reviewedCommit: required("Q3_REVIEWED_COMMIT"),
      targetFingerprint: required("Q3_TARGET_FINGERPRINT"), databaseName: required("DB_NAME"), postgresVersion: state.version,
      migrationLedger: state.ledger.map((row) => ({ ...row, state: "applied" as const })),
      rollbackBackupSha256: required("Q3_ROLLBACK_SHA256"), rollbackBackupManifestSha256: required("Q3_ROLLBACK_MANIFEST_SHA256"), sourceFileSha256: identity.fileSha256,
      sourceHash: identity.sourceHash, projectionContentHash: identity.projectionContentHash,
      rehearsalProofSha256: required("Q3_EXPECTED_PROOF_SHA256"), freezeEvidenceSha256: required("Q3_EXPECTED_FREEZE_SHA256"),
      plannedCounts: identity.projectedCounts,
    };
    await persistEvidence(evidence, false);
    try {
      const imported = await importQuoteMasterSettingsProjection(pool, source.report);
      evidence.committedCounts = imported.rowCounts;
      try {
        await assertPostCommitInvariants(pool, identity);
        await assertSourceUnchanged();
        evidence.outcome = "COMMITTED";
        evidence.readbackCounts = imported.rowCounts;
        evidence.readbackContentHash = imported.postgresContentHash;
      } catch {
        evidence.outcome = "COMMITTED_UNVERIFIED";
        evidence.failure = { code: "post_commit_invariants_failed", phase: "post_commit" };
      }
    } catch (error) {
      evidence.outcome = error instanceof QuoteMasterSettingsPostCommitError ? "COMMITTED_UNVERIFIED"
        : error instanceof QuoteMasterSettingsCommitUnknownError ? "COMMIT_OUTCOME_UNKNOWN" : "FAILED";
      if (error instanceof QuoteMasterSettingsPostCommitError) evidence.committedCounts = error.committedCounts;
      evidence.failure = { code: error instanceof QuoteMasterSettingsPostCommitError ? "post_commit_readback_failed"
        : error instanceof QuoteMasterSettingsCommitUnknownError ? "commit_outcome_unknown" : "transaction_failed",
      phase: error instanceof QuoteMasterSettingsPostCommitError ? "post_commit" : error instanceof QuoteMasterSettingsCommitUnknownError ? "commit" : "transaction" };
    }
    evidence.finishedAt = new Date().toISOString();
    await persistEvidence(evidence, true);
    process.stdout.write(JSON.stringify({ event: "q3_import_result", outcome: evidence.outcome, executionId: evidence.executionId, keepFreeze: true }) + "\n");
    if (evidence.outcome !== "COMMITTED") process.exitCode = 2;
  } finally { await pool.end(); }
}

main().catch((error: unknown) => {
  const safeCode = error instanceof QuoteMasterSettingsMigrationError ? error.code : "guarded_import_preflight_failed";
  process.stderr.write(JSON.stringify({ event: "q3_import_failed", code: safeCode, keepFreeze: true }) + "\n");
  process.exitCode = 1;
});

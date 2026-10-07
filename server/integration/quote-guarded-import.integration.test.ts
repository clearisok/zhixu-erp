import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import pg from "pg";
import { createQuoteDraft } from "../../features/quote-center/model/quote-view-model.js";
import { discoverMigrations, inspectMigrationStatus, runMigrations } from "../db/migration-runner.js";
import { QuoteImportEvidenceError, assertEmptyQuoteTarget, assertQuoteMigrationLedger,
  parseQuoteFreezeEvidence, parseQuoteImportAttemptEvidence, parseQuoteObjectStorageProof, parseQuoteRehearsalProof,
  parseQuoteRollbackBackup, parseQuoteSourceIdentity, parseQuoteTargetIdentity, quoteReadiness } from "../quotes/guarded-import-evidence.js";
import { assertReviewedQuoteSource, QuoteSourceGuardError } from "../quotes/guarded-source.js";
import { assertDisposableQ5ExecutionReady, evaluateGuardedQuoteReadiness } from "../quotes/guarded-readiness.js";
import { copyQ5EvidenceBundle, prepareQ5EvidenceBundle, verifyQ5EvidenceBundle } from "../quotes/guarded-custody.js";
import { HistoricalQuoteImportError, expectedHistoricalQuoteRowCounts, importHistoricalQuoteProjection, inspectHistoricalQuoteTarget,
  reconcileHistoricalQuoteProjection } from "../quotes/historical-import.js";
import { previewHistoricalQuoteBackup, quoteContentHash } from "../quotes/historical-preview.js";
import { startDisposablePostgres } from "./postgres-container.js";

const exec = promisify(execFile);
const SHA = "a".repeat(64);
const SHA2 = "b".repeat(64);
const COMMIT = "c".repeat(40);
const origin = "http://127.0.0.1:3001";
function fixture() {
  const quote = createQuoteDraft("q5b-synthetic", "QT-2026-1007-002", "2026-10-07");
  quote.revisions[0].createdAt = "2026-10-07T00:00:00.000Z";
  const backup = { product: "zhixu-erp", backupVersion: 1, schemaVersion: 13,
    createdAt: "2026-10-07T03:00:00.000Z", environment: "development", origin, namespace: "zhixu.erp.local",
    localRecords: { "zhixu.erp.local.quotes": JSON.stringify({ schemaVersion: 13, initializedAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T03:00:00.000Z", data: [quote] }) }, attachments: [], templates: [], styleProgress: {} };
  const bytes = JSON.stringify(backup);
  const fileSha = createHash("sha256").update(bytes).digest("hex");
  const preview = previewHistoricalQuoteBackup(backup);
  const source = { contract: "quote-history-source-identity.v1", fileSha256: fileSha, sourceHash: preview.sourceHash,
    projectionHash: preview.projectionHash!, origin, namespace: "zhixu.erp.local", environment: "development",
    schemaVersion: 13, backupVersion: 1, capturedAt: backup.createdAt,
    fileModifiedAt: "2026-10-07T03:00:10.000Z", reviewedCommit: COMMIT };
  const freeze = { contract: "quote-writer-freeze.v1", browserOrigin: origin, profileLabel: "synthetic-profile",
    reviewedCommit: COMMIT, buildId: "synthetic-build", runtimeIdentity: "synthetic-frozen-ui",
    freezeStartedAt: "2026-10-07T02:00:00.000Z", oldTabsClosedAt: "2026-10-07T02:10:00.000Z",
    frozenReopenedAt: "2026-10-07T02:20:00.000Z", verifiedAt: "2026-10-07T02:30:00.000Z",
    quoteWritesDisabled: true, noMutationAfterCapture: true };
  const target = { containerName: "q5b-disposable", composeProject: "q5b-test", volumeName: "tmpfs",
    databaseName: "q5b_test", fingerprint: SHA };
  const backupEvidence = { contract: "zhixu-exact-target-backup.v1", createdAt: "2026-10-07T03:10:00.000Z",
    filename: "synthetic.dump", bytes: 2048, sha256: SHA2, targetFingerprint: SHA,
    containerName: target.containerName, composeProject: target.composeProject, volumeName: target.volumeName,
    databaseName: target.databaseName, archiveListVerified: true };
  const storage = { contract: "quote-object-storage-readiness.v1", providerConfigured: true, privateBucket: true,
    preflightPass: true, putHeadGetDeletePass: true, runtimeConfigReviewed: true,
    endpointIdentity: "synthetic.invalid", region: "test-region", bucket: "synthetic-bucket",
    verifiedAt: "2026-10-07T03:10:00.000Z" };
  return { backup, bytes, fileSha, preview, source, freeze, target, backupEvidence, storage };
}
function rejects(code: string, work: () => unknown) {
  assert.throws(work, (error: unknown) => error instanceof QuoteImportEvidenceError && error.code === code);
}
function rehearsalProof(f: ReturnType<typeof fixture>, migrations: Array<{ version: string; filename: string; checksum: string; state: "applied" }>) {
  const basis = { evidenceKind: "quote_import_disposable_rehearsal.v1", outcome: "COMMITTED_PASS", reviewedCommit: COMMIT,
    sourceFileSha256: f.fileSha, sourceHash: f.source.sourceHash, projectionHash: f.source.projectionHash,
    migrationLedger: migrations, plannedCounts: f.preview.counts, readbackCounts: expectedHistoricalQuoteRowCounts(f.preview),
    readbackHash: f.source.projectionHash, sequenceNext: "3", failureCode: null, disposablePostgres: true };
  const before = { ledgerCurrent: true, tablesPresent: true,
    rowCounts: Object.fromEntries(Object.keys(expectedHistoricalQuoteRowCounts(f.preview)).map((name) => [name, 0])),
    empty: true, sequence: { lastValue: "1", isCalled: false } };
  const after = { ledgerCurrent: true, tablesPresent: true, rowCounts: expectedHistoricalQuoteRowCounts(f.preview),
    empty: false, sequence: { lastValue: "3", isCalled: false } };
  return { ...basis, rehearsalProofHash: quoteContentHash(basis), migrationsApplied: migrations.map((item) => item.filename), before, after,
    realPostgresReads: 0, realPostgresWrites: 0, browserWrites: 0 };
}

test("Q5-B strict source, freeze, backup, storage and rehearsal contracts", async () => {
  const f = fixture();
  const source = parseQuoteSourceIdentity(f.source, f.preview, f.fileSha);
  const freeze = parseQuoteFreezeEvidence(f.freeze, source);
  const target = parseQuoteTargetIdentity(f.target, f.target);
  const rollback = parseQuoteRollbackBackup(f.backupEvidence, target, freeze, SHA2, 2048, SHA, SHA);
  const storage = parseQuoteObjectStorageProof(f.storage);
  rejects("source_identity_mismatch", () => parseQuoteSourceIdentity({ ...f.source, sourceHash: SHA }, f.preview, f.fileSha));
  rejects("source_identity_mismatch", () => parseQuoteSourceIdentity({ ...f.source, projectionHash: SHA }, f.preview, f.fileSha));
  rejects("source_identity_mismatch", () => parseQuoteSourceIdentity(f.source, f.preview, SHA));
  rejects("unexpected_evidence_field", () => parseQuoteSourceIdentity({ ...f.source, localRecords: {} }, f.preview, f.fileSha));
  rejects("source_predates_quote_freeze", () => parseQuoteFreezeEvidence({ ...f.freeze, freezeStartedAt: "2026-10-07T03:10:00.000Z" }, source));
  rejects("source_predates_quote_freeze", () => parseQuoteFreezeEvidence({ ...f.freeze, frozenReopenedAt: "2026-10-07T03:10:00.000Z" }, source));
  rejects("quote_freeze_identity_mismatch", () => parseQuoteFreezeEvidence({ ...f.freeze, quoteWritesDisabled: false }, source));
  rejects("target_identity_mismatch", () => parseQuoteTargetIdentity({ ...f.target, volumeName: "wrong" }, f.target));
  for (const key of ["containerName", "composeProject", "databaseName"] as const)
    rejects("target_identity_mismatch", () => parseQuoteTargetIdentity({ ...f.target, [key]: "wrong" }, f.target));
  rejects("target_identity_mismatch", () => parseQuoteTargetIdentity({ ...f.target, fingerprint: SHA2 }, f.target));
  rejects("rollback_backup_mismatch", () => parseQuoteRollbackBackup({ ...f.backupEvidence, sha256: SHA }, target, freeze, SHA2, 2048, SHA, SHA));
  rejects("rollback_backup_mismatch", () => parseQuoteRollbackBackup(f.backupEvidence, target, freeze, SHA2, 1024, SHA, SHA));
  rejects("rollback_backup_predates_freeze", () => parseQuoteRollbackBackup({ ...f.backupEvidence,
    createdAt: "2026-10-07T01:00:00.000Z" }, target, freeze, SHA2, 2048, SHA, SHA));
  rejects("object_storage_not_ready", () => parseQuoteObjectStorageProof({ ...f.storage, preflightPass: false }));
  const migrations = (await discoverMigrations(resolve("database/migrations")))
    .map(({ version, filename, checksum }) => ({ version, filename, checksum, state: "applied" as const }));
  const proof = rehearsalProof(f, migrations);
  const parsedProof = parseQuoteRehearsalProof(proof, source, f.preview, migrations, SHA, SHA);
  rejects("rehearsal_identity_mismatch", () => parseQuoteRehearsalProof({ ...proof, reviewedCommit: SHA2 }, source, f.preview, migrations, SHA, SHA));
  rejects("rehearsal_ledger_mismatch", () => parseQuoteRehearsalProof({ ...proof, migrationLedger: migrations.slice(1) }, source, f.preview, migrations, SHA, SHA));
  rejects("rehearsal_count_or_sequence_mismatch", () => parseQuoteRehearsalProof({ ...proof,
    sequenceNext: "999", rehearsalProofHash: quoteContentHash({ ...proof, sequenceNext: "999" }) }, source, f.preview, migrations, SHA, SHA));
  rejects("rehearsal_artifact_hash_mismatch", () => parseQuoteRehearsalProof(proof, source, f.preview, migrations, SHA2, SHA));
  rejects("rehearsal_target_snapshots_mismatch", () => parseQuoteRehearsalProof({ ...proof,
    after: { ...proof.after, rowCounts: { ...proof.after.rowCounts, quote_center_quotes: 99 } } },
  source, f.preview, migrations, SHA, SHA));
  const blocked = quoteReadiness({ reviewedSource: true, browserFreeze: false, freshSource: true,
    databaseTarget: true, migration0008: false, quoteTargetEmpty: true, rollbackBackup: true,
    rehearsalEvidence: true, objectStorage: false, writerFreeze: false });
  assert.equal(blocked.readyForExecute, false);
  assert.equal(blocked.executeAuthorized, "NO");
  assert.equal(blocked.migration0008, "BLOCKED");
  assert.equal(blocked.objectStorage, "BLOCKED");
  const migrationEvidence = { evidenceVersion: 1, executionId: "q5-synthetic-attempt", executionType: "quote_import",
    outcome: "COMMITTED", startedAt: "2026-10-07T03:20:00Z", finishedAt: "2026-10-07T03:21:00Z",
    operator: "synthetic-operator", authorizationRef: "synthetic-authorization", repoCommit: COMMIT,
    reviewedCommit: COMMIT, targetFingerprint: SHA, databaseName: "q5b_test", postgresVersion: "16.9",
    migrationLedger: migrations, rollbackBackupSha256: SHA2, rollbackBackupManifestSha256: SHA,
    rehearsalProofSha256: SHA, freezeEvidenceSha256: SHA, sourceFileSha256: f.fileSha,
    sourceHash: f.source.sourceHash, projectionContentHash: f.source.projectionHash,
    plannedCounts: f.preview.counts, committedCounts: f.preview.counts,
    readbackCounts: { quote_center_quotes: 1 }, readbackContentHash: f.source.projectionHash };
  const attempt = parseQuoteImportAttemptEvidence({ contract: "quote-import-attempt.v1", outcome: "COMMITTED_PASS",
    sequenceNext: "3", migrationEvidence });
  assert.equal(attempt.migrationEvidence.executionType, "quote_import");
  rejects("unexpected_evidence_field", () => parseQuoteImportAttemptEvidence({ contract: "quote-import-attempt.v1",
    outcome: "COMMITTED_PASS", sequenceNext: "3", migrationEvidence, password: "never" }));
  const temp = await mkdtemp(join(tmpdir(), "q5b-custody-"));
  try {
    const first = join(temp, "first");
    const second = join(temp, "second");
    const bundle = await prepareQ5EvidenceBundle(first,
      { source, freeze, rehearsal: parsedProof, rollback, objectStorage: storage, attempt });
    assert.equal(bundle.contract, "quote-import-evidence-bundle.v1");
    assert.deepEqual(await copyQ5EvidenceBundle(first, second), bundle);
    const summary = await readFile(join(second, "source-identity.json"), "utf8");
    assert.ok(!summary.includes("localRecords") && !summary.includes("password") && !summary.includes("attachments"));
    await writeFile(join(second, "source-identity.json"), "tampered");
    await assert.rejects(() => verifyQ5EvidenceBundle(second), /evidence_readback_hash_mismatch/u);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("Q5-B reviewed source guard rejects drift, dirty, untracked and ignored critical files", { timeout: 30_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "q5b-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args: string[]) => exec("git", ["-C", root, ...args], { windowsHide: true });
  await git("init", "-q");
  await git("config", "user.name", "Synthetic");
  await git("config", "user.email", "synthetic@example.invalid");
  await writeFile(join(root, "package.json"), "{}\n");
  await git("add", "package.json"); await git("commit", "-qm", "reviewed");
  const reviewed = (await git("rev-parse", "HEAD")).stdout.trim();
  await assertReviewedQuoteSource(root, reviewed);
  await writeFile(join(root, "package.json"), "{\"changed\":true}\n");
  await assert.rejects(() => assertReviewedQuoteSource(root, reviewed), (error: unknown) => error instanceof QuoteSourceGuardError && error.code === "critical_worktree_dirty");
  await git("add", "package.json");
  await assert.rejects(() => assertReviewedQuoteSource(root, reviewed), (error: unknown) => error instanceof QuoteSourceGuardError && error.code === "critical_index_dirty");
  await git("commit", "-qm", "drift");
  await assert.rejects(() => assertReviewedQuoteSource(root, reviewed), (error: unknown) => error instanceof QuoteSourceGuardError && error.code === "reviewed_critical_source_drift");
  const head = (await git("rev-parse", "HEAD")).stdout.trim();
  await writeFile(join(root, "Dockerfile.server"), "synthetic\n");
  await assert.rejects(() => assertReviewedQuoteSource(root, head), (error: unknown) => error instanceof QuoteSourceGuardError && error.code === "untracked_critical_source");
  await rm(join(root, "Dockerfile.server"));
  await writeFile(join(root, ".gitignore"), "Dockerfile.server\n");
  await writeFile(join(root, "Dockerfile.server"), "synthetic\n");
  await assert.rejects(() => assertReviewedQuoteSource(root, head), (error: unknown) => error instanceof QuoteSourceGuardError && error.code === "ignored_critical_source");
});

test("Q5-B operator entrypoint exposes VerifyOnly but no real Execute or migration path", async () => {
  const script = await readFile(resolve("scripts/Invoke-Q5GuardedQuoteImport.ps1"), "utf8");
  assert.match(script, /Get-ZhixuVerifiedTarget/u);
  assert.match(script, /Invoke-ZhixuReadOnlySql/u);
  assert.match(script, /ReviewedCommit/u);
  assert.match(script, /BLOCKED_PENDING_0008/u);
  assert.match(script, /readyForExecute = \$false/u);
  assert.match(script, /verify-q5-guarded-bundle\.ts/u);
  assert.doesNotMatch(script, /\[switch\]\$Execute|runMigrations|db:migrate|pg_restore|INSERT INTO quote_center/u);
});

test("Q5-B disposable lock, unknown COMMIT, fresh reconciliation and unrelated-domain preservation", { timeout: 120_000 }, async (t) => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("q5b_guarded") });
  t.after(async () => { await pool.end(); await postgres.stop(); });
  await runMigrations(pool, resolve("database/migrations"));
  const f = fixture();
  const status = await inspectMigrationStatus(pool, resolve("database/migrations"));
  assertQuoteMigrationLedger(status.applied, status.pending, status.integrity);
  const before = await inspectHistoricalQuoteTarget(pool);
  assertEmptyQuoteTarget(before);
  rejects("quote_target_not_empty", () => assertEmptyQuoteTarget({ ...before, rowCounts: { ...before.rowCounts, quote_attachments: 1 } }));
  rejects("quote_target_not_empty", () => assertEmptyQuoteTarget({ ...before, rowCounts: { quote_center_quotes: 0 } }));
  const migrations = (await discoverMigrations(resolve("database/migrations")))
    .map(({ version, filename, checksum }) => ({ version, filename, checksum, state: "applied" as const }));
  const proof = rehearsalProof(f, migrations);
  const actualProofSha = createHash("sha256").update(JSON.stringify(proof)).digest("hex");
  const readinessInput = { preview: f.preview, actualSourceFileSha256: f.fileSha, sourceIdentity: f.source,
    freezeEvidence: f.freeze, targetIdentity: f.target, expectedTarget: f.target,
    migration: status, quoteTarget: before, rollbackManifest: f.backupEvidence,
    actualRollbackDumpSha256: SHA2, actualRollbackDumpBytes: 2048,
    actualRollbackManifestSha256: SHA, expectedRollbackManifestSha256: SHA,
    rehearsalProof: proof, actualRehearsalArtifactSha256: actualProofSha, expectedRehearsalArtifactSha256: actualProofSha,
    expectedMigrationLedger: migrations, objectStorageProof: f.storage,
    reviewedSourceVerified: true, quoteFrozenRuntimeVerified: true, databaseQuoteWritersFrozen: true };
  const disposableReadiness = assertDisposableQ5ExecutionReady(readinessInput);
  assert.deepEqual(disposableReadiness.reasons, []);
  assert.equal(disposableReadiness.executeAuthorized, "NO");
  assert.equal(disposableReadiness.readyForExecute, false);
  const currentRealStatus = evaluateGuardedQuoteReadiness({ ...readinessInput,
    migration: { applied: status.applied.filter((name) => !name.startsWith("0008_")),
      pending: ["0008_quote_attachments.sql"], integrity: "valid" },
    objectStorageProof: null, quoteFrozenRuntimeVerified: false, databaseQuoteWritersFrozen: false });
  assert.equal(currentRealStatus.migration0008, "BLOCKED");
  assert.equal(currentRealStatus.objectStorage, "BLOCKED");
  assert.equal(currentRealStatus.browserFreeze, "BLOCKED");
  await pool.query("INSERT INTO sales_orders(id,order_no,lifecycle_state,creation_source,version) VALUES('00000000-0000-4000-8000-000000000001',NULL,'draft','manual',1)");
  const otherBefore = Number((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n);
  const ordinary = new pg.Pool({ connectionString: await postgres.createDatabase("q5b_ordinary") });
  try {
    await runMigrations(ordinary, resolve("database/migrations"));
    const ordinaryBefore = await inspectHistoricalQuoteTarget(ordinary);
    assertDisposableQ5ExecutionReady({ ...readinessInput, quoteTarget: ordinaryBefore });
    const ordinaryResult = await importHistoricalQuoteProjection(ordinary, f.preview,
      { expectedSourceHash: f.preview.sourceHash, expectedProjectionHash: f.preview.projectionHash! });
    assert.equal(ordinaryResult.outcome, "COMMITTED_PASS");
    assert.equal(ordinaryResult.readbackHash, f.preview.projectionHash);
    assert.equal(ordinaryResult.sequenceNext, f.preview.sequence.nextValue);
    await assert.rejects(() => importHistoricalQuoteProjection(ordinary, f.preview,
      { expectedSourceHash: f.preview.sourceHash, expectedProjectionHash: f.preview.projectionHash! }),
    (error: unknown) => error instanceof HistoricalQuoteImportError && error.code === "target_not_empty_or_schema_pending");
  } finally { await ordinary.end(); }
  const blockerClient = await pool.connect();
  try {
    await blockerClient.query("BEGIN");
    await blockerClient.query("SELECT pg_advisory_xact_lock(873215970215::bigint)");
    await assert.rejects(() => importHistoricalQuoteProjection(pool, f.preview,
      { expectedSourceHash: f.preview.sourceHash, expectedProjectionHash: f.preview.projectionHash! }),
    (error: unknown) => error instanceof HistoricalQuoteImportError && error.code === "import_lock_unavailable");
  } finally { await blockerClient.query("ROLLBACK"); blockerClient.release(); }
  assertEmptyQuoteTarget(await inspectHistoricalQuoteTarget(pool));
  let destroyedConnections = 0;
  pool.on("remove", () => { destroyedConnections += 1; });
  await assert.rejects(() => importHistoricalQuoteProjection(pool, f.preview,
    { expectedSourceHash: f.preview.sourceHash, expectedProjectionHash: f.preview.projectionHash!,
      commitForTest: async (query) => { await query("COMMIT"); throw new Error("synthetic lost COMMIT response"); } }),
  (error: unknown) => error instanceof HistoricalQuoteImportError && error.code === "commit_outcome_unknown");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(destroyedConnections >= 1);
  const reconciled = await reconcileHistoricalQuoteProjection(pool, f.preview);
  assert.equal(reconciled.outcome, "COMMITTED_PASS");
  await assert.rejects(() => importHistoricalQuoteProjection(pool, f.preview,
    { expectedSourceHash: f.preview.sourceHash, expectedProjectionHash: f.preview.projectionHash! }),
  (error: unknown) => error instanceof HistoricalQuoteImportError && error.code === "target_not_empty_or_schema_pending");
  assert.equal(Number((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n), otherBefore);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote'")).rows[0].n), 0);
  assert.throws(() => assertQuoteMigrationLedger(status.applied.filter((name) => !name.startsWith("0008_")),
    ["0008_quote_attachments.sql"], "valid"), (error: unknown) => error instanceof QuoteImportEvidenceError && error.code === "BLOCKED_PENDING_0008");
  assert.throws(() => assertQuoteMigrationLedger(status.applied, [], "migration_required"), QuoteImportEvidenceError);
});

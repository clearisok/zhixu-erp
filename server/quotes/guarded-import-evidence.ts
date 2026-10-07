import { quoteContentHash, type HistoricalQuotePreview } from "./historical-preview.js";
import { expectedHistoricalQuoteRowCounts, type HistoricalQuoteTarget } from "./historical-import.js";
import { parseMigrationExecutionEvidence, type MigrationExecutionEvidence } from "../db/migration-evidence.js";

const SHA = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const LABEL = /^[A-Za-z0-9_.:@/-]{1,128}$/u;
const SECRET = /password|secret|token|cookie|database_url|postgres(?:ql)?:\/\//iu;
type Row = Record<string, unknown>;

export class QuoteImportEvidenceError extends Error {
  constructor(readonly code: string) { super(code); this.name = "QuoteImportEvidenceError"; }
}
function fail(code: string): never { throw new QuoteImportEvidenceError(code); }
function fields(value: unknown, required: string[], optional: string[] = []): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("invalid_evidence_shape");
  const row = value as Row;
  if (Object.keys(row).some((key) => ![...required, ...optional].includes(key) || SECRET.test(key))
      || required.some((key) => !Object.hasOwn(row, key))) return fail("unexpected_evidence_field");
  return row;
}
function string(value: unknown, pattern: RegExp, code: string): string {
  if (typeof value !== "string" || !pattern.test(value) || SECRET.test(value)) return fail(code);
  return value;
}
function time(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value)) return fail("invalid_evidence_time");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fail("invalid_evidence_time");
  return parsed;
}
function safeCounts(value: unknown): Record<string, number> {
  const row = fields(value, Object.keys((value && typeof value === "object") ? value : {}));
  for (const [name, count] of Object.entries(row)) {
    if (!/^[a-z][A-Za-z0-9_]{0,63}$/u.test(name) || !Number.isSafeInteger(count) || (count as number) < 0)
      fail("invalid_evidence_counts");
  }
  return row as Record<string, number>;
}

export type QuoteSourceIdentity = {
  contract: "quote-history-source-identity.v1";
  fileSha256: string; sourceHash: string; projectionHash: string; origin: string; namespace: string;
  environment: string; schemaVersion: number; backupVersion: number; capturedAt: string; fileModifiedAt: string; reviewedCommit: string;
};
export function parseQuoteSourceIdentity(value: unknown, preview: HistoricalQuotePreview, actualFileSha: string): QuoteSourceIdentity {
  const row = fields(value, ["contract", "fileSha256", "sourceHash", "projectionHash", "origin", "namespace", "environment",
    "schemaVersion", "backupVersion", "capturedAt", "fileModifiedAt", "reviewedCommit"]);
  if (row.contract !== "quote-history-source-identity.v1" || preview.blockers.length || !preview.projectionHash
      || string(row.fileSha256, SHA, "invalid_source_file_sha") !== actualFileSha
      || row.sourceHash !== preview.sourceHash || row.projectionHash !== preview.projectionHash
      || row.origin !== preview.capture.origin || row.namespace !== preview.capture.namespace
      || row.environment !== preview.capture.environment || row.schemaVersion !== preview.capture.schemaVersion
      || row.backupVersion !== preview.capture.backupVersion || row.capturedAt !== preview.capture.timestamp)
    fail("source_identity_mismatch");
  string(row.reviewedCommit, COMMIT, "invalid_reviewed_commit");
  if (row.environment !== "development" && row.environment !== "production") fail("invalid_source_environment");
  string(row.namespace, LABEL, "invalid_source_namespace");
  try {
    const origin = new URL(String(row.origin));
    if (!(["http:", "https:"].includes(origin.protocol)) || origin.username || origin.password
        || origin.search || origin.hash || origin.pathname !== "/") fail("invalid_browser_origin");
  } catch { fail("invalid_browser_origin"); }
  const captured = time(row.capturedAt);
  const modified = time(row.fileModifiedAt);
  if (modified < captured - 60_000 || modified > Date.now() + 60_000) fail("source_file_time_mismatch");
  return row as QuoteSourceIdentity;
}

export type QuoteFreezeEvidence = {
  contract: "quote-writer-freeze.v1"; browserOrigin: string; profileLabel: string; reviewedCommit: string; buildId: string;
  freezeStartedAt: string; oldTabsClosedAt: string; frozenReopenedAt: string; verifiedAt: string;
  quoteWritesDisabled: true; noMutationAfterCapture: true; runtimeIdentity: string;
};
export function parseQuoteFreezeEvidence(value: unknown, source: QuoteSourceIdentity): QuoteFreezeEvidence {
  const row = fields(value, ["contract", "browserOrigin", "profileLabel", "reviewedCommit", "buildId", "freezeStartedAt",
    "oldTabsClosedAt", "frozenReopenedAt", "verifiedAt", "quoteWritesDisabled", "noMutationAfterCapture", "runtimeIdentity"]);
  if (row.contract !== "quote-writer-freeze.v1" || row.browserOrigin !== source.origin
      || row.reviewedCommit !== source.reviewedCommit || row.quoteWritesDisabled !== true
      || row.noMutationAfterCapture !== true) fail("quote_freeze_identity_mismatch");
  for (const key of ["profileLabel", "buildId", "runtimeIdentity"]) string(row[key], LABEL, "invalid_quote_freeze_label");
  const ordered = [row.freezeStartedAt, row.oldTabsClosedAt, row.frozenReopenedAt, row.verifiedAt, source.capturedAt, source.fileModifiedAt].map(time);
  if (ordered.some((point, index) => index > 0 && point < ordered[index - 1])) fail("source_predates_quote_freeze");
  return row as QuoteFreezeEvidence;
}

export type QuoteTargetIdentity = { containerName: string; composeProject: string; volumeName: string; databaseName: string; fingerprint: string };
export function parseQuoteTargetIdentity(value: unknown, expected: QuoteTargetIdentity): QuoteTargetIdentity {
  const row = fields(value, ["containerName", "composeProject", "volumeName", "databaseName", "fingerprint"]);
  for (const key of ["containerName", "composeProject", "volumeName", "databaseName"]) string(row[key], LABEL, "invalid_target_identity");
  string(row.fingerprint, SHA, "invalid_target_fingerprint");
  if (Object.keys(expected).some((key) => row[key] !== expected[key as keyof QuoteTargetIdentity])) fail("target_identity_mismatch");
  return row as QuoteTargetIdentity;
}

export function assertQuoteMigrationLedger(applied: string[], pending: string[], integrity: string): void {
  if (integrity !== "valid") fail("invalid_migration_ledger");
  if (!applied.includes("0008_quote_attachments.sql") || pending.includes("0008_quote_attachments.sql")) fail("BLOCKED_PENDING_0008");
  for (const required of ["0005_quote_foundation.sql", "0006_quote_number_sequence.sql", "0007_quote_master_settings.sql"])
    if (!applied.includes(required) || pending.includes(required)) fail("required_migration_pending");
  if (pending.length) fail("migration_pending");
}

export function assertEmptyQuoteTarget(target: HistoricalQuoteTarget): void {
  if (!target.ledgerCurrent || !target.tablesPresent) fail("quote_schema_not_current");
  const names = ["quote_center_quotes", "quote_center_revisions", "quote_center_price_versions", "quote_center_estimates",
    "quote_center_cost_snapshots", "quote_center_fabric_lines", "quote_center_trim_lines", "quote_center_other_cost_lines",
    "quote_attachments", "quote_revision_attachments"];
  if (!target.empty || names.some((name) => target.rowCounts[name] !== 0)
      || Object.keys(target.rowCounts).length !== names.length) fail("quote_target_not_empty");
  if (!target.sequence || target.sequence.isCalled || target.sequence.lastValue !== "1") fail("quote_sequence_consumed");
}

export type QuoteRollbackBackup = { contract: "zhixu-exact-target-backup.v1"; createdAt: string; filename: string;
  bytes: number; sha256: string; targetFingerprint: string; containerName: string;
  composeProject: string; volumeName: string; databaseName: string; archiveListVerified: true };
export function parseQuoteRollbackBackup(value: unknown, target: QuoteTargetIdentity, freeze: QuoteFreezeEvidence,
  actualDumpSha: string, actualDumpBytes: number, actualManifestSha: string, expectedManifestSha: string): QuoteRollbackBackup {
  const row = fields(value, ["contract", "createdAt", "filename", "bytes", "sha256", "targetFingerprint",
    "containerName", "composeProject", "volumeName", "databaseName", "archiveListVerified"]);
  if (row.contract !== "zhixu-exact-target-backup.v1" || row.archiveListVerified !== true
      || !Number.isSafeInteger(row.bytes) || (row.bytes as number) < 1024
      || row.bytes !== actualDumpBytes
      || typeof row.filename !== "string" || !/^[A-Za-z0-9_.-]+\.dump$/u.test(row.filename)
      || string(row.sha256, SHA, "invalid_dump_sha") !== actualDumpSha
      || string(actualManifestSha, SHA, "invalid_manifest_sha") !== expectedManifestSha
      || row.targetFingerprint !== target.fingerprint || row.containerName !== target.containerName
      || row.composeProject !== target.composeProject || row.volumeName !== target.volumeName || row.databaseName !== target.databaseName)
    fail("rollback_backup_mismatch");
  if (time(row.createdAt) < time(freeze.freezeStartedAt)) fail("rollback_backup_predates_freeze");
  return row as QuoteRollbackBackup;
}

export type QuoteRehearsalProof = { evidenceKind: "quote_import_disposable_rehearsal.v1"; outcome: "COMMITTED_PASS";
  reviewedCommit: string; sourceFileSha256: string; sourceHash: string; projectionHash: string;
  migrationLedger: Array<{ version: string; filename: string; checksum: string; state: "applied" }>;
  plannedCounts: Record<string, number>; readbackCounts: Record<string, number>; readbackHash: string;
  sequenceNext: string; failureCode: null; rehearsalProofHash: string; disposablePostgres: true };
export function parseQuoteRehearsalProof(value: unknown, source: QuoteSourceIdentity, preview: HistoricalQuotePreview,
  expectedLedger: QuoteRehearsalProof["migrationLedger"], actualArtifactSha: string, expectedArtifactSha: string): QuoteRehearsalProof {
  if (string(actualArtifactSha, SHA, "invalid_rehearsal_artifact_sha") !== expectedArtifactSha) fail("rehearsal_artifact_hash_mismatch");
  const row = fields(value, ["evidenceKind", "outcome", "reviewedCommit", "sourceFileSha256", "sourceHash", "projectionHash",
    "migrationLedger", "plannedCounts", "readbackCounts", "readbackHash", "sequenceNext", "failureCode", "rehearsalProofHash", "disposablePostgres"],
  ["migrationsApplied", "before", "after", "realPostgresReads", "realPostgresWrites", "browserWrites"]);
  if (row.evidenceKind !== "quote_import_disposable_rehearsal.v1" || row.outcome !== "COMMITTED_PASS"
      || row.reviewedCommit !== source.reviewedCommit || row.sourceFileSha256 !== source.fileSha256
      || row.sourceHash !== source.sourceHash || row.projectionHash !== source.projectionHash
      || row.readbackHash !== source.projectionHash || row.disposablePostgres !== true || row.failureCode !== null
      || row.realPostgresReads !== 0 || row.realPostgresWrites !== 0 || row.browserWrites !== 0)
    fail("rehearsal_identity_mismatch");
  if (!Array.isArray(row.migrationLedger) || row.migrationLedger.length !== expectedLedger.length) fail("rehearsal_ledger_mismatch");
  const ledger = row.migrationLedger.map((entry) => fields(entry, ["version", "filename", "checksum", "state"]));
  if (ledger.some((entry, index) => entry.version !== expectedLedger[index].version || entry.filename !== expectedLedger[index].filename
      || entry.checksum !== expectedLedger[index].checksum || entry.state !== "applied")) fail("rehearsal_ledger_mismatch");
  const planned = safeCounts(row.plannedCounts);
  const readback = safeCounts(row.readbackCounts);
  if (!Array.isArray(row.migrationsApplied) || row.migrationsApplied.some((name) => typeof name !== "string" || !/^\d{4,}_[a-z0-9_-]+\.sql$/u.test(name)))
    fail("invalid_rehearsal_migration_list");
  if (row.migrationsApplied.length !== expectedLedger.length
      || row.migrationsApplied.some((name, index) => name !== expectedLedger[index].filename)) fail("rehearsal_migration_list_mismatch");
  for (const key of ["before", "after"] as const) {
    const snapshot = fields(row[key], ["ledgerCurrent", "tablesPresent", "rowCounts", "empty", "sequence"]);
    if (typeof snapshot.ledgerCurrent !== "boolean" || typeof snapshot.tablesPresent !== "boolean" || typeof snapshot.empty !== "boolean")
      fail("invalid_rehearsal_target_snapshot");
    safeCounts(snapshot.rowCounts);
    if (snapshot.sequence !== null) {
      const sequence = fields(snapshot.sequence, ["lastValue", "isCalled"]);
      if (typeof sequence.lastValue !== "string" || !/^[1-9][0-9]*$/u.test(sequence.lastValue)
          || typeof sequence.isCalled !== "boolean") fail("invalid_rehearsal_sequence");
    }
  }
  const before = row.before as HistoricalQuoteTarget;
  const after = row.after as HistoricalQuoteTarget;
  if (!before.ledgerCurrent || !before.tablesPresent || !before.empty
      || Object.values(before.rowCounts).some((count) => count !== 0)
      || !after.ledgerCurrent || !after.tablesPresent || after.empty
      || Object.entries(expectedHistoricalQuoteRowCounts(preview)).some(([name, count]) => after.rowCounts[name] !== count))
    fail("rehearsal_target_snapshots_mismatch");
  const expectedRows = expectedHistoricalQuoteRowCounts(preview);
  if (Object.keys(planned).length !== Object.keys(preview.counts).length
      || Object.entries(preview.counts).some(([name, count]) => planned[name] !== count)
      || Object.keys(readback).length !== Object.keys(expectedRows).length
      || Object.entries(expectedRows).some(([name, count]) => readback[name] !== count)
      || row.sequenceNext !== preview.sequence.nextValue) fail("rehearsal_count_or_sequence_mismatch");
  string(row.rehearsalProofHash, SHA, "invalid_rehearsal_proof_hash");
  const { rehearsalProofHash: _hash, migrationsApplied: _applied, before: _before, after: _after,
    realPostgresReads: _reads, realPostgresWrites: _writes, browserWrites: _browser, ...basis } = row;
  void _hash; void _applied; void _before; void _after; void _reads; void _writes; void _browser;
  if (quoteContentHash(basis) !== row.rehearsalProofHash) fail("rehearsal_proof_hash_mismatch");
  return row as QuoteRehearsalProof;
}

export type QuoteObjectStorageProof = { contract: "quote-object-storage-readiness.v1"; providerConfigured: true;
  privateBucket: true; preflightPass: true; putHeadGetDeletePass: true; runtimeConfigReviewed: true;
  endpointIdentity: string; region: string; bucket: string; verifiedAt: string };
export function parseQuoteObjectStorageProof(value: unknown): QuoteObjectStorageProof {
  const row = fields(value, ["contract", "providerConfigured", "privateBucket", "preflightPass", "putHeadGetDeletePass",
    "runtimeConfigReviewed", "endpointIdentity", "region", "bucket", "verifiedAt"]);
  if (row.contract !== "quote-object-storage-readiness.v1" || row.providerConfigured !== true || row.privateBucket !== true
      || row.preflightPass !== true || row.putHeadGetDeletePass !== true || row.runtimeConfigReviewed !== true)
    fail("object_storage_not_ready");
  for (const key of ["endpointIdentity", "region", "bucket"]) string(row[key], LABEL, "invalid_object_storage_identity");
  time(row.verifiedAt);
  return row as QuoteObjectStorageProof;
}

export type QuoteReadiness = { contract: "quote_import_readiness.v1"; reviewedSource: "PASS" | "BLOCKED";
  browserFreeze: "PASS" | "BLOCKED"; freshSource: "PASS" | "BLOCKED"; databaseTarget: "PASS" | "BLOCKED";
  migration0008: "PASS" | "BLOCKED"; quoteTargetEmpty: "PASS" | "BLOCKED"; rollbackBackup: "PASS" | "BLOCKED";
  rehearsalEvidence: "PASS" | "BLOCKED"; objectStorage: "PASS" | "BLOCKED"; writerFreeze: "PASS" | "BLOCKED";
  executeAuthorized: "NO"; readyForExecute: false; reasons: string[] };
export function quoteReadiness(checks: Partial<Record<Exclude<keyof QuoteReadiness, "contract" | "executeAuthorized" | "readyForExecute" | "reasons">, boolean>>): QuoteReadiness {
  const keys = ["reviewedSource", "browserFreeze", "freshSource", "databaseTarget", "migration0008", "quoteTargetEmpty",
    "rollbackBackup", "rehearsalEvidence", "objectStorage", "writerFreeze"] as const;
  const result = Object.fromEntries(keys.map((key) => [key, checks[key] === true ? "PASS" : "BLOCKED"])) as Pick<QuoteReadiness, typeof keys[number]>;
  return { contract: "quote_import_readiness.v1", ...result, executeAuthorized: "NO", readyForExecute: false,
    reasons: keys.filter((key) => result[key] === "BLOCKED") };
}

export type QuoteImportAttemptOutcome = "PRECHECK_FAILED" | "ROLLED_BACK" | "COMMIT_OUTCOME_UNKNOWN" |
  "COMMITTED_BUT_UNVERIFIED" | "COMMITTED_PASS";
export type QuoteImportAttemptEvidence = { contract: "quote-import-attempt.v1"; outcome: QuoteImportAttemptOutcome;
  sequenceNext: string; migrationEvidence: MigrationExecutionEvidence };
/** Q5-specific state on top of the existing D-091 migration evidence, never a runtime OperationLog. */
export function parseQuoteImportAttemptEvidence(value: unknown): QuoteImportAttemptEvidence {
  const row = fields(value, ["contract", "outcome", "sequenceNext", "migrationEvidence"]);
  const outcomeMap = { PRECHECK_FAILED: "FAILED", ROLLED_BACK: "FAILED", COMMIT_OUTCOME_UNKNOWN: "COMMIT_OUTCOME_UNKNOWN",
    COMMITTED_BUT_UNVERIFIED: "COMMITTED_UNVERIFIED", COMMITTED_PASS: "COMMITTED" } as const;
  if (row.contract !== "quote-import-attempt.v1" || typeof row.outcome !== "string"
      || !Object.hasOwn(outcomeMap, row.outcome)) fail("invalid_quote_attempt_outcome");
  const outcome = row.outcome as QuoteImportAttemptOutcome;
  if (typeof row.sequenceNext !== "string" || !/^[1-9][0-9]{0,18}$/u.test(row.sequenceNext)) fail("invalid_quote_sequence_next");
  const evidence = parseMigrationExecutionEvidence(row.migrationEvidence);
  if (evidence.executionType !== "quote_import" || evidence.outcome !== outcomeMap[outcome]
      || !evidence.reviewedCommit || !evidence.plannedCounts || !evidence.sourceFileSha256
      || !evidence.sourceHash || !evidence.projectionContentHash || !evidence.rollbackBackupSha256
      || !evidence.rollbackBackupManifestSha256 || !evidence.rehearsalProofSha256 || !evidence.freezeEvidenceSha256
      || (outcome === "COMMITTED_PASS" && evidence.readbackContentHash !== evidence.projectionContentHash))
    fail("quote_attempt_evidence_mismatch");
  return { contract: "quote-import-attempt.v1", outcome, sequenceNext: row.sequenceNext, migrationEvidence: evidence };
}

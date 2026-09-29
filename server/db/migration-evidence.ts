// A pure, storage-neutral contract for future guarded migration/import runners.
// It is not a runtime OperationLog and does not write to PostgreSQL.
export type MigrationExecutionOutcome = "PREPARED" | "COMMITTED" | "FAILED" | "COMMITTED_UNVERIFIED" | "COMMIT_OUTCOME_UNKNOWN";
export type MigrationExecutionType = "schema_migration" | "quote_master_settings_import" | "quote_import";

export type MigrationLedgerEvidence = {
  version: string;
  filename: string;
  checksum: string;
  state: "applied" | "pending";
};

export type MigrationExecutionEvidence = {
  evidenceVersion: 1;
  executionId: string;
  executionType: MigrationExecutionType;
  outcome: MigrationExecutionOutcome;
  startedAt: string;
  finishedAt: string;
  operator: string;
  authorizationRef: string;
  repoCommit: string;
  targetFingerprint: string;
  databaseName: string;
  postgresVersion: string;
  migrationLedger: MigrationLedgerEvidence[];
  rollbackBackupSha256: string;
  rollbackBackupManifestSha256?: string;
  sourceFileSha256?: string;
  sourceHash?: string;
  projectionContentHash?: string;
  reviewedCommit?: string;
  rehearsalProofSha256?: string;
  freezeEvidenceSha256?: string;
  plannedCounts?: Record<string, number>;
  committedCounts?: Record<string, number>;
  readbackCounts?: Record<string, number>;
  readbackContentHash?: string;
  failure?: { code: string; phase: string };
};

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SAFE_ID = /^[A-Za-z0-9_.:@/-]{1,128}$/;
const SECRET_LIKE = /password|secret|token|cookie|database_url|postgres(?:ql)?:\/\//i;

function fail(): never { throw new Error("invalid_migration_execution_evidence"); }

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key) || SECRET_LIKE.test(key))) fail();
  return result;
}

function safeString(value: unknown, pattern: RegExp = SAFE_ID): string {
  if (typeof value !== "string" || value.length > 128 || !pattern.test(value) || SECRET_LIKE.test(value)) fail();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value))) fail();
  return value;
}

function counts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const source = value as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const key of Object.keys(source).sort()) {
    if (!/^[a-z][A-Za-z0-9_]{0,63}$/.test(key) || SECRET_LIKE.test(key)) fail();
    const count = source[key];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) fail();
    result[key] = count;
  }
  return result;
}

export function parseMigrationExecutionEvidence(input: unknown): MigrationExecutionEvidence {
  const source = record(input, [
    "evidenceVersion", "executionId", "executionType", "outcome", "startedAt", "finishedAt",
    "operator", "authorizationRef", "repoCommit", "targetFingerprint", "databaseName",
    "postgresVersion", "migrationLedger", "rollbackBackupSha256", "rollbackBackupManifestSha256", "sourceFileSha256",
    "sourceHash", "projectionContentHash", "reviewedCommit", "rehearsalProofSha256", "freezeEvidenceSha256", "plannedCounts", "committedCounts", "readbackCounts",
    "readbackContentHash", "failure",
  ]);
  if (source.evidenceVersion !== 1) fail();
  const executionType = source.executionType;
  if (executionType !== "schema_migration" && executionType !== "quote_master_settings_import" && executionType !== "quote_import") fail();
  const outcome = source.outcome;
  if (outcome !== "PREPARED" && outcome !== "COMMITTED" && outcome !== "FAILED" && outcome !== "COMMITTED_UNVERIFIED" && outcome !== "COMMIT_OUTCOME_UNKNOWN") fail();
  const startedAt = timestamp(source.startedAt);
  const finishedAt = timestamp(source.finishedAt);
  if (Date.parse(finishedAt) < Date.parse(startedAt)) fail();
  if (!Array.isArray(source.migrationLedger) || source.migrationLedger.length < 1 || source.migrationLedger.length > 100) fail();
  const migrationLedger: MigrationLedgerEvidence[] = source.migrationLedger.map((item: unknown) => {
    const row = record(item, ["version", "filename", "checksum", "state"]);
    const version = safeString(row.version, /^\d{1,12}$/);
    const filename = safeString(row.filename, /^\d{4,}_[a-z0-9_-]+\.sql$/);
    if (row.state !== "applied" && row.state !== "pending") fail();
    return { version, filename, checksum: safeString(row.checksum, SHA256), state: row.state };
  });
  if (new Set(migrationLedger.map((row) => row.version)).size !== migrationLedger.length) fail();
  migrationLedger.sort((left, right) => Number(left.version) - Number(right.version));
  const failure = source.failure === undefined ? undefined : record(source.failure, ["code", "phase"]);
  if ((outcome === "FAILED" || outcome === "COMMITTED_UNVERIFIED" || outcome === "COMMIT_OUTCOME_UNKNOWN") !== (failure !== undefined)) fail();
  if (outcome === "PREPARED" && (source.committedCounts !== undefined || source.readbackCounts !== undefined)) fail();
  if (executionType === "quote_master_settings_import" && source.plannedCounts === undefined) fail();
  if (outcome === "COMMITTED" && (source.committedCounts === undefined || source.readbackCounts === undefined || source.readbackContentHash === undefined)) fail();
  if (outcome === "COMMITTED_UNVERIFIED" && source.committedCounts === undefined) fail();
  if (executionType !== "schema_migration" && (source.sourceFileSha256 === undefined || source.sourceHash === undefined || source.projectionContentHash === undefined)) fail();
  if (executionType === "quote_master_settings_import" && (source.reviewedCommit === undefined || source.rehearsalProofSha256 === undefined || source.freezeEvidenceSha256 === undefined)) fail();
  if (executionType === "quote_master_settings_import" && source.rollbackBackupManifestSha256 === undefined) fail();
  if (source.sourceHash !== undefined && (source.sourceFileSha256 === undefined || source.projectionContentHash === undefined)) fail();
  const evidence: MigrationExecutionEvidence = {
    evidenceVersion: 1,
    executionId: safeString(source.executionId),
    executionType,
    outcome,
    startedAt,
    finishedAt,
    operator: safeString(source.operator),
    authorizationRef: safeString(source.authorizationRef),
    repoCommit: safeString(source.repoCommit, COMMIT),
    targetFingerprint: safeString(source.targetFingerprint, SHA256),
    databaseName: safeString(source.databaseName, /^[A-Za-z0-9_.-]{1,63}$/),
    postgresVersion: safeString(source.postgresVersion, /^\d{1,2}\.\d{1,3}$/),
    migrationLedger,
    rollbackBackupSha256: safeString(source.rollbackBackupSha256, SHA256),
  };
  if (source.sourceFileSha256 !== undefined) evidence.sourceFileSha256 = safeString(source.sourceFileSha256, SHA256);
  if (source.rollbackBackupManifestSha256 !== undefined) evidence.rollbackBackupManifestSha256 = safeString(source.rollbackBackupManifestSha256, SHA256);
  if (source.sourceHash !== undefined) evidence.sourceHash = safeString(source.sourceHash, SHA256);
  if (source.projectionContentHash !== undefined) evidence.projectionContentHash = safeString(source.projectionContentHash, SHA256);
  if (source.reviewedCommit !== undefined) evidence.reviewedCommit = safeString(source.reviewedCommit, COMMIT);
  if (source.rehearsalProofSha256 !== undefined) evidence.rehearsalProofSha256 = safeString(source.rehearsalProofSha256, SHA256);
  if (source.freezeEvidenceSha256 !== undefined) evidence.freezeEvidenceSha256 = safeString(source.freezeEvidenceSha256, SHA256);
  if (source.plannedCounts !== undefined) evidence.plannedCounts = counts(source.plannedCounts);
  if (source.committedCounts !== undefined) evidence.committedCounts = counts(source.committedCounts);
  if (source.readbackCounts !== undefined) evidence.readbackCounts = counts(source.readbackCounts);
  if (source.readbackContentHash !== undefined) evidence.readbackContentHash = safeString(source.readbackContentHash, SHA256);
  if (failure) evidence.failure = { code: safeString(failure.code), phase: safeString(failure.phase) };
  return evidence;
}

export function serializeMigrationExecutionEvidence(input: unknown): string {
  return JSON.stringify(parseMigrationExecutionEvidence(input));
}

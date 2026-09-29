import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { previewMasterSettingsBackup, type MasterSettingsBackupPreviewReport } from "../../features/basic-settings/server/master-settings-backup-preview.js";
import { migrationContentFromPreview, migrationContentHash, type QuoteMasterSettingsRowCounts } from "../integration/quote-master-settings-migration-import.js";

const shaPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const q3Tables = ["brands", "customerSalespeople", "fabrics", "trims", "manufacturingPresets", "brandDefaultTrims", "salespersonDefaultTrims", "globalSettings", "total"] as const;

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireSha(value: unknown, name: string): string {
  if (typeof value !== "string" || !shaPattern.test(value)) throw new Error(`${name}_invalid`);
  return value;
}

function requireCommit(value: unknown): string {
  if (typeof value !== "string" || !commitPattern.test(value)) throw new Error("reviewed_commit_invalid");
  return value;
}

function requireTimestamp(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name}_invalid`);
  }
  return value;
}

function requireOrigin(value: unknown): string {
  if (typeof value !== "string") throw new Error("browser_origin_invalid");
  const parsed = new URL(value);
  if (!(["http:", "https:"].includes(parsed.protocol)) || parsed.origin !== value || parsed.username || parsed.password) {
    throw new Error("browser_origin_invalid");
  }
  return value;
}

function sameCounts(left: QuoteMasterSettingsRowCounts, right: QuoteMasterSettingsRowCounts): boolean {
  return q3Tables.every((key) => Number.isSafeInteger(left[key]) && left[key] >= 0 && left[key] === right[key]);
}

export type FrozenBuildIdentity = {
  gitCommit: string;
  buildId: string;
  buildTime: string;
  masterSettingsAuthority: "frozen";
};

export type Q3FreezeEvidence = {
  evidenceVersion: 1;
  result: "PASS";
  browserOrigin: string;
  browserProfileLabel: string;
  namespace: string;
  schemaVersion: number;
  expected: FrozenBuildIdentity;
  observed: FrozenBuildIdentity;
  freezeStartedAt: string;
  verifiedAt: string;
  operatorLabel: string;
  allOldTabsClosedBeforeFrozenReopen: true;
};

/** Only checks the running bundle; old-tab closure is an explicit operator attestation. */
export async function verifyRunningFrozenBuild(
  origin: string,
  expected: FrozenBuildIdentity,
  fetchImpl: typeof fetch = fetch,
): Promise<FrozenBuildIdentity> {
  requireOrigin(origin);
  requireCommit(expected.gitCommit);
  if (!expected.buildId || expected.masterSettingsAuthority !== "frozen") throw new Error("expected_frozen_build_invalid");
  const response = await fetchImpl(`${origin}/build-info.json`, { cache: "no-store", redirect: "manual", credentials: "omit" });
  if (!response.ok || response.redirected || response.url && new URL(response.url).origin !== origin) throw new Error("running_build_unavailable");
  let value: unknown;
  try { value = await response.json() as unknown; } catch { throw new Error("running_build_invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("running_build_invalid");
  const info = value as Record<string, unknown>;
  if (info.gitCommit !== expected.gitCommit || info.buildId !== expected.buildId || info.masterSettingsAuthority !== "frozen" || info.buildTime !== expected.buildTime) {
    throw new Error("running_frozen_build_mismatch");
  }
  return { gitCommit: expected.gitCommit, buildId: expected.buildId, buildTime: expected.buildTime, masterSettingsAuthority: "frozen" };
}

export function validateFreezeEvidence(input: Q3FreezeEvidence, expected: { origin: string; namespace: string; schemaVersion: number; commit: string; buildId: string }): Q3FreezeEvidence {
  if (input.evidenceVersion !== 1 || input.result !== "PASS" || input.allOldTabsClosedBeforeFrozenReopen !== true ||
    requireOrigin(input.browserOrigin) !== requireOrigin(expected.origin) || input.namespace !== expected.namespace ||
    input.schemaVersion !== expected.schemaVersion || !input.browserProfileLabel.trim() || !input.operatorLabel.trim() ||
    input.expected.masterSettingsAuthority !== "frozen" || input.observed.masterSettingsAuthority !== "frozen" ||
    input.expected.gitCommit !== requireCommit(expected.commit) || input.observed.gitCommit !== expected.commit ||
    input.expected.buildId !== expected.buildId || input.observed.buildId !== expected.buildId ||
    input.expected.buildTime !== input.observed.buildTime) throw new Error("frozen_build_evidence_mismatch");
  const start = requireTimestamp(input.freezeStartedAt, "freeze_started_at");
  const verified = requireTimestamp(input.verifiedAt, "freeze_verified_at");
  if (Date.parse(verified) < Date.parse(start)) throw new Error("freeze_evidence_time_mismatch");
  return input;
}

export type Q3SourceIdentity = {
  absolutePath: string;
  bytes: number;
  fileSha256: string;
  capture: MasterSettingsBackupPreviewReport["capture"];
  sourceHash: string;
  projectionContentHash: string;
  projectedCounts: QuoteMasterSettingsRowCounts;
  blockers: number;
  warnings: number;
};

/** Reuses the canonical Q3B2A parser/projection; never mutates the backup. */
export async function inspectQ3SourceFile(path: string): Promise<{ identity: Q3SourceIdentity; report: MasterSettingsBackupPreviewReport }> {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error("source_path_not_absolute_canonical");
  const [file, canonical] = await Promise.all([lstat(path), realpath(path)]);
  if (file.isSymbolicLink() || !file.isFile() || canonical !== path || file.size < 32 || file.size > 512 * 1024 * 1024) throw new Error("source_file_invalid");
  const raw = await readFile(path);
  const fileSha256 = sha256(raw);
  let parsed: unknown;
  try { parsed = JSON.parse(raw.toString("utf8")) as unknown; } catch { throw new Error("source_json_invalid"); }
  const report = await previewMasterSettingsBackup(parsed);
  const after = await stat(path);
  if (after.size !== file.size || after.mtimeMs !== file.mtimeMs || sha256(await readFile(path)) !== fileSha256) throw new Error("source_changed_during_read");
  const content = migrationContentFromPreview(report);
  return {
    identity: {
      absolutePath: path, bytes: file.size, fileSha256, capture: report.capture, sourceHash: report.sourceHash,
      projectionContentHash: migrationContentHash(content), projectedCounts: report.preview.projectedServerRows,
      blockers: report.preview.blockingErrors.length + report.sensitiveFieldPaths.length,
      warnings: report.preview.warnings.length,
    }, report,
  };
}

export type Q3RehearsalProof = {
  proofVersion: 1;
  result: "PASS";
  sourceFileSha256: string;
  sourceHash: string;
  projectionContentHash: string;
  projectedCounts: QuoteMasterSettingsRowCounts;
  reviewedCommit: string;
  migrationLedger: Array<{ version: string; filename: string; checksum: string }>;
  postgresMajor: 16;
  rehearsedAt: string;
  importCounts: QuoteMasterSettingsRowCounts;
  readbackCounts: QuoteMasterSettingsRowCounts;
  readbackContentHash: string;
  rollbackValidated: true;
  postCommitUnverifiedValidated: true;
  secondImportRejected: true;
  disposableContainerRemoved: true;
};

export function validateRehearsalProof(proof: Q3RehearsalProof, source: Q3SourceIdentity, reviewedCommit: string, ledger: Q3RehearsalProof["migrationLedger"]): Q3RehearsalProof {
  if (proof.proofVersion !== 1 || proof.result !== "PASS" || proof.postgresMajor !== 16 ||
    proof.sourceFileSha256 !== requireSha(source.fileSha256, "source_file_sha") || proof.sourceHash !== requireSha(source.sourceHash, "source_hash") ||
    proof.projectionContentHash !== requireSha(source.projectionContentHash, "projection_hash") ||
    proof.readbackContentHash !== source.projectionContentHash || proof.reviewedCommit !== requireCommit(reviewedCommit) ||
    !sameCounts(proof.projectedCounts, source.projectedCounts) || !sameCounts(proof.importCounts, source.projectedCounts) ||
    !sameCounts(proof.readbackCounts, source.projectedCounts) || !proof.rollbackValidated || !proof.postCommitUnverifiedValidated || !proof.secondImportRejected ||
    !proof.disposableContainerRemoved || JSON.stringify(proof.migrationLedger) !== JSON.stringify(ledger)) throw new Error("rehearsal_proof_mismatch");
  requireTimestamp(proof.rehearsedAt, "rehearsed_at");
  return proof;
}

export async function readHashedEvidence<T>(path: string, expectedSha256: string): Promise<T> {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error("evidence_path_not_canonical");
  const file = await lstat(path);
  if (!file.isFile() || file.isSymbolicLink() || await realpath(path) !== path || file.size < 2 || file.size > 1024 * 1024) throw new Error("evidence_file_invalid");
  const raw = await readFile(path);
  if (sha256(raw) !== requireSha(expectedSha256, "evidence_sha")) throw new Error("evidence_hash_mismatch");
  return JSON.parse(raw.toString("utf8")) as T;
}

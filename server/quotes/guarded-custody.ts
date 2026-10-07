import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { QuoteFreezeEvidence, QuoteImportAttemptEvidence, QuoteObjectStorageProof,
  QuoteRehearsalProof, QuoteRollbackBackup, QuoteSourceIdentity } from "./guarded-import-evidence.js";
import { parseQuoteImportAttemptEvidence } from "./guarded-import-evidence.js";

const FILES = ["source-identity.json", "quote-freeze.json", "rehearsal-proof.json", "rollback-manifest.json",
  "object-storage.json", "attempt.json"] as const;
type BundleItems = { source: QuoteSourceIdentity; freeze: QuoteFreezeEvidence; rehearsal: QuoteRehearsalProof;
  rollback: QuoteRollbackBackup; objectStorage: QuoteObjectStorageProof; attempt?: QuoteImportAttemptEvidence };
type Index = { contract: "quote-import-evidence-bundle.v1"; files: Record<string, string> };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function safeNewDirectory(path: string): Promise<string> {
  const destination = resolve(path);
  let ancestor = dirname(destination);
  while (true) {
    const entry = await lstat(ancestor);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("evidence_parent_invalid");
    const next = dirname(ancestor);
    if (next === ancestor) break;
    ancestor = next;
  }
  await mkdir(destination, { recursive: false });
  return destination;
}

/** Only a fixed small summary bundle; accepts no path to the raw Browser backup or PostgreSQL dump. */
export async function prepareQ5EvidenceBundle(destination: string, items: BundleItems): Promise<Index> {
  const directory = await safeNewDirectory(destination);
  const summaries: Record<string, unknown> = {
    "source-identity.json": { contract: items.source.contract, fileSha256: items.source.fileSha256,
      sourceHash: items.source.sourceHash, projectionHash: items.source.projectionHash, origin: items.source.origin,
      namespace: items.source.namespace, environment: items.source.environment, schemaVersion: items.source.schemaVersion,
      backupVersion: items.source.backupVersion, capturedAt: items.source.capturedAt,
      fileModifiedAt: items.source.fileModifiedAt, reviewedCommit: items.source.reviewedCommit },
    "quote-freeze.json": { contract: items.freeze.contract, browserOrigin: items.freeze.browserOrigin,
      profileLabel: items.freeze.profileLabel, reviewedCommit: items.freeze.reviewedCommit, buildId: items.freeze.buildId,
      freezeStartedAt: items.freeze.freezeStartedAt, oldTabsClosedAt: items.freeze.oldTabsClosedAt,
      frozenReopenedAt: items.freeze.frozenReopenedAt, verifiedAt: items.freeze.verifiedAt,
      quoteWritesDisabled: items.freeze.quoteWritesDisabled, noMutationAfterCapture: items.freeze.noMutationAfterCapture,
      runtimeIdentity: items.freeze.runtimeIdentity },
    "rehearsal-proof.json": {
      evidenceKind: items.rehearsal.evidenceKind, outcome: items.rehearsal.outcome, reviewedCommit: items.rehearsal.reviewedCommit,
      sourceFileSha256: items.rehearsal.sourceFileSha256, sourceHash: items.rehearsal.sourceHash,
      projectionHash: items.rehearsal.projectionHash, migrationLedger: items.rehearsal.migrationLedger,
      plannedCounts: items.rehearsal.plannedCounts, readbackCounts: items.rehearsal.readbackCounts,
      readbackHash: items.rehearsal.readbackHash, sequenceNext: items.rehearsal.sequenceNext,
      rehearsalProofHash: items.rehearsal.rehearsalProofHash,
    },
    "rollback-manifest.json": { contract: items.rollback.contract, createdAt: items.rollback.createdAt,
      filename: items.rollback.filename, bytes: items.rollback.bytes, sha256: items.rollback.sha256,
      targetFingerprint: items.rollback.targetFingerprint, containerName: items.rollback.containerName,
      composeProject: items.rollback.composeProject, volumeName: items.rollback.volumeName,
      databaseName: items.rollback.databaseName, archiveListVerified: items.rollback.archiveListVerified },
    "object-storage.json": { contract: items.objectStorage.contract, providerConfigured: items.objectStorage.providerConfigured,
      privateBucket: items.objectStorage.privateBucket, preflightPass: items.objectStorage.preflightPass,
      putHeadGetDeletePass: items.objectStorage.putHeadGetDeletePass, runtimeConfigReviewed: items.objectStorage.runtimeConfigReviewed,
      endpointIdentity: items.objectStorage.endpointIdentity, region: items.objectStorage.region,
      bucket: items.objectStorage.bucket, verifiedAt: items.objectStorage.verifiedAt },
    ...(items.attempt ? { "attempt.json": parseQuoteImportAttemptEvidence(items.attempt) } : {}),
  };
  const files: Record<string, string> = {};
  for (const name of FILES) {
    if (!Object.hasOwn(summaries, name)) continue;
    const bytes = Buffer.from(`${JSON.stringify(summaries[name])}\n`, "utf8");
    await writeFile(join(directory, name), bytes, { flag: "wx" });
    files[name] = sha(bytes);
  }
  const index: Index = { contract: "quote-import-evidence-bundle.v1", files };
  await writeFile(join(directory, "index.json"), `${JSON.stringify(index)}\n`, { flag: "wx" });
  return index;
}

export async function verifyQ5EvidenceBundle(directory: string): Promise<Index> {
  const raw = await readFile(join(directory, "index.json"), "utf8");
  const index = JSON.parse(raw) as Index;
  const required = FILES.slice(0, 5);
  if (index.contract !== "quote-import-evidence-bundle.v1" || !index.files
      || Object.keys(index.files).some((name) => !FILES.includes(name as typeof FILES[number]))
      || required.some((name) => !Object.hasOwn(index.files, name))
      || Object.keys(index.files).length > 6) throw new Error("invalid_evidence_index");
  for (const [name, expected] of Object.entries(index.files)) {
    if (!/^[0-9a-f]{64}$/u.test(expected) || sha(await readFile(join(directory, name))) !== expected)
      throw new Error("evidence_readback_hash_mismatch");
  }
  return index;
}

/** A second copy is explicit and checked by destination readback, never a raw-source/dump copy. */
export async function copyQ5EvidenceBundle(source: string, destination: string): Promise<Index> {
  const index = await verifyQ5EvidenceBundle(source);
  const target = await safeNewDirectory(destination);
  for (const name of [...Object.keys(index.files), "index.json"]) await copyFile(join(source, name), join(target, name));
  const copied = await verifyQ5EvidenceBundle(target);
  if (JSON.stringify(copied) !== JSON.stringify(index)) throw new Error("evidence_destination_mismatch");
  return copied;
}

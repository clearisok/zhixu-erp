import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverMigrations } from "../server/db/migration-runner.js";
import { assertReviewedQuoteSource } from "../server/quotes/guarded-source.js";
import { evaluateGuardedQuoteReadiness } from "../server/quotes/guarded-readiness.js";
import { previewHistoricalQuoteBackup } from "../server/quotes/historical-preview.js";

type Input = Record<string, unknown>;
const SHA = /^[0-9a-f]{64}$/u;
const repoRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
async function hashFile(path: string): Promise<string> {
  const hasher = createHash("sha256");
  for await (const chunk of createReadStream(path)) hasher.update(chunk);
  return hasher.digest("hex");
}
function object(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_q5_intent");
  return value as Input;
}
function safePath(value: unknown): string {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error("invalid_q5_artifact_path");
  return value;
}
async function json(path: string): Promise<unknown> { return JSON.parse(await readFile(safePath(path), "utf8")) as unknown; }

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--intent") throw new Error("invalid_q5_arguments");
  const intent = object(await json(args[1]));
  const allowed = ["contract", "sourceBackupFile", "sourceIdentityFile", "freezeEvidenceFile", "rehearsalProofFile",
    "rollbackDumpFile", "rollbackManifestFile", "objectStorageProofFile", "expectedRehearsalArtifactSha256",
    "expectedRollbackManifestSha256", "expectedTarget", "reviewedCommit"];
  if (intent.contract !== "quote-import-verify-intent.v1" || Object.keys(intent).some((key) => !allowed.includes(key))
      || allowed.some((key) => !Object.hasOwn(intent, key))) throw new Error("invalid_q5_intent");
  const reviewedCommit = intent.reviewedCommit;
  if (typeof reviewedCommit !== "string") throw new Error("invalid_q5_reviewed_commit");
  await assertReviewedQuoteSource(repoRoot, reviewedCommit);
  const sourcePath = safePath(intent.sourceBackupFile);
  const sourceBytes = await readFile(sourcePath);
  const preview = previewHistoricalQuoteBackup(JSON.parse(sourceBytes.toString("utf8")) as unknown);
  const sourceIdentity = object(await json(safePath(intent.sourceIdentityFile)));
  const sourceTime = (await stat(sourcePath)).mtime.toISOString();
  if (sourceIdentity.fileModifiedAt !== sourceTime) throw new Error("q5_source_file_mtime_changed");
  const actualSourceFileSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const [freezeEvidence, rehearsalProof, rollbackManifest, objectStorageProof] = await Promise.all([
    json(safePath(intent.freezeEvidenceFile)), json(safePath(intent.rehearsalProofFile)),
    json(safePath(intent.rollbackManifestFile)), json(safePath(intent.objectStorageProofFile)),
  ]);
  const [actualRollbackDumpSha256, actualRollbackManifestSha256, actualRehearsalArtifactSha256] = await Promise.all([
    hashFile(safePath(intent.rollbackDumpFile)), hashFile(safePath(intent.rollbackManifestFile)),
    hashFile(safePath(intent.rehearsalProofFile)),
  ]);
  const actualRollbackDumpBytes = (await stat(safePath(intent.rollbackDumpFile))).size;
  for (const key of ["expectedRehearsalArtifactSha256", "expectedRollbackManifestSha256"])
    if (typeof intent[key] !== "string" || !SHA.test(intent[key])) throw new Error("invalid_q5_expected_hash");
  const inputChunks: Buffer[] = [];
  for await (const chunk of process.stdin) inputChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const state = object(JSON.parse(Buffer.concat(inputChunks).toString("utf8")) as unknown);
  if (Object.keys(state).some((key) => !["targetIdentity", "migration", "quoteTarget"].includes(key)))
    throw new Error("invalid_q5_verified_state");
  const expectedMigrationLedger = (await discoverMigrations(resolve(repoRoot, "database/migrations")))
    .map(({ version, filename, checksum }) => ({ version, filename, checksum, state: "applied" as const }));
  const readiness = evaluateGuardedQuoteReadiness({ preview, actualSourceFileSha256, sourceIdentity, freezeEvidence,
    targetIdentity: state.targetIdentity, expectedTarget: intent.expectedTarget as never,
    migration: state.migration as never, quoteTarget: state.quoteTarget as never,
    rollbackManifest, actualRollbackDumpSha256, actualRollbackDumpBytes, actualRollbackManifestSha256,
    expectedRollbackManifestSha256: intent.expectedRollbackManifestSha256 as string,
    rehearsalProof, actualRehearsalArtifactSha256,
    expectedRehearsalArtifactSha256: intent.expectedRehearsalArtifactSha256 as string,
    expectedMigrationLedger, objectStorageProof, reviewedSourceVerified: true,
    // Q5-B has no real Quote-specific frozen build or DB competing-writer freeze implementation.
    quoteFrozenRuntimeVerified: false, databaseQuoteWritersFrozen: false });
  process.stdout.write(`${JSON.stringify(readiness)}\n`);
  if (readiness.reasons.length) process.exitCode = 2;
}

await main().catch(() => {
  process.stderr.write('{"error":"q5_guarded_verify_failed"}\n');
  process.exitCode = 2;
});

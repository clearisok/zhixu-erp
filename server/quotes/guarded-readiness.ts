import type { HistoricalQuotePreview } from "./historical-preview.js";
import type { HistoricalQuoteTarget } from "./historical-import.js";
import { assertEmptyQuoteTarget, assertQuoteMigrationLedger, parseQuoteFreezeEvidence, parseQuoteObjectStorageProof,
  parseQuoteRehearsalProof, parseQuoteRollbackBackup, parseQuoteSourceIdentity, parseQuoteTargetIdentity,
  quoteReadiness, type QuoteReadiness, type QuoteTargetIdentity } from "./guarded-import-evidence.js";

export type GuardedQuoteReadinessInput = {
  preview: HistoricalQuotePreview;
  actualSourceFileSha256: string;
  sourceIdentity: unknown;
  freezeEvidence: unknown;
  targetIdentity: unknown;
  expectedTarget: QuoteTargetIdentity;
  migration: { applied: string[]; pending: string[]; integrity: string };
  quoteTarget: HistoricalQuoteTarget;
  rollbackManifest: unknown;
  actualRollbackDumpSha256: string;
  actualRollbackDumpBytes: number;
  actualRollbackManifestSha256: string;
  expectedRollbackManifestSha256: string;
  rehearsalProof: unknown;
  actualRehearsalArtifactSha256: string;
  expectedRehearsalArtifactSha256: string;
  expectedMigrationLedger: Array<{ version: string; filename: string; checksum: string; state: "applied" }>;
  objectStorageProof: unknown;
  reviewedSourceVerified: boolean;
  quoteFrozenRuntimeVerified: boolean;
  databaseQuoteWritersFrozen: boolean;
};

/** The one prerequisite graph shared by VerifyOnly and disposable test Execute. Real Execute is not exposed in Q5-B. */
export function evaluateGuardedQuoteReadiness(input: GuardedQuoteReadinessInput): QuoteReadiness {
  const pass = (work: () => unknown): boolean => { try { work(); return true; } catch { return false; } };
  let source: ReturnType<typeof parseQuoteSourceIdentity> | null = null;
  const freshSource = pass(() => { source = parseQuoteSourceIdentity(input.sourceIdentity, input.preview, input.actualSourceFileSha256); });
  let freeze: ReturnType<typeof parseQuoteFreezeEvidence> | null = null;
  const browserFreeze = freshSource && pass(() => { freeze = parseQuoteFreezeEvidence(input.freezeEvidence, source!); })
    && input.quoteFrozenRuntimeVerified;
  let target: ReturnType<typeof parseQuoteTargetIdentity> | null = null;
  const databaseTarget = pass(() => { target = parseQuoteTargetIdentity(input.targetIdentity, input.expectedTarget); });
  const migration0008 = pass(() => assertQuoteMigrationLedger(input.migration.applied, input.migration.pending, input.migration.integrity));
  const quoteTargetEmpty = pass(() => assertEmptyQuoteTarget(input.quoteTarget));
  const rollbackBackup = browserFreeze && databaseTarget && pass(() => parseQuoteRollbackBackup(input.rollbackManifest,
    target!, freeze!, input.actualRollbackDumpSha256, input.actualRollbackDumpBytes,
    input.actualRollbackManifestSha256, input.expectedRollbackManifestSha256));
  const rehearsalEvidence = freshSource && pass(() => parseQuoteRehearsalProof(input.rehearsalProof, source!, input.preview,
    input.expectedMigrationLedger, input.actualRehearsalArtifactSha256, input.expectedRehearsalArtifactSha256));
  const objectStorage = pass(() => parseQuoteObjectStorageProof(input.objectStorageProof));
  return quoteReadiness({ reviewedSource: input.reviewedSourceVerified, browserFreeze, freshSource,
    databaseTarget, migration0008, quoteTargetEmpty, rollbackBackup, rehearsalEvidence,
    objectStorage, writerFreeze: input.databaseQuoteWritersFrozen });
}

export function assertDisposableQ5ExecutionReady(input: GuardedQuoteReadinessInput): QuoteReadiness {
  const readiness = evaluateGuardedQuoteReadiness(input);
  if (readiness.reasons.length) throw new Error(`q5_disposable_precheck_blocked:${readiness.reasons.join(",")}`);
  return readiness;
}

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { SourceError } from "./contract.js";
import { assertExactSourceJsonRuntime } from "./exact-source-json.js";
import { collectGarmentFilter, garmentFilterConfig, GARMENT_FILTER_FAILURE_CODES, selectionFromGarmentCandidate,
  validateGarmentFilterEvidence, type GarmentFilterSelection } from "./garment-contract-verification.js";
import { collectGarmentCandidate, garmentCandidateFailureDetails, GARMENT_PROBE_FAILURE_CODES,
  rejectedGarmentCandidate, validateGarmentCandidate } from "./garment-shipment-probe.js";
import { assertPrivateOutput, writePrivateReport } from "./live-preflight.js";
import { readPaymentPrivateFile } from "./payment-private-files.js";

export const GARMENT_RECOVERY_LIMITS = Object.freeze({ httpAttempts: 6, logins: 2, reportRequests: 4,
  pageSize: 100, responseBytes: 4 * 1024 * 1024, totalReportBytes: 16 * 1024 * 1024, timeoutMs: 180000 });
const schemaVersion = "ainuoke-garment-filter-recovery.v1";
type Counts = { status: "not-started" | "exact" | "unknown-worker-result"; httpAttempts: number | null; reportRequests: number | null };
type Stage = "configuration" | "candidate-collection" | "candidate-validation" | "candidate-selection" | "candidate-write"
  | "candidate-readback" | "filter-collection" | "filter-validation" | "filter-write" | "complete";
type PrivateReceipt = { privateReportPath: string; privateReportSha256: string };
type RetainedFile = PrivateReceipt & { role: "candidate" | "filter" };
type Dependencies = {
  monotonicNow: () => number; wallNow: () => number;
  collectCandidate: (config: CollectorConfig, timeoutMs: number) => Promise<unknown>;
  collectFilter: (config: CollectorConfig, selection: GarmentFilterSelection, timeoutMs: number) => Promise<unknown>;
  write: (directory: string, report: unknown) => PrivateReceipt;
  read: (receipt: PrivateReceipt) => string;
};
const defaults: Dependencies = {
  monotonicNow: () => performance.now(), wallNow: () => Date.now(),
  collectCandidate: (config, timeoutMs) => collectGarmentCandidate(config, { timeoutMs }),
  collectFilter: (config, selection, timeoutMs) => collectGarmentFilter(config, selection, { timeoutMs }),
  write: (directory, report) => writePrivateReport(directory, report, "garment-shipment"),
  read: receipt => {
    try { return readPaymentPrivateFile(receipt.privateReportPath, 16 * 1024 * 1024,
      { expectedSha256: receipt.privateReportSha256, ignoredReport: true }); }
    catch { throw new SourceError("garment_recovery_private_file_invalid"); }
  },
};
const codes = new Set([...GARMENT_FILTER_FAILURE_CODES, ...GARMENT_PROBE_FAILURE_CODES,
  "garment_recovery_failed", "garment_recovery_scope_required", "garment_recovery_deadline", "garment_recovery_clean_commit_required",
  "garment_recovery_credential_invalid", "garment_recovery_private_file_invalid", "garment_recovery_private_hash_mismatch"]);
function fail(code: string): never { throw new SourceError(code); }
const safeCode = (error: unknown) => error instanceof SourceError && codes.has(error.code) ? error.code : "garment_recovery_failed";
const digest = (bytes: string) => createHash("sha256").update(bytes, "utf8").digest("hex");
const initialCounts = (): Counts => ({ status: "not-started", httpAttempts: 0, reportRequests: 0 });
const exactCounts = (httpAttempts: number, reportRequests: number): Counts => ({ status: "exact", httpAttempts, reportRequests });
const unknownCounts = (): Counts => ({ status: "unknown-worker-result", httpAttempts: null, reportRequests: null });

/** Fixed fresh-producer path. No caller-supplied contract, candidate or frozen hash.
 * The injected seams are for synthetic tests, never accepted by the CLI. */
export async function runGarmentFilterRecovery(input: unknown, privateOutput: string, toolingCommit: string,
  options: { startedAt?: number; dependencies?: Partial<Dependencies>; onProgress?: (receipt: Record<string, unknown>) => void } = {}) {
  const dependencies = { ...defaults, ...options.dependencies }, started = options.startedAt ?? dependencies.monotonicNow();
  let stage: Stage = "configuration", candidateCounts = initialCounts(), filterCounts = initialCounts();
  let config: CollectorConfig | undefined, candidateEvidence: unknown;
  const retainedFiles: RetainedFile[] = [];
  const remaining = () => {
    const elapsed = dependencies.monotonicNow() - started;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= GARMENT_RECOVERY_LIMITS.timeoutMs) fail("garment_recovery_deadline");
    return Math.max(1, Math.floor(GARMENT_RECOVERY_LIMITS.timeoutMs - elapsed));
  };
  const receipt = (result: "FAIL" | "SCOPED_FILTER_OBSERVED" | "PROGRESS", code: string | null, observation?: ReturnType<typeof validateGarmentFilterEvidence>["summary"]) => {
    const phases = { candidate: candidateCounts, filter: filterCounts }, unknown = Object.values(phases).some(value => value.status === "unknown-worker-result");
    const knownHttpAttempts = (candidateCounts.httpAttempts ?? 0) + (filterCounts.httpAttempts ?? 0);
    const knownReportRequests = (candidateCounts.reportRequests ?? 0) + (filterCounts.reportRequests ?? 0);
    return { schemaVersion, result, code, stage, toolingCommit, databaseAccess: "none", sourceActivation: "not-activated",
      businessSnapshotPublication: "not-performed", requestCounts: unknown ? "unknown-worker-result"
        : knownHttpAttempts ? "exact" : "not-started", httpAttempts: unknown ? null : knownHttpAttempts,
      reportRequests: unknown ? null : knownReportRequests, knownHttpAttempts, knownReportRequests, phases, retainedFiles: [...retainedFiles],
      ...(observation ? { observation } : {}) };
  };
  try {
    remaining();
    if (!/^[a-f0-9]{40}$/u.test(toolingCommit) || !isAbsolute(privateOutput)) fail("garment_recovery_scope_required");
    config = Object.freeze(parseCollectorConfig(input));
    if (config.baseUrl !== APPROVED_HTTP_ORIGIN || config.transportPolicy !== APPROVED_HTTP_POLICY) fail("garment_recovery_scope_required");
    stage = "candidate-collection";
    const candidateTimeout = Math.min(120000, remaining()); candidateCounts = unknownCounts();
    try { candidateEvidence = await dependencies.collectCandidate(config, candidateTimeout); }
    catch (error) {
      const detail = garmentCandidateFailureDetails(error);
      if (detail) candidateCounts = exactCounts(detail.httpAttempts, detail.reportRequests);
      throw error;
    }
    stage = "candidate-validation"; remaining();
    const candidate = validateGarmentCandidate(candidateEvidence, config, dependencies.wallNow());
    candidateCounts = exactCounts(candidate.summary.httpAttempts, candidate.summary.reportRequests);
    const report = { ...candidate.privateReport, toolingCommit };
    const expectedHash = digest(JSON.stringify(report, null, 2) + "\n");
    stage = "candidate-selection"; remaining();
    options.onProgress?.(structuredClone(receipt("PROGRESS", null)));
    // Prevalidate scope before writing. This hash is of the exact writer bytes,
    // not the historical frozen identity; readback below proves the new file.
    selectionFromGarmentCandidate(report, expectedHash);
    stage = "candidate-write"; remaining();
    const candidateFile = dependencies.write(privateOutput, report);
    if (candidateFile.privateReportSha256 !== expectedHash) fail("garment_recovery_private_hash_mismatch");
    retainedFiles.push({ role: "candidate", ...candidateFile });
    stage = "candidate-readback"; remaining();
    const savedText = dependencies.read(candidateFile);
    if (digest(savedText) !== candidateFile.privateReportSha256) fail("garment_recovery_private_hash_mismatch");
    const selection = selectionFromGarmentCandidate(JSON.parse(savedText), candidateFile.privateReportSha256);
    garmentFilterConfig(config, selection);
    stage = "filter-collection";
    remaining(); filterCounts = unknownCounts();
    options.onProgress?.(structuredClone(receipt("PROGRESS", null)));
    const evidence = await dependencies.collectFilter(config, selection, remaining());
    stage = "filter-validation"; remaining();
    const filter = validateGarmentFilterEvidence(evidence, config, selection, dependencies.wallNow());
    filterCounts = exactCounts(filter.summary.httpAttempts, filter.summary.reportRequests);
    if (Buffer.byteLength(candidate.privateReport.rawReportResponse, "utf8")
      + filter.summary.retainedBytes > GARMENT_RECOVERY_LIMITS.totalReportBytes) fail("garment_filter_response_limit");
    stage = "filter-write"; remaining();
    options.onProgress?.(structuredClone(receipt("PROGRESS", null)));
    const filterFile = dependencies.write(privateOutput, { ...filter.privateReport, toolingCommit });
    retainedFiles.push({ role: "filter", ...filterFile });
    remaining();
    if (filter.summary.result === "FAIL") return receipt("FAIL", filter.summary.code, filter.summary);
    stage = "complete";
    return receipt("SCOPED_FILTER_OBSERVED", null, filter.summary);
  } catch (error) {
    if (stage === "candidate-validation" && config) {
      try {
        // A failed business validation can still prove the two transport counts.
        rejectedGarmentCandidate(candidateEvidence, config, "shipment_probe_invalid_evidence");
        candidateCounts = exactCounts(2, 1);
      } catch { /* Invalid/unsafe worker evidence leaves this phase unknown. */ }
    }
    return receipt("FAIL", safeCode(error));
  }
}

export function parseGarmentRecoveryArguments(args: string[]) {
  const credentialFile = args.find(arg => arg.startsWith("--credential-file="))?.slice("--credential-file=".length);
  const privateOutput = args.find(arg => arg.startsWith("--private-output="))?.slice("--private-output=".length);
  if (args.length !== 3 || new Set(args).size !== 3 || !args.includes("--recover-d1933-contract-filter")
    || !credentialFile || !isAbsolute(credentialFile) || !privateOutput || !isAbsolute(privateOutput)) fail("garment_recovery_scope_required");
  return { credentialFile, privateOutput };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Fresh D1933 first page, then its unique C1 / empty C0 / C1: <=2 logins +4 reports,100 rows/page,4MiB/report,16MiB reports,4MiB/login,shared180s; no retry/pages/DB/activation. NEW specific real-read authorization required.\n"); return;
  }
  const startedAt = performance.now(); let stage = "arguments", recoveryStarted = false;
  try {
    const paths = parseGarmentRecoveryArguments(args);
    stage = "runtime"; assertExactSourceJsonRuntime("garment_filter_exact_runtime_required");
    stage = "worktree";
    const gitOptions = { encoding: "utf8", windowsHide: true, timeout: 5000 } as const;
    const toolingCommit = execFileSync("git", ["rev-parse", "HEAD"], gitOptions).trim();
    if (!/^[a-f0-9]{40}$/u.test(toolingCommit) || execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], gitOptions).trim()) fail("garment_recovery_clean_commit_required");
    stage = "private_output"; assertPrivateOutput(paths.privateOutput);
    stage = "credential";
    let text: string;
    try { text = readPaymentPrivateFile(paths.credentialFile, 8192).replace(/^\uFEFF/u, ""); }
    catch { return fail("garment_recovery_credential_invalid"); }
    const match = /^账号[:：]([^\r\n]+)\r?\n密码[:：]([^\r\n]+)(?:\r?\n)?$/u.exec(text);
    if (!match || match[0] !== text) fail("garment_recovery_credential_invalid");
    recoveryStarted = true;
    const result = await runGarmentFilterRecovery({ sourceKey: "garment-filter-recovery", baseUrl: APPROVED_HTTP_ORIGIN,
      transportPolicy: APPROVED_HTTP_POLICY, username: match[1].trim(), password: match[2], operatorUsername: "readonly-no-db-authorization" },
    paths.privateOutput, toolingCommit, { startedAt, onProgress: progress => process.stdout.write(JSON.stringify(progress) + "\n") });
    process.stdout.write(JSON.stringify(result) + "\n");
    if (result.result === "FAIL") process.exitCode = 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ schemaVersion, result: "FAIL", code: safeCode(error), stage, databaseAccess: "none",
      sourceActivation: "not-activated", businessSnapshotPublication: "not-performed",
      requestCounts: recoveryStarted ? "unknown-worker-result" : "not-started",
      httpAttempts: recoveryStarted ? null : 0, reportRequests: recoveryStarted ? null : 0, knownHttpAttempts: 0, knownReportRequests: 0,
      phases: { candidate: recoveryStarted ? unknownCounts() : initialCounts(), filter: recoveryStarted ? unknownCounts() : initialCounts() },
      retainedFiles: [] }) + "\n"); process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();

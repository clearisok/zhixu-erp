import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, accountFingerprint, parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { SourceError, inspect } from "./contract.js";
import { assertPrivateOutput, writePrivateReport } from "./live-preflight.js";

export const PAYMENT_LIMITS = Object.freeze({ reportId: "6086941", page: 1, pageSize: 100, responseBytes: 4 * 1024 * 1024, workerBytes: 16 * 1024 * 1024, timeoutMs: 120000 });
import { CANDIDATE_FIELDS } from "./payment-request-fields.js";
export { CANDIDATE_FIELDS } from "./payment-request-fields.js";
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SourceError("payment_probe_invalid_evidence");
  return value as ObjectValue;
};
function decoded(value: unknown): ObjectValue {
  try { return object(typeof value === "string" ? JSON.parse(value) : value); }
  catch { throw new SourceError("payment_probe_invalid_evidence"); }
}

function reportMetadata(value: unknown): ObjectValue | null {
  if (value == null || typeof value === "string" && !value.trim()) return null;
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { throw new SourceError("payment_probe_report_metadata_invalid_json"); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SourceError("payment_probe_report_metadata_shape");
  const meta = { ...(parsed as ObjectValue) };
  let columns = meta.cellList;
  if (typeof columns === "string") {
    if (!columns.trim()) columns = null;
    else try { columns = JSON.parse(columns); } catch { throw new SourceError("payment_probe_column_metadata_invalid_json"); }
  }
  if (columns != null && !Array.isArray(columns)) throw new SourceError("payment_probe_column_metadata_shape");
  if (Object.hasOwn(meta, "cellList")) meta.cellList = columns;
  return meta;
}

function safeTree(value: unknown, secrets: string[], depth = 0): void {
  if (depth > 12) throw new SourceError("payment_probe_invalid_evidence");
  if (depth === 0) inspect(value);
  if (typeof value === "string" && secrets.some(secret => secret && value.includes(secret))) throw new SourceError("source_secret_field");
  if (Array.isArray(value)) value.forEach(v => safeTree(v, secrets, depth + 1));
  else if (value && typeof value === "object") Object.values(value).forEach(v => safeTree(v, secrets, depth + 1));
}
function approvedConfig(input: unknown) {
  const config = parseCollectorConfig(input);
  if (config.baseUrl !== APPROVED_HTTP_ORIGIN || config.transportPolicy !== APPROVED_HTTP_POLICY) throw new SourceError("payment_probe_scope_refused");
  return config;
}

export const PAYMENT_WORKER_FAILURE_CODES = Object.freeze(["invalid_payment_probe_input","payment_probe_origin_not_approved","payment_probe_explicit_action_required","invalid_payment_probe_credentials","payment_probe_endpoint_refused","payment_probe_scope_refused","payment_probe_request_limit","payment_probe_response_limit","payment_probe_invalid_json","payment_probe_invalid_metadata","payment_probe_structure_limit","payment_probe_secret_field","payment_probe_secret_reflection","payment_probe_invalid_number","payment_probe_page_limit","payment_probe_raw_evidence_missing","payment_probe_report_mismatch","redirect_refused","auth_expired","invalid_credential","network_unavailable","upstream_http_error","upstream_schema_error","payment_probe_failed","payment_probe_report_metadata_invalid_json","payment_probe_report_metadata_shape","payment_probe_column_metadata_invalid_json","payment_probe_column_metadata_shape"]);
class PaymentWorkerError extends SourceError {
  constructor(readonly detail: { code: string; workerStage: string; httpAttempts: number; reportRequests: number }) { super(detail.code); }
}
function workerFailure(input: unknown) {
  const value = object(input);
  if (Object.keys(value).sort().join(",") !== "code,httpAttempts,reportRequests,schemaVersion,workerStage"
    || value.schemaVersion !== "ainuoke-payment-page-failure.v1" || typeof value.code !== "string" || !PAYMENT_WORKER_FAILURE_CODES.includes(value.code)
    || !["not-started", "login", "report", "validation"].includes(String(value.workerStage))
    || !Number.isSafeInteger(value.httpAttempts) || (value.httpAttempts as number) < 0 || (value.httpAttempts as number) > 2
    || !Number.isSafeInteger(value.reportRequests) || (value.reportRequests as number) < 0 || (value.reportRequests as number) > 1
    || (value.reportRequests as number) > (value.httpAttempts as number)
    || value.workerStage === "not-started" && value.httpAttempts !== 0
    || value.workerStage === "login" && (value.httpAttempts !== 1 || value.reportRequests !== 0)
    || value.workerStage === "validation" && (value.httpAttempts !== 2 || value.reportRequests !== 1))
    throw new SourceError("payment_probe_failed");
  return new PaymentWorkerError({ code: value.code, workerStage: value.workerStage as string,
    httpAttempts: value.httpAttempts as number, reportRequests: value.reportRequests as number });
}

export async function collectPaymentPage(config: CollectorConfig, options: { pythonCommand?: string; timeoutMs?: number; spawnWorker?: typeof spawn } = {}): Promise<unknown> {
  config = approvedConfig(config);
  return new Promise((accept, reject) => {
    const child = (options.spawnWorker ?? spawn)(options.pythonCommand ?? "python", ["-m", "ainuoke_bridge.payment_request_probe", "--stdin-request"],
      { cwd: resolve("tools/ainuoke-bridge"), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let settled = false, size = 0; const chunks: Buffer[] = [];
    const fail = (reason: string | SourceError) => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); reject(typeof reason === "string" ? new SourceError(reason) : reason); };
    const timer = setTimeout(() => fail("payment_probe_timeout"), Math.min(options.timeoutMs ?? PAYMENT_LIMITS.timeoutMs, PAYMENT_LIMITS.timeoutMs));
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > PAYMENT_LIMITS.workerBytes) fail("payment_probe_limit"); else chunks.push(chunk); });
    child.stderr.resume();
    child.on("error", () => fail("payment_probe_worker_unavailable"));
    child.stdin.on("error", () => fail("payment_probe_worker_unavailable"));
    child.on("close", code => {
      if (settled) return;
      if (code !== 0) {
        try { fail(workerFailure(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks))))); }
        catch { fail("payment_probe_failed"); }
        return;
      }
      let output: string;
      try { output = new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { fail("payment_probe_worker_encoding"); return; }
      try {
        const result: unknown = JSON.parse(output);
        settled = true; clearTimeout(timer); accept(result);
      } catch { fail("payment_probe_worker_json_invalid"); }
    });
    child.stdin.end(JSON.stringify({ baseUrl: config.baseUrl, username: config.username, password: config.password, transportPolicy: config.transportPolicy, action: "read-first-page-only" }));
  });
}
export const PAYMENT_EVIDENCE_FAILURE_CODES = Object.freeze([
  "payment_probe_invalid_envelope", "payment_probe_invalid_timestamp", "payment_probe_stale_evidence",
  "payment_probe_hash_mismatch", "payment_probe_response_shape", "payment_probe_rows_shape",
  "payment_probe_row_count_mismatch", "payment_probe_count_invalid", "payment_probe_total_mismatch",
  "payment_probe_pagination_mismatch", "payment_probe_report_mismatch",
]);
type PrivateReceipt = { privateReportPath: string; privateReportSha256: string };
class PaymentEvidenceError extends SourceError {
  constructor(code: string, readonly receipt: PrivateReceipt) { super(code); }
}
function nonnegativeInteger(value: unknown): number {
  const parsed = typeof value === "string" && /^[0-9]+$/u.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0)
    throw new SourceError("payment_probe_count_invalid");
  return parsed;
}
function paymentEnvelope(input: unknown) {
  const evidence = object(input);
  const keys = "fetchedAt,httpAttempts,page,pageSize,rawReportResponse,rawResponseSha256,reportId,reportRequests,reportedTotal,returnedRows,schemaVersion";
  if (Object.keys(evidence).sort().join(",") !== keys || evidence.schemaVersion !== "ainuoke-payment-page-evidence.v1"
    || evidence.reportId !== PAYMENT_LIMITS.reportId || evidence.page !== 1 || evidence.pageSize !== 100
    || evidence.httpAttempts !== 2 || evidence.reportRequests !== 1 || typeof evidence.rawReportResponse !== "string"
    || Buffer.byteLength(evidence.rawReportResponse, "utf8") > PAYMENT_LIMITS.responseBytes
    || !Number.isSafeInteger(evidence.reportedTotal) || (evidence.reportedTotal as number) < 0
    || !Number.isSafeInteger(evidence.returnedRows) || (evidence.returnedRows as number) < 0 || (evidence.returnedRows as number) > 100)
    throw new SourceError("payment_probe_invalid_envelope");
  if (evidence.rawResponseSha256 !== createHash("sha256").update(evidence.rawReportResponse).digest("hex"))
    throw new SourceError("payment_probe_hash_mismatch");
  return evidence as ObjectValue & { rawReportResponse: string };
}
function privateSafeEvidence(input: unknown, config: CollectorConfig) {
  const evidence = paymentEnvelope(input);
  let raw: ObjectValue, data: ObjectValue;
  try { raw = decoded(evidence.rawReportResponse); data = decoded(raw.dataList); }
  catch { throw new SourceError("payment_probe_response_shape"); }
  const meta = reportMetadata(raw.reportObj);
  for (const value of [raw, data, meta]) safeTree(value, [config.password]);
  return { evidence, raw, data, meta };
}
export function rejectedPaymentEvidence(input: unknown, config: CollectorConfig, code: string) {
  config = approvedConfig(config);
  if (!PAYMENT_EVIDENCE_FAILURE_CODES.includes(code)) throw new SourceError("payment_probe_invalid_evidence");
  // Retain only a hash-consistent, bounded, secret-screened worker response.
  // This is rejected diagnostic evidence, never an accepted projection or mapping.
  const { evidence } = privateSafeEvidence(input, config);
  return { schemaVersion: "ainuoke-payment-request-rejected-private.v1", validationStatus: "rejected",
    failureCode: code, sourceFingerprint: accountFingerprint(config), databaseAccess: "none",
    sourceActivation: "not-activated", mappingVerified: false, reportId: PAYMENT_LIMITS.reportId,
    requestedPage: 1, requestedPageSize: 100, httpAttempts: 2, reportRequests: 1,
    rawResponseSha256: evidence.rawResponseSha256, rawReportResponse: evidence.rawReportResponse,
    workerFetchedAt: typeof evidence.fetchedAt === "string" ? evidence.fetchedAt : null,
    rawNumericTextIsAuthoritative: true };
}
export function validatePaymentEvidence(input: unknown, config: CollectorConfig, now = Date.now()) {
  config = approvedConfig(config);
  const { evidence, raw, data, meta } = privateSafeEvidence(input, config);
  if (typeof evidence.fetchedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(evidence.fetchedAt))
    throw new SourceError("payment_probe_invalid_timestamp");
  const fetched = Date.parse(evidence.fetchedAt);
  if (!Number.isFinite(fetched)) throw new SourceError("payment_probe_invalid_timestamp");
  if (fetched > now || now - fetched > PAYMENT_LIMITS.timeoutMs) throw new SourceError("payment_probe_stale_evidence");
  if (!raw.reObj || typeof raw.reObj !== "object" || Array.isArray(raw.reObj) || (raw.reObj as ObjectValue).isOk !== true)
    throw new SourceError("payment_probe_response_shape");
  if (!Array.isArray(data.rows) || data.rows.some(row => !row || typeof row !== "object" || Array.isArray(row)))
    throw new SourceError("payment_probe_rows_shape");
  if (data.rows.length !== evidence.returnedRows) throw new SourceError("payment_probe_row_count_mismatch");
  const total = nonnegativeInteger(Object.hasOwn(raw, "dataCount") ? raw.dataCount : data.total);
  if (total !== evidence.reportedTotal || data.rows.length > total) throw new SourceError("payment_probe_total_mismatch");
  const page = nonnegativeInteger(raw.pageIndex), pageSize = nonnegativeInteger(raw.pageSize);
  if (![0, 1].includes(page) || ![0, 100].includes(pageSize)) throw new SourceError("payment_probe_pagination_mismatch");
  for (const container of [raw, meta]) if (container && Object.hasOwn(container, "reportId") && String(container.reportId) !== PAYMENT_LIMITS.reportId)
    throw new SourceError("payment_probe_report_mismatch");
  const rows = data.rows.map(object);
  const fieldCoverage = Object.fromEntries(CANDIDATE_FIELDS.map(field => [field, { present: rows.filter(row => Object.hasOwn(row, field)).length,
    nonblank: rows.filter(row => Object.hasOwn(row, field) && row[field] != null && (typeof row[field] !== "string" || (row[field] as string).trim() !== "")).length }]));
  const candidate = new Set<string>(CANDIDATE_FIELDS);
  const unknownFields = new Set(rows.flatMap(row => Object.keys(row).filter(key => !candidate.has(key))));
  const originalMeta = typeof raw.reportObj === "string" && raw.reportObj.trim() ? decoded(raw.reportObj) : raw.reportObj;
  const originalColumns = originalMeta && typeof originalMeta === "object" ? (originalMeta as ObjectValue).cellList : undefined;
  const columnMetadataJsonEncoded = typeof originalColumns === "string" && Boolean(originalColumns.trim());
  const publicFacts = { schemaVersion: "ainuoke-payment-request-probe.v1", result: "READ_ONLY_FIRST_PAGE_RECORDED",
    transport: "user-approved-plaintext-http", sourceFingerprint: accountFingerprint(config), databaseAccess: "none", sourceActivation: "not-activated",
    humanBusinessAcceptance: "not-performed", scope: "fixed-report-first-page-only", reportId: PAYMENT_LIMITS.reportId, page: 1, pageSize: 100,
    reportedTotal: evidence.reportedTotal as number, returnedRows: rows.length, firstPageMatchesReportedSize: rows.length === Math.min(evidence.reportedTotal as number, 100),
    allVisibleRecordsRead: (evidence.reportedTotal as number) <= 100 && rows.length === evidence.reportedTotal,
    discoveryRequests: 0, reportRequests: 1, httpAttempts: 2, fetchedAt: evidence.fetchedAt as string, rawResponseSha256: evidence.rawResponseSha256 as string,
    reportIdentityReturned: Boolean((meta && Object.hasOwn(meta, "reportId")) || Object.hasOwn(raw, "reportId")),
    columnMetadataReturned: Boolean(meta && Array.isArray(meta.cellList)),
    reportMetadataJsonEncoded: typeof raw.reportObj === "string" && Boolean(raw.reportObj.trim()),
    columnMetadataJsonEncoded,
    candidateFieldCoverage: fieldCoverage, unrecognizedRowFieldCount: unknownFields.size,
    mappingVerified: false, unitSemantics: "not-verified", currencySemantics: "not-verified", formulaValidation: "not-performed", bankPaymentStatus: "not-inferred" };
  const privateReport = { schemaVersion: "ainuoke-payment-request-private.v1", sourceFingerprint: accountFingerprint(config), databaseAccess: "none", sourceActivation: "not-activated",
    reportId: PAYMENT_LIMITS.reportId, capturedAt: evidence.fetchedAt, page: 1, pageSize: 100, rawResponseSha256: evidence.rawResponseSha256,
    rawReportResponse: evidence.rawReportResponse, rowTrace: rows.map((_, index) => ({ index, jsonPath: "dataList.rows[" + index + "]" })),
    meaningVerification: "not-performed", rawNumericTextIsAuthoritative: true };
  return { summary: publicFacts, privateReport };
}
export async function runPaymentProbe(input: unknown, dependencies: {
  collect?: typeof collectPaymentPage; now?: () => number;
  retainRejected?: (report: ReturnType<typeof rejectedPaymentEvidence>) => PrivateReceipt;
} = {}) {
  const config = approvedConfig(input), evidence = await (dependencies.collect ?? collectPaymentPage)(config);
  try { return validatePaymentEvidence(evidence, config, (dependencies.now ?? Date.now)()); }
  catch (error) {
    if (dependencies.retainRejected && error instanceof SourceError && PAYMENT_EVIDENCE_FAILURE_CODES.includes(error.code)) {
      let report: ReturnType<typeof rejectedPaymentEvidence> | undefined;
      try { report = rejectedPaymentEvidence(evidence, config, error.code); } catch { /* Unsafe or unparseable evidence is never retained. */ }
      if (report) throw new PaymentEvidenceError(error.code, dependencies.retainRejected(report));
    }
    throw error;
  }
}
export function parsePaymentArguments(args: string[]) {
  const output = args.find(arg => arg.startsWith("--private-output="))?.slice("--private-output=".length);
  if (args.length !== 3 || new Set(args).size !== 3 || !args.includes("--run-read-only") || !args.includes("--stdin-config") || !output || !isAbsolute(output))
    throw new SourceError("payment_probe_explicit_action_required");
  return { privateOutput: output };
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Fixed 6086941 first page only; no database, binding or activation. Use private PowerShell -ReadFirstPage -CredentialFile.\n"); return;
  }
  let stage = "arguments";
  try {
    const { privateOutput } = parsePaymentArguments(args);
    stage = "private_output"; assertPrivateOutput(privateOutput); stage = "worktree";
    const toolingCommit = execFileSync("git", ["rev-parse", "--verify", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8", windowsHide: true }).trim();
    if (!/^[a-f0-9]{40}$/u.test(toolingCommit) || dirty) throw new SourceError("payment_probe_clean_commit_required");
    stage = "configuration"; let length = 0; const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) { length += chunk.length; if (length > 16384) throw new SourceError("invalid_collector_configuration"); chunks.push(Buffer.from(chunk)); }
    const config = parseCollectorConfig(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks))));
    stage = "collection"; const result = await runPaymentProbe(config, { retainRejected: report => writePrivateReport(privateOutput, { ...report, toolingCommit }, "payment-request") });
    stage = "report_write"; const receipt = writePrivateReport(privateOutput, { ...result.privateReport, toolingCommit }, "payment-request");
    process.stdout.write(JSON.stringify({ ...result.summary, toolingCommit, ...receipt }) + "\n");
  } catch (error) {
    const allowed = new Set(["payment_probe_explicit_action_required", "preflight_private_output_required", "payment_probe_clean_commit_required",
      "invalid_collector_configuration", "payment_probe_scope_refused", "payment_probe_timeout", "payment_probe_limit", "payment_probe_worker_unavailable",
      "payment_probe_invalid_evidence", "payment_probe_worker_encoding", "payment_probe_worker_json_invalid", "payment_probe_report_mismatch", "source_secret_field","payment_probe_report_metadata_invalid_json","payment_probe_report_metadata_shape","payment_probe_column_metadata_invalid_json","payment_probe_column_metadata_shape"]);
    for (const code of PAYMENT_EVIDENCE_FAILURE_CODES) allowed.add(code);
    const code = error instanceof PaymentWorkerError || error instanceof SourceError && allowed.has(error.code) ? error.code : "payment_probe_failed";
    if (error instanceof PaymentEvidenceError) stage = "evidence_validation";
    const diagnostics = error instanceof PaymentWorkerError ? { workerStage: error.detail.workerStage, httpAttempts: error.detail.httpAttempts, reportRequests: error.detail.reportRequests } : error instanceof PaymentEvidenceError
      ? { workerStage: "validation", httpAttempts: 2, reportRequests: 1, evidenceRetained: true, ...error.receipt } : {};
    process.stdout.write(JSON.stringify({ schemaVersion: "ainuoke-payment-request-probe.v1", result: "FAIL", code, stage, ...diagnostics, databaseAccess: "none", sourceActivation: "not-activated" }) + "\n"); process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) void main();

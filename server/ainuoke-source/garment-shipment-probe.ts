import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, accountFingerprint, parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { inspect, SourceError } from "./contract.js";
import { assertPrivateOutput, writePrivateReport } from "./live-preflight.js";
import { PAYMENT_WORKER_FAILURE_CODES } from "./payment-request-probe.js";

export const GARMENT_PROBE_LIMITS = Object.freeze({ reportId: "6086979", insideOrderNo: "D1935", page: 1, pageSize: 100,
  responseBytes: 4 * 1024 * 1024, workerBytes: 16 * 1024 * 1024, timeoutMs: 120000 });
export const GARMENT_PROBE_ACTION = "read-6086979-d1935-first-page-only";
const workerSchema = "ainuoke-garment-shipment-candidate-page.v1";
const failureSchema = "ainuoke-garment-shipment-candidate-failure.v1";
const publicSchema = "ainuoke-garment-shipment-probe.v1";
const workerCodes = new Set([...PAYMENT_WORKER_FAILURE_CODES.map(code => code.replaceAll("payment_probe", "shipment_probe")),
  "shipment_probe_explicit_action_required", "shipment_probe_duplicate_json_key", "shipment_probe_invalid_json", "shipment_probe_invalid_evidence"]);
const fail = (code = "shipment_probe_invalid_evidence"): never => { throw new SourceError(code); };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
const decoded = (value: unknown) => {
  try { return object(typeof value === "string" ? JSON.parse(value) : value); } catch { return fail(); }
};
const jsonValue = (value: string): unknown => { try { return JSON.parse(value) as unknown; } catch { return fail(); } };
const integer = (value: unknown) => {
  const parsed = typeof value === "string" && /^\d+$/u.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0) return fail();
  return parsed;
};
const configForProbe = (input: unknown) => {
  const config = parseCollectorConfig(input);
  if (config.baseUrl !== APPROVED_HTTP_ORIGIN || config.transportPolicy !== APPROVED_HTTP_POLICY) return fail("shipment_probe_scope_refused");
  return config;
};
class WorkerFailure extends SourceError {
  constructor(readonly detail: { code: string; workerStage: string; httpAttempts: number; reportRequests: number }) { super(detail.code); }
}
function failureEvidence(value: unknown): WorkerFailure {
  const item = object(value);
  if (Object.keys(item).sort().join(",") !== "code,httpAttempts,reportRequests,schemaVersion,workerStage"
    || item.schemaVersion !== failureSchema || typeof item.code !== "string" || !workerCodes.has(item.code)
    || !["not-started", "login", "report", "validation"].includes(String(item.workerStage))) return fail("shipment_probe_worker_failed");
  const attempts = integer(item.httpAttempts), reports = integer(item.reportRequests);
  if (attempts > 2 || reports > 1 || reports > attempts
    || item.workerStage === "not-started" && attempts !== 0
    || item.workerStage === "login" && (attempts !== 1 || reports !== 0)
    || item.workerStage === "validation" && (attempts !== 2 || reports !== 1)) return fail("shipment_probe_worker_failed");
  return new WorkerFailure({ code: item.code, workerStage: String(item.workerStage), httpAttempts: attempts, reportRequests: reports });
}

export async function collectGarmentCandidate(input: CollectorConfig,
  options: { spawnWorker?: typeof spawn; pythonCommand?: string; timeoutMs?: number } = {}): Promise<unknown> {
  const config = configForProbe(input);
  return new Promise((accept, reject) => {
    const child = (options.spawnWorker ?? spawn)(options.pythonCommand ?? "python", ["-m", "ainuoke_bridge.garment_shipment_probe", "--stdin-request"],
      { cwd: resolve("tools/ainuoke-bridge"), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let done = false, bytes = 0;
    const chunks: Buffer[] = [];
    const stop = (reason: SourceError) => { if (done) return; done = true; clearTimeout(timer); child.kill(); reject(reason); };
    const timer = setTimeout(() => stop(new SourceError("shipment_probe_timeout")), Math.min(options.timeoutMs ?? GARMENT_PROBE_LIMITS.timeoutMs, GARMENT_PROBE_LIMITS.timeoutMs));
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > GARMENT_PROBE_LIMITS.workerBytes) stop(new SourceError("shipment_probe_output_limit")); else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("error", () => stop(new SourceError("shipment_probe_worker_unavailable")));
    child.stdin.on("error", () => stop(new SourceError("shipment_probe_worker_unavailable")));
    child.on("close", code => {
      if (done) return;
      let evidence: unknown;
      try { evidence = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { stop(new SourceError("shipment_probe_worker_encoding")); return; }
      if (code !== 0) {
        try { stop(failureEvidence(evidence)); } catch { stop(new SourceError("shipment_probe_worker_failed")); }
        return;
      }
      done = true; clearTimeout(timer); accept(evidence);
    });
    child.stdin.end(JSON.stringify({ baseUrl: config.baseUrl, transportPolicy: config.transportPolicy,
      username: config.username, password: config.password, action: GARMENT_PROBE_ACTION }));
  });
}

function secretScreen(value: unknown, password: string, depth = 0): void {
  if (depth > 16) return fail();
  if (depth === 0) inspect(value);
  if (typeof value === "string" && password && value.includes(password)) return fail("source_secret_field");
  if (Array.isArray(value)) value.forEach(item => secretScreen(item, password, depth + 1));
  else if (value && typeof value === "object") Object.values(value).forEach(item => secretScreen(item, password, depth + 1));
}
export function rejectedGarmentCandidate(input: unknown, configuration: CollectorConfig, code: string) {
  const config = configForProbe(configuration), evidence = object(input);
  if (!/^shipment_probe_[a-z_]+$/u.test(code) || evidence.schemaVersion !== workerSchema || evidence.reportId !== "6086979"
    || evidence.page !== 1 || evidence.pageSize !== 100 || evidence.httpAttempts !== 2 || evidence.reportRequests !== 1
    || typeof evidence.rawReportResponse !== "string" || Buffer.byteLength(evidence.rawReportResponse, "utf8") > GARMENT_PROBE_LIMITS.responseBytes
    || evidence.rawResponseSha256 !== createHash("sha256").update(evidence.rawReportResponse).digest("hex")) return fail();
  const query = object(evidence.queryContext);
  if (Object.keys(query).join(",") !== "insideOrderNo" || query.insideOrderNo !== "D1935") return fail();
  const raw = decoded(evidence.rawReportResponse), data = decoded(raw.dataList);
  const metadata = raw.reportObj == null || typeof raw.reportObj === "string" && !raw.reportObj.trim() ? null : decoded(raw.reportObj);
  const columnValue = metadata?.cellList;
  const columns = columnValue == null || typeof columnValue === "string" && !columnValue.trim() ? null
    : typeof columnValue === "string" ? jsonValue(columnValue) : columnValue;
  for (const value of [raw, data, metadata, columns]) if (value != null) secretScreen(value, config.password);
  return { schemaVersion: "ainuoke-garment-shipment-rejected-private.v1", validationStatus: "rejected", failureCode: code,
    reportId: "6086979", queryContext: { insideOrderNo: "D1935" }, sourceFingerprint: accountFingerprint(config),
    databaseAccess: "none", sourceActivation: "not-activated", mappingVerified: false, businessMeaningVerified: false,
    rawResponseSha256: evidence.rawResponseSha256, rawReportResponse: evidence.rawReportResponse, rawNumericTextIsAuthoritative: true };
}
export function validateGarmentCandidate(input: unknown, configuration: CollectorConfig, now = Date.now()) {
  const config = configForProbe(configuration), evidence = object(input);
  const keys = "fetchedAt,httpAttempts,page,pageSize,queryContext,rawReportResponse,rawResponseSha256,reportId,reportRequests,reportedTotal,returnedRows,schemaVersion";
  if (Object.keys(evidence).sort().join(",") !== keys || evidence.schemaVersion !== workerSchema
    || evidence.reportId !== GARMENT_PROBE_LIMITS.reportId || evidence.page !== 1 || evidence.pageSize !== 100
    || evidence.httpAttempts !== 2 || evidence.reportRequests !== 1 || typeof evidence.rawReportResponse !== "string"
    || Buffer.byteLength(evidence.rawReportResponse, "utf8") > GARMENT_PROBE_LIMITS.responseBytes) return fail();
  const query = object(evidence.queryContext);
  if (Object.keys(query).join(",") !== "insideOrderNo" || query.insideOrderNo !== GARMENT_PROBE_LIMITS.insideOrderNo) return fail("shipment_probe_scope_refused");
  const rawText = evidence.rawReportResponse;
  if (evidence.rawResponseSha256 !== createHash("sha256").update(rawText).digest("hex")) return fail("shipment_probe_hash_mismatch");
  if (typeof evidence.fetchedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(evidence.fetchedAt)) return fail();
  const stamp = Date.parse(evidence.fetchedAt);
  if (!Number.isFinite(stamp) || stamp > now || now - stamp > GARMENT_PROBE_LIMITS.timeoutMs) return fail("shipment_probe_stale_evidence");
  const raw = decoded(rawText), data = decoded(raw.dataList);
  if (object(raw.reObj).isOk !== true || !Array.isArray(data.rows) || data.rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) return fail();
  const total = integer(Object.hasOwn(raw, "dataCount") ? raw.dataCount : data.total), reported = integer(evidence.reportedTotal), returned = integer(evidence.returnedRows);
  if (total !== reported || data.rows.length !== returned || returned > 100 || returned > total
    || ![0, 1].includes(integer(raw.pageIndex)) || ![0, 100].includes(integer(raw.pageSize))) return fail();
  const metadata = raw.reportObj == null || typeof raw.reportObj === "string" && !raw.reportObj.trim() ? null : decoded(raw.reportObj);
  for (const container of [raw, metadata]) if (container && Object.hasOwn(container, "reportId") && String(container.reportId) !== "6086979") return fail("shipment_probe_report_mismatch");
  const columnValue = metadata?.cellList;
  const columns = columnValue == null || typeof columnValue === "string" && !columnValue.trim() ? null
    : typeof columnValue === "string" ? jsonValue(columnValue) : columnValue;
  if (columns !== null && !Array.isArray(columns)) return fail();
  for (const value of [raw, data, metadata, columns]) if (value !== null) secretScreen(value, config.password);
  const allFields = new Set(data.rows.flatMap(row => Object.keys(object(row))));
  const rowFields = [...allFields].filter(key => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(key)).sort();
  if (rowFields.length > 1000) return fail();
  const common = { reportId: "6086979", queryContext: { insideOrderNo: "D1935" }, sourceFingerprint: accountFingerprint(config),
    databaseAccess: "none", sourceActivation: "not-activated", mappingVerified: false, businessMeaningVerified: false } as const;
  return {
    summary: { schemaVersion: publicSchema, result: "READ_ONLY_CANDIDATE_PAGE_RECORDED", ...common, page: 1, pageSize: 100,
      reportedTotal: total, returnedRows: returned, allVisibleRecordsRead: total <= 100 && returned === total,
      httpAttempts: 2, reportRequests: 1, fetchedAt: evidence.fetchedAt, rawResponseSha256: evidence.rawResponseSha256,
      reportIdentityReturned: [raw, metadata].some(value => value && Object.hasOwn(value, "reportId")),
      columnCount: Array.isArray(columns) ? columns.length : null, rowFields, otherFieldNameCount: allFields.size - rowFields.length,
      stableContractIdentity: "not-verified", shipmentQuantityMeaning: "not-verified", shipmentDateMeaning: "not-verified" },
    privateReport: { schemaVersion: "ainuoke-garment-shipment-candidate-private.v1", ...common, capturedAt: evidence.fetchedAt,
      page: 1, pageSize: 100, rawResponseSha256: evidence.rawResponseSha256, rawReportResponse: rawText, rawNumericTextIsAuthoritative: true },
  };
}

export function parseGarmentProbeArguments(args: string[]) {
  const output = args.find(arg => arg.startsWith("--private-output="))?.slice("--private-output=".length);
  if (args.length !== 3 || new Set(args).size !== 3 || !args.includes("--read-6086979-d1935-first-page") || !args.includes("--stdin-config") || !output || !isAbsolute(output)) return fail("shipment_probe_explicit_action_required");
  return { privateOutput: output };
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") { process.stdout.write("Fixed 6086979 / insideorderno contains D1935, first page only: <=100 rows / 4MiB / 120s, 1 login + 1 report, no retry/DB/activation.\n"); return; }
  let stage = "arguments";
  let collected: unknown, config: CollectorConfig | undefined, privateOutput: string | undefined, toolingCommit: string | undefined;
  try {
    ({ privateOutput } = parseGarmentProbeArguments(args));
    stage = "private_output"; assertPrivateOutput(privateOutput);
    stage = "worktree";
    toolingCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    if (!/^[a-f0-9]{40}$/u.test(toolingCommit) || execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8", windowsHide: true }).trim()) return fail("shipment_probe_clean_commit_required");
    stage = "configuration";
    let length = 0; const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) { length += chunk.length; if (length > 16384) return fail("invalid_collector_configuration"); chunks.push(Buffer.from(chunk)); }
    config = configForProbe(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks))));
    stage = "collection"; collected = await collectGarmentCandidate(config);
    stage = "validation"; const result = validateGarmentCandidate(collected, config);
    stage = "report_write";
    const receipt = writePrivateReport(privateOutput, { ...result.privateReport, toolingCommit }, "garment-shipment");
    process.stdout.write(JSON.stringify({ ...result.summary, toolingCommit, ...receipt }) + "\n");
  } catch (error) {
    const allowed = new Set([...workerCodes, "shipment_probe_timeout", "shipment_probe_output_limit", "shipment_probe_worker_unavailable", "shipment_probe_worker_encoding",
      "shipment_probe_worker_failed", "shipment_probe_scope_refused", "shipment_probe_hash_mismatch", "shipment_probe_stale_evidence", "shipment_probe_clean_commit_required",
      "preflight_private_output_required", "invalid_collector_configuration", "source_secret_field"]);
    const code = error instanceof SourceError && allowed.has(error.code) ? error.code : "shipment_probe_failed";
    const detail = error instanceof WorkerFailure ? error.detail : {};
    let retained: Record<string, unknown> = {};
    if (stage === "validation" && config && privateOutput && toolingCommit) {
      try {
        const report = rejectedGarmentCandidate(collected, config, code);
        retained = { evidenceRetained: true, httpAttempts: 2, reportRequests: 1,
          ...writePrivateReport(privateOutput, { ...report, toolingCommit }, "garment-shipment") };
      } catch { /* No unsafe or unparseable evidence is retained; never retry upstream. */ }
    }
    process.stdout.write(JSON.stringify({ schemaVersion: publicSchema, result: "FAIL", code, stage, ...detail, ...retained,
      databaseAccess: "none", sourceActivation: "not-activated" }) + "\n");
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) void main();

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { accountFingerprint, APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { SourceError, hash } from "./contract.js";
import { strictExactSourceJson, assertExactSourceJsonRuntime } from "./exact-source-json.js";
import { screen } from "./garment-filter-evidence.js";
import { buildGarmentObservationSnapshot, type GarmentObservationScope } from "./garment-shipment-observations.js";
import { PAYMENT_WORKER_FAILURE_CODES } from "./payment-request-probe.js";
import { checkedGarmentFirstPageEvidence, garmentFirstPageRequest } from "./garment-first-page.js";

/** The observed filter proof covers one complete page, not general pagination.
 * These are engineering ceilings, never a grant for a real upstream request. */
export const GARMENT_COLLECTION_LIMITS = Object.freeze({ reportId: "6086979", pageSize: 100, maxPages: 1, maxRows: 100,
  logins: 1, reportRequests: 2, httpAttempts: 3, responseBytes: 4 * 1024 * 1024, totalBytes: 8 * 1024 * 1024,
  workerBytes: 64 * 1024 * 1024, timeoutMs: 180000 });
export const GARMENT_COLLECTION_ACTION = "collect-verified-garment-contract-once";
export type GarmentRequestCounts = { httpAttempts: number; reportRequests: number };
const extraCodes = ["garment_collection_input_invalid", "garment_collection_scope_refused", "garment_collection_account_mismatch",
  "garment_collection_sequence_refused", "garment_collection_deadline", "garment_collection_response_limit",
  "garment_collection_raw_missing", "garment_collection_failed", "garment_collection_pagination_unverified", "shipment_observation_invalid_capture",
  "shipment_observation_scope_mismatch", "shipment_observation_report_mismatch", "shipment_observation_page_mismatch",
  "shipment_observation_count_mismatch", "shipment_observation_invalid_rows", "shipment_observation_exact_contract_rows_required",
  "shipment_observation_invalid_raw_response", "garment_filter_structure_limit", "payment_observation_duplicate_json_key",
  "payment_observation_invalid_json", "payment_observation_invalid_shape", "payment_observation_invalid_count",
  "shipment_observation_invalid_paging_evidence"] as const;
const workerCodes = new Set<string>([...PAYMENT_WORKER_FAILURE_CODES, ...extraCodes]);
export const GARMENT_COLLECTION_FAILURE_CODES = Object.freeze([...workerCodes]);
const fail = (code: string): never => { throw new SourceError(code); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : fail("garment_collection_invalid_worker");
const keys = (value: Record<string, unknown>, names: string) => {
  if (Object.keys(value).sort().join(",") !== names.split(",").sort().join(",")) fail("garment_collection_invalid_worker");
};
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const contract = (value: unknown): value is string => typeof value === "string" && /^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(value);
const decoded = (value: unknown) => object(typeof value === "string" ? strictExactSourceJson(value) : value);
function count(value: unknown) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value) || !Number.isSafeInteger(Number(value)))
    return fail("garment_collection_invalid_worker");
  return Number(value);
}
export function garmentCollectionConfig(input: unknown, scope: GarmentObservationScope): CollectorConfig {
  const config = parseCollectorConfig(input);
  if (!scope || Object.keys(scope).sort().join(",") !== "salesContractNo,sourceFingerprint" || !sha(scope.sourceFingerprint)
    || !contract(scope.salesContractNo) || config.baseUrl !== APPROVED_HTTP_ORIGIN || config.transportPolicy !== APPROVED_HTTP_POLICY
    || accountFingerprint(config) !== scope.sourceFingerprint) fail("garment_collection_scope_refused");
  return config;
}
function countsOf(value: unknown): GarmentRequestCounts {
  const row = object(value); keys(row, "httpAttempts,reportRequests");
  if (!Number.isSafeInteger(row.httpAttempts) || !Number.isSafeInteger(row.reportRequests)
    || Number(row.httpAttempts) < 0 || Number(row.httpAttempts) > 3 || Number(row.reportRequests) < 0 || Number(row.reportRequests) > 2
    || !(row.httpAttempts === 0 && row.reportRequests === 0 || row.httpAttempts === Number(row.reportRequests) + 1))
    fail("garment_collection_invalid_worker");
  return { httpAttempts: Number(row.httpAttempts), reportRequests: Number(row.reportRequests) };
}
class GarmentWorkerFailure extends SourceError {
  constructor(code: string, readonly counts: GarmentRequestCounts) { super(code); }
}
export function garmentCollectionFailureCounts(error: unknown): GarmentRequestCounts | null {
  return error instanceof GarmentWorkerFailure ? { ...error.counts } : null;
}

function extractCapture(input: unknown, scope: GarmentObservationScope, password: string, ordinal: number) {
  const cap = object(input), v2 = cap.schemaVersion === "ainuoke-garment-shipment-capture.v2";
  keys(cap, "schemaVersion,reportId,sourceFingerprint,queryContext,capturedAt,page,pageSize,rawResponseSha256,rawReportResponse" + (v2 ? ",executedRequest" : ""));
  const query = object(cap.queryContext); keys(query, "match,salesContractNo");
  if ((!v2 && cap.schemaVersion !== "ainuoke-garment-shipment-capture.v1") || cap.reportId !== "6086979" || cap.page !== 1 || cap.pageSize !== 100
    || cap.sourceFingerprint !== scope.sourceFingerprint || query.match !== "exact" || query.salesContractNo !== scope.salesContractNo
    || typeof cap.rawReportResponse !== "string" || Buffer.byteLength(cap.rawReportResponse, "utf8") > GARMENT_COLLECTION_LIMITS.responseBytes
    || !sha(cap.rawResponseSha256) || createHash("sha256").update(cap.rawReportResponse).digest("hex") !== cap.rawResponseSha256)
    fail("garment_collection_invalid_worker");
  const raw = decoded(cap.rawReportResponse), data = decoded(raw.dataList), meta = decoded(raw.reportObj);
  for (const value of [raw, data, meta]) screen(value, password);
  if (object(raw.reObj).isOk !== true || meta.reportId !== "6086979" || Object.hasOwn(raw, "reportId") && raw.reportId !== "6086979")
    fail("garment_collection_invalid_worker");
  const responsePageIndex = count(raw.pageIndex), responsePageSize = count(raw.pageSize);
  let pagingEvidence;
  if (v2) {
    const executed = object(cap.executedRequest); keys(executed, "reportRequestNumber,body");
    if (executed.reportRequestNumber !== ordinal || hash(executed.body) !== hash(garmentFirstPageRequest(scope.salesContractNo)))
      fail("garment_collection_invalid_worker");
    try { pagingEvidence = checkedGarmentFirstPageEvidence({ schemaVersion: "ainuoke-garment-first-page-evidence.v1",
      reportRequestNumber: ordinal, requestBodySha256: hash(executed.body), responsePageIndex, responsePageSize }, scope.salesContractNo, ordinal); }
    catch { fail("garment_collection_invalid_worker"); }
  } else if (responsePageIndex !== 1 || responsePageSize !== 100) fail("garment_collection_invalid_worker");
  const total = count(Object.hasOwn(raw, "dataCount") ? raw.dataCount : data.total);
  if (Object.hasOwn(raw, "dataCount") && Object.hasOwn(data, "total") && count(data.total) !== total) fail("garment_collection_invalid_worker");
  if (total > 100 || !Array.isArray(data.rows) || data.rows.length !== total) fail("garment_collection_unverified_pagination");
  return { schemaVersion: v2 ? "ainuoke-garment-shipment-page.v2" : "ainuoke-garment-shipment-page.v1",
    ...(pagingEvidence ? { pagingEvidence } : {}), reportId: "6086979", sourceFingerprint: scope.sourceFingerprint,
    queryContext: { match: "exact", salesContractNo: scope.salesContractNo }, capturedAt: cap.capturedAt,
    page: 1, pageSize: 100, reportedTotal: total, rawResponseSha256: cap.rawResponseSha256, rows: data.rows };
}

/** Independently rebuild checked pages from exact raw bytes. Empty is a valid
 * observation; no old witness/nonempty requirement is applied to new captures. */
export function validateGarmentCollectionResult(value: unknown, configuration: CollectorConfig, scope: GarmentObservationScope, now = Date.now()) {
  const config = garmentCollectionConfig(configuration, scope), row = object(value);
  if (row.result === "failed") {
    keys(row, "schemaVersion,result,code,counts");
    if (row.schemaVersion !== "ainuoke-garment-collection-worker.v1" || typeof row.code !== "string" || !workerCodes.has(row.code))
      fail("garment_collection_invalid_worker");
    throw new GarmentWorkerFailure(row.code as string, countsOf(row.counts));
  }
  keys(row, "schemaVersion,result,captures,counts");
  const counts = countsOf(row.counts);
  if (row.schemaVersion !== "ainuoke-garment-collection-worker.v1" || row.result !== "complete" || counts.httpAttempts !== 3 || counts.reportRequests !== 2
    || !Array.isArray(row.captures) || row.captures.length !== 2) fail("garment_collection_invalid_worker");
  const captures = row.captures as unknown[];
  if (object(captures[0]).schemaVersion !== object(captures[1]).schemaVersion) fail("garment_collection_invalid_worker");
  const pages = captures.map((cap, i) => extractCapture(cap, scope, config.password, i + 1));
  const input = { schemaVersion: "ainuoke-garment-shipment-input.v1", firstPass: [pages[0]], secondPass: [pages[1]] };
  const snapshot = buildGarmentObservationSnapshot(input, scope, now);
  return { input, scope: { ...scope }, snapshot, counts };
}

/** Server-only adapter. It is absent from HTTP, CLI, scheduler and Catalog.
 * A caller must first commit its durable started record and verify the exact
 * account/contract proof. Credentials only travel over the private child stdin. */
export function collectGarmentObservationPages(configuration: CollectorConfig, requestedScope: GarmentObservationScope,
  options: { spawnWorker?: typeof spawn; timeoutMs?: number } = {}): Promise<unknown> {
  const scope = structuredClone(requestedScope), config = garmentCollectionConfig(configuration, scope);
  assertExactSourceJsonRuntime("garment_collection_exact_runtime_required");
  return new Promise((accept, reject) => {
    const child = (options.spawnWorker ?? spawn)(process.platform === "win32" ? "python" : "python3",
      ["-m", "ainuoke_bridge.garment_collection", "--stdin-request"], { cwd: resolve("tools/ainuoke-bridge"), windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1" } });
    let settled = false, bytes = 0; const chunks: Buffer[] = [];
    const stop = (code: string) => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); reject(new SourceError(code)); };
    const timer = setTimeout(() => stop("garment_collection_worker_timeout"), Math.max(1, Math.min(options.timeoutMs ?? 180000, 180000)));
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > GARMENT_COLLECTION_LIMITS.workerBytes)
      stop("garment_collection_worker_limit"); else chunks.push(chunk); });
    child.stderr.resume(); child.on("error", () => stop("garment_collection_worker_unavailable"));
    child.stdin.on("error", () => stop("garment_collection_worker_unavailable"));
    child.on("close", code => {
      if (settled) return;
      try {
        const text = new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks));
        strictExactSourceJson(text); const value = JSON.parse(text) as Record<string, unknown>;
        if (code !== 0 && value.result !== "failed" || code === 0 && value.result !== "complete") return stop("garment_collection_invalid_worker");
        settled = true; clearTimeout(timer); accept(value);
      } catch { stop("garment_collection_invalid_worker"); }
    });
    child.stdin.end(JSON.stringify({ baseUrl: config.baseUrl, transportPolicy: config.transportPolicy, username: config.username,
      password: config.password, action: GARMENT_COLLECTION_ACTION, scope }));
  });
}

// Pure proof validation extracted from the reviewed fixed diagnostic; no file, process, HTTP or CLI entrypoint.
import { createHash } from "node:crypto";
import { APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, accountFingerprint, parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { SourceError, hash, inspect } from "./contract.js";
import { strictExactSourceJson } from "./exact-source-json.js";
import { PAYMENT_WORKER_FAILURE_CODES } from "./payment-request-probe.js";

export const GARMENT_FILTER_LIMITS = Object.freeze({ reportRequests: 3, httpAttempts: 4, pageSize: 100,
  responseBytes: 4 * 1024 * 1024, totalBytes: 12 * 1024 * 1024, workerBytes: 80 * 1024 * 1024, timeoutMs: 180000 });
export const GARMENT_FILTER_ACTION = "verify-frozen-d1933-contract-first-page";
export const GARMENT_FILTER_ZERO = "ZHIXU-6086979-NO-MATCH-G7B";
const queryManifest = Object.freeze({ reportId: "6086979", queryField: "ExpContractNo", compareType: "is", flowName: "[内层]",
  page: 1, pageSize: 100, sequence: ["C1", "C0", "C1"], controlContract: GARMENT_FILTER_ZERO, retries: 0 });
const schema = "ainuoke-garment-filter-verification.v1";
type Obj = Record<string, unknown>;
export type GarmentFilterSelection = { schemaVersion: "ainuoke-garment-filter-selection.v1"; sourceFingerprint: string;
  candidateSha256: string; rawResponseSha256: string; toolingCommit: string; salesContractNo: string; witness: { id: string; billno: string } };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const idText = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9/._-]{0,127}$/u.test(value);
function fail(code = "garment_filter_invalid_evidence"): never { throw new SourceError(code); }
const object = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : fail();
const keys = (value: Obj, expected: string) => { if (Object.keys(value).sort().join(",") !== expected.split(",").sort().join(",")) fail(); };
const parse = (text: string) => strictExactSourceJson(text, "garment_filter_invalid_json");
const decoded = (value: unknown) => object(typeof value === "string" ? parse(value) : value);
const count = (value: unknown) => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value) || !Number.isSafeInteger(Number(value))) return fail("garment_filter_count_mismatch");
  return Number(value);
};
/** Shared by the fixed candidate probe; this validates data, never read scope. */
export function screen(value: unknown, password = "", depth = 0): void {
  // Count object edges and encoded-JSON edges together. Report configuration
  // legitimately exceeds the generic Source bundle's smaller tree limit.
  if (depth > 64) return fail("garment_filter_structure_limit");
  if (typeof value === "string") {
    if (password && value.includes(password)) return fail("source_secret_field");
    const text = value.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      // Ordinary business labels such as [内层] are not encoded JSON. Valid JSON
      // is still parsed strictly so duplicate/secret keys cannot hide in text.
      try { JSON.parse(text); } catch (error) {
        if (error instanceof SyntaxError) return;
        return fail("garment_filter_structure_limit");
      }
      screen(parse(text), password, depth + 1);
    }
  } else if (Array.isArray(value)) value.forEach(item => screen(item, password, depth + 1));
  else if (value && typeof value === "object") {
    // Reuse the existing secret-key policy at this level; this walker alone
    // owns recursion, so a second, smaller subtree limit cannot reject metadata.
    inspect(Object.fromEntries(Object.keys(value).map(key => [key, null])));
    Object.values(value).forEach(item => screen(item, password, depth + 1));
  } else inspect(value);
}
function decodePage(text: string, password = "") {
  const raw = decoded(text), data = decoded(raw.dataList), meta = decoded(raw.reportObj);
  const columns = typeof meta.cellList === "string" && meta.cellList.trim() ? parse(meta.cellList) : meta.cellList;
  if (columns != null && !(typeof columns === "string" && !columns.trim()) && !Array.isArray(columns)) fail("garment_filter_row_invalid");
  for (const value of [raw, data, meta, columns]) screen(value, password);
  return { raw, data, meta };
}
function rawPage(text: string, password = "") {
  const { raw, data, meta } = decodePage(text, password);
  if (object(raw.reObj).isOk !== true || meta.reportId !== "6086979" || Object.hasOwn(raw, "reportId") && raw.reportId !== "6086979") fail("garment_filter_report_mismatch");
  if (![0, 1].includes(count(raw.pageIndex)) || ![0, 100].includes(count(raw.pageSize))) fail("garment_filter_page_mismatch");
  const total = count(Object.hasOwn(raw, "dataCount") ? raw.dataCount : data.total);
  if (Object.hasOwn(raw, "dataCount") && Object.hasOwn(data, "total") && count(data.total) !== total) fail("garment_filter_count_mismatch");
  if (total > 100) fail("garment_filter_page_limit");
  if (!Array.isArray(data.rows) || data.rows.length !== total) fail("garment_filter_count_mismatch");
  return { total, rows: (data.rows as unknown[]).map(object) };
}
function assertSelection(selection: GarmentFilterSelection) {
  const value = object(selection); keys(value, "schemaVersion,sourceFingerprint,candidateSha256,rawResponseSha256,toolingCommit,salesContractNo,witness");
  const witness = object(value.witness); keys(witness, "id,billno");
  if (value.schemaVersion !== "ainuoke-garment-filter-selection.v1" || !sha(value.sourceFingerprint) || !sha(value.candidateSha256)
    || !sha(value.rawResponseSha256) || typeof value.toolingCommit !== "string" || !/^[a-f0-9]{40}$/u.test(value.toolingCommit)
    || typeof value.salesContractNo !== "string" || !/^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(value.salesContractNo)
    || value.salesContractNo === GARMENT_FILTER_ZERO || !idText(witness.id) || !idText(witness.billno)) fail("garment_filter_selection_invalid");
}
export function garmentFilterConfig(input: unknown, selection: GarmentFilterSelection): CollectorConfig {
  assertSelection(selection);
  const config = parseCollectorConfig(input);
  if (config.baseUrl !== APPROVED_HTTP_ORIGIN || config.transportPolicy !== APPROVED_HTTP_POLICY || accountFingerprint(config) !== selection.sourceFingerprint) fail("garment_filter_account_mismatch");
  return config;
}
const workerCodes = new Set([...PAYMENT_WORKER_FAILURE_CODES, ...("garment_filter_input_invalid garment_filter_scope_refused garment_filter_selection_invalid garment_filter_account_mismatch garment_filter_deadline garment_filter_sequence_refused garment_filter_response_limit garment_filter_structure_limit garment_filter_report_mismatch garment_filter_page_mismatch garment_filter_count_mismatch garment_filter_page_limit garment_filter_empty_unverified garment_filter_contract_mismatch garment_filter_row_invalid garment_filter_duplicate_row garment_filter_witness_missing garment_filter_control_nonempty garment_filter_source_changed garment_filter_failed payment_observation_duplicate_json_key payment_observation_invalid_json payment_observation_invalid_shape payment_observation_invalid_count").split(" ")]);
export const GARMENT_FILTER_FAILURE_CODES = Object.freeze([...workerCodes, ...("garment_filter_invalid_evidence garment_filter_invalid_json garment_filter_candidate_invalid garment_filter_timeout garment_filter_worker_limit garment_filter_worker_unavailable garment_filter_worker_invalid garment_filter_exact_runtime_required garment_filter_explicit_scope_required garment_filter_clean_commit_required garment_filter_credential_invalid garment_filter_failed source_secret_field preflight_private_output_required").split(" ")]);
function safeEnvelope(input: unknown, config: CollectorConfig, selection: GarmentFilterSelection, now: number) {
  const value = object(input); keys(value, "schemaVersion,result,code,workerStage,selectionHash,httpAttempts,reportRequests,pages");
  if (!Number.isFinite(now) || value.schemaVersion !== "ainuoke-garment-filter-evidence.v1" || !["complete", "failed"].includes(String(value.result))
    || value.selectionHash !== hash(selection) || !["not-started", "login", "report", "validation"].includes(String(value.workerStage))
    || !Number.isSafeInteger(value.httpAttempts) || !Number.isSafeInteger(value.reportRequests)
    || Number(value.httpAttempts) < 0 || Number(value.httpAttempts) > 4 || Number(value.reportRequests) < 0 || Number(value.reportRequests) > 3
    || !(Number(value.httpAttempts) === Number(value.reportRequests) + 1 || value.httpAttempts === 0 && value.reportRequests === 0)
    || value.workerStage === "not-started" && (value.httpAttempts !== 0 || value.reportRequests !== 0)
    || value.workerStage === "login" && (value.httpAttempts !== 1 || value.reportRequests !== 0)
    || value.workerStage === "validation" && Number(value.reportRequests) < 1
    || !Array.isArray(value.pages) || value.pages.length > Number(value.reportRequests) || value.pages.length < Math.max(0, Number(value.reportRequests) - 1)
    || value.result === "complete" && (value.code !== null || value.httpAttempts !== 4 || value.reportRequests !== 3 || value.pages.length !== 3 || value.workerStage !== "validation")
    || value.result === "failed" && (typeof value.code !== "string" || !workerCodes.has(value.code))) fail();
  let bytes = 0, previous = -Infinity;
  const pages = (value.pages as unknown[]).map((item, index) => {
    const page = object(item); keys(page, "sequence,alias,capturedAt,rawReportResponse,rawResponseSha256");
    if (page.sequence !== index + 1 || page.alias !== (index === 1 ? "C0" : "C1") || typeof page.rawReportResponse !== "string"
      || Buffer.byteLength(page.rawReportResponse, "utf8") > GARMENT_FILTER_LIMITS.responseBytes || digest(page.rawReportResponse) !== page.rawResponseSha256
      || typeof page.capturedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(page.capturedAt)) fail();
    const time = Date.parse(page.capturedAt);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== page.capturedAt.slice(0, 10)
      || time < previous || time > now || now - time > GARMENT_FILTER_LIMITS.timeoutMs) fail();
    previous = time; bytes += Buffer.byteLength(page.rawReportResponse, "utf8");
    if (bytes > GARMENT_FILTER_LIMITS.totalBytes) fail("garment_filter_response_limit");
    decodePage(page.rawReportResponse, config.password);
    return page as { sequence: number; alias: string; capturedAt: string; rawReportResponse: string; rawResponseSha256: string };
  });
  return { value, pages, bytes };
}
export function validateGarmentFilterEvidence(input: unknown, configuration: unknown, selection: GarmentFilterSelection, now = Date.now()) {
  const config = garmentFilterConfig(configuration, selection), { value, pages, bytes } = safeEnvelope(input, config, selection, now);
  let validationCode: string | null = value.result === "failed" ? value.code as string : null, positiveRows: number | null = null;
  if (value.result === "complete") {
    try {
      const checked = pages.map((page, index) => {
        const { total, rows } = rawPage(page.rawReportResponse, config.password);
        if (index === 1) { if (total !== 0) fail("garment_filter_control_nonempty"); }
        else {
          if (!total) fail("garment_filter_empty_unverified");
          const ids = new Set<string>();
          for (const row of rows) {
            if (row.ExpContractNo !== selection.salesContractNo) fail("garment_filter_contract_mismatch");
            if (!idText(row.id) || Object.values(row).some(v => v !== null && (typeof v !== "string" || v.length > 2048))) fail("garment_filter_row_invalid");
            if (ids.has(row.id)) fail("garment_filter_duplicate_row"); ids.add(row.id);
          }
          if (!rows.some(row => row.id === selection.witness.id && row.billno === selection.witness.billno)) fail("garment_filter_witness_missing");
        }
        return { total, content: hash([...rows].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0)) };
      });
      if (checked[0].total !== checked[2].total || checked[0].content !== checked[2].content) fail("garment_filter_source_changed");
      positiveRows = checked[0].total;
    } catch (error) { validationCode = error instanceof SourceError && GARMENT_FILTER_FAILURE_CODES.includes(error.code) ? error.code : "garment_filter_invalid_evidence"; }
  }
  const common = { reportId: "6086979", databaseAccess: "none", sourceActivation: "not-activated", businessSnapshotPublication: "not-performed" } as const;
  const summary = { schemaVersion: schema, result: validationCode ? "FAIL" : "SCOPED_FILTER_OBSERVED", ...common,
    code: validationCode, sourceFingerprint: selection.sourceFingerprint, candidateSha256: selection.candidateSha256,
    queryManifestSha256: hash(queryManifest), httpAttempts: value.httpAttempts as number, reportRequests: value.reportRequests as number,
    retainedPages: pages.length, retainedBytes: bytes, positiveRows, contractAlias: "C1", controlAlias: "C0",
    proofScope: "this-account-contract-complete-first-page-only", universalFilterSemanticsVerified: false,
    pageHashes: pages.map(page => ({ sequence: page.sequence, alias: page.alias, sha256: page.rawResponseSha256 })) };
  return { summary, privateReport: { schemaVersion: "ainuoke-garment-filter-private.v1", ...common, validationStatus: validationCode ? "rejected" : "scoped-observation",
    validationCode, selection, queryManifest, evidence: value, checkedAt: new Date(now).toISOString(), rawNumericTextIsAuthoritative: true } };
}

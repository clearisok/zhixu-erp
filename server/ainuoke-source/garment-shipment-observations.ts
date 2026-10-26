import { canonicalDecimal } from "../quotes/decimal-projection.js";
import { hash } from "./contract.js";

/** Engineering input budgets, not permission to issue any real request. */
export const GARMENT_OBSERVATION_LIMITS = Object.freeze({ pageSize: 100, maxPages: 20, maxRows: 2000,
  maxBytes: 16 * 1024 * 1024, captureWindowMs: 180000 });
export const GARMENT_SOURCE_FIELDS = ["id", "CompanyName", "billno", "FDate", "CustomerName", "Brand", "GoodsNo", "insideorderno",
  "CustomerOrderNo", "CnName", "CnColor", "QtyUnit", "styleNum", "trimnum", "ycyNum", "UsableNum", "Num", "TotalGWa", "TotalNWa",
  "ppmeetting", "indate", "outdate", "Bgrade", "Bgradereason", "factory", "Overfilled", "isClearing", "ExpContractNo", "syap", "syqr",
  "dhmlzg", "dcsj", "GYDJY", "KCDate", "DeliveryDate", "wx", "remark", "wxprice"] as const;
const visibleFields = ["id", "billno", "ExpContractNo", "insideorderno", "CnColor", "QtyUnit", "Num", "outdate", "FDate", "indate",
  "DeliveryDate", "styleNum", "trimnum", "ycyNum", "UsableNum", "Overfilled", "Bgrade"] as const;
type Obj = Record<string, unknown>;
export type GarmentSourceField = { state: "known"; raw: string } | { state: "unknown"; reason: "missing" | "null" | "blank" };
type UnknownField = Extract<GarmentSourceField, { state: "unknown" }>;
export type GarmentQuantity = UnknownField | { state: "known"; raw: string; value: string } | { state: "invalid"; raw: string; reason: "invalid_decimal" };
export type GarmentBusinessDate = UnknownField | { state: "known"; raw: string; value: string } | { state: "invalid"; raw: string; reason: "invalid_date" };
export type GarmentObservationScope = { sourceFingerprint: string; salesContractNo: string };
export class GarmentObservationError extends Error {
  constructor(readonly code: string) { super(code); this.name = "GarmentObservationError"; }
}
const fail = (code: string): never => { throw new GarmentObservationError(code); };
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const object = (value: unknown): Obj => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("shipment_observation_invalid_shape");
  return value as Obj;
};
const exact = (value: Obj, keys: readonly string[]) => {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) fail("shipment_observation_invalid_shape");
};
const cleanText = (value: unknown, max: number): value is string => typeof value === "string" && value === value.trim()
  && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
function scopeOf(input: unknown): GarmentObservationScope {
  const value = object(input); exact(value, ["sourceFingerprint", "salesContractNo"]);
  if (!sha(value.sourceFingerprint) || !cleanText(value.salesContractNo, 80)) fail("shipment_observation_invalid_scope");
  return value as GarmentObservationScope;
}
function sourceField(row: Obj, key: string): GarmentSourceField {
  if (!Object.hasOwn(row, key)) return { state: "unknown", reason: "missing" };
  const value = row[key];
  if (value === null) return { state: "unknown", reason: "null" };
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))
    return fail("shipment_observation_exact_strings_required");
  return value.trim() ? { state: "known", raw: value } : { state: "unknown", reason: "blank" };
}
export function garmentQuantity(field: GarmentSourceField): GarmentQuantity {
  if (field.state !== "known") return field;
  const raw = field.raw, value = raw.trim();
  if (value.length <= 128 && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value)) {
    try { const parsed = canonicalDecimal(value); if (parsed.length <= 128) return { ...field, value: parsed }; } catch { /* retain invalid evidence */ }
  }
  return { state: "invalid", raw, reason: "invalid_decimal" };
}
export function garmentBusinessDate(field: GarmentSourceField): GarmentBusinessDate {
  if (field.state !== "known") return field;
  // Date-only source values are civil dates, never converted through local time.
  const raw = field.raw, value = raw.trim();
  const valid = /^\d{4}-\d{2}-\d{2}$/u.test(value) && value >= "1900-01-01" && value <= "9999-12-31"
    && Number.isFinite(Date.parse(value + "T00:00:00.000Z")) && new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
  return valid ? { ...field, value } : { state: "invalid", raw, reason: "invalid_date" };
}
function capturedTime(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10))
    return fail("shipment_observation_invalid_capture_time");
  return Date.parse(value);
}
function projectPage(input: unknown, scope: GarmentObservationScope) {
  const page = object(input);
  exact(page, ["schemaVersion", "reportId", "sourceFingerprint", "queryContext", "capturedAt", "page", "pageSize", "reportedTotal", "rawResponseSha256", "rows"]);
  const query = object(page.queryContext); exact(query, ["match", "salesContractNo"]);
  if (page.schemaVersion !== "ainuoke-garment-shipment-page.v1" || page.reportId !== "6086979"
    || page.sourceFingerprint !== scope.sourceFingerprint || query.match !== "exact" || query.salesContractNo !== scope.salesContractNo)
    return fail("shipment_observation_scope_mismatch");
  if (!Number.isSafeInteger(page.page) || Number(page.page) < 1 || Number(page.page) > GARMENT_OBSERVATION_LIMITS.maxPages
    || page.pageSize !== 100 || !Number.isSafeInteger(page.reportedTotal) || Number(page.reportedTotal) < 0
    || Number(page.reportedTotal) > GARMENT_OBSERVATION_LIMITS.maxRows || !sha(page.rawResponseSha256)
    || !Array.isArray(page.rows) || Number(page.page) > Math.max(1, Math.ceil(Number(page.reportedTotal) / 100))
    || page.rows.length !== Math.min(100, Math.max(0, Number(page.reportedTotal) - (Number(page.page) - 1) * 100)))
    return fail("shipment_observation_invalid_page");
  const capturedAt = capturedTime(page.capturedAt);
  const captureId = hash([page.reportId, page.sourceFingerprint, page.queryContext, page.capturedAt, page.page, page.rawResponseSha256]);
  const rows = page.rows.map((raw, index) => {
    const row = object(raw);
    if (Object.keys(row).some(key => !(GARMENT_SOURCE_FIELDS as readonly string[]).includes(key))) fail("shipment_observation_unknown_field");
    for (const key of Object.keys(row)) sourceField(row, key);
    if (!cleanText(row.id, 128)) fail("shipment_observation_row_identity_missing");
    if (row.ExpContractNo !== scope.salesContractNo) fail("shipment_observation_contract_mismatch");
    const fields = Object.fromEntries(visibleFields.map(key => [key, sourceField(row, key)])) as Record<typeof visibleFields[number], GarmentSourceField>;
    return { observationId: hash([captureId, index]), sourceRecordId: row.id as string,
      trace: { captureId, page: Number(page.page), rowIndex: index, rawResponseSha256: page.rawResponseSha256 as string,
        rowContentHash: hash(row), stableBusinessEventIdentity: "unverified" as const },
      fields, quantity: garmentQuantity(fields.Num), businessDate: garmentBusinessDate(fields.outdate),
      quantityMeaning: "this_row_garment_outstore" as const, businessDateMeaning: "source_outdate" as const };
  });
  return { page: Number(page.page), total: Number(page.reportedTotal), capturedAt, captureId, rows,
    trace: { captureId, page: Number(page.page), capturedAt: page.capturedAt as string, rawResponseSha256: page.rawResponseSha256 as string, rowCount: rows.length } };
}

/** Pure checked-page contract, not an authorization boundary. The offline Python
 * extractor binds raw bytes/hash and exact numeric text. Query execution truth,
 * profile/contract rights and publication are additional server-only boundaries.
 * This never consumes the fixed contains/first-page diagnostic as complete input. */
export function buildGarmentObservationSnapshot(input: unknown, expectedScope: GarmentObservationScope, now = Date.now()) {
  const scope = scopeOf(expectedScope), value = object(input); exact(value, ["schemaVersion", "firstPass", "secondPass"]);
  if (!Number.isFinite(now) || now < 0) fail("shipment_observation_invalid_clock");
  if (value.schemaVersion !== "ainuoke-garment-shipment-input.v1" || !Array.isArray(value.firstPass) || !Array.isArray(value.secondPass)
    || [value.firstPass, value.secondPass].some(pass => pass.length < 1 || pass.length > GARMENT_OBSERVATION_LIMITS.maxPages)
    || Buffer.byteLength(JSON.stringify(value), "utf8") > GARMENT_OBSERVATION_LIMITS.maxBytes) fail("shipment_observation_input_limit");
  const rawPasses = [value.firstPass as unknown[], value.secondPass as unknown[]];
  const passes = rawPasses.map(pass => pass.map(page => projectPage(page, scope)));
  let total: number | null = null, previous = -Infinity, oldest = Infinity;
  const captureIds = new Set<string>();
  for (const pass of passes) {
    const ids = new Set<string>();
    for (const [index, page] of pass.entries()) {
      if (page.page !== index + 1) fail("shipment_observation_page_order");
      if (total !== null && page.total !== total) fail("shipment_observation_source_changed"); total = page.total;
      if (page.capturedAt < previous || page.capturedAt > now) fail("shipment_observation_invalid_capture_time");
      previous = page.capturedAt; oldest = Math.min(oldest, page.capturedAt);
      if (captureIds.has(page.captureId)) fail("shipment_observation_replayed_capture"); captureIds.add(page.captureId);
      for (const row of page.rows) {
        if (ids.has(row.sourceRecordId)) fail("shipment_observation_duplicate_row_id"); ids.add(row.sourceRecordId);
      }
    }
    if (pass.length !== Math.max(1, Math.ceil(total! / 100))) fail("shipment_observation_incomplete");
  }
  if (now - oldest > GARMENT_OBSERVATION_LIMITS.captureWindowMs) fail("shipment_observation_capture_expired");
  const content = (pass: typeof passes[number]) => pass.flatMap(page => page.rows).map(row => [row.sourceRecordId, row.trace.rowContentHash])
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (hash(content(passes[0])) !== hash(content(passes[1]))) fail("shipment_observation_source_changed");
  const trace = passes.flatMap((pass, index) => pass.map(page => ({ pass: index + 1, ...page.trace })));
  const snapshotId = hash(["6086979", scope, trace]);
  return { schemaVersion: "ainuoke-garment-shipment-snapshot.v1" as const, reportId: "6086979" as const, snapshotId,
    ...scope, observedFrom: new Date(oldest).toISOString(), observedThrough: new Date(previous).toISOString(), trace,
    completeness: { queryRows: total!, pagesPerPass: passes[0].length, consistency: "two_pass_query_observation_not_transaction" as const,
      allCompanyRecordsRead: false as const, contractFilterExecution: "requires_separate_verification" as const },
    rows: passes[0].flatMap(page => page.rows), aggregation: "none_observations_not_event_ledger" as const,
    disappearanceMeaning: "unknown_not_cancellation" as const, closingAdoption: "not_performed" as const };
}
export type GarmentObservationSnapshot = ReturnType<typeof buildGarmentObservationSnapshot>;

/** Rebuild persisted evidence or locate an original capture receipt. This checks
 * the capture's own complete time span, not whether it can be published now.
 * A new writer must separately enforce captureWindowMs against its current clock. */
export function restoreGarmentObservationSnapshot(input: unknown, scope: GarmentObservationScope) {
  const value = object(input);
  if (!Array.isArray(value.secondPass) || value.secondPass.length < 1 || value.secondPass.length > GARMENT_OBSERVATION_LIMITS.maxPages)
    return fail("shipment_observation_invalid_shape");
  const last = object(value.secondPass[value.secondPass.length - 1]);
  return buildGarmentObservationSnapshot(value, scope, capturedTime(last.capturedAt));
}

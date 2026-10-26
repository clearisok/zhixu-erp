import { orderMaterialNavigation } from "../ainuoke-material-progress/order-navigation.js";
import { ServerAuthError } from "../server-auth/server-auth-client.js";
import { GARMENT_VISIBLE_FIELDS, GARMENT_EMPTY_LABELS, garmentQuantity, garmentBusinessDate,
  type GarmentSourceField, type GarmentReadRow, type GarmentReadView, type GarmentHistory, type TimedGarmentView } from "./model.js";

// Stored public payloads may occupy 16 MiB. Allow the small read envelope too.
export const GARMENT_RESPONSE_MAX_BYTES = 16 * 1024 * 1024 + 64 * 1024;
export const GARMENT_HISTORY_MAX_BYTES = 64 * 1024;
export type GarmentReadLease = { isCurrent: () => boolean; signal?: AbortSignal };
const messages = {
  invalid_response: "成衣出货记录无法安全核对，请重新读取。",
  too_large: "本次成衣出货记录过大，无法安全展示。",
  not_connected: "成衣出货来源尚未接通。",
  forbidden: "当前账号没有查看成衣出货的权限。",
  authentication_required: "登录状态已失效，请重新登录。",
  order_unavailable: "这张订单或所选历史记录暂不可用。",
  unavailable: "成衣出货暂时无法读取，请稍后手动重试。",
  clock_unavailable: "无法核对记录时效，请重新读取。",
  owner_changed: "当前查看范围已变化，原读取结果不再展示。",
} as const;
export class GarmentReadError extends ServerAuthError {
  constructor(status: number, code: keyof typeof messages) { super(status, code, messages[code]); this.name = "GarmentReadError"; }
}
type Obj = Record<string, unknown>;
const invalid = (): never => { throw new GarmentReadError(502, "invalid_response"); };
function object(input: unknown): Obj {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  return input as Obj;
}
function exact(input: Obj, keys: readonly string[]) {
  if (Object.keys(input).sort().join(",") !== [...keys].sort().join(",")) invalid();
}
const sha = (input: unknown): input is string => typeof input === "string" && /^[a-f0-9]{64}$/u.test(input);
const uuid = (input: unknown): input is string => typeof input === "string" && orderMaterialNavigation(input)?.salesOrderId === input;
const integer = (input: unknown, min: number, max: number): input is number => Number.isSafeInteger(input) && Number(input) >= min && Number(input) <= max;
const clean = (input: unknown, max: number): input is string => typeof input === "string" && input.length > 0 && input.length <= max
  && input === input.trim() && !/[\u0000-\u001f\u007f]/u.test(input);
function stamp(input: unknown): number {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(input)) return invalid();
  const result = Date.parse(input);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== input.slice(0, 10)) return invalid();
  return result;
}
function sourceField(input: unknown): GarmentSourceField {
  const value = object(input);
  if (value.state === "known") {
    exact(value, ["state", "raw"]);
    if (typeof value.raw !== "string" || value.raw.length > 2048 || !value.raw.trim()
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value.raw)) return invalid();
    return { state: "known", raw: value.raw };
  }
  exact(value, ["state", "reason"]);
  if (value.state !== "unknown" || typeof value.reason !== "string" || !["missing", "null", "blank"].includes(value.reason)) return invalid();
  return value as GarmentSourceField;
}
function sameProjection(input: unknown, expected: object) {
  const value = object(input); exact(value, Object.keys(expected));
  if (Object.entries(expected).some(([key, item]) => value[key] !== item)) invalid();
}
function observation(input: unknown, index: number, contract: string, capture: Obj): GarmentReadRow {
  const value = object(input);
  exact(value, ["observationId", "sourceRecordId", "trace", "fields", "quantity", "businessDate", "quantityMeaning", "businessDateMeaning", "colorMatch"]);
  if (!sha(value.observationId) || !clean(value.sourceRecordId, 128) || value.quantityMeaning !== "this_row_garment_outstore"
    || value.businessDateMeaning !== "source_outdate") return invalid();
  const fields = object(value.fields); exact(fields, GARMENT_VISIBLE_FIELDS);
  const parsed = Object.fromEntries(GARMENT_VISIBLE_FIELDS.map(key => [key, sourceField(fields[key])])) as GarmentReadRow["fields"];
  if (parsed.id.state !== "known" || parsed.id.raw !== value.sourceRecordId
    || parsed.ExpContractNo.state !== "known" || parsed.ExpContractNo.raw !== contract) return invalid();
  sameProjection(value.quantity, garmentQuantity(parsed.Num)); sameProjection(value.businessDate, garmentBusinessDate(parsed.outdate));
  const trace = object(value.trace); exact(trace, ["captureId", "page", "rowIndex", "rawResponseSha256", "rowContentHash", "stableBusinessEventIdentity"]);
  if (trace.captureId !== capture.captureId || trace.rawResponseSha256 !== capture.rawResponseSha256 || trace.page !== Math.floor(index / 100) + 1
    || trace.rowIndex !== index % 100 || !sha(trace.rowContentHash) || trace.stableBusinessEventIdentity !== "unverified") return invalid();
  const color = object(value.colorMatch);
  if (color.state === "matched") {
    exact(color, ["state", "orderColorId", "orderColorName"]);
    if (!uuid(color.orderColorId) || !clean(color.orderColorName, 2048) || parsed.CnColor.state !== "known") return invalid();
  } else {
    exact(color, ["state"]);
    if (typeof color.state !== "string" || !["missing_source_color", "unmatched", "ambiguous"].includes(color.state)
      || (color.state === "missing_source_color") !== (parsed.CnColor.state === "unknown")) return invalid();
  }
  return value as GarmentReadRow;
}

/** Response-shape validation only, never authorization, hash proof or proof that
 * the upstream report actually applied its declared contract filter. */
export function parseGarmentView(input: unknown, id: string, contract: string, publicationId?: string): GarmentReadView {
  if (!uuid(id) || !clean(contract, 80) || publicationId !== undefined && !uuid(publicationId)) return invalid();
  const value = object(input);
  if (value.schemaVersion !== "order-garment-shipments.v1" || value.salesOrderId !== id || value.sourceReportId !== "6086979") return invalid();
  if (value.sourceStatus !== "observed" && value.sourceStatus !== "observed_empty") {
    exact(value, ["schemaVersion", "salesOrderId", "sourceReportId", "sourceStatus", "rows"]);
    if (typeof value.sourceStatus !== "string" || !Object.hasOwn(GARMENT_EMPTY_LABELS, value.sourceStatus)
      || !Array.isArray(value.rows) || value.rows.length !== 0) return invalid();
    return value as GarmentReadView;
  }
  exact(value, ["schemaVersion", "reportId", "salesOrderId", "sourceReportId", "sourceStatus", "snapshotId", "publicationId", "generation", "sourceFingerprint", "salesContractNo",
    "observedFrom", "observedThrough", "evaluatedAt", "expiresAt", "freshness", "targetPolicyChanged", "colorBasisChanged", "trace", "rows", "completeness", "aggregation", "disappearanceMeaning", "closingAdoption"]);
  if (value.reportId !== "6086979" || !sha(value.snapshotId) || !sha(value.sourceFingerprint) || !uuid(value.publicationId)
    || publicationId !== undefined && publicationId !== value.publicationId || !integer(value.generation, 1, 2147483647) || value.salesContractNo !== contract
    || typeof value.targetPolicyChanged !== "boolean" || typeof value.colorBasisChanged !== "boolean" || !Array.isArray(value.rows) || value.rows.length > 2000
    || (value.sourceStatus === "observed_empty") !== (value.rows.length === 0) || value.aggregation !== "none_observations_not_event_ledger"
    || value.disappearanceMeaning !== "unknown_not_cancellation" || value.closingAdoption !== "not_performed") return invalid();
  const from = stamp(value.observedFrom), through = stamp(value.observedThrough), evaluated = stamp(value.evaluatedAt), expires = stamp(value.expiresAt);
  if (through < from || through - from > 180000 || evaluated < through || expires - from < 1000 || expires - from > 86400000
    || value.freshness !== (evaluated < expires ? "fresh" : "stale")) return invalid();
  const complete = object(value.completeness); exact(complete, ["queryRows", "pagesPerPass", "consistency", "allCompanyRecordsRead", "contractFilterExecution"]);
  const pages = Math.max(1, Math.ceil(value.rows.length / 100));
  if (complete.queryRows !== value.rows.length || complete.pagesPerPass !== pages || complete.consistency !== "two_pass_query_observation_not_transaction"
    || complete.allCompanyRecordsRead !== false || complete.contractFilterExecution !== "requires_separate_verification"
    || !Array.isArray(value.trace) || value.trace.length !== pages * 2) return invalid();
  const rowInputs = value.rows;
  let previous = from;
  const traces = value.trace.map((input, index) => {
    const trace = object(input); exact(trace, ["pass", "captureId", "page", "capturedAt", "rawResponseSha256", "rowCount"]);
    const page = index % pages + 1, time = stamp(trace.capturedAt);
    if (trace.pass !== Math.floor(index / pages) + 1 || trace.page !== page || !sha(trace.captureId) || !sha(trace.rawResponseSha256)
      || trace.rowCount !== Math.min(100, Math.max(0, rowInputs.length - (page - 1) * 100)) || time < previous || time > through
      || index === 0 && time !== from || index === pages * 2 - 1 && time !== through) return invalid();
    previous = time; return trace;
  });
  if (new Set(traces.map(trace => trace.captureId)).size !== traces.length) return invalid();
  const rows = value.rows.map((row, index) => observation(row, index, contract, traces[Math.floor(index / 100)]));
  if (new Set(rows.map(row => row.sourceRecordId)).size !== rows.length || new Set(rows.map(row => row.observationId)).size !== rows.length) return invalid();
  return value as GarmentReadView;
}

export function parseGarmentHistory(input: unknown, id: string, beforeGeneration?: number): GarmentHistory {
  if (!uuid(id) || beforeGeneration !== undefined && !integer(beforeGeneration, 1, 2147483647)) return invalid();
  const value = object(input);
  exact(value, ["salesOrderId", "records", "nextBeforeGeneration", ...(Object.hasOwn(value, "validation") ? ["validation"] : [])]);
  if (value.salesOrderId !== id || !Array.isArray(value.records) || value.records.length > 25
    || value.validation !== undefined && value.validation !== "immutable_summary_detail_verified_on_open") return invalid();
  let previous = beforeGeneration ?? 2147483648;
  for (const input of value.records) {
    const record = object(input); exact(record, ["publicationId", "generation", "observedFrom", "observedThrough", "rowCount", "colorBasisHash"]);
    if (!uuid(record.publicationId) || !integer(record.generation, 1, 2147483647) || record.generation >= previous
      || !integer(record.rowCount, 0, 2000) || !sha(record.colorBasisHash)) return invalid();
    const from = stamp(record.observedFrom), through = stamp(record.observedThrough);
    if (through < from || through - from > 180000) return invalid();
    previous = record.generation;
  }
  if (new Set(value.records.map(input => object(input).publicationId)).size !== value.records.length) return invalid();
  if (value.nextBeforeGeneration !== null && (!integer(value.nextBeforeGeneration, 1, 2147483647)
    || value.nextBeforeGeneration >= (beforeGeneration ?? 2147483648) || value.nextBeforeGeneration > previous)) return invalid();
  if (value.validation === undefined && (value.records.length || value.nextBeforeGeneration !== null)) return invalid();
  // Filtering incompatible bindings may leave an empty page with a valid cursor.
  return value as GarmentHistory;
}

function assertLease(lease: GarmentReadLease) {
  if (lease.signal?.aborted || !lease.isCurrent()) throw new GarmentReadError(0, "owner_changed");
}
async function boundedJson(response: Response, max: number, lease: GarmentReadLease): Promise<unknown> {
  assertLease(lease); if (!response.body) return invalid();
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      assertLease(lease); const chunk = await reader.read(); assertLease(lease);
      if (chunk.done) break;
      size += chunk.value.byteLength; if (size > max) throw new GarmentReadError(502, "too_large"); parts.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    assertLease(lease);
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; } catch { return invalid(); }
  } catch (error) {
    try { await reader.cancel(); } catch { /* cancellation must not reveal transport details */ }
    assertLease(lease); if (error instanceof GarmentReadError) throw error;
    throw new GarmentReadError(0, "unavailable");
  } finally { reader.releaseLock(); }
}
function clock(now: () => number, minimum = 0) {
  const value = now(); if (!Number.isFinite(value) || value < minimum) throw new GarmentReadError(0, "clock_unavailable"); return value;
}
export function garmentFreshnessAt(view: Extract<TimedGarmentView, { status: "observed" }>, now: number): "fresh" | "stale" {
  if (!Number.isFinite(now) || now < view.receivedAt) throw new GarmentReadError(0, "clock_unavailable");
  return view.model.freshness === "stale" || now >= view.deadline ? "stale" : "fresh";
}
export function createGarmentShipmentClient(fetcher: typeof fetch = globalThis.fetch, now: () => number = () => performance.now()) {
  async function request(path: string, max: number, lease: GarmentReadLease) {
    assertLease(lease); let response: Response;
    try { response = await fetcher(path, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: lease.signal, headers: { Accept: "application/json" } }); }
    catch { assertLease(lease); throw new GarmentReadError(0, "unavailable"); }
    try { assertLease(lease); } catch (error) {
      try { await response.body?.cancel(); } catch { /* discard a late body's transport details */ }
      throw error;
    }
    if (response.status === 401 || response.status === 403) {
      try { await response.body?.cancel(); } catch { /* do not inspect authentication response bodies */ }
      assertLease(lease); throw new GarmentReadError(response.status, response.status === 401 ? "authentication_required" : "forbidden");
    }
    const body = await boundedJson(response, response.ok ? max : GARMENT_HISTORY_MAX_BYTES, lease); assertLease(lease);
    if (!response.ok) {
      const code = body && typeof body === "object" && !Array.isArray(body) ? (body as Obj).error : null;
      const notConnected = code && typeof code === "object" && !Array.isArray(code) && (code as Obj).code === "garment_read_not_connected";
      throw new GarmentReadError(response.status, response.status === 404 ? "order_unavailable" : response.status === 503 && notConnected ? "not_connected" : "unavailable");
    }
    return body;
  }
  function orderPath(id: string) { const route = orderMaterialNavigation(id); if (!route) return invalid(); return { id: route.salesOrderId, path: "/api/v1/sales-orders/" + route.salesOrderId + "/garment-shipments" }; }
  return {
    async read(id: string, contract: string, lease: GarmentReadLease & { publicationId?: string }): Promise<TimedGarmentView> {
      const route = orderPath(id);
      if (!clean(contract, 80) || lease.publicationId !== undefined && !uuid(lease.publicationId)) return invalid();
      assertLease(lease); const started = clock(now);
      const body = await request(route.path + (lease.publicationId ? "/" + lease.publicationId : ""), GARMENT_RESPONSE_MAX_BYTES, lease);
      const model = parseGarmentView(body, route.id, contract, lease.publicationId), receivedAt = clock(now, started); assertLease(lease);
      if (!("publicationId" in model)) return { status: "empty", model };
      // Only a monotonic elapsed deadline; staleness never discards authorized history.
      return { status: "observed", model, receivedAt, deadline: started + (Date.parse(model.expiresAt) - Date.parse(model.evaluatedAt)) };
    },
    async history(id: string, beforeGeneration: number | undefined, lease: GarmentReadLease): Promise<GarmentHistory> {
      const route = orderPath(id); if (beforeGeneration !== undefined && !integer(beforeGeneration, 1, 2147483647)) return invalid();
      const body = await request(route.path + "/history" + (beforeGeneration === undefined ? "" : "?beforeGeneration=" + beforeGeneration), GARMENT_HISTORY_MAX_BYTES, lease);
      assertLease(lease); return parseGarmentHistory(body, route.id, beforeGeneration);
    },
  };
}

import { canonicalDecimal } from "../../server/quotes/decimal-projection.js";
import type { GarmentFirstPageEvidence } from "../../server/ainuoke-source/garment-first-page.js";

/** Public, quantity-only fields. Private source evidence is never a read DTO. */
export const GARMENT_VISIBLE_FIELDS = ["id", "billno", "ExpContractNo", "insideorderno", "CnColor", "QtyUnit", "Num", "outdate", "FDate", "indate",
  "DeliveryDate", "styleNum", "trimnum", "ycyNum", "UsableNum", "Overfilled", "Bgrade"] as const;
export type GarmentSourceField = { state: "known"; raw: string } | { state: "unknown"; reason: "missing" | "null" | "blank" };
type UnknownField = Extract<GarmentSourceField, { state: "unknown" }>;
export type GarmentQuantity = UnknownField | { state: "known"; raw: string; value: string } | { state: "invalid"; raw: string; reason: "invalid_decimal" };
export type GarmentBusinessDate = UnknownField | { state: "known"; raw: string; value: string } | { state: "invalid"; raw: string; reason: "invalid_date" };

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
  // Source date-only values are civil dates, never converted through local time.
  const raw = field.raw, value = raw.trim();
  const valid = /^\d{4}-\d{2}-\d{2}$/u.test(value) && value >= "1900-01-01" && value <= "9999-12-31"
    && Number.isFinite(Date.parse(value + "T00:00:00.000Z")) && new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
  return valid ? { ...field, value } : { state: "invalid", raw, reason: "invalid_date" };
}

export type GarmentColorMatch = { state: "matched"; orderColorId: string; orderColorName: string }
  | { state: "missing_source_color" | "unmatched" | "ambiguous" };
export type GarmentReadRow = {
  observationId: string; sourceRecordId: string;
  trace: { captureId: string; page: number; rowIndex: number; rawResponseSha256: string; rowContentHash: string; stableBusinessEventIdentity: "unverified" };
  fields: Record<typeof GARMENT_VISIBLE_FIELDS[number], GarmentSourceField>;
  quantity: GarmentQuantity; businessDate: GarmentBusinessDate;
  quantityMeaning: "this_row_garment_outstore"; businessDateMeaning: "source_outdate"; colorMatch: GarmentColorMatch;
};
export type GarmentCaptureTrace = { pass: number; captureId: string; page: number; capturedAt: string; rawResponseSha256: string; rowCount: number;
  pagingEvidence?: GarmentFirstPageEvidence };
export type GarmentEmptyStatus = "not_applicable" | "not_connected" | "not_captured" | "identity_changed";
export type GarmentEmptyView = { schemaVersion: "order-garment-shipments.v1"; salesOrderId: string; sourceReportId: "6086979"; sourceStatus: GarmentEmptyStatus; rows: [] };
export type GarmentObservedView = {
  schemaVersion: "order-garment-shipments.v1"; reportId: "6086979"; salesOrderId: string; sourceReportId: "6086979";
  sourceStatus: "observed" | "observed_empty"; snapshotId: string; publicationId: string; generation: number;
  sourceFingerprint: string; salesContractNo: string; observedFrom: string; observedThrough: string; evaluatedAt: string; expiresAt: string;
  freshness: "fresh" | "stale"; targetPolicyChanged: boolean; colorBasisChanged: boolean;
  trace: GarmentCaptureTrace[]; rows: GarmentReadRow[];
  completeness: { queryRows: number; pagesPerPass: number; consistency: "two_pass_query_observation_not_transaction";
    allCompanyRecordsRead: false; contractFilterExecution: "requires_separate_verification" };
  aggregation: "none_observations_not_event_ledger"; disappearanceMeaning: "unknown_not_cancellation"; closingAdoption: "not_performed";
};
export type GarmentReadView = GarmentEmptyView | GarmentObservedView;
export type GarmentHistoryRecord = { publicationId: string; generation: number; observedFrom: string; observedThrough: string; rowCount: number; colorBasisHash: string };
export type GarmentHistory = { salesOrderId: string; records: GarmentHistoryRecord[]; nextBeforeGeneration: number | null;
  validation?: "immutable_summary_detail_verified_on_open" };
export type TimedGarmentView = { status: "empty"; model: GarmentEmptyView }
  | { status: "observed"; model: GarmentObservedView; receivedAt: number; deadline: number };

export const GARMENT_EMPTY_LABELS: Record<GarmentEmptyStatus, string> = {
  not_applicable: "加工订单不适用艾诺科成衣出货来源。",
  not_connected: "成衣出货来源尚未接通。",
  not_captured: "此合同尚无已核对的成衣出货观察。",
  identity_changed: "来源关联已有变化，需要重新核对后读取。",
};

import { createHash } from "node:crypto";
import { CANDIDATE_FIELDS } from "./payment-request-fields.js";

type RecordValue = Record<string, unknown>;
export type PaymentSourceField =
  | { state: "known"; raw: string }
  | { state: "unknown"; reason: "missing" | "null" | "blank" };
export type PaymentDecimal = PaymentSourceField
  | { state: "invalid"; raw: string; reason: "invalid_decimal" };
export type ConfirmedPaymentContext = {
  observationId: string;
  rowContentHash: string;
  purchaseContractNo: string;
  evidenceSha256: string;
  currency?: string;
  allocatedShipmentUnit?: string;
};
type Resolution = { state: "known"; value: string; evidenceSha256: string[] }
  | { state: "unknown"; reason: "not_verified" }
  | { state: "conflict"; values: string[]; evidenceSha256: string[] };
export class PaymentObservationError extends Error {
  constructor(readonly code: string) { super(code); this.name = "PaymentObservationError"; }
}
function fail(code: string): never { throw new PaymentObservationError(code); }
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const sha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const record = (value: unknown): RecordValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("payment_observation_invalid_shape");
  return value as RecordValue;
};
function textField(row: RecordValue, name: string): PaymentSourceField {
  if (!Object.hasOwn(row, name)) return { state: "unknown", reason: "missing" };
  const value = row[name];
  if (value === null) return { state: "unknown", reason: "null" };
  // Numbers must arrive as lossless source lexemes from the bridge extractor.
  if (typeof value !== "string" || value.length > 2048) fail("payment_observation_exact_strings_required");
  return value.trim() ? { state: "known", raw: value } : { state: "unknown", reason: "blank" };
}
function decimalField(row: RecordValue, name: string): PaymentDecimal {
  const field = textField(row, name);
  if (field.state !== "known") return field;
  const value = field.raw.trim();
  const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE]([+-]?[0-9]+))?$/u.exec(value);
  if (value.length > 256 || !match || Math.abs(Number(match[1] ?? 0)) > 1000)
    return { state: "invalid", raw: field.raw, reason: "invalid_decimal" };
  // Preserve zero, negative adjustments, scale and exponent. No amount arithmetic.
  return field;
}
const quantityFields = ["Num", "OutStoreNum", "bgNum", "kpNum"] as const;
const amountFields = ["Price", "cgGoodsAmount", "AdditionalPrice", "tzamount", "PayAmount",
  "YFAmount", "GoodsAmount", "gnsk", "gwsk", "BGAmount", "kpprice", "kpamount"] as const;
function values<T extends string>(row: RecordValue, names: readonly T[], decimal = false) {
  return Object.fromEntries(names.map(name => [name, decimal ? decimalField(row, name) : textField(row, name)])) as Record<T, PaymentDecimal>;
}
function resolution(values: Array<{ value: string; evidence: string }>): Resolution {
  if (!values.length) return { state: "unknown", reason: "not_verified" };
  const unique = [...new Set(values.map(item => item.value))].sort();
  const evidenceSha256 = [...new Set(values.map(item => item.evidence))].sort();
  return unique.length === 1 ? { state: "known", value: unique[0], evidenceSha256 }
    : { state: "conflict", values: unique, evidenceSha256 };
}

/** Internal pure projection. This is not an authorization boundary or an HTTP DTO.
 * Input is a checked, exact-string bridge page; confirmations are trusted server
 * evidence, never request-body claims. No IO, SO binding, totals or ledger events. */
export function projectPaymentRequestObservations(input: unknown, confirmations: readonly ConfirmedPaymentContext[] = []) {
  return { ...projectPaymentPage(input, confirmations, 1), schemaVersion: "ainuoke-payment-observations.v1" as const,
    scope: "fixed_first_page_observations" as const };
}

/** Separate pure contract-page contract. Never widens the fixed first-page reader. */
export function projectPaymentRequestContractPage(input: unknown, confirmations: readonly ConfirmedPaymentContext[] = []) {
  const result = projectPaymentPage(input, confirmations, 2);
  return { ...result, schemaVersion: "ainuoke-payment-page-observations.v2" as const,
    scope: "single_contract_page_observations" as const, page: record(input).page as number };
}

function projectPaymentPage(input: unknown, confirmations: readonly ConfirmedPaymentContext[], maxPage: 1 | 2) {
  const page = record(input);
  const keys = "capturedAt,page,pageSize,rawResponseSha256,reportId,reportedTotal,rows,schemaVersion,sourceFingerprint";
  if (Object.keys(page).sort().join(",") !== keys
    || page.schemaVersion !== (maxPage === 1 ? "ainuoke-payment-observation-page.v1" : "ainuoke-payment-observation-page.v2") || page.reportId !== "6086941"
    || !Number.isSafeInteger(page.page) || Number(page.page) < 1 || Number(page.page) > maxPage
    || page.pageSize !== 100 || !sha(page.sourceFingerprint) || !sha(page.rawResponseSha256)
    || typeof page.capturedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(page.capturedAt)
    || !Number.isFinite(Date.parse(page.capturedAt))
    || new Date(page.capturedAt).toISOString().slice(0, 10) !== page.capturedAt.slice(0, 10)
    || !Number.isSafeInteger(page.reportedTotal) || (page.reportedTotal as number) < 0
    || !Array.isArray(page.rows) || page.rows.length > 100 || page.rows.length > (page.reportedTotal as number))
    fail("payment_observation_invalid_page");
  if (maxPage === 2 && ((page.reportedTotal as number) > 200
    || (page.page as number) > Math.max(1, Math.ceil((page.reportedTotal as number) / 100))
    || page.rows.length !== Math.min(100, Math.max(0, (page.reportedTotal as number) - ((page.page as number) - 1) * 100))))
    fail("payment_observation_invalid_page");
  const captureId = digest(JSON.stringify(["6086941", page.sourceFingerprint, page.capturedAt,
    page.page, page.pageSize, page.rawResponseSha256]));
  const allowed = new Set(CANDIDATE_FIELDS);
  const rows = (page.rows as unknown[]).map((item, rowIndex) => {
    const row = record(item);
    if (Object.keys(row).some(key => !allowed.has(key))) fail("payment_observation_unknown_field");
    for (const key of Object.keys(row)) textField(row, key);
    const sourceFields = values(row, CANDIDATE_FIELDS);
    const rowContentHash = digest(JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]])));
    return {
      observationId: "6086941:" + captureId + ":" + rowIndex,
      trace: { reportId: "6086941" as const, sourceFingerprint: page.sourceFingerprint as string,
        capturedAt: page.capturedAt as string, rawResponseSha256: page.rawResponseSha256 as string,
        page: page.page as number, rowIndex, jsonPath: "dataList.rows[" + rowIndex + "]", rowContentHash,
        sourceRecordId: sourceFields.id, stableBusinessEventIdentity: "unverified" as const },
      sourceFields, quantities: values(row, quantityFields, true), amounts: values(row, amountFields, true),
      sourceUnits: { purchase: sourceFields.QtyUnit, customs: sourceFields.bgQtyUnit },
      quantityMeanings: { Num: "source_purchase_quantity", OutStoreNum: "application_allocated_material_shipment",
        bgNum: "source_customs_quantity", kpNum: "source_invoiced_quantity" } as const,
      purchaseContractCurrency: { state: "unknown", reason: "not_verified" } as Resolution,
      amountCurrencies: Object.fromEntries(amountFields.map(field => [field, { state: "unknown", reason: "not_verified" } as Resolution])) as Record<typeof amountFields[number], Resolution>,
      allocatedShipmentUnit: { state: "unknown", reason: "not_verified" } as Resolution,
      bankPaymentStatus: "not_inferred" as const,
    };
  });
  if (JSON.stringify(page).length > 8 * 1024 * 1024) fail("payment_observation_limit");
  if (!Array.isArray(confirmations) || confirmations.length > 200) fail("payment_observation_confirmation_limit");
  const byId = new Map(rows.map(row => [row.observationId, row]));
  const verified = new Map<string, ConfirmedPaymentContext[]>();
  for (const item of confirmations) {
    const value = record(item);
    if (Object.keys(value).some(key => !["observationId", "rowContentHash", "purchaseContractNo", "evidenceSha256", "currency", "allocatedShipmentUnit"].includes(key))
      || typeof value.observationId !== "string" || !sha(value.rowContentHash) || !sha(value.evidenceSha256)
      || typeof value.purchaseContractNo !== "string" || !value.purchaseContractNo.trim()
      || value.purchaseContractNo !== value.purchaseContractNo.trim()
      || value.currency === undefined && value.allocatedShipmentUnit === undefined)
      fail("payment_observation_invalid_confirmation");
    const row = byId.get(value.observationId as string);
    if (!row || row.trace.rowContentHash !== value.rowContentHash
      || row.sourceFields.PurContractNo.state !== "known"
      || row.sourceFields.PurContractNo.raw.trim() !== value.purchaseContractNo)
      fail("payment_observation_confirmation_mismatch");
    if (value.currency !== undefined && (typeof value.currency !== "string" || !/^(?:[A-Z]{3}|人民币)$/u.test(value.currency)))
      fail("payment_observation_invalid_currency");
    if (value.allocatedShipmentUnit !== undefined && (typeof value.allocatedShipmentUnit !== "string"
      || !value.allocatedShipmentUnit.trim() || value.allocatedShipmentUnit !== value.allocatedShipmentUnit.trim()
      || value.allocatedShipmentUnit.length > 30 || /[\u0000-\u001f\u007f]/u.test(value.allocatedShipmentUnit)))
      fail("payment_observation_invalid_unit");
    const group = verified.get(row.observationId) ?? [];
    group.push(item); verified.set(row.observationId, group);
  }
  for (const row of rows) {
    const facts = verified.get(row.observationId) ?? [];
    row.purchaseContractCurrency = resolution(facts.filter(item => item.currency !== undefined).map(item => ({
      value: item.currency === "RMB" || item.currency === "人民币" ? "CNY" : item.currency!,
      evidence: item.evidenceSha256,
    })));
    // D136 confirms these three amount qualifiers only. Customs, invoice,
    // advance and receipt amounts must not inherit a row-wide currency.
    for (const field of ["cgGoodsAmount", "PayAmount", "GoodsAmount"] as const)
      row.amountCurrencies[field] = row.purchaseContractCurrency;
    const unitFacts = facts.filter(item => item.allocatedShipmentUnit !== undefined).map(item => ({
      value: item.allocatedShipmentUnit!, evidence: item.evidenceSha256,
    }));
    // A confirmed allocation unit must not silently overwrite a contradictory source unit.
    if (unitFacts.length && row.sourceUnits.purchase.state === "known")
      unitFacts.push({ value: row.sourceUnits.purchase.raw.trim(), evidence: row.trace.rawResponseSha256 });
    row.allocatedShipmentUnit = resolution(unitFacts);
  }
  const repeatedGroups = (items: string[]) => {
    const counts = new Map<string, number>();
    for (const value of items) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.values()].filter(count => count > 1).length;
  };
  return {
    reportId: "6086941" as const, captureId,
    completeness: { returnedRows: rows.length, reportedTotal: page.reportedTotal as number,
      allVisibleRecordsRead: rows.length === page.reportedTotal, orderComplete: false as const },
    duplicateSourceIdGroups: repeatedGroups(rows.flatMap(row => row.trace.sourceRecordId.state === "known" ? [row.trace.sourceRecordId.raw] : [])),
    repeatedRowGroups: repeatedGroups(rows.map(row => row.trace.rowContentHash)),
    deduplication: "none_unverified_event_identity" as const, aggregation: "none" as const,
    sourceActivation: "not_activated" as const, rows,
  };
}

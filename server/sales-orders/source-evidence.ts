import {
  normalizeAinuokeSalesContractNo,
  type AinuokeSizeAllocation,
  type AinuokeSizeMatrixStatus,
} from "../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js";

type EvidenceFailure = "untrusted_source" | "unsupported_report" | "contract_mismatch"
  | "malformed_evidence" | "evidence_too_large" | "quantity_changed";
type UnavailableEvidence = { status: "not_recorded" | "not_applicable" }
  | { status: "invalid"; reason: EvidenceFailure };

export type SalesOrderColorSizeEvidence = UnavailableEvidence | {
  status: "available";
  reportId: "6087105";
  quantityPendingConfirmation: boolean;
  sourceQuantity: number | null;
  insideOrderNoDrift: boolean;
  sizeRule: string | null;
  allocations: AinuokeSizeAllocation[];
  matrixStatus: AinuokeSizeMatrixStatus;
};

export type SalesOrderColorSourceEvidence = UnavailableEvidence | {
  status: "recorded";
  reportId: "6087105";
  colorDetailStatus: "usable" | "missing" | "invalid";
  insideOrderNoDrift: boolean;
  /** Maximum saved Discovery/color batch time, not a per-color fetch or expiry. */
  savedSourceBatchAt: string | null;
};

export type OrderSourceEvidenceContext = {
  businessType: "ainuoke_contract" | "processing" | "unclassified";
  trustedSource: boolean;
  salesContractNo: string | null;
};

const MATRIX_STATUSES = new Set<AinuokeSizeMatrixStatus>([
  "SIZE_MATRIX_VALID", "SIZE_MATRIX_QUANTITY_MISMATCH", "SIZE_MATRIX_MISSING",
  "SIZE_MATRIX_RULE_OVERFLOW", "SIZE_RULE_MISSING", "ZERO_QUANTITY_WITHOUT_SIZE",
  "ZERO_QUANTITY_WITH_SIZE",
]);
// Read projection budgets, not ingestion/business limits. Refuse, never truncate.
const MAX_SIZE_SLOTS = 1024;
const MAX_RULE_CHARACTERS = 16384;
const MAX_SIZE_NAME_CHARACTERS = 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const invalid = (reason: EvidenceFailure): UnavailableEvidence => ({ status: "invalid", reason });

function unavailable(context: OrderSourceEvidenceContext): UnavailableEvidence | null {
  if (context.businessType === "processing") return { status: "not_applicable" };
  if (context.businessType !== "ainuoke_contract" || !context.trustedSource
    || !context.salesContractNo) return invalid("untrusted_source");
  return null;
}

/** Saved metadata is untrusted JSON, not a public DTO or a new source adapter. */
export function projectColorSizeEvidence(
  metadata: unknown,
  persistedQuantity: number,
  context: OrderSourceEvidenceContext,
): SalesOrderColorSizeEvidence {
  const absent = unavailable(context);
  if (absent) return absent;
  if (metadata === null || metadata === undefined) return { status: "not_recorded" };
  if (!record(metadata)) return invalid("malformed_evidence");
  const keys = ["reportId", "salesContractNo", "sizeRule", "sizeAllocations",
    "sizeMatrixStatus", "quantityPendingConfirmation", "sourceQuantity"];
  if (!keys.some(key => Object.hasOwn(metadata, key))) return { status: "not_recorded" };
  if (metadata.reportId !== "6087105") return invalid("unsupported_report");
  if (typeof metadata.salesContractNo !== "string"
    || normalizeAinuokeSalesContractNo(metadata.salesContractNo)
      !== normalizeAinuokeSalesContractNo(context.salesContractNo)) return invalid("contract_mismatch");
  if (typeof metadata.quantityPendingConfirmation !== "boolean"
    || typeof metadata.insideOrderNoDrift !== "boolean"
    || !nonNegative(persistedQuantity)
    || !(metadata.sizeRule === null || typeof metadata.sizeRule === "string")
    || typeof metadata.sizeMatrixStatus !== "string"
    || !MATRIX_STATUSES.has(metadata.sizeMatrixStatus as AinuokeSizeMatrixStatus)
    || !Array.isArray(metadata.sizeAllocations)) return invalid("malformed_evidence");
  const rule = metadata.sizeRule;
  if ((rule?.length ?? 0) > MAX_RULE_CHARACTERS
    || metadata.sizeAllocations.length > MAX_SIZE_SLOTS) return invalid("evidence_too_large");
  const tokens = rule ? rule.normalize("NFKC").trim().split(/[,，]/u).map(name => name.normalize("NFKC").trim()) : [];
  if (tokens.length > MAX_SIZE_SLOTS) return invalid("evidence_too_large");
  const namedSlots = tokens.flatMap((sizeName, index) => sizeName ? [{ slot: index + 1, sizeName }] : []);
  if (namedSlots.length !== metadata.sizeAllocations.length) return invalid("malformed_evidence");
  const allocations: AinuokeSizeAllocation[] = [];
  for (const [index, value] of metadata.sizeAllocations.entries()) {
    if (!record(value) || !Number.isSafeInteger(value.slot) || value.slot !== namedSlots[index].slot
      || typeof value.sizeName !== "string" || value.sizeName.normalize("NFKC").trim() !== namedSlots[index].sizeName
      || !(value.quantity === null || nonNegative(value.quantity))
      || (Number(value.slot) > 26 && value.quantity !== null)) return invalid("malformed_evidence");
    if (value.sizeName.length > MAX_SIZE_NAME_CHARACTERS) return invalid("evidence_too_large");
    allocations.push({ slot: value.slot as number, sizeName: value.sizeName, quantity: value.quantity });
  }
  if (metadata.quantityPendingConfirmation) {
    if (metadata.sourceQuantity !== null || persistedQuantity !== 0
      || allocations.some(value => value.quantity !== null)) return invalid("malformed_evidence");
  } else {
    if (!nonNegative(metadata.sourceQuantity)) return invalid("malformed_evidence");
    if (metadata.sourceQuantity !== persistedQuantity) return invalid("quantity_changed");
  }
  return {
    status: "available", reportId: "6087105",
    quantityPendingConfirmation: metadata.quantityPendingConfirmation,
    sourceQuantity: metadata.sourceQuantity as number | null,
    insideOrderNoDrift: metadata.insideOrderNoDrift,
    sizeRule: rule,
    allocations,
    // The saved projection lacks all 26 raw slots; do not recompute this status.
    matrixStatus: metadata.sizeMatrixStatus as AinuokeSizeMatrixStatus,
  };
}

/** Color absence must retain the saved missing/invalid distinction without raw rows. */
export function projectColorSourceEvidence(
  metadata: unknown,
  savedSourceBatchAt: Date | string | null,
  context: OrderSourceEvidenceContext,
): SalesOrderColorSourceEvidence {
  const absent = unavailable(context);
  if (absent) return absent;
  if (metadata === null || metadata === undefined) return { status: "not_recorded" };
  if (!record(metadata)) return invalid("malformed_evidence");
  if (metadata.reportId !== "6087105") return invalid("unsupported_report");
  if (metadata.schemaVersion !== "ainuoke-garment-color-size.v1"
    || typeof metadata.status !== "string" || !["usable", "missing", "invalid"].includes(metadata.status)
    || typeof metadata.insideOrderNoDrift !== "boolean") return invalid("malformed_evidence");
  const timestamp = savedSourceBatchAt === null ? null : new Date(savedSourceBatchAt);
  if (timestamp && !Number.isFinite(timestamp.getTime())) return invalid("malformed_evidence");
  return {
    status: "recorded", reportId: "6087105",
    colorDetailStatus: metadata.status as "usable" | "missing" | "invalid",
    insideOrderNoDrift: metadata.insideOrderNoDrift,
    savedSourceBatchAt: timestamp?.toISOString() ?? null,
  };
}

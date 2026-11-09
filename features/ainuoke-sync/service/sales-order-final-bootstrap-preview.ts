import type {
  AinuokeOrderDiscoveryRow,
  AinuokeOrderDiscoverySnapshot,
  AinuokeOrderDiscoveryQuery,
  AinuokeReportSnapshot,
  AinuokeSourceRow,
} from "../../ainuoke-api/model/ainuoke-api.ts";
import type { AinuokeColorMirrorInput, AinuokeContractMirrorInput } from "../../../server/sales-orders/model.ts";
import {
  normalizeAinuokeSalesContractNo,
  type AinuokeGarmentColorDetailStatus,
  type AinuokeGarmentColorSizeSource,
} from "../source/ainuoke-garment-color-size-adapter.ts";

export const FINAL_SALES_ORDER_NUMBER_POLICY = "SERVER_GENERATED_SO_SEQUENCE" as const;

export type FinalSalesOrderBootstrapDetail = {
  salesContractNo: string;
  pages: number;
  source?: AinuokeGarmentColorSizeSource;
  error?: string;
};

export type FinalSalesOrderBootstrapCandidate = {
  sequence: number;
  source: AinuokeContractMirrorInput;
  colors: AinuokeColorMirrorInput[];
  colorDetailStatus: AinuokeGarmentColorDetailStatus;
};

export type FinalSalesOrderBootstrapSnapshot = {
  beforeTotal: number;
  afterTotal: number;
  beforeHash: string;
  afterHash: string;
  addedBillNos: string[];
  removedBillNos: string[];
  changedIdentityCount: number;
  stable: boolean;
};

export type FinalSalesOrderBootstrapPreview = {
  schemaVersion: "sales-order-final-bootstrap-preview.v2";
  orderNoPolicy: typeof FINAL_SALES_ORDER_NUMBER_POLICY;
  discovery: {
    total: number;
    pages: number;
    statusDistribution: Array<{ status: string; count: number }>;
  };
  queries: { total: number; successful: number; failed: number; pages: number };
  coverage: { exactOrders: number; missing: number; invalid: number; usable: number };
  identity: { insideOrderNoDriftCount: number };
  colorQuantityParity: { equal: number; lower: number; higher: number };
  candidates: FinalSalesOrderBootstrapCandidate[];
  snapshot: FinalSalesOrderBootstrapSnapshot;
  previewHash: string;
  readyForDisposablePostgres: boolean;
};

type RawDiscoveryRow = {
  snapshot: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>;
  row: AinuokeSourceRow;
};

const normalizeText = (value: unknown): string => String(value ?? "").normalize("NFKC").trim();
const normalizeIdentity = (value: unknown): string => normalizeText(value).toLocaleUpperCase("en-US");

function optionalDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const dateOnly = raw.match(/^\d{4}-\d{2}-\d{2}/u)?.[0];
  if (dateOnly) return Number.isFinite(Date.parse(dateOnly)) && new Date(dateOnly).toISOString().slice(0,10) === dateOnly ? dateOnly : null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function sourceQuantity(value: unknown): number | null {
  if (value === null || value === undefined || normalizeText(value) === '') return null;
  const parsed = typeof value === "number" ? value : Number(normalizeText(value).replaceAll(",", ""));
  // Keep the real contract even when its not-yet-final quantity is unusable.
  // Raw evidence is retained; null never becomes an invented business zero.
  if (typeof value==='boolean'||!Number.isFinite(parsed)||parsed<0||parsed>Number.MAX_SAFE_INTEGER)return null;
  return parsed;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertUniqueNonEmpty(values: readonly string[], label: string): void {
  if (values.some((value) => !value)) throw new Error(`${label} contains blank identity`);
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate identity`);
}

function rawDiscoveryIndex(
  snapshots: ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>,
): Map<string, RawDiscoveryRow> {
  const result = new Map<string, RawDiscoveryRow>();
  for (const snapshot of snapshots) for (const row of snapshot.rows) {
    const sourceId = normalizeText(row.values.id);
    if (!sourceId || result.has(sourceId)) throw new Error("Discovery raw sourceId is blank or duplicated");
    result.set(sourceId, { snapshot, row });
  }
  return result;
}

function identitySignature(row: AinuokeOrderDiscoveryRow): string {
  return [row.sourceId, row.sourceRowIdentity, normalizeIdentity(row.insideOrderNo)].join("\u0000");
}

export function compareFinalSalesOrderBootstrapSnapshots(
  before: AinuokeOrderDiscoverySnapshot,
  after: AinuokeOrderDiscoverySnapshot,
): FinalSalesOrderBootstrapSnapshot {
  const beforeBillNos = before.rows.map((row) => normalizeAinuokeSalesContractNo(row.salesContractNo));
  const afterBillNos = after.rows.map((row) => normalizeAinuokeSalesContractNo(row.salesContractNo));
  assertUniqueNonEmpty(beforeBillNos, "Discovery before BillNo");
  assertUniqueNonEmpty(afterBillNos, "Discovery after BillNo");
  const beforeByBillNo = new Map(before.rows.map((row) => [normalizeAinuokeSalesContractNo(row.salesContractNo), row]));
  const afterByBillNo = new Map(after.rows.map((row) => [normalizeAinuokeSalesContractNo(row.salesContractNo), row]));
  const addedBillNos = [...afterByBillNo.keys()].filter((billNo) => !beforeByBillNo.has(billNo)).sort();
  const removedBillNos = [...beforeByBillNo.keys()].filter((billNo) => !afterByBillNo.has(billNo)).sort();
  const changedIdentityCount = [...beforeByBillNo].filter(([billNo, row]) => {
    const afterRow = afterByBillNo.get(billNo);
    return afterRow && identitySignature(afterRow) !== identitySignature(row);
  }).length;
  return {
    beforeTotal: before.total,
    afterTotal: after.total,
    beforeHash: before.snapshotHash,
    afterHash: after.snapshotHash,
    addedBillNos,
    removedBillNos,
    changedIdentityCount,
    stable: before.total === after.total
      && before.snapshotHash === after.snapshotHash
      && addedBillNos.length === 0
      && removedBillNos.length === 0
      && changedIdentityCount === 0,
  };
}

function sanitizedColorReconciliation(source: AinuokeGarmentColorSizeSource) {
  return {
    schemaVersion: source.schemaVersion,
    reportId: source.reportId,
    status: source.colorDetailStatus,
    sourceHash: source.sourceHash,
    upstreamRows: source.upstreamRows,
    exactRows: source.exactRows,
    containsFalsePositiveRows: source.containsFalsePositiveRows,
    detailInsideOrderNos: source.detailInsideOrderNos,
    insideOrderNoDrift: source.insideOrderNoDrift,
    issues: source.issues.map((issue) => ({ code: issue.code, sourceRowIdentity: issue.sourceRowIdentity })),
    sizeEvidence: source.rows.map((row) => ({
      sourceRowIdentity: row.sourceRowIdentity,
      sizeRule: row.sizeRuleRaw,
      sizeAllocations: row.sizeAllocations,
      sizeMatrixStatus: row.sizeMatrixStatus,
      sizeQuantityTotal: row.sizeQuantityTotal,
      quantityPendingConfirmation: row.quantityPendingConfirmation === true,
      sourceQuantity: row.quantityPendingConfirmation ? null : row.quantity,
    })),
  };
}

async function mapColors(source: AinuokeGarmentColorSizeSource): Promise<AinuokeColorMirrorInput[]> {
  if (source.colorDetailStatus !== "usable") return [];
  return Promise.all(source.usableRows.map(async (row) => {
    if (row.quantity === null) throw new Error(`${source.requestedSalesContractNo} usable color has null quantity`);
    const sourceHash = await sha256Hex(JSON.stringify({
      sourceRowIdentity: row.sourceRowIdentity,
      billNo: normalizeAinuokeSalesContractNo(row.salesContractNo),
      insideOrderNo: normalizeIdentity(row.insideOrderNo),
      styleNo: normalizeIdentity(row.styleNo),
      colorName: normalizeIdentity(row.colorName),
      quantity: row.quantity,
      ...(row.quantityPendingConfirmation ? { quantityPendingConfirmation: true, sourceQuantity: null } : {}),
      deliveryDate: row.deliveryDate,
      sizeRuleTokens: row.sizeRuleTokens,
      sizeAllocations: row.sizeAllocations,
    }));
    return {
      sourceLineIdentity: row.sourceRowIdentity,
      colorName: row.colorName,
      quantity: row.quantity,
      deliveryDate: row.deliveryDate,
      sourceHash,
      sourceMetadata: {
        quantityPendingConfirmation: row.quantityPendingConfirmation === true,
        sourceQuantity: row.quantityPendingConfirmation ? null : row.quantity,
        reportId: source.reportId,
        salesContractNo: source.requestedSalesContractNo,
        insideOrderNoDrift: row.insideOrderNoDrift,
        sizeRule: row.sizeRuleRaw,
        sizeAllocations: row.sizeAllocations,
        sizeMatrixStatus: row.sizeMatrixStatus,
      },
    };
  }));
}

async function mapCandidate(
  sequence: number,
  discovery: AinuokeOrderDiscoveryRow,
  raw: RawDiscoveryRow,
  colorSource: AinuokeGarmentColorSizeSource | null,
): Promise<FinalSalesOrderBootstrapCandidate> {
  if (raw.row.sourceRowIdentity !== discovery.sourceRowIdentity) throw new Error(`${discovery.salesContractNo} raw Discovery identity mismatch`);
  if (colorSource && normalizeAinuokeSalesContractNo(colorSource.requestedSalesContractNo) !== normalizeAinuokeSalesContractNo(discovery.salesContractNo)) {
    throw new Error(`${discovery.salesContractNo} 6087105 requested BillNo mismatch`);
  }
  const source: AinuokeContractMirrorInput = {
    sourceId: discovery.sourceId,
    sourceRowIdentity: discovery.sourceRowIdentity,
    salesContractNo: discovery.salesContractNo,
    insideOrderNo: discovery.insideOrderNo,
    lifecycleStatusRaw: discovery.lifecycleStatusRaw,
    contractDate: optionalDate(raw.row.values.ContractDate),
    contractDeliveryDate: optionalDate(raw.row.values.DeliveryDate),
    styleNo: discovery.styleNo,
    companyNameSnapshot: normalizeText(raw.row.values.CompanyName),
    customerNameSnapshot: normalizeText(raw.row.values.CustomerName),
    brandNameSnapshot: normalizeText(raw.row.values.Brand),
    quantity: sourceQuantity(raw.row.values.Num),
    sourceHash: await sha256Hex(JSON.stringify({
      sourceRowIdentity: discovery.sourceRowIdentity,
      sourceId: discovery.sourceId,
      salesContractNo: normalizeAinuokeSalesContractNo(discovery.salesContractNo),
      insideOrderNo: normalizeIdentity(discovery.insideOrderNo),
      lifecycleStatusRaw: discovery.lifecycleStatusRaw,
      contractDate: optionalDate(raw.row.values.ContractDate),
      contractDeliveryDate: optionalDate(raw.row.values.DeliveryDate),
      styleNo: normalizeIdentity(discovery.styleNo),
      quantity: sourceQuantity(raw.row.values.Num),
    })),
    fetchedAt: colorSource ? [raw.snapshot.fetchedAt, colorSource.fetchedAt].sort().at(-1)! : raw.snapshot.fetchedAt,
    sourceMetadata: {
      reportId: "6086103",
      missingFields: Object.entries({insideOrderNo:discovery.insideOrderNo,styleNo:discovery.styleNo,
        customerName:normalizeText(raw.row.values.CustomerName),quantity:sourceQuantity(raw.row.values.Num),
        contractDate:optionalDate(raw.row.values.ContractDate),contractDeliveryDate:optionalDate(raw.row.values.DeliveryDate)})
        .filter(([,value])=>value===null||value==='').map(([field])=>field),
      snapshotHash: raw.snapshot.snapshotHash,
      visibilityScope: "current_account_visible",
      colorDetail: colorSource ? sanitizedColorReconciliation(colorSource) : {status:'missing',queried:false,reason:'not_fetched'},
    },
  };
  return {
    sequence,
    source,
    colors: colorSource ? await mapColors(colorSource) : [],
    colorDetailStatus: colorSource?.colorDetailStatus ?? 'missing',
  };
}

/** A complete, validated contract directory is enough to establish an order.
 * Absent colour evidence is explicitly unrequested, never a fabricated empty report. */
export async function mapDirectorySalesOrderCandidate(row:AinuokeOrderDiscoveryRow,
 snapshots:ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>) {
 const raw=rawDiscoveryIndex(snapshots).get(row.sourceId);
 if(!raw)throw Error('Directory source evidence missing');
 return mapCandidate(1,row,raw,null);
}

function canonicalPreviewPayload(preview: Omit<FinalSalesOrderBootstrapPreview, "previewHash">) {
  return {
    schemaVersion: preview.schemaVersion,
    orderNoPolicy: preview.orderNoPolicy,
    discovery: preview.discovery,
    queries: preview.queries,
    coverage: preview.coverage,
    identity: preview.identity,
    colorQuantityParity: preview.colorQuantityParity,
    candidates: preview.candidates.map((candidate) => ({
      sequence: candidate.sequence,
      colorDetailStatus: candidate.colorDetailStatus,
      sourceId: candidate.source.sourceId,
      sourceRowIdentity: candidate.source.sourceRowIdentity,
      salesContractNo: candidate.source.salesContractNo,
      insideOrderNo: candidate.source.insideOrderNo,
      lifecycleStatusRaw: candidate.source.lifecycleStatusRaw,
      contractDate: candidate.source.contractDate,
      contractDeliveryDate: candidate.source.contractDeliveryDate,
      styleNo: candidate.source.styleNo,
      quantity: candidate.source.quantity,
      sourceHash: candidate.source.sourceHash,
      colorLines: candidate.colors.map((color) => ({
        sourceLineIdentity: color.sourceLineIdentity,
        colorName: color.colorName,
        quantity: color.quantity,
        deliveryDate: color.deliveryDate,
        sourceHash: color.sourceHash,
      })),
    })),
    snapshot: preview.snapshot,
  };
}

/** Reuse the formal contract/color mapper for an explicitly selected addition set. */
export async function mapSelectedFinalSalesOrderCandidates(input: {
  discovery: AinuokeOrderDiscoverySnapshot;
  discoveryRawSnapshots: ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>;
  details: ReadonlyArray<FinalSalesOrderBootstrapDetail>;
  selectedBillNos: readonly string[];
}): Promise<FinalSalesOrderBootstrapCandidate[]> {
  const selected = input.selectedBillNos.map(normalizeAinuokeSalesContractNo).sort();
  assertUniqueNonEmpty(selected, "Selected BillNo");
  if (!selected.length || selected.length > 25) throw new Error("Selected addition scope invalid");
  const detailKeys = input.details.map(detail => normalizeAinuokeSalesContractNo(detail.salesContractNo)).sort();
  assertUniqueNonEmpty(detailKeys, "Selected 6087105 detail BillNo");
  if (JSON.stringify(detailKeys) !== JSON.stringify(selected)) throw new Error("Selected color detail scope mismatch");
  const discoveryRows = new Map(input.discovery.rows.map(row => [normalizeAinuokeSalesContractNo(row.salesContractNo), row]));
  const details = new Map(input.details.map(detail => [normalizeAinuokeSalesContractNo(detail.salesContractNo), detail]));
  const raw = rawDiscoveryIndex(input.discoveryRawSnapshots);
  return Promise.all(selected.map((billNo, index) => {
    const row = discoveryRows.get(billNo);
    const source = row && raw.get(row.sourceId);
    const detail = details.get(billNo);
    if (!row || !source || !detail?.source || detail.error) throw new Error("Selected source evidence missing");
    return mapCandidate(index + 1, row, source, detail.source);
  }));
}

export async function buildFinalSalesOrderBootstrapPreview(input: {
  discoveryBefore: AinuokeOrderDiscoverySnapshot;
  discoveryAfter: AinuokeOrderDiscoverySnapshot;
  discoveryRawSnapshots: ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>;
  details: ReadonlyArray<FinalSalesOrderBootstrapDetail>;
}): Promise<FinalSalesOrderBootstrapPreview> {
  const rows = [...input.discoveryBefore.rows].sort((left, right) =>
    normalizeAinuokeSalesContractNo(left.salesContractNo).localeCompare(normalizeAinuokeSalesContractNo(right.salesContractNo)));
  const billNos = rows.map((row) => normalizeAinuokeSalesContractNo(row.salesContractNo));
  assertUniqueNonEmpty(billNos, "Discovery BillNo");
  const detailKeys = input.details.map((detail) => normalizeAinuokeSalesContractNo(detail.salesContractNo));
  assertUniqueNonEmpty(detailKeys, "6087105 detail BillNo");
  const detailsByBillNo = new Map(input.details.map((detail) => [normalizeAinuokeSalesContractNo(detail.salesContractNo), detail]));
  if (detailsByBillNo.size !== rows.length) throw new Error("6087105 detail coverage does not match Discovery BillNo set");
  const failed = input.details.filter((detail) => detail.error || !detail.source);
  if (failed.length) throw new Error(`6087105 detail queries failed: ${failed.length}`);
  const rawBySourceId = rawDiscoveryIndex(input.discoveryRawSnapshots);
  const candidates = await Promise.all(rows.map(async (row, index) => {
    const raw = rawBySourceId.get(row.sourceId);
    const detail = detailsByBillNo.get(normalizeAinuokeSalesContractNo(row.salesContractNo));
    if (!raw || !detail?.source) throw new Error(`${row.salesContractNo} source evidence missing`);
    return mapCandidate(index + 1, row, raw, detail.source);
  }));
  const coverage = { exactOrders: 0, missing: 0, invalid: 0, usable: 0 };
  const parity = { equal: 0, lower: 0, higher: 0 };
  let drift = 0;
  for (const candidate of candidates) {
    coverage[candidate.colorDetailStatus] += 1;
    const detail = detailsByBillNo.get(normalizeAinuokeSalesContractNo(candidate.source.salesContractNo))!.source!;
    if (detail.exactRows > 0) coverage.exactOrders += 1;
    if (detail.insideOrderNoDrift) drift += 1;
    if (candidate.colorDetailStatus === "usable") {
      if(candidate.source.quantity===null)continue;
      const difference = candidate.colors.reduce((sum, color) => sum + color.quantity, 0) - candidate.source.quantity;
      if (difference === 0) parity.equal += 1;
      else if (difference < 0) parity.lower += 1;
      else parity.higher += 1;
    }
  }
  const statuses = new Map<string, number>();
  for (const row of rows) statuses.set(row.lifecycleStatusRaw, (statuses.get(row.lifecycleStatusRaw) ?? 0) + 1);
  const snapshot = compareFinalSalesOrderBootstrapSnapshots(input.discoveryBefore, input.discoveryAfter);
  const base: Omit<FinalSalesOrderBootstrapPreview, "previewHash"> = {
    schemaVersion: "sales-order-final-bootstrap-preview.v2",
    orderNoPolicy: FINAL_SALES_ORDER_NUMBER_POLICY,
    discovery: {
      total: rows.length,
      pages: input.discoveryBefore.pageCount,
      statusDistribution: [...statuses].sort(([left], [right]) => left.localeCompare(right, "zh-CN")).map(([status, count]) => ({ status, count })),
    },
    queries: {
      total: input.details.length,
      successful: input.details.length,
      failed: 0,
      pages: input.details.reduce((sum, detail) => sum + detail.pages, 0),
    },
    coverage,
    identity: { insideOrderNoDriftCount: drift },
    colorQuantityParity: parity,
    candidates,
    snapshot,
    readyForDisposablePostgres: snapshot.stable && candidates.length === rows.length,
  };
  return { ...base, previewHash: await sha256Hex(JSON.stringify(canonicalPreviewPayload(base))) };
}

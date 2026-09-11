import type { AinuokeOrderDiscoverySnapshot } from "../../ainuoke-api/model/ainuoke-api.ts";
import {
  normalizeAinuokeInsideOrderNo,
  normalizeAinuokeSalesContractNo,
  type AinuokeGarmentColorSizeRow,
  type AinuokeGarmentColorSizeSource,
} from "../source/ainuoke-garment-color-size-adapter.ts";
import { compareSalesOrderBootstrapSnapshots, type SalesOrderBootstrapSnapshotStability } from "./sales-order-bootstrap-preview.ts";

export const PHASE_2B2_OLD_BLOCKER_INSIDE_ORDER_NOS = [
  "0924/904(37438-N)",
  "4190/288(37993-N)",
  "6221/227(38361-N)",
  "T1826-4",
  "T1825-1",
  "T2073",
  "7892W",
  "7894T",
  "1230/227-10(39623-N)",
  "8075-1",
  "1917U",
  "3298/226-3(46026-N)",
  "8828",
  "TOWW26PBCUI",
  "4091",
  "1053914-2",
  "7759/332(66046-N+66045-N)",
  "5471-1",
  "9017C",
  "T2403",
  "T2397",
  "2276C",
  "7621/226-1(66540-N)",
  "3923",
  "9199/226(66591-N)",
  "9200/226(66645-N)",
  "D1992",
  "1864",
  "4317",
  "3298/226-2(29326-N)",
  "1400/332-16(38312-N )",
  "T1829-2",
  "T1795-2",
  "T2017-2",
] as const;

export const PHASE_2B2_1_MISSING_SALES_CONTRACT_NOS = [
  "PI2608-257",
  "PI2608-069",
  "PI2608-026",
  "PI2608-006",
  "PI2607-293",
  "PI2607-246",
  "PI2603-127",
  "PI2512-121",
] as const;

export type AinuokeGarmentColorSizeContractFact = {
  insideOrderNo: string;
  salesContractNo: string;
  styleNo: string;
  quantity: number;
  lifecycleStatusRaw?: string;
  contractDate?: string | null;
  deliveryDate?: string | null;
  contractAgeDays?: number | null;
};

export type AinuokeGarmentColorSizeValidationDetail = {
  insideOrderNo: string;
  salesContractNo: string;
  pages: number;
  source?: AinuokeGarmentColorSizeSource;
  error?: string;
};

export type AinuokeOldBlockerDisposition = "resolved" | "still_missing" | "invalid" | "quantity_warning_only";

export type AinuokeOldBlockerComparison = {
  insideOrderNo: string;
  salesContractNo: string;
  styleNo: string;
  contractQuantity: number;
  exactRows: number;
  usableColors: number;
  colorQuantity: number;
  quantityDifference: number | null;
  sizeRulePresent: "YES" | "NO" | "PARTIAL";
  sizeMatrixStatuses: string[];
  duplicateSourceIdentityGroups: number;
  detailInsideOrderNos: string[];
  insideOrderNoDrift: boolean;
  disposition: AinuokeOldBlockerDisposition;
};

export type AinuokeGarmentColorSizeValidationReport = {
  schemaVersion: "ainuoke-garment-color-size-validation.v1";
  snapshot: SalesOrderBootstrapSnapshotStability;
  discovery: { total: number; pageCount: number; statusDistribution: Array<{ status: string; count: number }> };
  queries: { total: number; successful: number; failed: number; pages: number };
  coverage: { exactMatchOrders: number; noExactDetailOrders: number; exactRows: number; containsFalsePositiveRows: number };
  identity: {
    duplicateCanonicalIdentityGroups: number;
    duplicateUsableSourceIdentityGroups: number;
    crossOrderContaminationRows: number;
    billNoMismatchRows: number;
    ordersWithInsideOrderNoDrift: number;
    insideOrderNoDriftExamples: Array<{
      salesContractNo: string;
      discoveryInsideOrderNo: string;
      detailInsideOrderNos: string[];
    }>;
    goodsNoMismatchRows: number;
  };
  colors: { usableOrders: number; blankRows: number; invalidQuantityRows: number; zeroQuantityRows: number; sameColorRepeatedOrders: number };
  colorVsContractQuantity: { equal: number; lower: number; higher: number };
  sizeRule: {
    rowsPresent: number;
    rowsMissing: number;
    distinctPatterns: number;
    tokenCountMin: number | null;
    tokenCountMax: number | null;
    tokenCountDistribution: Array<{ tokenCount: number; rows: number }>;
  };
  sizeMatrix: {
    highestWithinRule: number;
    highestBeyondRule: number;
    positiveValid: number;
    positiveQuantityMismatch: number;
    positiveMissingAllocation: number;
    zeroWithSize: number;
    zeroWithoutSize: number;
    ordersWithMultipleSizeRulePatterns: number;
  };
  po: { nonEmptyOrders: number; nonEmptyRows: number; inconsistentOrders: number };
  deliveryDate: { presentOrders: number; presentRows: number; multipleDatesOrders: number };
  oldBlockers: {
    rows: AinuokeOldBlockerComparison[];
    resolved: number;
    stillMissing: number;
    invalid: number;
    warningOnly: number;
  };
  formerMissing: {
    rows: AinuokeOldBlockerComparison[];
    resolved: number;
    stillMissing: number;
    invalid: number;
    warningOnly: number;
  };
};

const normalizeText = (value: unknown): string => String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en-US");

function repeatedGroupCount(values: string[]): number {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].filter((count) => count > 1).length;
}

function repeatedOrderCount(sources: AinuokeGarmentColorSizeSource[], select: (row: AinuokeGarmentColorSizeRow) => string | null): number {
  return sources.filter((source) => {
    const values = source.rows.map(select).filter((value): value is string => Boolean(value));
    return repeatedGroupCount(values) > 0;
  }).length;
}

function multipleDistinctOrderCount(sources: AinuokeGarmentColorSizeSource[], select: (row: AinuokeGarmentColorSizeRow) => string | null): number {
  return sources.filter((source) => new Set(source.rows.map(select).filter((value): value is string => Boolean(value))).size > 1).length;
}

function statusDistribution(snapshot: AinuokeOrderDiscoverySnapshot): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of snapshot.rows) counts.set(row.lifecycleStatusRaw, (counts.get(row.lifecycleStatusRaw) ?? 0) + 1);
  return [...counts].sort(([left], [right]) => left.localeCompare(right, "zh-CN")).map(([status, count]) => ({ status, count }));
}

function sourceByContract(details: ReadonlyArray<AinuokeGarmentColorSizeValidationDetail>): Map<string, AinuokeGarmentColorSizeSource> {
  return new Map(details.flatMap((detail) => detail.source
    ? [[normalizeAinuokeSalesContractNo(detail.salesContractNo), detail.source] as const]
    : []));
}

function oldBlockerComparison(
  insideOrderNo: string,
  contracts: Map<string, AinuokeGarmentColorSizeContractFact>,
  sources: Map<string, AinuokeGarmentColorSizeSource>,
): AinuokeOldBlockerComparison {
  const key = normalizeAinuokeInsideOrderNo(insideOrderNo);
  const contract = contracts.get(key);
  if (!contract) throw new Error(`旧 blocker ${insideOrderNo} 不在本次 Discovery`);
  const source = sources.get(normalizeAinuokeSalesContractNo(contract.salesContractNo));
  const rows = source?.rows ?? [];
  const colorQuantity = rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const quantityDifference = source?.colorDetailStatus === "usable" ? colorQuantity - contract.quantity : null;
  const presentRules = rows.filter((row) => row.sizeRuleRaw).length;
  const duplicateSourceIdentityGroups = repeatedGroupCount(rows.map((row) => row.sourceRowIdentity));
  const disposition: AinuokeOldBlockerDisposition = !source || source.colorDetailStatus === "missing"
    ? "still_missing"
    : source.colorDetailStatus === "invalid"
      ? "invalid"
      : quantityDifference === 0
        ? "resolved"
        : "quantity_warning_only";
  return {
    insideOrderNo: contract.insideOrderNo,
    salesContractNo: contract.salesContractNo,
    styleNo: contract.styleNo,
    contractQuantity: contract.quantity,
    exactRows: source?.exactRows ?? 0,
    usableColors: source?.usableRows.length ?? 0,
    colorQuantity,
    quantityDifference,
    sizeRulePresent: rows.length === 0 || presentRules === 0 ? "NO" : presentRules === rows.length ? "YES" : "PARTIAL",
    sizeMatrixStatuses: [...new Set(rows.map((row) => row.sizeMatrixStatus))].sort(),
    duplicateSourceIdentityGroups,
    detailInsideOrderNos: source?.detailInsideOrderNos ?? [],
    insideOrderNoDrift: source?.insideOrderNoDrift ?? false,
    disposition,
  };
}

function formerMissingComparison(
  salesContractNo: string,
  contracts: Map<string, AinuokeGarmentColorSizeContractFact>,
  sources: Map<string, AinuokeGarmentColorSizeSource>,
): AinuokeOldBlockerComparison {
  const key = normalizeAinuokeSalesContractNo(salesContractNo);
  const contract = contracts.get(key);
  if (!contract) throw new Error(`former missing contract ${salesContractNo} 不在本次 Discovery`);
  const source = sources.get(key);
  const rows = source?.rows ?? [];
  const colorQuantity = rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const quantityDifference = source?.colorDetailStatus === "usable" ? colorQuantity - contract.quantity : null;
  const presentRules = rows.filter((row) => row.sizeRuleRaw).length;
  const duplicateSourceIdentityGroups = repeatedGroupCount(rows.map((row) => row.sourceRowIdentity));
  const disposition: AinuokeOldBlockerDisposition = !source || source.colorDetailStatus === "missing"
    ? "still_missing"
    : source.colorDetailStatus === "invalid"
      ? "invalid"
      : quantityDifference === 0
        ? "resolved"
        : "quantity_warning_only";
  return {
    insideOrderNo: contract.insideOrderNo,
    salesContractNo: contract.salesContractNo,
    styleNo: contract.styleNo,
    contractQuantity: contract.quantity,
    exactRows: source?.exactRows ?? 0,
    usableColors: source?.usableRows.length ?? 0,
    colorQuantity,
    quantityDifference,
    sizeRulePresent: rows.length === 0 || presentRules === 0 ? "NO" : presentRules === rows.length ? "YES" : "PARTIAL",
    sizeMatrixStatuses: [...new Set(rows.map((row) => row.sizeMatrixStatus))].sort(),
    duplicateSourceIdentityGroups,
    detailInsideOrderNos: source?.detailInsideOrderNos ?? [],
    insideOrderNoDrift: source?.insideOrderNoDrift ?? false,
    disposition,
  };
}

export function buildAinuokeGarmentColorSizeValidationReport(input: {
  discoveryBefore: AinuokeOrderDiscoverySnapshot;
  discoveryAfter: AinuokeOrderDiscoverySnapshot;
  contracts: ReadonlyArray<AinuokeGarmentColorSizeContractFact>;
  details: ReadonlyArray<AinuokeGarmentColorSizeValidationDetail>;
  oldBlockerInsideOrderNos?: ReadonlyArray<string>;
  formerMissingSalesContractNos?: ReadonlyArray<string>;
}): AinuokeGarmentColorSizeValidationReport {
  const sources = input.details.flatMap((detail) => detail.source ? [detail.source] : []);
  const rows = sources.flatMap((source) => source.rows);
  const usableSources = sources.filter((source) => source.colorDetailStatus === "usable");
  const usableRows = usableSources.flatMap((source) => source.usableRows);
  const contractMapByInside = new Map(input.contracts.map((contract) => [normalizeAinuokeInsideOrderNo(contract.insideOrderNo), contract]));
  const contractMapByContract = new Map(input.contracts.map((contract) => [normalizeAinuokeSalesContractNo(contract.salesContractNo), contract]));
  const sourceMap = sourceByContract(input.details);
  const colorComparison = { equal: 0, lower: 0, higher: 0 };
  for (const source of usableSources) {
    const contract = contractMapByContract.get(normalizeAinuokeSalesContractNo(source.requestedSalesContractNo));
    if (!contract) continue;
    const difference = source.usableRows.reduce((sum, row) => sum + (row.quantity ?? 0), 0) - contract.quantity;
    if (difference === 0) colorComparison.equal += 1;
    else if (difference < 0) colorComparison.lower += 1;
    else colorComparison.higher += 1;
  }
  const sizeRuleTokenCounts = rows.filter((row) => row.sizeRuleRaw).map((row) => row.sizeRuleTokens.length);
  const tokenCountDistribution = new Map<number, number>();
  for (const tokenCount of sizeRuleTokenCounts) tokenCountDistribution.set(tokenCount, (tokenCountDistribution.get(tokenCount) ?? 0) + 1);
  const positiveRows = rows.filter((row) => (row.quantity ?? -1) > 0);
  const zeroRows = rows.filter((row) => row.quantity === 0);
  const oldRows = (input.oldBlockerInsideOrderNos ?? PHASE_2B2_OLD_BLOCKER_INSIDE_ORDER_NOS)
    .map((insideOrderNo) => oldBlockerComparison(insideOrderNo, contractMapByInside, sourceMap));
  const formerMissingRows = (input.formerMissingSalesContractNos ?? PHASE_2B2_1_MISSING_SALES_CONTRACT_NOS)
    .map((salesContractNo) => formerMissingComparison(salesContractNo, contractMapByContract, sourceMap));
  const usableIdentities = usableRows.map((row) => row.sourceRowIdentity);
  const identityOrders = new Map<string, Set<string>>();
  for (const source of usableSources) for (const row of source.usableRows) {
    identityOrders.set(row.sourceRowIdentity, new Set([...(identityOrders.get(row.sourceRowIdentity) ?? []), source.requestedSalesContractNo]));
  }
  return {
    schemaVersion: "ainuoke-garment-color-size-validation.v1",
    snapshot: compareSalesOrderBootstrapSnapshots(input.discoveryBefore, input.discoveryAfter),
    discovery: { total: input.discoveryBefore.total, pageCount: input.discoveryBefore.pageCount, statusDistribution: statusDistribution(input.discoveryBefore) },
    queries: {
      total: input.details.length,
      successful: input.details.filter((detail) => detail.source).length,
      failed: input.details.filter((detail) => !detail.source).length,
      pages: input.details.reduce((sum, detail) => sum + detail.pages, 0),
    },
    coverage: {
      exactMatchOrders: sources.filter((source) => source.exactRows > 0).length,
      noExactDetailOrders: sources.filter((source) => source.exactRows === 0).length,
      exactRows: rows.length,
      containsFalsePositiveRows: sources.reduce((sum, source) => sum + source.containsFalsePositiveRows, 0),
    },
    identity: {
      duplicateCanonicalIdentityGroups: sources.reduce((sum, source) => sum + repeatedGroupCount(source.rows.map((row) => row.sourceRowIdentity)), 0),
      duplicateUsableSourceIdentityGroups: repeatedGroupCount(usableIdentities),
      crossOrderContaminationRows: 0,
      billNoMismatchRows: 0,
      ordersWithInsideOrderNoDrift: sources.filter((source) => source.insideOrderNoDrift).length,
      insideOrderNoDriftExamples: sources.filter((source) => source.insideOrderNoDrift).slice(0, 10).map((source) => ({
        salesContractNo: source.requestedSalesContractNo,
        discoveryInsideOrderNo: source.discoveryInsideOrderNo,
        detailInsideOrderNos: source.detailInsideOrderNos,
      })),
      goodsNoMismatchRows: sources.reduce((sum, source) => sum + source.issues.filter((issue) => issue.code === "GOODS_NO_MISMATCH").length, 0),
    },
    colors: {
      usableOrders: usableSources.length,
      blankRows: sources.reduce((sum, source) => sum + source.issues.filter((issue) => issue.code === "BLANK_COLOR").length, 0),
      invalidQuantityRows: sources.reduce((sum, source) => sum + source.issues.filter((issue) => issue.code === "INVALID_SIZE_NUM").length, 0),
      zeroQuantityRows: rows.filter((row) => row.quantity === 0).length,
      sameColorRepeatedOrders: repeatedOrderCount(sources, (row) => normalizeText(row.colorName) || null),
    },
    colorVsContractQuantity: colorComparison,
    sizeRule: {
      rowsPresent: rows.filter((row) => row.sizeRuleRaw).length,
      rowsMissing: rows.filter((row) => !row.sizeRuleRaw).length,
      distinctPatterns: new Set(rows.flatMap((row) => row.sizeRuleRaw ? [normalizeText(row.sizeRuleRaw)] : [])).size,
      tokenCountMin: sizeRuleTokenCounts.length ? Math.min(...sizeRuleTokenCounts) : null,
      tokenCountMax: sizeRuleTokenCounts.length ? Math.max(...sizeRuleTokenCounts) : null,
      tokenCountDistribution: [...tokenCountDistribution].sort(([left], [right]) => left - right).map(([tokenCount, rows]) => ({ tokenCount, rows })),
    },
    sizeMatrix: {
      highestWithinRule: rows.filter((row) => row.highestPopulatedSizeSlot <= row.sizeRuleTokens.length).length,
      highestBeyondRule: rows.filter((row) => row.populatedBeyondSizeRule).length,
      positiveValid: positiveRows.filter((row) => row.populatedSizeSlots.length > 0 && row.sizeValuesValid && row.sizeQuantityTotal === row.quantity).length,
      positiveQuantityMismatch: positiveRows.filter((row) => row.populatedSizeSlots.length > 0 && (!row.sizeValuesValid || row.sizeQuantityTotal !== row.quantity)).length,
      positiveMissingAllocation: positiveRows.filter((row) => row.populatedSizeSlots.length === 0).length,
      zeroWithSize: zeroRows.filter((row) => row.populatedSizeSlots.length > 0).length,
      zeroWithoutSize: zeroRows.filter((row) => row.populatedSizeSlots.length === 0).length,
      ordersWithMultipleSizeRulePatterns: multipleDistinctOrderCount(sources, (row) => row.sizeRuleRaw ? normalizeText(row.sizeRuleRaw) : null),
    },
    po: {
      nonEmptyOrders: new Set(rows.flatMap((row) => row.customerOrderNo ? [normalizeAinuokeInsideOrderNo(row.insideOrderNo)] : [])).size,
      nonEmptyRows: rows.filter((row) => row.customerOrderNo).length,
      inconsistentOrders: multipleDistinctOrderCount(sources, (row) => row.customerOrderNo ? normalizeText(row.customerOrderNo) : null),
    },
    deliveryDate: {
      presentOrders: new Set(rows.flatMap((row) => row.deliveryDate ? [normalizeAinuokeInsideOrderNo(row.insideOrderNo)] : [])).size,
      presentRows: rows.filter((row) => row.deliveryDate).length,
      multipleDatesOrders: multipleDistinctOrderCount(sources, (row) => row.deliveryDate),
    },
    oldBlockers: {
      rows: oldRows,
      resolved: oldRows.filter((row) => row.disposition === "resolved").length,
      stillMissing: oldRows.filter((row) => row.disposition === "still_missing").length,
      invalid: oldRows.filter((row) => row.disposition === "invalid").length,
      warningOnly: oldRows.filter((row) => row.disposition === "quantity_warning_only").length,
    },
    formerMissing: {
      rows: formerMissingRows,
      resolved: formerMissingRows.filter((row) => row.disposition === "resolved").length,
      stillMissing: formerMissingRows.filter((row) => row.disposition === "still_missing").length,
      invalid: formerMissingRows.filter((row) => row.disposition === "invalid").length,
      warningOnly: formerMissingRows.filter((row) => row.disposition === "quantity_warning_only").length,
    },
  };
}

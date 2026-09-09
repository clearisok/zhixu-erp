import type {
  AinuokeApiSourceTrace,
  AinuokeColorMirrorRow,
  AinuokeContractMirror,
  AinuokeExcelSourceTrace,
  AinuokeSourceTrace,
} from "../model/ainuoke.ts";
import { normalizeBrandText, normalizeStyleNo, resolveBrandAlias } from "../model/style-normalizer.ts";

export type ParsedSalesContract = AinuokeSourceTrace & Pick<
  AinuokeContractMirror,
  | "salesContractNo"
  | "statusRaw"
  | "companyName"
  | "customerName"
  | "brandRaw"
  | "styleNoRaw"
  | "factoryStyleNo"
  | "poNo"
  | "quantity"
  | "contractDate"
  | "contractDeliveryDate"
>;

export type AinuokeContractSource = {
  contracts: ParsedSalesContract[];
  colorRows: AinuokeColorMirrorRow[];
};

export function stableSourceHash(parts: ReadonlyArray<string | number | null>): string {
  const input = JSON.stringify(parts);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function isApiSourceTrace(trace: AinuokeSourceTrace): trace is AinuokeApiSourceTrace {
  return trace.sourceKind === "api";
}

export function isExcelSourceTrace(trace: AinuokeSourceTrace): trace is AinuokeExcelSourceTrace {
  return trace.sourceKind !== "api";
}

export function buildAinuokeMirror(input: {
  contracts: ParsedSalesContract[];
  colorRows: AinuokeColorMirrorRow[];
  aliases?: ReadonlyArray<{ alias: string; canonicalName: string; enabled?: boolean }>;
  syncedAt?: string;
}): AinuokeContractMirror[] {
  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const colorByContract = new Map<string, AinuokeColorMirrorRow[]>();
  for (const row of input.colorRows) colorByContract.set(row.salesContractNo, [...(colorByContract.get(row.salesContractNo) ?? []), row]);
  const contracts = input.contracts.map((contract): AinuokeContractMirror => {
    const colorRows = colorByContract.get(contract.salesContractNo) ?? [];
    const colorGroups = new Map<string, AinuokeColorMirrorRow[]>();
    for (const row of colorRows) {
      const colorKey = row.colorName.normalize("NFKC").trim();
      colorGroups.set(colorKey, [...(colorGroups.get(colorKey) ?? []), row]);
    }
    const colorLines = [...colorGroups.entries()].map(([colorName, rows]) => ({
      colorName,
      quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      deliveryDate: [...new Set(rows.map((row) => row.deliveryDate).filter((value): value is string => Boolean(value)))].sort()[0] ?? null,
      sourceRows: rows.flatMap((row) => isExcelSourceTrace(row) ? [row.sourceRow] : []),
      sourceRowIdentities: rows.flatMap((row) => isApiSourceTrace(row) ? [row.sourceRowIdentity] : []),
    }));
    const deliveryGroups = new Map<string, number>();
    for (const row of colorRows) if (row.deliveryDate) deliveryGroups.set(row.deliveryDate, (deliveryGroups.get(row.deliveryDate) ?? 0) + row.quantity);
    const deliveryLines = [...deliveryGroups].sort(([left], [right]) => left.localeCompare(right)).map(([deliveryDate, quantity]) => ({ deliveryDate, quantity }));
    const colorQuantity = colorLines.reduce((sum, line) => sum + line.quantity, 0);
    const quantityDifference = colorQuantity - contract.quantity;
    const keys = normalizeStyleNo(contract.styleNoRaw);
    const brandNormalized = resolveBrandAlias(contract.brandRaw, input.aliases ?? []);
    return {
      ...contract,
      ...keys,
      brandNormalized: brandNormalized || normalizeBrandText(contract.brandRaw),
      colorRows,
      colorLines,
      deliveryLines,
      colorQuantity,
      quantityDifference,
      validationStatus: !colorRows.length ? "missing_color_detail" : quantityDifference === 0 ? "valid" : "quantity_mismatch",
      boundOrderId: null,
      lastDisposition: null,
      syncedAt,
    };
  });
  const contractSet = new Set(contracts.map((item) => item.salesContractNo));
  const orphan = input.colorRows.find((row) => !contractSet.has(row.salesContractNo));
  if (orphan) throw new Error(`分色明细中的销售合同号 ${orphan.salesContractNo} 不存在于销售合同来源`);
  return contracts;
}

import type { AinuokeReportSnapshot, AinuokeSourceRow } from "../../ainuoke-api/model/ainuoke-api.ts";
import type { AinuokeApiReportId, AinuokeColorMirrorRow } from "../model/ainuoke.ts";
import { buildAinuokeMirror, stableSourceHash, type AinuokeContractSource, type ParsedSalesContract } from "./ainuoke-contract-source.ts";

type ContractSnapshot = AinuokeReportSnapshot & { reportId: "6086103" };
type ColorSnapshot = AinuokeReportSnapshot & { reportId: "6086997" };

export type AinuokeApiContractSourceMetadata = {
  sourceKind: "api";
  reportIds: AinuokeApiReportId[];
  query: { insideOrderNo: string };
  snapshotHashes: string[];
  fetchedAt: string;
};

export type AinuokeApiContractSource = AinuokeContractSource & {
  metadata: AinuokeApiContractSourceMetadata;
};

const normalizeText = (value: unknown): string => value === null || value === undefined ? "" : String(value).normalize("NFKC").trim();

function requiredText(row: AinuokeSourceRow, field: string, reportId: AinuokeApiReportId): string {
  const value = normalizeText(row.values[field]);
  if (!value) throw new Error(`艾诺科报表 ${reportId} 缺少必要字段 ${field}`);
  return value;
}

function requiredNumber(row: AinuokeSourceRow, field: string, reportId: AinuokeApiReportId): number {
  const raw = row.values[field];
  const value = typeof raw === "number" ? raw : Number(normalizeText(raw).replaceAll(",", ""));
  if (!Number.isFinite(value) || value < 0) throw new Error(`艾诺科报表 ${reportId} 字段 ${field} 数量无效`);
  return value;
}

function optionalDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const dateOnly = raw.match(/^\d{4}-\d{2}-\d{2}/u)?.[0];
  if (dateOnly) return dateOnly;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function assertSnapshotSet<T extends AinuokeReportSnapshot["reportId"]>(snapshots: AinuokeReportSnapshot[], reportId: T): asserts snapshots is Array<AinuokeReportSnapshot & { reportId: T }> {
  if (!snapshots.length || snapshots.some((snapshot) => snapshot.reportId !== reportId)) throw new Error(`艾诺科 API Source 缺少报表 ${reportId}`);
  const query = snapshots[0].queryContext.insideOrderNo.normalize("NFKC").trim();
  if (!query || snapshots.some((snapshot) => snapshot.queryContext.insideOrderNo.normalize("NFKC").trim() !== query)) throw new Error(`艾诺科报表 ${reportId} query context 不一致`);
  const identities = snapshots.flatMap((snapshot) => snapshot.rows.map((row) => row.sourceRowIdentity));
  if (new Set(identities).size !== identities.length) throw new Error(`艾诺科报表 ${reportId} source row identity 重复`);
}

function snapshotTrace(snapshots: AinuokeReportSnapshot[], reportId: AinuokeApiReportId, identities: string[], normalizedValues: ReadonlyArray<string | number | null>) {
  const snapshotHashes = [...new Set(snapshots.map((snapshot) => snapshot.snapshotHash))].sort();
  const sortedIdentities = [...identities].sort();
  return {
    sourceKind: "api" as const,
    reportId,
    sourceRowIdentity: sortedIdentities.length === 1 ? sortedIdentities[0] : `${reportId}:aggregate:${stableSourceHash(sortedIdentities)}`,
    snapshotHash: snapshotHashes.length === 1 ? snapshotHashes[0] : `pages:${stableSourceHash(snapshotHashes)}`,
    fetchedAt: snapshots.map((snapshot) => snapshot.fetchedAt).sort().at(-1)!,
    sourceHash: stableSourceHash([reportId, ...sortedIdentities, ...normalizedValues]),
  };
}

function mapContractSnapshots(snapshots: ContractSnapshot[]): ParsedSalesContract[] {
  return snapshots.flatMap((snapshot) => snapshot.rows.map((row) => {
    const salesContractNo = requiredText(row, "BillNo", "6086103").toLocaleUpperCase("en-US");
    const styleNoRaw = requiredText(row, "GoodsDesc", "6086103");
    const quantity = requiredNumber(row, "Num", "6086103");
    const values = [salesContractNo, normalizeText(row.values.Brand), styleNoRaw, normalizeText(row.values.InsideOrderNo), quantity, optionalDate(row.values.DeliveryDate)];
    return {
      ...snapshotTrace([snapshot], "6086103", [row.sourceRowIdentity], values),
      salesContractNo,
      statusRaw: normalizeText(row.values.Status),
      companyName: normalizeText(row.values.CompanyName),
      customerName: normalizeText(row.values.CustomerName),
      brandRaw: normalizeText(row.values.Brand),
      styleNoRaw,
      factoryStyleNo: normalizeText(row.values.InsideOrderNo),
      // 6086103 exposes QuotationNo, not a customer PO field. Do not invent poNo.
      poNo: "",
      quantity,
      contractDate: optionalDate(row.values.ContractDate),
      contractDeliveryDate: optionalDate(row.values.DeliveryDate),
    };
  }));
}

function splitColorList(value: string): string[] {
  return value.split(/[,，]/u).map((part) => part.normalize("NFKC").trim()).filter(Boolean);
}

function mapColorSnapshots(snapshots: ColorSnapshot[]): AinuokeColorMirrorRow[] {
  const rows = snapshots.flatMap((snapshot) => snapshot.rows.map((row) => ({ snapshot, row })));
  const colorNames = new Set(rows.map(({ row }) => requiredText(row, "stylecolor", "6086997").normalize("NFKC").trim()));
  const groups = new Map<string, Array<{ snapshot: ColorSnapshot; row: AinuokeSourceRow }>>();
  for (const item of rows) {
    const row = item.row;
    const key = [
      requiredText(row, "billno", "6086997").toLocaleUpperCase("en-US"),
      requiredText(row, "GoodsDesc", "6086997"),
      normalizeText(row.values.InsideOrderNo),
      requiredText(row, "stylecolor", "6086997"),
    ].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()].flatMap(([key, items]) => {
    const [salesContractNo, styleNoRaw, factoryStyleNo, colorName] = key.split("\u0000");
    const colorParts = splitColorList(colorName);
    // The verified 6086997 view joins garment colors/sizes to material rows and also
    // emits contract-wide comma-joined color aggregates. Keep only actual color groups.
    if (colorParts.length > 1 && colorParts.every((part) => colorNames.has(part))) return [];
    const quantities = items.map(({ row }) => requiredNumber(row, "stylenum", "6086997"));
    const quantity = Math.max(...quantities);
    const identities = items.map(({ row }) => row.sourceRowIdentity);
    const sourceSnapshots = [...new Set(items.map(({ snapshot }) => snapshot))];
    return [{
      ...snapshotTrace(sourceSnapshots, "6086997", identities, [salesContractNo, styleNoRaw, factoryStyleNo, colorName, quantity]),
      salesContractNo,
      styleNoRaw,
      factoryStyleNo,
      // The verified report does not expose a customer PO field.
      poNo: "",
      colorName,
      quantity,
      deliveryDate: null,
      // 6086997 is a material join; stylesizerule rows cannot be proven equivalent
      // to the Excel Size1/Size2 columns. Preserve no invented size allocation.
      sizes: [],
    }];
  });
}

export function adaptAinuokeContractApiSnapshots(input: {
  contractSnapshots: AinuokeReportSnapshot[];
  colorSnapshots: AinuokeReportSnapshot[];
}): AinuokeApiContractSource {
  assertSnapshotSet(input.contractSnapshots, "6086103");
  assertSnapshotSet(input.colorSnapshots, "6086997");
  const query = input.contractSnapshots[0].queryContext.insideOrderNo.normalize("NFKC").trim();
  if (input.colorSnapshots.some((snapshot) => snapshot.queryContext.insideOrderNo.normalize("NFKC").trim() !== query)) throw new Error("艾诺科销售合同与分色报表 query context 不一致");
  const allSnapshots = [...input.contractSnapshots, ...input.colorSnapshots];
  return {
    contracts: mapContractSnapshots(input.contractSnapshots),
    colorRows: mapColorSnapshots(input.colorSnapshots),
    metadata: {
      sourceKind: "api",
      reportIds: ["6086103", "6086997"],
      query: { insideOrderNo: query },
      snapshotHashes: allSnapshots.map((snapshot) => snapshot.snapshotHash),
      fetchedAt: allSnapshots.map((snapshot) => snapshot.fetchedAt).sort().at(-1)!,
    },
  };
}

export function buildAinuokeMirrorFromApi(input: {
  contractSnapshots: AinuokeReportSnapshot[];
  colorSnapshots: AinuokeReportSnapshot[];
  aliases?: ReadonlyArray<{ alias: string; canonicalName: string; enabled?: boolean }>;
  syncedAt?: string;
}) {
  const source = adaptAinuokeContractApiSnapshots(input);
  return {
    contracts: buildAinuokeMirror({ contracts: source.contracts, colorRows: source.colorRows, aliases: input.aliases, syncedAt: input.syncedAt }),
    metadata: source.metadata,
  };
}

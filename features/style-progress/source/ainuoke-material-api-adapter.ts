import type { AinuokeReportSnapshot, AinuokeSourceRow } from "../../ainuoke-api/model/ainuoke-api.ts";
import type { RawCellValue } from "../model/style-progress.ts";
import type { MaterialSemanticField, MaterialSourceRow } from "./material-source-row.ts";

export const AINUOKE_MATERIAL_SOURCE_SCHEMA_VERSION = "ainuoke-material-api-source.v1" as const;

type MaterialSnapshot = AinuokeReportSnapshot & { reportId: "6087050" };

export type AinuokeMaterialApiSourceMetadata = {
  schemaVersion: typeof AINUOKE_MATERIAL_SOURCE_SCHEMA_VERSION;
  sourceKind: "api";
  reportId: "6087050";
  sourceSchemaVersion: "ainuoke-direct-read.v2";
  fetchedAt: string;
  query: { insideOrderNo: string };
  pages: Array<{ page: number; pageSize: number; total: number; rowCount: number; snapshotHash: string }>;
  reportedTotal: number;
  sourceRowCount: number;
  uniqueSourceIdentityCount: number;
  duplicateSourceRowsPrevented: number;
  sourceIdentityCollisions: number;
  repeatedUpstreamIdGroups: number;
};

export type AinuokeMaterialApiSource = {
  metadata: AinuokeMaterialApiSourceMetadata;
  rows: MaterialSourceRow[];
};

const FIELD_MAP: Readonly<Partial<Record<MaterialSemanticField, string>>> = {
  styleNo: "styleno",
  materialType: "lx",
  companyHeader: "CompanyName",
  salesContractNo: "ExpContractNo",
  brand: "Brand",
  salesperson: "ywy",
  factoryStyleNo: "insideorderno",
  garmentColors: "StyleColor",
  relatedGarmentColors: "StyleColorcy",
  garmentQuantity: "StyleNum",
  customerName: "CustomerName",
  contractDeliveryDate: "DeliveryDate",
  materialCode: "GoodsNo",
  materialName: "CnName",
  // MSingleName has one repeated value across the verified D1935 snapshot and
  // is not proven equivalent to Excel “申购实际名称”; keep sourceActualName absent.
  plannedConsumption: "Num",
  lossRate: "Lost",
  totalConsumption: "picnum",
  width: "MenFu",
  gsm: "KeZhong",
  materialColor: "CnColor",
  specification: "CnComposition",
  supplyMethod: "SupplyType",
  requiredQuantity: "TotalNum",
  sampleQuantity: "yyyl",
  purchaseOrderNo: "cgdh",
  purchaseDate: "cgrq",
  supplier: "SupplierName",
  purchaseEntity: "cgtt",
  sourceMaterialDueDate: "cgjq",
  currency: "CurrencyName",
  purchaser: "cgr",
  purchasedMaterialName: "cgcnname",
  invoiceName: "kpname",
  purchaseActualName: "actualname",
  purchaseSpecification: "cgCnComposition",
  purchaseColor: "cgcncolor",
  purchaseQuantity: "cgnum",
  purchaseSampleQuantity: "cgyyyl",
  purchaseUnitPrice: "cgprice",
  purchaseAmount: "goodsamount",
  inboundDocumentNo: "rkdh",
  inboundDate: "rkrq",
  inboundQuantity: "rknum",
  shipmentDocumentNo: "cydh",
  shipmentDate: "cyrq",
  transportMode: "TransType",
  shipmentQuantity: "CYNum",
  outboundDocumentNo: "ckdh",
  outboundDate: "ckrq",
  outboundQuantity: "OutStoreNum",
  // No verified 6087050 field currently proves the Excel numeric “厂供” meaning.
  // sourceActualName, actualConsumption, and other unmapped fields remain absent.
};

const SECRET_KEY = /password|passwd|credential|authorization|cookie|token|session/i;
const normalizeText = (value: unknown): string => String(value ?? "").normalize("NFKC").trim();

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function toRawFields(row: AinuokeSourceRow): Record<string, RawCellValue> {
  const rawFields: Record<string, RawCellValue> = {};
  for (const [key, value] of Object.entries(row.values)) {
    if (SECRET_KEY.test(key)) throw new Error("艾诺科物料 Source 含禁止字段");
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`艾诺科物料 Source 字段 ${key} 结构无效`);
    }
    rawFields[key] = value;
  }
  return rawFields;
}

function semanticValues(row: AinuokeSourceRow): MaterialSourceRow["values"] {
  return Object.fromEntries(Object.entries(FIELD_MAP).map(([semantic, upstream]) => [semantic, row.values[upstream]])) as MaterialSourceRow["values"];
}

function assertSnapshots(snapshots: AinuokeReportSnapshot[]): asserts snapshots is MaterialSnapshot[] {
  if (!snapshots.length || snapshots.some((snapshot) => snapshot.reportId !== "6087050")) throw new Error("艾诺科 Material API Source 缺少报表 6087050");
  if (snapshots.some((snapshot) => snapshot.schemaVersion !== "ainuoke-direct-read.v2")) throw new Error("艾诺科 Material API Source schema 不受支持");
  const query = normalizeText(snapshots[0].queryContext.insideOrderNo);
  if (!query || snapshots.some((snapshot) => normalizeText(snapshot.queryContext.insideOrderNo) !== query)) throw new Error("艾诺科 Material API Source query context 不一致");
  const pages = [...snapshots].sort((left, right) => left.page - right.page);
  if (pages.some((snapshot, index) => snapshot.page !== index + 1 || snapshot.pageSize < 1 || snapshot.total < 0)) throw new Error("艾诺科 Material API Source paging 不完整");
  const readCount = pages.reduce((sum, snapshot) => sum + snapshot.rows.length, 0);
  const last = pages.at(-1)!;
  if (readCount < last.total && last.rows.length !== 0) throw new Error("艾诺科 Material API Source 尚未读取全部分页");
}

export function adaptAinuokeMaterialApiSnapshots(snapshots: AinuokeReportSnapshot[]): AinuokeMaterialApiSource {
  assertSnapshots(snapshots);
  const orderedSnapshots = [...snapshots].sort((left, right) => left.page - right.page);
  const identityRows = new Map<string, { canonical: string; row: AinuokeSourceRow; snapshot: MaterialSnapshot }>();
  let duplicateSourceRowsPrevented = 0;
  let sourceIdentityCollisions = 0;
  for (const snapshot of orderedSnapshots) {
    for (const row of snapshot.rows) {
      if (!normalizeText(row.sourceRowIdentity).startsWith("6087050:sha256:")) throw new Error("艾诺科物料 Source row identity 无效");
      const canonical = canonicalJson(row.values);
      const existing = identityRows.get(row.sourceRowIdentity);
      if (existing) {
        if (existing.canonical !== canonical) sourceIdentityCollisions += 1;
        else duplicateSourceRowsPrevented += 1;
        continue;
      }
      identityRows.set(row.sourceRowIdentity, { canonical, row, snapshot });
    }
  }
  if (sourceIdentityCollisions > 0) throw new Error("艾诺科物料 Source identity collision");
  const rows = [...identityRows.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, item]) => ({
    trace: {
      sourceKind: "api" as const,
      reportId: "6087050" as const,
      sourceRowIdentity: item.row.sourceRowIdentity,
      snapshotHash: item.snapshot.snapshotHash,
      fetchedAt: item.snapshot.fetchedAt,
      queryContext: { insideOrderNo: normalizeText(item.snapshot.queryContext.insideOrderNo) },
      sourceSchemaVersion: item.snapshot.schemaVersion,
    },
    rawFields: toRawFields(item.row),
    values: semanticValues(item.row),
  }));
  const upstreamIdCounts = new Map<string, number>();
  for (const { row } of identityRows.values()) {
    const id = normalizeText(row.values.id);
    if (id) upstreamIdCounts.set(id, (upstreamIdCounts.get(id) ?? 0) + 1);
  }
  return {
    metadata: {
      schemaVersion: AINUOKE_MATERIAL_SOURCE_SCHEMA_VERSION,
      sourceKind: "api",
      reportId: "6087050",
      sourceSchemaVersion: "ainuoke-direct-read.v2",
      fetchedAt: orderedSnapshots.map((snapshot) => snapshot.fetchedAt).sort().at(-1)!,
      query: { insideOrderNo: normalizeText(orderedSnapshots[0].queryContext.insideOrderNo) },
      pages: orderedSnapshots.map((snapshot) => ({ page: snapshot.page, pageSize: snapshot.pageSize, total: snapshot.total, rowCount: snapshot.rows.length, snapshotHash: snapshot.snapshotHash })),
      reportedTotal: orderedSnapshots.at(-1)!.total,
      sourceRowCount: rows.length,
      uniqueSourceIdentityCount: rows.length,
      duplicateSourceRowsPrevented,
      sourceIdentityCollisions,
      repeatedUpstreamIdGroups: [...upstreamIdCounts.values()].filter((count) => count > 1).length,
    },
    rows,
  };
}

export const AINUOKE_6087050_FIELD_MAP = FIELD_MAP;

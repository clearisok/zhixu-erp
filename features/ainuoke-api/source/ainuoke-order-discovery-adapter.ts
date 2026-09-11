import type {
  AinuokeOrderDiscoveryQuery,
  AinuokeOrderDiscoveryRow,
  AinuokeOrderDiscoverySnapshot,
  AinuokeReportSnapshot,
  AinuokeSourceRow,
} from "../model/ainuoke-api.ts";

const normalizeText = (value: unknown): string => String(value ?? "").normalize("NFKC").trim();
const normalizeIdentity = (value: unknown): string => normalizeText(value).toLocaleUpperCase("en-US");
const nullableText = (value: unknown): string | null => normalizeText(value) || null;

function requiredText(row: AinuokeSourceRow, field: string): string {
  const value = normalizeText(row.values[field]);
  if (!value) throw new Error(`艾诺科订单发现行缺少 ${field}`);
  return value;
}

function mapRow(row: AinuokeSourceRow): AinuokeOrderDiscoveryRow {
  const sourceRowIdentity = normalizeText(row.sourceRowIdentity);
  if (!sourceRowIdentity) throw new Error("艾诺科订单发现行缺少 sourceRowIdentity");
  return {
    sourceId: requiredText(row, "id"),
    sourceRowIdentity,
    insideOrderNo: normalizeIdentity(requiredText(row, "InsideOrderNo")),
    salesContractNo: normalizeIdentity(requiredText(row, "BillNo")),
    lifecycleStatusRaw: requiredText(row, "Status"),
    contractDate: nullableText(row.values.ContractDate),
    deliveryDate: nullableText(row.values.DeliveryDate),
    styleNo: requiredText(row, "GoodsDesc"),
  };
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`艾诺科订单发现 ${label} 存在重复值`);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function adaptAinuokeOrderDiscoverySnapshots(
  snapshots: ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>,
): Promise<AinuokeOrderDiscoverySnapshot> {
  if (!snapshots.length) throw new Error("艾诺科订单发现缺少分页 Snapshot");
  const orderedPages = [...snapshots].sort((left, right) => left.page - right.page);
  const pageSize = orderedPages[0].pageSize;
  const total = orderedPages[0].total;
  for (const [index, snapshot] of orderedPages.entries()) {
    if (snapshot.schemaVersion !== "ainuoke-direct-read.v2" || snapshot.reportId !== "6086103" || Object.keys(snapshot.queryContext).length !== 0) {
      throw new Error("艾诺科订单发现 Source 协议不一致");
    }
    if (snapshot.page !== index + 1 || snapshot.pageSize !== pageSize || snapshot.total !== total || snapshot.rows.length > pageSize) {
      throw new Error("艾诺科订单发现分页不完整或总数不一致");
    }
  }
  const sourceRows = orderedPages.flatMap((snapshot) => snapshot.rows);
  const expectedFinalPageRows = total - pageSize * (orderedPages.length - 1);
  const validEmptySnapshot = total === 0 && orderedPages.length === 1 && orderedPages[0].rows.length === 0;
  if (sourceRows.length !== total || (!validEmptySnapshot && (expectedFinalPageRows < 1 || orderedPages.at(-1)!.rows.length !== expectedFinalPageRows))) {
    throw new Error("艾诺科订单发现读取行数与 total 不一致");
  }
  assertUnique(sourceRows.map((row) => row.sourceRowIdentity), "Source row identity");
  const rows = sourceRows.map(mapRow).sort((left, right) => left.sourceId.localeCompare(right.sourceId, "en", { numeric: true }) || left.insideOrderNo.localeCompare(right.insideOrderNo));
  assertUnique(rows.map((row) => row.sourceId), "sourceId");
  assertUnique(rows.map((row) => row.salesContractNo), "SalesContractNo / BillNo");
  const hashPayload = {
    schemaVersion: "ainuoke-order-discovery.v1",
    reportId: "6086103",
    visibilityScope: "current_account_visible",
    total,
    rows: rows.map((row) => ({
      sourceId: row.sourceId,
      insideOrderNo: row.insideOrderNo,
      salesContractNo: row.salesContractNo,
      lifecycleStatusRaw: row.lifecycleStatusRaw,
      contractDate: row.contractDate,
      deliveryDate: row.deliveryDate,
      styleNo: row.styleNo,
    })),
  };
  return {
    schemaVersion: "ainuoke-order-discovery.v1",
    reportId: "6086103",
    visibilityScope: "current_account_visible",
    fetchedAt: orderedPages.map((snapshot) => snapshot.fetchedAt).sort().at(-1)!,
    total,
    pageCount: orderedPages.length,
    rows,
    snapshotHash: await sha256Hex(JSON.stringify(hashPayload)),
  };
}

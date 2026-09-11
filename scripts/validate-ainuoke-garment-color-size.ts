import { createAinuokeBridgeClient } from "../features/ainuoke-api/client/ainuoke-bridge-client.ts";
import type {
  AinuokeOrderDiscoveryQuery,
  AinuokeOrderDiscoverySnapshot,
  AinuokeReportSnapshot,
} from "../features/ainuoke-api/model/ainuoke-api.ts";
import { adaptAinuokeOrderDiscoverySnapshots } from "../features/ainuoke-api/source/ainuoke-order-discovery-adapter.ts";
import {
  adaptAinuokeGarmentColorSizeSnapshots,
  normalizeAinuokeInsideOrderNo,
} from "../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts";
import {
  buildAinuokeGarmentColorSizeValidationReport,
  type AinuokeGarmentColorSizeContractFact,
  type AinuokeGarmentColorSizeValidationDetail,
} from "../features/ainuoke-sync/service/ainuoke-garment-color-size-validation.ts";

const ORIGIN = "http://127.0.0.1:3001";
const CONCURRENCY = 4;
const PAGE_SIZE = 50;

function createCookieFetch(): typeof fetch {
  let cookie: string | null = null;
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Origin", ORIGIN);
    if (cookie) headers.set("Cookie", cookie);
    const response = await fetch(input, { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    return response;
  };
}

function requiredQuantity(value: unknown, insideOrderNo: string): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").normalize("NFKC").trim().replaceAll(",", ""));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Discovery ${insideOrderNo} Num 无效`);
  return parsed;
}

function contractFacts(
  discovery: AinuokeOrderDiscoverySnapshot,
  rawSnapshots: ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>,
): AinuokeGarmentColorSizeContractFact[] {
  const rawBySourceId = new Map(rawSnapshots.flatMap((snapshot) => snapshot.rows).map((row) => [String(row.values.id ?? "").normalize("NFKC").trim(), row]));
  return discovery.rows.map((row) => {
    const raw = rawBySourceId.get(row.sourceId);
    if (!raw || raw.sourceRowIdentity !== row.sourceRowIdentity) throw new Error(`Discovery ${row.insideOrderNo} raw identity 缺失`);
    return {
      insideOrderNo: row.insideOrderNo,
      salesContractNo: row.salesContractNo,
      styleNo: row.styleNo,
      quantity: requiredQuantity(raw.values.Num, row.insideOrderNo),
    };
  });
}

async function readDetails(
  client: ReturnType<typeof createAinuokeBridgeClient>,
  userId: string,
  contracts: AinuokeGarmentColorSizeContractFact[],
): Promise<AinuokeGarmentColorSizeValidationDetail[]> {
  const results: AinuokeGarmentColorSizeValidationDetail[] = new Array(contracts.length);
  let cursor = 0;
  let complete = 0;
  async function worker(): Promise<void> {
    while (cursor < contracts.length) {
      const index = cursor;
      cursor += 1;
      const contract = contracts[index];
      try {
        const snapshots = await client.readAllGarmentColorSizePages(userId, { insideOrderNo: contract.insideOrderNo, pageSize: PAGE_SIZE, maxPages: 100 });
        results[index] = {
          insideOrderNo: contract.insideOrderNo,
          pages: snapshots.length,
          source: await adaptAinuokeGarmentColorSizeSnapshots({
            snapshots,
            requestedInsideOrderNo: contract.insideOrderNo,
            expectedSalesContractNo: contract.salesContractNo,
            expectedStyleNo: contract.styleNo,
          }),
        };
      } catch (error) {
        results[index] = {
          insideOrderNo: contract.insideOrderNo,
          pages: 0,
          error: error instanceof Error ? error.message : "6087105 query failed",
        };
      }
      complete += 1;
      if (complete % 25 === 0 || complete === contracts.length) console.log(`6087105 progress ${complete}/${contracts.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return results;
}

function anchor(details: AinuokeGarmentColorSizeValidationDetail[], insideOrderNo: string, colorRows: number, total: number) {
  const detail = details.find((item) => normalizeAinuokeInsideOrderNo(item.insideOrderNo) === normalizeAinuokeInsideOrderNo(insideOrderNo));
  const rows = detail?.source?.usableRows ?? [];
  const colorTotal = rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const valid = detail?.source?.colorDetailStatus === "usable"
    && rows.length === colorRows
    && colorTotal === total;
  return {
    insideOrderNo,
    colorRows: rows.length,
    colorTotal,
    sizeMatrix: [...new Set(rows.map((row) => row.sizeMatrixStatus))].sort(),
    valid,
  };
}

async function main(): Promise<void> {
  const userId = process.argv[2]?.trim();
  const compact = process.argv.includes("--compact");
  const summaryOnly = process.argv.includes("--summary-only");
  if (!userId) throw new Error("Usage: tsx scripts/validate-ainuoke-garment-color-size.ts <browser-local-user-id>");
  const client = createAinuokeBridgeClient({ fetchImpl: createCookieFetch() });
  const beforePages = await client.readAllOrderDiscoveryPages(userId, { pageSize: PAGE_SIZE, maxPages: 100 });
  const discoveryBefore = await adaptAinuokeOrderDiscoverySnapshots(beforePages);
  const contracts = contractFacts(discoveryBefore, beforePages);
  console.log(`Discovery before ${discoveryBefore.total}/${discoveryBefore.pageCount} ${discoveryBefore.snapshotHash}`);
  const details = await readDetails(client, userId, contracts);
  const anchors = [
    anchor(details, "D1935", 5, 4640),
    anchor(details, "T1826-4", 3, 3730),
    anchor(details, "1917U", 2, 9393),
  ];
  if (anchors.some((item) => !item.valid)) {
    console.log(`ANCHOR_MISMATCH=${JSON.stringify(anchors)}`);
    throw new Error("6087105 anchor evidence changed; validation stopped");
  }
  const afterPages = compact
    ? beforePages
    : await client.readAllOrderDiscoveryPages(userId, { pageSize: PAGE_SIZE, maxPages: 100 });
  const discoveryAfter = await adaptAinuokeOrderDiscoverySnapshots(afterPages);
  const report = buildAinuokeGarmentColorSizeValidationReport({ discoveryBefore, discoveryAfter, contracts, details });
  const safeErrors = details.flatMap((detail) => detail.error ? [{ insideOrderNo: detail.insideOrderNo, error: detail.error }] : []);
  const anomalies = details.flatMap((detail) => {
    const source = detail.source;
    if (!source || source.colorDetailStatus === "usable") return [];
    const contract = contracts.find((item) => normalizeAinuokeInsideOrderNo(item.insideOrderNo) === normalizeAinuokeInsideOrderNo(detail.insideOrderNo));
    return [{
      insideOrderNo: detail.insideOrderNo,
      salesContractNo: contract?.salesContractNo ?? null,
      styleNo: contract?.styleNo ?? null,
      contractQuantity: contract?.quantity ?? null,
      colorDetailStatus: source.colorDetailStatus,
      upstreamRows: source.upstreamRows,
      exactRows: source.exactRows,
      containsFalsePositiveRows: source.containsFalsePositiveRows,
      issues: source.issues.map((issue) => ({ code: issue.code, sourceRowIdentity: issue.sourceRowIdentity ? `${issue.sourceRowIdentity.slice(0, 22)}…${issue.sourceRowIdentity.slice(-12)}` : null })),
      rows: source.rows.map((row) => ({
        sourceRowIdentity: `${row.sourceRowIdentity.slice(0, 22)}…${row.sourceRowIdentity.slice(-12)}`,
        colorName: row.colorName,
        quantity: row.quantity,
        sizeRulePresent: Boolean(row.sizeRuleRaw),
        sizeMatrixStatus: row.sizeMatrixStatus,
      })),
    }];
  });
  if (compact) {
    const { rows: oldBlockerRows, ...oldBlockerSummary } = report.oldBlockers;
    console.log(`COMPACT_RESULT=${JSON.stringify({
      snapshot: report.snapshot,
      discovery: report.discovery,
      queries: report.queries,
      coverage: report.coverage,
      identity: report.identity,
      colors: report.colors,
      colorVsContractQuantity: report.colorVsContractQuantity,
      sizeRule: report.sizeRule,
      sizeMatrix: report.sizeMatrix,
      po: report.po,
      deliveryDate: report.deliveryDate,
      oldBlockerSummary,
      anomalies: summaryOnly ? undefined : anomalies,
      anchors,
      safeErrors,
      oldBlockerRows: summaryOnly ? undefined : oldBlockerRows,
      classificationOnly: true,
      successfulAinuokePageReads: beforePages.length + report.queries.pages,
      readsByReport: { "6086103": beforePages.length, "6087105": report.queries.pages, "6086997": 0, "6087050": 0 },
    })}`);
    return;
  }
  console.log(`VALIDATION_RESULT=${JSON.stringify({
    ...report,
    anchors,
    safeErrors,
    successfulAinuokePageReads: beforePages.length + report.queries.pages + afterPages.length,
    readsByReport: { "6086103": beforePages.length + afterPages.length, "6087105": report.queries.pages, "6086997": 0, "6087050": 0 },
  })}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "6087105 validation failed");
  process.exitCode = 1;
});

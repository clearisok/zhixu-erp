import { createAinuokeBridgeClient } from "../../features/ainuoke-api/client/ainuoke-bridge-client.js";
import type {
  AinuokeOrderDiscoveryQuery,
  AinuokeReportSnapshot,
} from "../../features/ainuoke-api/model/ainuoke-api.js";
import { adaptAinuokeOrderDiscoverySnapshots } from "../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js";
import {
  buildFinalSalesOrderBootstrapPreview,
  type FinalSalesOrderBootstrapDetail,
  type FinalSalesOrderBootstrapPreview,
} from "../../features/ainuoke-sync/service/sales-order-final-bootstrap-preview.js";
import {
  adaptAinuokeGarmentColorSizeSnapshots,
  normalizeAinuokeSalesContractNo,
} from "../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js";

const BRIDGE_ORIGIN = "http://127.0.0.1:3001";
const DETAIL_CONCURRENCY = 4;
const PAGE_SIZE = 50;

export type BootstrapSourceProgress = {
  phase: "discovery_before" | "color_details" | "discovery_after";
  completed: number;
  total: number;
};

export type FreshSalesOrderBootstrapPlan = {
  preview: FinalSalesOrderBootstrapPreview;
  billNo: { blank: number; duplicates: number };
  reads: {
    total: number;
    byReport: { "6086103": number; "6087105": number; "6086997": 0; "6087050": 0 };
  };
};

function createCookieFetch(fetchImpl: typeof fetch = fetch): typeof fetch {
  let cookie: string | null = null;
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Origin", BRIDGE_ORIGIN);
    if (cookie) headers.set("Cookie", cookie);
    const response = await fetchImpl(input, { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    return response;
  };
}

function billNoIntegrity(
  snapshots: ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>,
): { blank: number; duplicates: number } {
  const normalized = snapshots.flatMap((snapshot) => snapshot.rows)
    .map((row) => normalizeAinuokeSalesContractNo(row.values.BillNo));
  const nonBlank = normalized.filter(Boolean);
  return {
    blank: normalized.length - nonBlank.length,
    duplicates: nonBlank.length - new Set(nonBlank).size,
  };
}

async function readColorDetails(
  client: ReturnType<typeof createAinuokeBridgeClient>,
  userId: string,
  contracts: ReadonlyArray<{ insideOrderNo: string; salesContractNo: string; styleNo: string }>,
  onProgress?: (progress: BootstrapSourceProgress) => void,
): Promise<FinalSalesOrderBootstrapDetail[]> {
  const results = new Array<FinalSalesOrderBootstrapDetail>(contracts.length);
  let cursor = 0;
  let complete = 0;
  async function worker(): Promise<void> {
    while (cursor < contracts.length) {
      const index = cursor;
      cursor += 1;
      const contract = contracts[index];
      try {
        const snapshots = await client.readAllGarmentColorSizePages(userId, {
          salesContractNo: contract.salesContractNo,
          pageSize: PAGE_SIZE,
          maxPages: 100,
        });
        results[index] = {
          salesContractNo: contract.salesContractNo,
          pages: snapshots.length,
          source: await adaptAinuokeGarmentColorSizeSnapshots({
            snapshots,
            requestedSalesContractNo: contract.salesContractNo,
            discoveryInsideOrderNo: contract.insideOrderNo,
            expectedStyleNo: contract.styleNo,
          }),
        };
      } catch (error) {
        results[index] = {
          salesContractNo: contract.salesContractNo,
          pages: 0,
          error: error instanceof Error ? error.message : "6087105 query failed",
        };
      }
      complete += 1;
      onProgress?.({ phase: "color_details", completed: complete, total: contracts.length });
    }
  }
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
  return results;
}

export async function buildFreshSalesOrderBootstrapPlan(input: {
  ainuokeUserId: string;
  bridgeUrl?: string;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: BootstrapSourceProgress) => void;
}): Promise<FreshSalesOrderBootstrapPlan> {
  const userId = input.ainuokeUserId.normalize("NFKC").trim();
  if (!userId) throw new Error("--ainuoke-user-id is required");
  const client = createAinuokeBridgeClient({
    baseUrl: input.bridgeUrl,
    fetchImpl: createCookieFetch(input.fetchImpl),
  });

  const beforePages = await client.readAllOrderDiscoveryPages(userId, { pageSize: PAGE_SIZE, maxPages: 100 });
  input.onProgress?.({ phase: "discovery_before", completed: beforePages.length, total: beforePages.length });
  const billNo = billNoIntegrity(beforePages);
  if (billNo.blank || billNo.duplicates) {
    throw new Error(`6086103 BillNo integrity failed: blank=${billNo.blank}, duplicates=${billNo.duplicates}`);
  }
  const discoveryBefore = await adaptAinuokeOrderDiscoverySnapshots(beforePages);
  const details = await readColorDetails(client, userId, discoveryBefore.rows, input.onProgress);
  const queryFailures = details.filter((detail) => detail.error || !detail.source).length;
  if (queryFailures) throw new Error(`6087105 detail queries failed: ${queryFailures}`);

  const afterPages = await client.readAllOrderDiscoveryPages(userId, { pageSize: PAGE_SIZE, maxPages: 100 });
  input.onProgress?.({ phase: "discovery_after", completed: afterPages.length, total: afterPages.length });
  const discoveryAfter = await adaptAinuokeOrderDiscoverySnapshots(afterPages);
  const preview = await buildFinalSalesOrderBootstrapPreview({
    discoveryBefore,
    discoveryAfter,
    discoveryRawSnapshots: beforePages,
    details,
  });
  if (!preview.snapshot.stable || !preview.readyForDisposablePostgres) {
    throw new Error("Fresh Ainuoke snapshot is stale or incomplete");
  }
  const reads6086103 = beforePages.length + afterPages.length;
  return {
    preview,
    billNo,
    reads: {
      total: reads6086103 + preview.queries.pages,
      byReport: {
        "6086103": reads6086103,
        "6087105": preview.queries.pages,
        "6086997": 0,
        "6087050": 0,
      },
    },
  };
}

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

export const BOOTSTRAP_BRIDGE_MAX_ATTEMPTS = 4;
export const BOOTSTRAP_BRIDGE_RETRY_BACKOFF_MS = [250, 750, 1_500] as const;

const RETRYABLE_TRANSPORT_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export type BootstrapSourceProgress = {
  phase: "discovery_before" | "color_details" | "discovery_after";
  completed: number;
  total: number;
};

export type BootstrapBridgeTransportRetry = {
  attempt: number;
  maxAttempts: number;
  errorClass: string;
  transportCode: string | null;
  endpointPath: string | null;
};

export type FreshSalesOrderBootstrapPlan = {
  preview: FinalSalesOrderBootstrapPreview;
  billNo: { blank: number; duplicates: number };
  reads: {
    total: number;
    byReport: { "6086103": number; "6087105": number; "6086997": 0; "6087050": 0 };
  };
  transportRetries: number;
};

type BootstrapBridgeTransport = {
  fetchImpl: typeof fetch;
  getRetryCount: () => number;
};

function safeTransportCode(error: unknown): string | null {
  let current: unknown = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && RETRYABLE_TRANSPORT_CODES.has(candidate.code)) {
      return candidate.code;
    }
    current = candidate.cause;
  }
  return null;
}

function endpointPath(input: Parameters<typeof fetch>[0]): string | null {
  try {
    const value = input instanceof Request ? input.url : String(input);
    return new URL(value, BRIDGE_ORIGIN).pathname;
  } catch {
    return null;
  }
}

function retryableTransportFailure(error: unknown): { errorClass: string; transportCode: string | null } | null {
  const transportCode = safeTransportCode(error);
  if (!(error instanceof TypeError) && !transportCode) return null;
  return {
    errorClass: error instanceof Error ? error.name : "UnknownError",
    transportCode,
  };
}

export function createBootstrapBridgeTransport(options: {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  onRetry?: (retry: BootstrapBridgeTransportRetry) => void;
} = {}): BootstrapBridgeTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  let cookie: string | null = null;
  let retryCount = 0;
  const bootstrapFetch: typeof fetch = async (input, init = {}) => {
    for (let attempt = 1; attempt <= BOOTSTRAP_BRIDGE_MAX_ATTEMPTS; attempt += 1) {
      const headers = new Headers(init.headers);
      headers.set("Origin", BRIDGE_ORIGIN);
      if (cookie) headers.set("Cookie", cookie);
      try {
        const response = await fetchImpl(input, { ...init, headers });
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) cookie = setCookie.split(";", 1)[0];
        return response;
      } catch (error) {
        const failure = retryableTransportFailure(error);
        if (!failure || attempt === BOOTSTRAP_BRIDGE_MAX_ATTEMPTS) throw error;
        retryCount += 1;
        options.onRetry?.({
          attempt,
          maxAttempts: BOOTSTRAP_BRIDGE_MAX_ATTEMPTS,
          ...failure,
          endpointPath: endpointPath(input),
        });
        await sleep(BOOTSTRAP_BRIDGE_RETRY_BACKOFF_MS[attempt - 1]);
      }
    }
    throw new Error("Bootstrap Bridge transport exhausted attempts");
  };
  return { fetchImpl: bootstrapFetch, getRetryCount: () => retryCount };
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
  onTransportRetry?: (retry: BootstrapBridgeTransportRetry) => void;
  transportSleep?: (milliseconds: number) => Promise<void>;
}): Promise<FreshSalesOrderBootstrapPlan> {
  const userId = input.ainuokeUserId.normalize("NFKC").trim();
  if (!userId) throw new Error("--ainuoke-user-id is required");
  const transport = createBootstrapBridgeTransport({
    fetchImpl: input.fetchImpl,
    sleep: input.transportSleep,
    onRetry: input.onTransportRetry,
  });
  const client = createAinuokeBridgeClient({
    baseUrl: input.bridgeUrl,
    fetchImpl: transport.fetchImpl,
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
    transportRetries: transport.getRetryCount(),
  };
}

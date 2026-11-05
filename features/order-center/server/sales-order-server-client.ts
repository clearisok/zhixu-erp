import { navigationReadCache } from "../../server-auth/session-read-cache";
import type {
  ServerSalesOrderDetailDto,
  ServerSalesOrderListQuery,
  ServerSalesOrderPage,
  ServerSalesOrderReadDto,
} from "./sales-order-server-model";
import type { DeliveryPlanSetDto } from "../../../server/sales-orders/delivery-plan-model";
import { createDeliveryPlanClient, DeliveryPlanClientError, type DeliveryPlanLease } from './delivery-plan-client';

export class SalesOrderServerReadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SalesOrderServerReadError";
  }
}

export type SalesOrderServerClient = {
  list(query?: ServerSalesOrderListQuery, options?: { preload?: boolean }): Promise<{ salesOrders: ServerSalesOrderReadDto[]; page: ServerSalesOrderPage }>;
  getById(id: string): Promise<ServerSalesOrderDetailDto>;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: { code?: string; message?: string } };
  if (!response.ok) {
    throw new SalesOrderServerReadError(
      response.status,
      payload.error?.code ?? "sales_order_read_failed",
      payload.error?.message ?? "PostgreSQL SalesOrder 读取失败",
    );
  }
  return payload;
}

export function createSalesOrderServerClient(options: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  applicationCache?: boolean;
} = {}): SalesOrderServerClient {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/u, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async list(query = {}, readOptions = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      const path = `${baseUrl}/api/v1/sales-orders${params.size ? `?${params}` : ""}`;
      const load = async () => parseResponse<{ salesOrders: ServerSalesOrderReadDto[]; page: ServerSalesOrderPage }>(await fetchImpl(path, {
        method: "GET", credentials: "include", cache: "no-store",
      }));
      return options.applicationCache ? readOptions.preload ? navigationReadCache.preload(path, load) : navigationReadCache.read(path, load) : load();
    },
    async getById(id) {
      const response = await fetchImpl(`${baseUrl}/api/v1/sales-orders/${encodeURIComponent(id)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      return (await parseResponse<{ salesOrder: ServerSalesOrderDetailDto }>(response)).salesOrder;
    },
  };
}

export const salesOrderServerClient = createSalesOrderServerClient({ applicationCache: true });

/** Separate request/snapshot from order detail; no PATCH or Browser fallback. */
export async function readServerDeliveryPlans(id: string, options: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  lease?: DeliveryPlanLease;
  signal?: AbortSignal;
} = {}): Promise<DeliveryPlanSetDto> {
  try { return await createDeliveryPlanClient(options).read(id, options.lease ?? (() => true), options.signal); }
  catch (error) {
    if (error instanceof DeliveryPlanClientError) throw new SalesOrderServerReadError(error.status, error.code, error.message);
    throw error;
  }
}

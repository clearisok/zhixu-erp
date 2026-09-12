import {
  adaptServerSalesOrderDetail,
  adaptServerSalesOrderListItem,
  type OrderCenterServerDetailViewModel,
  type OrderCenterServerListViewModel,
  type ServerSalesOrderListQuery,
  type ServerSalesOrderPage,
} from "./sales-order-server-model";
import { salesOrderServerClient, type SalesOrderServerClient } from "./sales-order-server-client";

export interface ServerSalesOrderReadRepository {
  list(query?: ServerSalesOrderListQuery): Promise<{ items: OrderCenterServerListViewModel[]; page: ServerSalesOrderPage }>;
  getById(id: string): Promise<OrderCenterServerDetailViewModel>;
}

export function createServerSalesOrderReadRepository(
  client: SalesOrderServerClient = salesOrderServerClient,
): ServerSalesOrderReadRepository {
  return {
    async list(query) {
      const response = await client.list(query);
      return { items: response.salesOrders.map(adaptServerSalesOrderListItem), page: response.page };
    },
    async getById(id) {
      return adaptServerSalesOrderDetail(await client.getById(id));
    },
  };
}

export const serverSalesOrderReadRepository = createServerSalesOrderReadRepository();

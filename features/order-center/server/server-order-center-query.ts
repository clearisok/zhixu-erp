import type {
  OrderCenterServerDetailViewModel,
  OrderCenterServerListViewModel,
  ServerSalesOrderCreationSource,
  ServerSalesOrderLifecycleState,
  ServerSalesOrderListQuery,
  ServerSalesOrderPage,
} from "./sales-order-server-model";
import type { ServerSalesOrderReadRepository } from "./server-sales-order-read-repository";

export const SERVER_ORDER_CENTER_PAGE_SIZE = 50;

export type ServerOrderCenterSortBy = NonNullable<ServerSalesOrderListQuery["sortBy"]>;
export type ServerOrderCenterSortDirection = NonNullable<ServerSalesOrderListQuery["sortDirection"]>;

export type ServerOrderCenterQueryState = {
  includeHistorical?: boolean;
  offset: number;
  search: string;
  lifecycleState: ServerSalesOrderLifecycleState | "";
  creationSource: ServerSalesOrderCreationSource | "";
  sortBy: ServerOrderCenterSortBy;
  sortDirection: ServerOrderCenterSortDirection;
};

export const initialServerOrderCenterQuery: ServerOrderCenterQueryState = {
  offset: 0,
  search: "",
  lifecycleState: "",
  creationSource: "",
  sortBy: "orderNo",
  sortDirection: "asc",
};

export function normalizeServerOrderSearch(value: string): string {
  return value.normalize("NFKC").trim();
}

export function toServerSalesOrderListQuery(
  state: ServerOrderCenterQueryState,
): ServerSalesOrderListQuery {
  return {
    ...(state.includeHistorical ? {includeHistorical:true} : {}),
    limit: SERVER_ORDER_CENTER_PAGE_SIZE,
    offset: state.offset,
    search: state.search || undefined,
    lifecycleState: state.lifecycleState || undefined,
    creationSource: state.creationSource || undefined,
    sortBy: state.sortBy,
    sortDirection: state.sortDirection,
  };
}

export function loadServerOrderCenterPage(
  repository: ServerSalesOrderReadRepository,
  state: ServerOrderCenterQueryState,
): Promise<{ items: OrderCenterServerListViewModel[]; page: ServerSalesOrderPage }> {
  return repository.list(toServerSalesOrderListQuery(state));
}

export function loadServerOrderCenterDetail(
  repository: ServerSalesOrderReadRepository,
  id: string,
): Promise<OrderCenterServerDetailViewModel> {
  return repository.getById(id);
}

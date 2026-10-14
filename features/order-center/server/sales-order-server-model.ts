import type { OrderAlert } from "./order-alerts";
export type ServerSalesOrderCreationSource = "quote" | "reorder" | "manual" | "ainuoke";
export type ServerSalesOrderLifecycleState = "draft" | "confirmed" | "active" | "completed" | "cancelled";

export type ServerSalesOrderReadDto = {
  id: string;
  version: number;
  orderNo: string;
  creationSource: ServerSalesOrderCreationSource;
  lifecycleState: ServerSalesOrderLifecycleState;
  salesContractNo: string | null;
  insideOrderNo: string | null;
  sourceLifecycleStatus: string;
  styleNo: string;
  companyName: string;
  customerName: string;
  brandName: string;
  quantity: number | null;
  colorCount: number;
  alerts?: OrderAlert[];
  contractDate: string | null;
  contractDeliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerSalesOrderColorDto = {
  sourceLineIdentity: string;
  colorName: string;
  quantity: number;
  deliveryDate: string | null;
};

export type ServerSalesOrderDetailDto = ServerSalesOrderReadDto & {
  colors: ServerSalesOrderColorDto[];
};

export type ServerSalesOrderListQuery = {
  limit?: number;
  offset?: number;
  search?: string;
  lifecycleState?: ServerSalesOrderLifecycleState;
  creationSource?: ServerSalesOrderCreationSource;
  sortBy?: "orderNo" | "updatedAt" | "contractDeliveryDate" | "salesContractNo";
  sortDirection?: "asc" | "desc";
};

export type ServerSalesOrderPage = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
};

export type OrderCenterServerListViewModel = {
  id: string;
  version: number;
  orderNo: string;
  creationSource: ServerSalesOrderCreationSource;
  lifecycleState: ServerSalesOrderLifecycleState;
  billNo: string | null;
  factoryStyleNo: string | null;
  styleNo: string;
  companyName: string;
  customerName: string;
  brandName: string;
  initialQuantity: number | null;
  sourceLifecycleStatus: string;
  contractDate: string | null;
  contractDeliveryDate: string | null;
  colorCount: number;
  alerts?: OrderAlert[];
  createdAt: string;
  updatedAt: string;
};

export type OrderCenterServerDetailViewModel = Omit<
  OrderCenterServerListViewModel,
  "factoryStyleNo" | "initialQuantity"
> & {
  insideOrderNo: string | null;
  quantity: number | null;
  colors: ServerSalesOrderColorDto[];
};

export function adaptServerSalesOrderListItem(dto: ServerSalesOrderReadDto): OrderCenterServerListViewModel {
  return {
    id: dto.id,
    version: dto.version,
    orderNo: dto.orderNo,
    creationSource: dto.creationSource,
    lifecycleState: dto.lifecycleState,
    billNo: dto.salesContractNo,
    factoryStyleNo: dto.insideOrderNo,
    styleNo: dto.styleNo,
    companyName: dto.companyName,
    customerName: dto.customerName,
    brandName: dto.brandName,
    initialQuantity: dto.quantity,
    sourceLifecycleStatus: dto.sourceLifecycleStatus,
    contractDate: dto.contractDate,
    contractDeliveryDate: dto.contractDeliveryDate,
    colorCount: dto.colorCount,
    alerts: dto.alerts ?? [],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function adaptServerSalesOrderDetail(dto: ServerSalesOrderDetailDto): OrderCenterServerDetailViewModel {
  return {
    id: dto.id,
    version: dto.version,
    orderNo: dto.orderNo,
    creationSource: dto.creationSource,
    lifecycleState: dto.lifecycleState,
    billNo: dto.salesContractNo,
    insideOrderNo: dto.insideOrderNo,
    styleNo: dto.styleNo,
    companyName: dto.companyName,
    customerName: dto.customerName,
    brandName: dto.brandName,
    quantity: dto.quantity,
    sourceLifecycleStatus: dto.sourceLifecycleStatus,
    contractDate: dto.contractDate,
    contractDeliveryDate: dto.contractDeliveryDate,
    colorCount: dto.colorCount,
    alerts: dto.alerts ?? [],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    colors: dto.colors,
  };
}

export type ServerOrderAttribution = {originalOrderId:string;effectiveOrderId:string;attributionChangeId:string|null;attributionVersion:number;historicalDuplicate:boolean};

import type { SalesOrderColorSizeEvidence, SalesOrderColorSourceEvidence } from "../../../server/sales-orders/source-evidence";

import type { OrderAlert } from "./order-alerts";
export type ServerSalesOrderCreationSource = "quote" | "reorder" | "manual" | "ainuoke";
export type ServerSalesOrderLifecycleState = "draft" | "confirmed" | "active" | "completed" | "cancelled";

export type ServerSalesOrderReadDto = {
  id: string;
  attribution?: ServerOrderAttribution;
  sourceOwnerOrderId?: string;
  version: number;
  orderNo: string;
  creationSource: ServerSalesOrderCreationSource;
  lifecycleState: ServerSalesOrderLifecycleState;
  salesContractNo: string | null;
  insideOrderNo: string | null;
  sourceLifecycleStatus: string;
  businessType?: "ainuoke_contract"|"processing"|"unclassified";
  ownerName?:string|null;
  businessSource?:"quote"|"reorder"|null;
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
  /** Older Server responses lack saved evidence; absence must stay unknown. */
  sizeEvidence?: SalesOrderColorSizeEvidence;
};

export type ServerSalesOrderDetailDto = ServerSalesOrderReadDto & {
  colors: ServerSalesOrderColorDto[];
  colorSource?: SalesOrderColorSourceEvidence;
};

export type ServerSalesOrderListQuery = {
  includeHistorical?: boolean;
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
  attribution?: ServerOrderAttribution;
  sourceOwnerOrderId?: string;
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
  businessType?: "ainuoke_contract"|"processing"|"unclassified";
  ownerName?:string|null;
  businessSource?:"quote"|"reorder"|null;
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
  colorSource?: SalesOrderColorSourceEvidence;
};

export function adaptServerSalesOrderListItem(dto: ServerSalesOrderReadDto): OrderCenterServerListViewModel {
  return {
    id: dto.id,
    ...(dto.attribution ? {attribution:dto.attribution} : {}),
    ...(dto.sourceOwnerOrderId ? {sourceOwnerOrderId:dto.sourceOwnerOrderId} : {}),
    version: dto.version,
    orderNo: dto.orderNo,
    creationSource: dto.creationSource,
    businessSource:dto.businessSource??null,
    lifecycleState: dto.lifecycleState,
    billNo: dto.salesContractNo,
    factoryStyleNo: dto.insideOrderNo,
    styleNo: dto.styleNo,
    companyName: dto.companyName,
    customerName: dto.customerName,
    brandName: dto.brandName,
    initialQuantity: dto.quantity,
    sourceLifecycleStatus: dto.sourceLifecycleStatus,
    ...(dto.businessType ? {businessType:dto.businessType,ownerName:dto.ownerName??null} : {}),
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
    ...(dto.attribution ? {attribution:dto.attribution} : {}),
    ...(dto.sourceOwnerOrderId ? {sourceOwnerOrderId:dto.sourceOwnerOrderId} : {}),
    version: dto.version,
    orderNo: dto.orderNo,
    creationSource: dto.creationSource,
    businessSource:dto.businessSource??null,
    lifecycleState: dto.lifecycleState,
    billNo: dto.salesContractNo,
    insideOrderNo: dto.insideOrderNo,
    styleNo: dto.styleNo,
    companyName: dto.companyName,
    customerName: dto.customerName,
    brandName: dto.brandName,
    quantity: dto.quantity,
    sourceLifecycleStatus: dto.sourceLifecycleStatus,
    ...(dto.businessType ? {businessType:dto.businessType,ownerName:dto.ownerName??null} : {}),
    contractDate: dto.contractDate,
    contractDeliveryDate: dto.contractDeliveryDate,
    colorCount: dto.colorCount,
    alerts: dto.alerts ?? [],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    colors: dto.colors,
    ...(dto.colorSource ? { colorSource: dto.colorSource } : {}),
  };
}

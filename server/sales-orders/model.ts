export const AINUOKE_SOURCE_SYSTEM = "ainuoke";
export const AINUOKE_CONTRACT_ENTITY_TYPE = "sales_contract";

export type SalesOrderCreationSource = "quote" | "reorder" | "manual" | "ainuoke";
export type SalesOrderLifecycleState = "draft" | "confirmed" | "active" | "completed" | "cancelled";

export type SalesOrderRecord = {
  id: string;
  orderNo: string;
  creationSource: SalesOrderCreationSource;
  lifecycleState: SalesOrderLifecycleState;
  sourceOrderId: string | null;
  sourceQuoteId: string | null;
  sourceRevisionId: string | null;
  sourcePriceVersionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type SalesOrderSourceLink = {
  id: string;
  salesOrderId: string;
  sourceSystem: string;
  sourceEntityType: string;
  externalId: string;
  salesContractNo: string | null;
  insideOrderNo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AinuokeContractMirrorInput = {
  sourceId: string;
  sourceRowIdentity: string;
  salesContractNo: string;
  insideOrderNo: string;
  lifecycleStatusRaw: string;
  contractDate: string | null;
  contractDeliveryDate: string | null;
  styleNo: string;
  companyNameSnapshot: string;
  customerNameSnapshot: string;
  brandNameSnapshot: string;
  quantity: number;
  sourceHash: string;
  fetchedAt: string;
  sourceMetadata?: Record<string, unknown>;
};

export type AinuokeColorMirrorInput = {
  sourceLineIdentity: string;
  colorName: string;
  quantity: number;
  deliveryDate: string | null;
  sourceHash: string;
  sourceMetadata?: Record<string, unknown>;
};

export type SalesOrderReadModel = {
  id: string;
  version: number;
  orderNo: string;
  creationSource: SalesOrderCreationSource;
  lifecycleState: SalesOrderLifecycleState;
  salesContractNo: string | null;
  insideOrderNo: string | null;
  sourceLifecycleStatus: string;
  businessType?: "ainuoke_contract"|"processing"|"unclassified";
  ownerName?:string|null;
  styleNo: string;
  companyName: string;
  customerName: string;
  brandName: string;
  quantity: number | null;
  colorCount: number;
  contractDate: string | null;
  contractDeliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesOrderColorReadModel = {
  sourceLineIdentity: string;
  colorName: string;
  quantity: number;
  deliveryDate: string | null;
};

export type SalesOrderDetailReadModel = SalesOrderReadModel & {
  colors: SalesOrderColorReadModel[];
};

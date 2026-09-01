export type MaterialType = "fabric" | "trim";
export type ExpectedDateSource = "source" | "manual";
export type MaterialReadinessStatus = "not_purchased" | "purchasing" | "pending_inbound" | "ready";
export type MaterialLifecycleStatus =
  | "pending_purchase"
  | "purchasing"
  | "purchase_complete"
  | "partial_inbound"
  | "inbound_complete"
  | "partial_shipment"
  | "shipment_complete"
  | "partial_outbound"
  | "outbound_complete";

export type RawCellValue = string | number | boolean | null;

export type MaterialRawSnapshot = {
  id: string;
  importBatchId: string;
  fileHash: string;
  fileName: string;
  sheetName: string;
  sourceRow: number;
  rawFields: Record<string, RawCellValue>;
  normalizedDemandId: string | null;
  validationIssues: string[];
};

export type MaterialImportBatch = {
  id: string;
  fileName: string;
  fileHash: string;
  sheetName: string;
  usedRange: string;
  rawRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  demandCount: number;
  purchaseEventCount: number;
  inboundEventCount: number;
  shipmentEventCount: number;
  outboundEventCount: number;
  duplicateDemandRows: number;
  duplicateEventRows: number;
  status: "preview" | "committed";
  createdAt: string;
  createdBy: string;
  committedAt: string | null;
};

export type MaterialDemand = {
  id: string;
  salesContractNo: string;
  materialType: MaterialType;
  materialCode: string;
  materialName: string;
  sourceActualName: string;
  materialColor: string;
  garmentColors: string[];
  specification: string;
  supplyMethod: string | null;
  garmentQuantity: number | null;
  plannedConsumption: number | null;
  actualConsumption: number | null;
  lossRate: number | null;
  totalConsumption: number | null;
  width: string;
  gsm: string;
  requiredQuantity: number;
  sampleQuantity: number | null;
  sourceMaterialDueDate: string | null;
  expectedMaterialReadyDate: string | null;
  expectedDateSource: ExpectedDateSource;
  sourceSortNo: number;
  sourceStyleNoSnapshot: string;
  sourceFactoryStyleNoSnapshot: string;
  sourceBrandSnapshot: string;
  sourceOwnerSnapshot: string;
  sourceCustomerSnapshot: string;
  sourceOrderQuantitySnapshot: number | null;
  sourceContractDeliveryDateSnapshot: string | null;
  lastImportBatchId: string;
  sourceFileHash: string;
  createdAt: string;
  updatedAt: string;
};

export type MaterialPurchaseEvent = {
  id: string;
  materialDemandId: string;
  purchaseOrderNo: string;
  purchaseDate: string | null;
  supplier: string;
  purchaseEntity: string;
  sourceMaterialDueDate: string | null;
  currency: string;
  purchaser: string;
  purchasedMaterialName: string;
  invoiceName: string;
  actualName: string;
  specification: string;
  color: string;
  quantity: number;
  sampleQuantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  extraCost: number | null;
  importBatchId: string;
  sourceRows: number[];
};

export type MaterialInboundEvent = {
  id: string;
  materialDemandId: string;
  documentNo: string;
  eventDate: string | null;
  quantity: number;
  importBatchId: string;
  sourceRows: number[];
};

export type MaterialShipmentEvent = MaterialInboundEvent & { transportModeSnapshot: string };
export type MaterialOutboundEvent = MaterialInboundEvent;

export type StyleProgressData = {
  batches: MaterialImportBatch[];
  rawSnapshots: MaterialRawSnapshot[];
  demands: MaterialDemand[];
  purchaseEvents: MaterialPurchaseEvent[];
  inboundEvents: MaterialInboundEvent[];
  shipmentEvents: MaterialShipmentEvent[];
  outboundEvents: MaterialOutboundEvent[];
};

export type MaterialImportPreview = StyleProgressData & {
  batch: MaterialImportBatch;
};

export type MaterialImportCommitReport = {
  duplicateFile: boolean;
  newDemands: number;
  updatedDemands: number;
  newPurchaseEvents: number;
  newInboundEvents: number;
  newShipmentEvents: number;
  newOutboundEvents: number;
  newRawSnapshots: number;
};

export const emptyStyleProgressData = (): StyleProgressData => ({
  batches: [],
  rawSnapshots: [],
  demands: [],
  purchaseEvents: [],
  inboundEvents: [],
  shipmentEvents: [],
  outboundEvents: [],
});

export function validateStyleProgressData(value: unknown): StyleProgressData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("款式进度数据格式无效");
  const source = value as Partial<StyleProgressData>;
  const names = ["batches", "rawSnapshots", "demands", "purchaseEvents", "inboundEvents", "shipmentEvents", "outboundEvents"] as const;
  for (const name of names) if (!Array.isArray(source[name])) throw new Error(`款式进度 ${name} 集合结构无效`);
  const data = structuredClone(source) as StyleProgressData;
  for (const name of names) {
    const ids = data[name].map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error(`款式进度 ${name} 存在重复 ID`);
  }
  const demandIds = new Set(data.demands.map((item) => item.id));
  for (const name of ["purchaseEvents", "inboundEvents", "shipmentEvents", "outboundEvents"] as const) {
    if (data[name].some((event) => !demandIds.has(event.materialDemandId))) throw new Error(`款式进度 ${name} 引用了不存在的需求`);
  }
  return data;
}

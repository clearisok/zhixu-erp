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

const normalizedText = (value: RawCellValue | undefined): string => String(value ?? "").normalize("NFKC").trim();
const rawByHeader = (snapshot: MaterialRawSnapshot, names: string[]): RawCellValue | undefined => Object.entries(snapshot.rawFields).find(([key]) => names.some((name) => key.endsWith(`:${name}`)))?.[1];
const sourceNumber = (value: RawCellValue | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/** v2 repairs the former “提供方式=厂供 means actual=planned” interpretation from Raw snapshots. */
export function migrateStyleProgressDataV2(value: StyleProgressData): StyleProgressData {
  const batchTimestamp = new Map(value.batches.map((batch) => [batch.id, batch.committedAt ?? batch.createdAt ?? ""]));
  const snapshots = new Map<string, MaterialRawSnapshot[]>();
  for (const snapshot of value.rawSnapshots) {
    if (!snapshot.normalizedDemandId) continue;
    snapshots.set(snapshot.normalizedDemandId, [...(snapshots.get(snapshot.normalizedDemandId) ?? []), snapshot]);
  }
  return {
    ...structuredClone(value),
    demands: value.demands.map((demand) => {
      const snapshot = [...(snapshots.get(demand.id) ?? [])].sort((left, right) => {
        const leftCurrent = left.importBatchId === demand.lastImportBatchId ? 1 : 0;
        const rightCurrent = right.importBatchId === demand.lastImportBatchId ? 1 : 0;
        if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;
        const leftSource = left.fileHash === demand.sourceFileHash ? 1 : 0;
        const rightSource = right.fileHash === demand.sourceFileHash ? 1 : 0;
        if (leftSource !== rightSource) return rightSource - leftSource;
        const byBatchTime = (batchTimestamp.get(right.importBatchId) ?? "").localeCompare(batchTimestamp.get(left.importBatchId) ?? "");
        return byBatchTime || left.sourceRow - right.sourceRow || left.id.localeCompare(right.id);
      })[0];
      if (!snapshot) return structuredClone(demand);
      const actualRaw = rawByHeader(snapshot, ["厂供", "实际用量", "实际单耗"]);
      const methodRaw = rawByHeader(snapshot, ["提供方式", "供应方式"]);
      const actualConsumption = sourceNumber(actualRaw);
      const supplyMethod = methodRaw === undefined ? demand.supplyMethod : normalizedText(methodRaw) || null;
      if (actualRaw === undefined && methodRaw === undefined) return structuredClone(demand);
      return { ...structuredClone(demand), actualConsumption, supplyMethod };
    }),
  };
}

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

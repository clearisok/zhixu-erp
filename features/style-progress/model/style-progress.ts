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

export type MaterialExpectedArrivalAllocation = {
  id: string;
  materialDemandId: string;
  quantity: number;
};

export type MaterialExpectedArrivalBatch = {
  id: string;
  salesContractNo: string;
  canonicalMaterialKey: string;
  expectedArrivalAtHubDate: string;
  dateSource: ExpectedDateSource;
  allocations: MaterialExpectedArrivalAllocation[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type CanonicalMaterialIdentity = {
  key: string;
  normalizedName: string;
  normalizedWidth: string;
  normalizedGsm: string;
  normalizedPurchasePrice: string | null;
  status: "resolved" | "price_missing" | "price_conflict";
  purchasePrices: number[];
};

export type StyleProgressData = {
  dataVersion: number;
  batches: MaterialImportBatch[];
  rawSnapshots: MaterialRawSnapshot[];
  demands: MaterialDemand[];
  purchaseEvents: MaterialPurchaseEvent[];
  inboundEvents: MaterialInboundEvent[];
  shipmentEvents: MaterialShipmentEvent[];
  outboundEvents: MaterialOutboundEvent[];
  expectedArrivalBatches: MaterialExpectedArrivalBatch[];
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
  dataVersion: 4,
  batches: [],
  rawSnapshots: [],
  demands: [],
  purchaseEvents: [],
  inboundEvents: [],
  shipmentEvents: [],
  outboundEvents: [],
  expectedArrivalBatches: [],
});

export function countStyleProgressRecords(data: StyleProgressData): number {
  return data.batches.length
    + data.rawSnapshots.length
    + data.demands.length
    + data.purchaseEvents.length
    + data.inboundEvents.length
    + data.shipmentEvents.length
    + data.outboundEvents.length
    + data.expectedArrivalBatches.length;
}

const normalizedText = (value: RawCellValue | undefined): string => String(value ?? "").normalize("NFKC").trim();
const rawByHeader = (snapshot: MaterialRawSnapshot, names: string[]): RawCellValue | undefined => Object.entries(snapshot.rawFields).find(([key]) => names.some((name) => key.endsWith(`:${name}`)))?.[1];
const sourceNumber = (value: RawCellValue | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizedIdentityText = (value: unknown): string => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase();
const normalizedNumericIdentity = (value: unknown): string => {
  const text = normalizedIdentityText(value).replaceAll(",", "");
  if (!text) return "";
  const parsed = Number(text);
  return Number.isFinite(parsed) ? String(parsed) : text;
};
export const stableStyleProgressHash = (parts: unknown[]): string => {
  let hash = 2166136261;
  for (const character of parts.map(normalizedIdentityText).join("\u001f")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export function isFactorySupplied(demand: Pick<MaterialDemand, "supplyMethod">): boolean {
  return normalizedIdentityText(demand.supplyMethod) === "厂供";
}

export function resolveCanonicalMaterialIdentity(
  demand: MaterialDemand,
  purchaseEvents: MaterialPurchaseEvent[],
): CanonicalMaterialIdentity {
  const normalizedName = normalizedIdentityText(demand.sourceActualName || demand.materialName);
  const normalizedWidth = normalizedNumericIdentity(demand.width);
  const normalizedGsm = normalizedNumericIdentity(demand.gsm);
  const purchasePrices = [...new Set(purchaseEvents
    .filter((event) => event.materialDemandId === demand.id && event.unitPrice !== null && Number.isFinite(event.unitPrice))
    .map((event) => Number(event.unitPrice)))]
    .sort((left, right) => left - right);
  return {
    key: `material-${demand.materialType}-${stableStyleProgressHash([demand.salesContractNo, demand.materialType, normalizedName])}`,
    normalizedName,
    normalizedWidth,
    normalizedGsm,
    normalizedPurchasePrice: purchasePrices.length === 1 ? String(purchasePrices[0]) : null,
    status: "resolved",
    purchasePrices,
  };
}

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

/** v3 converts the former one-date-per-demand Effective value into deterministic arrival batches. */
export function migrateStyleProgressDataV3(value: StyleProgressData): StyleProgressData {
  const repaired = migrateStyleProgressDataV2(value);
  if (repaired.dataVersion >= 3) return structuredClone(repaired);
  const grouped = new Map<string, MaterialExpectedArrivalBatch>();
  const purchaseEventsByDemand = new Map<string, MaterialPurchaseEvent[]>();
  for (const event of repaired.purchaseEvents) {
    purchaseEventsByDemand.set(event.materialDemandId, [...(purchaseEventsByDemand.get(event.materialDemandId) ?? []), event]);
  }
  for (const demand of repaired.demands) {
    if (isFactorySupplied(demand) || !demand.expectedMaterialReadyDate || demand.requiredQuantity <= 0) continue;
    const identity = resolveCanonicalMaterialIdentity(demand, purchaseEventsByDemand.get(demand.id) ?? []);
    const groupKey = [demand.salesContractNo, identity.key, demand.expectedMaterialReadyDate, demand.expectedDateSource].join("\u001f");
    const timestamp = demand.updatedAt || demand.createdAt || "1970-01-01T00:00:00.000Z";
    const batch = grouped.get(groupKey) ?? {
      id: `material-arrival-${stableStyleProgressHash(["legacy-v3", groupKey])}`,
      salesContractNo: demand.salesContractNo,
      canonicalMaterialKey: identity.key,
      expectedArrivalAtHubDate: demand.expectedMaterialReadyDate,
      dateSource: demand.expectedDateSource,
      allocations: [],
      createdAt: timestamp,
      createdBy: "legacy-migration",
      updatedAt: timestamp,
      updatedBy: "legacy-migration",
    };
    batch.allocations.push({
      id: `material-allocation-${stableStyleProgressHash([batch.id, demand.id])}`,
      materialDemandId: demand.id,
      quantity: demand.requiredQuantity,
    });
    grouped.set(groupKey, batch);
  }
  return { ...structuredClone(repaired), dataVersion: 3, expectedArrivalBatches: [...grouped.values()] };
}

/** v4 remaps legacy width/GSM/price-based canonical keys to contract + type + name keys. */
export function migrateStyleProgressDataV4(value: StyleProgressData): StyleProgressData {
  const repaired = migrateStyleProgressDataV3(value);
  if (repaired.dataVersion >= 4) return validateStyleProgressData(repaired);
  const demandsById = new Map(repaired.demands.map((demand) => [demand.id, demand]));
  const purchasesByDemand = new Map<string, MaterialPurchaseEvent[]>();
  for (const event of repaired.purchaseEvents) {
    purchasesByDemand.set(event.materialDemandId, [...(purchasesByDemand.get(event.materialDemandId) ?? []), event]);
  }
  const expectedArrivalBatches = repaired.expectedArrivalBatches.map((batch) => {
    if (!batch.allocations.length) throw new Error(`预计到料批次必须至少包含一个 Allocation：${batch.id}`);
    const keys = new Set(batch.allocations.map((allocation) => {
      const demand = demandsById.get(allocation.materialDemandId);
      if (!demand) throw new Error(`预计到料批次引用了不存在的需求：${allocation.materialDemandId}`);
      return resolveCanonicalMaterialIdentity(demand, purchasesByDemand.get(demand.id) ?? []).key;
    }));
    if (keys.size > 1) throw new Error(`预计到料批次包含多个真实物料身份，无法安全迁移：${batch.id}`);
    return { ...structuredClone(batch), canonicalMaterialKey: [...keys][0] ?? batch.canonicalMaterialKey };
  });
  return validateStyleProgressData({ ...structuredClone(repaired), dataVersion: 4, expectedArrivalBatches });
}

export function removeFactorySuppliedExpectedArrivals(value: StyleProgressData): StyleProgressData {
  const factoryDemandIds = new Set(value.demands.filter(isFactorySupplied).map((demand) => demand.id));
  if (!factoryDemandIds.size) return structuredClone(value);
  return {
    ...structuredClone(value),
    expectedArrivalBatches: value.expectedArrivalBatches.flatMap((batch) => {
      const allocations = batch.allocations.filter((allocation) => !factoryDemandIds.has(allocation.materialDemandId));
      return allocations.length ? [{ ...structuredClone(batch), allocations }] : [];
    }),
  };
}

export function validateStyleProgressData(value: unknown): StyleProgressData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("款式进度数据格式无效");
  const source = value as Partial<StyleProgressData>;
  const names = ["batches", "rawSnapshots", "demands", "purchaseEvents", "inboundEvents", "shipmentEvents", "outboundEvents"] as const;
  for (const name of names) if (!Array.isArray(source[name])) throw new Error(`款式进度 ${name} 集合结构无效`);
  if (source.expectedArrivalBatches !== undefined && !Array.isArray(source.expectedArrivalBatches)) throw new Error("款式进度 expectedArrivalBatches 集合结构无效");
  const data = structuredClone({ ...source, dataVersion: source.dataVersion ?? 2, expectedArrivalBatches: source.expectedArrivalBatches ?? [] }) as StyleProgressData;
  for (const name of [...names, "expectedArrivalBatches"] as const) {
    const ids = data[name].map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error(`款式进度 ${name} 存在重复 ID`);
  }
  const demandsById = new Map(data.demands.map((item) => [item.id, item]));
  const demandIds = new Set(demandsById.keys());
  const purchasesByDemand = new Map<string, MaterialPurchaseEvent[]>();
  for (const event of data.purchaseEvents) purchasesByDemand.set(event.materialDemandId, [...(purchasesByDemand.get(event.materialDemandId) ?? []), event]);
  for (const name of ["purchaseEvents", "inboundEvents", "shipmentEvents", "outboundEvents"] as const) {
    if (data[name].some((event) => !demandIds.has(event.materialDemandId))) throw new Error(`款式进度 ${name} 引用了不存在的需求`);
  }
  const allocated = new Map<string, number>();
  for (const batch of data.expectedArrivalBatches) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(batch.expectedArrivalAtHubDate)) throw new Error("预计到料批次日期无效");
    if (!batch.allocations.length) throw new Error(`预计到料批次必须至少包含一个 Allocation：${batch.id}`);
    const allocationIds = batch.allocations.map((item) => item.id);
    if (new Set(allocationIds).size !== allocationIds.length) throw new Error("预计到料批次存在重复 Allocation ID");
    const canonicalKeys = new Set<string>();
    for (const allocation of batch.allocations) {
      const demand = demandsById.get(allocation.materialDemandId);
      if (!demand || demand.salesContractNo !== batch.salesContractNo) throw new Error("预计到料批次引用了不存在或跨合同的需求");
      if (!Number.isFinite(allocation.quantity) || allocation.quantity <= 0) throw new Error("预计到料批次数量必须大于 0");
      if (data.dataVersion >= 4) canonicalKeys.add(resolveCanonicalMaterialIdentity(demand, purchasesByDemand.get(demand.id) ?? []).key);
      allocated.set(demand.id, (allocated.get(demand.id) ?? 0) + allocation.quantity);
    }
    if (data.dataVersion >= 4 && (canonicalKeys.size !== 1 || !canonicalKeys.has(batch.canonicalMaterialKey))) throw new Error(`预计到料批次 canonicalMaterialKey 与 Allocation 物料身份不一致：${batch.id}`);
  }
  for (const [demandId, quantity] of allocated) {
    const required = data.demands.find((item) => item.id === demandId)?.requiredQuantity ?? 0;
    if (quantity > required + 1e-9) throw new Error(`预计到料批次超出需求数量：${demandId}`);
  }
  return data;
}

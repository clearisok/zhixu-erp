"use client";

import {
  emptyStyleProgressData,
  isFactorySupplied,
  migrateStyleProgressDataV4,
  removeFactorySuppliedExpectedArrivals,
  resolveCanonicalMaterialIdentity,
  stableStyleProgressHash,
  validateStyleProgressData,
  type MaterialDemand,
  type MaterialExpectedArrivalBatch,
  type MaterialImportCommitReport,
  type MaterialImportPreview,
  type MaterialPurchaseEvent,
  type StyleProgressData,
} from "../model/style-progress.ts";

const DATABASE_NAME = "zhixu-style-progress";
const DATABASE_VERSION = 4;
const STORES = {
  batches: "batches",
  rawSnapshots: "raw-snapshots",
  demands: "demands",
  purchaseEvents: "purchase-events",
  inboundEvents: "inbound-events",
  shipmentEvents: "shipment-events",
  outboundEvents: "outbound-events",
  expectedArrivalBatches: "expected-arrival-batches",
} as const;
const METADATA_STORE = "metadata";
const METADATA_ID = "style-progress-metadata";

type StoreKey = keyof typeof STORES;
export type ExpectedArrivalPlanMutation = {
  salesContractNo: string;
  canonicalMaterialKey: string;
  materialDemandIds: string[];
  batches: MaterialExpectedArrivalBatch[];
};
export type ExpectedArrivalPlanMutationResult = { before: MaterialExpectedArrivalBatch[]; after: MaterialExpectedArrivalBatch[] };

const clone = <T>(value: T): T => structuredClone(value);

export function reconcileExpectedArrivalBatchesAfterImport(input: {
  existingBatches: MaterialExpectedArrivalBatch[];
  incomingDemands: MaterialDemand[];
  incomingPurchaseEvents: MaterialPurchaseEvent[];
}): MaterialExpectedArrivalBatch[] {
  const purchaseEventsByDemand = new Map<string, MaterialPurchaseEvent[]>();
  for (const event of input.incomingPurchaseEvents) {
    purchaseEventsByDemand.set(event.materialDemandId, [...(purchaseEventsByDemand.get(event.materialDemandId) ?? []), event]);
  }
  const incomingIds = new Set(input.incomingDemands.map((demand) => demand.id));
  const factoryIds = new Set(input.incomingDemands.filter(isFactorySupplied).map((demand) => demand.id));
  const manualIds = new Set(input.existingBatches
    .filter((batch) => batch.dateSource === "manual")
    .flatMap((batch) => batch.allocations.map((allocation) => allocation.materialDemandId))
    .filter((id) => incomingIds.has(id) && !factoryIds.has(id)));
  for (const demand of input.incomingDemands) {
    if (demand.expectedDateSource === "manual" && !isFactorySupplied(demand)) manualIds.add(demand.id);
  }
  const sourceFollowingIds = new Set([...incomingIds].filter((id) => !manualIds.has(id)));
  const removeIds = new Set([...sourceFollowingIds, ...factoryIds]);
  const next = input.existingBatches.flatMap((batch) => {
    const allocations = batch.allocations.filter((allocation) =>
      !removeIds.has(allocation.materialDemandId)
      && (!manualIds.has(allocation.materialDemandId) || batch.dateSource === "manual"));
    return allocations.length ? [{ ...clone(batch), allocations }] : [];
  });
  const preservedManualIds = new Set(next
    .filter((batch) => batch.dateSource === "manual")
    .flatMap((batch) => batch.allocations.map((allocation) => allocation.materialDemandId)));
  const sourceBatchesByKey = new Map(next
    .filter((batch) => batch.dateSource === "source")
    .map((batch) => [[batch.salesContractNo, batch.canonicalMaterialKey, batch.expectedArrivalAtHubDate].join("\u001f"), batch]));
  for (const demand of input.incomingDemands) {
    if (isFactorySupplied(demand) || demand.requiredQuantity <= 0) continue;
    const identity = resolveCanonicalMaterialIdentity(demand, purchaseEventsByDemand.get(demand.id) ?? []);
    if (manualIds.has(demand.id)) {
      if (preservedManualIds.has(demand.id) || !demand.expectedMaterialReadyDate) continue;
      const timestamp = demand.updatedAt || demand.createdAt || new Date().toISOString();
      const batchId = `material-arrival-manual-${stableStyleProgressHash([demand.id, demand.expectedMaterialReadyDate])}`;
      next.push({
        id: batchId,
        salesContractNo: demand.salesContractNo,
        canonicalMaterialKey: identity.key,
        expectedArrivalAtHubDate: demand.expectedMaterialReadyDate,
        dateSource: "manual",
        allocations: [{ id: `material-allocation-${stableStyleProgressHash([batchId, demand.id])}`, materialDemandId: demand.id, quantity: demand.requiredQuantity }],
        createdAt: timestamp,
        createdBy: "legacy-migration",
        updatedAt: timestamp,
        updatedBy: "legacy-migration",
      });
      continue;
    }
    if (!demand.sourceMaterialDueDate) continue;
    const sourceBatchKey = [demand.salesContractNo, identity.key, demand.sourceMaterialDueDate].join("\u001f");
    let batch = sourceBatchesByKey.get(sourceBatchKey);
    if (!batch) {
      const timestamp = demand.updatedAt || demand.createdAt || new Date().toISOString();
      const groupKey = [demand.salesContractNo, identity.key, demand.sourceMaterialDueDate].join("\u001f");
      batch = {
        id: `material-arrival-source-${stableStyleProgressHash([groupKey])}`,
        salesContractNo: demand.salesContractNo,
        canonicalMaterialKey: identity.key,
        expectedArrivalAtHubDate: demand.sourceMaterialDueDate,
        dateSource: "source",
        allocations: [],
        createdAt: timestamp,
        createdBy: "source-import",
        updatedAt: timestamp,
        updatedBy: "source-import",
      };
      next.push(batch);
      sourceBatchesByKey.set(sourceBatchKey, batch);
    }
    batch.allocations.push({
      id: `material-allocation-${stableStyleProgressHash([batch.id, demand.id])}`,
      materialDemandId: demand.id,
      quantity: demand.requiredQuantity,
    });
  }
  return next;
}

function replacePlanInMemory(input: {
  data: StyleProgressData;
  mutation: ExpectedArrivalPlanMutation;
}): ExpectedArrivalPlanMutationResult & { data: StyleProgressData } {
  const targetIds = new Set(input.mutation.materialDemandIds);
  const demands = input.data.demands.filter((demand) => targetIds.has(demand.id));
  if (demands.length !== targetIds.size || demands.some((demand) => demand.salesContractNo !== input.mutation.salesContractNo)) throw new Error("预计到料计划引用了不存在或跨合同的需求");
  if (demands.some(isFactorySupplied)) throw new Error("厂供物料不参与分批预计到料计划");
  for (const batch of input.mutation.batches) {
    if (batch.salesContractNo !== input.mutation.salesContractNo || batch.canonicalMaterialKey !== input.mutation.canonicalMaterialKey) throw new Error("预计到料批次的合同或真实物料身份不一致");
    if (batch.allocations.some((allocation) => !targetIds.has(allocation.materialDemandId))) throw new Error("预计到料批次包含当前物料以外的需求");
  }
  const before = input.data.expectedArrivalBatches.filter((batch) => batch.allocations.some((allocation) => targetIds.has(allocation.materialDemandId)));
  const untouched = input.data.expectedArrivalBatches.flatMap((batch) => {
    const allocations = batch.allocations.filter((allocation) => !targetIds.has(allocation.materialDemandId));
    return allocations.length ? [{ ...clone(batch), allocations }] : [];
  });
  const nextData = validateStyleProgressData({ ...clone(input.data), expectedArrivalBatches: [...untouched, ...clone(input.mutation.batches)] });
  return { before: clone(before), after: clone(input.mutation.batches), data: nextData };
}

export function mergeImportedDemand(incoming: MaterialDemand, existing?: MaterialDemand): MaterialDemand {
  if (existing?.expectedDateSource === "manual") {
    return {
      ...incoming,
      expectedMaterialReadyDate: existing.expectedMaterialReadyDate,
      expectedDateSource: "manual",
      createdAt: existing.createdAt,
    };
  }
  return {
    ...incoming,
    expectedMaterialReadyDate: incoming.sourceMaterialDueDate,
    expectedDateSource: "source",
    createdAt: existing?.createdAt ?? incoming.createdAt,
  };
}

export function findStaleApiMaterialDemandIds(input: {
  existingDemands: MaterialDemand[];
  incomingDemandIds: Set<string>;
  insideOrderNo: string;
}): Set<string> {
  const normalizedQuery = input.insideOrderNo.normalize("NFKC").trim().toLocaleUpperCase();
  return new Set(input.existingDemands
    .filter((demand) => demand.sourceKind === "api"
      && demand.sourceFactoryStyleNoSnapshot.normalize("NFKC").trim().toLocaleUpperCase() === normalizedQuery
      && !input.incomingDemandIds.has(demand.id))
    .map((demand) => demand.id));
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("款式进度存储操作失败"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("款式进度存储事务失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("款式进度存储事务已中止"));
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("当前浏览器不支持 IndexedDB，无法保存万行级物料记录"));
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const [key, name] of Object.entries(STORES) as [StoreKey, string][]) {
        if (database.objectStoreNames.contains(name)) continue;
        const store = database.createObjectStore(name, { keyPath: "id" });
        if (key === "demands") store.createIndex("salesContractNo", "salesContractNo", { unique: false });
        if (key !== "batches" && key !== "rawSnapshots" && key !== "demands" && key !== "expectedArrivalBatches") store.createIndex("materialDemandId", "materialDemandId", { unique: false });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) database.createObjectStore(METADATA_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开款式进度数据库"));
  });
  return databasePromise;
}

async function readStore<T>(key: StoreKey): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction(STORES[key], "readonly");
  return requestResult(transaction.objectStore(STORES[key]).getAll() as IDBRequest<T[]>);
}

export interface StyleProgressRepository {
  loadAll(): Promise<StyleProgressData>;
  listDemands(): Promise<MaterialDemand[]>;
  listDemandsByContract(salesContractNo: string): Promise<MaterialDemand[]>;
  listExpectedArrivalBatchesByContract(salesContractNo: string): Promise<MaterialExpectedArrivalBatch[]>;
  hasCommittedFile(fileHash: string): Promise<boolean>;
  commitImport(preview: MaterialImportPreview): Promise<MaterialImportCommitReport>;
  replaceExpectedArrivalBatches(mutation: ExpectedArrivalPlanMutation): Promise<ExpectedArrivalPlanMutationResult>;
  restoreExpectedArrivalBatchesToSource(input: Omit<ExpectedArrivalPlanMutation, "batches"> & { updatedAt?: string; updatedBy: string }): Promise<ExpectedArrivalPlanMutationResult>;
  updateExpectedDate(demandId: string, expectedDate: string | null, source: "source" | "manual", updatedAt?: string): Promise<MaterialDemand>;
}

export const styleProgressRepository: StyleProgressRepository = {
  async loadAll() {
    const [batches, rawSnapshots, demands, purchaseEvents, inboundEvents, shipmentEvents, outboundEvents, expectedArrivalBatches] = await Promise.all([
      readStore<StyleProgressData["batches"][number]>("batches"), readStore<StyleProgressData["rawSnapshots"][number]>("rawSnapshots"), readStore<MaterialDemand>("demands"),
      readStore<StyleProgressData["purchaseEvents"][number]>("purchaseEvents"), readStore<StyleProgressData["inboundEvents"][number]>("inboundEvents"), readStore<StyleProgressData["shipmentEvents"][number]>("shipmentEvents"), readStore<StyleProgressData["outboundEvents"][number]>("outboundEvents"),
      readStore<StyleProgressData["expectedArrivalBatches"][number]>("expectedArrivalBatches"),
    ]);
    const database = await openDatabase();
    const metadataTransaction = database.transaction(METADATA_STORE, "readonly");
    const metadata = await requestResult(metadataTransaction.objectStore(METADATA_STORE).get(METADATA_ID) as IDBRequest<{ id: string; dataVersion: number } | undefined>);
    const current = validateStyleProgressData({ dataVersion: metadata?.dataVersion ?? 2, batches, rawSnapshots, demands, purchaseEvents, inboundEvents, shipmentEvents, outboundEvents, expectedArrivalBatches });
    const migrated = removeFactorySuppliedExpectedArrivals(migrateStyleProgressDataV4(current));
    const changed = migrated.demands.filter((demand, index) => demand.actualConsumption !== current.demands[index]?.actualConsumption || demand.supplyMethod !== current.demands[index]?.supplyMethod);
    const needsDataWrite = (metadata?.dataVersion ?? 2) < 4;
    const expectedArrivalsChanged = JSON.stringify(current.expectedArrivalBatches) !== JSON.stringify(migrated.expectedArrivalBatches);
    if (changed.length || needsDataWrite || expectedArrivalsChanged) {
      const transaction = database.transaction([STORES.demands, STORES.expectedArrivalBatches, METADATA_STORE], "readwrite");
      const store = transaction.objectStore(STORES.demands);
      for (const demand of changed) store.put(demand);
      if (needsDataWrite || expectedArrivalsChanged) {
        const batchStore = transaction.objectStore(STORES.expectedArrivalBatches);
        batchStore.clear();
        for (const batch of migrated.expectedArrivalBatches) batchStore.put(batch);
      }
      if (needsDataWrite) {
        transaction.objectStore(METADATA_STORE).put({ id: METADATA_ID, dataVersion: 4 });
      }
      await transactionComplete(transaction);
    }
    return migrated;
  },
  async listDemands() { return readStore<MaterialDemand>("demands"); },
  async listDemandsByContract(salesContractNo) {
    const database = await openDatabase();
    const transaction = database.transaction(STORES.demands, "readonly");
    const index = transaction.objectStore(STORES.demands).index("salesContractNo");
    return requestResult(index.getAll(salesContractNo.normalize("NFKC").trim().toLocaleUpperCase()) as IDBRequest<MaterialDemand[]>);
  },
  async listExpectedArrivalBatchesByContract(salesContractNo) {
    const normalized = salesContractNo.normalize("NFKC").trim().toLocaleUpperCase();
    return (await readStore<MaterialExpectedArrivalBatch>("expectedArrivalBatches"))
      .filter((batch) => batch.salesContractNo === normalized)
      .map(clone);
  },
  async hasCommittedFile(fileHash) {
    const batches = await readStore<StyleProgressData["batches"][number]>("batches");
    return batches.some((batch) => batch.sourceKind !== "api" && batch.fileHash === fileHash && batch.status === "committed");
  },
  async commitImport(preview) {
    const database = await openDatabase();
    const storeNames = [...Object.values(STORES), METADATA_STORE];
    const transaction = database.transaction(storeNames, "readwrite");
    const batchStore = transaction.objectStore(STORES.batches);
    const existingBatch = await requestResult(batchStore.get(preview.batch.id) as IDBRequest<StyleProgressData["batches"][number] | undefined>);
    if (existingBatch?.status === "committed") {
      transaction.abort();
      return { duplicateFile: true, newDemands: 0, updatedDemands: 0, newPurchaseEvents: 0, newInboundEvents: 0, newShipmentEvents: 0, newOutboundEvents: 0, newRawSnapshots: 0 };
    }
    const existingDemands = await requestResult(transaction.objectStore(STORES.demands).getAll() as IDBRequest<MaterialDemand[]>);
    const demandMap = new Map(existingDemands.map((item) => [item.id, item]));
    const incomingDemandIds = new Set(preview.demands.map((item) => item.id));
    const staleDemandIds = preview.replaceSourceScope
      ? findStaleApiMaterialDemandIds({ existingDemands, incomingDemandIds, insideOrderNo: preview.replaceSourceScope.queryContext.insideOrderNo })
      : new Set<string>();
    const eventKeys = ["rawSnapshots", "purchaseEvents", "inboundEvents", "shipmentEvents", "outboundEvents"] as const;
    const existingKeys = Object.fromEntries(await Promise.all(eventKeys.map(async (key) => [key, new Set((await requestResult(transaction.objectStore(STORES[key]).getAllKeys())).map(String))]))) as Partial<Record<StoreKey, Set<string>>>;
    let updatedDemands = 0;
    const mergedIncomingDemands: MaterialDemand[] = [];
    for (const incoming of preview.demands) {
      const existing = demandMap.get(incoming.id);
      const next = mergeImportedDemand(incoming, existing);
      if (existing) updatedDemands += 1;
      mergedIncomingDemands.push(next);
      transaction.objectStore(STORES.demands).put(next);
    }
    for (const staleDemandId of staleDemandIds) transaction.objectStore(STORES.demands).delete(staleDemandId);
    const affectedDemandIds = new Set([...incomingDemandIds, ...staleDemandIds]);
    for (const key of ["purchaseEvents", "inboundEvents", "shipmentEvents", "outboundEvents"] as const) {
      const store = transaction.objectStore(STORES[key]);
      const incomingIds = new Set(preview[key].map((item) => item.id));
      const existingEvents = await requestResult(store.getAll() as IDBRequest<Array<{ id: string; materialDemandId: string }>>);
      for (const event of existingEvents) {
        if (affectedDemandIds.has(event.materialDemandId) && !incomingIds.has(event.id)) store.delete(event.id);
      }
    }
    const writeMany = <T extends { id: string }>(key: StoreKey, rows: T[]) => { const store = transaction.objectStore(STORES[key]); for (const row of rows) store.put(row); };
    writeMany("rawSnapshots", preview.rawSnapshots); writeMany("purchaseEvents", preview.purchaseEvents); writeMany("inboundEvents", preview.inboundEvents); writeMany("shipmentEvents", preview.shipmentEvents); writeMany("outboundEvents", preview.outboundEvents);
    const existingExpectedArrivals = (await requestResult(transaction.objectStore(STORES.expectedArrivalBatches).getAll() as IDBRequest<MaterialExpectedArrivalBatch[]>))
      .flatMap((batch) => {
        const allocations = batch.allocations.filter((allocation) => !staleDemandIds.has(allocation.materialDemandId));
        return allocations.length ? [{ ...batch, allocations }] : [];
      });
    const reconciledExpectedArrivals = reconcileExpectedArrivalBatchesAfterImport({
      existingBatches: existingExpectedArrivals,
      incomingDemands: mergedIncomingDemands,
      incomingPurchaseEvents: preview.purchaseEvents,
    });
    const mergedIncomingById = new Map(mergedIncomingDemands.map((demand) => [demand.id, demand]));
    const candidateDemands = existingDemands
      .filter((existing) => !staleDemandIds.has(existing.id))
      .map((existing) => mergedIncomingById.get(existing.id) ?? existing);
    for (const incoming of mergedIncomingDemands) if (!demandMap.has(incoming.id)) candidateDemands.push(incoming);
    try {
      validateStyleProgressData({
        ...emptyStyleProgressData(),
        demands: candidateDemands,
        purchaseEvents: preview.purchaseEvents,
        expectedArrivalBatches: reconciledExpectedArrivals,
      });
    } catch (error) {
      transaction.abort();
      throw error;
    }
    const expectedArrivalStore = transaction.objectStore(STORES.expectedArrivalBatches);
    expectedArrivalStore.clear();
    for (const batch of reconciledExpectedArrivals) expectedArrivalStore.put(batch);
    transaction.objectStore(METADATA_STORE).put({ id: METADATA_ID, dataVersion: 4 });
    batchStore.put({ ...preview.batch, status: "committed", committedAt: new Date().toISOString() });
    await transactionComplete(transaction);
    const newCount = (key: StoreKey, rows: { id: string }[]) => rows.filter((row) => !existingKeys[key]?.has(row.id)).length;
    return {
      duplicateFile: false,
      newDemands: preview.demands.length - updatedDemands,
      updatedDemands,
      newPurchaseEvents: newCount("purchaseEvents", preview.purchaseEvents),
      newInboundEvents: newCount("inboundEvents", preview.inboundEvents),
      newShipmentEvents: newCount("shipmentEvents", preview.shipmentEvents),
      newOutboundEvents: newCount("outboundEvents", preview.outboundEvents),
      newRawSnapshots: newCount("rawSnapshots", preview.rawSnapshots),
    };
  },
  async replaceExpectedArrivalBatches(mutation) {
    const current = await styleProgressRepository.loadAll();
    const replaced = replacePlanInMemory({ data: current, mutation });
    const database = await openDatabase();
    const transaction = database.transaction([STORES.demands, STORES.expectedArrivalBatches], "readwrite");
    const targetIds = new Set(mutation.materialDemandIds);
    const latestDate = mutation.batches.map((batch) => batch.expectedArrivalAtHubDate).sort().at(-1) ?? null;
    for (const demand of replaced.data.demands.filter((item) => targetIds.has(item.id))) {
      transaction.objectStore(STORES.demands).put({
        ...demand,
        expectedMaterialReadyDate: latestDate,
        expectedDateSource: "manual",
        updatedAt: mutation.batches.map((batch) => batch.updatedAt).sort().at(-1) ?? demand.updatedAt,
      });
    }
    const batchStore = transaction.objectStore(STORES.expectedArrivalBatches);
    batchStore.clear();
    for (const batch of replaced.data.expectedArrivalBatches) batchStore.put(batch);
    await transactionComplete(transaction);
    return { before: replaced.before, after: replaced.after };
  },
  async restoreExpectedArrivalBatchesToSource(input) {
    const current = await styleProgressRepository.loadAll();
    const targetIds = new Set(input.materialDemandIds);
    const demands = current.demands.filter((demand) => targetIds.has(demand.id));
    if (demands.length !== targetIds.size) throw new Error("恢复来源计划引用了不存在的需求");
    const now = input.updatedAt ?? new Date().toISOString();
    const sourceBatches = reconcileExpectedArrivalBatchesAfterImport({
      existingBatches: [],
      incomingDemands: demands.map((demand) => ({ ...demand, expectedDateSource: "source" as const })),
      incomingPurchaseEvents: current.purchaseEvents,
    }).map((batch) => ({ ...batch, updatedAt: now, updatedBy: input.updatedBy }));
    const replaced = replacePlanInMemory({ data: current, mutation: { ...input, batches: sourceBatches } });
    const database = await openDatabase();
    const transaction = database.transaction([STORES.demands, STORES.expectedArrivalBatches], "readwrite");
    for (const demand of demands) transaction.objectStore(STORES.demands).put({ ...demand, expectedMaterialReadyDate: demand.sourceMaterialDueDate, expectedDateSource: "source", updatedAt: now });
    const batchStore = transaction.objectStore(STORES.expectedArrivalBatches);
    batchStore.clear();
    for (const batch of replaced.data.expectedArrivalBatches) batchStore.put(batch);
    await transactionComplete(transaction);
    return { before: replaced.before, after: replaced.after };
  },
  async updateExpectedDate(demandId, expectedDate, source, updatedAt = new Date().toISOString()) {
    const current = await styleProgressRepository.loadAll();
    const demand = current.demands.find((item) => item.id === demandId);
    if (!demand) throw new Error("物料需求不存在");
    const identity = resolveCanonicalMaterialIdentity(demand, current.purchaseEvents);
    if (source === "source") {
      await styleProgressRepository.restoreExpectedArrivalBatchesToSource({ salesContractNo: demand.salesContractNo, canonicalMaterialKey: identity.key, materialDemandIds: [demand.id], updatedAt, updatedBy: "legacy-expected-date" });
    } else {
      const batches: MaterialExpectedArrivalBatch[] = expectedDate && demand.requiredQuantity > 0 ? [{
        id: `material-arrival-manual-${stableStyleProgressHash([demand.id, expectedDate])}`,
        salesContractNo: demand.salesContractNo,
        canonicalMaterialKey: identity.key,
        expectedArrivalAtHubDate: expectedDate,
        dateSource: "manual",
        allocations: [{ id: `material-allocation-${stableStyleProgressHash([demand.id, expectedDate])}`, materialDemandId: demand.id, quantity: demand.requiredQuantity }],
        createdAt: updatedAt,
        createdBy: "legacy-expected-date",
        updatedAt,
        updatedBy: "legacy-expected-date",
      }] : [];
      await styleProgressRepository.replaceExpectedArrivalBatches({ salesContractNo: demand.salesContractNo, canonicalMaterialKey: identity.key, materialDemandIds: [demand.id], batches });
    }
    return clone((await styleProgressRepository.listDemands()).find((item) => item.id === demandId)!);
  },
};

export async function exportStyleProgressData(): Promise<StyleProgressData> {
  if (typeof indexedDB === "undefined") return emptyStyleProgressData();
  return styleProgressRepository.loadAll();
}

export async function replaceStyleProgressData(value: StyleProgressData): Promise<void> {
  const data = removeFactorySuppliedExpectedArrivals(migrateStyleProgressDataV4(validateStyleProgressData(value)));
  const database = await openDatabase();
  const transaction = database.transaction([...Object.values(STORES), METADATA_STORE], "readwrite");
  for (const key of Object.keys(STORES) as StoreKey[]) {
    const store = transaction.objectStore(STORES[key]);
    store.clear();
    for (const row of data[key]) store.put(row);
  }
  transaction.objectStore(METADATA_STORE).clear();
  transaction.objectStore(METADATA_STORE).put({ id: METADATA_ID, dataVersion: data.dataVersion });
  await transactionComplete(transaction);
}

export async function clearStyleProgressData(): Promise<void> { await replaceStyleProgressData(emptyStyleProgressData()); }

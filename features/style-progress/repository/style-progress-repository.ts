"use client";

import { emptyStyleProgressData, migrateStyleProgressDataV3, validateStyleProgressData, type MaterialDemand, type MaterialImportCommitReport, type MaterialImportPreview, type StyleProgressData } from "../model/style-progress.ts";

const DATABASE_NAME = "zhixu-style-progress";
const DATABASE_VERSION = 3;
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
  hasCommittedFile(fileHash: string): Promise<boolean>;
  commitImport(preview: MaterialImportPreview): Promise<MaterialImportCommitReport>;
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
    const migrated = migrateStyleProgressDataV3(current);
    const changed = migrated.demands.filter((demand, index) => demand.actualConsumption !== current.demands[index]?.actualConsumption || demand.supplyMethod !== current.demands[index]?.supplyMethod);
    const needsV3Write = (metadata?.dataVersion ?? 2) < 3;
    if (changed.length || needsV3Write) {
      const transaction = database.transaction([STORES.demands, STORES.expectedArrivalBatches, METADATA_STORE], "readwrite");
      const store = transaction.objectStore(STORES.demands);
      for (const demand of changed) store.put(demand);
      if (needsV3Write) {
        const batchStore = transaction.objectStore(STORES.expectedArrivalBatches);
        for (const batch of migrated.expectedArrivalBatches) batchStore.put(batch);
        transaction.objectStore(METADATA_STORE).put({ id: METADATA_ID, dataVersion: 3 });
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
  async hasCommittedFile(fileHash) {
    const batches = await readStore<StyleProgressData["batches"][number]>("batches");
    return batches.some((batch) => batch.fileHash === fileHash && batch.status === "committed");
  },
  async commitImport(preview) {
    const database = await openDatabase();
    const storeNames = Object.values(STORES).filter((name) => name !== STORES.expectedArrivalBatches);
    const transaction = database.transaction(storeNames, "readwrite");
    const batchStore = transaction.objectStore(STORES.batches);
    const existingBatch = await requestResult(batchStore.get(preview.batch.id) as IDBRequest<StyleProgressData["batches"][number] | undefined>);
    if (existingBatch?.status === "committed") {
      transaction.abort();
      return { duplicateFile: true, newDemands: 0, updatedDemands: 0, newPurchaseEvents: 0, newInboundEvents: 0, newShipmentEvents: 0, newOutboundEvents: 0, newRawSnapshots: 0 };
    }
    const existingDemands = await requestResult(transaction.objectStore(STORES.demands).getAll() as IDBRequest<MaterialDemand[]>);
    const demandMap = new Map(existingDemands.map((item) => [item.id, item]));
    const eventKeys = ["rawSnapshots", "purchaseEvents", "inboundEvents", "shipmentEvents", "outboundEvents"] as const;
    const existingKeys = Object.fromEntries(await Promise.all(eventKeys.map(async (key) => [key, new Set((await requestResult(transaction.objectStore(STORES[key]).getAllKeys())).map(String))]))) as Partial<Record<StoreKey, Set<string>>>;
    let updatedDemands = 0;
    for (const incoming of preview.demands) {
      const existing = demandMap.get(incoming.id);
      const next = mergeImportedDemand(incoming, existing);
      if (existing) updatedDemands += 1;
      transaction.objectStore(STORES.demands).put(next);
    }
    const affectedDemandIds = new Set(preview.demands.map((item) => item.id));
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
  async updateExpectedDate(demandId, expectedDate, source, updatedAt = new Date().toISOString()) {
    const database = await openDatabase();
    const transaction = database.transaction(STORES.demands, "readwrite");
    const store = transaction.objectStore(STORES.demands);
    const demand = await requestResult(store.get(demandId) as IDBRequest<MaterialDemand | undefined>);
    if (!demand) throw new Error("物料需求不存在");
    const next = { ...demand, expectedMaterialReadyDate: source === "source" ? demand.sourceMaterialDueDate : expectedDate, expectedDateSource: source, updatedAt };
    store.put(next);
    await transactionComplete(transaction);
    return structuredClone(next);
  },
};

export async function exportStyleProgressData(): Promise<StyleProgressData> {
  if (typeof indexedDB === "undefined") return emptyStyleProgressData();
  return styleProgressRepository.loadAll();
}

export async function replaceStyleProgressData(value: StyleProgressData): Promise<void> {
  const data = migrateStyleProgressDataV3(validateStyleProgressData(value));
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

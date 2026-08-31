"use client";

import { createOperationLogChanges, type OperationLog, type OperationLogDraft } from "../model/operation-log.ts";
import {
  browserLocalDataStore,
  createLocalDataStore,
  LEGACY_LOCAL_DATA_KEYS,
  TEST_LOCAL_DATA_NAMESPACE,
  type LocalDataStore,
  type LocalStorageLike,
} from "../../data-management/repository/local-data-store.ts";

export const OPERATION_LOG_STORAGE_NAME = "operation-logs";

export interface OperationLogRepository {
  append(log: OperationLogDraft): Promise<OperationLog>;
  appendMany(logs: OperationLogDraft[]): Promise<OperationLog[]>;
  list(): Promise<OperationLog[]>;
  listByQuoteId(quoteId: string): Promise<OperationLog[]>;
  listByOrderId(orderId: string): Promise<OperationLog[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const id = () => globalThis.crypto?.randomUUID?.() ?? `operation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function createOperationLogRepository(storage?: LocalStorageLike | null, storeOverride?: LocalDataStore): OperationLogRepository {
  let memory: OperationLog[] = [];
  const store = storeOverride ?? (storage === undefined
    ? browserLocalDataStore
    : createLocalDataStore({ storage, namespace: TEST_LOCAL_DATA_NAMESPACE, environment: "test" }));
  const read = () => {
    const source = store.initialize(OPERATION_LOG_STORAGE_NAME, {
      seed: () => memory,
      legacySources: storage === undefined && typeof window !== "undefined"
        ? [{ key: LEGACY_LOCAL_DATA_KEYS.operationLogs, storage: window.localStorage }]
        : storage ? [{ key: LEGACY_LOCAL_DATA_KEYS.operationLogs, storage }] : [],
      migrate: (value) => Array.isArray(value) ? value as OperationLog[] : [],
    });
    return source.map((log) => ({ ...log, changes: Array.isArray(log.changes) ? log.changes : createOperationLogChanges(log.beforeData, log.afterData) }));
  };
  const write = (logs: OperationLog[]) => {
    const next = clone(logs);
    memory = next;
    store.save(OPERATION_LOG_STORAGE_NAME, next);
  };
  const appendMany = async (drafts: OperationLogDraft[]) => {
    if (!drafts.length) return [];
    const appended: OperationLog[] = drafts.map((item) => ({ ...clone(item), changes: item.changes ?? createOperationLogChanges(item.beforeData, item.afterData), id: id() }));
    write([...read(), ...appended]);
    return clone(appended);
  };
  return {
    async append(log) { return (await appendMany([log]))[0]; },
    appendMany,
    async list() {
      return clone(read().sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    },
    async listByQuoteId(quoteId) {
      return clone(read()
        .filter((log) => log.quoteId === quoteId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    },
    async listByOrderId(orderId) {
      return clone(read()
        .filter((log) => log.beforeData?.orderId === orderId || log.afterData?.orderId === orderId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    },
  };
}

export const operationLogRepository = createOperationLogRepository();

export const operationLogStorageKey = browserLocalDataStore.key(OPERATION_LOG_STORAGE_NAME);

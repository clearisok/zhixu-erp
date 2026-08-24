"use client";

import type { OperationLog, OperationLogDraft } from "../model/operation-log";

const STORAGE_KEY = "zhixu.operation-logs.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface OperationLogRepository {
  append(log: OperationLogDraft): Promise<OperationLog>;
  appendMany(logs: OperationLogDraft[]): Promise<OperationLog[]>;
  list(): Promise<OperationLog[]>;
  listByQuoteId(quoteId: string): Promise<OperationLog[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const id = () => globalThis.crypto?.randomUUID?.() ?? `operation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function createOperationLogRepository(storage?: StorageLike | null): OperationLogRepository {
  let memory: OperationLog[] = [];
  const target = () => storage === undefined && typeof window !== "undefined" ? window.localStorage : storage ?? null;
  const read = () => {
    const current = target();
    if (!current) return memory;
    const raw = current.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as OperationLog[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const write = (logs: OperationLog[]) => {
    const next = clone(logs);
    const current = target();
    if (current) current.setItem(STORAGE_KEY, JSON.stringify(next));
    else memory = next;
  };
  const appendMany = async (drafts: OperationLogDraft[]) => {
    if (!drafts.length) return [];
    const appended = drafts.map((item) => ({ ...clone(item), id: id() }));
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
  };
}

export const operationLogRepository = createOperationLogRepository();

export const operationLogStorageKey = STORAGE_KEY;

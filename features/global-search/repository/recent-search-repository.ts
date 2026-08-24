"use client";

import type { SearchResult } from "../model/global-search";

const STORAGE_KEY = "zhixu.global-search.recent.v1";
const MAX_RECENT_RESULTS = 6;
type RecentState = Record<string, SearchResult[]>;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type RecentSearchRepository = {
  list: (userId: string) => SearchResult[];
  record: (userId: string, result: SearchResult) => SearchResult[];
};

const clone = <T>(value: T): T => structuredClone(value);

export function createRecentSearchRepository(storage?: StorageLike | null): RecentSearchRepository {
  let memory: RecentState = {};
  const target = () => storage === undefined && typeof window !== "undefined" ? window.localStorage : storage ?? null;
  const read = (): RecentState => {
    const current = target();
    if (!current) return memory;
    const raw = current.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as RecentState;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };
  const write = (state: RecentState) => {
    const next = clone(state);
    const current = target();
    if (current) current.setItem(STORAGE_KEY, JSON.stringify(next));
    else memory = next;
  };
  return {
    list(userId) { return clone(read()[userId] ?? []); },
    record(userId, result) {
      const state = read();
      const current = state[userId] ?? [];
      const next = [clone(result), ...current.filter((item) => item.id !== result.id)].slice(0, MAX_RECENT_RESULTS);
      write({ ...state, [userId]: next });
      return clone(next);
    },
  };
}

export const recentSearchRepository = createRecentSearchRepository();
export const recentSearchStorageKey = STORAGE_KEY;

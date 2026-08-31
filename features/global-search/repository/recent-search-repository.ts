"use client";

import type { SearchResult } from "../model/global-search";
import {
  browserLocalDataStore,
  createLocalDataStore,
  LEGACY_LOCAL_DATA_KEYS,
  TEST_LOCAL_DATA_NAMESPACE,
  type LocalStorageLike,
} from "../../data-management/repository/local-data-store.ts";

const STORAGE_NAME = "recent-search";
const MAX_RECENT_RESULTS = 6;
type RecentState = Record<string, SearchResult[]>;

export type RecentSearchRepository = {
  list: (userId: string) => SearchResult[];
  record: (userId: string, result: SearchResult) => SearchResult[];
};

const clone = <T>(value: T): T => structuredClone(value);

export function createRecentSearchRepository(storage?: LocalStorageLike | null): RecentSearchRepository {
  let memory: RecentState = {};
  const store = storage === undefined
    ? browserLocalDataStore
    : createLocalDataStore({ storage, namespace: TEST_LOCAL_DATA_NAMESPACE, environment: "test" });
  const read = (): RecentState => {
    return store.initialize(STORAGE_NAME, {
      seed: () => memory,
      legacySources: storage === undefined && typeof window !== "undefined"
        ? [{ key: LEGACY_LOCAL_DATA_KEYS.recentSearch, storage: window.localStorage }]
        : storage ? [{ key: LEGACY_LOCAL_DATA_KEYS.recentSearch, storage }] : [],
      migrate: (value) => value && typeof value === "object" && !Array.isArray(value) ? value as RecentState : {},
    });
  };
  const write = (state: RecentState) => {
    const next = clone(state);
    memory = next;
    store.save(STORAGE_NAME, next);
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
export const recentSearchStorageKey = browserLocalDataStore.key(STORAGE_NAME);

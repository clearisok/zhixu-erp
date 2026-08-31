"use client";

import { browserLocalDataStore, type LocalDataStore } from "../../data-management/repository/local-data-store.ts";
import { emptyClosingState, validateClosingState, type ClosingState } from "../model/closing.ts";

export const CLOSING_STORAGE_NAME = "closing-center";
export interface ClosingRepository { load(): Promise<ClosingState>; save(state: ClosingState): Promise<ClosingState>; }

export function createClosingRepository(store: LocalDataStore = browserLocalDataStore): ClosingRepository {
  let memory: ClosingState | null = null;
  return {
    async load() {
      memory ??= validateClosingState(store.initialize(CLOSING_STORAGE_NAME, { seed: emptyClosingState, migrate: validateClosingState }));
      return structuredClone(memory);
    },
    async save(state) {
      const next = validateClosingState(state);
      memory = store.save(CLOSING_STORAGE_NAME, next);
      return structuredClone(memory);
    },
  };
}

export const closingRepository = createClosingRepository();

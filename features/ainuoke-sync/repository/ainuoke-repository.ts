"use client";

import { browserLocalDataStore, type LocalDataStore } from "../../data-management/repository/local-data-store.ts";
import { emptyAinuokeSyncState, validateAinuokeSyncState, type AinuokeSyncState } from "../model/ainuoke.ts";

export const AINUOKE_STORAGE_NAME = "ainuoke-sync";

export interface AinuokeRepository {
  load(): Promise<AinuokeSyncState>;
  save(state: AinuokeSyncState): Promise<AinuokeSyncState>;
}

export function createAinuokeRepository(store: LocalDataStore = browserLocalDataStore): AinuokeRepository {
  let memory: AinuokeSyncState | null = null;
  return {
    async load() {
      memory ??= validateAinuokeSyncState(store.initialize(AINUOKE_STORAGE_NAME, { seed: emptyAinuokeSyncState, migrate: validateAinuokeSyncState }));
      return structuredClone(memory);
    },
    async save(state) {
      memory = store.save(AINUOKE_STORAGE_NAME, validateAinuokeSyncState(state));
      return structuredClone(memory);
    },
  };
}

export const ainuokeRepository = createAinuokeRepository();

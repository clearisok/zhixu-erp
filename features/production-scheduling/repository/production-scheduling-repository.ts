"use client";

import { browserLocalDataStore, type LocalDataStore } from "../../data-management/repository/local-data-store.ts";
import { emptyProductionSchedulingState, validateProductionSchedulingState, type ProductionSchedulingState } from "../model/production-scheduling.ts";
import { migrateProductionSchedulingV8ToV9 } from "../migration/production-scheduling-v8-to-v9.ts";

export const PRODUCTION_SCHEDULING_STORAGE_NAME = "production-scheduling";

export interface ProductionSchedulingRepository {
  load(): Promise<ProductionSchedulingState>;
  save(state: ProductionSchedulingState): Promise<ProductionSchedulingState>;
}

export function createProductionSchedulingRepository(store: LocalDataStore = browserLocalDataStore): ProductionSchedulingRepository {
  let memory: ProductionSchedulingState | null = null;
  return {
    async load() {
      memory ??= validateProductionSchedulingState(store.initialize(PRODUCTION_SCHEDULING_STORAGE_NAME, {
        seed: emptyProductionSchedulingState,
        migrate: (value) => validateProductionSchedulingState(migrateProductionSchedulingV8ToV9(value)),
      }));
      return structuredClone(memory);
    },
    async save(state) {
      const next = validateProductionSchedulingState(state);
      memory = store.save(PRODUCTION_SCHEDULING_STORAGE_NAME, next);
      return structuredClone(memory);
    },
  };
}

export const productionSchedulingRepository = createProductionSchedulingRepository();
export const productionSchedulingStorageKey = browserLocalDataStore.key(PRODUCTION_SCHEDULING_STORAGE_NAME);

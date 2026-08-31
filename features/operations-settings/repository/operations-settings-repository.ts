import { browserLocalDataStore, type LocalDataStore } from "../../data-management/repository/local-data-store.ts";
import { defaultOperationsSettings, normalizeOperationsSettings, type OperationsSettingsState } from "../model/operations-settings.ts";

export const OPERATIONS_SETTINGS_STORAGE_NAME = "operations-settings";

export function createOperationsSettingsRepository(store: LocalDataStore = browserLocalDataStore) {
  return {
    load(): OperationsSettingsState {
      return normalizeOperationsSettings(store.initialize(OPERATIONS_SETTINGS_STORAGE_NAME, {
        seed: () => structuredClone(defaultOperationsSettings),
        migrate: normalizeOperationsSettings,
      }));
    },
    save(state: OperationsSettingsState): OperationsSettingsState {
      const normalized = normalizeOperationsSettings(state);
      store.save(OPERATIONS_SETTINGS_STORAGE_NAME, normalized);
      return normalized;
    },
  };
}

export const operationsSettingsRepository = createOperationsSettingsRepository();

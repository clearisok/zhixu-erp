import { defaultBasicSettings, normalizeBasicSettings, type BasicSettingsState } from "../model/basic-settings";
import { assertBrowserMasterRead, assertBrowserMasterWrite, masterSettingsAuthority, readFrozenBrowserMasterRecord } from "../authority/master-settings-authority.ts";
import {
  browserLocalDataStore,
  LEGACY_LOCAL_DATA_KEYS,
  type LocalDataStore,
} from "../../data-management/repository/local-data-store.ts";

export const BASIC_SETTINGS_STORAGE_KEY = "zhixu.basic-settings.v1.5";
export const LEGACY_BASIC_SETTINGS_STORAGE_KEY = "zhixu.basic-settings.v1.3";
export const BASIC_SETTINGS_STORAGE_NAME = "basic-settings";

export function createBasicSettingsRepository(store: LocalDataStore = browserLocalDataStore) {
  return {
    load(): BasicSettingsState {
      return normalizeBasicSettings(store.initialize(BASIC_SETTINGS_STORAGE_NAME, {
        seed: () => structuredClone(defaultBasicSettings),
        legacySources: typeof window === "undefined" ? [] : LEGACY_LOCAL_DATA_KEYS.basicSettings.map((key) => ({ key, storage: window.localStorage })),
        migrate: (value) => normalizeBasicSettings(value as Partial<BasicSettingsState>),
      }));
    },
    save(state: BasicSettingsState): BasicSettingsState {
      const normalized = normalizeBasicSettings(state);
      store.save(BASIC_SETTINGS_STORAGE_NAME, normalized);
      return normalized;
    },
  };
}

const basicSettingsRepository = createBasicSettingsRepository();

export function loadBasicSettings(): BasicSettingsState {
  assertBrowserMasterRead();
  if (masterSettingsAuthority() === "frozen") return normalizeBasicSettings(readFrozenBrowserMasterRecord(BASIC_SETTINGS_STORAGE_NAME) as Partial<BasicSettingsState>);
  return basicSettingsRepository.load();
}

export function saveBasicSettings(state: BasicSettingsState): BasicSettingsState {
  assertBrowserMasterWrite();
  return basicSettingsRepository.save(state);
}

export function createMasterDataId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

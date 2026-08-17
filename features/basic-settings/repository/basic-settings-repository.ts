import { defaultBasicSettings, normalizeBasicSettings, type BasicSettingsState } from "../model/basic-settings";

export const BASIC_SETTINGS_STORAGE_KEY = "zhixu.basic-settings.v1.3";

export function loadBasicSettings(): BasicSettingsState {
  if (typeof window === "undefined") return defaultBasicSettings;
  try { return normalizeBasicSettings(JSON.parse(window.localStorage.getItem(BASIC_SETTINGS_STORAGE_KEY) || "null")); }
  catch { return defaultBasicSettings; }
}

export function saveBasicSettings(state: BasicSettingsState): BasicSettingsState {
  const normalized = normalizeBasicSettings(state);
  if (typeof window !== "undefined") window.localStorage.setItem(BASIC_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function createMasterDataId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

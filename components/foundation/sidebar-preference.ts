"use client";

import { browserLocalDataStore, type LocalDataStore } from "../../features/data-management/repository/local-data-store.ts";

export type SidebarPreference = { userId: string; collapsed: boolean };

const storageName = (userId: string) => `shell-preferences.${encodeURIComponent(userId)}`;

function normalize(value: unknown, userId: string): SidebarPreference {
  const source = value && typeof value === "object" ? value as Partial<SidebarPreference> : {};
  return { userId, collapsed: source.collapsed === true };
}

export function createSidebarPreferenceRepository(store: LocalDataStore) {
  return {
    load(userId: string): SidebarPreference {
      return normalize(store.initialize(storageName(userId), { seed: () => ({ userId, collapsed: false }), migrate: (value) => normalize(value, userId) }), userId);
    },
    save(preference: SidebarPreference): SidebarPreference {
      const normalized = normalize(preference, preference.userId);
      store.save(storageName(preference.userId), normalized);
      return normalized;
    },
  };
}

const browserSidebarPreferenceRepository = createSidebarPreferenceRepository(browserLocalDataStore);

export function loadSidebarPreference(userId: string) {
  return typeof window === "undefined" ? { userId, collapsed: false } : browserSidebarPreferenceRepository.load(userId);
}

export function saveSidebarPreference(preference: SidebarPreference) {
  return typeof window === "undefined" ? normalize(preference, preference.userId) : browserSidebarPreferenceRepository.save(preference);
}

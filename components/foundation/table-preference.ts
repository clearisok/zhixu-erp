"use client";

import { browserLocalDataStore, type LocalDataStore } from "../../features/data-management/repository/local-data-store.ts";

export type TablePreference = {
  moduleKey: string;
  tableKey: string;
  columnWidths: Record<string, number>;
  columnOrder: string[];
};

type UserTablePreferences = {
  userId: string;
  tables: Record<string, TablePreference>;
};

const MIN_COLUMN_WIDTH = 56;
const MAX_COLUMN_WIDTH = 720;

const storageName = (userId: string) => `table-preferences.${encodeURIComponent(userId)}`;

export function normalizeColumnWidths(value: unknown, defaults: Record<string, number>): Record<string, number> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const candidate = source[key];
    const width = typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
    return [key, Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)))];
  }));
}

export function normalizeColumnOrder(
  value: unknown,
  defaults: string[],
  aliases: Record<string, string | string[]> = {},
): string[] {
  const allowed = new Set(defaults);
  const normalized: string[] = [];
  const append = (key: string) => {
    if (allowed.has(key) && !normalized.includes(key)) normalized.push(key);
  };
  if (Array.isArray(value)) {
    for (const rawKey of value) {
      if (typeof rawKey !== "string") continue;
      const mapped = aliases[rawKey] ?? rawKey;
      for (const key of Array.isArray(mapped) ? mapped : [mapped]) append(key);
    }
  }
  for (const key of defaults) append(key);
  return normalized;
}

function normalizeUserPreferences(value: unknown, userId: string): UserTablePreferences {
  const source = value && typeof value === "object" ? value as Partial<UserTablePreferences> : {};
  const tables = source.tables && typeof source.tables === "object" ? source.tables : {};
  return { userId, tables: structuredClone(tables) };
}

export function createTablePreferenceRepository(store: LocalDataStore) {
  const loadUser = (userId: string) => normalizeUserPreferences(store.initialize(storageName(userId), { seed: () => ({ userId, tables: {} }), migrate: (value) => normalizeUserPreferences(value, userId) }), userId);
  return {
    load(userId: string, moduleKey: string, tableKey: string, defaults: Record<string, number>, defaultOrder = Object.keys(defaults), aliases: Record<string, string | string[]> = {}): TablePreference {
      const current = loadUser(userId).tables[tableKey];
      return {
        moduleKey,
        tableKey,
        columnWidths: normalizeColumnWidths(current?.columnWidths, defaults),
        columnOrder: normalizeColumnOrder(current?.columnOrder, defaultOrder, aliases),
      };
    },
    save(userId: string, preference: TablePreference, defaults: Record<string, number>, defaultOrder = Object.keys(defaults), aliases: Record<string, string | string[]> = {}): TablePreference {
      const normalized = {
        ...preference,
        columnWidths: normalizeColumnWidths(preference.columnWidths, defaults),
        columnOrder: normalizeColumnOrder(preference.columnOrder, defaultOrder, aliases),
      };
      const current = loadUser(userId);
      store.save(storageName(userId), { ...current, userId, tables: { ...current.tables, [preference.tableKey]: normalized } });
      return normalized;
    },
  };
}

const browserTablePreferenceRepository = createTablePreferenceRepository(browserLocalDataStore);

export function loadTablePreference(userId: string, moduleKey: string, tableKey: string, defaults: Record<string, number>, defaultOrder = Object.keys(defaults), aliases: Record<string, string | string[]> = {}): TablePreference {
  if (typeof window === "undefined") return { moduleKey, tableKey, columnWidths: structuredClone(defaults), columnOrder: [...defaultOrder] };
  return browserTablePreferenceRepository.load(userId, moduleKey, tableKey, defaults, defaultOrder, aliases);
}

export function saveTablePreference(userId: string, preference: TablePreference, defaults: Record<string, number>, defaultOrder = Object.keys(defaults), aliases: Record<string, string | string[]> = {}): TablePreference {
  if (typeof window === "undefined") return { ...preference, columnWidths: normalizeColumnWidths(preference.columnWidths, defaults), columnOrder: normalizeColumnOrder(preference.columnOrder, defaultOrder, aliases) };
  return browserTablePreferenceRepository.save(userId, preference, defaults, defaultOrder, aliases);
}

export function resetTablePreference(userId: string, moduleKey: string, tableKey: string, defaults: Record<string, number>, defaultOrder = Object.keys(defaults)): TablePreference {
  return saveTablePreference(userId, { moduleKey, tableKey, columnWidths: defaults, columnOrder: defaultOrder }, defaults, defaultOrder);
}

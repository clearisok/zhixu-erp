import { allowedBusinessColumns, type BusinessColumn } from "../model/quote-business-view.ts";
import type { TablePreference } from "../../../components/foundation/table-preference.ts";
export type ServerListPreferences = { userId: string; visibleColumns: BusinessColumn[]; columnOrder: BusinessColumn[]; columnWidths: Record<string, number> };
const key = (id: string) => `zhixu.ui.server.quote-list.v1.${encodeURIComponent(id)}`;
export const defaultServerListColumns: BusinessColumn[] = ["quote", "styleIdentity", "brand", "type", "status", "confirmationStatus", "quantity", "fabricCost", "garmentPrice"];
export function normalizeServerListPreferences(userId: string, permissions: readonly string[], value?: unknown): ServerListPreferences {
  const allowed = allowedBusinessColumns(permissions);
  const data = value && typeof value === "object" ? value as Partial<ServerListPreferences> : {};
  const keys = (input: unknown, fallback: BusinessColumn[]) => Array.isArray(input) ? [...new Set(input.filter((k): k is BusinessColumn => allowed.includes(k)))] : fallback;
  const columnOrder = keys(data.columnOrder, [...defaultServerListColumns.filter(k => allowed.includes(k)), ...allowed.filter(k => !defaultServerListColumns.includes(k))]);
  for (const item of allowed) if (!columnOrder.includes(item)) columnOrder.push(item);
  const columnWidths = Object.fromEntries(allowed.map(k => { const width = data.columnWidths?.[k]; return [k, typeof width === "number" && Number.isFinite(width) ? Math.round(Math.max(56, Math.min(720, width))) : k === "styleIdentity" ? 220 : 145]; }));
  return { userId, visibleColumns: keys(data.visibleColumns, defaultServerListColumns.filter(k => allowed.includes(k))), columnOrder, columnWidths };
}
export function loadServerListPreferences(store: Pick<Storage, "getItem">, userId: string, permissions: readonly string[]): ServerListPreferences {
  try { const raw = store.getItem(key(userId)); return normalizeServerListPreferences(userId, permissions, raw ? JSON.parse(raw) : undefined); }
  catch { return normalizeServerListPreferences(userId, permissions); }
}
export function saveServerListPreferences(store: Pick<Storage, "setItem">, value: ServerListPreferences, permissions: readonly string[]) {
  const safe = normalizeServerListPreferences(value.userId, permissions, value);
  store.setItem(key(value.userId), JSON.stringify(safe)); // Only this new UI key. No Browser business repository/defaults.
  return safe;
}
export function listTablePreference(value: ServerListPreferences): TablePreference {
  return { moduleKey: "server-quote", tableKey: "quote-list", columnOrder: value.columnOrder, columnWidths: value.columnWidths };
}

import { allowedBusinessColumns, type BusinessColumn } from "../model/quote-business-view.ts";
import type { TablePreference } from "../../../components/foundation/table-preference.ts";
export type ServerListPreferences = { userId: string; visibleColumns: BusinessColumn[]; columnOrder: BusinessColumn[]; columnWidths: Record<string, number>; presentation: "original" | "fields" };
const key = (id: string) => `zhixu.ui.server.quote-list.v1.${encodeURIComponent(id)}`;
export const defaultServerListColumns: BusinessColumn[] = ["styleImage", "styleIdentity", "brand", "salesperson", "type", "status", "quantity", "fabricCost", "trimCost", "labor", "garmentPrice", "confirmationStatus", "revision", "versions", "date"];
const originalWidths: Partial<Record<BusinessColumn, number>> = { styleImage: 56, styleIdentity: 156, brand: 120, salesperson: 104, type: 80, status: 88, quantity: 72, fabricCost: 126, trimCost: 96, labor: 92, garmentPrice: 120, confirmationStatus: 112, revision: 88, versions: 108, date: 80 };
export function normalizeServerListPreferences(userId: string, permissions: readonly string[], value?: unknown): ServerListPreferences {
  const allowed = allowedBusinessColumns(permissions);
  const data = value && typeof value === "object" ? value as Partial<ServerListPreferences> : {};
  const keys = (input: unknown, fallback: BusinessColumn[]) => Array.isArray(input) ? [...new Set(input.filter((k): k is BusinessColumn => allowed.includes(k)))] : fallback;
  const columnOrder = keys(data.columnOrder, [...defaultServerListColumns.filter(k => allowed.includes(k)), ...allowed.filter(k => !defaultServerListColumns.includes(k))]);
  for (const item of allowed) if (!columnOrder.includes(item)) columnOrder.push(item);
  // Old v1 objects retain their individual-field layout. No storage rewrite on read.
  const presentation = value === undefined || data.presentation === "original" ? "original" : "fields";
  const columnWidths = Object.fromEntries(allowed.map(k => { const width = data.columnWidths?.[k]; return [k, typeof width === "number" && Number.isFinite(width) ? Math.round(Math.max(56, Math.min(720, width))) : presentation === "original" ? originalWidths[k] ?? 145 : k === "styleIdentity" ? 220 : 145]; }));
  return { userId, visibleColumns: keys(data.visibleColumns, defaultServerListColumns.filter(k => allowed.includes(k))), columnOrder, columnWidths, presentation };
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

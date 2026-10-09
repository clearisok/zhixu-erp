import type { BusinessColumn } from "../model/quote-business-view.ts";
import type { ServerListPreferences } from "./list-preferences.ts";
import type { TablePreference } from "../../../components/foundation/table-preference.ts";

const groups: readonly BusinessColumn[][] = [["brand", "salesperson"], ["type", "status"], ["fabricCost", "trimCost", "labor"], ["garmentPrice", "confirmationStatus"], ["revision", "versions"]];
export type PresentedColumn = { key: BusinessColumn; fields: BusinessColumn[] };
/** Presentation only. Every child must be explicitly visible and already authorized. */
export function presentedListColumns(preferences: ServerListPreferences): PresentedColumn[] {
  const visible = preferences.columnOrder.filter(key => preferences.visibleColumns.includes(key));
  const consumed = new Set<BusinessColumn>();
  return visible.flatMap(key => {
    if (consumed.has(key)) return [];
    const group = preferences.presentation === "original" ? groups.find(items => items.includes(key)) : undefined;
    const fields = group ? visible.filter(item => group.includes(item)) : [key];
    fields.forEach(item => consumed.add(item));
    return [{ key, fields }];
  });
}
export function presentedTablePreference(preferences: ServerListPreferences): TablePreference {
  return { moduleKey: "server-quote", tableKey: "quote-list", columnOrder: presentedListColumns(preferences).map(column => column.key), columnWidths: preferences.columnWidths };
}
/** Expand a user-initiated group move; never drop hidden fields or child widths. */
export function applyPresentedTablePreference(preferences: ServerListPreferences, next: TablePreference): ServerListPreferences {
  const columns = presentedListColumns(preferences);
  const ordered = next.columnOrder.flatMap(key => columns.find(column => column.key === key)?.fields ?? []);
  for (const key of preferences.columnOrder) if (!ordered.includes(key)) ordered.push(key);
  const columnWidths = { ...preferences.columnWidths };
  for (const column of columns) {
    const width = next.columnWidths[column.key];
    if (typeof width === "number" && Number.isFinite(width)) columnWidths[column.key] = width;
  }
  return { ...preferences, columnOrder: ordered, columnWidths };
}

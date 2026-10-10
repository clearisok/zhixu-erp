import type { BusinessColumn } from "../model/quote-business-view.ts";
import type { ServerListPreferences } from "./list-preferences.ts";
import { listWidthGroups } from "./list-preferences.ts";
import type { TablePreference } from "../../../components/foundation/table-preference.ts";

const groups: readonly BusinessColumn[][] = [["brand", "salesperson"], ["type", "status"], ["fabricCost", "trimCost", "labor"], ["garmentPrice", "confirmationStatus"], ["revision", "versions"]];
export function presentedWidthKey(preferences: ServerListPreferences, key: BusinessColumn): string {
  return preferences.presentation === "original" ? Object.entries(listWidthGroups).find(([, fields]) => (fields as readonly string[]).includes(key))?.[0] ?? key : key;
}
export function presentedMinWidth(key: BusinessColumn, fields: BusinessColumn[]): number {
  return key === "styleImage" ? 56 : key === "styleIdentity" ? 80 : key === "quote" ? 180 : key === "quantity" ? 72 : key === "type" || key === "date" ? 80 : fields.includes("fabricCost") ? 126 : 88;
}
export function presentedWidth(preferences: ServerListPreferences, key: BusinessColumn): number {
  return preferences.groupWidths[presentedWidthKey(preferences, key)] ?? preferences.columnWidths[key];
}
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
  return { moduleKey: "server-quote", tableKey: "quote-list", columnOrder: presentedListColumns(preferences).map(column => column.key), columnWidths: Object.fromEntries(presentedListColumns(preferences).map(column => [column.key, presentedWidth(preferences, column.key)])) };
}
/** Expand a user-initiated group move; never drop hidden fields or child widths. */
export function applyPresentedTablePreference(preferences: ServerListPreferences, next: TablePreference): ServerListPreferences {
  const columns = presentedListColumns(preferences);
  const ordered = next.columnOrder.flatMap(key => columns.find(column => column.key === key)?.fields ?? []);
  for (const key of preferences.columnOrder) if (!ordered.includes(key)) ordered.push(key);
  const columnWidths = { ...preferences.columnWidths };
  const groupWidths = { ...preferences.groupWidths };
  for (const column of columns) {
    const width = next.columnWidths[column.key];
    if (typeof width === "number" && Number.isFinite(width)) {
      const widthKey = presentedWidthKey(preferences, column.key);
      if (widthKey.startsWith("group.")) groupWidths[widthKey] = width;
      else columnWidths[widthKey] = width;
    }
  }
  return { ...preferences, columnOrder: ordered, columnWidths, groupWidths };
}

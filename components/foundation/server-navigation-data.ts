import type { PermissionKey } from "../../features/permissions/model/permissions";
import { quoteMasterServerClient as masters } from "../../features/basic-settings/server/quote-master-server-client";
import { quoteServerClient } from "../../features/quote-center/server/quote-server-client";
import { loadServerListPreferences } from "../../features/quote-center/server/list-preferences";
import { salesOrderServerClient } from "../../features/order-center/server/sales-order-server-client";
import { initialServerOrderCenterQuery, toServerSalesOrderListQuery } from "../../features/order-center/server/server-order-center-query";
import { navigationReadCache } from "../../features/server-auth/session-read-cache";

/** Called only AFTER the existing dirty/unknown-result navigation guard accepts.
 * No hover reads, RSC prefetch, writes, auth shortcuts or durable list cache.
 */
export function startServerNavigationReads(target: string, userId: string, permissions: readonly PermissionKey[]) {
  if (typeof window === "undefined" || !userId) return;
  try {
  const can = (permission: PermissionKey) => permissions.includes(permission);
  const reads: Array<Promise<unknown>> = [];
  navigationReadCache.clear();
  if (target === "/quote-center" && can("quote.view")) {
    const preferences = loadServerListPreferences(window.localStorage, userId, permissions);
    const columns = preferences.columnOrder.filter(k => preferences.visibleColumns.includes(k));
    reads.push(quoteServerClient.list({ limit: 25, offset: 0, ...(columns.length ? { columns } : {}) }, { preload: true }));
  } else if (target === "/order-center" && can("order.view")) {
    reads.push(salesOrderServerClient.list(toServerSalesOrderListQuery(initialServerOrderCenterQuery), { preload: true }));
  } else {
    const scopes = { "/basic-settings/brands": "brand", "/basic-settings/customer-salespeople": "salesperson", "/basic-settings/fabrics": "fabric", "/basic-settings/trims": "trim" } as const;
    const scope = scopes[target as keyof typeof scopes];
    if (scope && (can("quote.view") || can(`settings.${scope}.edit`))) {
      if (scope === "brand" || scope === "salesperson") reads.push(masters.listBrands());
      if (scope === "salesperson") reads.push(masters.listSalespeople());
      if (scope === "fabric") reads.push(masters.listFabrics());
      if (scope !== "fabric") reads.push(masters.listTrims());
      if (can("quote.view") || can("settings.global.edit")) reads.push(masters.getSettings());
      if (scope === "fabric" || scope === "trim" || can("settings.trim.edit")) reads.push(masters.supplierSuggestions());
    } else if (target === "/system-settings/quote-settings" && (can("quote.view") || can("settings.global.edit"))) {
      reads.push(masters.getSettings(), masters.listPresets());
    }
  }
  // The page owns errors and the normal retry UI; warming must never reject navigation.
  void Promise.allSettled(reads);
  } catch { /* Storage or optional preload failure must not block navigation. */ }
}

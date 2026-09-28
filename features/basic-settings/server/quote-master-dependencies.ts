import type { PermissionKey } from "../../permissions/model/permissions";
import { createCostLineGroupId } from "../../quote-center/model/quote-view-model";
import { browserNumberFromExactDecimal } from "../../quote-center/server/quote-server-editor-adapter";
import type { BasicSettingsState, ResolvedQuoteDefaults } from "../model/basic-settings";
import type { GlobalQuoteSettings } from "../../quote-center/model/quote-settings";
import { createServerBasicSettingsAdapter, type BasicSettingsServerScope } from "./server-basic-settings-adapter";
import { createServerGlobalQuoteSettingsAdapter } from "./server-global-quote-settings-adapter";
import { quoteMasterServerClient, type QuoteMasterServerClient } from "./quote-master-server-client";

/** Reuses the Q3B1 candidate adapters, including their optimistic versions. */
export function createServerQuoteMasterDependencies(permissions: readonly PermissionKey[], client: QuoteMasterServerClient = quoteMasterServerClient) {
  const adapters = {
    brands: createServerBasicSettingsAdapter({ scope: "brands", permissions, client }),
    salespeople: createServerBasicSettingsAdapter({ scope: "salespeople", permissions, client }),
    fabrics: createServerBasicSettingsAdapter({ scope: "fabrics", permissions, client }),
    trims: createServerBasicSettingsAdapter({ scope: "trims", permissions, client }),
  };
  const global = createServerGlobalQuoteSettingsAdapter(client);
  const number = (value: string | null, path: string) => value === null ? null : browserNumberFromExactDecimal(value, path);

  return {
    async load(): Promise<{ state: BasicSettingsState; settings: GlobalQuoteSettings; supplierOptions: string[] }> {
      const [brands, salespeople, fabrics, trims, settings] = await Promise.all([
        adapters.brands.load(), adapters.salespeople.load(), adapters.fabrics.load(), adapters.trims.load(), global.load(),
      ]);
      return {
        state: {
          ...brands,
          brands: brands.brands,
          customerSalespeople: salespeople.customerSalespeople,
          fabricLibrary: fabrics.fabricLibrary,
          trimLibrary: trims.trimLibrary,
        },
        settings,
        supplierOptions: adapters.trims.getSupplierOptions(),
      };
    },
    persist(scope: BasicSettingsServerScope, current: BasicSettingsState, next: BasicSettingsState) {
      return adapters[scope].persist(current, next);
    },
    async resolveDefaults(brandId?: string, salespersonId?: string): Promise<ResolvedQuoteDefaults> {
      const defaults = await client.resolveDefaults(brandId, salespersonId);
      if (!defaults || !Array.isArray(defaults.trims)) throw new Error("Invalid Server default response");
      return {
        usdCnyRate: number(defaults.usdCnyRate, "defaults.usdCnyRate"),
        otherCost: defaults.otherCost ? { name: defaults.otherCost.name, amount: number(defaults.otherCost.amount, "defaults.otherCost.amount") } : null,
        trims: defaults.trims.map((trim) => ({
          id: trim.id,
          lineGroupId: createCostLineGroupId(),
          sourceLibraryItemId: trim.trimLibraryItemId,
          name: trim.name,
          specification: trim.specification,
          supplier: trim.supplier,
          usage: null,
          unit: trim.unit,
          lossRate: number(trim.lossRate, `defaults.trim.${trim.id}.lossRate`),
          unitPrice: number(trim.unitPrice, `defaults.trim.${trim.id}.unitPrice`),
        })),
        sourceLabel: defaults.source.otherCost ?? defaults.source.usdCnyRate ?? defaults.source.trims ?? "system",
      };
    },
  };
}

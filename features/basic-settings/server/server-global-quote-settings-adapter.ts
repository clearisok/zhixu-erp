import type { GlobalQuoteSettings, ManufacturingPreset } from "../../quote-center/model/quote-settings";
import { defaultGlobalQuoteSettings } from "../../quote-center/model/quote-settings";
import { browserNumberFromExactDecimal } from "../../quote-center/server/quote-server-editor-adapter";
import { canonicalDecimal } from "../../../server/quotes/decimal-projection";
import type { GlobalQuoteSettingsDto, ManufacturingPresetDto } from "../../../server/quote-masters/model";
import { quoteMasterServerClient, type QuoteMasterServerClient, type SettingsBundlePreset } from "./quote-master-server-client";

function fromDecimal(value: string | null, path: string): number | null {
  return value === null ? null : browserNumberFromExactDecimal(value, path);
}

function toDecimal(value: number | null): string | null {
  return value === null ? null : canonicalDecimal(String(value));
}

function presetFromServer(value: ManufacturingPresetDto): ManufacturingPreset {
  return {
    id: value.id,
    name: value.name,
    country: value.country,
    laborCurrency: value.laborCurrency,
    markupRate: fromDecimal(value.markupRate, `manufacturingPreset.${value.id}.markupRate`),
    includeFreight: value.includeFreight,
    freightName: value.freightName,
    freightAmount: fromDecimal(value.freightAmount, `manufacturingPreset.${value.id}.freightAmount`),
    status: value.status,
  };
}

function settingsFromServer(settings: GlobalQuoteSettingsDto | null, presets: ManufacturingPresetDto[]): GlobalQuoteSettings {
  const activeDefaultId = settings?.defaultManufacturingPresetId !== null
    && presets.some((preset) => preset.id === settings?.defaultManufacturingPresetId && preset.status === "active")
    ? settings?.defaultManufacturingPresetId ?? null
    : null;
  return {
    ...defaultGlobalQuoteSettings,
    defaultUsdCnyRate: fromDecimal(settings?.defaultUsdCnyRate ?? null, "quoteSettings.defaultUsdCnyRate"),
    defaultMarkupRate: fromDecimal(settings?.defaultMarkupRate ?? null, "quoteSettings.defaultMarkupRate"),
    defaultLaborCurrency: settings?.defaultLaborCurrency ?? "CNY",
    defaultOtherCost: settings?.defaultOtherCost
      ? { name: settings.defaultOtherCost.name, amount: fromDecimal(settings.defaultOtherCost.amount, "quoteSettings.defaultOtherCost.amount") }
      : null,
    defaultLaborDescription: settings?.defaultLaborDescription ?? "",
    defaultManufacturingPresetId: activeDefaultId,
    manufacturingPresets: presets.map(presetFromServer),
  };
}

export function createServerGlobalQuoteSettingsAdapter(client: QuoteMasterServerClient = quoteMasterServerClient) {
  let settingsVersion = 0;
  let presetVersions = new Map<string, number>();

  const load = async (): Promise<GlobalQuoteSettings> => {
    const [settings, presets] = await Promise.all([client.getSettings(), client.listPresets()]);
    settingsVersion = settings?.version ?? 0;
    presetVersions = new Map(presets.map((preset) => [preset.id, preset.version]));
    return settingsFromServer(settings, presets);
  };

  const save = async (value: GlobalQuoteSettings): Promise<GlobalQuoteSettings> => {
    const manufacturingPresets: SettingsBundlePreset[] = value.manufacturingPresets.map((preset) => {
      const input = {
        name: preset.name,
        country: preset.country,
        laborCurrency: preset.laborCurrency,
        markupRate: toDecimal(preset.markupRate),
        includeFreight: preset.includeFreight,
        freightName: preset.freightName,
        freightAmount: toDecimal(preset.freightAmount),
        status: preset.status === "inactive" ? "inactive" as const : "active" as const,
      };
      const version = presetVersions.get(preset.id);
      return version === undefined ? { clientId: preset.id, ...input } : { id: preset.id, expectedVersion: version, ...input };
    });
    const result = await client.saveSettingsBundle({
      expectedVersion: settingsVersion,
      settings: {
        defaultUsdCnyRate: toDecimal(value.defaultUsdCnyRate),
        defaultMarkupRate: toDecimal(value.defaultMarkupRate),
        defaultLaborCurrency: value.defaultLaborCurrency,
        defaultLaborDescription: value.defaultLaborDescription,
        defaultOtherCost: value.defaultOtherCost ? { name: value.defaultOtherCost.name, amount: toDecimal(value.defaultOtherCost.amount) } : null,
        defaultManufacturingPresetId: value.defaultManufacturingPresetId,
      },
      manufacturingPresets,
    });
    settingsVersion = result.settings.version;
    presetVersions = new Map(result.manufacturingPresets.map((preset) => [preset.id, preset.version]));
    return settingsFromServer(result.settings, result.manufacturingPresets);
  };

  return { load, save };
}

import { createCostLineGroupId, type LaborCurrency, type NullableNumber, type OtherCostLine, type PriceVersion, type PriceVersionPricingParameters, type QuoteRevision } from "./quote-view-model.ts";
import { quoteListColumnDefinitions, type ListColumnKey } from "./quote-list-column-definitions.ts";
import { browserLocalDataStore, LEGACY_LOCAL_DATA_KEYS } from "../../data-management/repository/local-data-store.ts";
import { assertBrowserMasterRead, assertBrowserMasterWrite, masterSettingsAuthority, readFrozenBrowserMasterRecord } from "../../basic-settings/authority/master-settings-authority.ts";

export type { ListColumnKey } from "./quote-list-column-definitions.ts";

export const listColumnOptions: Array<{ key: ListColumnKey; label: string }> = quoteListColumnDefinitions.map(({ key, label }) => ({ key, label }));

export const CURRENT_MOCK_USER_ID = "mock-user-linqinghe";

export type QuoteListViewPreferences = {
  userId: string;
  visibleColumns: ListColumnKey[];
};

export type QuoteUserSettings = QuoteListViewPreferences & {
  newQuoteDefaults: { markupRate: NullableNumber; laborCurrency: LaborCurrency };
};

export type DefaultQuoteOtherCost = {
  name: string;
  amount: NullableNumber;
};

export type ManufacturingPreset = {
  id: string;
  name: string;
  country: string;
  laborCurrency: LaborCurrency;
  markupRate: NullableNumber;
  includeFreight: boolean;
  freightName: string;
  freightAmount: NullableNumber;
  status?: "active" | "inactive";
};

export const defaultManufacturingPresets: ManufacturingPreset[] = [
  { id: "preset-china", name: "中国制作", country: "中国", laborCurrency: "CNY", markupRate: 13, includeFreight: false, freightName: "运费", freightAmount: null },
  { id: "preset-cambodia", name: "柬埔寨制作", country: "柬埔寨", laborCurrency: "USD", markupRate: 5, includeFreight: true, freightName: "运费", freightAmount: null },
];

export type GlobalQuoteSettings = {
  defaultUsdCnyRate: NullableNumber;
  defaultMarkupRate: NullableNumber;
  defaultLaborCurrency: LaborCurrency;
  defaultOtherCost: DefaultQuoteOtherCost | null;
  defaultLaborDescription: string;
  defaultManufacturingPresetId: string | null;
  manufacturingPresets: ManufacturingPreset[];
};

export const defaultGlobalQuoteSettings: GlobalQuoteSettings = {
  defaultUsdCnyRate: 7.12,
  defaultMarkupRate: 8,
  defaultLaborCurrency: "CNY",
  defaultOtherCost: null,
  defaultLaborDescription: "裁剪、车缝、整烫、质检包装",
  defaultManufacturingPresetId: "preset-china",
  manufacturingPresets: defaultManufacturingPresets,
};

export function activeManufacturingPresets(settings: GlobalQuoteSettings): ManufacturingPreset[] {
  return settings.manufacturingPresets.filter((preset) => preset.status !== "inactive");
}

export function setManufacturingPresetStatus(
  settings: GlobalQuoteSettings,
  presetId: string,
  status: "active" | "inactive",
): GlobalQuoteSettings {
  return {
    ...settings,
    defaultManufacturingPresetId: status === "inactive" && settings.defaultManufacturingPresetId === presetId
      ? null
      : settings.defaultManufacturingPresetId,
    manufacturingPresets: settings.manufacturingPresets.map((preset) => preset.id === presetId ? { ...preset, status } : preset),
  };
}

export const GLOBAL_QUOTE_SETTINGS_STORAGE_KEY = browserLocalDataStore.key("quote-global-settings");
const LEGACY_BASIC_SETTINGS_STORAGE_KEYS = ["zhixu.basic-settings.v1.5", "zhixu.basic-settings.v1.3"] as const;

export function defaultQuoteSettingsForUser(userId: string): QuoteUserSettings {
  return {
    userId,
    visibleColumns: ["styleImage", "styleIdentity", "brand", "type", "revision", "versions", "garmentPrice", "confirmationStatus", "status", "date"],
    newQuoteDefaults: { markupRate: null, laborCurrency: "CNY" },
  };
}

export const defaultQuoteSettings = defaultQuoteSettingsForUser(CURRENT_MOCK_USER_ID);
export const QUOTE_SETTINGS_STORAGE_KEY = "zhixu.quote-center.settings.v1.2";
export const QUOTE_LIST_PREFERENCES_STORAGE_PREFIX = "zhixu.quote-center.preferences.v1";

function quotePreferencesStorageName(userId: string): string {
  return `quote-preferences.${encodeURIComponent(userId)}`;
}

export function quoteSettingsStorageKey(userId: string): string {
  return browserLocalDataStore.key(quotePreferencesStorageName(userId));
}

export function normalizeQuoteSettings(value: Partial<QuoteUserSettings> | null | undefined, fallbackUserId = CURRENT_MOCK_USER_ID): QuoteUserSettings {
  const userId = value?.userId?.trim() || fallbackUserId;
  const defaults = defaultQuoteSettingsForUser(userId);
  const allowed = new Set(listColumnOptions.map((item) => item.key));
  const aliases: Record<string, ListColumnKey | ListColumnKey[]> = { sales: "salesperson", style: ["styleImage", "styleIdentity"] };
  const visibleColumns = value?.visibleColumns?.flatMap((key) => {
    const mapped = aliases[key] ?? key;
    return Array.isArray(mapped) ? mapped : [mapped];
  }).filter((key): key is ListColumnKey => allowed.has(key as ListColumnKey)) ?? defaults.visibleColumns;
  return {
    userId,
    visibleColumns: visibleColumns.length ? [...new Set(visibleColumns)] : ["styleImage", "styleIdentity"],
    newQuoteDefaults: {
      markupRate: value?.newQuoteDefaults?.markupRate ?? defaults.newQuoteDefaults.markupRate,
      laborCurrency: value?.newQuoteDefaults?.laborCurrency === "USD" ? "USD" : "CNY",
    },
  };
}

export function loadQuoteSettings(userId = CURRENT_MOCK_USER_ID): QuoteUserSettings {
  if (typeof window === "undefined") return defaultQuoteSettingsForUser(userId);
  const legacyPersonalKey = `${QUOTE_LIST_PREFERENCES_STORAGE_PREFIX}.${encodeURIComponent(userId)}`;
  return normalizeQuoteSettings(browserLocalDataStore.initialize(quotePreferencesStorageName(userId), {
    seed: () => defaultQuoteSettingsForUser(userId),
    legacySources: [
      { key: legacyPersonalKey, storage: window.localStorage },
      ...(userId === CURRENT_MOCK_USER_ID ? [{ key: QUOTE_SETTINGS_STORAGE_KEY, storage: window.localStorage }] : []),
    ],
    migrate: (value) => normalizeQuoteSettings(value as Partial<QuoteUserSettings>, userId),
  }), userId);
}

export function saveQuoteSettings(settings: QuoteUserSettings): QuoteUserSettings {
  const normalized = normalizeQuoteSettings(settings, settings.userId);
  if (typeof window !== "undefined") browserLocalDataStore.save(quotePreferencesStorageName(normalized.userId), normalized);
  return normalized;
}

type LegacyGlobalCostSetting = { id?: string; name?: string; amount?: NullableNumber; enabled?: boolean; note?: string };
type LegacyGlobalQuoteSettings = {
  costs?: LegacyGlobalCostSetting[];
  otherCost?: Partial<LegacyGlobalCostSetting>;
  defaultOtherCost?: Partial<DefaultQuoteOtherCost> | null;
  defaultUsdCnyRate?: NullableNumber;
  defaultMarkupRate?: NullableNumber;
  defaultLaborCurrency?: LaborCurrency;
  defaultLaborDescription?: string;
  defaultManufacturingPresetId?: string | null;
  manufacturingPresets?: Partial<ManufacturingPreset>[];
};

function nullableNumber(value: unknown, fallback: NullableNumber): NullableNumber {
  return typeof value === "number" && Number.isFinite(value) ? value : value === null ? null : fallback;
}

function normalizeDefaultOtherCost(value: unknown): DefaultQuoteOtherCost | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DefaultQuoteOtherCost>;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const amount = nullableNumber(item.amount, null);
  if (!name && amount === null) return null;
  return { name: name || "默认其他费用", amount };
}

function normalizeManufacturingPresets(value: unknown): ManufacturingPreset[] {
  if (!Array.isArray(value)) return structuredClone(defaultManufacturingPresets);
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<ManufacturingPreset>;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `manufacturing-preset-${index + 1}`;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const country = typeof item.country === "string" ? item.country.trim() : "";
    if (!name || !country) return [];
    return [{
      id,
      name,
      country,
      laborCurrency: item.laborCurrency === "USD" ? "USD" : "CNY",
      markupRate: nullableNumber(item.markupRate, null),
      includeFreight: item.includeFreight === true,
      freightName: typeof item.freightName === "string" && item.freightName.trim() ? item.freightName.trim() : "运费",
      freightAmount: nullableNumber(item.freightAmount, null),
      status: item.status === "inactive" ? "inactive" : "active",
    }];
  });
}

export function normalizeGlobalQuoteSettings(value: Partial<GlobalQuoteSettings> | LegacyGlobalQuoteSettings | null | undefined): GlobalQuoteSettings {
  const input = (value ?? {}) as LegacyGlobalQuoteSettings;
  const legacyCost = Array.isArray(input.costs)
    ? input.costs.find((cost) => cost.enabled !== false && (cost.name?.trim() || cost.amount !== null && cost.amount !== undefined))
    : input.otherCost;
  const defaultLaborDescription = typeof input.defaultLaborDescription === "string"
    ? input.defaultLaborDescription.trim()
    : defaultGlobalQuoteSettings.defaultLaborDescription;
  const manufacturingPresets = normalizeManufacturingPresets(input.manufacturingPresets);
  const requestedPresetId = typeof input.defaultManufacturingPresetId === "string" ? input.defaultManufacturingPresetId : null;
  const hasPresetConfiguration = Array.isArray(input.manufacturingPresets) || input.defaultManufacturingPresetId !== undefined;
  return {
    defaultUsdCnyRate: nullableNumber(input.defaultUsdCnyRate, defaultGlobalQuoteSettings.defaultUsdCnyRate),
    defaultMarkupRate: nullableNumber(input.defaultMarkupRate, defaultGlobalQuoteSettings.defaultMarkupRate),
    defaultLaborCurrency: input.defaultLaborCurrency === "USD" ? "USD" : "CNY",
    defaultOtherCost: normalizeDefaultOtherCost(input.defaultOtherCost ?? legacyCost),
    defaultLaborDescription,
    defaultManufacturingPresetId: hasPresetConfiguration && manufacturingPresets.some((preset) => preset.id === requestedPresetId && preset.status !== "inactive")
      ? requestedPresetId
      : null,
    manufacturingPresets,
  };
}

export function loadGlobalQuoteSettings(): GlobalQuoteSettings {
  if (masterSettingsAuthority() === "frozen") return normalizeGlobalQuoteSettings(readFrozenBrowserMasterRecord("quote-global-settings") as Partial<GlobalQuoteSettings>);
  assertBrowserMasterRead();
  if (typeof window === "undefined") return defaultGlobalQuoteSettings;
  return normalizeGlobalQuoteSettings(browserLocalDataStore.initialize("quote-global-settings", {
    seed: () => {
      const legacyRaw = LEGACY_BASIC_SETTINGS_STORAGE_KEYS
        .map((key) => window.localStorage.getItem(key))
        .find(Boolean);
      if (!legacyRaw) return defaultGlobalQuoteSettings;
      const legacyState = JSON.parse(legacyRaw) as { systemDefaults?: {
        usdCnyRate?: NullableNumber;
        markupRate?: NullableNumber;
        laborCurrency?: LaborCurrency;
        defaultOtherCost?: Partial<DefaultQuoteOtherCost> | null;
      } };
      const legacy = legacyState.systemDefaults;
      return normalizeGlobalQuoteSettings(legacy ? {
        defaultUsdCnyRate: legacy.usdCnyRate,
        defaultMarkupRate: legacy.markupRate,
        defaultLaborCurrency: legacy.laborCurrency,
        defaultOtherCost: legacy.defaultOtherCost,
      } : null);
    },
    legacySources: [{ key: LEGACY_LOCAL_DATA_KEYS.globalQuoteSettings, storage: window.localStorage }],
    migrate: (value) => normalizeGlobalQuoteSettings(value as Partial<GlobalQuoteSettings>),
  }));
}

export function saveGlobalQuoteSettings(settings: GlobalQuoteSettings): GlobalQuoteSettings {
  assertBrowserMasterWrite();
  const normalized = normalizeGlobalQuoteSettings(settings);
  if (typeof window !== "undefined") browserLocalDataStore.save("quote-global-settings", normalized);
  return normalized;
}

export function defaultOtherCostLine(settings: GlobalQuoteSettings, rowId: string): OtherCostLine | null {
  const setting = normalizeGlobalQuoteSettings(settings).defaultOtherCost;
  if (!setting) return null;
  return {
    id: rowId,
    lineGroupId: createCostLineGroupId(),
    name: setting.name,
    specification: "",
    usage: 1,
    unit: "件",
    lossRate: 0,
    unitPrice: setting.amount,
    amount: setting.amount,
    source: "global" as const,
    globalSettingId: "system-default-other-cost",
    overridden: false,
  };
}

const presetFreightSettingId = (presetId: string) => `manufacturing-preset:${presetId}:freight`;

export function pricingParametersFromManufacturingPreset(
  preset: ManufacturingPreset,
  usdCnyRate: NullableNumber,
): PriceVersionPricingParameters {
  return {
    manufacturingCountry: preset.country,
    manufacturingPresetId: preset.id,
    manufacturingPresetName: preset.name,
    laborCurrency: preset.laborCurrency,
    usdCnyRate,
    markupRate: preset.markupRate,
    includeFreight: preset.includeFreight,
    freightName: preset.freightName || "运费",
    freightAmount: preset.freightAmount,
  };
}

export function applyManufacturingPresetToPriceVersion(version: PriceVersion, preset: ManufacturingPreset): PriceVersion {
  const existing = version.otherCosts.find((line) => line.globalSettingId?.startsWith("manufacturing-preset:"));
  const remaining = version.otherCosts.filter((line) => !line.globalSettingId?.startsWith("manufacturing-preset:"));
  const pricingParameters = pricingParametersFromManufacturingPreset(preset, version.pricingParameters.usdCnyRate);
  if (!preset.includeFreight) return { ...version, pricingParameters, otherCosts: remaining };
  const freight: OtherCostLine = {
    id: existing?.id ?? `${version.id}-${preset.id}-freight`,
    lineGroupId: existing?.lineGroupId ?? createCostLineGroupId(),
    name: preset.freightName || "运费",
    specification: "",
    usage: 1,
    unit: "件",
    lossRate: 0,
    unitPrice: preset.freightAmount,
    amount: preset.freightAmount,
    source: "global",
    globalSettingId: presetFreightSettingId(preset.id),
    overridden: false,
  };
  return { ...version, pricingParameters, otherCosts: [...remaining, freight] };
}

/** Applies the current system defaults only while a brand-new Quote snapshot is initialized. */
export function applySystemDefaultsToNewQuoteRevision(
  revision: QuoteRevision,
  settings: GlobalQuoteSettings,
  idPrefix: string,
): QuoteRevision {
  const normalized = normalizeGlobalQuoteSettings(settings);
  const otherCost = defaultOtherCostLine(normalized, `${idPrefix}-default-other`);
  const initialized: QuoteRevision = {
    ...revision,
    priceVersions: revision.priceVersions.map((version) => ({
      ...version,
      pricingParameters: {
        ...version.pricingParameters,
        usdCnyRate: normalized.defaultUsdCnyRate,
        markupRate: normalized.defaultMarkupRate,
        laborCurrency: normalized.defaultLaborCurrency,
      },
      labor: { ...version.labor, description: normalized.defaultLaborDescription },
      otherCosts: otherCost ? [{ ...otherCost, id: `${version.id}-default-other` }] : [],
    })),
  };
  const preset = activeManufacturingPresets(normalized).find((item) => item.id === normalized.defaultManufacturingPresetId);
  return preset ? {
    ...initialized,
    priceVersions: initialized.priceVersions.map((version) => applyManufacturingPresetToPriceVersion(version, preset)),
  } : initialized;
}

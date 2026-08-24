import type { LaborCurrency, NullableNumber, PriceVersion, Quote, QuoteRevision } from "./quote-view-model";
import { quoteListColumnDefinitions, type ListColumnKey } from "./quote-list-column-definitions.ts";

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

export type GlobalCostSetting = {
  id: string;
  name: string;
  amount: NullableNumber;
  enabled: boolean;
  note?: string;
};

export type GlobalQuoteSettings = {
  costs: GlobalCostSetting[];
  defaultLaborDescription: string;
};

export const defaultGlobalQuoteSettings: GlobalQuoteSettings = {
  costs: [],
  defaultLaborDescription: "裁剪、车缝、整烫、质检包装",
};

export const GLOBAL_QUOTE_SETTINGS_STORAGE_KEY = "zhixu.quote-center.global-settings.v1";

export function defaultQuoteSettingsForUser(userId: string): QuoteUserSettings {
  return {
    userId,
    visibleColumns: ["style", "brand", "salesperson", "type", "revision", "versions", "confirmationStatus", "status", "date"],
    newQuoteDefaults: { markupRate: null, laborCurrency: "CNY" },
  };
}

export const defaultQuoteSettings = defaultQuoteSettingsForUser(CURRENT_MOCK_USER_ID);
export const QUOTE_SETTINGS_STORAGE_KEY = "zhixu.quote-center.settings.v1.2";
export const QUOTE_LIST_PREFERENCES_STORAGE_PREFIX = "zhixu.quote-center.preferences.v1";

export function quoteSettingsStorageKey(userId: string): string {
  return `${QUOTE_LIST_PREFERENCES_STORAGE_PREFIX}.${encodeURIComponent(userId)}`;
}

export function normalizeQuoteSettings(value: Partial<QuoteUserSettings> | null | undefined, fallbackUserId = CURRENT_MOCK_USER_ID): QuoteUserSettings {
  const userId = value?.userId?.trim() || fallbackUserId;
  const defaults = defaultQuoteSettingsForUser(userId);
  const allowed = new Set(listColumnOptions.map((item) => item.key));
  const aliases: Record<string, ListColumnKey> = { sales: "salesperson" };
  const visibleColumns = value?.visibleColumns?.map((key) => aliases[key] ?? key).filter((key): key is ListColumnKey => allowed.has(key as ListColumnKey)) ?? defaults.visibleColumns;
  return {
    userId,
    visibleColumns: visibleColumns.length ? visibleColumns : ["style"],
    newQuoteDefaults: {
      markupRate: value?.newQuoteDefaults?.markupRate ?? defaults.newQuoteDefaults.markupRate,
      laborCurrency: value?.newQuoteDefaults?.laborCurrency === "USD" ? "USD" : "CNY",
    },
  };
}

export function loadQuoteSettings(userId = CURRENT_MOCK_USER_ID): QuoteUserSettings {
  if (typeof window === "undefined") return defaultQuoteSettingsForUser(userId);
  try {
    const personal = window.localStorage.getItem(quoteSettingsStorageKey(userId));
    const legacy = userId === CURRENT_MOCK_USER_ID ? window.localStorage.getItem(QUOTE_SETTINGS_STORAGE_KEY) : null;
    const normalized = normalizeQuoteSettings(JSON.parse(personal || legacy || "null"), userId);
    if (!personal) window.localStorage.setItem(quoteSettingsStorageKey(userId), JSON.stringify(normalized));
    return normalized;
  } catch {
    return defaultQuoteSettingsForUser(userId);
  }
}

export function saveQuoteSettings(settings: QuoteUserSettings): QuoteUserSettings {
  const normalized = normalizeQuoteSettings(settings, settings.userId);
  if (typeof window !== "undefined") window.localStorage.setItem(quoteSettingsStorageKey(normalized.userId), JSON.stringify(normalized));
  return normalized;
}

type LegacyGlobalQuoteSettings = { otherCost?: Partial<Omit<GlobalCostSetting, "id">> };

export function normalizeGlobalQuoteSettings(value: Partial<GlobalQuoteSettings> | LegacyGlobalQuoteSettings | null | undefined): GlobalQuoteSettings {
  const legacy = "otherCost" in (value ?? {}) ? (value as LegacyGlobalQuoteSettings).otherCost : undefined;
  const rawCosts = Array.isArray((value as Partial<GlobalQuoteSettings> | null)?.costs)
    ? (value as Partial<GlobalQuoteSettings>).costs ?? []
    : legacy && (legacy.name?.trim() || legacy.amount !== null && legacy.amount !== undefined)
      ? [{ ...legacy, id: "global-cost-legacy" }]
      : [];
  const usedIds = new Set<string>();
  const costs = rawCosts.map((cost, index): GlobalCostSetting => {
    const baseId = cost.id?.trim() || `global-cost-${index + 1}`;
    let id = baseId;
    let sequence = 2;
    while (usedIds.has(id)) id = `${baseId}-${sequence++}`;
    usedIds.add(id);
    return {
      id,
      name: cost.name?.trim() ?? "",
      amount: typeof cost.amount === "number" && Number.isFinite(cost.amount) ? cost.amount : null,
      enabled: cost.enabled === true,
      note: cost.note?.trim() ?? "",
    };
  });
  const defaultLaborDescription = typeof (value as Partial<GlobalQuoteSettings> | null)?.defaultLaborDescription === "string"
    ? (value as Partial<GlobalQuoteSettings>).defaultLaborDescription!.trim()
    : defaultGlobalQuoteSettings.defaultLaborDescription;
  return { costs, defaultLaborDescription };
}

export function loadGlobalQuoteSettings(): GlobalQuoteSettings {
  if (typeof window === "undefined") return defaultGlobalQuoteSettings;
  try {
    return normalizeGlobalQuoteSettings(JSON.parse(window.localStorage.getItem(GLOBAL_QUOTE_SETTINGS_STORAGE_KEY) || "null"));
  } catch {
    return defaultGlobalQuoteSettings;
  }
}

export function saveGlobalQuoteSettings(settings: GlobalQuoteSettings): GlobalQuoteSettings {
  const normalized = normalizeGlobalQuoteSettings(settings);
  if (typeof window !== "undefined") window.localStorage.setItem(GLOBAL_QUOTE_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function enabledGlobalCosts(settings: GlobalQuoteSettings): GlobalCostSetting[] {
  return normalizeGlobalQuoteSettings(settings).costs.filter((cost) => cost.enabled && cost.name.length > 0 && cost.amount !== null);
}

export function globalCostsAreApplicable(settings: GlobalQuoteSettings): boolean {
  return enabledGlobalCosts(settings).length > 0;
}

export function globalCostsSummary(settings: GlobalQuoteSettings): string {
  const costs = enabledGlobalCosts(settings);
  if (!costs.length) return "未启用全局费用";
  return costs.map((cost) => `${cost.name} ¥${cost.amount?.toFixed(2)}`).join(" · ");
}

function globalCostLine(setting: GlobalCostSetting, rowId: string) {
  return {
    id: rowId,
    name: setting.name,
    specification: setting.note ?? "",
    usage: 1,
    unit: "件",
    lossRate: 0,
    unitPrice: setting.amount,
    amount: setting.amount,
    source: "global" as const,
    globalSettingId: setting.id,
    overridden: false,
  };
}

/**
 * Synchronizes a detached PriceVersion snapshot. Existing manual rows and user-overridden
 * global rows are retained. `resetGlobalOverrides` is used only for a newly-created/copied
 * PriceVersion so it inherits the current global baseline instead of another version's exception.
 */
export function applyGlobalCostsToPriceVersion(
  version: PriceVersion,
  settings: GlobalQuoteSettings,
  idPrefix: string,
  options: { resetGlobalOverrides?: boolean } = {},
): PriceVersion {
  const normalized = normalizeGlobalQuoteSettings(settings);
  const settingsById = new Map(normalized.costs.map((cost) => [cost.id, cost]));
  const settingsByName = new Map(normalized.costs.map((cost) => [cost.name.toLocaleLowerCase(), cost]));
  const seenLinked = new Set<string>();
  const retained = version.otherCosts.flatMap((original) => {
    const legacySetting = !original.source && original.id.includes("global-other")
      ? settingsByName.get(original.name.trim().toLocaleLowerCase())
      : undefined;
    const line = legacySetting
      ? { ...original, source: "global" as const, globalSettingId: legacySetting.id, overridden: false }
      : original;
    if (line.source !== "global" || !line.globalSettingId) return [line];
    if (options.resetGlobalOverrides) return [];
    if (line.overridden) {
      seenLinked.add(line.globalSettingId);
      return [{ ...line }];
    }
    const setting = settingsById.get(line.globalSettingId);
    if (!setting || !setting.enabled || !setting.name || setting.amount === null) return [];
    if (seenLinked.has(setting.id)) return [];
    seenLinked.add(setting.id);
    return [{ ...globalCostLine(setting, line.id), id: line.id }];
  });
  const otherCosts = [...retained];
  for (const setting of enabledGlobalCosts(normalized)) {
    if (seenLinked.has(setting.id)) continue;
    seenLinked.add(setting.id);
    otherCosts.push(globalCostLine(setting, `${idPrefix}-${setting.id}`));
  }
  return { ...version, otherCosts };
}

export function applyGlobalCostsToRevision(
  revision: QuoteRevision,
  settings: GlobalQuoteSettings,
  idPrefix: string,
  options: { resetGlobalOverrides?: boolean } = {},
): QuoteRevision {
  return {
    ...revision,
    priceVersions: revision.priceVersions.map((version, index) => applyGlobalCostsToPriceVersion(version, settings, `${idPrefix}-${index + 1}`, options)),
  };
}

/** Only the editable default revision is replaced; every historical snapshot keeps identity and values. */
export function applyGlobalCostsToCurrentQuote(quote: Quote, settings: GlobalQuoteSettings, idPrefix: string): Quote {
  return {
    ...quote,
    revisions: quote.revisions.map((revision) => revision.revisionId === quote.defaultRevisionId
      ? applyGlobalCostsToRevision(revision, settings, idPrefix)
      : revision),
  };
}

export function currentQuoteHasCustomLaborDescription(quote: Quote, previousDefault: string): boolean {
  const revision = quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId);
  return Boolean(revision?.priceVersions.some((version) => {
    const description = version.labor.description.trim();
    return description.length > 0 && description !== previousDefault.trim();
  }));
}

/** Applies only to the editable default revision; historical QuoteRevision snapshots stay untouched. */
export function applyLaborDescriptionToCurrentQuote(quote: Quote, description: string): Quote {
  return {
    ...quote,
    revisions: quote.revisions.map((revision) => revision.revisionId === quote.defaultRevisionId
      ? { ...revision, priceVersions: revision.priceVersions.map((version) => ({ ...version, labor: { ...version.labor, description } })) }
      : revision),
  };
}

/** @deprecated Compatibility alias for older UI slices. */
export const globalOtherCostIsApplicable = globalCostsAreApplicable;
/** @deprecated Compatibility alias for older UI slices. */
export const applyGlobalOtherCostToPriceVersion = applyGlobalCostsToPriceVersion;
/** @deprecated Compatibility alias for older UI slices. */
export const applyGlobalOtherCostToRevision = applyGlobalCostsToRevision;

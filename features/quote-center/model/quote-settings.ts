import type { LaborCurrency, NullableNumber } from "./quote-view-model";

export type ListColumnKey = "quote" | "style" | "type" | "sales" | "versions" | "quantity" | "fabricCost" | "trimCost" | "confirmedLabor" | "confirmedGarment" | "revision" | "status" | "date";

export const listColumnOptions: Array<{ key: ListColumnKey; label: string }> = [
  { key: "quote", label: "报价编号 / 品牌" }, { key: "style", label: "报价款号 / 款式" },
  { key: "type", label: "报价类型" }, { key: "sales", label: "业务员" },
  { key: "versions", label: "价格版本数" }, { key: "quantity", label: "总数量" },
  { key: "fabricCost", label: "面料成本" }, { key: "trimCost", label: "辅料成本" },
  { key: "confirmedLabor", label: "客人确认工价" }, { key: "confirmedGarment", label: "客人确认成衣价格" },
  { key: "revision", label: "当前 Revision" }, { key: "status", label: "状态" }, { key: "date", label: "报价日期" },
];

export type QuoteUserSettings = {
  visibleColumns: ListColumnKey[];
  newQuoteDefaults: { markupRate: NullableNumber; laborCurrency: LaborCurrency };
};

export const defaultQuoteSettings: QuoteUserSettings = {
  visibleColumns: ["quote", "style", "type", "sales", "versions", "quantity", "revision", "status", "date"],
  newQuoteDefaults: { markupRate: null, laborCurrency: "CNY" },
};

export const QUOTE_SETTINGS_STORAGE_KEY = "zhixu.quote-center.settings.v1.2";

export function normalizeQuoteSettings(value: Partial<QuoteUserSettings> | null | undefined): QuoteUserSettings {
  const allowed = new Set(listColumnOptions.map((item) => item.key));
  const visibleColumns = value?.visibleColumns?.filter((key) => allowed.has(key)) ?? defaultQuoteSettings.visibleColumns;
  return {
    visibleColumns: visibleColumns.length ? visibleColumns : ["quote", "style"],
    newQuoteDefaults: {
      markupRate: value?.newQuoteDefaults?.markupRate ?? defaultQuoteSettings.newQuoteDefaults.markupRate,
      laborCurrency: value?.newQuoteDefaults?.laborCurrency === "USD" ? "USD" : "CNY",
    },
  };
}

export function loadQuoteSettings(): QuoteUserSettings {
  if (typeof window === "undefined") return defaultQuoteSettings;
  try { return normalizeQuoteSettings(JSON.parse(window.localStorage.getItem(QUOTE_SETTINGS_STORAGE_KEY) || "null")); }
  catch { return defaultQuoteSettings; }
}

export function saveQuoteSettings(settings: QuoteUserSettings): QuoteUserSettings {
  const normalized = normalizeQuoteSettings(settings);
  if (typeof window !== "undefined") window.localStorage.setItem(QUOTE_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

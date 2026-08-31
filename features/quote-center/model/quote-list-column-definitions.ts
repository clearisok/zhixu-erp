import { totalPriceVersionQuantity } from "./quote-calculations.ts";
import { confirmedPriceSummary, nullablePriceVersionMetrics, summarizeRevisionMetric } from "./quote-presentation.ts";
import { confirmationSummaryLabel } from "./quote-workflows.ts";
import { getDefaultRevision, type PriceVersion, type Quote } from "./quote-view-model.ts";
import { formatFinalGarmentPrice } from "./final-quote-format.ts";

export type ListColumnKey = "quote" | "style" | "brand" | "salesperson" | "type" | "versions" | "quantity" | "fabricCost" | "trimCost" | "labor" | "garmentPrice" | "confirmedLabor" | "confirmedGarment" | "confirmationStatus" | "revision" | "status" | "date";
export type QuoteListColumnDefinition = { key: ListColumnKey; label: string; value: (quote: Quote, version?: PriceVersion) => string | number | null };

const money = (value: number) => `¥${value.toFixed(2)}`;
const laborMoney = (value: number, currency: PriceVersion["pricingParameters"]["laborCurrency"]) => currency === "USD" ? `$${value.toFixed(2)}` : `¥${value.toFixed(2)}`;
const laborRange = (versions: PriceVersion[]): string | null => {
  const groups = new Map<PriceVersion["pricingParameters"]["laborCurrency"], number[]>();
  for (const version of versions) {
    if (version.labor.value === null) continue;
    const currency = version.pricingParameters.laborCurrency;
    groups.set(currency, [...(groups.get(currency) ?? []), version.labor.value]);
  }
  if (!groups.size) return null;
  const mixed = groups.size > 1;
  return [...groups.entries()].map(([currency, values]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const symbol = currency === "USD" ? "$" : "¥";
    const range = min === max ? `${symbol}${min.toFixed(2)}` : `${symbol}${min.toFixed(2)} – ${symbol}${max.toFixed(2)}`;
    return mixed ? `${currency} ${range}` : range;
  }).join(" · ");
};
const statusLabels = { draft: "草稿", quoting: "报价中", partially_confirmed: "部分确认", confirmed: "全部确认" } as const;
const metric = (quote: Quote, version: PriceVersion | undefined, key: "fabricCost" | "trimCost" | "laborInput" | "garmentSellingPrice") => {
  const revision = getDefaultRevision(quote);
  const formatter = key === "garmentSellingPrice" ? formatFinalGarmentPrice : money;
  if (!version) return summarizeRevisionMetric(revision, (metrics) => metrics[key], formatter);
  const value = nullablePriceVersionMetrics(version)[key];
  return value === null ? null : formatter(value);
};

export const quoteListColumnDefinitions: QuoteListColumnDefinition[] = [
  { key: "quote", label: "报价编号", value: (quote) => quote.quoteCode },
  { key: "style", label: "报价款号 / 款式", value: (quote) => { const base = getDefaultRevision(quote).baseInfo; return [base.quoteStyleNo, base.styleName].filter(Boolean).join(" / ") || null; } },
  { key: "brand", label: "品牌", value: (quote) => getDefaultRevision(quote).baseInfo.brandName || null },
  { key: "salesperson", label: "客户业务员", value: (quote) => getDefaultRevision(quote).baseInfo.salespersonName || null },
  { key: "type", label: "报价类型", value: (quote) => getDefaultRevision(quote).baseInfo.quoteType === "distribution" ? "经销" : "加工" },
  { key: "versions", label: "价格版本数", value: (quote, version) => version ? 1 : getDefaultRevision(quote).priceVersions.length },
  { key: "quantity", label: "总数量", value: (quote, version) => version ? version.quantity : getDefaultRevision(quote).priceVersions.every((item) => item.quantity === null) ? null : totalPriceVersionQuantity(getDefaultRevision(quote).priceVersions) },
  { key: "fabricCost", label: "面料成本", value: (quote, version) => metric(quote, version, "fabricCost") },
  { key: "trimCost", label: "辅料成本", value: (quote, version) => metric(quote, version, "trimCost") },
  { key: "labor", label: "工价", value: (quote, version) => version ? version.labor.value === null ? null : laborMoney(version.labor.value, version.pricingParameters.laborCurrency) : laborRange(getDefaultRevision(quote).priceVersions) },
  { key: "garmentPrice", label: "成衣销售单价", value: (quote, version) => metric(quote, version, "garmentSellingPrice") },
  { key: "confirmedLabor", label: "客户确认工价", value: (quote, version) => version ? version.confirmation?.confirmedLaborPrice ?? null : confirmedPriceSummary(getDefaultRevision(quote), "confirmedLaborPrice") },
  { key: "confirmedGarment", label: "客户确认成衣价格", value: (quote, version) => version ? version.confirmation?.confirmedGarmentPrice ?? null : confirmedPriceSummary(getDefaultRevision(quote), "confirmedGarmentPrice") },
  { key: "confirmationStatus", label: "客户确认状态", value: (quote, version) => version ? version.confirmation ? "已确认" : "未确认" : confirmationSummaryLabel(getDefaultRevision(quote).confirmationSummary) },
  { key: "revision", label: "当前报价版本", value: (quote) => getDefaultRevision(quote).revisionLabel },
  { key: "status", label: "报价状态", value: (quote) => statusLabels[quote.aggregateStatus] },
  { key: "date", label: "报价日期", value: (quote) => getDefaultRevision(quote).baseInfo.quoteDate || null },
];

export const quoteListColumnDefinitionMap = Object.fromEntries(quoteListColumnDefinitions.map((item) => [item.key, item])) as Record<ListColumnKey, QuoteListColumnDefinition>;

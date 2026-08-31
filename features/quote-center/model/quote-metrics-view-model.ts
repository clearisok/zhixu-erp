import { formatFinalGarmentPrice } from "./final-quote-format.ts";
import { formatMoney, nullablePriceVersionMetrics } from "./quote-presentation.ts";
import type { NullableNumber, PriceVersion } from "./quote-view-model.ts";

export type QuoteMetricKey = "fabric" | "trim" | "labor" | "garment";

export type QuoteMetricViewModel = {
  key: QuoteMetricKey;
  label: string;
  value: string;
  unit: string | null;
  secondaryLabel: string;
  secondaryValue: string;
  primary: boolean;
};

const formatCurrencyInput = (value: NullableNumber, currency: "CNY" | "USD") => {
  if (value === null) return "—";
  return currency === "USD" ? `$${value.toFixed(2)}` : `¥${value.toFixed(2)}`;
};

/**
 * Header and Sticky share this presentation model. All numeric values come
 * from the formal PriceVersion calculator through nullablePriceVersionMetrics.
 */
export function createQuoteMetricsViewModel(version: PriceVersion): QuoteMetricViewModel[] {
  const metrics = nullablePriceVersionMetrics(version);
  const laborCurrency = version.pricingParameters.laborCurrency;

  return [
    {
      key: "fabric",
      label: "面料",
      value: formatMoney(metrics.fabricCost),
      unit: null,
      secondaryLabel: "加成后",
      secondaryValue: formatMoney(metrics.fabricWithMarkup),
      primary: false,
    },
    {
      key: "trim",
      label: "辅料",
      value: formatMoney(metrics.trimCost),
      unit: null,
      secondaryLabel: "加成后",
      secondaryValue: formatMoney(metrics.trimWithMarkup),
      primary: false,
    },
    {
      key: "labor",
      label: "工价",
      value: formatCurrencyInput(metrics.laborInput, laborCurrency),
      unit: laborCurrency === "USD" ? "USD / 件" : "RMB / 件",
      secondaryLabel: laborCurrency === "USD" ? "RMB折合" : "加成后",
      secondaryValue: formatMoney(laborCurrency === "USD" ? metrics.laborRmb : metrics.laborWithMarkup),
      primary: false,
    },
    {
      key: "garment",
      label: "成衣销售单价",
      value: formatFinalGarmentPrice(metrics.garmentSellingPrice),
      unit: "RMB / 件",
      secondaryLabel: "加成前",
      secondaryValue: formatMoney(metrics.preMarkupTotal),
      primary: true,
    },
  ];
}

import { calculatePriceVersionMetrics } from "../model/quote-calculations";
import type { LaborCurrency, NullableNumber, PriceVersion } from "../model/quote-view-model";

const rmb = (value: number) => `¥${value.toFixed(2)}`;

export function QuoteMetrics({ version, laborCurrency, usdCnyRate, markupRate }: { version: PriceVersion; laborCurrency: LaborCurrency; usdCnyRate: NullableNumber; markupRate: NullableNumber }) {
  const metrics = calculatePriceVersionMetrics(version, laborCurrency, usdCnyRate, markupRate);
  return <section className="qc-metrics" aria-label="报价关键数据">
    <article><span>面料成本</span><strong>{rmb(metrics.fabricCost)}</strong><small>加成后 {rmb(metrics.fabricWithMarkup)}</small></article>
    <article><span>辅料成本</span><strong>{rmb(metrics.trimCost)}</strong><small>加成后 {rmb(metrics.trimWithMarkup)}</small></article>
    <article><span>工价</span><strong>{laborCurrency === "USD" ? `$${metrics.laborInput.toFixed(2)}` : rmb(metrics.laborInput)} <em>{laborCurrency} / 件</em></strong><small>{laborCurrency === "USD" ? `折合 ${rmb(metrics.laborRmb)} · ` : ""}加成后 {rmb(metrics.laborWithMarkup)}</small></article>
    <article className="primary"><span>成衣销售单价</span><strong>{rmb(metrics.garmentSellingPrice)} <em>RMB / 件</em></strong><small>利润前总成本 {rmb(metrics.preMarkupTotal)} × (1 + {markupRate ?? 0}%)</small></article>
  </section>;
}

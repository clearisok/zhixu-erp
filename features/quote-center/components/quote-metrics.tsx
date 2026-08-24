import { formatMoney, nullablePriceVersionMetrics } from "../model/quote-presentation";
import type { PriceVersion, QuoteRevision } from "../model/quote-view-model";

const currencyMoney = (value: number | null, currency: "CNY" | "USD") => value === null ? "—" : currency === "USD" ? `$${value.toFixed(2)}` : `¥${value.toFixed(2)}`;

export function QuoteMetrics({ version, revision }: { version: PriceVersion; revision: QuoteRevision }) {
  const metrics = nullablePriceVersionMetrics(version, revision);
  const confirmation = version.confirmation;
  return <section className="qc-metrics" aria-label="报价关键数据">
    <article><span>面料成本</span><strong>{formatMoney(metrics.fabricCost)}</strong><small>{metrics.fabricWithMarkup === null ? "加成后 —" : `加成后 ${formatMoney(metrics.fabricWithMarkup)}`}</small></article>
    <article><span>辅料成本</span><strong>{formatMoney(metrics.trimCost)}</strong><small>{metrics.trimWithMarkup === null ? "加成后 —" : `加成后 ${formatMoney(metrics.trimWithMarkup)}`}</small></article>
    <article><span>工价</span><strong>{currencyMoney(metrics.laborInput, revision.pricingParameters.laborCurrency)} <em>{revision.pricingParameters.laborCurrency} / 件</em></strong><small>{confirmation ? `客户确认 ${currencyMoney(confirmation.confirmedLaborPrice, revision.pricingParameters.laborCurrency)}` : "客户尚未确认"}</small></article>
    <article className="primary"><span>成衣销售单价</span><strong>{formatMoney(metrics.garmentSellingPrice)} <em>RMB / 件</em></strong><small>{confirmation?.confirmedGarmentPrice !== null && confirmation?.confirmedGarmentPrice !== undefined ? `客户确认 ${formatMoney(confirmation.confirmedGarmentPrice)}` : metrics.preMarkupTotal === null ? "利润前总成本 —" : `利润前总成本 ${formatMoney(metrics.preMarkupTotal)} × (1 + ${revision.pricingParameters.markupRate ?? 0}%)`}</small></article>
  </section>;
}

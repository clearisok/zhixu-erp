import { createQuoteMetricsViewModel } from "../model/quote-metrics-view-model";
import type { PriceVersion, QuoteRevision } from "../model/quote-view-model";

export function QuoteMetrics({ version, className = "" }: { version: PriceVersion; revision: QuoteRevision; className?: string }) {
  const items = createQuoteMetricsViewModel(version);

  return <section className={`qc-metrics ${className}`.trim()} aria-label="报价关键数据">
    {items.map((item) => <article key={item.key} className={item.primary ? "primary" : undefined}>
      <span className="qc-metric-label">{item.label}</span>
      <strong className="qc-metric-value">{item.value}</strong>
      {item.unit ? <em className="qc-metric-unit">{item.unit}</em> : null}
      <small className="qc-metric-secondary">{item.secondaryLabel} <b>{item.secondaryValue}</b></small>
    </article>)}
  </section>;
}

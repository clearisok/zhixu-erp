import type { ReactNode } from "react";
import { createQuoteMetricsViewModel } from "../model/quote-metrics-view-model";
import type { PriceVersion } from "../model/quote-view-model";

type QuoteCockpitProps = {
  version: PriceVersion;
  revisionLabel: string;
  priceVersionLabel: string;
  productionLabel: string;
  confirmationLabel: string;
  differenceCount: number;
  historical?: boolean;
  canViewSale?: boolean;
  settingsAction: ReactNode;
  onDifferenceClick?: () => void;
  onFinalQuoteClick?: () => void;
};

/**
 * One compact, authoritative quote context strip. Cost figures still come from
 * the shared PriceVersion presentation model; this component only arranges
 * identity, price and confirmation context without duplicating calculations.
 */
export function QuoteCockpit({
  version,
  revisionLabel,
  priceVersionLabel,
  productionLabel,
  confirmationLabel,
  differenceCount,
  historical = false,
  canViewSale = true,
  settingsAction,
  onDifferenceClick,
  onFinalQuoteClick,
}: QuoteCockpitProps) {
  const items = createQuoteMetricsViewModel(version, canViewSale);
  const metric = (key: "fabric" | "trim" | "labor" | "other" | "garment") => items.find((item) => item.key === key)!;
  const fabric = metric("fabric");
  const trim = metric("trim");
  const labor = metric("labor");
  const other = metric("other");
  const garment = metric("garment");
  const quantityLabel = version.quantity === null ? "数量未填写" : `${version.quantity.toLocaleString("zh-CN")} 件`;

  return <section className={`qc-quote-cockpit ${historical ? "is-history" : ""}`} aria-label="报价工作台摘要">
    <div className="qc-cockpit-context">
      <span>报价上下文</span>
      <strong>{revisionLabel} · {priceVersionLabel}</strong>
      <small>{productionLabel} · {quantityLabel}</small>
    </div>
    <div className="qc-cockpit-materials">
      <span>面料 / 辅料</span>
      <strong>{fabric.value} <i>/</i> {trim.value}</strong>
      <small>加成后 {fabric.secondaryValue} / {trim.secondaryValue}</small>
    </div>
    <div className="qc-cockpit-labor">
      <span>工价</span>
      <strong>{labor.value}</strong>
      <small>{labor.secondaryLabel} {labor.secondaryValue}</small>
    </div>
    <div className="qc-cockpit-other">
      <span>其他</span>
      <strong>{other.value}</strong>
      <small>RMB / 件</small>
    </div>
    <button type="button" className="qc-cockpit-final" aria-label="查看成衣销售价格构成" onClick={onFinalQuoteClick}>
      <span>成衣销售价格</span>
      <strong>{garment.value}</strong>
      <small>RMB / 件 · 加成前 {garment.secondaryValue}</small>
    </button>
    <div className="qc-cockpit-confirmation">
      <span>客户确认</span>
      <strong>{confirmationLabel}</strong>
      {differenceCount > 0 ? <button type="button" onClick={onDifferenceClick}>{differenceCount} 项未确认差异</button> : <small>当前方案无待确认差异</small>}
    </div>
    <div className="qc-cockpit-markup">
      <span>成本加成</span>
      <strong>{version.pricingParameters.markupRate === null ? "未设置" : `${version.pricingParameters.markupRate}%`}</strong>
      <small>{version.pricingParameters.laborCurrency} 工价</small>
    </div>
    <div className="qc-cockpit-settings">{settingsAction}</div>
  </section>;
}

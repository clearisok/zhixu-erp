"use client";

import { Card, FormItem, NullableNumberInput } from "@/components/foundation";
import type { QuoteRevision } from "../model/quote-view-model";

export function QuotePricingSettings({ revision, onChange, onRateChange }: { revision: QuoteRevision; onChange: (revision: QuoteRevision) => void; onRateChange: (value: number | null) => void }) {
  const base = revision.baseInfo;
  const pricing = revision.pricingParameters;
  const setBase = (patch: Partial<typeof base>) => onChange({ ...revision, baseInfo: { ...base, ...patch } });
  const setPricing = (patch: Partial<typeof pricing>) => onChange({ ...revision, pricingParameters: { ...pricing, ...patch } });

  return <Card className="qc-pricing-settings"><header><div><span className="qc-section-index">02</span><div><h2>报价设置</h2><p>统一维护报价口径；加工币种仅决定工价录入的货币口径。</p></div></div></header><div className="qc-pricing-grid">
    <FormItem label="报价类型" required><div className="qc-segmented"><button type="button" className={base.quoteType === "distribution" ? "selected" : ""} onClick={() => setBase({ quoteType: "distribution" })}>经销</button><button type="button" className={base.quoteType === "processing" ? "selected" : ""} onClick={() => setBase({ quoteType: "processing" })}>加工</button></div></FormItem>
    <FormItem label="加工币种" required><div className="qc-segmented"><button type="button" className={pricing.laborCurrency === "CNY" ? "selected" : ""} onClick={() => setPricing({ laborCurrency: "CNY" })}>CNY / 件</button><button type="button" className={pricing.laborCurrency === "USD" ? "selected" : ""} onClick={() => setPricing({ laborCurrency: "USD" })}>USD / 件</button></div></FormItem>
    <FormItem label="USD/CNY 汇率" required={pricing.laborCurrency === "USD"}><NullableNumberInput className="qc-control" min="0" placeholder="请输入汇率" value={pricing.usdCnyRate} onValueChange={onRateChange} /></FormItem>
    <FormItem label="成本加成率" required><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" min="0" placeholder="请输入加成率" value={pricing.markupRate} onValueChange={(markupRate) => setPricing({ markupRate })} /><span>%</span></div></FormItem>
  </div></Card>;
}

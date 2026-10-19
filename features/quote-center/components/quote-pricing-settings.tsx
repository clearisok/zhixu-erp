"use client";

import { Button, Modal } from "@/components/foundation";
import { ManufacturingSchemeSelector } from "./manufacturing-scheme-selector";
import { applyManufacturingPresetToPriceVersion, loadGlobalQuoteSettings, type GlobalQuoteSettings } from "../model/quote-settings";
import type { PriceVersion } from "../model/quote-view-model";

const amount = (value: number | null) => value === null ? "未设置" : `¥${value.toFixed(2)} / 件`;

export function QuotePricingSettings({
  open,
  laborOnly=false,
  priceVersion,
  readOnly = false,
  settings,
  onPriceVersionChange,
  onClose,
}: {
  open: boolean;
  laborOnly?:boolean;
  priceVersion: PriceVersion;
  readOnly?: boolean;
  settings?: GlobalQuoteSettings;
  onPriceVersionChange: (priceVersion: PriceVersion) => void;
  onClose: () => void;
}) {
  const pricing = priceVersion.pricingParameters;
  const presets = (settings ?? loadGlobalQuoteSettings()).manufacturingPresets;
  const selectedPresetExists = presets.some((preset) => preset.id === pricing.manufacturingPresetId);
  const selectPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId && item.status !== "inactive");
    if (preset) onPriceVersionChange(applyManufacturingPresetToPriceVersion(priceVersion, preset));
  };
  const freightRule = pricing.includeFreight
    ? `${pricing.freightName || "运费"} · ${amount(pricing.freightAmount)}`
    : "不带入默认运费";

  return <Modal open={open} className="qc-pricing-settings-modal" title="报价设置" description={readOnly ? `价格版本「${priceVersion.name}」的制作方案快照只读。` : `为当前价格版本「${priceVersion.name}」选择制作方案；全局标准在系统设置中维护。`} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>完成</Button>}>
    <section className="qc-pricing-setting-section">
      <header><div><strong>当前价格版本制作方案</strong><small>下方数值是本价格版本的独立快照；选择新方案后须保存报价，不会修改全局标准或其他版本。</small></div></header>
      <ManufacturingSchemeSelector presets={presets} value={pricing.manufacturingPresetId} disabled={readOnly} label="当前价格版本制作方案" onChange={id => { if (id) selectPreset(id); }} />
      {pricing.manufacturingPresetId && (!selectedPresetExists || presets.find(p => p.id === pricing.manufacturingPresetId)?.status === "inactive") && <p role="status">{pricing.manufacturingPresetName || "原制作方案"}（保留的历史快照，当前不可重新选择）</p>}
      <dl className="qc-pricing-preset-summary">
        <div><dt>制作国家</dt><dd>{pricing.manufacturingCountry || "未设置"}</dd></div>
        <div><dt>加工币种</dt><dd><span className="qc-pricing-summary-badge">{pricing.laborCurrency}</span></dd></div>
        {!laborOnly&&<><div><dt>成本加成率</dt><dd>{pricing.markupRate === null ? "未设置" : `${pricing.markupRate}%`}</dd></div>
        <div><dt>运费规则</dt><dd>{freightRule}</dd></div>
        {pricing.laborCurrency === "USD" && <div><dt>USD/CNY 汇率</dt><dd>{pricing.usdCnyRate === null ? "未设置" : pricing.usdCnyRate.toFixed(2)}</dd></div>}
      </>}
      </dl>
      {pricing.configuration?.status === "incomplete" && <p role="status">制作参数待完善。{pricing.configuration.sources.some(item => item.field === "laborCurrency" && item.source === "technical_default") && "当前 CNY 为技术默认，不代表用户已确认币种。"}</p>}
      <p className="qc-pricing-preset-note">制作方案标准仅可在“系统设置 → 报价设置 → 制作方案管理”中新增、编辑或停用；本页调整只影响当前可编辑价格版本。</p>
    </section>
  </Modal>;
}

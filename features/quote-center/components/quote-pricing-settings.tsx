"use client";

import { Button, FormItem, Modal } from "@/components/foundation";
import { applyManufacturingPresetToPriceVersion, loadGlobalQuoteSettings, type GlobalQuoteSettings } from "../model/quote-settings";
import type { PriceVersion } from "../model/quote-view-model";

const amount = (value: number | null) => value === null ? "未设置" : `¥${value.toFixed(2)} / 件`;

export function QuotePricingSettings({
  open,
  priceVersion,
  readOnly = false,
  settings,
  onPriceVersionChange,
  onClose,
}: {
  open: boolean;
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
    const preset = presets.find((item) => item.id === presetId);
    if (preset) onPriceVersionChange(applyManufacturingPresetToPriceVersion(priceVersion, preset));
  };
  const freightRule = pricing.includeFreight
    ? `${pricing.freightName || "运费"} · ${amount(pricing.freightAmount)}`
    : "不带入默认运费";

  return <Modal open={open} className="qc-pricing-settings-modal" title="报价设置" description={readOnly ? `当前为历史报价版本，价格版本「${priceVersion.name}」的制作预设快照只读。` : `只负责选择当前价格版本「${priceVersion.name}」使用的制作预设；预设内容请在系统设置中维护。`} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>完成</Button>}>
    <section className="qc-pricing-setting-section">
      <header><div><strong>当前价格版本制作预设</strong><small>选择后形成独立快照，不会影响同一报价的其他价格版本。</small></div></header>
      <FormItem label="制作预设">
        <select className="qc-control" disabled={readOnly} value={pricing.manufacturingPresetId ?? ""} onChange={(event) => selectPreset(event.target.value)}>
          <option value="">请选择制作预设</option>
          {pricing.manufacturingPresetId && !selectedPresetExists && <option value={pricing.manufacturingPresetId}>{pricing.manufacturingPresetName || "已停用制作预设"}（快照）</option>}
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
      </FormItem>
      <dl className="qc-pricing-preset-summary">
        <div><dt>制作国家</dt><dd>{pricing.manufacturingCountry || "未设置"}</dd></div>
        <div><dt>加工币种</dt><dd><span className="qc-pricing-summary-badge">{pricing.laborCurrency}</span></dd></div>
        <div><dt>成本加成率</dt><dd>{pricing.markupRate === null ? "未设置" : `${pricing.markupRate}%`}</dd></div>
        <div><dt>运费规则</dt><dd>{freightRule}</dd></div>
        {pricing.laborCurrency === "USD" && <div><dt>USD/CNY 汇率</dt><dd>{pricing.usdCnyRate === null ? "未设置" : pricing.usdCnyRate.toFixed(2)}</dd></div>}
      </dl>
      <p className="qc-pricing-preset-note">制作预设仅可在“系统设置 → 报价设置 → 制作预设”中新增、编辑或停用。</p>
    </section>
  </Modal>;
}

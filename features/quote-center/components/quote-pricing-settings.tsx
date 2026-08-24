"use client";

import { useEffect, useState } from "react";
import { Button, FormItem, Modal, NullableNumberInput } from "@/components/foundation";
import { loadGlobalQuoteSettings, saveGlobalQuoteSettings, type GlobalCostSetting, type GlobalQuoteSettings } from "../model/quote-settings";
import type { QuoteRevision } from "../model/quote-view-model";

export function QuotePricingSettings({
  open,
  revision,
  readOnly = false,
  globalReadOnly = false,
  onChange,
  onRateChange,
  onGlobalSettingsSaved,
  onClose,
}: {
  open: boolean;
  revision: QuoteRevision;
  readOnly?: boolean;
  globalReadOnly?: boolean;
  onChange: (revision: QuoteRevision) => void;
  onRateChange: (value: number | null) => void;
  onGlobalSettingsSaved?: (settings: GlobalQuoteSettings, previous: GlobalQuoteSettings) => void;
  onClose: () => void;
}) {
  const [globalSettings, setGlobalSettings] = useState<GlobalQuoteSettings>(() => loadGlobalQuoteSettings());
  const [globalError, setGlobalError] = useState("");
  const base = revision.baseInfo;
  const pricing = revision.pricingParameters;
  const setBase = (patch: Partial<typeof base>) => onChange({ ...revision, baseInfo: { ...base, ...patch } });
  const setPricing = (patch: Partial<typeof pricing>) => onChange({ ...revision, pricingParameters: { ...pricing, ...patch } });
  useEffect(() => {
    if (!open) return;
    Promise.resolve().then(() => {
      setGlobalSettings(loadGlobalQuoteSettings());
      setGlobalError("");
    });
  }, [open]);
  const setGlobalCost = (id: string, patch: Partial<GlobalCostSetting>) => {
    setGlobalError("");
    setGlobalSettings((current) => ({ ...current, costs: current.costs.map((cost) => cost.id === id ? { ...cost, ...patch, id: cost.id } : cost) }));
  };
  const addGlobalCost = () => {
    const id = `global-cost-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setGlobalSettings((current) => ({ ...current, costs: [...current.costs, { id, name: "", amount: null, enabled: true, note: "" }] }));
    setGlobalError("");
  };
  const saveGlobal = () => {
    const invalid = globalSettings.costs.find((cost) => cost.enabled && (!cost.name.trim() || cost.amount === null));
    if (invalid) {
      setGlobalError("启用全局费用前，请填写完整的费用名称和金额。");
      return;
    }
    const previous = loadGlobalQuoteSettings();
    const saved = saveGlobalQuoteSettings(globalSettings);
    setGlobalSettings(saved);
    onGlobalSettingsSaved?.(saved, previous);
  };

  return <Modal open={open} className="qc-pricing-settings-modal" title="报价设置" description={readOnly ? "当前为历史报价版本，单张报价口径只读；全局费用保存后只同步当前默认报价版本，不改动历史快照。" : "维护当前报价口径；全局费用保存后会同步当前报价，并作为未来新对象的默认成本。"} onClose={onClose} onSubmit={saveGlobal} footer={<Button variant="secondary" onClick={onClose}>完成</Button>}>
    <section className="qc-pricing-setting-section">
      <header><div><strong>本张报价设置</strong><small>属于当前报价版本快照，不与页面字段设置混用。</small></div></header>
      <fieldset disabled={readOnly} className="qc-modal-form qc-pricing-dialog qc-readonly-fieldset">
        <FormItem label="报价类型" required><div className="qc-segmented"><button type="button" className={base.quoteType === "distribution" ? "selected" : ""} onClick={() => setBase({ quoteType: "distribution" })}>经销</button><button type="button" className={base.quoteType === "processing" ? "selected" : ""} onClick={() => setBase({ quoteType: "processing" })}>加工</button></div></FormItem>
        <FormItem label="加工币种" required><div className="qc-segmented"><button type="button" className={pricing.laborCurrency === "CNY" ? "selected" : ""} onClick={() => setPricing({ laborCurrency: "CNY" })}>CNY / 件</button><button type="button" className={pricing.laborCurrency === "USD" ? "selected" : ""} onClick={() => setPricing({ laborCurrency: "USD" })}>USD / 件</button></div></FormItem>
        <FormItem label="USD/CNY 汇率" required={pricing.laborCurrency === "USD"}><NullableNumberInput className="qc-control" min="0" placeholder="请输入汇率" value={pricing.usdCnyRate} onValueChange={onRateChange} /></FormItem>
        <FormItem label="成本加成率" required><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" min="0" placeholder="请输入加成率" value={pricing.markupRate} onValueChange={(markupRate) => setPricing({ markupRate })} /><span>%</span></div></FormItem>
      </fieldset>
    </section>

    <fieldset disabled={globalReadOnly} className="qc-pricing-setting-section qc-global-quote-settings qc-readonly-fieldset" title={globalReadOnly ? "暂无权限，请联系管理员" : undefined}>
      <header><div><strong>全局报价默认值</strong><small>用于未来新报价；保存时可安全同步当前正在编辑的报价，历史快照不变。</small></div></header>
      <FormItem label="默认工序说明"><textarea className="qc-control qc-global-labor-description" value={globalSettings.defaultLaborDescription} onChange={(event) => setGlobalSettings((current) => ({ ...current, defaultLaborDescription: event.target.value }))} placeholder="例如：裁剪、车缝、整烫、质检包装" /></FormItem>
      <header className="qc-global-cost-subheader"><div><strong>全局费用</strong><small>启用项同步当前默认报价版本的所有价格版本；已手工调整的报价费用会保留。</small></div><span className="qc-global-cost-count">{globalSettings.costs.length} 条</span></header>
      <div className="qc-global-cost-list">
        {globalSettings.costs.map((cost, index) => <article className={cost.enabled ? "" : "is-disabled"} key={cost.id}>
          <div className="qc-global-cost-main">
            <input className="qc-control" aria-label={`全局费用 ${index + 1} 名称`} value={cost.name} onChange={(event) => setGlobalCost(cost.id, { name: event.target.value })} placeholder="费用名称，例如：运费" />
            <div className="qc-number-prefix"><span>¥</span><NullableNumberInput className="qc-control" aria-label={`全局费用 ${cost.name || index + 1} 金额`} min="0" value={cost.amount} onValueChange={(amount) => setGlobalCost(cost.id, { amount })} placeholder="RMB / 件" /></div>
            <label className="qc-setting-switch"><input type="checkbox" checked={cost.enabled} onChange={(event) => setGlobalCost(cost.id, { enabled: event.target.checked })} /><span>{cost.enabled ? "启用" : "停用"}</span></label>
            <button type="button" className="qc-global-cost-delete" aria-label={`删除全局费用 ${cost.name || index + 1}`} title="删除全局费用" onClick={() => setGlobalSettings((current) => ({ ...current, costs: current.costs.filter((item) => item.id !== cost.id) }))}>×</button>
          </div>
          <input className="qc-control qc-global-cost-note" aria-label={`全局费用 ${cost.name || index + 1} 说明`} value={cost.note ?? ""} onChange={(event) => setGlobalCost(cost.id, { note: event.target.value })} placeholder="可选说明，例如：单件运输分摊" />
        </article>)}
        {!globalSettings.costs.length && <div className="qc-global-cost-empty"><span>◇</span><p>暂无全局费用，可按需添加运费、测试费等单件成本。</p></div>}
        <Button variant="text" className="qc-add-global-cost" onClick={addGlobalCost}>＋ 添加全局费用</Button>
        {globalError && <p className="qc-form-alert">{globalError}</p>}
        <div className="qc-global-setting-actions"><small>保存后立即同步当前可编辑报价，并继续用于未来报价与版本。</small><Button type="submit">保存全局费用</Button></div>
      </div>
    </fieldset>
  </Modal>;
}

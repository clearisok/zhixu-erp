"use client";

import { useEffect, useState } from "react";
import { AppShell, Button, Card, FormItem, FormShell, MasterDetail, NullableNumberInput, PageContainer, PageHeader, StatusTag, Toast } from "@/components/foundation";
import { PermissionButton, usePermissions } from "@/features/permissions";
import { createGlobalQuoteSettingsOperationLogs, operationLogRepository } from "@/features/operation-logs";
import { defaultGlobalQuoteSettings, loadGlobalQuoteSettings, saveGlobalQuoteSettings, type GlobalQuoteSettings, type ManufacturingPreset } from "../model/quote-settings";

export function GlobalQuoteSettingsPage() {
  const { can, currentUser } = usePermissions();
  const editable = can("settings.global.edit");
  const [settings, setSettings] = useState<GlobalQuoteSettings>(defaultGlobalQuoteSettings);
  const [selectedPresetId, setSelectedPresetId] = useState(defaultGlobalQuoteSettings.defaultManufacturingPresetId ?? defaultGlobalQuoteSettings.manufacturingPresets[0]?.id ?? "");
  const [toast, setToast] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => {
      const loaded = loadGlobalQuoteSettings();
      setSettings(loaded);
      setSelectedPresetId(loaded.defaultManufacturingPresetId ?? loaded.manufacturingPresets[0]?.id ?? "");
    });
  }, []);

  const save = async () => {
    if (!editable) return;
    if (settings.manufacturingPresets.some((preset) => !preset.name.trim() || !preset.country.trim())) {
      setToast("请先填写完整的预设名称和制作国家");
      window.setTimeout(() => setToast(""), 2600);
      return;
    }
    const before = loadGlobalQuoteSettings();
    const saved = saveGlobalQuoteSettings(settings);
    await operationLogRepository.appendMany(createGlobalQuoteSettingsOperationLogs(before, saved, {
      userId: currentUser.id,
      userName: currentUser.name,
    }));
    setSettings(saved);
    setToast("报价默认参数已保存，仅用于以后新建的报价");
    window.setTimeout(() => setToast(""), 2600);
  };
  const updatePreset = (id: string, patch: Partial<ManufacturingPreset>) => setSettings((current) => ({
    ...current,
    manufacturingPresets: current.manufacturingPresets.map((preset) => preset.id === id ? { ...preset, ...patch } : preset),
  }));
  const addPreset = () => {
    const id = `manufacturing-preset-${Date.now()}`;
    setSettings((current) => ({ ...current, manufacturingPresets: [...current.manufacturingPresets, { id, name: "新制作方案", country: "", laborCurrency: "CNY", markupRate: null, includeFreight: false, freightName: "运费", freightAmount: null }] }));
    setSelectedPresetId(id);
  };
  const removePreset = (id: string) => setSettings((current) => {
    const manufacturingPresets = current.manufacturingPresets.filter((preset) => preset.id !== id);
    return { ...current, manufacturingPresets, defaultManufacturingPresetId: current.defaultManufacturingPresetId === id ? manufacturingPresets[0]?.id ?? null : current.defaultManufacturingPresetId };
  });
  const selectedPreset = settings.manufacturingPresets.find((preset) => preset.id === selectedPresetId) ?? settings.manufacturingPresets[0];

  return <AppShell title="报价设置"><PageContainer>
    <PageHeader eyebrow="SYSTEM SETTINGS" title="报价设置" />
    <FormShell className="qc-card qc-system-settings-card" onSubmit={save}>
      <fieldset disabled={!editable} className="qc-readonly-fieldset" title={!editable ? "暂无权限，请联系管理员" : undefined}>
        <section className="qc-system-settings-section">
          <header><span className="qc-section-index">01</span><div><strong>报价默认参数</strong><small>作为品牌与客户业务员均未配置时的系统回退值。</small></div></header>
          <div className="qc-system-default-grid">
            <FormItem label="系统默认 USD/CNY 汇率"><NullableNumberInput className="qc-control" min="0" value={settings.defaultUsdCnyRate} onValueChange={(defaultUsdCnyRate) => setSettings((current) => ({ ...current, defaultUsdCnyRate }))} /></FormItem>
            <FormItem label="默认成本加成率"><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" min="0" value={settings.defaultMarkupRate} onValueChange={(defaultMarkupRate) => setSettings((current) => ({ ...current, defaultMarkupRate }))} /><span>%</span></div></FormItem>
            <FormItem label="默认加工币种"><div className="qc-segmented"><button type="button" className={settings.defaultLaborCurrency === "CNY" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, defaultLaborCurrency: "CNY" }))}>CNY / 件</button><button type="button" className={settings.defaultLaborCurrency === "USD" ? "selected" : ""} onClick={() => setSettings((current) => ({ ...current, defaultLaborCurrency: "USD" }))}>USD / 件</button></div></FormItem>
          </div>
        </section>

        <section className="qc-system-settings-section qc-preset-settings-section">
          <header><span className="qc-section-index">02</span><div><strong>制作国家预设</strong><small>统一维护制作国家、加工币种、成本加成率与运费；报价明细选择后形成当前价格版本的独立快照。</small></div><Button type="button" variant="secondary" onClick={addPreset}>＋ 新增预设</Button></header>
          <FormItem label="新报价默认预设"><select className="qc-control" value={settings.defaultManufacturingPresetId ?? ""} onChange={(event) => setSettings((current) => ({ ...current, defaultManufacturingPresetId: event.target.value || null }))}><option value="">不使用预设</option>{settings.manufacturingPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></FormItem>
          <MasterDetail className="qc-preset-master-detail" selected={Boolean(selectedPreset)} master={<Card className="qc-preset-master">{settings.manufacturingPresets.map((preset) => <button type="button" key={preset.id} className={preset.id === selectedPreset?.id ? "selected" : ""} onClick={() => setSelectedPresetId(preset.id)}><span><strong>{preset.name}</strong><small>{preset.country || "未填写制作国家"} · {preset.laborCurrency}</small></span>{settings.defaultManufacturingPresetId === preset.id && <StatusTag tone="success">默认</StatusTag>}</button>)}</Card>} detail={selectedPreset ? <Card className="qc-preset-detail"><header><div><strong>{selectedPreset.name}</strong><small>默认仅表示新建时带入；当前预设仍可编辑。</small></div>{settings.defaultManufacturingPresetId === selectedPreset.id && <StatusTag tone="success">新报价默认</StatusTag>}</header><div className="qc-manufacturing-preset-grid"><FormItem label="预设名称" required><input className="qc-control" value={selectedPreset.name} onChange={(event) => updatePreset(selectedPreset.id, { name: event.target.value })} /></FormItem><FormItem label="制作国家" required><input className="qc-control" value={selectedPreset.country} onChange={(event) => updatePreset(selectedPreset.id, { country: event.target.value })} /></FormItem><FormItem label="加工币种"><div className="qc-segmented"><button type="button" className={selectedPreset.laborCurrency === "CNY" ? "selected" : ""} onClick={() => updatePreset(selectedPreset.id, { laborCurrency: "CNY" })}>CNY</button><button type="button" className={selectedPreset.laborCurrency === "USD" ? "selected" : ""} onClick={() => updatePreset(selectedPreset.id, { laborCurrency: "USD" })}>USD</button></div></FormItem><FormItem label="成本加成率"><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" min="0" value={selectedPreset.markupRate} onValueChange={(markupRate) => updatePreset(selectedPreset.id, { markupRate })} /><span>%</span></div></FormItem><FormItem label="运费策略"><label className="qc-manufacturing-freight-toggle"><input type="checkbox" checked={selectedPreset.includeFreight} onChange={(event) => updatePreset(selectedPreset.id, { includeFreight: event.target.checked })} /><span>默认带出运费项</span></label></FormItem><FormItem label="默认运费名称"><input className="qc-control" disabled={!selectedPreset.includeFreight} value={selectedPreset.freightName} onChange={(event) => updatePreset(selectedPreset.id, { freightName: event.target.value })} /></FormItem><FormItem label="默认运费金额"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput className="qc-control" disabled={!selectedPreset.includeFreight} min="0" value={selectedPreset.freightAmount} onValueChange={(freightAmount) => updatePreset(selectedPreset.id, { freightAmount })} placeholder="允许为空" /></div></FormItem></div><footer><small>修改只影响未来使用的默认值，不会改写已有 QuoteRevision / PriceVersion 快照。</small><Button type="button" variant="danger" disabled={settings.manufacturingPresets.length <= 1} onClick={() => removePreset(selectedPreset.id)}>删除预设</Button></footer></Card> : <Card>暂无制作预设</Card>} />
        </section>

        <section className="qc-system-settings-section">
          <header><span className="qc-section-index">03</span><div><strong>默认其他费用</strong><small>只在新建报价时形成一条费用快照，不会回写任何已有报价。</small></div></header>
          <div className="qc-system-default-grid">
            <FormItem label="默认其他费用名称"><input className="qc-control" value={settings.defaultOtherCost?.name ?? ""} onChange={(event) => setSettings((current) => ({ ...current, defaultOtherCost: { name: event.target.value, amount: current.defaultOtherCost?.amount ?? null } }))} placeholder="例如：包装杂费" /></FormItem>
            <FormItem label="默认其他费用金额"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput className="qc-control" min="0" value={settings.defaultOtherCost?.amount ?? null} onValueChange={(amount) => setSettings((current) => ({ ...current, defaultOtherCost: amount === null && !current.defaultOtherCost?.name.trim() ? null : { name: current.defaultOtherCost?.name || "默认其他费用", amount } }))} placeholder="RMB / 件" /></div></FormItem>
          </div>
        </section>

        <section className="qc-system-settings-section">
          <header><span className="qc-section-index">04</span><div><strong>工序说明</strong><small>新报价使用保存时的默认说明；报价形成快照后不再与系统设置联动。</small></div></header>
          <FormItem label="默认工序说明"><textarea className="qc-control qc-global-labor-description" value={settings.defaultLaborDescription} onChange={(event) => setSettings((current) => ({ ...current, defaultLaborDescription: event.target.value }))} placeholder="例如：裁剪、车缝、整烫、质检包装" /></FormItem>
        </section>
      </fieldset>
      <footer className="qc-system-settings-actions"><small>保存不会修改现有 Quote 或历史 QuoteRevision。</small><PermissionButton permission="settings.global.edit" type="submit">保存报价设置</PermissionButton></footer>
    </FormShell>
    <Toast message={toast} />
  </PageContainer></AppShell>;
}

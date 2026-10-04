"use client";

import { useEffect, useState } from "react";
import { AlertBanner, AppShell, Button, Card, FormItem, FormShell, MasterDetail, NullableNumberInput, PageContainer, PageHeader, StatusTag, Toast } from "@/components/foundation";
import { PermissionButton, usePermissionAuthority, usePermissions } from "@/features/permissions";
import { createGlobalQuoteSettingsOperationLogs, operationLogRepository } from "@/features/operation-logs";
import { activeManufacturingPresets, defaultGlobalQuoteSettings, loadGlobalQuoteSettings, saveGlobalQuoteSettings, setManufacturingPresetStatus, type GlobalQuoteSettings, type ManufacturingPreset } from "../model/quote-settings";

export type GlobalQuoteSettingsController = {
  load(): Promise<GlobalQuoteSettings>;
  save(settings: GlobalQuoteSettings): Promise<GlobalQuoteSettings>;
};

export function GlobalQuoteSettingsPage({ serverController, serverProduction = false, onServerLogout }: { serverController?: GlobalQuoteSettingsController; serverProduction?: boolean; onServerLogout?: () => void } = {}) {
  const browser = usePermissions();
  const can = usePermissionAuthority();
  const currentUser = browser.currentUser;
  const editable = can("settings.global.edit");
  const [settings, setSettings] = useState<GlobalQuoteSettings>(defaultGlobalQuoteSettings);
  const [selectedPresetId, setSelectedPresetId] = useState(defaultGlobalQuoteSettings.defaultManufacturingPresetId ?? defaultGlobalQuoteSettings.manufacturingPresets[0]?.id ?? "");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => serverController?.load() ?? loadGlobalQuoteSettings()).then((loaded) => {
      setSettings(loaded);
      setSelectedPresetId(loaded.defaultManufacturingPresetId ?? loaded.manufacturingPresets[0]?.id ?? "");
    }).catch(() => setError("Server 报价设置读取失败；未回退到 Browser 设置。"));
  }, [serverController]);

  const save = async () => {
    if (!editable) return;
    if (settings.manufacturingPresets.some((preset) => !preset.name.trim() || !preset.country.trim())) {
      setToast("请先填写完整的预设名称和制作国家");
      window.setTimeout(() => setToast(""), 2600);
      return;
    }
    try {
      const before = serverController ? null : loadGlobalQuoteSettings();
      const saved = serverController ? await serverController.save(settings) : saveGlobalQuoteSettings(settings);
      if (before) {
        await operationLogRepository.appendMany(createGlobalQuoteSettingsOperationLogs(before, saved, {
          userId: currentUser.id,
          userName: currentUser.name,
        }));
      }
      setSettings(saved);
      setSelectedPresetId((current) => saved.manufacturingPresets.some((preset) => preset.id === current) ? current : saved.defaultManufacturingPresetId ?? saved.manufacturingPresets[0]?.id ?? "");
      setError("");
      setToast("报价默认参数已保存，仅用于以后新建的报价");
      window.setTimeout(() => setToast(""), 2600);
    } catch (nextError) {
      const status = nextError && typeof nextError === "object" && "status" in nextError ? (nextError as { status?: unknown }).status : undefined;
      setError(status === 409 ? "Server 数据已被其他用户更新。当前草稿未覆盖；请确认后重新载入 Server 最新版本。" : status === 401 ? "Server 会话已失效，请重新登录。" : "Server 保存失败；未写入 Browser 设置。");
    }
  };
  const updatePreset = (id: string, patch: Partial<ManufacturingPreset>) => setSettings((current) => ({
    ...current,
    manufacturingPresets: current.manufacturingPresets.map((preset) => preset.id === id ? { ...preset, ...patch } : preset),
  }));
  const togglePresetStatus = (id: string) => setSettings((current) => {
    const preset = current.manufacturingPresets.find((item) => item.id === id);
    if (!preset) return current;
    const status = preset.status === "inactive" ? "active" : "inactive";
    return setManufacturingPresetStatus(current, id, status);
  });
  const addPreset = () => {
    const id = serverController ? `server-preset-draft-${crypto.randomUUID()}` : `manufacturing-preset-${Date.now()}`;
    setSettings((current) => ({ ...current, manufacturingPresets: [...current.manufacturingPresets, { id, name: "新制作方案", country: "", laborCurrency: "CNY", markupRate: null, includeFreight: false, freightName: "运费", freightAmount: null, status: "active" }] }));
    setSelectedPresetId(id);
  };
  const removePreset = (id: string) => setSettings((current) => {
    const manufacturingPresets = current.manufacturingPresets.filter((preset) => preset.id !== id);
    return { ...current, manufacturingPresets, defaultManufacturingPresetId: current.defaultManufacturingPresetId === id ? manufacturingPresets[0]?.id ?? null : current.defaultManufacturingPresetId };
  });
  const reloadServer = async () => {
    if (!serverController || !window.confirm("重新载入将放弃当前未保存草稿，是否继续？")) return;
    const loaded = await serverController.load();
    setSettings(loaded);
    setSelectedPresetId(loaded.defaultManufacturingPresetId ?? loaded.manufacturingPresets[0]?.id ?? "");
    setError("");
  };
  const selectedPreset = settings.manufacturingPresets.find((preset) => preset.id === selectedPresetId) ?? settings.manufacturingPresets[0];

  return <AppShell title="报价设置" identityMode={serverController?"server":"browser"}><PageContainer>
    <PageHeader eyebrow="SYSTEM SETTINGS" title="报价设置" />
    {serverController&&<AlertBanner tone="info" title={serverProduction ? "报价默认值来源：PostgreSQL" : "Server candidate · source = PostgreSQL"} actions={onServerLogout?<Button variant="text" onClick={onServerLogout}>退出 Server 会话</Button>:undefined}>{serverProduction ? "报价默认值与制作预设由 Server 管理；保存时在单一 transaction 提交，不回退到 Browser 设置。" : "本页复用正式报价设置 UI，保存通过一个 Server transaction 原子提交全局设置与制作预设；不会读写 Browser 设置。"}</AlertBanner>}
    {error&&<AlertBanner tone="danger" title={serverProduction ? "Server 设置未保存" : "Server candidate 未保存"} actions={serverController&&error.includes("其他用户")?<Button variant="secondary" onClick={()=>void reloadServer()}>重新载入 Server 版本</Button>:undefined}>{error}</AlertBanner>}
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
          <FormItem label="新报价默认预设"><select className="qc-control" value={settings.defaultManufacturingPresetId ?? ""} onChange={(event) => setSettings((current) => ({ ...current, defaultManufacturingPresetId: event.target.value || null }))}><option value="">不使用预设</option>{activeManufacturingPresets(settings).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></FormItem>
          <MasterDetail className="qc-preset-master-detail" selected={Boolean(selectedPreset)} master={<Card className="qc-preset-master">{settings.manufacturingPresets.map((preset) => <button type="button" key={preset.id} className={preset.id === selectedPreset?.id ? "selected" : ""} onClick={() => setSelectedPresetId(preset.id)}><span><strong>{preset.name}</strong><small>{preset.country || "未填写制作国家"} · {preset.laborCurrency}</small></span>{preset.status === "inactive"&&<StatusTag tone="neutral">停用</StatusTag>}{settings.defaultManufacturingPresetId === preset.id && <StatusTag tone="success">默认</StatusTag>}</button>)}</Card>} detail={selectedPreset ? <Card className="qc-preset-detail"><header><div><strong>{selectedPreset.name}</strong><small>默认仅表示新建时带入；当前预设仍可编辑。</small></div>{settings.defaultManufacturingPresetId === selectedPreset.id && <StatusTag tone="success">新报价默认</StatusTag>}</header><div className="qc-manufacturing-preset-grid"><FormItem label="预设名称" required><input className="qc-control" value={selectedPreset.name} onChange={(event) => updatePreset(selectedPreset.id, { name: event.target.value })} /></FormItem><FormItem label="制作国家" required><input className="qc-control" value={selectedPreset.country} onChange={(event) => updatePreset(selectedPreset.id, { country: event.target.value })} /></FormItem><FormItem label="加工币种"><div className="qc-segmented"><button type="button" className={selectedPreset.laborCurrency === "CNY" ? "selected" : ""} onClick={() => updatePreset(selectedPreset.id, { laborCurrency: "CNY" })}>CNY</button><button type="button" className={selectedPreset.laborCurrency === "USD" ? "selected" : ""} onClick={() => updatePreset(selectedPreset.id, { laborCurrency: "USD" })}>USD</button></div></FormItem><FormItem label="成本加成率"><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" min="0" value={selectedPreset.markupRate} onValueChange={(markupRate) => updatePreset(selectedPreset.id, { markupRate })} /><span>%</span></div></FormItem><FormItem label="运费策略"><label className="qc-manufacturing-freight-toggle"><input type="checkbox" checked={selectedPreset.includeFreight} onChange={(event) => updatePreset(selectedPreset.id, { includeFreight: event.target.checked })} /><span>默认带出运费项</span></label></FormItem><FormItem label="默认运费名称"><input className="qc-control" disabled={!selectedPreset.includeFreight} value={selectedPreset.freightName} onChange={(event) => updatePreset(selectedPreset.id, { freightName: event.target.value })} /></FormItem><FormItem label="默认运费金额"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput className="qc-control" disabled={!selectedPreset.includeFreight} min="0" value={selectedPreset.freightAmount} onValueChange={(freightAmount) => updatePreset(selectedPreset.id, { freightAmount })} placeholder="允许为空" /></div></FormItem></div><footer><small>修改只影响未来使用的默认值，不会改写已有 QuoteRevision / PriceVersion 快照。</small>{serverController?<Button type="button" variant="secondary" onClick={() => togglePresetStatus(selectedPreset.id)}>{selectedPreset.status==="inactive"?"启用预设":"停用预设"}</Button>:<Button type="button" variant="danger" disabled={settings.manufacturingPresets.length <= 1} onClick={() => removePreset(selectedPreset.id)}>删除预设</Button>}</footer></Card> : <Card>暂无制作预设</Card>} />
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

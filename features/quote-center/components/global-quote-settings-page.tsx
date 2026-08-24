"use client";

import { useState } from "react";
import { AppShell, Button, FormItem, FormShell, NullableNumberInput, PageContainer, PageHeader, Toast } from "@/components/foundation";
import { PermissionButton, usePermissions } from "@/features/permissions";
import { loadGlobalQuoteSettings, saveGlobalQuoteSettings, type GlobalCostSetting, type GlobalQuoteSettings } from "../model/quote-settings";

export function GlobalQuoteSettingsPage() {
  const { can } = usePermissions();
  const editable = can("settings.global.edit");
  const [settings, setSettings] = useState<GlobalQuoteSettings>(() => loadGlobalQuoteSettings());
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const setCost = (id: string, patch: Partial<GlobalCostSetting>) => {
    setError("");
    setSettings((current) => ({ ...current, costs: current.costs.map((cost) => cost.id === id ? { ...cost, ...patch, id } : cost) }));
  };
  const addCost = () => setSettings((current) => ({ ...current, costs: [...current.costs, { id: `global-cost-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "", amount: null, enabled: true, note: "" }] }));
  const save = () => {
    if (!editable) return;
    if (settings.costs.some((cost) => cost.enabled && (!cost.name.trim() || cost.amount === null))) {
      setError("启用全局费用前，请填写完整的费用名称和金额。");
      return;
    }
    setSettings(saveGlobalQuoteSettings(settings));
    setToast("全局报价设置已保存，将用于未来新报价");
    window.setTimeout(() => setToast(""), 2600);
  };

  return <AppShell title="报价设置"><PageContainer>
    <PageHeader eyebrow="SYSTEM SETTINGS" title="报价设置" description="维护系统级报价默认值；单张报价的汇率、币种与加成率仍在报价详情内维护。" />
    <FormShell className="qc-card qc-system-settings-card" onSubmit={save}>
      <fieldset disabled={!editable} className="qc-readonly-fieldset" title={!editable ? "暂无权限，请联系管理员" : undefined}>
        <header><div><strong>全局报价默认值</strong><small>本页保存只影响未来新报价；在报价详情内保存时，仍按既有确认规则同步当前可编辑报价。</small></div></header>
        <FormItem label="默认工序说明"><textarea className="qc-control qc-global-labor-description" value={settings.defaultLaborDescription} onChange={(event) => setSettings((current) => ({ ...current, defaultLaborDescription: event.target.value }))} placeholder="例如：裁剪、车缝、整烫、质检包装" /></FormItem>
        <div className="qc-global-cost-subheader"><div><strong>全局费用</strong><small>启用项会作为未来新报价的默认单件成本。</small></div><span className="qc-global-cost-count">{settings.costs.length} 条</span></div>
        <div className="qc-global-cost-list">{settings.costs.map((cost, index) => <article className={cost.enabled ? "" : "is-disabled"} key={cost.id}>
          <div className="qc-global-cost-main"><input className="qc-control" aria-label={`全局费用 ${index + 1} 名称`} value={cost.name} onChange={(event) => setCost(cost.id, { name: event.target.value })} placeholder="费用名称，例如：运费" /><div className="qc-number-prefix"><span>¥</span><NullableNumberInput className="qc-control" min="0" value={cost.amount} onValueChange={(amount) => setCost(cost.id, { amount })} placeholder="RMB / 件" /></div><label className="qc-setting-switch"><input type="checkbox" checked={cost.enabled} onChange={(event) => setCost(cost.id, { enabled: event.target.checked })} /><span>{cost.enabled ? "启用" : "停用"}</span></label><button type="button" className="qc-global-cost-delete" aria-label={`删除全局费用 ${cost.name || index + 1}`} onClick={() => setSettings((current) => ({ ...current, costs: current.costs.filter((item) => item.id !== cost.id) }))}>×</button></div>
          <input className="qc-control qc-global-cost-note" value={cost.note ?? ""} onChange={(event) => setCost(cost.id, { note: event.target.value })} placeholder="可选说明，例如：单件运输分摊" />
        </article>)}{!settings.costs.length && <div className="qc-global-cost-empty"><span>◇</span><p>暂无全局费用，可按需添加运费、测试费等单件成本。</p></div>}<Button variant="text" className="qc-add-global-cost" onClick={addCost}>＋ 添加全局费用</Button>{error && <p className="qc-form-alert">{error}</p>}</div>
      </fieldset>
      <footer className="qc-system-settings-actions"><small>报价历史 Revision 不会被本页修改。</small><PermissionButton permission="settings.global.edit" type="submit">保存报价设置</PermissionButton></footer>
    </FormShell>
    <Toast message={toast} />
  </PageContainer></AppShell>;
}

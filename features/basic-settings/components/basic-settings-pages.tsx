"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Button, Card, FormItem, Modal, NullableNumberInput, PageContainer, PageHeader, StatusTag, Toast } from "@/components/foundation";
import {
  copyCustomerSalesperson, deleteBrand, deleteCustomerSalesperson, searchBrands, searchCustomerSalespeople, upsertBrand, upsertCustomerSalesperson,
  defaultBasicSettings, type BasicSettingsState, type BrandRecord, type CustomerSalespersonRecord, type DefaultQuoteConfiguration,
} from "../model/basic-settings";
import { createMasterDataId, loadBasicSettings, saveBasicSettings } from "../repository/basic-settings-repository";

type DefaultDraft = { rate: number | null; trimName: string; trimSpecification: string; trimPrice: number | null; otherName: string; otherSpecification: string; otherPrice: number | null };
type BrandDraft = { id: string; name: string; code: string; status: "active" | "inactive"; defaults: DefaultDraft };
type SalespersonDraft = BrandDraft & { brandId: string };

const emptyDefaults = (): DefaultDraft => ({ rate: null, trimName: "", trimSpecification: "", trimPrice: null, otherName: "", otherSpecification: "", otherPrice: null });
const defaultsToDraft = (defaults: DefaultQuoteConfiguration): DefaultDraft => ({
  rate: defaults.usdCnyRate,
  trimName: defaults.trims[0]?.name ?? "", trimSpecification: defaults.trims[0]?.specification ?? "", trimPrice: defaults.trims[0]?.unitPrice ?? null,
  otherName: defaults.otherCosts[0]?.name ?? "", otherSpecification: defaults.otherCosts[0]?.specification ?? "", otherPrice: defaults.otherCosts[0]?.unitPrice ?? null,
});
const draftToDefaults = (draft: DefaultDraft, prefix: string): DefaultQuoteConfiguration => ({
  usdCnyRate: draft.rate,
  trims: draft.trimName.trim() ? [{ id: `${prefix}-trim`, name: draft.trimName.trim(), specification: draft.trimSpecification.trim(), usage: 1, unit: "件", lossRate: 0, unitPrice: draft.trimPrice }] : [],
  otherCosts: draft.otherName.trim() ? [{ id: `${prefix}-other`, name: draft.otherName.trim(), specification: draft.otherSpecification.trim(), usage: 1, unit: "件", lossRate: 0, unitPrice: draft.otherPrice }] : [],
});

function useBasicSettingsState() {
  const [state, setState] = useState<BasicSettingsState>(defaultBasicSettings);
  useEffect(() => { Promise.resolve().then(() => setState(loadBasicSettings())); }, []);
  const persist = (next: BasicSettingsState) => setState(saveBasicSettings(next));
  return { state, setState, persist };
}

function DefaultConfigurationFields({ value, onChange }: { value: DefaultDraft; onChange: (value: DefaultDraft) => void }) {
  const patch = (next: Partial<DefaultDraft>) => onChange({ ...value, ...next });
  return <div className="qc-default-fields">
    <FormItem label="默认 USD/CNY 汇率"><NullableNumberInput className="qc-control" min="0" value={value.rate} onValueChange={(rate) => patch({ rate })} placeholder="留空则使用上级默认值" /></FormItem>
    <FormItem label="默认辅料"><input className="qc-control" value={value.trimName} onChange={(event) => patch({ trimName: event.target.value })} placeholder="例如：主唛 / 洗水唛" /></FormItem>
    <FormItem label="辅料规格"><input className="qc-control" value={value.trimSpecification} onChange={(event) => patch({ trimSpecification: event.target.value })} placeholder="例如：缎面印字" /></FormItem>
    <FormItem label="辅料单价"><NullableNumberInput className="qc-control" min="0" value={value.trimPrice} onValueChange={(trimPrice) => patch({ trimPrice })} placeholder="RMB / 件" /></FormItem>
    <FormItem label="默认其他费用"><input className="qc-control" value={value.otherName} onChange={(event) => patch({ otherName: event.target.value })} placeholder="例如：管理分摊" /></FormItem>
    <FormItem label="其他费用规格"><input className="qc-control" value={value.otherSpecification} onChange={(event) => patch({ otherSpecification: event.target.value })} placeholder="例如：单件分摊" /></FormItem>
    <FormItem label="其他费用单价"><NullableNumberInput className="qc-control" min="0" value={value.otherPrice} onValueChange={(otherPrice) => patch({ otherPrice })} placeholder="RMB / 件" /></FormItem>
  </div>;
}

function MasterDataToolbar({ query, onQuery, actionLabel, onAction }: { query: string; onQuery: (value: string) => void; actionLabel: string; onAction: () => void }) {
  return <Card className="qc-master-toolbar"><div className="qc-filter-search"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="输入名称、编码或品牌查询" /></div><Button onClick={onAction}>＋ {actionLabel}</Button></Card>;
}

export function BrandSettingsPage() {
  const { state, setState, persist } = useBasicSettingsState();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<BrandDraft | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const rows = useMemo(() => searchBrands(state.brands, query), [state.brands, query]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const openNew = () => { setError(""); setDraft({ id: createMasterDataId("brand"), name: "", code: "", status: "active", defaults: emptyDefaults() }); };
  const openEdit = (brand: BrandRecord) => { setError(""); setDraft({ id: brand.id, name: brand.name, code: brand.code, status: brand.status, defaults: defaultsToDraft(brand.defaults) }); };
  const save = () => {
    if (!draft?.name.trim()) { setError("请填写品牌名称"); return; }
    persist(upsertBrand(state, { id: draft.id, name: draft.name.trim(), code: draft.code.trim(), status: draft.status, defaults: draftToDefaults(draft.defaults, draft.id) }));
    setDraft(null); notify("品牌资料已保存");
  };
  const remove = (brand: BrandRecord) => { persist(deleteBrand(state, brand.id)); notify(`已删除 ${brand.name}，其客户业务员记录也已同步移除`); };
  const saveSystemDefaults = () => { persist(state); notify("系统默认报价参数已保存"); };

  return <AppShell title="品牌设置"><PageContainer>
    <PageHeader eyebrow="BASIC SETTINGS" title="品牌设置" actions={<Button onClick={openNew}>＋ 新增品牌</Button>} />
    <Card className="qc-system-default-card"><header><div><span className="qc-section-index">01</span><div><h2>系统默认报价参数</h2><p>品牌和客户业务员均未配置时，使用此处作为最终回退。</p></div></div><Button variant="secondary" onClick={saveSystemDefaults}>保存系统默认</Button></header><div className="qc-system-default-grid"><FormItem label="系统默认 USD/CNY 汇率"><NullableNumberInput className="qc-control" min="0" value={state.systemDefaults.usdCnyRate} onValueChange={(usdCnyRate) => setState({ ...state, systemDefaults: { ...state.systemDefaults, usdCnyRate } })} /></FormItem><FormItem label="默认成本加成率"><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" min="0" value={state.systemDefaults.markupRate} onValueChange={(markupRate) => setState({ ...state, systemDefaults: { ...state.systemDefaults, markupRate } })} /><span>%</span></div></FormItem><FormItem label="默认加工币种"><div className="qc-segmented"><button type="button" className={state.systemDefaults.laborCurrency === "CNY" ? "selected" : ""} onClick={() => setState({ ...state, systemDefaults: { ...state.systemDefaults, laborCurrency: "CNY" } })}>CNY / 件</button><button type="button" className={state.systemDefaults.laborCurrency === "USD" ? "selected" : ""} onClick={() => setState({ ...state, systemDefaults: { ...state.systemDefaults, laborCurrency: "USD" } })}>USD / 件</button></div></FormItem></div></Card>
    <MasterDataToolbar query={query} onQuery={setQuery} actionLabel="新增品牌" onAction={openNew} />
    <Card className="qc-master-list"><div className="qc-table-wrap"><table className="qc-master-table"><thead><tr><th>品牌名称 / 编码</th><th>状态</th><th>默认汇率</th><th>默认辅料</th><th>默认其他费用</th><th>客户业务员</th><th>操作</th></tr></thead><tbody>{rows.map((brand) => <tr key={brand.id}><td><strong>{brand.name}</strong><small>{brand.code || "未设置编码"}</small></td><td><StatusTag tone={brand.status === "active" ? "success" : "neutral"}>{brand.status === "active" ? "启用" : "停用"}</StatusTag></td><td>{brand.defaults.usdCnyRate ?? "回退系统值"}</td><td>{brand.defaults.trims[0]?.name || "—"}</td><td>{brand.defaults.otherCosts[0]?.name || "—"}</td><td>{state.customerSalespeople.filter((item) => item.brandId === brand.id).length} 人</td><td><div className="qc-row-actions"><Button variant="text" onClick={() => openEdit(brand)}>编辑</Button><Button variant="danger" onClick={() => remove(brand)}>删除</Button></div></td></tr>)}</tbody></table></div>{!rows.length && <div className="empty-state"><span>◇</span><strong>没有匹配的品牌</strong></div>}</Card>
    <Modal open={Boolean(draft)} title={state.brands.some((brand) => brand.id === draft?.id) ? "编辑品牌" : "新增品牌"} description="维护品牌主数据和新建报价时使用的默认基础配置。" onClose={() => setDraft(null)} footer={<><Button variant="secondary" onClick={() => setDraft(null)}>取消</Button><Button onClick={save}>保存品牌</Button></>}>
      {draft && <div className="qc-modal-form"><div className="qc-modal-grid"><FormItem label="品牌名称" required><input className="qc-control" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="请输入品牌名称" /></FormItem><FormItem label="品牌编码"><input className="qc-control" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="可选" /></FormItem><FormItem label="状态"><select className="qc-control" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value === "inactive" ? "inactive" : "active" })}><option value="active">启用</option><option value="inactive">停用</option></select></FormItem></div><DefaultConfigurationFields value={draft.defaults} onChange={(defaults) => setDraft({ ...draft, defaults })} />{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Modal><Toast message={toast} />
  </PageContainer></AppShell>;
}

export function CustomerSalespeopleSettingsPage() {
  const { state, persist } = useBasicSettingsState();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<SalespersonDraft | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const rows = useMemo(() => searchCustomerSalespeople(state.customerSalespeople, state.brands, query), [state.customerSalespeople, state.brands, query]);
  const brandNames = useMemo(() => new Map(state.brands.map((brand) => [brand.id, brand.name])), [state.brands]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const openNew = () => { setError(""); setDraft({ id: createMasterDataId("sales"), name: "", code: "", brandId: state.brands[0]?.id ?? "", status: "active", defaults: emptyDefaults() }); };
  const openEdit = (record: CustomerSalespersonRecord) => { setError(""); setDraft({ id: record.id, name: record.name, code: record.code, brandId: record.brandId, status: record.status, defaults: defaultsToDraft(record.defaults) }); };
  const save = () => {
    if (!draft?.name.trim()) { setError("请填写客户业务员姓名"); return; }
    if (!draft.brandId) { setError("请选择归属品牌"); return; }
    persist(upsertCustomerSalesperson(state, { id: draft.id, name: draft.name.trim(), code: draft.code.trim(), brandId: draft.brandId, status: draft.status, defaults: draftToDefaults(draft.defaults, draft.id) }));
    setDraft(null); notify("客户业务员资料已保存");
  };
  const copy = (record: CustomerSalespersonRecord) => { persist(copyCustomerSalesperson(state, record.id, createMasterDataId("sales-copy"))); notify(`已复制 ${record.name}`); };
  const remove = (record: CustomerSalespersonRecord) => { persist(deleteCustomerSalesperson(state, record.id)); notify(`已删除 ${record.name}`); };

  return <AppShell title="客户业务员设置"><PageContainer>
    <PageHeader eyebrow="BASIC SETTINGS" title="客户业务员设置" actions={<Button onClick={openNew}>＋ 新增客户业务员</Button>} />
    <MasterDataToolbar query={query} onQuery={setQuery} actionLabel="新增客户业务员" onAction={openNew} />
    <Card className="qc-master-list"><div className="qc-table-wrap"><table className="qc-master-table"><thead><tr><th>客户业务员 / 编码</th><th>归属品牌</th><th>状态</th><th>默认汇率</th><th>默认辅料</th><th>默认其他费用</th><th>操作</th></tr></thead><tbody>{rows.map((record) => <tr key={record.id}><td><strong>{record.name}</strong><small>{record.code || "未设置编码"}</small></td><td>{brandNames.get(record.brandId) || "—"}</td><td><StatusTag tone={record.status === "active" ? "success" : "neutral"}>{record.status === "active" ? "启用" : "停用"}</StatusTag></td><td>{record.defaults.usdCnyRate ?? "回退品牌值"}</td><td>{record.defaults.trims[0]?.name || "回退品牌值"}</td><td>{record.defaults.otherCosts[0]?.name || "回退品牌值"}</td><td><div className="qc-row-actions"><Button variant="text" onClick={() => openEdit(record)}>编辑</Button><Button variant="secondary" onClick={() => copy(record)}>复制</Button><Button variant="danger" onClick={() => remove(record)}>删除</Button></div></td></tr>)}</tbody></table></div>{!rows.length && <div className="empty-state"><span>◇</span><strong>没有匹配的客户业务员</strong></div>}</Card>
    <Modal open={Boolean(draft)} title={state.customerSalespeople.some((record) => record.id === draft?.id) ? "编辑客户业务员" : "新增客户业务员"} description="一个品牌可维护多位客户业务员；个人默认配置优先于品牌默认配置。" onClose={() => setDraft(null)} footer={<><Button variant="secondary" onClick={() => setDraft(null)}>取消</Button><Button onClick={save}>保存客户业务员</Button></>}>
      {draft && <div className="qc-modal-form"><div className="qc-modal-grid"><FormItem label="客户业务员姓名" required><input className="qc-control" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="请输入姓名" /></FormItem><FormItem label="编码"><input className="qc-control" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="可选" /></FormItem><FormItem label="归属品牌" required><select className="qc-control" value={draft.brandId} onChange={(event) => setDraft({ ...draft, brandId: event.target.value })}>{state.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></FormItem><FormItem label="状态"><select className="qc-control" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value === "inactive" ? "inactive" : "active" })}><option value="active">启用</option><option value="inactive">停用</option></select></FormItem></div><DefaultConfigurationFields value={draft.defaults} onChange={(defaults) => setDraft({ ...draft, defaults })} />{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Modal><Toast message={toast} />
  </PageContainer></AppShell>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AppShell,
  Button,
  Card,
  CreatableCombobox,
  FormShell,
  FormItem,
  Modal,
  NullableNumberInput,
  PageContainer,
  PageHeader,
  StatusTag,
  Toast,
} from "@/components/foundation";
import {
  copyCustomerSalesperson,
  defaultBasicSettings,
  deleteBrand,
  deleteCustomerSalesperson,
  deleteFabricLibraryItem,
  deleteTrimLibraryItem,
  searchBrands,
  searchCustomerSalespeople,
  searchFabricLibrary,
  searchTrimLibrary,
  supplierSuggestions,
  upsertBrand,
  upsertCustomerSalesperson,
  upsertFabricLibraryItem,
  upsertTrimLibraryItem,
  validateBrandName,
  validateCustomerSalespersonName,
  type BasicSettingsState,
  type BrandRecord,
  type CustomerSalespersonRecord,
  type DefaultQuoteConfiguration,
  type DefaultTrimConfig,
  type FabricLibraryItem,
  type TrimLibraryItem,
} from "../model/basic-settings";
import { createMasterDataId, loadBasicSettings, saveBasicSettings } from "../repository/basic-settings-repository";
import { PermissionButton, usePermissions, type PermissionKey } from "@/features/permissions";

type DefaultDraft = { rate: number | null; trims: DefaultTrimConfig[]; otherCostName: string; otherCostAmount: number | null };

type BrandDraft = {
  id: string;
  name: string;
  status: "active" | "inactive";
  defaults: DefaultDraft;
};

type SalespersonDraft = BrandDraft & { brandId: string };

const emptyDefaults = (): DefaultDraft => ({ rate: null, trims: [], otherCostName: "", otherCostAmount: null });

const defaultsToDraft = (defaults: DefaultQuoteConfiguration): DefaultDraft => ({
  rate: defaults.defaultUsdCnyRate,
  trims: structuredClone(defaults.defaultTrims),
  otherCostName: defaults.defaultOtherCost?.name ?? "",
  otherCostAmount: defaults.defaultOtherCost?.amount ?? null,
});

const draftToDefaults = (draft: DefaultDraft, prefix: string): DefaultQuoteConfiguration => ({
  defaultUsdCnyRate: draft.rate,
  defaultTrims: draft.trims.map((item, index): DefaultTrimConfig => ({ ...item, id: item.id || `${prefix}-default-trim-${index + 1}` })),
  defaultOtherCost: draft.otherCostName.trim() || draft.otherCostAmount !== null ? { name: draft.otherCostName.trim() || "默认其他费用", amount: draft.otherCostAmount } : null,
});

function useBasicSettingsState() {
  const [state, setState] = useState<BasicSettingsState>(defaultBasicSettings);
  useEffect(() => { Promise.resolve().then(() => setState(loadBasicSettings())); }, []);
  const persist = (next: BasicSettingsState) => setState(saveBasicSettings(next));
  return { state, setState, persist };
}

function useToast() {
  const [toast, setToast] = useState("");
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  return { toast, notify };
}

function DefaultConfigurationFields({
  value,
  trimLibrary,
  onChange,
}: {
  value: DefaultDraft;
  trimLibrary: TrimLibraryItem[];
  onChange: (value: DefaultDraft) => void;
}) {
  const patch = (next: Partial<DefaultDraft>) => onChange({ ...value, ...next });
  const selected = value.trims.flatMap((config) => {
    const item = trimLibrary.find((candidate) => candidate.id === config.trimLibraryItemId);
    return item ? [{ config, item }] : [];
  });

  const addTrim = (id: string) => {
    if (!id || value.trims.some((item) => item.trimLibraryItemId === id)) return;
    patch({ trims: [...value.trims, { id: createMasterDataId("default-trim"), trimLibraryItemId: id, overrideLossRate: null, overrideUnitPrice: null }] });
  };

  return <div className="qc-default-fields">
    <FormItem label="默认 USD/CNY 汇率"><NullableNumberInput className="qc-control" min="0" value={value.rate} onValueChange={(rate) => patch({ rate })} placeholder="留空则使用上级默认值" /></FormItem>
    <FormItem label="默认其他费用名称"><input className="qc-control" value={value.otherCostName} onChange={(event) => patch({ otherCostName: event.target.value })} placeholder="例如：测试费" /></FormItem>
    <FormItem label="默认其他费用金额"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput className="qc-control" min="0" value={value.otherCostAmount} onValueChange={(otherCostAmount) => patch({ otherCostAmount })} placeholder="RMB / 件" /></div></FormItem>
    <div className="qc-default-trims-editor">
      <div><strong>默认辅料</strong><small>从辅料库选择，可配置多条；带入报价后用量保持为空。</small></div>
      <select className="qc-control" value="" onChange={(event) => addTrim(event.target.value)}>
        <option value="">＋ 从辅料库添加</option>
        {trimLibrary.filter((item) => !value.trims.some((config) => config.trimLibraryItemId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.supplier || "未填供应商"} · {item.specification || "无规格"}</option>)}
      </select>
      <div className="qc-default-trim-list">
        {selected.map(({ config, item }) => <article key={config.id} className="qc-default-trim-item"><div><strong>{item.name}</strong><small>{item.specification || "无规格"} · {item.supplier || "未填供应商"} · 库价 ¥{item.unitPrice ?? "—"}/{item.unit}</small></div><label><span>覆盖损耗 %</span><NullableNumberInput className="qc-control" min="0" value={config.overrideLossRate} onValueChange={(overrideLossRate) => patch({ trims: value.trims.map((entry) => entry.id === config.id ? { ...entry, overrideLossRate } : entry) })} placeholder="使用库值" /></label><label><span>覆盖单价</span><NullableNumberInput className="qc-control" min="0" value={config.overrideUnitPrice} onValueChange={(overrideUnitPrice) => patch({ trims: value.trims.map((entry) => entry.id === config.id ? { ...entry, overrideUnitPrice } : entry) })} placeholder="使用库值" /></label><button type="button" aria-label={`移除${item.name}`} onClick={() => patch({ trims: value.trims.filter((entry) => entry.id !== config.id) })}>×</button></article>)}
        {!selected.length && <p>暂未配置，报价时将回退上级默认辅料。</p>}
      </div>
    </div>
  </div>;
}

function MasterDataToolbar({
  query,
  onQuery,
  actionLabel,
  onAction,
  placeholder = "输入名称查询",
  permission,
}: {
  query: string;
  onQuery: (value: string) => void;
  actionLabel: string;
  onAction: () => void;
  placeholder?: string;
  permission: PermissionKey;
}) {
  return <Card className="qc-master-toolbar"><div className="qc-filter-search"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} /></div><PermissionButton permission={permission} onClick={onAction}>＋ {actionLabel}</PermissionButton></Card>;
}

export function BrandSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("settings.brand.edit");
  const { state, setState, persist } = useBasicSettingsState();
  const { toast, notify } = useToast();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<BrandDraft | null>(null);
  const [error, setError] = useState("");
  const rows = useMemo(() => searchBrands(state.brands, query), [state.brands, query]);

  const openNew = () => { setError(""); setDraft({ id: createMasterDataId("brand"), name: "", status: "active", defaults: emptyDefaults() }); };
  const openEdit = (brand: BrandRecord) => { setError(""); setDraft({ id: brand.id, name: brand.name, status: brand.status, defaults: defaultsToDraft(brand.defaults) }); };
  const save = () => {
    if (!draft || !canManage) return;
    const validationError = validateBrandName(state, draft.name, draft.id);
    if (validationError) { setError(validationError); return; }
    persist(upsertBrand(state, { id: draft.id, name: draft.name.trim(), status: draft.status, defaults: draftToDefaults(draft.defaults, draft.id) }));
    setDraft(null);
    notify("品牌资料已保存");
  };
  const remove = (brand: BrandRecord) => {
    if (!canManage) return;
    if (!window.confirm(`确定删除品牌“${brand.name}”吗？归属该品牌的客户业务员也会删除。`)) return;
    persist(deleteBrand(state, brand.id));
    notify(`已删除 ${brand.name}`);
  };
  const saveSystemDefaults = () => { if (!can("settings.global.edit")) return; persist(state); notify("系统默认报价参数已保存"); };

  return <AppShell title="品牌设置"><PageContainer>
    <PageHeader eyebrow="BASIC SETTINGS" title="品牌设置" actions={<PermissionButton permission="settings.brand.edit" onClick={openNew}>＋ 新增品牌</PermissionButton>} />
    <FormShell onSubmit={saveSystemDefaults}><fieldset disabled={!can("settings.global.edit")} className="qc-readonly-fieldset" title={!can("settings.global.edit") ? "暂无权限，请联系管理员" : undefined}>
      <Card className="qc-system-default-card">
        <header><div><span className="qc-section-index">01</span><div><h2>系统默认报价参数</h2><p>客户业务员和品牌均未配置时，使用此处作为最终回退。</p></div></div><PermissionButton permission="settings.global.edit" type="submit" variant="secondary">保存系统默认</PermissionButton></header>
        <div className="qc-system-default-grid">
          <FormItem label="系统默认 USD/CNY 汇率"><NullableNumberInput className="qc-control" min="0" value={state.systemDefaults.usdCnyRate} onValueChange={(usdCnyRate) => setState({ ...state, systemDefaults: { ...state.systemDefaults, usdCnyRate } })} /></FormItem>
          <FormItem label="默认成本加成率"><div className="qc-number-suffix qc-control-wrap"><NullableNumberInput className="qc-control" min="0" value={state.systemDefaults.markupRate} onValueChange={(markupRate) => setState({ ...state, systemDefaults: { ...state.systemDefaults, markupRate } })} /><span>%</span></div></FormItem>
          <FormItem label="系统默认其他费用名称"><input className="qc-control" value={state.systemDefaults.defaultOtherCost?.name ?? ""} onChange={(event) => setState({ ...state, systemDefaults: { ...state.systemDefaults, defaultOtherCost: { name: event.target.value, amount: state.systemDefaults.defaultOtherCost?.amount ?? null } } })} placeholder="例如：包装杂费" /></FormItem>
          <FormItem label="系统默认其他费用金额"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput className="qc-control" min="0" value={state.systemDefaults.defaultOtherCost?.amount ?? null} onValueChange={(amount) => setState({ ...state, systemDefaults: { ...state.systemDefaults, defaultOtherCost: { name: state.systemDefaults.defaultOtherCost?.name || "默认其他费用", amount } } })} placeholder="RMB / 件" /></div></FormItem>
          <FormItem label="默认加工币种"><div className="qc-segmented"><button type="button" className={state.systemDefaults.laborCurrency === "CNY" ? "selected" : ""} onClick={() => setState({ ...state, systemDefaults: { ...state.systemDefaults, laborCurrency: "CNY" } })}>CNY / 件</button><button type="button" className={state.systemDefaults.laborCurrency === "USD" ? "selected" : ""} onClick={() => setState({ ...state, systemDefaults: { ...state.systemDefaults, laborCurrency: "USD" } })}>USD / 件</button></div></FormItem>
        </div>
      </Card>
    </fieldset></FormShell>
    <MasterDataToolbar query={query} onQuery={setQuery} actionLabel="新增品牌" onAction={openNew} placeholder="输入品牌名称查询" permission="settings.brand.edit" />
    <Card className="qc-master-list"><div className="qc-table-wrap"><table className="qc-master-table"><thead><tr><th>品牌名称</th><th>状态</th><th>默认汇率</th><th>默认辅料</th><th>默认其他费用</th><th>客户业务员</th><th>操作</th></tr></thead><tbody>{rows.map((brand) => <tr key={brand.id}><td><strong>{brand.name}</strong></td><td><StatusTag tone={brand.status === "active" ? "success" : "neutral"}>{brand.status === "active" ? "启用" : "停用"}</StatusTag></td><td>{brand.defaults.defaultUsdCnyRate ?? "回退系统值"}</td><td>{brand.defaults.defaultTrims.length ? `${brand.defaults.defaultTrims.length} 条` : "—"}</td><td>{brand.defaults.defaultOtherCost === null ? "回退系统值" : <><strong>{brand.defaults.defaultOtherCost.name}</strong><small>¥{brand.defaults.defaultOtherCost.amount?.toFixed(2) ?? "—"} / 件</small></>}</td><td>{state.customerSalespeople.filter((item) => item.brandId === brand.id).length} 人</td><td><div className="qc-row-actions"><PermissionButton permission="settings.brand.edit" variant="text" onClick={() => openEdit(brand)}>编辑</PermissionButton><PermissionButton permission="settings.brand.edit" variant="danger" onClick={() => remove(brand)}>删除</PermissionButton></div></td></tr>)}</tbody></table></div>{!rows.length && <div className="empty-state"><span>◇</span><strong>没有匹配的品牌</strong></div>}</Card>
    <Modal open={Boolean(draft)} title={state.brands.some((brand) => brand.id === draft?.id) ? "编辑品牌" : "新增品牌"} description="品牌名称在整个系统内唯一；默认辅料从辅料库选择。" onClose={() => setDraft(null)} onSubmit={save} footer={<><Button variant="secondary" onClick={() => setDraft(null)}>取消</Button><Button type="submit">保存品牌</Button></>}>
      {draft && <div className="qc-modal-form"><div className="qc-modal-grid"><FormItem label="品牌名称" required><input className="qc-control" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(""); }} placeholder="请输入品牌名称" /></FormItem><FormItem label="状态"><select className="qc-control" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value === "inactive" ? "inactive" : "active" })}><option value="active">启用</option><option value="inactive">停用</option></select></FormItem></div><DefaultConfigurationFields value={draft.defaults} trimLibrary={state.trimLibrary} onChange={(defaults) => setDraft({ ...draft, defaults })} />{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Modal><Toast message={toast} />
  </PageContainer></AppShell>;
}

export function CustomerSalespeopleSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("settings.salesperson.edit");
  const { state, persist } = useBasicSettingsState();
  const { toast, notify } = useToast();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<SalespersonDraft | null>(null);
  const [error, setError] = useState("");
  const rows = useMemo(() => searchCustomerSalespeople(state.customerSalespeople, state.brands, query), [state.customerSalespeople, state.brands, query]);
  const brandNames = useMemo(() => new Map(state.brands.map((brand) => [brand.id, brand.name])), [state.brands]);

  const openNew = () => { setError(""); setDraft({ id: createMasterDataId("sales"), name: "", brandId: state.brands[0]?.id ?? "", status: "active", defaults: emptyDefaults() }); };
  const openEdit = (item: CustomerSalespersonRecord) => { setError(""); setDraft({ id: item.id, name: item.name, brandId: item.brandId, status: item.status, defaults: defaultsToDraft(item.defaults) }); };
  const save = () => {
    if (!draft || !canManage) return;
    const validationError = validateCustomerSalespersonName(state, draft.name, draft.id);
    if (validationError) { setError(validationError); return; }
    if (!draft.brandId) { setError("请选择归属品牌"); return; }
    persist(upsertCustomerSalesperson(state, { id: draft.id, name: draft.name.trim(), brandId: draft.brandId, status: draft.status, defaults: draftToDefaults(draft.defaults, draft.id) }));
    setDraft(null);
    notify("客户业务员资料已保存");
  };
  const copy = (item: CustomerSalespersonRecord) => { if (!canManage) return; persist(copyCustomerSalesperson(state, item.id, createMasterDataId("sales-copy"))); notify(`已复制 ${item.name}`); };
  const remove = (item: CustomerSalespersonRecord) => {
    if (!canManage) return;
    if (!window.confirm(`确定删除客户业务员“${item.name}”吗？`)) return;
    persist(deleteCustomerSalesperson(state, item.id));
    notify(`已删除 ${item.name}`);
  };

  return <AppShell title="客户业务员设置"><PageContainer>
    <PageHeader eyebrow="BASIC SETTINGS" title="客户业务员设置" actions={<PermissionButton permission="settings.salesperson.edit" onClick={openNew}>＋ 新增客户业务员</PermissionButton>} />
    <MasterDataToolbar query={query} onQuery={setQuery} actionLabel="新增客户业务员" onAction={openNew} placeholder="输入姓名或品牌查询" permission="settings.salesperson.edit" />
    <Card className="qc-master-list"><div className="qc-table-wrap"><table className="qc-master-table"><thead><tr><th>客户业务员</th><th>归属品牌</th><th>状态</th><th>默认汇率</th><th>默认辅料</th><th>默认其他费用</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{brandNames.get(item.brandId) || "—"}</td><td><StatusTag tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "启用" : "停用"}</StatusTag></td><td>{item.defaults.defaultUsdCnyRate ?? "回退品牌值"}</td><td>{item.defaults.defaultTrims.length ? `${item.defaults.defaultTrims.length} 条` : "回退品牌值"}</td><td>{item.defaults.defaultOtherCost === null ? "回退品牌值" : <><strong>{item.defaults.defaultOtherCost.name}</strong><small>¥{item.defaults.defaultOtherCost.amount?.toFixed(2) ?? "—"} / 件</small></>}</td><td><div className="qc-row-actions"><PermissionButton permission="settings.salesperson.edit" variant="text" onClick={() => openEdit(item)}>编辑</PermissionButton><PermissionButton permission="settings.salesperson.edit" variant="secondary" onClick={() => copy(item)}>复制</PermissionButton><PermissionButton permission="settings.salesperson.edit" variant="danger" onClick={() => remove(item)}>删除</PermissionButton></div></td></tr>)}</tbody></table></div>{!rows.length && <div className="empty-state"><span>◇</span><strong>没有匹配的客户业务员</strong></div>}</Card>
    <Modal open={Boolean(draft)} title={state.customerSalespeople.some((item) => item.id === draft?.id) ? "编辑客户业务员" : "新增客户业务员"} description="姓名在整个系统内唯一；个人默认配置优先于品牌默认配置。" onClose={() => setDraft(null)} onSubmit={save} footer={<><Button variant="secondary" onClick={() => setDraft(null)}>取消</Button><Button type="submit">保存客户业务员</Button></>}>
      {draft && <div className="qc-modal-form"><div className="qc-modal-grid"><FormItem label="客户业务员姓名" required><input className="qc-control" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(""); }} placeholder="请输入姓名" /></FormItem><FormItem label="归属品牌" required><select className="qc-control" value={draft.brandId} onChange={(event) => setDraft({ ...draft, brandId: event.target.value })}>{state.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></FormItem><FormItem label="状态"><select className="qc-control" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value === "inactive" ? "inactive" : "active" })}><option value="active">启用</option><option value="inactive">停用</option></select></FormItem></div><DefaultConfigurationFields value={draft.defaults} trimLibrary={state.trimLibrary} onChange={(defaults) => setDraft({ ...draft, defaults })} />{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Modal><Toast message={toast} />
  </PageContainer></AppShell>;
}

const emptyFabric = (): FabricLibraryItem => { const now = new Date().toISOString(); return { id: createMasterDataId("fabric"), name: "", composition: "", netWidthCm: null, gsm: null, defaultLossRate: null, supplier: "", unitPrice: null, purchaseUnit: "kg", createdAt: now, updatedAt: now }; };

export function FabricLibraryPage() {
  const { can } = usePermissions();
  const canManage = can("settings.fabric.edit");
  const { state, persist } = useBasicSettingsState();
  const { toast, notify } = useToast();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<FabricLibraryItem | null>(null);
  const [error, setError] = useState("");
  const rows = useMemo(() => searchFabricLibrary(state.fabricLibrary, query), [state.fabricLibrary, query]);
  const suppliers = useMemo(() => supplierSuggestions(state), [state]);
  const save = () => {
    if (!canManage) return;
    if (!draft?.name.trim()) { setError("请填写面料名称"); return; }
    persist(upsertFabricLibraryItem(state, { ...draft, name: draft.name.trim() }));
    setDraft(null);
    notify("面料资料已保存");
  };
  const remove = (item: FabricLibraryItem) => {
    if (!canManage) return;
    if (!window.confirm(`确定删除面料“${item.name}”吗？历史报价快照不会受影响。`)) return;
    persist(deleteFabricLibraryItem(state, item.id));
    notify(`已删除 ${item.name}`);
  };
  return <AppShell title="面料库"><PageContainer>
    <PageHeader eyebrow="MATERIAL LIBRARY" title="面料库" description="同名面料可由不同供应商提供；系统使用稳定 ID 区分。段长、单耗和成本不会存入库。" actions={<PermissionButton permission="settings.fabric.edit" onClick={() => { setError(""); setDraft(emptyFabric()); }}>＋ 新增面料</PermissionButton>} />
    <MasterDataToolbar query={query} onQuery={setQuery} actionLabel="新增面料" onAction={() => { setError(""); setDraft(emptyFabric()); }} placeholder="搜索名称、成分或供应商" permission="settings.fabric.edit" />
    <Card className="qc-master-list"><div className="qc-table-wrap"><table className="qc-master-table qc-fabric-library-table"><thead><tr><th>面料名称</th><th>成分</th><th>净门幅</th><th>克重</th><th>默认损耗率</th><th>供应商</th><th>单价</th><th>采购单位</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.id}</small></td><td>{item.composition || "—"}</td><td>{item.netWidthCm === null ? "—" : `${item.netWidthCm} cm`}</td><td>{item.gsm === null ? "—" : `${item.gsm} gsm`}</td><td>{item.defaultLossRate === null ? "—" : `${item.defaultLossRate}%`}</td><td>{item.supplier || "—"}</td><td>{item.unitPrice === null ? "—" : `¥${item.unitPrice.toFixed(2)}`}</td><td>{item.purchaseUnit === "kg" ? "千克" : "米"}</td><td><div className="qc-row-actions"><PermissionButton permission="settings.fabric.edit" variant="text" onClick={() => { setError(""); setDraft({ ...item }); }}>编辑</PermissionButton><PermissionButton permission="settings.fabric.edit" variant="danger" onClick={() => remove(item)}>删除</PermissionButton></div></td></tr>)}</tbody></table></div>{!rows.length && <div className="empty-state"><span>◇</span><strong>没有匹配的面料</strong></div>}</Card>
    <Modal open={Boolean(draft)} title={state.fabricLibrary.some((item) => item.id === draft?.id) ? "编辑面料" : "新增面料"} description="这里只保存静态基础资料；段长与计算结果属于报价快照。" onClose={() => setDraft(null)} onSubmit={save} footer={<><Button variant="secondary" onClick={() => setDraft(null)}>取消</Button><Button type="submit">保存面料</Button></>}>
      {draft && <div className="qc-modal-form qc-material-form"><FormItem label="面料名称" required><input className="qc-control" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(""); }} /></FormItem><FormItem label="成分"><input className="qc-control" value={draft.composition} onChange={(event) => setDraft({ ...draft, composition: event.target.value })} placeholder="例如：100% Cotton" /></FormItem><FormItem label="净门幅 cm"><NullableNumberInput className="qc-control" min="0" value={draft.netWidthCm} onValueChange={(netWidthCm) => setDraft({ ...draft, netWidthCm })} /></FormItem><FormItem label="克重 gsm"><NullableNumberInput className="qc-control" min="0" value={draft.gsm} onValueChange={(gsm) => setDraft({ ...draft, gsm })} /></FormItem><FormItem label="默认损耗率 %"><NullableNumberInput className="qc-control" min="0" value={draft.defaultLossRate} onValueChange={(defaultLossRate) => setDraft({ ...draft, defaultLossRate })} /></FormItem><FormItem label="供应商"><CreatableCombobox ariaLabel="面料供应商" value={draft.supplier} suggestions={suppliers} onChange={(supplier) => setDraft({ ...draft, supplier })} /></FormItem><FormItem label="单价"><NullableNumberInput className="qc-control" min="0" value={draft.unitPrice} onValueChange={(unitPrice) => setDraft({ ...draft, unitPrice })} /></FormItem><FormItem label="采购单位" required><select className="qc-control" value={draft.purchaseUnit} onChange={(event) => setDraft({ ...draft, purchaseUnit: event.target.value === "meter" ? "meter" : "kg" })}><option value="kg">千克</option><option value="meter">米</option></select></FormItem>{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Modal><Toast message={toast} />
  </PageContainer></AppShell>;
}

const emptyTrim = (): TrimLibraryItem => { const now = new Date().toISOString(); return { id: createMasterDataId("trim"), name: "", specification: "", supplier: "", unit: "", defaultLossRate: null, unitPrice: null, createdAt: now, updatedAt: now }; };

export function TrimLibraryPage() {
  const { can } = usePermissions();
  const canManage = can("settings.trim.edit");
  const { state, persist } = useBasicSettingsState();
  const { toast, notify } = useToast();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<TrimLibraryItem | null>(null);
  const [error, setError] = useState("");
  const rows = useMemo(() => searchTrimLibrary(state.trimLibrary, query), [state.trimLibrary, query]);
  const suppliers = useMemo(() => supplierSuggestions(state), [state]);
  const save = () => {
    if (!canManage) return;
    if (!draft?.name.trim()) { setError("请填写辅料名称"); return; }
    persist(upsertTrimLibraryItem(state, { ...draft, name: draft.name.trim() }));
    setDraft(null);
    notify("辅料资料已保存");
  };
  const remove = (item: TrimLibraryItem) => {
    if (!canManage) return;
    if (!window.confirm(`确定删除辅料“${item.name}”吗？默认配置中的引用会同步移除。`)) return;
    persist(deleteTrimLibraryItem(state, item.id));
    notify(`已删除 ${item.name}`);
  };
  return <AppShell title="辅料库"><PageContainer>
    <PageHeader eyebrow="MATERIAL LIBRARY" title="辅料库" description="同名辅料可由不同供应商提供；系统使用稳定 ID 区分。报价用量始终由具体报价填写。" actions={<PermissionButton permission="settings.trim.edit" onClick={() => { setError(""); setDraft(emptyTrim()); }}>＋ 新增辅料</PermissionButton>} />
    <MasterDataToolbar query={query} onQuery={setQuery} actionLabel="新增辅料" onAction={() => { setError(""); setDraft(emptyTrim()); }} placeholder="搜索名称、规格或供应商" permission="settings.trim.edit" />
    <Card className="qc-master-list"><div className="qc-table-wrap"><table className="qc-master-table"><thead><tr><th>辅料名称</th><th>规格</th><th>供应商</th><th>单位</th><th>默认损耗率</th><th>单价</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.id}</small></td><td>{item.specification || "—"}</td><td>{item.supplier || "—"}</td><td>{item.unit || "—"}</td><td>{item.defaultLossRate === null ? "—" : `${item.defaultLossRate}%`}</td><td>{item.unitPrice === null ? "—" : `¥${item.unitPrice.toFixed(2)}`}</td><td><div className="qc-row-actions"><PermissionButton permission="settings.trim.edit" variant="text" onClick={() => { setError(""); setDraft({ ...item }); }}>编辑</PermissionButton><PermissionButton permission="settings.trim.edit" variant="danger" onClick={() => remove(item)}>删除</PermissionButton></div></td></tr>)}</tbody></table></div>{!rows.length && <div className="empty-state"><span>◇</span><strong>没有匹配的辅料</strong></div>}</Card>
    <Modal open={Boolean(draft)} title={state.trimLibrary.some((item) => item.id === draft?.id) ? "编辑辅料" : "新增辅料"} description="除报价用量外，其余辅料基础资料均可保存到库。" onClose={() => setDraft(null)} onSubmit={save} footer={<><Button variant="secondary" onClick={() => setDraft(null)}>取消</Button><Button type="submit">保存辅料</Button></>}>
      {draft && <div className="qc-modal-form qc-material-form"><FormItem label="辅料名称" required><input className="qc-control" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(""); }} /></FormItem><FormItem label="规格"><input className="qc-control" value={draft.specification} onChange={(event) => setDraft({ ...draft, specification: event.target.value })} /></FormItem><FormItem label="供应商"><CreatableCombobox ariaLabel="辅料供应商" value={draft.supplier} suggestions={suppliers} onChange={(supplier) => setDraft({ ...draft, supplier })} /></FormItem><FormItem label="单位"><input className="qc-control" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="例如：粒、枚、套" /></FormItem><FormItem label="默认损耗率 %"><NullableNumberInput className="qc-control" min="0" value={draft.defaultLossRate} onValueChange={(defaultLossRate) => setDraft({ ...draft, defaultLossRate })} /></FormItem><FormItem label="单价"><NullableNumberInput className="qc-control" min="0" value={draft.unitPrice} onValueChange={(unitPrice) => setDraft({ ...draft, unitPrice })} /></FormItem>{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Modal><Toast message={toast} />
  </PageContainer></AppShell>;
}

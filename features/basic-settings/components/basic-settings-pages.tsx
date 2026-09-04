"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AppShell,
  Button,
  Card,
  CreatableCombobox,
  DataTable,
  Drawer,
  EmptyState,
  FormItem,
  MasterDataActions,
  NullableNumberInput,
  PageContainer,
  PageHeader,
  StatusTag,
  SearchField,
  Toolbar,
  Toast,
  UnsavedDraftDialog,
  useGuardedDraft,
  type DataColumn,
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
  type FabricLibraryItem,
  type TrimLibraryItem,
} from "../model/basic-settings";
import { createMasterDataId, loadBasicSettings, saveBasicSettings } from "../repository/basic-settings-repository";
import { PermissionButton, usePermissions } from "@/features/permissions";
import { createBasicSettingsOperationLogs, operationLogRepository } from "@/features/operation-logs";
import {
  appendDefaultTrim,
  BrandFormFields,
  createBrandDraft,
  createSalespersonDraft,
  createTrimLibraryDraft,
  defaultConfigurationToDraft,
  draftToDefaultConfiguration,
  QuickTrimDrawer,
  SalespersonFormFields,
  TrimLibraryFormFields,
  type BrandDraft,
  type SalespersonDraft,
} from "./master-data-forms";

function useBasicSettingsState() {
  const { currentUser } = usePermissions();
  const [state, setState] = useState<BasicSettingsState>(defaultBasicSettings);
  useEffect(() => { Promise.resolve().then(() => setState(loadBasicSettings())); }, []);
  const persist = (next: BasicSettingsState) => {
    const saved = saveBasicSettings(next);
    const logs = createBasicSettingsOperationLogs(state, saved, { userId: currentUser.id, userName: currentUser.name });
    setState(saved);
    void operationLogRepository.appendMany(logs).catch((error) => {
      if (process.env.NODE_ENV !== "production") console.error("Basic settings audit log failed", error);
    });
  };
  return { state, persist };
}

function useToast() {
  const [toast, setToast] = useState("");
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  return { toast, notify };
}

function MasterDataToolbar({
  query,
  onQuery,
  placeholder = "输入名称查询",
  resultCount,
  moreFilters,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder?: string;
  resultCount: number;
  moreFilters?: ReactNode;
}) {
  return <Toolbar search={<SearchField value={query} onChange={onQuery} placeholder={placeholder} label={placeholder} />} moreFilters={moreFilters} resultSummary={<span>{resultCount} 条结果</span>} />;
}

export function BrandSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("settings.brand.edit");
  const { state, persist } = useBasicSettingsState();
  const { toast, notify } = useToast();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BrandRecord["status"]>("all");
  const { draft, setDraft, openDraft, closeDraft, requestClose, closeConfirmationOpen, keepEditing } = useGuardedDraft<BrandDraft>();
  const [quickTrimDraft, setQuickTrimDraft] = useState<TrimLibraryItem | null>(null);
  const [quickTrimError, setQuickTrimError] = useState("");
  const [error, setError] = useState("");
  const rows = useMemo(() => searchBrands(state.brands, query).filter((brand) => statusFilter === "all" || brand.status === statusFilter), [state.brands, query, statusFilter]);

  const openNew = () => { setError(""); openDraft(createBrandDraft()); };
  const openEdit = (brand: BrandRecord) => { setError(""); openDraft({ id: brand.id, name: brand.name, status: brand.status, defaults: defaultConfigurationToDraft(brand.defaults) }); };
  const save = () => {
    if (!draft || !canManage) return;
    const validationError = validateBrandName(state, draft.name, draft.id);
    if (validationError) { setError(validationError); return; }
    persist(upsertBrand(state, { id: draft.id, name: draft.name.trim(), status: draft.status, defaults: draftToDefaultConfiguration(draft.defaults, draft.id) }));
    closeDraft();
    notify("品牌资料已保存");
  };
  const openQuickTrim = (query: string) => { if (!can("settings.trim.edit")) return; setQuickTrimError(""); setQuickTrimDraft(createTrimLibraryDraft(query)); };
  const saveQuickTrim = () => {
    if (!draft || !quickTrimDraft || !can("settings.trim.edit")) return;
    if (!quickTrimDraft.name.trim()) { setQuickTrimError("请填写辅料名称"); return; }
    if (!quickTrimDraft.unit.trim()) { setQuickTrimError("请填写辅料单位"); return; }
    const item = { ...quickTrimDraft, name: quickTrimDraft.name.trim(), unit: quickTrimDraft.unit.trim() };
    persist(upsertTrimLibraryItem(state, item));
    setDraft({ ...draft, defaults: appendDefaultTrim(draft.defaults, item.id) });
    setQuickTrimDraft(null);
    notify(`辅料“${item.name}”已保存到辅料库并选用`);
  };
  const remove = (brand: BrandRecord) => {
    if (!canManage) return;
    if (!window.confirm(`确定删除品牌“${brand.name}”吗？归属该品牌的客户业务员也会删除。`)) return;
    persist(deleteBrand(state, brand.id));
    notify(`已删除 ${brand.name}`);
  };
  const columns: DataColumn<BrandRecord>[] = [
    { key: "name", header: "品牌名称", width: 180, minWidth: 150, sticky: "left", responsivePriority: "primary", render: (brand) => <strong>{brand.name}</strong> },
    { key: "status", header: "状态", width: 90, responsivePriority: "primary", render: (brand) => <StatusTag tone={brand.status === "active" ? "success" : "neutral"}>{brand.status === "active" ? "启用" : "停用"}</StatusTag> },
    { key: "rate", header: "默认汇率", width: 140, align: "right", render: (brand) => brand.defaults.defaultUsdCnyRate ?? `未覆盖 · 系统 ${state.systemDefaults.usdCnyRate ?? "未设置"}` },
    { key: "trims", header: "默认辅料", width: 100, align: "right", render: (brand) => brand.defaults.defaultTrims.length ? `${brand.defaults.defaultTrims.length} 条` : null },
    { key: "other", header: "默认其他费用", minWidth: 190, render: (brand) => brand.defaults.defaultOtherCost === null ? (state.systemDefaults.defaultOtherCost ? `未覆盖 · 系统 ${state.systemDefaults.defaultOtherCost.name} ¥${state.systemDefaults.defaultOtherCost.amount?.toFixed(2) ?? "—"}` : "未覆盖 · 系统未设置") : <><strong>{brand.defaults.defaultOtherCost.name}</strong><small>¥{brand.defaults.defaultOtherCost.amount?.toFixed(2) ?? "—"} / 件</small></> },
    { key: "salespeople", header: "客户业务员", width: 110, align: "right", render: (brand) => `${state.customerSalespeople.filter((item) => item.brandId === brand.id).length} 人` },
    { key: "actions", header: "操作", width: 132, sticky: "right", responsivePriority: "primary", render: (brand) => <MasterDataActions label={`${brand.name}更多操作`} primary={<PermissionButton permission="settings.brand.edit" variant="tertiary" onClick={() => openEdit(brand)}>编辑</PermissionButton>}><PermissionButton permission="settings.brand.edit" variant="danger" onClick={() => remove(brand)}>删除品牌</PermissionButton></MasterDataActions> },
  ];
  return <AppShell title="品牌设置"><PageContainer>
    <PageHeader eyebrow="BASIC SETTINGS" title="品牌设置" count={`${rows.length} 条`} primaryAction={<PermissionButton permission="settings.brand.edit" onClick={openNew}>＋ 新增品牌</PermissionButton>} />
    <MasterDataToolbar
      query={query}
      onQuery={setQuery}
      resultCount={rows.length}
      placeholder="输入品牌名称查询"
      moreFilters={<FormItem label="状态"><select className="qc-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | BrandRecord["status"])}><option value="all">全部状态</option><option value="active">启用</option><option value="inactive">停用</option></select></FormItem>}
    />
    <Card className="qc-master-list"><DataTable rows={rows} columns={columns} rowKey={(brand) => brand.id} ariaLabel="品牌设置" empty={<EmptyState title="没有匹配的品牌" description={query ? "请调整搜索关键词" : "可从页面右上角新增第一个品牌"} />} renderRecord={(brand) => <div className="qc-master-record"><header><strong>{brand.name}</strong><StatusTag tone={brand.status === "active" ? "success" : "neutral"}>{brand.status === "active" ? "启用" : "停用"}</StatusTag></header><dl><div><dt>默认汇率</dt><dd>{brand.defaults.defaultUsdCnyRate ?? `未覆盖 · 系统 ${state.systemDefaults.usdCnyRate ?? "未设置"}`}</dd></div><div><dt>默认辅料</dt><dd>{brand.defaults.defaultTrims.length ? `${brand.defaults.defaultTrims.length} 条` : "—"}</dd></div><div><dt>客户业务员</dt><dd>{state.customerSalespeople.filter((item) => item.brandId === brand.id).length} 人</dd></div></dl><footer><MasterDataActions label={`${brand.name}更多操作`} primary={<PermissionButton permission="settings.brand.edit" variant="tertiary" onClick={() => openEdit(brand)}>编辑</PermissionButton>}><PermissionButton permission="settings.brand.edit" variant="danger" onClick={() => remove(brand)}>删除品牌</PermissionButton></MasterDataActions></footer></div>} /></Card>
    <Drawer open={Boolean(draft)} className="qc-master-data-long-form-modal qc-master-data-drawer" eyebrow="BASIC SETTINGS" title={state.brands.some((brand) => brand.id === draft?.id) ? "编辑品牌" : "新增品牌"} description="品牌名称在整个系统内唯一；默认辅料从辅料库选择。" onClose={requestClose} onSubmit={save} footer={<><Button variant="secondary" onClick={requestClose}>取消</Button><Button type="submit">保存品牌</Button></>}>
      {draft && <BrandFormFields draft={draft} trimLibrary={state.trimLibrary} onChange={(next) => { setDraft(next); setError(""); }} error={error} canCreateTrim={can("settings.trim.edit")} onCreateTrim={openQuickTrim} />}
    </Drawer>
    <UnsavedDraftDialog open={closeConfirmationOpen} entityLabel="品牌资料" onKeepEditing={keepEditing} onDiscard={closeDraft} />
    <QuickTrimDrawer open={Boolean(quickTrimDraft)} draft={quickTrimDraft} supplierOptions={supplierSuggestions(state)} error={quickTrimError} onChange={(next) => { setQuickTrimDraft(next); setQuickTrimError(""); }} onClose={() => setQuickTrimDraft(null)} onSubmit={saveQuickTrim} />
    <Toast message={toast} />
  </PageContainer></AppShell>;
}

export function CustomerSalespeopleSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("settings.salesperson.edit");
  const { state, persist } = useBasicSettingsState();
  const { toast, notify } = useToast();
  const [query, setQuery] = useState("");
  const { draft, setDraft, openDraft, closeDraft, requestClose, closeConfirmationOpen, keepEditing } = useGuardedDraft<SalespersonDraft>();
  const [quickTrimDraft, setQuickTrimDraft] = useState<TrimLibraryItem | null>(null);
  const [quickTrimError, setQuickTrimError] = useState("");
  const [error, setError] = useState("");
  const rows = useMemo(() => searchCustomerSalespeople(state.customerSalespeople, state.brands, query), [state.customerSalespeople, state.brands, query]);
  const brandNames = useMemo(() => new Map(state.brands.map((brand) => [brand.id, brand.name])), [state.brands]);
  const inheritedDefaults = (item: CustomerSalespersonRecord) => {
    const brand = state.brands.find((candidate) => candidate.id === item.brandId);
    const rate = item.defaults.defaultUsdCnyRate !== null
      ? { value: item.defaults.defaultUsdCnyRate, source: "个人" }
      : brand?.defaults.defaultUsdCnyRate !== null && brand?.defaults.defaultUsdCnyRate !== undefined
        ? { value: brand.defaults.defaultUsdCnyRate, source: `品牌 ${brand.name}` }
        : { value: state.systemDefaults.usdCnyRate, source: "系统" };
    const trims = item.defaults.defaultTrims.length
      ? { count: item.defaults.defaultTrims.length, source: "个人" }
      : { count: brand?.defaults.defaultTrims.length ?? 0, source: brand ? `品牌 ${brand.name}` : "系统" };
    const otherCost = item.defaults.defaultOtherCost
      ? { value: item.defaults.defaultOtherCost, source: "个人" }
      : brand?.defaults.defaultOtherCost
        ? { value: brand.defaults.defaultOtherCost, source: `品牌 ${brand.name}` }
        : { value: state.systemDefaults.defaultOtherCost, source: "系统" };
    return { rate, trims, otherCost };
  };
  const renderRate = (item: CustomerSalespersonRecord) => {
    const resolved = inheritedDefaults(item).rate;
    return <span className="qc-master-identity"><strong>{resolved.value ?? "未设置"}</strong><small>{resolved.source}</small></span>;
  };
  const renderTrims = (item: CustomerSalespersonRecord) => {
    const resolved = inheritedDefaults(item).trims;
    return <span className="qc-master-identity"><strong>{resolved.count} 条</strong><small>{resolved.source}</small></span>;
  };
  const renderOtherCost = (item: CustomerSalespersonRecord) => {
    const resolved = inheritedDefaults(item).otherCost;
    return <span className="qc-master-identity"><strong>{resolved.value?.name ?? "未设置"}</strong><small>{resolved.value ? `¥${resolved.value.amount?.toFixed(2) ?? "—"} / 件 · ${resolved.source}` : resolved.source}</small></span>;
  };

  const openNew = () => { setError(""); openDraft(createSalespersonDraft(state.brands[0]?.id ?? "")); };
  const openEdit = (item: CustomerSalespersonRecord) => { setError(""); openDraft({ id: item.id, name: item.name, brandId: item.brandId, status: item.status, defaults: defaultConfigurationToDraft(item.defaults) }); };
  const save = () => {
    if (!draft || !canManage) return;
    const validationError = validateCustomerSalespersonName(state, draft.name, draft.id);
    if (validationError) { setError(validationError); return; }
    if (!draft.brandId) { setError("请选择归属品牌"); return; }
    persist(upsertCustomerSalesperson(state, { id: draft.id, name: draft.name.trim(), brandId: draft.brandId, status: draft.status, defaults: draftToDefaultConfiguration(draft.defaults, draft.id) }));
    closeDraft();
    notify("客户业务员资料已保存");
  };
  const openQuickTrim = (query: string) => { if (!can("settings.trim.edit")) return; setQuickTrimError(""); setQuickTrimDraft(createTrimLibraryDraft(query)); };
  const saveQuickTrim = () => {
    if (!draft || !quickTrimDraft || !can("settings.trim.edit")) return;
    if (!quickTrimDraft.name.trim()) { setQuickTrimError("请填写辅料名称"); return; }
    if (!quickTrimDraft.unit.trim()) { setQuickTrimError("请填写辅料单位"); return; }
    const item = { ...quickTrimDraft, name: quickTrimDraft.name.trim(), unit: quickTrimDraft.unit.trim() };
    persist(upsertTrimLibraryItem(state, item));
    setDraft({ ...draft, defaults: appendDefaultTrim(draft.defaults, item.id) });
    setQuickTrimDraft(null);
    notify(`辅料“${item.name}”已保存到辅料库并选用`);
  };
  const copy = (item: CustomerSalespersonRecord) => { if (!canManage) return; persist(copyCustomerSalesperson(state, item.id, createMasterDataId("sales-copy"))); notify(`已复制 ${item.name}`); };
  const remove = (item: CustomerSalespersonRecord) => {
    if (!canManage) return;
    if (!window.confirm(`确定删除客户业务员“${item.name}”吗？`)) return;
    persist(deleteCustomerSalesperson(state, item.id));
    notify(`已删除 ${item.name}`);
  };

  return <AppShell title="客户业务员设置"><PageContainer>
    <PageHeader eyebrow="BASIC SETTINGS" title="客户业务员设置" count={`${rows.length} 条`} primaryAction={<PermissionButton permission="settings.salesperson.edit" onClick={openNew}>＋ 新增客户业务员</PermissionButton>} />
    <MasterDataToolbar query={query} onQuery={setQuery} resultCount={rows.length} placeholder="输入姓名或品牌查询" />
    <Card className="qc-master-list"><DataTable rows={rows} columns={[
      { key: "name", header: "客户业务员", width: 170, sticky: "left", responsivePriority: "primary", render: (item: CustomerSalespersonRecord) => <strong>{item.name}</strong> },
      { key: "brand", header: "归属品牌", width: 150, responsivePriority: "primary", render: (item: CustomerSalespersonRecord) => brandNames.get(item.brandId) },
      { key: "status", header: "状态", width: 88, responsivePriority: "primary", render: (item: CustomerSalespersonRecord) => <StatusTag tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "启用" : "停用"}</StatusTag> },
      { key: "rate", header: "默认汇率", width: 135, align: "right", render: renderRate },
      { key: "trims", header: "默认辅料", width: 130, align: "right", render: renderTrims },
      { key: "other", header: "默认其他费用", minWidth: 180, render: renderOtherCost },
      { key: "actions", header: "操作", width: 128, sticky: "right", responsivePriority: "primary", render: (item: CustomerSalespersonRecord) => <MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.salesperson.edit" variant="tertiary" onClick={() => openEdit(item)}>编辑</PermissionButton>}><PermissionButton permission="settings.salesperson.edit" variant="text" onClick={() => copy(item)}>复制资料</PermissionButton><PermissionButton permission="settings.salesperson.edit" variant="danger" onClick={() => remove(item)}>删除业务员</PermissionButton></MasterDataActions> },
    ] satisfies DataColumn<CustomerSalespersonRecord>[]} rowKey={(item) => item.id} ariaLabel="客户业务员设置" emptyTitle="没有匹配的客户业务员" emptyDescription={query ? "请调整搜索关键词" : "可从页面右上角新增第一位客户业务员"} renderRecord={(item) => <div className="qc-master-record"><header><strong>{item.name}</strong><StatusTag tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "启用" : "停用"}</StatusTag></header><dl><div><dt>归属品牌</dt><dd>{brandNames.get(item.brandId) ?? "—"}</dd></div><div><dt>默认汇率</dt><dd>{renderRate(item)}</dd></div><div><dt>默认辅料</dt><dd>{renderTrims(item)}</dd></div></dl><footer><MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.salesperson.edit" variant="tertiary" onClick={() => openEdit(item)}>编辑</PermissionButton>}><PermissionButton permission="settings.salesperson.edit" variant="text" onClick={() => copy(item)}>复制资料</PermissionButton><PermissionButton permission="settings.salesperson.edit" variant="danger" onClick={() => remove(item)}>删除业务员</PermissionButton></MasterDataActions></footer></div>} /></Card>
    <Drawer open={Boolean(draft)} className="qc-master-data-drawer" title={state.customerSalespeople.some((item) => item.id === draft?.id) ? "编辑客户业务员" : "新增客户业务员"} description="姓名在整个系统内唯一；个人默认配置优先于品牌默认配置。" onClose={requestClose} onSubmit={save} footer={<><Button variant="secondary" onClick={requestClose}>取消</Button><Button type="submit">保存客户业务员</Button></>}>
      {draft && <SalespersonFormFields draft={draft} brands={state.brands} trimLibrary={state.trimLibrary} onChange={(next) => { setDraft(next); setError(""); }} error={error} canCreateTrim={can("settings.trim.edit")} onCreateTrim={openQuickTrim} />}
    </Drawer>
    <UnsavedDraftDialog open={closeConfirmationOpen} entityLabel="客户业务员资料" onKeepEditing={keepEditing} onDiscard={closeDraft} />
    <QuickTrimDrawer open={Boolean(quickTrimDraft)} draft={quickTrimDraft} supplierOptions={supplierSuggestions(state)} error={quickTrimError} onChange={(next) => { setQuickTrimDraft(next); setQuickTrimError(""); }} onClose={() => setQuickTrimDraft(null)} onSubmit={saveQuickTrim} />
    <Toast message={toast} />
  </PageContainer></AppShell>;
}

const emptyFabric = (): FabricLibraryItem => { const now = new Date().toISOString(); return { id: createMasterDataId("fabric"), name: "", composition: "", netWidthCm: null, gsm: null, defaultLossRate: null, supplier: "", unitPrice: null, purchaseUnit: "kg", createdAt: now, updatedAt: now }; };

export function FabricLibraryPage() {
  const { can } = usePermissions();
  const canManage = can("settings.fabric.edit");
  const { state, persist } = useBasicSettingsState();
  const { toast, notify } = useToast();
  const [query, setQuery] = useState("");
  const { draft, setDraft, openDraft, closeDraft, requestClose, closeConfirmationOpen, keepEditing } = useGuardedDraft<FabricLibraryItem>();
  const [error, setError] = useState("");
  const rows = useMemo(() => searchFabricLibrary(state.fabricLibrary, query), [state.fabricLibrary, query]);
  const suppliers = useMemo(() => supplierSuggestions(state), [state]);
  const save = () => {
    if (!canManage) return;
    if (!draft?.name.trim()) { setError("请填写面料名称"); return; }
    persist(upsertFabricLibraryItem(state, { ...draft, name: draft.name.trim() }));
    closeDraft();
    notify("面料资料已保存");
  };
  const remove = (item: FabricLibraryItem) => {
    if (!canManage) return;
    if (!window.confirm(`确定删除面料“${item.name}”吗？历史报价快照不会受影响。`)) return;
    persist(deleteFabricLibraryItem(state, item.id));
    notify(`已删除 ${item.name}`);
  };
  return <AppShell title="面料库"><PageContainer>
    <PageHeader eyebrow="MATERIAL LIBRARY" title="面料库" count={`${rows.length} 条`} description="同名面料可由不同供应商提供；系统使用稳定 ID 区分。段长、单耗和成本不会存入库。" primaryAction={<PermissionButton permission="settings.fabric.edit" onClick={() => { setError(""); openDraft(emptyFabric()); }}>＋ 新增面料</PermissionButton>} />
    <MasterDataToolbar query={query} onQuery={setQuery} resultCount={rows.length} placeholder="搜索名称、成分或供应商" />
    <Card className="qc-master-list"><DataTable rows={rows} columns={[
      { key: "name", header: "面料名称", width: 190, sticky: "left", responsivePriority: "primary", render: (item: FabricLibraryItem) => <span className="qc-master-identity"><strong>{item.name}</strong><small>{item.id}</small></span> },
      { key: "composition", header: "成分", minWidth: 150, responsivePriority: "primary", render: (item: FabricLibraryItem) => item.composition },
      { key: "width", header: "净门幅 (cm)", width: 105, align: "right", responsivePriority: "primary", render: (item: FabricLibraryItem) => item.netWidthCm },
      { key: "gsm", header: "克重 (gsm)", width: 100, align: "right", responsivePriority: "primary", render: (item: FabricLibraryItem) => item.gsm },
      { key: "loss", header: "默认损耗 (%)", width: 112, align: "right", render: (item: FabricLibraryItem) => item.defaultLossRate },
      { key: "supplier", header: "供应商", minWidth: 140, responsivePriority: "primary", render: (item: FabricLibraryItem) => item.supplier },
      { key: "price", header: "单价 (RMB)", width: 112, align: "right", responsivePriority: "primary", render: (item: FabricLibraryItem) => item.unitPrice === null ? null : item.unitPrice.toFixed(2) },
      { key: "unit", header: "采购单位", width: 94, render: (item: FabricLibraryItem) => item.purchaseUnit === "kg" ? "千克" : "米" },
      { key: "actions", header: "操作", width: 128, sticky: "right", responsivePriority: "primary", render: (item: FabricLibraryItem) => <MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.fabric.edit" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="settings.fabric.edit" variant="danger" onClick={() => remove(item)}>删除面料</PermissionButton></MasterDataActions> },
    ] satisfies DataColumn<FabricLibraryItem>[]} rowKey={(item) => item.id} ariaLabel="面料库" emptyTitle="没有匹配的面料" emptyDescription={query ? "请调整搜索关键词" : "可从页面右上角新增第一条面料"} renderRecord={(item) => <div className="qc-master-record"><header><span className="qc-master-identity"><strong>{item.name}</strong><small>{item.composition || "未填写成分"}</small></span></header><dl><div><dt>规格</dt><dd>{item.netWidthCm ?? "—"} cm · {item.gsm ?? "—"} gsm</dd></div><div><dt>供应商</dt><dd>{item.supplier || "—"}</dd></div><div><dt>单价</dt><dd>{item.unitPrice === null ? "—" : `¥${item.unitPrice.toFixed(2)} / ${item.purchaseUnit === "kg" ? "kg" : "m"}`}</dd></div></dl><footer><MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.fabric.edit" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="settings.fabric.edit" variant="danger" onClick={() => remove(item)}>删除面料</PermissionButton></MasterDataActions></footer></div>} /></Card>
    <Drawer open={Boolean(draft)} className="qc-master-data-drawer" title={state.fabricLibrary.some((item) => item.id === draft?.id) ? "编辑面料" : "新增面料"} description="这里只保存静态基础资料；报价引用后形成独立快照。" onClose={requestClose} onSubmit={save} footer={<><Button variant="secondary" onClick={requestClose}>取消</Button><Button type="submit">保存面料</Button></>}>
      {draft && <div className="qc-modal-form qc-material-form"><FormItem label="面料名称" required><input className="qc-control" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(""); }} /></FormItem><FormItem label="成分"><input className="qc-control" value={draft.composition} onChange={(event) => setDraft({ ...draft, composition: event.target.value })} placeholder="例如：100% Cotton" /></FormItem><FormItem label="净门幅 cm"><NullableNumberInput className="qc-control" min="0" value={draft.netWidthCm} onValueChange={(netWidthCm) => setDraft({ ...draft, netWidthCm })} /></FormItem><FormItem label="克重 gsm"><NullableNumberInput className="qc-control" min="0" value={draft.gsm} onValueChange={(gsm) => setDraft({ ...draft, gsm })} /></FormItem><FormItem label="默认损耗率 %"><NullableNumberInput className="qc-control" min="0" value={draft.defaultLossRate} onValueChange={(defaultLossRate) => setDraft({ ...draft, defaultLossRate })} /></FormItem><FormItem label="供应商"><CreatableCombobox ariaLabel="面料供应商" value={draft.supplier} suggestions={suppliers} onChange={(supplier) => setDraft({ ...draft, supplier })} /></FormItem><FormItem label="单价"><NullableNumberInput className="qc-control" min="0" value={draft.unitPrice} onValueChange={(unitPrice) => setDraft({ ...draft, unitPrice })} /></FormItem><FormItem label="采购单位" required><select className="qc-control" value={draft.purchaseUnit} onChange={(event) => setDraft({ ...draft, purchaseUnit: event.target.value === "meter" ? "meter" : "kg" })}><option value="kg">千克</option><option value="meter">米</option></select></FormItem>{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Drawer><UnsavedDraftDialog open={closeConfirmationOpen} entityLabel="面料资料" onKeepEditing={keepEditing} onDiscard={closeDraft} /><Toast message={toast} />
  </PageContainer></AppShell>;
}

export function TrimLibraryPage() {
  const { can } = usePermissions();
  const canManage = can("settings.trim.edit");
  const { state, persist } = useBasicSettingsState();
  const { toast, notify } = useToast();
  const [query, setQuery] = useState("");
  const { draft, setDraft, openDraft, closeDraft, requestClose, closeConfirmationOpen, keepEditing } = useGuardedDraft<TrimLibraryItem>();
  const [error, setError] = useState("");
  const rows = useMemo(() => searchTrimLibrary(state.trimLibrary, query), [state.trimLibrary, query]);
  const suppliers = useMemo(() => supplierSuggestions(state), [state]);
  const save = () => {
    if (!canManage) return;
    if (!draft?.name.trim()) { setError("请填写辅料名称"); return; }
    persist(upsertTrimLibraryItem(state, { ...draft, name: draft.name.trim() }));
    closeDraft();
    notify("辅料资料已保存");
  };
  const remove = (item: TrimLibraryItem) => {
    if (!canManage) return;
    if (!window.confirm(`确定删除辅料“${item.name}”吗？默认配置中的引用会同步移除。`)) return;
    persist(deleteTrimLibraryItem(state, item.id));
    notify(`已删除 ${item.name}`);
  };
  return <AppShell title="辅料库"><PageContainer>
    <PageHeader eyebrow="MATERIAL LIBRARY" title="辅料库" count={`${rows.length} 条`} description="同名辅料可由不同供应商提供；系统使用稳定 ID 区分。报价用量始终由具体报价填写。" primaryAction={<PermissionButton permission="settings.trim.edit" onClick={() => { setError(""); openDraft(createTrimLibraryDraft()); }}>＋ 新增辅料</PermissionButton>} />
    <MasterDataToolbar query={query} onQuery={setQuery} resultCount={rows.length} placeholder="搜索名称、规格或供应商" />
    <Card className="qc-master-list"><DataTable rows={rows} columns={[
      { key: "name", header: "辅料名称", width: 190, sticky: "left", responsivePriority: "primary", render: (item: TrimLibraryItem) => <span className="qc-master-identity"><strong>{item.name}</strong><small>{item.id}</small></span> },
      { key: "spec", header: "规格", minWidth: 150, responsivePriority: "primary", render: (item: TrimLibraryItem) => item.specification },
      { key: "supplier", header: "供应商", minWidth: 140, responsivePriority: "primary", render: (item: TrimLibraryItem) => item.supplier },
      { key: "unit", header: "单位", width: 90, render: (item: TrimLibraryItem) => item.unit },
      { key: "loss", header: "默认损耗 (%)", width: 112, align: "right", render: (item: TrimLibraryItem) => item.defaultLossRate },
      { key: "price", header: "单价 (RMB)", width: 112, align: "right", responsivePriority: "primary", render: (item: TrimLibraryItem) => item.unitPrice === null ? null : item.unitPrice.toFixed(2) },
      { key: "actions", header: "操作", width: 128, sticky: "right", responsivePriority: "primary", render: (item: TrimLibraryItem) => <MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.trim.edit" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="settings.trim.edit" variant="danger" onClick={() => remove(item)}>删除辅料</PermissionButton></MasterDataActions> },
    ] satisfies DataColumn<TrimLibraryItem>[]} rowKey={(item) => item.id} ariaLabel="辅料库" emptyTitle="没有匹配的辅料" emptyDescription={query ? "请调整搜索关键词" : "可从页面右上角新增第一条辅料"} renderRecord={(item) => <div className="qc-master-record"><header><span className="qc-master-identity"><strong>{item.name}</strong><small>{item.specification || "未填写规格"}</small></span></header><dl><div><dt>供应商</dt><dd>{item.supplier || "—"}</dd></div><div><dt>单位</dt><dd>{item.unit || "—"}</dd></div><div><dt>单价</dt><dd>{item.unitPrice === null ? "—" : `¥${item.unitPrice.toFixed(2)}`}</dd></div></dl><footer><MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.trim.edit" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="settings.trim.edit" variant="danger" onClick={() => remove(item)}>删除辅料</PermissionButton></MasterDataActions></footer></div>} /></Card>
    <Drawer open={Boolean(draft)} className="qc-master-data-drawer" title={state.trimLibrary.some((item) => item.id === draft?.id) ? "编辑辅料" : "新增辅料"} description="报价引用后形成独立快照；基础库不保存本次报价用量。" onClose={requestClose} onSubmit={save} footer={<><Button variant="secondary" onClick={requestClose}>取消</Button><Button type="submit">保存辅料</Button></>}>
      {draft && <TrimLibraryFormFields draft={draft} supplierOptions={suppliers} onChange={(next) => { setDraft(next); setError(""); }} error={error} />}
    </Drawer><UnsavedDraftDialog open={closeConfirmationOpen} entityLabel="辅料资料" onKeepEditing={keepEditing} onDiscard={closeDraft} /><Toast message={toast} />
  </PageContainer></AppShell>;
}

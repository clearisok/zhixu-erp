"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AppShell,
  Button,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  FormItem,
  FormSection,
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
import { createOperationsSettingsOperationLogs, operationLogRepository } from "@/features/operation-logs";
import { PermissionButton, usePermissions } from "@/features/permissions";
import {
  createOperationsMasterDataId,
  defaultOperationsSettings,
  deleteMonthlyProductionTarget,
  saveDefaultProcessingCurrency,
  saveClosingTaxRate,
  upsertMonthlyProductionTarget,
  upsertOutsourceFactory,
  upsertProductionGroup,
  upsertProductionCalendar,
  upsertProductionSite,
  upsertSupplyHub,
  upsertTransportPlan,
  type MonthlyProductionTarget,
  type OperationsSettingsState,
  type OutsourceFactory,
  type ProductionGroup,
  type ProductionCalendar,
  type ProductionSite,
  type SupplyHub,
  type SupplyRoute,
  type TransportMode,
} from "../model/operations-settings";
import { operationsSettingsRepository } from "../repository/operations-settings-repository";
import { productionGroupsForMasterData } from "../model/master-data-presentation";

function useOperationsSettings() {
  const { currentUser } = usePermissions();
  const [state, setState] = useState<OperationsSettingsState>(defaultOperationsSettings);
  useEffect(() => { Promise.resolve().then(() => setState(operationsSettingsRepository.load())); }, []);
  const persist = (next: OperationsSettingsState) => {
    const saved = operationsSettingsRepository.save(next);
    const logs = createOperationsSettingsOperationLogs(state, saved, { userId: currentUser.id, userName: currentUser.name });
    setState(saved);
    void operationLogRepository.appendMany(logs).catch((error) => {
      if (process.env.NODE_ENV !== "production") console.error("Operations settings audit log failed", error);
    });
    return saved;
  };
  return { state, persist };
}

function useToast() {
  const [message, setMessage] = useState("");
  const notify = (next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(""), 2400);
  };
  return { message, notify };
}

function MasterToolbar({ query, setQuery, resultCount }: {
  query: string;
  setQuery: (value: string) => void;
  resultCount: number;
}) {
  return <Toolbar search={<SearchField value={query} onChange={setQuery} placeholder="输入名称、简称、联系人或备注查询" label="搜索基础资料" />} resultSummary={<span>{resultCount} 条结果</span>} />;
}

const now = () => new Date().toISOString();

export function ProductionGroupSettingsPage() {
  const { can } = usePermissions();
  const { state, persist } = useOperationsSettings();
  const { message, notify } = useToast();
  const [query, setQuery] = useState("");
  const { draft, setDraft, openDraft, closeDraft, requestClose, closeConfirmationOpen, keepEditing } = useGuardedDraft<ProductionGroup>();
  const [error, setError] = useState("");
  const rows = useMemo(() => productionGroupsForMasterData(state.productionGroups, query), [query, state.productionGroups]);
  const openNew = () => {
    const timestamp = now();
    setError("");
    openDraft({ id: createOperationsMasterDataId("production-group"), name: "", shortName: "", productionSiteId: state.productionSites.find((item) => item.enabled)?.id ?? state.productionSites[0]?.id ?? "", enabled: true, sortOrder: (Math.max(0, ...state.productionGroups.map((item) => item.sortOrder)) + 10), remark: "", createdAt: timestamp, updatedAt: timestamp });
  };
  const save = () => {
    if (!can("settings.production_group.edit")) return;
    if (!draft?.name.trim()) { setError("请填写生产组名称。"); return; }
    persist(upsertProductionGroup(state, draft));
    closeDraft();
    notify("生产组已保存");
  };
  const toggle = (item: ProductionGroup) => {
    if (!can("settings.production_group.edit")) return;
    persist(upsertProductionGroup(state, { ...item, enabled: !item.enabled }));
    notify(item.enabled ? "生产组已停用" : "生产组已启用");
  };
  const columns: DataColumn<ProductionGroup>[] = [
    { key: "name", header: "生产组", width: 180, sticky: "left", responsivePriority: "primary", render: (item) => <span className="qc-master-identity"><strong>{item.name}</strong><small>{item.id}</small></span> },
    { key: "shortName", header: "简称", width: 100, render: (item) => item.shortName },
    { key: "site", header: "生产地点", minWidth: 150, responsivePriority: "primary", render: (item) => state.productionSites.find((site) => site.id === item.productionSiteId)?.name ?? "历史地点" },
    { key: "status", header: "状态", width: 88, responsivePriority: "primary", render: (item) => <StatusTag tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "启用" : "停用"}</StatusTag> },
    { key: "sort", header: "排序", width: 80, align: "right", render: (item) => item.sortOrder },
    { key: "remark", header: "备注", minWidth: 180, render: (item) => <span className="qc-master-note" title={item.remark}>{item.remark}</span> },
    { key: "actions", header: "操作", width: 128, sticky: "right", responsivePriority: "primary", render: (item) => <MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.production_group.edit" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="settings.production_group.edit" variant={item.enabled ? "danger" : "text"} onClick={() => toggle(item)}>{item.enabled ? "停用生产组" : "启用生产组"}</PermissionButton></MasterDataActions> },
  ];
  return <AppShell title="生产组"><PageContainer>
    <PageHeader eyebrow="PRODUCTION MASTER DATA" title="生产组" count={`${rows.length} 条`} description="维护内部生产组基础资料；稳定 ID 不随名称修改而变化。" primaryAction={<PermissionButton permission="settings.production_group.edit" onClick={openNew}>＋ 新增生产组</PermissionButton>} />
    <MasterToolbar query={query} setQuery={setQuery} resultCount={rows.length} />
    <Card className="qc-master-list"><DataTable rows={rows} columns={columns} rowKey={(item) => item.id} ariaLabel="生产组" empty={<EmptyState title="没有匹配的生产组" description={query ? "请调整搜索关键词" : "可从页面右上角新增第一个生产组"} />} renderRecord={(item) => <div className="qc-master-record"><header><span className="qc-master-identity"><strong>{item.name}</strong><small>{item.shortName || "未填写简称"}</small></span><StatusTag tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "启用" : "停用"}</StatusTag></header><dl><div><dt>生产地点</dt><dd>{state.productionSites.find((site) => site.id === item.productionSiteId)?.name ?? "历史地点"}</dd></div><div><dt>排序</dt><dd>{item.sortOrder}</dd></div><div><dt>备注</dt><dd>{item.remark || "—"}</dd></div></dl><footer><MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.production_group.edit" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="settings.production_group.edit" variant={item.enabled ? "danger" : "text"} onClick={() => toggle(item)}>{item.enabled ? "停用生产组" : "启用生产组"}</PermissionButton></MasterDataActions></footer></div>} /></Card>
    <Drawer open={Boolean(draft)} className="qc-master-data-drawer" title={state.productionGroups.some((item) => item.id === draft?.id) ? "编辑生产组" : "新增生产组"} description="生产组可停用但不会因停用而丢失稳定 ID；名称允许使用非数字文本。" onClose={requestClose} onSubmit={save} footer={<><Button variant="secondary" onClick={requestClose}>取消</Button><Button type="submit" permission="settings.production_group.edit">保存生产组</Button></>}>
      {draft && <div className="qc-modal-form"><FormItem label="名称" required><input className="qc-control" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(""); }} /></FormItem><FormItem label="简称"><input className="qc-control" value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} /></FormItem><FormItem label="生产地点" required><select className="qc-control" value={draft.productionSiteId} onChange={(event) => setDraft({ ...draft, productionSiteId: event.target.value })}>{state.productionSites.filter((item) => item.enabled || item.id === draft.productionSiteId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem><FormItem label="排序"><NullableNumberInput className="qc-control" value={draft.sortOrder} onValueChange={(sortOrder) => setDraft({ ...draft, sortOrder: sortOrder ?? 0 })} /></FormItem><FormItem label="备注"><textarea className="qc-control" rows={3} value={draft.remark} onChange={(event) => setDraft({ ...draft, remark: event.target.value })} /></FormItem>{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Drawer><UnsavedDraftDialog open={closeConfirmationOpen} entityLabel="生产组资料" onKeepEditing={keepEditing} onDiscard={closeDraft} /><Toast message={message} />
  </PageContainer></AppShell>;
}

export function OutsourceFactorySettingsPage() {
  const { can } = usePermissions();
  const { state, persist } = useOperationsSettings();
  const { message, notify } = useToast();
  const [query, setQuery] = useState("");
  const { draft, setDraft, openDraft, closeDraft, requestClose, closeConfirmationOpen, keepEditing } = useGuardedDraft<OutsourceFactory>();
  const [error, setError] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return state.outsourceFactories.filter((item) => !needle || [item.name, item.shortName, item.contactPerson, item.phone, item.remark].some((value) => value.toLocaleLowerCase().includes(needle)));
  }, [query, state.outsourceFactories]);
  const openNew = () => {
    const timestamp = now();
    setError("");
    openDraft({ id: createOperationsMasterDataId("outsource-factory"), name: "", shortName: "", enabled: true, contactPerson: "", phone: "", remark: "", createdAt: timestamp, updatedAt: timestamp });
  };
  const save = () => {
    if (!can("settings.outsource_factory.edit")) return;
    if (!draft?.name.trim()) { setError("请填写外发厂名称。"); return; }
    persist(upsertOutsourceFactory(state, draft));
    closeDraft();
    notify("外发厂已保存");
  };
  const toggle = (item: OutsourceFactory) => {
    if (!can("settings.outsource_factory.edit")) return;
    persist(upsertOutsourceFactory(state, { ...item, enabled: !item.enabled }));
    notify(item.enabled ? "外发厂已停用" : "外发厂已启用");
  };
  const columns: DataColumn<OutsourceFactory>[] = [
    { key: "name", header: "外发厂", width: 190, sticky: "left", responsivePriority: "primary", render: (item) => <span className="qc-master-identity"><strong>{item.name}</strong><small>{item.id}</small></span> },
    { key: "shortName", header: "简称", width: 100, render: (item) => item.shortName },
    { key: "status", header: "状态", width: 88, responsivePriority: "primary", render: (item) => <StatusTag tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "启用" : "停用"}</StatusTag> },
    { key: "contact", header: "联系人", width: 120, responsivePriority: "primary", render: (item) => item.contactPerson },
    { key: "phone", header: "联系电话", width: 140, responsivePriority: "primary", render: (item) => item.phone },
    { key: "remark", header: "备注", minWidth: 190, render: (item) => <span className="qc-master-note" title={item.remark}>{item.remark}</span> },
    { key: "actions", header: "操作", width: 128, sticky: "right", responsivePriority: "primary", render: (item) => <MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.outsource_factory.edit" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="settings.outsource_factory.edit" variant={item.enabled ? "danger" : "text"} onClick={() => toggle(item)}>{item.enabled ? "停用外发厂" : "启用外发厂"}</PermissionButton></MasterDataActions> },
  ];
  return <AppShell title="外发厂"><PageContainer>
    <PageHeader eyebrow="PRODUCTION MASTER DATA" title="外发厂" count={`${rows.length} 条`} description="维护外发加工厂资料；供应关系暂不扩展为独立业务模块。" primaryAction={<PermissionButton permission="settings.outsource_factory.edit" onClick={openNew}>＋ 新增外发厂</PermissionButton>} />
    <MasterToolbar query={query} setQuery={setQuery} resultCount={rows.length} />
    <Card className="qc-master-list"><DataTable rows={rows} columns={columns} rowKey={(item) => item.id} ariaLabel="外发厂" emptyTitle="没有匹配的外发厂" emptyDescription={query ? "请调整搜索关键词" : "可从页面右上角新增第一家外发厂"} renderRecord={(item) => <div className="qc-master-record"><header><span className="qc-master-identity"><strong>{item.name}</strong><small>{item.shortName || "未填写简称"}</small></span><StatusTag tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "启用" : "停用"}</StatusTag></header><dl><div><dt>联系人</dt><dd>{item.contactPerson || "—"}</dd></div><div><dt>联系电话</dt><dd>{item.phone || "—"}</dd></div><div><dt>备注</dt><dd>{item.remark || "—"}</dd></div></dl><footer><MasterDataActions label={`${item.name}更多操作`} primary={<PermissionButton permission="settings.outsource_factory.edit" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="settings.outsource_factory.edit" variant={item.enabled ? "danger" : "text"} onClick={() => toggle(item)}>{item.enabled ? "停用外发厂" : "启用外发厂"}</PermissionButton></MasterDataActions></footer></div>} /></Card>
    <Drawer open={Boolean(draft)} className="qc-master-data-drawer" title={state.outsourceFactories.some((item) => item.id === draft?.id) ? "编辑外发厂" : "新增外发厂"} description="停用后资料仍保留，以便订单、排单和关账历史继续引用。" onClose={requestClose} onSubmit={save} footer={<><Button variant="secondary" onClick={requestClose}>取消</Button><Button type="submit" permission="settings.outsource_factory.edit">保存外发厂</Button></>}>
      {draft && <div className="qc-modal-form"><FormItem label="名称" required><input className="qc-control" value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(""); }} /></FormItem><FormItem label="简称"><input className="qc-control" value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} /></FormItem><FormItem label="联系人"><input className="qc-control" value={draft.contactPerson} onChange={(event) => setDraft({ ...draft, contactPerson: event.target.value })} /></FormItem><FormItem label="联系电话"><input className="qc-control" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></FormItem><FormItem label="备注"><textarea className="qc-control" rows={3} value={draft.remark} onChange={(event) => setDraft({ ...draft, remark: event.target.value })} /></FormItem>{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Drawer><UnsavedDraftDialog open={closeConfirmationOpen} entityLabel="外发厂资料" onKeepEditing={keepEditing} onDiscard={closeDraft} /><Toast message={message} />
  </PageContainer></AppShell>;
}

export function ClosingSettingsPage() {
  const { can } = usePermissions();
  const { state, persist } = useOperationsSettings();
  const { message, notify } = useToast();
  const [taxRateDraft, setTaxRateDraft] = useState<number | null | undefined>(undefined);
  const [currencyDraft, setCurrencyDraft] = useState<"CNY" | "USD" | undefined>(undefined);
  const { draft, setDraft, openDraft, closeDraft, requestClose, closeConfirmationOpen, keepEditing } = useGuardedDraft<MonthlyProductionTarget>();
  const [error, setError] = useState("");
  const taxRate = taxRateDraft === undefined ? state.closingSettings.defaultSalesTaxRatePercent : taxRateDraft;
  const taxDirty = taxRateDraft !== undefined && taxRateDraft !== state.closingSettings.defaultSalesTaxRatePercent;
  const processingCurrency = currencyDraft ?? state.defaultProcessingCurrency;
  const currencyDirty = currencyDraft !== undefined && currencyDraft !== state.defaultProcessingCurrency;
  const openNew = () => {
    const timestamp = now();
    setError("");
    openDraft({ id: createOperationsMasterDataId("monthly-target"), month: new Date().toISOString().slice(0, 7), totalProcessingOutputTargetRmb: null, internalProcessingOutputTargetRmb: null, remark: "", createdAt: timestamp, updatedAt: timestamp });
  };
  const saveTax = () => {
    if (!can("settings.closing.edit")) return;
    if (taxRate === null || taxRate < 0) return;
    persist(saveClosingTaxRate(state, taxRate));
    setTaxRateDraft(undefined);
    notify("关账默认税率已保存");
  };
  const saveCurrency = () => {
    if (!can("settings.closing.edit")) return;
    persist(saveDefaultProcessingCurrency(state, processingCurrency));
    setCurrencyDraft(undefined);
    notify("新订单默认加工币种已保存");
  };
  const saveTarget = () => {
    if (!can("closing.target.manage")) return;
    if (!draft || !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.month)) { setError("请选择有效月份。"); return; }
    const duplicate = state.closingSettings.monthlyProductionTargets.some((item) => item.month === draft.month && item.id !== draft.id);
    if (duplicate) { setError("该月份已经配置产值目标。"); return; }
    persist(upsertMonthlyProductionTarget(state, draft));
    closeDraft();
    notify("月度产值目标已保存");
  };
  const removeTarget = (item: MonthlyProductionTarget) => {
    if (!can("closing.target.manage")) return;
    if (!window.confirm(`确认删除 ${item.month} 的产值目标？`)) return;
    persist(deleteMonthlyProductionTarget(state, item.id));
    notify("月度产值目标已删除");
  };
  const targetRows = state.closingSettings.monthlyProductionTargets;
  const targetColumns: DataColumn<MonthlyProductionTarget>[] = [
    { key: "month", header: "月份", width: 150, sticky: "left", responsivePriority: "primary", render: (item) => <span className="qc-master-identity"><strong>{item.month}</strong><small>{item.id}</small></span> },
    { key: "total", header: "总加工产值目标 (RMB)", width: 190, align: "right", responsivePriority: "primary", render: (item) => item.totalProcessingOutputTargetRmb === null ? null : item.totalProcessingOutputTargetRmb.toLocaleString("zh-CN") },
    { key: "internal", header: "内部加工产值目标 (RMB)", width: 205, align: "right", responsivePriority: "primary", render: (item) => item.internalProcessingOutputTargetRmb === null ? null : item.internalProcessingOutputTargetRmb.toLocaleString("zh-CN") },
    { key: "remark", header: "备注", minWidth: 180, render: (item) => <span className="qc-master-note" title={item.remark}>{item.remark}</span> },
    { key: "actions", header: "操作", width: 128, sticky: "right", responsivePriority: "primary", render: (item) => <MasterDataActions label={`${item.month}更多操作`} primary={<PermissionButton permission="closing.target.manage" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="closing.target.manage" variant="danger" onClick={() => removeTarget(item)}>删除目标</PermissionButton></MasterDataActions> },
  ];
  return <AppShell title="关账设置"><PageContainer>
    <PageHeader eyebrow="CLOSING SETTINGS" title="关账设置" count={`${targetRows.length} 个月`} description="维护新关账月份使用的默认规则与月度产值目标；已有关账归属继续使用自己的快照。" primaryAction={<PermissionButton permission="closing.target.manage" onClick={openNew}>＋ 新增月度目标</PermissionButton>} />
    <FormSection title="订单与关账默认值" description="只作为新建订单、新价格调整和新关账记录的默认来源；既有价格与关账快照不会重算。" columns={2} actions={<><PermissionButton permission="settings.closing.edit" variant="secondary" onClick={saveCurrency} disabled={!currencyDirty}>{currencyDirty ? "保存默认币种" : "币种已保存"}</PermissionButton><PermissionButton permission="settings.closing.edit" onClick={saveTax} disabled={taxRate === null || !taxDirty}>{taxDirty ? "保存默认税率" : "税率已保存"}</PermissionButton></>}><div className="qc-operations-tax-field"><FormItem label="新订单默认加工币种" required><select className="qc-control" value={processingCurrency} onChange={(event) => setCurrencyDraft(event.target.value as "CNY" | "USD")}><option value="USD">USD</option><option value="CNY">CNY</option></select></FormItem><small>当前正式默认值：{state.defaultProcessingCurrency}</small></div><div className="qc-operations-tax-field"><FormItem label="默认税率 %" required><NullableNumberInput className="qc-control" min="0" value={taxRate} onValueChange={setTaxRateDraft} /></FormItem><small>当前正式默认值：{state.closingSettings.defaultSalesTaxRatePercent}%</small></div></FormSection>
    <Card className="qc-master-list"><div className="qc-operations-list-header"><div><strong>月度生产目标</strong><small>金额口径统一为人民币；空值保持为空，不显示为 0。</small></div></div><DataTable rows={targetRows} columns={targetColumns} rowKey={(item) => item.id} ariaLabel="月度生产目标" empty={<EmptyState title="尚未配置月度产值目标" description="可从页面右上角新增目标" />} renderRecord={(item) => <div className="qc-master-record"><header><strong>{item.month}</strong></header><dl><div><dt>总加工目标</dt><dd>{item.totalProcessingOutputTargetRmb === null ? "—" : `¥${item.totalProcessingOutputTargetRmb.toLocaleString("zh-CN")}`}</dd></div><div><dt>内部加工目标</dt><dd>{item.internalProcessingOutputTargetRmb === null ? "—" : `¥${item.internalProcessingOutputTargetRmb.toLocaleString("zh-CN")}`}</dd></div><div><dt>备注</dt><dd>{item.remark || "—"}</dd></div></dl><footer><MasterDataActions label={`${item.month}更多操作`} primary={<PermissionButton permission="closing.target.manage" variant="tertiary" onClick={() => { setError(""); openDraft(item); }}>编辑</PermissionButton>}><PermissionButton permission="closing.target.manage" variant="danger" onClick={() => removeTarget(item)}>删除目标</PermissionButton></MasterDataActions></footer></div>} /></Card>
    <Drawer open={Boolean(draft)} className="qc-master-data-drawer" title={state.closingSettings.monthlyProductionTargets.some((item) => item.id === draft?.id) ? "编辑月度产值目标" : "新增月度产值目标"} description="每个月仅保留一条目标记录；金额单位为人民币。" onClose={requestClose} onSubmit={saveTarget} footer={<><Button variant="secondary" onClick={requestClose}>取消</Button><Button type="submit" permission="closing.target.manage">保存目标</Button></>}>
      {draft && <div className="qc-modal-form"><FormItem label="月份" required><input className="qc-control" type="month" value={draft.month} onChange={(event) => { setDraft({ ...draft, month: event.target.value }); setError(""); }} /></FormItem><FormItem label="总加工产值目标（RMB）"><NullableNumberInput className="qc-control" min="0" value={draft.totalProcessingOutputTargetRmb} onValueChange={(value) => setDraft({ ...draft, totalProcessingOutputTargetRmb: value })} /></FormItem><FormItem label="内部加工产值目标（RMB）"><NullableNumberInput className="qc-control" min="0" value={draft.internalProcessingOutputTargetRmb} onValueChange={(value) => setDraft({ ...draft, internalProcessingOutputTargetRmb: value })} /></FormItem><FormItem label="备注"><textarea className="qc-control" rows={3} value={draft.remark} onChange={(event) => setDraft({ ...draft, remark: event.target.value })} /></FormItem>{error && <p className="qc-form-alert">{error}</p>}</div>}
    </Drawer><UnsavedDraftDialog open={closeConfirmationOpen} entityLabel="月度产值目标" onKeepEditing={keepEditing} onDiscard={closeDraft} /><Toast message={message} />
  </PageContainer></AppShell>;
}

type InfrastructureDraft =
  | { kind: "calendar"; value: ProductionCalendar }
  | { kind: "site"; value: ProductionSite }
  | { kind: "hub"; value: SupplyHub }
  | { kind: "transport-plan"; route: SupplyRoute; modes: TransportMode[] };

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

function weekdaySummary(days: number[]) {
  const ordered = [...new Set(days)].sort((left, right) => left - right);
  if (ordered.join(",") === "1,2,3,4,5") return "周一至周五";
  if (ordered.join(",") === "1,2,3,4,5,6") return "周一至周六";
  if (ordered.length === 7) return "每天";
  return ordered.map((day) => weekdayLabels[day]).join("、") || "未设置";
}

function infrastructureDraftTitle(draft: InfrastructureDraft | null) {
  if (!draft) return "生产与运输设置";
  if (draft.kind === "site") return "生产地点";
  if (draft.kind === "calendar") return "工作日历";
  if (draft.kind === "hub") return "集货仓";
  return "运输方案";
}

export function ProductionInfrastructureSettingsPage() {
  const { can } = usePermissions();
  const { state, persist } = useOperationsSettings();
  const { message, notify } = useToast();
  const [draft, setDraft] = useState<InfrastructureDraft | null>(null);
  const [error, setError] = useState("");
  const timestamp = now();
  const canEdit = can("settings.production_infrastructure.edit");
  const enabledModesFor = (routeId: string) => state.transportModes.filter((item) => item.routeId === routeId && item.enabled).sort((left, right) => left.sortOrder - right.sortOrder);
  const calendarFor = (site: ProductionSite) => state.productionCalendars.find((item) => item.id === site.productionCalendarId);
  const groupCountFor = (siteId: string) => state.productionGroups.filter((item) => item.productionSiteId === siteId).length;
  const routeCountFor = (hubId: string) => state.supplyRoutes.filter((item) => item.supplyHubId === hubId && item.enabled).length;
  const operationalGroups = state.productionGroups.filter((group) => group.enabled);
  const missingSiteGroups = operationalGroups.filter((group) => !state.productionSites.some((site) => site.id === group.productionSiteId && site.enabled));
  const sitesWithoutCalendar = state.productionSites.filter((site) => site.enabled && !state.productionCalendars.some((calendar) => calendar.id === site.productionCalendarId && calendar.enabled));
  const routesWithoutModes = state.supplyRoutes.filter((route) => route.enabled && enabledModesFor(route.id).length === 0);
  const usedSiteIds = new Set(operationalGroups.map((group) => group.productionSiteId));
  const missingRoutePairs = state.supplyHubs.filter((hub) => hub.enabled).flatMap((hub) => state.productionSites
    .filter((site) => site.enabled && usedSiteIds.has(site.id))
    .filter((site) => !state.supplyRoutes.some((route) => route.enabled && route.supplyHubId === hub.id && route.productionSiteId === site.id))
    .map((site) => ({ hub, site })));
  const healthIssueCount = missingSiteGroups.length + sitesWithoutCalendar.length + missingRoutePairs.length + routesWithoutModes.length;

  const openNewCalendar = () => setDraft({ kind: "calendar", value: { id: createOperationsMasterDataId("production-calendar"), name: "", workingWeekdays: [1, 2, 3, 4, 5, 6], exceptions: [], enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp } });
  const openNewSite = () => setDraft({ kind: "site", value: { id: createOperationsMasterDataId("production-site"), name: "", countryCode: null, productionCalendarId: state.productionCalendars[0]?.id ?? "", preProductionSampleLeadDays: 0, enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp } });
  const openNewHub = () => setDraft({ kind: "hub", value: { id: createOperationsMasterDataId("supply-hub"), name: "", enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp } });
  const openTransportPlan = (route?: SupplyRoute, defaults?: { supplyHubId: string; productionSiteId: string }) => {
    const nextRoute = route ? { ...route } : { id: createOperationsMasterDataId("supply-route"), supplyHubId: defaults?.supplyHubId ?? state.supplyHubs[0]?.id ?? "", productionSiteId: defaults?.productionSiteId ?? state.productionSites[0]?.id ?? "", name: "", enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp };
    setDraft({ kind: "transport-plan", route: nextRoute, modes: route ? state.transportModes.filter((item) => item.routeId === route.id).map((item) => ({ ...item })) : [] });
    setError("");
  };
  const addMode = () => {
    if (!draft || draft.kind !== "transport-plan") return;
    setDraft({ ...draft, modes: [...draft.modes, { id: createOperationsMasterDataId("transport-mode"), routeId: draft.route.id, name: "", transitDays: 0, enabled: true, sortOrder: (draft.modes.at(-1)?.sortOrder ?? 0) + 10, remark: "", createdAt: timestamp, updatedAt: timestamp }] });
  };
  const updateMode = (id: string, patch: Partial<TransportMode>) => {
    if (!draft || draft.kind !== "transport-plan") return;
    setDraft({ ...draft, modes: draft.modes.map((mode) => mode.id === id ? { ...mode, ...patch, routeId: draft.route.id } : mode) });
  };
  const save = () => {
    if (!draft || !canEdit) return;
    setError("");
    let next = state;
    if (draft.kind === "calendar") {
      if (!draft.value.name.trim() || !draft.value.workingWeekdays.length) { setError("请填写日历名称并至少选择一个工作日。"); return; }
      if (draft.value.exceptions.some((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !item.name.trim())) { setError("请完整填写特殊日期、类型和说明。"); return; }
      next = upsertProductionCalendar(state, draft.value);
    }
    if (draft.kind === "site") {
      if (!draft.value.name.trim() || !draft.value.productionCalendarId) { setError("请填写地点名称并选择工作日历。"); return; }
      next = upsertProductionSite(state, draft.value);
    }
    if (draft.kind === "hub") {
      if (!draft.value.name.trim()) { setError("请填写集货仓名称。"); return; }
      next = upsertSupplyHub(state, draft.value);
    }
    if (draft.kind === "transport-plan") {
      if (!draft.route.supplyHubId || !draft.route.productionSiteId) { setError("请选择出发集货仓和到达生产地点。"); return; }
      if (!draft.modes.length || draft.modes.some((mode) => !mode.name.trim() || mode.transitDays < 0)) { setError("请至少添加一种完整的运输方式。"); return; }
      const hub = state.supplyHubs.find((item) => item.id === draft.route.supplyHubId);
      const site = state.productionSites.find((item) => item.id === draft.route.productionSiteId);
      const route = { ...draft.route, name: `${hub?.name ?? "集货仓"} → ${site?.name ?? "生产地点"}` };
      next = upsertTransportPlan(next, { route, modes: draft.modes });
    }
    persist(next);
    setDraft(null);
    notify("生产与运输设置已保存");
  };

  return <AppShell title="生产与运输"><PageContainer>
    <PageHeader eyebrow="PRODUCTION & TRANSPORT" title="生产与运输" description="按生产地点、物料出发仓和运输方案维护物流计算所需事实。" primaryAction={<PermissionButton permission="settings.production_infrastructure.edit" onClick={() => openTransportPlan()}>＋ 新增运输方案</PermissionButton>} />

    <Card className="qc-infrastructure-health">
      <header><div><span>配置检查</span><strong>{healthIssueCount === 0 ? "生产与运输配置完整" : "仍有配置需要处理"}</strong></div><StatusTag tone={healthIssueCount === 0 ? "success" : "warning"}>{healthIssueCount === 0 ? "可用" : `${healthIssueCount} 项`}</StatusTag></header>
      <div>
        {missingSiteGroups.length ? <button type="button" disabled={!canEdit} onClick={openNewSite}>⚠ {missingSiteGroups.length} 个生产组未配置可用生产地点 <span>补充地点</span></button> : <p>✓ {operationalGroups.length} 个生产组已有生产地点</p>}
        {sitesWithoutCalendar.length ? <button type="button" disabled={!canEdit} onClick={openNewCalendar}>⚠ {sitesWithoutCalendar.length} 个生产地点缺少可用工作日历 <span>补充日历</span></button> : <p>✓ 启用的生产地点均已有工作日历</p>}
        {missingRoutePairs.length ? <button type="button" disabled={!canEdit} onClick={() => openTransportPlan(undefined, { supplyHubId: missingRoutePairs[0].hub.id, productionSiteId: missingRoutePairs[0].site.id })}>⚠ {missingRoutePairs[0].hub.name} → {missingRoutePairs[0].site.name} 缺少路线{missingRoutePairs.length > 1 ? `（另有 ${missingRoutePairs.length - 1} 项）` : ""} <span>新增运输方案</span></button> : <p>✓ 使用中的生产地点均已有供应路线</p>}
        {routesWithoutModes.length ? <button type="button" disabled={!canEdit} onClick={() => openTransportPlan(routesWithoutModes[0])}>⚠ {routesWithoutModes.length} 条路线没有可用运输方式 <span>编辑运输方案</span></button> : <p>✓ 启用的运输方案均已有运输方式</p>}
      </div>
    </Card>

    <section className="qc-infrastructure-business-section" aria-labelledby="production-sites-heading">
      <header><div><span>01</span><div><h2 id="production-sites-heading">在哪里生产</h2><p>生产地点关联工作日历和产前准备时间，生产组直接引用这里的地点。</p></div></div><div><PermissionButton permission="settings.production_infrastructure.edit" variant="secondary" onClick={openNewCalendar}>＋ 工作日历</PermissionButton><PermissionButton permission="settings.production_infrastructure.edit" onClick={openNewSite}>＋ 生产地点</PermissionButton></div></header>
      <div className="qc-infrastructure-card-grid">{state.productionSites.map((site) => { const calendar = calendarFor(site); const groupCount = groupCountFor(site.id); return <Card key={site.id} className="qc-infrastructure-entity-card"><header><div><strong>{site.name}</strong><small>{site.countryCode || "未设置国家/地区"}</small></div><StatusTag tone={site.enabled && calendar?.enabled ? "success" : "neutral"}>{site.enabled && calendar?.enabled ? "配置完整" : "待完善"}</StatusTag></header><dl><div><dt>生产组</dt><dd>{groupCount ? `${groupCount} 个生产组使用` : "尚未被生产组使用"}</dd></div><div><dt>工作日</dt><dd>{calendar ? weekdaySummary(calendar.workingWeekdays) : "未设置"}</dd></div><div><dt>产前准备</dt><dd>{site.preProductionSampleLeadDays} 天</dd></div><div><dt>特殊日期</dt><dd>{calendar ? `${calendar.exceptions.length} 条` : "—"}</dd></div></dl><footer><Button variant="text" permission="settings.production_infrastructure.edit" onClick={() => calendar && setDraft({ kind: "calendar", value: structuredClone(calendar) })} disabled={!calendar}>编辑工作日历</Button><Button variant="secondary" permission="settings.production_infrastructure.edit" onClick={() => setDraft({ kind: "site", value: { ...site } })}>编辑地点</Button></footer></Card>; })}</div>
    </section>

    <section className="qc-infrastructure-business-section" aria-labelledby="supply-hubs-heading">
      <header><div><span>02</span><div><h2 id="supply-hubs-heading">物料从哪里发</h2><p>集货仓是预计到料计划的到达点，也是运输方案的出发点。</p></div></div><PermissionButton permission="settings.production_infrastructure.edit" onClick={openNewHub}>＋ 集货仓</PermissionButton></header>
      <div className="qc-infrastructure-card-grid">{state.supplyHubs.map((hub) => <Card key={hub.id} className="qc-infrastructure-entity-card"><header><div><strong>{hub.name}</strong><small>{hub.remark || "物料集货与运输起点"}</small></div><StatusTag tone={hub.enabled ? "success" : "neutral"}>{hub.enabled ? "启用" : "停用"}</StatusTag></header><dl><div><dt>服务路线</dt><dd>{routeCountFor(hub.id)} 条</dd></div><div><dt>状态</dt><dd>{hub.enabled ? "可用于运输计划" : "不用于新计划"}</dd></div></dl><footer><Button variant="secondary" permission="settings.production_infrastructure.edit" onClick={() => setDraft({ kind: "hub", value: { ...hub } })}>编辑集货仓</Button></footer></Card>)}</div>
    </section>

    <section className="qc-infrastructure-business-section" aria-labelledby="transport-plans-heading">
      <header><div><span>03</span><div><h2 id="transport-plans-heading">仓库到工厂怎么走</h2><p>一个运输方案包含出发仓、到达地点和可选运输方式。</p></div></div><PermissionButton permission="settings.production_infrastructure.edit" onClick={() => openTransportPlan()}>＋ 新增运输方案</PermissionButton></header>
      <div className="qc-infrastructure-plan-list">{state.supplyRoutes.map((route) => { const site = state.productionSites.find((item) => item.id === route.productionSiteId); const hub = state.supplyHubs.find((item) => item.id === route.supplyHubId); const modes = enabledModesFor(route.id); return <Card key={route.id} className="qc-infrastructure-plan-card"><header><div><strong>{hub?.name ?? "历史集货仓"} <span aria-hidden>→</span> {site?.name ?? "历史生产地点"}</strong><small>{route.enabled ? "运输方案启用" : "运输方案停用"}</small></div><Button variant="secondary" permission="settings.production_infrastructure.edit" onClick={() => openTransportPlan(route)}>编辑运输方案</Button></header><div>{modes.length ? modes.map((mode) => <span key={mode.id}><strong>{mode.name}</strong><small>{mode.transitDays} 个自然日</small></span>) : <p>尚未配置运输方式</p>}</div></Card>; })}</div>
    </section>

    <details className="qc-infrastructure-explanation"><summary>系统如何选择运输方式</summary><div><p><strong>预计到料日</strong> + 运输自然日 = 预计到厂日</p><p><strong>计划开工日</strong> − 产前准备天数 = 最晚到厂日</p><p>系统会在预计到厂日不晚于最晚到厂日的方式中，选择最慢的可行运输方式。</p></div></details>

    <Drawer open={Boolean(draft)} className="qc-infrastructure-drawer" title={infrastructureDraftTitle(draft)} description={draft?.kind === "transport-plan" ? "一次维护出发集货仓、到达生产地点和全部运输方式。" : "修改会继续写入现有正式设置与 OperationLog。"} onClose={() => { setDraft(null); setError(""); }} onSubmit={save} footer={<><Button variant="secondary" onClick={() => setDraft(null)}>取消</Button><Button type="submit" permission="settings.production_infrastructure.edit">保存</Button></>}>
      {draft?.kind === "calendar" && <div className="qc-infrastructure-form"><FormItem label="日历名称" required><input className="qc-control" value={draft.value.name} onChange={(event) => setDraft({ kind: "calendar", value: { ...draft.value, name: event.target.value } })} /></FormItem><fieldset className="qc-weekday-field"><legend>每周工作日</legend><div>{weekdayLabels.map((label, day) => <label key={label}><input type="checkbox" checked={draft.value.workingWeekdays.includes(day)} onChange={(event) => setDraft({ kind: "calendar", value: { ...draft.value, workingWeekdays: event.target.checked ? [...draft.value.workingWeekdays, day].sort() : draft.value.workingWeekdays.filter((item) => item !== day) } })} /><span>{label}</span></label>)}</div></fieldset><section className="qc-calendar-exceptions"><header><div><strong>特殊日期</strong><small>明确设置某天工作或休息。</small></div><Button variant="secondary" size="compact" onClick={() => setDraft({ kind: "calendar", value: { ...draft.value, exceptions: [...draft.value.exceptions, { id: createOperationsMasterDataId("calendar-exception"), date: "", type: "non_working", name: "" }] } })}>＋ 添加特殊日期</Button></header>{draft.value.exceptions.map((exception) => <div key={exception.id}><input className="qc-control" type="date" aria-label="特殊日期" value={exception.date} onChange={(event) => setDraft({ kind: "calendar", value: { ...draft.value, exceptions: draft.value.exceptions.map((item) => item.id === exception.id ? { ...item, date: event.target.value } : item) } })} /><select className="qc-control" aria-label="特殊日期类型" value={exception.type} onChange={(event) => setDraft({ kind: "calendar", value: { ...draft.value, exceptions: draft.value.exceptions.map((item) => item.id === exception.id ? { ...item, type: event.target.value as ProductionCalendar["exceptions"][number]["type"] } : item) } })}><option value="non_working">休息</option><option value="working">工作</option></select><input className="qc-control" aria-label="特殊日期说明" placeholder="说明" value={exception.name} onChange={(event) => setDraft({ kind: "calendar", value: { ...draft.value, exceptions: draft.value.exceptions.map((item) => item.id === exception.id ? { ...item, name: event.target.value } : item) } })} /><Button variant="text" onClick={() => setDraft({ kind: "calendar", value: { ...draft.value, exceptions: draft.value.exceptions.filter((item) => item.id !== exception.id) } })}>移除</Button></div>)}</section><FormItem label="备注"><textarea className="qc-control" rows={3} value={draft.value.remark} onChange={(event) => setDraft({ kind: "calendar", value: { ...draft.value, remark: event.target.value } })} /></FormItem></div>}
      {draft?.kind === "site" && <div className="qc-infrastructure-form"><FormItem label="地点名称" required><input className="qc-control" value={draft.value.name} onChange={(event) => setDraft({ kind: "site", value: { ...draft.value, name: event.target.value } })} /></FormItem><div className="qc-infrastructure-form-grid"><FormItem label="国家 / 地区"><input className="qc-control" value={draft.value.countryCode ?? ""} onChange={(event) => setDraft({ kind: "site", value: { ...draft.value, countryCode: event.target.value || null } })} /></FormItem><FormItem label="工作日历" required><select className="qc-control" value={draft.value.productionCalendarId} onChange={(event) => setDraft({ kind: "site", value: { ...draft.value, productionCalendarId: event.target.value } })}>{state.productionCalendars.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem><FormItem label="产前准备提前天数"><NullableNumberInput className="qc-control" min="0" value={draft.value.preProductionSampleLeadDays} onValueChange={(value) => setDraft({ kind: "site", value: { ...draft.value, preProductionSampleLeadDays: value ?? 0 } })} /></FormItem><FormItem label="状态"><select className="qc-control" value={draft.value.enabled ? "enabled" : "disabled"} onChange={(event) => setDraft({ kind: "site", value: { ...draft.value, enabled: event.target.value === "enabled" } })}><option value="enabled">启用</option><option value="disabled">停用</option></select></FormItem></div><p className="qc-infrastructure-reference-note">当前被 {groupCountFor(draft.value.id)} 个生产组使用。被引用的地点只能停用，不能物理删除。</p><FormItem label="备注"><textarea className="qc-control" rows={3} value={draft.value.remark} onChange={(event) => setDraft({ kind: "site", value: { ...draft.value, remark: event.target.value } })} /></FormItem></div>}
      {draft?.kind === "hub" && <div className="qc-infrastructure-form"><FormItem label="集货仓名称" required><input className="qc-control" value={draft.value.name} onChange={(event) => setDraft({ kind: "hub", value: { ...draft.value, name: event.target.value } })} /></FormItem><FormItem label="状态"><select className="qc-control" value={draft.value.enabled ? "enabled" : "disabled"} onChange={(event) => setDraft({ kind: "hub", value: { ...draft.value, enabled: event.target.value === "enabled" } })}><option value="enabled">启用</option><option value="disabled">停用</option></select></FormItem><FormItem label="备注"><textarea className="qc-control" rows={3} value={draft.value.remark} onChange={(event) => setDraft({ kind: "hub", value: { ...draft.value, remark: event.target.value } })} /></FormItem></div>}
      {draft?.kind === "transport-plan" && <div className="qc-infrastructure-form"><div className="qc-infrastructure-steps"><FormItem label="1. 出发集货仓" required><select className="qc-control" value={draft.route.supplyHubId} onChange={(event) => setDraft({ ...draft, route: { ...draft.route, supplyHubId: event.target.value } })}>{state.supplyHubs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem><FormItem label="2. 到达生产地点" required><select className="qc-control" value={draft.route.productionSiteId} onChange={(event) => setDraft({ ...draft, route: { ...draft.route, productionSiteId: event.target.value } })}>{state.productionSites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem></div><section className="qc-transport-mode-editor"><header><div><strong>3. 运输方式</strong><small>系统按自然日和排序使用现有运输方式事实。</small></div><Button variant="secondary" size="compact" onClick={addMode}>＋ 增加运输方式</Button></header>{draft.modes.map((mode) => <div key={mode.id}><input className="qc-control" aria-label="运输方式名称" placeholder="名称" value={mode.name} onChange={(event) => updateMode(mode.id, { name: event.target.value })} /><NullableNumberInput className="qc-control" min="0" value={mode.transitDays} onValueChange={(value) => updateMode(mode.id, { transitDays: value ?? 0 })} /><span>自然日</span><label><input type="checkbox" checked={mode.enabled} onChange={(event) => updateMode(mode.id, { enabled: event.target.checked })} /> 启用</label><NullableNumberInput className="qc-control" min="0" value={mode.sortOrder} onValueChange={(value) => updateMode(mode.id, { sortOrder: value ?? 0 })} /></div>)}</section><FormItem label="方案备注"><textarea className="qc-control" rows={3} value={draft.route.remark} onChange={(event) => setDraft({ ...draft, route: { ...draft.route, remark: event.target.value } })} /></FormItem></div>}
      {error && <p className="qc-form-alert">{error}</p>}
    </Drawer><Toast message={message} />
  </PageContainer></AppShell>;
}

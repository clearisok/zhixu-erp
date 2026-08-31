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
  Modal,
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
  saveClosingTaxRate,
  upsertMonthlyProductionTarget,
  upsertOutsourceFactory,
  upsertProductionGroup,
  upsertProductionCalendar,
  upsertProductionSite,
  upsertSupplyHub,
  upsertSupplyRoute,
  upsertTransportMode,
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
  const { draft, setDraft, openDraft, closeDraft, requestClose, closeConfirmationOpen, keepEditing } = useGuardedDraft<MonthlyProductionTarget>();
  const [error, setError] = useState("");
  const taxRate = taxRateDraft === undefined ? state.closingSettings.defaultSalesTaxRatePercent : taxRateDraft;
  const taxDirty = taxRateDraft !== undefined && taxRateDraft !== state.closingSettings.defaultSalesTaxRatePercent;
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
    <FormSection title="默认销售产值税率" description="只作为新关账月份和归属的默认来源；不会回写已保存或锁定的关账快照。" columns={1} actions={<PermissionButton permission="settings.closing.edit" onClick={saveTax} disabled={taxRate === null || !taxDirty}>{taxDirty ? "保存默认税率" : "已保存"}</PermissionButton>}><div className="qc-operations-tax-field"><FormItem label="默认税率 %" required><NullableNumberInput className="qc-control" min="0" value={taxRate} onValueChange={setTaxRateDraft} /></FormItem><small>当前正式默认值：{state.closingSettings.defaultSalesTaxRatePercent}%</small></div></FormSection>
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
  | { kind: "route"; value: SupplyRoute }
  | { kind: "mode"; value: TransportMode };

export function ProductionInfrastructureSettingsPage() {
  const { can } = usePermissions(); const { state, persist } = useOperationsSettings(); const { message, notify } = useToast(); const [draft, setDraft] = useState<InfrastructureDraft | null>(null); const timestamp = now();
  const save = () => { if (!draft || !can("settings.production_infrastructure.edit")) return; let next = state; if (draft.kind === "calendar") next = upsertProductionCalendar(state, draft.value); if (draft.kind === "site") next = upsertProductionSite(state, draft.value); if (draft.kind === "hub") next = upsertSupplyHub(state, draft.value); if (draft.kind === "route") next = upsertSupplyRoute(state, draft.value); if (draft.kind === "mode") next = upsertTransportMode(state, draft.value); persist(next); setDraft(null); notify("生产与运输设置已保存"); };
  const newCalendar = () => setDraft({ kind: "calendar", value: { id: createOperationsMasterDataId("production-calendar"), name: "", workingWeekdays: [1,2,3,4,5,6], exceptions: [], enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp } });
  const newSite = () => setDraft({ kind: "site", value: { id: createOperationsMasterDataId("production-site"), name: "", countryCode: null, productionCalendarId: state.productionCalendars[0]?.id ?? "", preProductionSampleLeadDays: 0, enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp } });
  const newHub = () => setDraft({ kind: "hub", value: { id: createOperationsMasterDataId("supply-hub"), name: "", enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp } });
  const newRoute = () => setDraft({ kind: "route", value: { id: createOperationsMasterDataId("supply-route"), supplyHubId: state.supplyHubs[0]?.id ?? "", productionSiteId: state.productionSites[0]?.id ?? "", name: "", enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp } });
  const newMode = () => setDraft({ kind: "mode", value: { id: createOperationsMasterDataId("transport-mode"), routeId: state.supplyRoutes[0]?.id ?? "", name: "", transitDays: 0, enabled: true, sortOrder: 10, remark: "", createdAt: timestamp, updatedAt: timestamp } });
  return <AppShell title="生产与运输"><PageContainer><PageHeader eyebrow="PRODUCTION & TRANSPORT" title="生产与运输" description="用正式生产地点、日历、供应枢纽、路线和运输方式表达执行关系；运输可行性仍由现有排单服务判断。" />
    <section className="qc-infrastructure-summary" aria-label="关系概览"><Card><span>生产地点</span><strong>{state.productionSites.filter((item) => item.enabled).length}</strong><small>{state.productionCalendars.filter((item) => item.enabled).length} 个启用日历</small></Card><Card><span>供应路线</span><strong>{state.supplyRoutes.filter((item) => item.enabled).length}</strong><small>{state.supplyHubs.filter((item) => item.enabled).length} 个供应枢纽</small></Card><Card><span>运输方式</span><strong>{state.transportModes.filter((item) => item.enabled).length}</strong><small>按正式路线与自然日维护</small></Card></section>
    <Card className="qc-infrastructure-relationships"><div className="qc-operations-list-header"><div><strong>生产 ↔ 运输关系</strong><small>异常与状态不在此处推算；排单工作区使用同一组正式事实。</small></div><div><PermissionButton permission="settings.production_infrastructure.edit" variant="secondary" onClick={newRoute}>＋ 路线</PermissionButton><PermissionButton permission="settings.production_infrastructure.edit" onClick={newMode}>＋ 运输方式</PermissionButton></div></div><div className="qc-infrastructure-route-list">{state.supplyRoutes.map((route) => { const site = state.productionSites.find((item) => item.id === route.productionSiteId); const hub = state.supplyHubs.find((item) => item.id === route.supplyHubId); const calendar = state.productionCalendars.find((item) => item.id === site?.productionCalendarId); const modes = state.transportModes.filter((item) => item.routeId === route.id); return <article key={route.id}><header><div><strong>{route.name}</strong><small>{route.enabled ? "路线启用" : "路线停用"}</small></div><Button variant="text" permission="settings.production_infrastructure.edit" onClick={() => setDraft({ kind: "route", value: { ...route } })}>编辑路线</Button></header><div className="qc-infrastructure-flow"><section><span>供应</span><strong>{hub?.name ?? "历史枢纽"}</strong><small>SupplyHub</small></section><i aria-hidden="true">→</i><section><span>生产</span><strong>{site?.name ?? "历史地点"}</strong><small>{calendar?.name ?? "无日历"} · 封样提前 {site?.preProductionSampleLeadDays ?? 0} 天</small></section><i aria-hidden="true">→</i><section><span>运输</span><strong>{modes.length ? modes.map((item) => item.name).join(" / ") : "未配置"}</strong><small>{modes.length ? `${Math.min(...modes.map((item) => item.transitDays))}–${Math.max(...modes.map((item) => item.transitDays))} 自然日` : "需要维护运输方式"}</small></section></div><footer>{modes.map((item) => <button type="button" key={item.id} onClick={() => setDraft({ kind: "mode", value: { ...item } })}><strong>{item.name}</strong><span>{item.transitDays} 天</span></button>)}</footer></article>; })}</div></Card>
    <div className="qc-infrastructure-management"><Card className="qc-master-list"><div className="qc-operations-list-header"><div><strong>生产事实</strong><small>地点与日历；不等同于报价制作国家。</small></div><div><PermissionButton permission="settings.production_infrastructure.edit" variant="secondary" onClick={newCalendar}>＋ 日历</PermissionButton><PermissionButton permission="settings.production_infrastructure.edit" onClick={newSite}>＋ 地点</PermissionButton></div></div>{state.productionCalendars.map((item) => <div className="qc-row-actions" key={item.id}><strong>{item.name}</strong><span>工作周 {item.workingWeekdays.map((day) => "日一二三四五六"[day]).join("、")}</span><span>{item.exceptions.length} 个例外</span><Button variant="text" permission="settings.production_infrastructure.edit" onClick={() => setDraft({ kind: "calendar", value: { ...item, exceptions: [...item.exceptions] } })}>编辑</Button></div>)}{state.productionSites.map((item) => <div className="qc-row-actions" key={item.id}><strong>{item.name}</strong><span>{item.countryCode ?? "—"}</span><span>提前 {item.preProductionSampleLeadDays} 天</span><Button variant="text" permission="settings.production_infrastructure.edit" onClick={() => setDraft({ kind: "site", value: { ...item } })}>编辑</Button></div>)}</Card><Card className="qc-master-list"><div className="qc-operations-list-header"><div><strong>运输事实</strong><small>供应枢纽、正式路线与运输自然日。</small></div><PermissionButton permission="settings.production_infrastructure.edit" onClick={newHub}>＋ 枢纽</PermissionButton></div>{state.supplyHubs.map((item) => <div className="qc-row-actions" key={item.id}><strong>{item.name}</strong><span>供应枢纽</span><Button variant="text" permission="settings.production_infrastructure.edit" onClick={() => setDraft({ kind: "hub", value: { ...item } })}>编辑</Button></div>)}</Card></div>
    <Modal open={Boolean(draft)} title="编辑生产与运输设置" onClose={() => setDraft(null)} onSubmit={save} footer={<><Button variant="secondary" onClick={() => setDraft(null)}>取消</Button><Button type="submit" permission="settings.production_infrastructure.edit">保存</Button></>}>{draft && <div className="qc-modal-form">
      <FormItem label="名称" required><input className="qc-control" value={draft.value.name} onChange={(event) => setDraft({ ...draft, value: { ...draft.value, name: event.target.value } } as InfrastructureDraft)} /></FormItem>
      {draft.kind === "calendar" && <><FormItem label="每周工作日"><input className="qc-control" value={draft.value.workingWeekdays.join(",")} onChange={(event) => setDraft({ kind: "calendar", value: { ...draft.value, workingWeekdays: event.target.value.split(",").map(Number).filter((day) => day >= 0 && day <= 6) } })} placeholder="0=周日，1=周一，例如 1,2,3,4,5,6" /></FormItem><FormItem label="例外日期 JSON"><textarea className="qc-control" value={JSON.stringify(draft.value.exceptions)} onChange={(event) => { try { const exceptions = JSON.parse(event.target.value) as ProductionCalendar["exceptions"]; setDraft({ kind: "calendar", value: { ...draft.value, exceptions } }); } catch { /* 输入完成后再解析 */ } }} /></FormItem></>}
      {draft.kind === "site" && <><FormItem label="国家代码"><input className="qc-control" value={draft.value.countryCode ?? ""} onChange={(event) => setDraft({ kind: "site", value: { ...draft.value, countryCode: event.target.value || null } })} /></FormItem><FormItem label="生产日历"><select className="qc-control" value={draft.value.productionCalendarId} onChange={(event) => setDraft({ kind: "site", value: { ...draft.value, productionCalendarId: event.target.value } })}>{state.productionCalendars.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem><FormItem label="产前样提前天数"><NullableNumberInput className="qc-control" min="0" value={draft.value.preProductionSampleLeadDays} onValueChange={(value) => setDraft({ kind: "site", value: { ...draft.value, preProductionSampleLeadDays: value ?? 0 } })} /></FormItem></>}
      {draft.kind === "route" && <><FormItem label="供应枢纽"><select className="qc-control" value={draft.value.supplyHubId} onChange={(event) => setDraft({ kind: "route", value: { ...draft.value, supplyHubId: event.target.value } })}>{state.supplyHubs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem><FormItem label="生产地点"><select className="qc-control" value={draft.value.productionSiteId} onChange={(event) => setDraft({ kind: "route", value: { ...draft.value, productionSiteId: event.target.value } })}>{state.productionSites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem></>}
      {draft.kind === "mode" && <><FormItem label="路线"><select className="qc-control" value={draft.value.routeId} onChange={(event) => setDraft({ kind: "mode", value: { ...draft.value, routeId: event.target.value } })}>{state.supplyRoutes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem><FormItem label="运输自然日"><NullableNumberInput className="qc-control" min="0" value={draft.value.transitDays} onValueChange={(value) => setDraft({ kind: "mode", value: { ...draft.value, transitDays: value ?? 0 } })} /></FormItem></>}
      <FormItem label="备注"><textarea className="qc-control" value={draft.value.remark} onChange={(event) => setDraft({ ...draft, value: { ...draft.value, remark: event.target.value } } as InfrastructureDraft)} /></FormItem>
    </div>}</Modal><Toast message={message} />
  </PageContainer></AppShell>;
}

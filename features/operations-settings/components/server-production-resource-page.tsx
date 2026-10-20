"use client";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { AppShell, Button, Card, DataTable, Drawer, EmptyState, FormItem, PageContainer, PageHeader, SearchField, StatusTag, Toolbar, UnsavedDraftDialog, type DataColumn } from "@/components/foundation";
import { isDraftChanged } from "@/components/foundation/draft-state";
import { useServerNavigationProtection } from "@/components/foundation/server-navigation-protection";
import { PermissionAuthorityProvider } from "@/features/permissions/components/permission-authority";
import type { PermissionKey } from "@/features/permissions/model/permissions";
import { useServerSession } from "@/features/server-auth";
import { canonicalResourceCommand, productionResourceClient, ProductionResourceError, type ProductionResource, type ProductionResourceCommand, type ProductionResourceSummary, type ProductionResourceType, type ResourceDirectory, type ResourceListQuery, type VerifiedResourceOutcome } from "../server/production-resource-client";
import { acknowledgeResourcePending, readResourcePending, saveResourcePending } from "../server/production-resource-outbox";
import { OutsourceFactoryFields, ProductionCalendarFields, ProductionGroupFields, ProductionSiteFields, weekdaySummary, type CalendarFields } from "./production-resource-fields";
import { ServerProductionReferencePicker } from "./server-production-reference-picker";
import type { ProductionResourceInputs } from "../../../server/production-resources/contract";

const specifications = {
  calendars: { title: "工作日历", edit: "settings.production_infrastructure.edit", description: "维护每周工作日及明确的特殊日期。" },
  sites: { title: "生产地点", edit: "settings.production_infrastructure.edit", description: "维护地点、工作日历及产前准备时间。" },
  groups: { title: "生产组", edit: "settings.production_group.edit", description: "维护内部生产组基础资料；稳定 ID 不随名称修改而变化。" },
  factories: { title: "外发厂", edit: "settings.outsource_factory.edit", description: "维护外发加工厂的名称、联系人和联系电话。" },
} satisfies Record<ProductionResourceType, { title: string; edit: PermissionKey; description: string }>;
type DraftData = { [K in ProductionResourceType]: { kind: K; data: K extends "calendars" ? Omit<ProductionResourceInputs[K], "exceptions"> & { exceptions: CalendarFields["exceptions"] } : ProductionResourceInputs[K] } }[ProductionResourceType];
type Draft = DraftData & { resourceId: string | null; expectedVersion: number };
function newDraft(kind: ProductionResourceType): Draft {
  const common = { name: "", enabled: true, remark: "" }, identity = { resourceId: null, expectedVersion: 0 };
  if (kind === "calendars") return { ...identity, kind, data: { ...common, workingWeekdays: [1, 2, 3, 4, 5, 6], exceptions: [] } };
  if (kind === "sites") return { ...identity, kind, data: { ...common, countryCode: null, productionCalendarId: "", preProductionSampleLeadDays: 0 } };
  if (kind === "groups") return { ...identity, kind, data: { ...common, shortName: "", productionSiteId: "", sortOrder: 0 } };
  return { ...identity, kind, data: { ...common, shortName: "", contactPerson: "", phone: "" } };
}
function resourceDraft(resource: ProductionResource): Draft {
  const identity = { resourceId: resource.id, expectedVersion: resource.version };
  switch (resource.kind) {
    case "calendars": return { ...identity, kind: resource.kind, data: { name: resource.name, enabled: resource.enabled, remark: resource.remark, workingWeekdays: [...resource.workingWeekdays], exceptions: resource.exceptions.map(item => ({ ...item, id: crypto.randomUUID() })) } };
    case "sites": return { ...identity, kind: resource.kind, data: { name: resource.name, enabled: resource.enabled, remark: resource.remark, countryCode: resource.countryCode, productionCalendarId: resource.productionCalendarId, preProductionSampleLeadDays: resource.preProductionSampleLeadDays } };
    case "groups": return { ...identity, kind: resource.kind, data: { name: resource.name, enabled: resource.enabled, remark: resource.remark, shortName: resource.shortName, productionSiteId: resource.productionSiteId, sortOrder: resource.sortOrder } };
    case "factories": return { ...identity, kind: resource.kind, data: { name: resource.name, enabled: resource.enabled, remark: resource.remark, shortName: resource.shortName, contactPerson: resource.contactPerson, phone: resource.phone } };
  }
}
function draftCommand(draft: Draft, requestId: string) {
  const data = draft.kind === "calendars" ? { ...draft.data, exceptions: draft.data.exceptions.map(({ id: _id, ...item }) => { void _id; return item; }) } : draft.data;
  return canonicalResourceCommand({ requestId, kind: draft.kind, action: draft.resourceId ? "update" : "create", resourceId: draft.resourceId, expectedVersion: draft.expectedVersion, data });
}
const safeError = (error: unknown) => error instanceof ProductionResourceError ? error.message : "操作未能安全完成，请重新读取或核对原请求。";
const pendingMessage = "保存正在处理或结果尚未确认，请先核对原请求。";
type OwnedState<L> = {
  lease: L; query: ResourceListQuery; revision: number; directory?: ResourceDirectory; names: Record<string, string>; references: Record<string, ProductionResource>; error: string; listError: string; notice: string;
  draft: Draft | null; initial: Draft | null; confirmClose: boolean; pending: ProductionResourceCommand | null; corrupt: boolean;
  receipt: "unchecked" | "pending" | "unknown" | "mismatch"; busy: boolean;
};

type ResourceEditorActions = { edit(item: Pick<ProductionResourceSummary, "id">): Promise<void> };
function ResourceWorkspace({ kind, infrastructure = false, editorRef, onEditCalendar, referenceRevision = 0, onApplied }: { kind: ProductionResourceType; infrastructure?: boolean; editorRef?: Ref<ResourceEditorActions>; onEditCalendar?: (id: string) => void; referenceRevision?: number; onApplied?: () => void }) {
  const session = useServerSession(), spec = specifications[kind];
  const lease = useMemo(() => ({ kind, session }), [kind, session]), committed = useRef<typeof lease | null>(null);
  useLayoutEffect(() => { committed.current = lease; return () => { committed.current = null; }; }, [lease]);
  const isCurrent = useCallback(() => committed.current === lease && session.status === "authenticated", [lease, session]);
  const [owned, setOwned] = useState<OwnedState<typeof lease>>();
  const state = owned?.lease === lease ? owned : undefined;
  const busyOwner = useRef<typeof lease | null>(null);
  const change = useCallback((update: (value: OwnedState<typeof lease>) => OwnedState<typeof lease>) => {
    if (isCurrent()) setOwned(previous => previous?.lease === lease ? update(previous) : previous);
  }, [isCurrent, lease]);
  const dirty = Boolean(state?.draft && isDraftChanged(state.initial, state.draft));
  const blocked = Boolean(state?.busy || state?.pending || state?.corrupt);
  useServerNavigationProtection({ dirty, blocked, message: pendingMessage });
  const mayEdit = session.hasPermission(spec.edit) && state?.directory?.canEdit === true;
  const permission = useCallback((key: PermissionKey) => key === spec.edit ? Boolean(mayEdit) : session.hasPermission(key), [mayEdit, session, spec.edit]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || !isCurrent() || !session.user) return;
      let pending: ProductionResourceCommand | null = null, corrupt = false;
      try { pending = readResourcePending(window.sessionStorage, { userId: session.user.id, kind }); } catch { corrupt = true; }
      if (!active || !isCurrent()) return;
      setOwned({ lease, query: { search: "", status: "all", offset: 0, limit: 20 }, revision: 0, names: {}, references: {}, error: "", listError: "", notice: "", draft: null, initial: null, confirmClose: false, pending, corrupt, receipt: "unchecked", busy: false });
    });
    return () => { active = false; };
  }, [kind, lease, session, isCurrent]);
  const query = state?.query, revision = state?.revision;
  useEffect(() => {
    if (!query || !isCurrent()) return;
    let active = true;
    void productionResourceClient.list(kind, query).then(async directory => {
      if (!active || !isCurrent()) return;
      change(value => ({ ...value, directory, listError: "", names: {}, references: {} }));
      const refKind = kind === "groups" ? "sites" : kind === "sites" ? "calendars" : null;
      if (!refKind) return;
      const ids = [...new Set(directory.items.flatMap(item => item.kind === "groups" ? [item.productionSiteId] : item.kind === "sites" ? [item.productionCalendarId] : []))];
      const names: Record<string, string> = {}, references: Record<string, ProductionResource> = {};
      await Promise.all(ids.map(async id => {
        try { const item = await productionResourceClient.read(refKind, id); if (active && isCurrent()) { names[id] = item.name + (item.enabled ? "" : "（已停用）"); references[id] = item; } }
        catch (error) { if (active && isCurrent()) { if (error instanceof ProductionResourceError && error.status === 401) session.invalidate(); else names[id] = "关联资料暂时无法读取"; } }
      }));
      if (active && isCurrent()) change(value => value.directory === directory ? { ...value, names, references } : value);
    }).catch(error => {
      if (!active || !isCurrent()) return;
      if (error instanceof ProductionResourceError && error.status === 401) session.invalidate();
      else change(value => ({ ...value, directory: undefined, listError: safeError(error) }));
    });
    return () => { active = false; };
  }, [kind, query, revision, referenceRevision, session, change, isCurrent]);
  const startBusy = () => {
    if (!isCurrent() || busyOwner.current === lease || !state || state.busy) return false;
    busyOwner.current = lease; change(value => ({ ...value, busy: true, error: "", notice: "" })); return true;
  };
  const finishBusy = () => { if (busyOwner.current === lease) { busyOwner.current = null; change(value => ({ ...value, busy: false })); } };
  const showDraft = (draft: Draft) => change(value => ({ ...value, draft, initial: structuredClone(draft), error: "", notice: "", confirmClose: false }));
  const closeDraft = () => { if (!blocked && busyOwner.current !== lease) change(value => ({ ...value, draft: null, initial: null, confirmClose: false, error: "" })); };
  const requestClose = () => {
    if (blocked || busyOwner.current === lease) { change(value => ({ ...value, error: pendingMessage })); return; }
    if (dirty) change(value => ({ ...value, confirmClose: true })); else closeDraft();
  };
  const edit = async (item: Pick<ProductionResourceSummary, "id">) => {
    if (!mayEdit || blocked || !startBusy()) return;
    try { const detail = await productionResourceClient.read(kind, item.id); if (isCurrent()) showDraft(resourceDraft(detail)); }
    catch (error) { if (isCurrent()) { if (error instanceof ProductionResourceError && error.status === 401) session.invalidate(); else change(value => ({ ...value, error: safeError(error) })); } }
    finally { finishBusy(); }
  };
  useImperativeHandle(editorRef, () => ({ edit }));
  const completed = (command: ProductionResourceCommand, result: VerifiedResourceOutcome) => {
    if (!isCurrent() || !session.user) return;
    acknowledgeResourcePending(window.sessionStorage, { userId: session.user.id, kind }, command);
    // A replay is an occurrence-time snapshot. Discard it and read the current list.
    change(value => ({ ...value, pending: null, receipt: "unchecked", revision: value.revision + 1, directory: undefined,
      draft: result.status === "applied" ? null : value.draft, initial: result.status === "applied" ? null : value.initial,
      notice: result.status === "applied" ? (result.changed ? `${spec.title}已保存` : "资料未发生变化") : "原请求已明确拒绝，没有重复创建。", error: result.status === "rejected" ? safeError(new ProductionResourceError(result.error.status, result.error.code)) : "" }));
    if (result.status === "applied") onApplied?.();
  };
  const send = async (original?: ProductionResourceCommand) => {
    if (!state || !mayEdit || state.corrupt || (!original && state.pending) || !startBusy()) return;
    let command: ProductionResourceCommand | undefined, persisted = false;
    try {
      if (!session.user || !isCurrent()) return;
      command = original ?? (state.draft ? draftCommand(state.draft, crypto.randomUUID()) : undefined); if (!command) return;
      saveResourcePending(window.sessionStorage, { userId: session.user.id, kind }, command);
      persisted = true;
      if (!isCurrent()) return;
      change(value => ({ ...value, pending: command!, receipt: "unchecked" }));
      const result = await productionResourceClient.execute(command, isCurrent); if (!isCurrent()) return;
      completed(command, result);
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof ProductionResourceError && error.status === 401) session.invalidate();
      else {
        if (error instanceof ProductionResourceError && error.knownNotApplied && command && session.user) {
          try { acknowledgeResourcePending(window.sessionStorage, { userId: session.user.id, kind }, command); change(value => ({ ...value, pending: null })); } catch { /* Keep unresolved bytes if acknowledgement fails. */ }
        }
        change(value => ({ ...value, error: safeError(error), corrupt: value.corrupt || Boolean(command && !persisted), receipt: error instanceof ProductionResourceError && error.code === "resource_receipt_mismatch" ? "mismatch" : value.receipt }));
      }
    } finally { finishBusy(); }
  };
  const check = async () => {
    if (!state?.pending || !startBusy()) return;
    const command = state.pending;
    try {
      const receipt = await productionResourceClient.receipt(command, isCurrent); if (!isCurrent()) return;
      if (receipt.state === "known") completed(command, receipt.result);
      else change(value => ({ ...value, receipt: receipt.state, notice: receipt.state === "pending" ? "原请求仍在处理中，请稍后核对。" : "暂未查到原请求结果。可继续核对，或明确重试原编号与原内容。" }));
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof ProductionResourceError && error.status === 401) session.invalidate();
      else change(value => ({ ...value, error: safeError(error), receipt: error instanceof ProductionResourceError && error.code === "resource_receipt_mismatch" ? "mismatch" : value.receipt }));
    } finally { finishBusy(); }
  };
  const toggle = async (item: ProductionResourceSummary) => {
    if (!mayEdit || blocked || !startBusy()) return;
    try { const resource = await productionResourceClient.read(kind, item.id); if (isCurrent()) { const draft = resourceDraft(resource); draft.data.enabled = !resource.enabled; showDraft(draft); } }
    catch (error) { if (isCurrent()) { if (error instanceof ProductionResourceError && error.status === 401) session.invalidate(); else change(value => ({ ...value, error: safeError(error) })); } }
    finally { finishBusy(); }
  };
  const draft = state?.draft, rows = state?.directory?.items ?? [];
  const updateDraft = (next: Draft) => { if (mayEdit && !blocked && busyOwner.current !== lease) change(value => ({ ...value, draft: next, error: "" })); };
  const referenceName = (id: string) => state?.names[id] ?? "关联资料核对中";
  const actions = (item: ProductionResourceSummary) => <><Button variant="text" size="compact" permission={spec.edit} disabled={blocked} onClick={() => void edit(item)}>编辑</Button><Button variant="text" size="compact" permission={spec.edit} disabled={blocked} onClick={() => void toggle(item)}>{item.enabled ? "停用" : "启用"}</Button></>;
  const columns: DataColumn<ProductionResourceSummary>[] = [
    { key: "name", header: spec.title, width: 190, sticky: "left", responsivePriority: "primary", render: item => <span className="qc-master-identity"><strong>{item.name}</strong><small>{item.id}</small></span> },
    ...(kind === "calendars" ? [
      { key: "week", header: "工作日", minWidth: 180, responsivePriority: "primary" as const, render: (item: ProductionResourceSummary) => item.kind === "calendars" ? weekdaySummary(item.workingWeekdays) : "" },
      { key: "exceptions", header: "特殊日期", width: 100, render: (item: ProductionResourceSummary) => item.kind === "calendars" ? `${item.exceptionCount} 条` : "" },
    ] : kind === "sites" ? [
      { key: "country", header: "国家 / 地区", width: 160, render: (item: ProductionResourceSummary) => item.kind === "sites" ? item.countryCode : "" },
      { key: "calendar", header: "工作日历", minWidth: 160, responsivePriority: "primary" as const, render: (item: ProductionResourceSummary) => item.kind === "sites" ? referenceName(item.productionCalendarId) : "" },
      { key: "lead", header: "产前准备", width: 100, render: (item: ProductionResourceSummary) => item.kind === "sites" ? `${item.preProductionSampleLeadDays} 天` : "" },
    ] : kind === "groups" ? [
      { key: "short", header: "简称", width: 100, render: (item: ProductionResourceSummary) => item.kind === "groups" ? item.shortName : "" },
      { key: "site", header: "生产地点", minWidth: 160, responsivePriority: "primary" as const, render: (item: ProductionResourceSummary) => item.kind === "groups" ? referenceName(item.productionSiteId) : "" },
      { key: "sort", header: "排序", width: 80, render: (item: ProductionResourceSummary) => item.kind === "groups" ? item.sortOrder : "" },
    ] : [
      { key: "short", header: "简称", width: 100, render: (item: ProductionResourceSummary) => item.kind === "factories" ? item.shortName : "" },
      { key: "contact", header: "联系人", width: 120, responsivePriority: "primary" as const, render: (item: ProductionResourceSummary) => item.kind === "factories" ? item.contactPerson : "" },
      { key: "phone", header: "联系电话", width: 140, render: (item: ProductionResourceSummary) => item.kind === "factories" ? item.phone : "" },
    ]),
    { key: "status", header: "状态", width: 88, responsivePriority: "primary", render: item => <StatusTag tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "启用" : "停用"}</StatusTag> },
    { key: "remark", header: "备注", minWidth: 150, render: item => <span className="qc-master-note" title={item.remark}>{item.remark}</span> },
    { key: "actions", header: "操作", width: 140, sticky: "right", responsivePriority: "primary", render: actions },
  ];
  if (session.status !== "authenticated") return <p role="status">正在核对登录状态…</p>;
  return <PermissionAuthorityProvider can={permission}>
    <section className={infrastructure ? "qc-infrastructure-business-section" : undefined} aria-label={spec.title}>
    {infrastructure ? <header><div>{kind === "sites" && <span>01</span>}<div><h2>{kind === "sites" ? "在哪里生产" : "工作日历"}</h2><p>{spec.description}</p></div></div><Button permission={spec.edit} disabled={!state || blocked} onClick={() => { if (mayEdit && isCurrent() && !blocked) showDraft(newDraft(kind)); }}>＋ {spec.title}</Button></header> : <PageHeader eyebrow="PRODUCTION MASTER DATA" title={spec.title} count={state?.directory ? `${state.directory.total} 条` : undefined} description={spec.description} primaryAction={<Button permission={spec.edit} disabled={!state || blocked} onClick={() => { if (mayEdit && isCurrent() && !blocked) showDraft(newDraft(kind)); }}>＋ 新增{spec.title}</Button>} />}
    {(state?.error || state?.listError) && <p role="alert" className="qc-form-alert">{state.error || state.listError}</p>}{state?.notice && <p role="status">{state.notice}</p>}
    {state?.corrupt && <Card><p role="alert">原请求缓存无法安全读取，内容已保留。请联系管理员核对，当前不会再次提交。</p></Card>}
    {state?.pending && <Card><p>原保存请求尚未确认。不会自动重新提交。</p><p>{state.pending.action === "create" ? "新增" : "修改"}{spec.title}：{state.pending.data.name} · {state.pending.data.enabled ? "启用" : "停用"}</p><small>原请求：{state.pending.requestId}</small><div className="qc-master-actions"><Button variant="secondary" disabled={state.busy} onClick={() => void check()}>核对原请求</Button>{state.receipt === "unknown" && <Button permission={spec.edit} disabled={state.busy} onClick={() => void send(state.pending!)}>重试原请求</Button>}</div></Card>}
    <Toolbar search={<SearchField label={`搜索${spec.title}`} value={state?.query.search ?? ""} placeholder="名称、简称或备注；空格为且" onChange={search => { if (!blocked) change(value => ({ ...value, query: { ...value.query, search, offset: 0 }, directory: undefined })); }} />} actions={<><select aria-label="启用状态" className="qc-control" value={state?.query.status ?? "all"} disabled={blocked} onChange={event => change(value => ({ ...value, query: { ...value.query, status: event.target.value as ResourceListQuery["status"], offset: 0 }, directory: undefined }))}><option value="all">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select><Button variant="secondary" disabled={!state || state.busy} onClick={() => change(value => ({ ...value, revision: value.revision + 1, directory: undefined }))}>重新读取</Button></>} />
    {infrastructure ? <div className="qc-infrastructure-card-grid">
      {!state?.directory ? <p role="status">{state?.listError || "正在读取…"}</p> : !rows.length ? <EmptyState title={`没有匹配的${spec.title}`} /> : rows.map(item => {
        const calendar = item.kind === "sites" ? state.references[item.productionCalendarId] : undefined;
        return <Card key={item.id} className="qc-infrastructure-entity-card"><header><div><strong>{item.name}</strong><small>{item.kind === "sites" ? item.countryCode || "未设置国家/地区" : "每周模板与明确日期"}</small></div><StatusTag tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "启用" : "停用"}</StatusTag></header><dl>
          {item.kind === "sites" && <><div><dt>工作日历</dt><dd>{referenceName(item.productionCalendarId)}</dd></div><div><dt>工作日</dt><dd>{calendar?.kind === "calendars" ? weekdaySummary(calendar.workingWeekdays) : "待核对"}</dd></div><div><dt>产前准备</dt><dd>{item.preProductionSampleLeadDays} 天</dd></div><div><dt>特殊日期</dt><dd>{calendar?.kind === "calendars" ? `${calendar.exceptions.length} 条` : "待核对"}</dd></div></>}
          {item.kind === "calendars" && <><div><dt>工作日</dt><dd>{weekdaySummary(item.workingWeekdays)}</dd></div><div><dt>特殊日期</dt><dd>{item.exceptionCount} 条</dd></div><div><dt>备注</dt><dd>{item.remark || "—"}</dd></div></>}
        </dl><footer>{item.kind === "sites" && <Button variant="text" permission={spec.edit} disabled={blocked || !calendar} onClick={() => onEditCalendar?.(item.productionCalendarId)}>编辑工作日历</Button>}<Button variant="secondary" permission={spec.edit} disabled={blocked} onClick={() => void edit(item)}>{item.kind === "sites" ? "编辑地点" : "编辑工作日历"}</Button></footer></Card>;
      })}
    </div> : <Card className="qc-master-list"><DataTable rows={rows} columns={columns} rowKey={item => item.id} ariaLabel={spec.title} loading={!state || !state.directory && !state.listError} error={state?.listError} empty={<EmptyState title={`没有匹配的${spec.title}`} description={state?.query.search ? "请调整搜索关键词" : `可从页面右上角新增${spec.title}`} />} renderRecord={item => <div className="qc-master-record"><header><strong>{item.name}</strong><StatusTag tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "启用" : "停用"}</StatusTag></header><dl>{columns.filter(column => !["name", "status", "actions"].includes(column.key)).map(column => <div key={column.key}><dt>{column.header}</dt><dd>{column.render(item) || "—"}</dd></div>)}</dl><footer>{actions(item)}</footer></div>} /></Card>}
    <div className="qc-master-actions"><Button variant="secondary" disabled={!state?.directory || blocked || !state.query.offset} onClick={() => change(value => ({ ...value, query: { ...value.query, offset: Math.max(0, value.query.offset - 20) }, directory: undefined }))}>上一页</Button><span>{state?.directory ? `${state.query.offset + (rows.length ? 1 : 0)}–${state.query.offset + rows.length} / ${state.directory.total}` : "正在读取…"}</span><Button variant="secondary" disabled={!state?.directory || blocked || state.query.offset + 20 >= state.directory.total} onClick={() => change(value => ({ ...value, query: { ...value.query, offset: value.query.offset + 20 }, directory: undefined }))}>下一页</Button></div>
    </section>
    <Drawer open={Boolean(draft)} className={kind === "calendars" || kind === "sites" ? "qc-infrastructure-drawer" : "qc-master-data-drawer"} title={`${draft?.resourceId ? "编辑" : "新增"}${spec.title}`} description="保存后保留稳定身份和修改历史；停用不会删除历史引用。" onClose={requestClose} onSubmit={() => send()} footer={<><Button variant="secondary" disabled={blocked} onClick={requestClose}>取消</Button>{draft?.resourceId && <Button variant="text" disabled={blocked} onClick={() => { if (dirty && !window.confirm("重新读取会放弃本次未保存输入，是否继续？")) return; void edit({ id: draft.resourceId! }); }}>读取最新版本</Button>}<Button type="submit" permission={spec.edit} disabled={blocked}>保存{spec.title}</Button></>}>
      {draft && <fieldset disabled={blocked || !mayEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {draft.kind !== "sites" && <FormItem label="状态"><select className="qc-control" value={draft.data.enabled ? "enabled" : "disabled"} onChange={event => updateDraft({ ...draft, data: { ...draft.data, enabled: event.target.value === "enabled" } } as Draft)}><option value="enabled">启用</option><option value="disabled">停用</option></select></FormItem>}
        {draft.kind === "calendars" && <ProductionCalendarFields value={draft.data} createExceptionId={() => crypto.randomUUID()} onChange={data => updateDraft({ ...draft, data: { ...draft.data, ...data } })} />}
        {draft.kind === "sites" && <ProductionSiteFields value={draft.data} onChange={data => updateDraft({ ...draft, data })} calendarControl={<ServerProductionReferencePicker kind="calendars" value={draft.data.productionCalendarId} isCurrent={isCurrent} onChange={id => updateDraft({ ...draft, data: { ...draft.data, productionCalendarId: id } })} />} />}
        {draft.kind === "groups" && <ProductionGroupFields value={draft.data} onChange={data => updateDraft({ ...draft, data: { ...draft.data, ...data } })} siteControl={<ServerProductionReferencePicker kind="sites" value={draft.data.productionSiteId} isCurrent={isCurrent} onChange={id => updateDraft({ ...draft, data: { ...draft.data, productionSiteId: id } })} />} />}
        {draft.kind === "factories" && <OutsourceFactoryFields value={draft.data} onChange={data => updateDraft({ ...draft, data: { ...draft.data, ...data } })} />}
      </fieldset>}
      {state?.error && <p role="alert" className="qc-form-alert">{state.error}</p>}{state?.pending && <><p>{pendingMessage}</p><Button variant="secondary" disabled={state.busy} onClick={() => void check()}>核对原请求</Button>{state.receipt === "unknown" && <Button permission={spec.edit} disabled={state.busy} onClick={() => void send(state.pending!)}>重试原请求</Button>}</>}
    </Drawer>
    <UnsavedDraftDialog open={state?.confirmClose ?? false} entityLabel={`${spec.title}资料`} onKeepEditing={() => change(value => ({ ...value, confirmClose: false }))} onDiscard={closeDraft} />
  </PermissionAuthorityProvider>;
}

export function ServerProductionResourceSettingsPage({ kind }: { kind: ProductionResourceType }) {
  return <AppShell title={specifications[kind].title} identityMode="server"><PageContainer><ResourceWorkspace kind={kind} /></PageContainer></AppShell>;
}
export function ServerProductionInfrastructureSettingsPage() {
  const calendarEditor = useRef<ResourceEditorActions>(null), [referenceRevision, refreshReferences] = useState(0);
  return <AppShell title="生产与运输" identityMode="server"><PageContainer>
    <PageHeader eyebrow="PRODUCTION & TRANSPORT" title="生产与运输" description="维护生产地点和工作日历；运输资料尚未开放。" />
    <ResourceWorkspace kind="sites" infrastructure referenceRevision={referenceRevision} onEditCalendar={id => { void calendarEditor.current?.edit({ id }); }} />
    <ResourceWorkspace kind="calendars" infrastructure editorRef={calendarEditor} onApplied={() => refreshReferences(value => value + 1)} />
    <section className="qc-infrastructure-business-section"><header><div><span>02</span><div><h2>物料从哪里发</h2><p>集货仓尚未开放。</p></div></div></header></section>
    <section className="qc-infrastructure-business-section"><header><div><span>03</span><div><h2>仓库到工厂怎么走</h2><p>运输方案尚未开放。</p></div></div></header></section>
  </PageContainer></AppShell>;
}

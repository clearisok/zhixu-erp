"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppShell, Button, Card, Drawer, EmptyState, FloatingMenu, FormItem, MasterDetail, Modal, PageContainer, PageHeader, SearchField, Toolbar, UnsavedDraftDialog } from "@/components/foundation";
import { isDraftChanged } from "@/components/foundation/draft-state";
import { useProtectedRouter, useServerNavigationProtection } from "@/components/foundation/server-navigation-protection";
import { PermissionAuthorityProvider } from "@/features/permissions/components/permission-authority";
import { useServerSession } from "@/features/server-auth";
import { canonicalPlanJson } from "@/server/production-scheduling/canonical-json";
import { acknowledgeProductionPlanPending, readProductionPlanPending, saveProductionPlanPending } from "../server/production-plan-outbox";
import { editPlanForm, newPlanForm, planFormIntent, type PlanForm } from "../server/production-plan-form";
import { canonicalProductionPlanCommand, productionPlanClient, ProductionPlanError, type Assignment, type PlanCommand, type PlanGroupDirectory, type PlanHistoryRead, type PlanIntent, type PlanOrderDirectory, type PlanOrderRead, type PlanOrderSummary, type PlanPreview, type PlanQueueRead, type PlanResources, type VerifiedPlanOutcome } from "../server/production-plan-client";
import { ServerProductionPlanFields } from "./server-production-plan-fields";

type Lease = { session: ReturnType<typeof useServerSession> };
type Editor = { order: PlanOrderRead; form: PlanForm; initial: PlanForm };
type Action = { kind: "cancel"; order: PlanOrderRead; row: Assignment; reason: string }
  | { kind: "replan"; queue: PlanQueueRead; anchorDate: string; orderedIds: string[] | null };
type State = { lease: Lease; view: "groups" | "orders" | "warnings"; search: string; offset: number; allocation: "remaining" | "unassigned" | "partial" | "all";
  revision: number; groups?: PlanGroupDirectory; orders?: PlanOrderDirectory; queue?: PlanQueueRead; selectedGroupId: string;
  error: string; listError: string; notice: string; busy: boolean; pending: PlanCommand | null; corrupt: boolean; receipt: "unchecked" | "pending" | "unknown";
  editor: Editor | null; action: Action | null; preview: PlanPreview | null; confirmClose: boolean; history: PlanHistoryRead | null; detail: PlanOrderRead | null };
const safeError = (error: unknown) => error instanceof ProductionPlanError ? error.message : "操作未能安全完成，请重新读取或核对原请求。";
const resourceName = (resources: PlanResources, hash: string) => { const item = resources[hash]; return item?.executionType === "internal" ? item.group.name : item?.factory.name ?? "资料待核对"; };
const title = (order?: PlanOrderSummary) => order?.factoryStyleNo || order?.styleNo || order?.orderNo || "订单资料待核对";
const warningText: Record<string, string> = { protected_overlap: "固定日期与前条计划重叠", protected_end_missing: "受保护计划缺少结束日期", queue_replan_available: "后续队列可另行预览重排", historical_color_needs_review: "历史颜色需要核对", order_over_assigned: "排单总量超过当前订单需求", color_over_assigned: "此颜色排单量超过来源需求" };

function Workspace() {
  const session = useServerSession(), router = useProtectedRouter();
  const lease = useMemo(() => ({ session }), [session]), committed = useRef<Lease | null>(null), busyOwner = useRef<Lease | null>(null);
  // A manual retry requires a successful unknown lookup for these exact bytes in this session.
  const retryProof = useRef<{ lease: Lease; command: string } | null>(null);
  useLayoutEffect(() => { committed.current = lease; return () => { committed.current = null; }; }, [lease]);
  const isCurrent = useCallback(() => committed.current === lease && session.status === "authenticated", [lease, session]);
  const [owned, setOwned] = useState<State>(); const state = owned?.lease === lease ? owned : undefined;
  const change = useCallback((update: (value: State) => State) => { if (isCurrent()) setOwned(previous => previous?.lease === lease ? update(previous) : previous); }, [isCurrent, lease]);
  const fail = useCallback((error: unknown, list = false) => { if (!isCurrent()) return; if (error instanceof ProductionPlanError && error.status === 401) session.invalidate();
    else change(value => ({ ...value, [list ? "listError" : "error"]: safeError(error) })); }, [change, isCurrent, session]);
  const dirty = Boolean(state?.editor && isDraftChanged(state.editor.initial, state.editor.form) || state?.action?.kind === "cancel" && state.action.reason
    || state?.action?.kind === "replan" && (state.action.orderedIds || state.action.anchorDate !== (state.action.queue.assignments[0]?.plannedStartDate ?? "")));
  const blocked = Boolean(state?.busy || state?.pending || state?.corrupt);
  useServerNavigationProtection({ dirty, blocked, message: "有排单结果待核对，请先核对原请求。" });
  useEffect(() => {
    let active = true; void Promise.resolve().then(() => {
      if (!active || !isCurrent() || !session.user) return;
      let pending: PlanCommand | null = null, corrupt = false; retryProof.current = null;
      try { pending = readProductionPlanPending(window.sessionStorage, { userId: session.user.id }); } catch { corrupt = true; }
      if (!active || !isCurrent()) return;
      setOwned({ lease, view: "groups", search: "", offset: 0, allocation: "remaining", revision: 0, selectedGroupId: "", error: "", listError: "", notice: "", busy: false,
        pending, corrupt, receipt: "unchecked", editor: null, action: null, preview: null, confirmClose: false, history: null, detail: null });
    }); return () => { active = false; };
  }, [isCurrent, lease, session]);
  const view = state?.view, search = state?.search, offset = state?.offset, allocation = state?.allocation, revision = state?.revision;
  useEffect(() => {
    if (!view || !isCurrent() || search === undefined || offset === undefined || !allocation) return;
    let active = true;
    if (view === "groups") void productionPlanClient.groups({ search, offset, limit: 20, status: "relevant" }, isCurrent).then(groups => {
      if (active && isCurrent()) change(value => ({ ...value, groups, listError: "", selectedGroupId: groups.items.some(item => item.id === value.selectedGroupId) ? value.selectedGroupId : groups.items[0]?.id ?? "" }));
    }).catch(error => { if (active) fail(error, true); });
    else void productionPlanClient.orders({ search, offset, limit: 20, allocation: view === "warnings" ? "overassigned" : allocation }, isCurrent).then(orders => {
      if (active && isCurrent()) change(value => ({ ...value, orders, listError: "" }));
    }).catch(error => { if (active) fail(error, true); });
    return () => { active = false; };
  }, [view, search, offset, allocation, revision, isCurrent, change, fail]);
  const groupId = state?.selectedGroupId;
  useEffect(() => {
    if (!groupId || view !== "groups" || !isCurrent()) return;
    let active = true; void productionPlanClient.queue(groupId, isCurrent).then(queue => { if (active && isCurrent()) change(value => ({ ...value, queue, error: "" })); }).catch(error => { if (active) fail(error); });
    return () => { active = false; };
  }, [groupId, view, revision, isCurrent, change, fail]);
  const refresh = () => change(value => ({ ...value, revision: value.revision + 1, groups: undefined, orders: undefined, queue: undefined, listError: "" }));
  const start = () => { if (!state || busyOwner.current === lease || !isCurrent()) return false; busyOwner.current = lease; change(value => ({ ...value, busy: true, error: "", notice: "" })); return true; };
  const finish = () => { if (busyOwner.current === lease) { busyOwner.current = null; change(value => ({ ...value, busy: false })); } };
  async function openEditor(orderId: string, assignmentId?: string, cancel = false, retain = false) {
    if (blocked || !start()) return;
    try {
      const order = await productionPlanClient.order(orderId, isCurrent); if (!isCurrent()) return;
      const row = assignmentId ? order.assignments.find(item => item.id === assignmentId && item.status === "planned") : undefined;
      if (assignmentId && !row) throw new ProductionPlanError(409, "production_assignment_version_conflict");
      if (cancel && !order.canEdit) throw new ProductionPlanError(409, "production_order_frozen");
      if (cancel && row) change(value => ({ ...value, action: { kind: "cancel", order, row, reason: "" }, editor: null, preview: null, detail: null }));
      else {
        const initial = row ? editPlanForm(order, row) : newPlanForm(order);
        change(value => ({ ...value, editor: { order, initial, form: retain && value.editor?.form.orderId === orderId ? { ...value.editor.form, expectedPlanVersion: order.order.planVersion, expectedVersion: row?.version ?? 0 } : initial }, action: null, preview: null,
          detail: null, notice: retain ? "订单版本已重新读取，输入已保留，请重新预览差异。" : "" }));
      }
    } catch (error) { fail(error); } finally { finish(); }
  }
  async function preview(intent: PlanIntent) {
    if (blocked || !start()) return;
    try { const result = await productionPlanClient.preview(intent, isCurrent); if (isCurrent()) change(value => ({ ...value, preview: result })); }
    catch (error) { fail(error); } finally { finish(); }
  }
  const previewEditor = () => { if (!state?.editor) return; try { void preview(planFormIntent(state.editor.form)); } catch (error) { fail(error); } };
  const close = () => { if (!state || state.busy || blocked) return; if (dirty) change(value => ({ ...value, confirmClose: true })); else change(value => ({ ...value, editor: null, action: null, preview: null, error: "" })); };
  function applied(command: PlanCommand, result: VerifiedPlanOutcome) {
    if (!isCurrent() || !session.user) return;
    acknowledgeProductionPlanPending(window.sessionStorage, { userId: session.user.id }, command);
    change(value => ({ ...value, pending: null, corrupt: false, receipt: "unchecked", preview: null, revision: value.revision + 1, groups: undefined, orders: undefined, queue: undefined,
      ...(result.status === "applied" ? { editor: null, action: null, error: "", notice: result.changed ? "排单已保存。" : "计划没有变化。" }
        : { error: new ProductionPlanError(result.error.status, result.error.code).message, notice: "本次未应用，请重新读取后再预览。" }) }));
  }
  async function send(command?: PlanCommand) {
    if (!state || !session.user || state.corrupt || (!command && (state.pending || !state.preview))) return;
    if (command && (state.receipt !== "unknown" || retryProof.current?.lease !== lease
      || retryProof.current.command !== canonicalPlanJson(command) || !state.pending || canonicalPlanJson(state.pending) !== canonicalPlanJson(command))) return;
    if (!start()) return;
    try {
      let cached: PlanCommand | null;
      try { cached = readProductionPlanPending(window.sessionStorage, { userId: session.user.id }); }
      catch { change(value => ({ ...value, corrupt: true, error: "本机待核对记录无法安全读取，本次没有发送。" })); return; }
      if (command ? !cached || canonicalPlanJson(cached) !== canonicalPlanJson(command) : cached !== null) {
        change(value => ({ ...value, corrupt: true, error: "本机待核对记录已变化，已暂停保存，请重新读取后核对。" })); return;
      }
      retryProof.current = null;
      const input = command ?? canonicalProductionPlanCommand({ requestId: crypto.randomUUID(), intent: state.preview?.intent, previewHash: state.preview?.previewHash });
      try { saveProductionPlanPending(window.sessionStorage, { userId: session.user.id }, input); }
      catch { change(value => ({ ...value, corrupt: true, error: "待核对记录无法安全保存，本次没有发送。请先核对本机记录。" })); return; }
      change(value => ({ ...value, pending: input, receipt: "unchecked" }));
      const result = await productionPlanClient.execute(input, isCurrent); if (isCurrent()) applied(input, result);
    } catch (error) { fail(error); } finally { finish(); }
  }
  async function check() {
    if (!state?.pending || !start()) return;
    const command = state.pending; retryProof.current = null;
    change(value => ({ ...value, receipt: "unchecked" }));
    try { const result = await productionPlanClient.receipt(command, isCurrent); if (!isCurrent() || !session.user) return;
      const cached = readProductionPlanPending(window.sessionStorage, { userId: session.user.id });
      if (!cached || canonicalPlanJson(cached) !== canonicalPlanJson(command)) {
        change(value => ({ ...value, corrupt: true, error: "本机待核对记录已变化，无法确认原操作。" })); return;
      }
      if (result.state === "known") applied(command, result.result);
      else {
        if (result.state === "unknown") retryProof.current = { lease, command: canonicalPlanJson(command) };
        change(value => ({ ...value, receipt: result.state, notice: result.state === "pending" ? "原操作仍在处理中，请稍后再核对。" : "暂未找到原操作回执。可继续核对，或明确重试原编号与原内容。" }));
      }
    } catch (error) { fail(error); } finally { finish(); }
  }
  async function history(row: Assignment, next = false) {
    if (!start()) return;
    try { const previous = next ? state?.history : null;
      const result = await productionPlanClient.history(row.id, previous?.nextOffset ?? 0, previous?.asOfVersion ?? null, isCurrent);
      if (isCurrent()) change(value => ({ ...value, detail: null, history: previous ? { ...result, resources: { ...previous.resources, ...result.resources }, history: [...previous.history, ...result.history] } : result }));
    } catch (error) { fail(error); } finally { finish(); }
  }
  async function openOrderPlans(orderId: string) {
    if (!start()) return;
    try { const detail = await productionPlanClient.order(orderId, isCurrent); if (isCurrent()) change(value => ({ ...value, detail, history: null })); }
    catch (error) { fail(error); } finally { finish(); }
  }
  const queue = state?.queue?.groupId === groupId ? state?.queue : undefined;
  const canReplan = Boolean(queue?.assignments.length && session.hasPermission("schedule.edit") && queue.group.enabled && Object.values(queue.ordersById).every(item => item.eligible));
  const replan = (orderedIds: string[] | null = null) => { if (queue && !blocked) change(value => ({ ...value, action: { kind: "replan", queue, anchorDate: queue.assignments[0]?.plannedStartDate ?? "", orderedIds }, editor: null, preview: null, error: "" })); };
  const move = (index: number, direction: -1 | 1) => { if (!queue) return; const ids = queue.assignments.map(row => row.id); [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]; replan(ids); };
  const canEditor = Boolean(state?.editor && (state.editor.form.assignmentId ? state.editor.order.canEdit && session.hasPermission("schedule.edit") : state.editor.order.canCreate && session.hasPermission("schedule.create")));
  const canRetry = Boolean(state?.pending && state.receipt === "unknown" && !state.corrupt
    && session.hasPermission(state.pending.intent.action === "create" ? "schedule.create" : "schedule.edit"));
  const directory = state?.view === "groups" ? state.groups : state?.orders;
  const chooseView = (value: State["view"]) => change(current => ({ ...current, view: value, offset: 0, search: "", groups: undefined, orders: undefined, listError: "" }));
  const page = (next: number) => change(value => ({ ...value, offset: next, groups: undefined, orders: undefined, listError: "" }));
  const orderLink = (id: string) => router.push(`/order-center/server-detail?id=${encodeURIComponent(id)}`);

  return <PermissionAuthorityProvider can={session.hasPermission}>
    <PageContainer className="ps-scheduling-page">
      <PageHeader eyebrow="PRODUCTION SCHEDULING" title="生产排单" count={directory ? `${directory.total} ${state?.view === "groups" ? "个生产组" : "张订单"}` : undefined}
        description="按生产组查看计划队列，再处理未排订单。" secondaryActions={<Button variant="secondary" onClick={refresh}>重新读取</Button>} />
      {state?.notice && <p role="status">{state.notice}</p>}{state?.error && <p role="alert">{state.error}</p>}
      {(state?.pending || state?.corrupt) && <Card><p role="alert">{state.corrupt ? "本机待核对记录无法安全读取，已暂停新增保存。" : "有一条排单操作结果待核对；原请求已保留。"}</p>
        {state.pending && <Button variant="secondary" disabled={state.busy} onClick={() => void check()}>核对原请求</Button>}
        {canRetry && <Button disabled={state.busy} onClick={() => void send(state.pending!)}>重试原请求</Button>}
      </Card>}
      <Toolbar search={<SearchField label="搜索排单" value={state?.search ?? ""} onChange={search => change(value => ({ ...value, search, offset: 0, groups: undefined, orders: undefined, listError: "" }))}
        placeholder={state?.view === "groups" ? "搜索生产组、地点或日历，空格为且" : "搜索订单、款号或客户，空格为且"} />}
        actions={<div className="ps-view-tabs">{([["groups", "生产组"], ["orders", "未排订单"], ["warnings", "计划异常"]] as const).map(([key, label]) => <button key={key} className={state?.view === key ? "active" : ""} onClick={() => chooseView(key)}>{label}</button>)}</div>} />
      {state?.listError && <p role="alert">{state.listError}</p>}
      {state?.view === "groups" && <><div className="ps-compact-group-picker"><label htmlFor="server-plan-group">当前生产组</label><select id="server-plan-group" className="qc-control" value={groupId ?? ""} onChange={event => change(value => ({ ...value, selectedGroupId: event.target.value, queue: undefined }))}>
        <option value="">请选择</option>{state.groups?.items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.assignmentCount}条计划{item.enabled ? "" : "（已停用）"}</option>)}</select></div>
        <MasterDetail className="ps-scheduling-master-detail" selected={Boolean(groupId)} masterLabel="生产组总览" detailLabel="计划队列"
          master={<nav className="ps-group-master ps-group-overview ps-group-nav" aria-label="生产组总览">{state.groups?.items.map(item => <button type="button" key={item.id} className={item.id === groupId ? "active" : ""} onClick={() => change(value => ({ ...value, selectedGroupId: item.id, queue: undefined }))}>
            <header><strong>{item.name}</strong>{!item.enabled && <em>已停用</em>}</header><span>{item.headOrderId ? `队首 ${title(state.groups?.ordersById[item.headOrderId])}` : "暂无排单"}</span><b className="ps-group-pending">计划 {item.assignmentCount} 条 · {item.plannedQuantity}</b><small>队尾 {item.plannedThroughDate ?? "—"}</small></button>)}
            {state.groups && !state.groups.items.length && <EmptyState compact title="暂无生产组" description="请先在基础设置维护生产组和工作日历。" />}{!state.groups && !state.listError && <p role="status">正在读取生产组…</p>}</nav>}
          detail={queue ? <Card className="ps-group-queue"><header><div><strong>{queue.group.name} · 计划队列</strong><span>计划 {queue.assignments.length} 条 · 实际完成尚未纳入</span></div><Button variant="secondary" disabled={!canReplan || blocked || state.busy} onClick={() => replan()}>预览重排</Button></header>
            <div className="ps-queue-table-wrap"><table className="ps-queue-table"><thead><tr><th>顺序</th><th>款号 / 订单</th><th>数量</th><th>生产窗口</th><th>日期方式</th><th>采用资源</th><th className="ps-sticky-action">操作</th></tr></thead>
              <tbody>{queue.assignments.map((row, index) => <tr key={row.id}><td data-label="顺序">{index + 1}</td><td data-label="款号 / 订单"><strong>{title(queue.ordersById[row.orderId])}</strong><small>{queue.ordersById[row.orderId]?.orderNo}</small>{!queue.ordersById[row.orderId]?.eligible && <small>历史 / 已冻结，仅查看</small>}</td><td data-label="数量">{row.plannedQuantity}{row.colorNameSnapshot && <small>{row.colorNameSnapshot}</small>}</td>
                <td data-label="生产窗口">{row.plannedStartDate} → {row.plannedEndDate}</td><td data-label="日期方式">{row.dateMode === "auto_queue" ? "自动队列" : "手工固定"}</td><td data-label="采用资源">{resourceName(queue.resources, row.resourceSnapshotHash)}</td><td data-label="操作" className="ps-sticky-action"><div className="ps-row-actions"><FloatingMenu label={`更多排单：${title(queue.ordersById[row.orderId])} · ${index + 1}`} menuClassName="ps-row-more-menu">
                  <Button variant="text" size="compact" onClick={() => orderLink(row.orderId)}>查看订单</Button><Button variant="text" size="compact" disabled={state.busy} onClick={() => void openOrderPlans(row.orderId)}>查看订单排单</Button><Button variant="text" size="compact" disabled={state.busy} onClick={() => void history(row)}>查看历史</Button>
                  {session.hasPermission("schedule.edit") && queue.ordersById[row.orderId]?.eligible && <><Button variant="text" size="compact" disabled={blocked} onClick={() => void openEditor(row.orderId, row.id)}>编辑排单</Button><Button variant="text" size="compact" disabled={blocked} onClick={() => void openEditor(row.orderId, row.id, true)}>取消排单</Button></>}
                  <Button variant="text" size="compact" disabled={!canReplan || blocked || index === 0} onClick={() => move(index, -1)}>上移</Button><Button variant="text" size="compact" disabled={!canReplan || blocked || index === queue.assignments.length - 1} onClick={() => move(index, 1)}>下移</Button></FloatingMenu></div></td></tr>)}</tbody></table>
            </div>{!queue.assignments.length && <p className="ps-empty">这个生产组暂无计划。请从未排订单选择订单排单。</p>}</Card> : <Card>{state.groups && !state.groups.items.length ? <EmptyState title="暂无生产组" description="请先在基础设置维护生产组和工作日历。" /> : <p role="status">{groupId ? "正在读取计划队列…" : "请选择生产组。"}</p>}</Card>} /></>}
      {state && state.view !== "groups" && <>{state.view === "orders" && <div className="ps-pool-toolbar"><div className="ps-view-tabs">{([["remaining", "全部未排"], ["unassigned", "完全未排"], ["partial", "部分排单"], ["all", "全部订单"]] as const).map(([key, label]) => <button key={key} className={state.allocation === key ? "active" : ""} onClick={() => change(value => ({ ...value, allocation: key, offset: 0, orders: undefined }))}>{label}</button>)}</div></div>}
        {state.view === "warnings" && <p>这里只核对当前有效订单的超排数量；实际完成、物料与物流风险尚未纳入。</p>}
        <Card className="ps-unscheduled-pool"><div className="ps-pool-row head"><span>款号 / 客户</span><span>订单数量</span><span>已排</span><span>{state.view === "warnings" ? "超排" : "可排"}</span><span>交期</span><span>计划状态</span><span>操作</span></div>
          {state.orders?.items.map(item => <div className="ps-pool-row" key={item.id}><span><strong>{title(item)}</strong><small>{item.customerName} · {item.orderNo}</small></span><span>{item.quantity ?? "待核实"}</span><span>{item.plannedQuantity}</span><span><strong>{(state.view === "warnings" ? item.overassignedQuantity : item.remainingQuantity) ?? "待核实"}</strong></span><span>{item.deliveryDate ?? "—"}</span><span>{{ unassigned: "完全未排", partial: "部分排单", allocated: "已排足", overassigned: "超排", unknown: "需求待核实" }[item.allocationState]}</span><span><Button variant="text" size="compact" disabled={state.busy} onClick={() => void openOrderPlans(item.id)}>查看排单</Button>{session.hasPermission("schedule.create") && <Button size="compact" disabled={blocked} onClick={() => void openEditor(item.id)}>排单</Button>}</span></div>)}
          {state.orders && !state.orders.items.length && <p className="ps-empty">当前筛选下没有订单。</p>}{!state.orders && !state.listError && <p role="status">正在读取订单…</p>}</Card></>}
      <div className="qc-master-actions"><Button variant="secondary" disabled={!directory || !state?.offset} onClick={() => page(Math.max(0, (state?.offset ?? 0) - 20))}>上一页</Button><span>{directory ? `${directory.offset + (directory.items.length ? 1 : 0)}–${directory.offset + directory.items.length} / ${directory.total}` : "正在读取…"}</span><Button variant="secondary" disabled={!directory?.hasMore} onClick={() => page((state?.offset ?? 0) + 20)}>下一页</Button></div>
      <Modal open={Boolean(state?.editor && !state.preview)} title={state?.editor?.form.assignmentId ? "编辑排单" : "直接排单"} description="平均日产与工作日按最后编辑的字段计算；数量保持精确值。" onClose={close} onSubmit={previewEditor}
        footer={<><Button variant="secondary" disabled={state?.busy || blocked} onClick={close}>取消</Button><Button variant="secondary" disabled={state?.busy || blocked} onClick={() => { const form = state?.editor?.form; if (form) void openEditor(form.orderId, form.assignmentId ?? undefined, false, true); }}>重新读取订单</Button><Button type="submit" disabled={!canEditor || state?.busy || blocked}>预览排单</Button></>}>
        {state?.editor && <fieldset disabled={state.busy || blocked}><ServerProductionPlanFields form={state.editor.form} order={state.editor.order} isCurrent={isCurrent} update={patch => change(value => value.editor ? { ...value, editor: { ...value.editor, form: { ...value.editor.form, ...patch } }, preview: null, error: "" } : value)} /></fieldset>}{state?.error && <p role="alert">{state.error}</p>}
      </Modal>
      <Modal open={Boolean(state?.action && !state.preview)} title={state?.action?.kind === "cancel" ? "取消排单" : "预览队列重排"} onClose={close} onSubmit={() => {
        if (state?.action?.kind === "cancel") { const action = state.action; void preview({ action: "cancel", orderId: action.row.orderId, assignmentId: action.row.id, expectedVersion: action.row.version, expectedPlanVersion: action.order.order.planVersion, reason: action.reason }); }
        else if (state?.action?.kind === "replan") { const action = state.action; void preview({ action: "replan", groupId: action.queue.groupId, expectedQueueVersion: action.queue.version, anchorDate: action.anchorDate, orderedAssignmentIds: action.orderedIds }); }
      }} footer={<><Button variant="secondary" disabled={state?.busy || blocked} onClick={close}>返回</Button><Button type="submit" disabled={state?.busy || blocked}>查看变更预览</Button></>}>
        <fieldset disabled={state?.busy || blocked}>{state?.action?.kind === "cancel" ? <><p>{title(state.action.order.summary)} · {state.action.row.plannedQuantity} · {state.action.row.plannedStartDate} → {state.action.row.plannedEndDate}</p><FormItem label="取消说明"><textarea aria-label="取消排单说明" className="qc-control" value={state.action.reason} onChange={event => change(value => value.action?.kind === "cancel" ? { ...value, action: { ...value.action, reason: event.target.value } } : value)} /></FormItem><p>取消保留原记录和历史，不自动移动后续队列。</p></>
          : state?.action?.kind === "replan" ? <><FormItem label="队列起始日期" required><input type="date" className="qc-control" aria-label="队列起始日期" value={state.action.anchorDate} onChange={event => change(value => value.action?.kind === "replan" ? { ...value, action: { ...value.action, anchorDate: event.target.value } } : value)} /></FormItem><p>重新核对整组计划与最新日历；固定日期不会自动移动。已有首条日期时沿用原排期规则。</p>{state.action.orderedIds && <ol>{state.action.orderedIds.map(id => { const row = state.action?.kind === "replan" ? state.action.queue.assignments.find(item => item.id === id) : null; return <li key={id}>{row ? title(state.action?.kind === "replan" ? state.action.queue.ordersById[row.orderId] : undefined) : "计划资料待核对"}</li>; })}</ol>}</> : null}
        </fieldset>{state?.error && <p role="alert">{state.error}</p>}
      </Modal>
      <Modal open={Boolean(state?.preview)} title="确认排单变更" description="确认后保存这一份预览；资料变化时需要重新预览。" onClose={() => { if (!state?.busy && !blocked) change(value => ({ ...value, preview: null })); }}
        footer={<><Button variant="secondary" disabled={state?.busy || blocked} onClick={() => change(value => ({ ...value, preview: null }))}>返回修改</Button><Button disabled={state?.busy || blocked || !state?.preview?.changes.length} onClick={() => void send()}>确认保存</Button></>}>
        <div className="ps-queue-table-wrap"><table className="ps-queue-table"><thead><tr><th>款号 / 计划</th><th>修改前</th><th>修改后</th><th>采用资源</th></tr></thead><tbody>{state?.preview?.changes.map((item, index) => <tr key={item.after.id ?? index}><td>{title(state.action?.kind === "replan" ? state.action.queue.ordersById[item.after.orderId] : state.editor?.order.summary ?? (state.action?.kind === "cancel" ? state.action.order.summary : undefined))}<small>{item.after.colorNameSnapshot || "整单"}</small></td><td>{item.before ? `${item.before.plannedQuantity} · ${item.before.plannedStartDate} → ${item.before.plannedEndDate}` : "新增"}</td><td>{item.after.status === "cancelled" ? "取消" : `${item.after.plannedQuantity} · ${item.after.plannedStartDate} → ${item.after.plannedEndDate}`}</td><td>{resourceName(state.preview!.resources, item.after.resourceSnapshotHash)}</td></tr>)}</tbody></table></div>
        {state?.preview?.warnings.map((item, index) => <p key={index} role="status">{warningText[item.kind] || "计划需要核对"}</p>)}{state?.preview && !state.preview.changes.length && <p>计划没有变化，无需再次保存。</p>}{state?.error && <p role="alert">{state.error}</p>}
        {state?.pending && <Button variant="secondary" disabled={state.busy} onClick={() => void check()}>核对原请求</Button>}
        {canRetry && <Button disabled={state?.busy} onClick={() => void send(state!.pending!)}>重试原请求</Button>}
      </Modal>
      <Drawer open={Boolean(state?.detail)} title="订单排单" description="内部和外发计划均归属本订单；取消保留记录。" onClose={() => { if (!state?.busy) change(value => ({ ...value, detail: null })); }}>
        {state?.detail && <><h3>{title(state.detail.summary)}</h3><p>{state.detail.summary.orderNo} · 订单 {state.detail.summary.quantity ?? "待核实"} · 已排 {state.detail.summary.plannedQuantity}</p>
          <Button variant="secondary" disabled={state.busy} onClick={() => orderLink(state.detail!.order.id)}>查看订单</Button>
          {state.detail.canCreate && session.hasPermission("schedule.create") && <Button disabled={blocked} onClick={() => void openEditor(state.detail!.order.id)}>新增排单</Button>}
          {state.detail.assignments.map(row => <Card key={row.id}><strong>{row.executionType === "internal" ? "内部" : "外发"} · {resourceName(state.detail!.resources, row.resourceSnapshotHash)}</strong><p>{row.colorNameSnapshot || "整单"} · {row.plannedQuantity} · {row.status === "cancelled" ? "已取消" : "已计划"}</p><p>{row.plannedStartDate} → {row.plannedEndDate}</p>
            <Button variant="text" disabled={state.busy} onClick={() => void history(row)}>查看历史</Button>
            {row.status === "planned" && state.detail!.canEdit && session.hasPermission("schedule.edit") && <><Button variant="text" disabled={blocked} onClick={() => void openEditor(row.orderId, row.id)}>编辑排单</Button><Button variant="text" disabled={blocked} onClick={() => void openEditor(row.orderId, row.id, true)}>取消排单</Button></>}
          </Card>)}{!state.detail.assignments.length && <p>这张订单尚无排单。</p>}{state.error && <p role="alert">{state.error}</p>}</>}
      </Drawer>
      <Drawer open={Boolean(state?.history)} title="排单历史" description="按保存版本查看当时的计划和资源。" onClose={() => { if (!state?.busy) change(value => ({ ...value, history: null })); }}>
        {state?.history?.history.map(item => <Card key={item.version}><strong>版本 {item.version} · {item.snapshot.status === "cancelled" ? "已取消" : "已排单"}</strong><p>{new Date(item.recordedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p><p>{item.snapshot.plannedQuantity} · {item.snapshot.plannedStartDate} → {item.snapshot.plannedEndDate}</p><p>{resourceName(state.history!.resources, item.snapshot.resourceSnapshotHash)}</p>{item.reason && <p>{item.reason}</p>}{item.snapshot.remark && <p>{item.snapshot.remark}</p>}</Card>)}
        {state?.history?.hasMore && <Button variant="secondary" disabled={state.busy} onClick={() => void history(state.history!.assignment, true)}>加载更早记录</Button>}
      </Drawer>
      <UnsavedDraftDialog open={state?.confirmClose ?? false} entityLabel="排单" onKeepEditing={() => change(value => ({ ...value, confirmClose: false }))} onDiscard={() => change(value => ({ ...value, editor: null, action: null, preview: null, confirmClose: false, error: "" }))} />
    </PageContainer>
  </PermissionAuthorityProvider>;
}

export function ServerProductionSchedulingPage() {
  const session = useServerSession();
  return <AppShell title="生产排单">{session.status !== "authenticated" ? <PageContainer><p role="status">正在核对登录状态…</p></PageContainer>
    : !session.hasPermission("order.view") || !session.hasPermission("schedule.view") ? <PageContainer><EmptyState title="暂无生产排单权限" description="请联系管理员开通订单查看与排单查看权限。" /></PageContainer> : <Workspace />}</AppShell>;
}

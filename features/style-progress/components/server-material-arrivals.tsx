"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertBanner, Button, Card, Drawer, Modal, UnsavedDraftDialog } from "@/components/foundation";
import { useServerNavigationProtection } from "@/components/foundation/server-navigation-protection";
import { canonicalPlanJson } from "../../../server/production-scheduling/canonical-json";
import { arrivalQuantity, sumArrivalQuantities } from "../../../server/material-arrivals/contract";
import type { StoredArrivalPlan } from "../../../server/material-arrivals/store";
import { projectArrivalBatchLogistics } from "../model/server-arrival-logistics";
import { arrivalDraftBalance, arrivalDraftIntent, arrivalDrafts, arrivalEditorDemands, type ArrivalDraftBatch } from "../server/material-arrival-draft";
import { materialArrivalMessage, materialArrivalsClient, MaterialArrivalError, type ArrivalHistory, type ArrivalPreview, type ArrivalRead } from "../server/material-arrivals-client";
import type { MaterialArrivalsController } from "../server/use-material-arrivals";
import { MaterialReadCard, MaterialReadTable } from "./material-read-display";

const issues: Record<string, string> = { source_unavailable: "当前来源不可用", hub_changed: "集货仓已变化", demand_unavailable: "需求待核对", unit_changed: "单位已变化", overallocated: "已安排超过当前需求", context_updating: "到料依据更新中", context_unavailable: "到料依据暂不可用", context_changed: "到料依据已更新" };
const label = (d: { color: string; specification: string; materialCode: string }) => [d.color, d.specification].filter(Boolean).join(" / ") || d.materialCode || "未记录颜色规格";
const days = (value: number | null | undefined) => value === null || value === undefined ? "—" : value < 0 ? `晚 ${Math.abs(value)} 天` : `${value} 天`;
const qty = (value: string | null, unit: string | null) => value === null ? "未知" : value + (unit ? " " + unit : "（单位未知）");
function perUnit(quantities: { materialDemandId: string; quantity: string }[], demands: StoredArrivalPlan["data"]["demands"]) {
  const groups = new Map<string | null, string[]>();
  for (const allocation of quantities) { const unit = demands.find(d => d.id === allocation.materialDemandId)?.unit ?? null; groups.set(unit, [...(groups.get(unit) ?? []), allocation.quantity]); }
  return [...groups].map(([unit, values]) => qty(sumArrivalQuantities(values), unit)).join("；") || "未分配";
}
function SavedArrivalPlan({ plan, planIssues, scope }: { plan: StoredArrivalPlan; planIssues: string[]; scope: ArrivalRead }) {
  return <section className="sp-v4-material-body" aria-label={plan.canonicalIdentity.materialName + "到料计划"}>
    <div className="sp-v4-plan-summary"><span>预计到仓 <strong>{plan.data.batches.length ? `${plan.data.batches.length} 批` : "未安排"}</strong></span><span>保存时集货仓 <strong>{plan.data.tracking?.hubSnapshot?.name ?? "未设置"}</strong></span></div>
    {planIssues.length > 0 && <p role="status">{planIssues.map(i => issues[i]).join("；")}。原计划保留，请打开核对。</p>}
    {plan.data.batches.length > 0 && <MaterialReadTable headers={["预计到集货仓", "本批安排（分单位）", "推荐运输", "预计到厂", "距上线", "运输余量"]} rows={plan.data.batches.map(batch => {
      const projection = projectArrivalBatchLogistics(scope.logistics, batch.expectedArrivalAtHubDate, planIssues), rec = projection.recommendation;
      return [batch.expectedArrivalAtHubDate, perUnit(batch.allocations, plan.data.demands), rec?.recommendedMode?.name ?? projection.message, rec?.expectedArrivalDate ?? null, days(projection.daysToProduction), days(rec?.bufferDays)];
    })} />}
  </section>;
}
function ArrivalHistoryDrawer({ controller, canonicalKey, name, onClose }: { controller: MaterialArrivalsController; canonicalKey: string; name: string; onClose: () => void }) {
  const [state, setState] = useState<{ data: ArrivalHistory | null; error: string; loading: boolean }>({ data: null, error: "", loading: true });
  const lifecycle = useRef({ active: false, epoch: 0 }), sequence = useRef(0), abort = useRef<AbortController | null>(null);
  const requestOwner = useRef({ controller, canonicalKey });
  useLayoutEffect(() => {
    const life = lifecycle.current, readSequence = sequence, request = abort;
    life.active = true; life.epoch += 1;
    return () => { life.active = false; life.epoch += 1; readSequence.current += 1; request.current?.abort(); };
  }, []);
  const load = useCallback(async (offset: number, anchor: number | null) => {
    const { controller: controls, canonicalKey: materialKey } = requestOwner.current;
    const owner = controls.lease(), epoch = lifecycle.current.epoch, ticket = ++sequence.current;
    const current = () => owner() && lifecycle.current.active && lifecycle.current.epoch === epoch && sequence.current === ticket;
    abort.current?.abort(); abort.current = new AbortController(); setState(old => ({ ...old, loading: true, error: "" }));
    try { const data = await materialArrivalsClient.history(controls.read!.order.id, materialKey, offset, anchor, current, abort.current.signal); if (current()) setState({ data, error: "", loading: false }); }
    catch (error) { if (current()) { setState(old => ({ ...old, error: materialArrivalMessage(error), loading: false })); if (error instanceof MaterialArrivalError && error.status === 401) controls.session.invalidate(); } }
  }, []);
  useEffect(() => { void load(0, null); }, [load]);
  const data = state.data;
  return <Drawer open title={name + " · 到料历史"} description="保存时的日期、数量和集货仓分别保留，不用当前资料重写。" onClose={onClose}>
    {state.error && <AlertBanner tone="danger" title="历史暂不可用">{state.error}</AlertBanner>}
    {state.loading && <p role="status">读取历史…</p>}
    {data?.history.map(row => <section className="sp-event-variant" key={row.version} data-arrival-history-version={row.version}>
      <h3>{new Date(row.recordedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</h3>
      <p>集货仓：{row.snapshot.data.tracking?.hubSnapshot?.name ?? "未设置"} · {row.snapshot.data.batches.length ? `${row.snapshot.data.batches.length} 批` : "已清空计划"}</p>
      <MaterialReadTable headers={["预计到集货仓", "颜色 / 规格", "本批数量"]} rows={row.snapshot.data.batches.flatMap(batch => batch.allocations.map(allocation => {
        const demand = row.snapshot.data.demands.find(d => d.id === allocation.materialDemandId)!; return [batch.expectedArrivalAtHubDate, label(demand), qty(allocation.quantity, demand.unit)];
      }))} />
      <details><summary>记录信息</summary><p>计划版本 {row.version}</p><p>请求编号 {row.requestId}</p></details>
    </section>)}
    {data && !data.history.length && <p>暂无保存历史。</p>}
    <div className="qc-actions"><Button variant="secondary" disabled={state.loading || !data || data.offset === 0} onClick={() => data && void load(Math.max(0, data.offset - 25), data.asOfVersion)}>上一页</Button>
      <Button variant="secondary" disabled={state.loading || !data?.hasMore} onClick={() => data?.nextOffset !== null && data && void load(data.nextOffset!, data.asOfVersion)}>下一页</Button>
      <Button variant="text" disabled={state.loading} onClick={() => void load(0, null)}>读取最新历史</Button></div>
  </Drawer>;
}

function ArrivalPlanner({ controller, initial, canonicalKey, name, onClose, onHistory }: { controller: MaterialArrivalsController; initial: ArrivalRead; canonicalKey: string; name: string; onClose: () => void; onHistory: () => void }) {
  const [scope, setScope] = useState(initial), [drafts, setDrafts] = useState<ArrivalDraftBatch[]>(() => arrivalDrafts(initial.plans.find(x => x.plan.canonicalKey === canonicalKey)?.plan ?? null));
  const [preview, setPreview] = useState<ArrivalPreview | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [confirmClose, setConfirmClose] = useState(false);
  const lifecycle = useRef({ active: false, epoch: 0 }), sequence = useRef(0), draftRef = useRef(drafts), inFlight = useRef(false);
  useLayoutEffect(() => { draftRef.current = drafts; }, [drafts]);
  useLayoutEffect(() => { const life = lifecycle.current, readSequence = sequence; life.active = true; life.epoch += 1;
    return () => { life.active = false; life.epoch += 1; readSequence.current += 1; }; }, []);
  const saved = scope.plans.find(x => x.plan.canonicalKey === canonicalKey), rows = arrivalEditorDemands(scope, canonicalKey);
  const currentRead = controller.read;
  const contextChanged = useMemo(() => Boolean(currentRead && canonicalPlanJson({ source: currentRead.source, tracking: currentRead.tracking, logistics: currentRead.logistics }) !== canonicalPlanJson({ source: scope.source, tracking: scope.tracking, logistics: scope.logistics })), [currentRead, scope]);
  const dirty = canonicalPlanJson(drafts) !== canonicalPlanJson(arrivalDrafts(saved?.plan ?? null));
  const locked = busy || controller.busy || Boolean(controller.pending) || controller.pendingUnavailable;
  const editable = scope.canEdit && Boolean(controller.read?.canEdit) && controller.session.hasPermission("style_progress.edit") && !controller.error && !controller.loading && !contextChanged && !locked;
  useServerNavigationProtection({ dirty, blocked: busy || controller.busy });
  const currentLease = () => { const owner = controller.lease(), epoch = lifecycle.current.epoch, ticket = ++sequence.current; return () => owner() && lifecycle.current.active && lifecycle.current.epoch === epoch && sequence.current === ticket; };
  const update = (next: ArrivalDraftBatch[]) => { if (!editable || inFlight.current) return; setDrafts(next); setPreview(null); setError(""); };
  const close = () => { if (inFlight.current || busy || controller.busy) return; if (dirty && !controller.pending) setConfirmClose(true); else onClose(); };
  const readAgain = async () => { if (inFlight.current) return; inFlight.current = true; const current = currentLease(); setBusy(true); setError(""); setPreview(null);
    try { const read = await controller.reload(); if (current() && read) setScope(read); } catch (reason) { if (current()) setError(materialArrivalMessage(reason)); } finally { inFlight.current = false; if (current()) setBusy(false); } };
  const review = async () => {
    if (!editable || inFlight.current) return; inFlight.current = true;
    const current = currentLease(), snapshot = canonicalPlanJson(draftRef.current); setBusy(true); setError(""); setPreview(null);
    try { const intent = arrivalDraftIntent(scope.order.id, canonicalKey, saved?.plan.version ?? 0, draftRef.current);
      const fresh = await controller.reload(); if (!current() || !fresh) return;
      const result = await controller.preview(intent, fresh, current);
      if (current() && snapshot === canonicalPlanJson(draftRef.current)) { setScope(fresh); setPreview(result); } }
    catch (reason) { if (current()) setError(materialArrivalMessage(reason)); } finally { inFlight.current = false; if (current()) setBusy(false); }
  };
  const save = async () => {
    if (!preview || !editable || inFlight.current) return; inFlight.current = true; const current = currentLease(); setBusy(true); setError("");
    try { const intended = arrivalDraftIntent(scope.order.id, canonicalKey, saved?.plan.version ?? 0, draftRef.current); if (canonicalPlanJson(intended) !== canonicalPlanJson(preview.intent)) throw new MaterialArrivalError(409, "material_arrival_preview_changed");
      const result = await controller.submit(preview.intent, preview.previewHash); if (current()) { if (result.status === "applied") onClose(); else { setPreview(null); setError(materialArrivalMessage(new MaterialArrivalError(result.error.status, result.error.code))); } } }
    catch (reason) { if (current()) setError(materialArrivalMessage(reason)); } finally { inFlight.current = false; if (current()) setBusy(false); }
  };
  const readingIssue = controller.error ? "context_unavailable" : controller.loading ? "context_updating" : contextChanged ? "context_changed" : null;
  const logisticsIssues = [...(preview ? [] : saved?.issues ?? []), ...(readingIssue ? [readingIssue] : [])];
  return <><Modal open title="分批预计到料" eyebrow="EXPECTED ARRIVAL AT SUPPLYHUB" description={name + " · 每批填写预计到集货仓日期，允许部分未安排。"} className="sp-v4-planner" onClose={close}
    footer={<><Button variant="text" disabled={locked} onClick={() => void readAgain()}>重新读取</Button><Button variant="secondary" disabled={busy || controller.busy} onClick={close}>{editable ? "取消" : "关闭"}</Button>
      {preview ? <Button disabled={!editable} onClick={() => void save()}>确认保存</Button> : <Button disabled={!editable} onClick={() => void review()}>预览变更</Button>}</>}>
    {error && <AlertBanner tone="danger" title="尚未保存">{error}</AlertBanner>}
    {contextChanged && <AlertBanner tone="warning" title="到料依据已更新">请重新读取后继续；本次输入已保留，旧运输建议暂停显示。</AlertBanner>}
    {(controller.pending || controller.pendingUnavailable) && <p role="status">请在页面上方核对原请求，新的修改暂不提交。</p>}
    {!scope.canEdit && <p role="status">当前只能查看已保存计划。</p>}
    <p>当前集货仓：{scope.tracking?.hubSnapshot?.name ?? "未设置"}{saved?.plan.data.tracking?.hubSnapshot?.name && saved.plan.supplyHubId !== scope.tracking?.supplyHubId ? `；原计划保存在${saved.plan.data.tracking.hubSnapshot.name}。` : ""}</p>
    <p>来源交期仅作对照。运输建议是当前测算；排单或运输资料变化后请重新读取。</p>
    <div className="qc-actions">{saved && <Button variant="text" onClick={onHistory}>到料历史</Button>}{drafts.length > 0 && <Button variant="text" disabled={!editable} onClick={() => update([])}>清空本物料计划</Button>}</div>
    {preview && <section aria-label="到料变更预览"><h3>确认本次计划</h3><p>集货仓：{preview.before?.data.tracking?.hubSnapshot?.name ?? "未设置"} → {preview.after.tracking?.hubSnapshot?.name ?? "未设置"} · {preview.before?.data.batches.length ?? 0} 批 → {preview.after.batches.length} 批</p>
      <MaterialReadTable headers={["颜色 / 规格", "原到仓日期", "本次到仓日期", "原安排", "本次安排"]} rows={[...new Set([...(preview.before?.data.batches.map(b => b.id) ?? []), ...preview.after.batches.map(b => b.id)])].flatMap(batchId => {
        const before = preview.before?.data.batches.find(b => b.id === batchId), after = preview.after.batches.find(b => b.id === batchId);
        return [...new Set([...(before?.allocations.map(a => a.materialDemandId) ?? []), ...(after?.allocations.map(a => a.materialDemandId) ?? [])])].map(id => {
          const old = preview.before?.data.demands.find(d => d.id === id), next = preview.after.demands.find(d => d.id === id), oldAllocation = before?.allocations.find(a => a.materialDemandId === id), nextAllocation = after?.allocations.find(a => a.materialDemandId === id);
          return [label(next ?? old!), before?.expectedArrivalAtHubDate ?? null, after?.expectedArrivalAtHubDate ?? null, oldAllocation ? qty(oldAllocation.quantity, old?.unit ?? null) : null, nextAllocation ? qty(nextAllocation.quantity, next?.unit ?? null) : null];
        });
      })} /><p>{preview.changed ? "确认后保存新记录，历史保留。" : "本次没有计划变化。"}</p></section>}
    <div className="sp-v4-allocation-overview">{rows.map(({ demand, message }) => { const balance = arrivalDraftBalance(demand.requiredQuantity, demand.id, drafts); return <div key={demand.id}>
      <span>{label(demand)}</span><strong>已安排 {qty(balance.allocated, demand.unit)} / 需求 {qty(demand.requiredQuantity, demand.unit)}</strong><small>{balance.excess ? "超配 " + qty(balance.excess, demand.unit) : "未安排 " + qty(balance.remaining, demand.unit)}</small>
      <small>来源交期 {demand.sourceMaterialDueDate ?? "未提供"}</small>{message && <><small role="status">{message}</small><Button variant="text" disabled={!editable} onClick={() => update(drafts.map(b => ({ ...b, quantities: Object.fromEntries(Object.entries(b.quantities).filter(([id]) => id !== demand.id)) })).filter(b => Object.keys(b.quantities).length > 0))}>移除本需求旧分配</Button></>}
    </div>; })}</div>
    <div className="sp-v4-batch-list">{drafts.map((batch, index) => {
      const projection = projectArrivalBatchLogistics(scope.logistics, batch.expectedArrivalAtHubDate, logisticsIssues), rec = projection.recommendation;
      let invalidQuantity = false;
      const allocations = Object.entries(batch.quantities).flatMap(([materialDemandId, value]) => { if (value === "") return []; try { const quantity = arrivalQuantity(value, false); return quantity === "0" ? [] : [{ materialDemandId, quantity }]; } catch { invalidQuantity = true; return []; } });
      return <section className="sp-v4-batch" key={batch.id} data-arrival-batch={batch.id}><header><strong>批次 {index + 1}</strong><label>预计到集货仓<input type="date" value={batch.expectedArrivalAtHubDate} disabled={!editable} onChange={event => update(drafts.map(b => b.id === batch.id ? { ...b, expectedArrivalAtHubDate: event.target.value } : b))} /></label>
        <Button variant="text" disabled={!editable} onClick={() => update(drafts.filter(b => b.id !== batch.id))}>删除批次</Button></header>
        <div className="sp-v4-batch-demands">{rows.map(({ demand, editable: available }) => <label key={demand.id}><span>{label(demand)}</span><small>需求 {qty(demand.requiredQuantity, demand.unit)}</small>
          <input type="text" inputMode="decimal" aria-label={`批次${index + 1} ${label(demand)} 数量`} value={batch.quantities[demand.id] ?? ""} placeholder="本批数量" disabled={!editable || !available}
            onChange={event => update(drafts.map(b => b.id === batch.id ? { ...b, quantities: { ...b.quantities, [demand.id]: event.target.value } } : b))} /></label>)}</div>
        <div className="sp-v4-batch-logistics" data-risk={projection.bufferRisk}><span>推荐运输<strong>{rec?.recommendedMode?.name ?? projection.message}</strong></span><span>预计到厂<strong>{rec?.expectedArrivalDate ?? "—"}</strong></span><span>距上线<strong>{days(projection.daysToProduction)}</strong></span><span>运输余量<strong>{days(rec?.bufferDays)}</strong></span></div>
        <footer><span>本批安排（分单位）</span><strong>{invalidQuantity ? "数量待核对" : perUnit(allocations, rows.map(r => r.demand))}</strong></footer></section>;
    })}</div>
    {!drafts.length && <p>尚未安排批次；不会自动补齐需求。</p>}
    <Button variant="secondary" disabled={!editable || scope.source.status !== "ready" || !scope.tracking?.supplyHubId || drafts.length >= 100 || !rows.some(r => r.editable)}
      onClick={() => update([...drafts, { id: crypto.randomUUID(), expectedArrivalAtHubDate: "", quantities: {} }])}>＋ 增加批次</Button>
    <details><summary>运输测算依据</summary><p>计划开工：{scope.logistics.assignment?.plannedStartDate ?? "未排单"} · 采用地点：{scope.logistics.settings.productionSites[0]?.name ?? "未设置"} · 路线：{scope.logistics.settings.supplyRoutes[0]?.name ?? "未配置"}</p>
      <p>排单版本 {scope.logistics.assignment?.version ?? "—"} · 路线版本 {scope.logistics.versions.route ?? "—"}。测算不创建出运单或改变排期。</p></details>
  </Modal><UnsavedDraftDialog open={confirmClose} entityLabel="到料计划" onKeepEditing={() => setConfirmClose(false)} onDiscard={onClose} /></>;
}

export type ArrivalWorkspaceSlots = { actions: (canonicalKey: string, name: string) => ReactNode; summary: (canonicalKey: string) => ReactNode };
export function ServerMaterialArrivalWorkspace({ controller, currentKeys, children }: { controller: MaterialArrivalsController; currentKeys: readonly string[]; children: (slots: ArrivalWorkspaceSlots) => ReactNode }) {
  const router = useRouter(), [editor, setEditor] = useState<{ token: object; key: string; name: string; scope: ArrivalRead; id: number } | null>(null), [history, setHistory] = useState<{ token: object; key: string; name: string; id: number } | null>(null), count = useRef(0);
  const blocked = controller.busy || Boolean(controller.pending) || controller.pendingUnavailable;
  const permit = useServerNavigationProtection({ blocked, message: "请先核对分批到料的原请求。原记录已保留，不会自动重试。" });
  const open = (key: string, name: string) => { if (controller.read) setEditor({ token: controller.token, key, name, scope: controller.read, id: ++count.current }); };
  const actions = (key: string, name: string) => <Button variant="secondary" size="compact" disabled={!controller.read || controller.loading} onClick={() => open(key, name)}>{controller.read?.canEdit ? "分批到料" : "到料计划"}</Button>;
  const readingIssues = controller.error ? ["context_unavailable"] : controller.loading ? ["context_updating"] : [];
  const summary = (key: string) => { const row = controller.read?.plans.find(x => x.plan.canonicalKey === key); return row && controller.read ? <SavedArrivalPlan plan={row.plan} planIssues={[...row.issues, ...readingIssues]} scope={controller.read} /> : null; };
  const orphaned = controller.read?.plans.filter(x => !currentKeys.includes(x.plan.canonicalKey)) ?? [];
  return <>
    {controller.error && <AlertBanner tone="warning" title="到料计划暂未更新">{controller.error}</AlertBanner>}
    {controller.notice && <p role="status">{controller.notice}</p>}
    {(controller.pending || controller.pendingUnavailable) && <Card><h3>有到料请求待核对</h3><p>刷新或网络中断不会新建另一份计划。核对后再继续修改。</p><div className="qc-actions">
      <Button disabled={controller.busy || !controller.pending || !controller.session.hasPermission("style_progress.edit")} onClick={() => void controller.check()}>核对原请求</Button>
      {controller.pending && controller.verifiedUnknown === controller.pending.requestId && <Button variant="secondary" disabled={controller.busy} onClick={() => void controller.retry().catch(() => undefined)}>重发完全相同的原请求</Button>}
      {controller.pending && controller.pending.intent.orderId !== controller.read?.order.id && <Button variant="text" onClick={() => permit(() => router.push("/order-center/style-progress/detail?orderId=" + controller.pending!.intent.orderId))}>查看原订单</Button>}
    </div></Card>}
    {children({ actions, summary })}
    {orphaned.length > 0 && <section className="sp-v4-material-list" aria-label="已保存的到料计划">{orphaned.map(({ plan, issues: planIssues }) => <MaterialReadCard key={plan.id} materialKey={plan.canonicalKey}>
      <div className="sp-v4-material-head"><strong>{plan.canonicalIdentity.materialName} · 已保存计划</strong><div className="sp-material-card-actions">{actions(plan.canonicalKey, plan.canonicalIdentity.materialName)}</div></div>
      <SavedArrivalPlan plan={plan} planIssues={[...planIssues, ...readingIssues]} scope={controller.read!} />
    </MaterialReadCard>)}</section>}
    {editor?.token === controller.token && <ArrivalPlanner key={editor.id} controller={controller} initial={editor.scope} canonicalKey={editor.key} name={editor.name} onClose={() => setEditor(null)}
      onHistory={() => setHistory({ token: controller.token, key: editor.key, name: editor.name, id: ++count.current })} />}
    {history?.token === controller.token && controller.read && <ArrivalHistoryDrawer key={history.id} controller={controller} canonicalKey={history.key} name={history.name} onClose={() => setHistory(null)} />}
  </>;
}

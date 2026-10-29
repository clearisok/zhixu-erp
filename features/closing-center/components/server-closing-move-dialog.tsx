"use client";
import { useEffect, useRef, useState } from "react";
import { Button, FormItem, Modal } from "@/components/foundation";
import { useServerNavigationProtection } from "@/components/foundation/server-navigation-protection";
import { productionPlanClient, type PlanOrderRead } from "@/features/production-scheduling/server/production-plan-client";
import { createClosingMonthController, type ClosingMonthControlState } from "../server/closing-month-controller";
import type { ClosingMonthState } from "../server/closing-month-projection";
import type { ClosingYear } from "../server/closing-year-projection";
import { closingMoveReference } from "../server/closing-move-reference";
import { closingNumber, closingUiError, productionLabel, useClosingOwner } from "./closing-ui-owner";

type Row = ClosingYear["items"][number];
export function ServerClosingMoveDialog({ row, context, onClose, onChanged }: { row: Row; context: string; onClose: () => void; onChanged: () => void }) {
  const { session, owner, owns, currentOwner, client } = useClosingOwner(context + ":move:" + row.order.id);
  const controller = useRef<ReturnType<typeof createClosingMonthController> | null>(null);
  const callback = useRef(onChanged); useEffect(() => { callback.current = onChanged; }, [onChanged]);
  const [owned, setOwned] = useState<{ owner: object; plan: ClosingMonthState; production: PlanOrderRead }>();
  const [control, setControl] = useState<{ owner: object; value: ClosingMonthControlState }>();
  const [error, setError] = useState(""), [mode, setMode] = useState<"partial" | "whole">("partial"), [target, setTarget] = useState(""), [reason, setReason] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<{ owner: object; hash: string; rows?: ReturnType<typeof closingMoveReference>; error?: string; busy: boolean }>();
  const state = control?.owner === owner ? control.value : null, data = owned?.owner === owner ? owned : null;
  const referenceBusy = reference?.owner === owner && reference.busy;
  const blocked = Boolean(state?.busy || state?.pending || state?.pendingUnavailable || referenceBusy), done = state?.stage === "saved";
  const dirty = !done && Boolean(target || reason || Object.values(amounts).some(Boolean) || state?.preview);
  useServerNavigationProtection({ blocked, dirty, message: "调月结果尚未核实，请先核对原请求。" });
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || !owns() || !session.user) return;
      const c = createClosingMonthController({ userId: session.user.id, orderId: row.order.id, owner, currentOwner, permissions: () => session.permissions,
        storage: () => window.sessionStorage, client, onChange: value => { if (active && owns()) setControl({ owner, value }); },
        onUnauthorized: () => { if (active && owns()) session.invalidate(); }, onApplied: () => { if (active && owns()) callback.current(); } });
      controller.current = c; setControl({ owner, value: c.snapshot() });
      const lease = () => active && owns();
      void Promise.all([client.monthPlan(row.order.id, lease), productionPlanClient.order(row.order.id, lease)]).then(([plan, production]) => {
        if (lease()) { setOwned({ owner, plan, production }); setError(""); }
      }).catch(value => { if (lease()) { setError(closingUiError(value)); if ((value as { status?: number }).status === 401) session.invalidate(); } });
    });
    return () => { active = false; controller.current?.dispose(); controller.current = null; };
  }, [client, currentOwner, owner, owns, row.order.id, session]);
  const edit = (run: () => void) => { if (blocked || done) return; controller.current?.discardPreview(); setReference(undefined); setError(""); run(); };
  const close = () => { if (blocked) return; if (dirty && !window.confirm("放弃本次未保存的调月输入？")) return; controller.current?.discardPreview(); onClose(); };
  const plan = data?.plan.plan;
  const color = (id: string | null) => id === null ? "整单 / 未分颜色" : data?.production.order.colors.find(row => row.id === id)?.colorName ?? "历史颜色";
  const executor = (id: string | null) => { if (id === null) return "未分配";
    const saved = plan?.executorBasis.find(ref => ref.assignmentId === id), current = data?.production.assignments.find(row => row.id === id);
    const resource = saved && current?.resourceSnapshotHash === saved.resourceSnapshotHash ? data?.production.resources[saved.resourceSnapshotHash] : undefined;
    if (saved?.executionType === "internal") return resource?.executionType === "internal" && resource.group.id === saved.executorId ? "内制 · " + resource.group.name : "原内制执行方（历史资料）";
    if (saved?.executionType === "outsource") return resource?.executionType === "outsource" && resource.factory.id === saved.executorId ? "外发 · " + resource.factory.name : "原外发执行方（历史资料）";
    return "历史执行方（待核对）"; };
  const preview = async () => {
    if (!owns() || !plan || blocked || done) return;
    try { await controller.current?.preview({ action: "move_months", orderId: row.order.id, expectedVersion: plan.version, targetMonth: target, reason,
      selection: mode === "whole" ? { mode: "whole" } : { mode: "partial", items: Object.entries(amounts).filter(([, quantity]) => quantity.trim()).map(([lineId, quantity]) => ({ lineId, quantity })) } });
      const p = controller.current?.snapshot().preview; if (!owns() || !p) return;
      const lease = () => owns() && controller.current?.snapshot().preview?.previewHash === p.previewHash;
      setReference({ owner, hash: p.previewHash, busy: true });
      const years = [...new Set(p.touchedMonths.map(month => month.slice(0, 4)))];
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
      try {
        if (years.length > 3) throw Error('bounded_reference');
        const [basis, periodSets] = await Promise.all([client.basis(row.order.id, lease, abort.signal), Promise.all(years.map(year => client.periods(new URLSearchParams({ year, limit: "50" }), lease, abort.signal)))]);
        if (lease()) setReference({ owner, hash: p.previewHash, busy: false, rows: closingMoveReference(basis, periodSets.flatMap(set => set.items), p.before, p.after, p.touchedMonths, { sale: session.hasPermission("commercial.sale.view"), work: session.hasPermission("commercial.labor.view") }) });
      } catch (value) { if (lease()) { setReference({ owner, hash: p.previewHash, busy: false, error: "产值参考暂不能完整核对；未知不补0。数量预览仍完整，财务快照不变。" }); if ((value as { status?: number }).status === 401) session.invalidate(); } }
      finally { clearTimeout(timer); }
    }
    catch (value) { if (owns()) setError(closingUiError(value)); }
  };
  return <Modal open title="调整关账月份" description={`${row.order.factoryStyleNo || row.order.styleNo || row.order.orderNo} · ${productionLabel[row.order.productionStatus]}（生产仅参考）`}
    className="sc-adjustment-dialog" onClose={close} closeDisabled={blocked} footer={<>
      <div className="sc-command-status" aria-live="polite">{error && <p role="alert">{error}</p>}{state?.error && <p role="alert">{state.error}</p>}{state?.message && <p>{state.message}</p>}
        {state?.pending && state.pending.intent.orderId !== row.order.id && <p>存在此前另一订单的原请求，核对后才能继续。</p>}
        {(state?.pending || state?.pendingUnavailable) && <Button variant="secondary" size="compact" disabled={state.busy} onClick={() => void controller.current?.check()}>核对原请求</Button>}
        {state?.retryAllowed && <Button variant="secondary" size="compact" disabled={state.busy} onClick={() => { if (window.confirm("仅重试完全相同的原请求？")) void controller.current?.retry(true); }}>重试原请求</Button>}
      </div><div className="sc-footer-actions"><Button variant="secondary" disabled={blocked} onClick={close}>{done ? "完成" : "取消"}</Button>
        {!done && (state?.preview ? <Button disabled={blocked} onClick={() => void controller.current?.apply()}>确认调整</Button> : <Button disabled={blocked || !plan || !session.hasPermission("closing.edit") || data?.plan.sourceChanged || plan.quantityState !== "ready"} onClick={() => void preview()}>预览调整</Button>)}</div>
    </>}>
    {!data ? <p role="status">正在读取整单月份与执行资料…</p> : !plan ? <p>此单尚无正式月份计划，不自动补造历史数据。</p> : <>
      <div className="sc-order-reference"><strong>{row.order.orderNo}</strong><span>订单量 {closingNumber(row.order.quantity)} · 已完成 {closingNumber(row.order.completedQuantity)}</span><span>交期 {data.plan.currentDeliveryDate ?? "待确认"} · 默认月份 {plan.defaultMonth ?? "待分月"}</span></div>
      {data.plan.sourceChanged && <p role="alert">来源数量或颜色已变化，原月份计划保留；核对后再调整。</p>}
      {data.plan.executorChanges.length > 0 && <p role="alert">执行归属发生变化，需先核对原归属。</p>}
      <fieldset disabled={blocked || done} className="sc-adjustment-fields"><div className="sc-form-grid">
        <FormItem label="调整范围"><select aria-label="调整范围" value={mode} onChange={e => edit(() => setMode(e.target.value as "partial" | "whole"))}><option value="partial">部分数量</option><option value="whole">整个订单</option></select></FormItem>
        <FormItem label="目标月份" required><input type="month" aria-label="目标月份" value={target} onChange={e => edit(() => setTarget(e.target.value))} /></FormItem>
        <FormItem label="调整原因" required><input aria-label="调整原因" maxLength={2000} value={reason} onChange={e => edit(() => setReason(e.target.value))} /></FormItem>
      </div>
      {mode === "whole" && <p className="sc-scope-note">整单包含全部月份、颜色及内外发数量，不受外层筛选限制。</p>}
      <div className="sc-table-scroll"><table><thead><tr><th>原月份</th><th>颜色</th><th>执行方</th><th>可调数量</th>{mode === "partial" && <th>本次调入数量</th>}</tr></thead><tbody>
        {plan.lines.map(line => <tr key={line.id}><td>{line.month ?? "待分月"}</td><td>{color(line.colorId)}</td><td>{executor(line.assignmentId)}</td><td>{closingNumber(line.quantity)}</td>{mode === "partial" && <td><input inputMode="decimal" aria-label={`调入数量 ${line.id}`} value={amounts[line.id] ?? ""} placeholder="不调整" onChange={e => edit(() => setAmounts(value => ({ ...value, [line.id]: e.target.value })))} /></td>}</tr>)}
      </tbody></table></div></fieldset>
      {state?.preview && <section className="sc-preview" aria-label="关账调整预览"><h3>调整后完整月份分配</h3><p>数量、产品和价格条件保持；只调整月份。原有财务快照不会自动重算。</p><div className="sc-table-scroll"><table><thead><tr><th>月份</th><th>颜色</th><th>执行方</th><th>数量</th></tr></thead><tbody>{state.preview.after.map(line => <tr key={line.id}><td>{line.month ?? "待分月"}</td><td>{color(line.colorId)}</td><td>{executor(line.assignmentId)}</td><td>{closingNumber(line.quantity)}</td></tr>)}</tbody></table></div>
        {reference?.owner === owner && reference.hash === state.preview.previewHash && <><h3>两项产值参考 · 调整前 → 调整后</h3><p>仅使用当前已采用的价格及明确期间税率作参考，不代表财务采用或收入确认。</p>{reference.busy && <p role="status">正在核对产值参考…</p>}{reference.error && <p>{reference.error}</p>}
          {reference.rows && <div className="sc-table-scroll"><table className="sc-value-difference"><thead><tr><th>月份</th><th>成衣销售 CNY</th><th>加工 USD</th></tr></thead><tbody>{reference.rows.map(item => {
            const value = (amount: typeof item.before.sale, symbol: string) => amount.visibility === "restricted" ? "无金额权限" : amount.state === "incomplete" ? "待确认" : symbol + closingNumber(amount.amount!.decimal);
            return <tr key={item.month ?? "pending"}><td>{item.month ?? "待分月（不计全年）"}</td><td>{value(item.before.sale, "¥")} → {value(item.after.sale, "¥")}</td><td>{value(item.before.work, "$")} → {value(item.after.work, "$")}</td></tr>;
          })}</tbody></table></div>}</>}
      </section>}
    </>}
  </Modal>;
}

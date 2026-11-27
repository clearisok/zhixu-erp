"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Card, ErrorState, LoadingState } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { ServerAuthError } from "@/features/server-auth/server-auth-client";
import { productionPlanClient } from "@/features/production-scheduling/server/production-plan-client";
import { createClosingClient } from "@/features/closing-center/server/closing-client";
import { closingNumber } from "@/features/closing-center/components/closing-ui-owner";

type Read<T> = (current: () => boolean, signal: AbortSignal) => Promise<T>;

/** A response belongs to a committed order/session, including A -> B -> A. */
function useWorkbenchRead<T>(orderId: string, allowed: boolean, read: Read<T>) {
  const session = useServerSession();
  const [attempt, setAttempt] = useState(0);
  const lease = useMemo(() => ({ orderId, session, allowed, attempt, read }), [orderId, session, allowed, attempt, read]);
  const owner = useRef<object | null>(null);
  const [view, setView] = useState<{ lease: object; data?: T; error?: string } | null>(null);
  useLayoutEffect(() => { owner.current = lease; return () => { owner.current = null; }; }, [lease]);
  useEffect(() => {
    if (!allowed || session.status !== "authenticated") return;
    const abort = new AbortController();
    const current = () => owner.current === lease && !abort.signal.aborted;
    void read(current, abort.signal).then(data => { if (current()) setView({ lease, data }); }).catch((error: unknown) => {
      if (!current()) return;
      if (error instanceof ServerAuthError && error.status === 401) session.invalidate();
      setView({ lease, error: error instanceof ServerAuthError && error.status === 403
        ? "当前账号没有此模块的查看权限。" : "暂未取得数据，请稍后重新读取。" });
    });
    return () => abort.abort();
  }, [allowed, lease, read, session]);
  const visible = view?.lease === lease ? view : null;
  return { data: visible?.data, error: visible?.error, loading: allowed && !visible,
    retry: () => setAttempt(value => value + 1) };
}

export function WorkbenchProduction({ orderId, historical = false }: { orderId: string; historical?: boolean }) {
  const session = useServerSession();
  const allowed = !historical && session.hasPermission("order.view") && session.hasPermission("schedule.view");
  const read = useCallback((current: () => boolean) => productionPlanClient.order(orderId, current), [orderId]);
  const state = useWorkbenchRead(orderId, allowed, read);
  const data = state.data;
  return <Card className="oc-server-detail-section ow-execution-section" data-workbench-production>
    <header><div><h2>生产执行</h2><small>排单与实际完成分别查看</small></div>{allowed && <a className="qc-button qc-button-text" href="/production-scheduling">进入生产排单 →</a>}</header>
    {historical ? <p className="ow-section-copy">历史重复订单保持原身份，执行请查看有效订单。</p>
      : !allowed ? <p className="ow-section-copy">当前账号没有生产查看权限。</p>
      : state.loading ? <LoadingState compact label="读取生产执行" rows={2} />
      : state.error ? <ErrorState description={state.error} onRetry={state.retry} />
      : data ? <div className="ow-section-body">
        <dl className="ow-metrics"><div><dt>已排数量</dt><dd>{closingNumber(data.summary.plannedQuantity)}</dd></div>
          <div><dt>实际完成数量</dt><dd>{Object.keys(data.executions).length ? closingNumber(data.summary.completedQuantity) : "尚未登记"}</dd></div>
          <div><dt>待执行数量</dt><dd>{closingNumber(data.summary.outstandingPlannedQuantity)}</dd></div></dl>
        {data.assignments.length ? <details><summary>查看 {data.assignments.length} 条排单与完成记录</summary>
          <div className="ow-table-scroll" role="region" aria-label="本订单生产明细" tabIndex={0}><table><thead><tr><th>执行方式 / 颜色</th><th>计划起止</th><th>计划数量</th><th>实际完成</th><th>记录状态</th></tr></thead><tbody>{data.assignments.map(row => <tr key={row.id}>
            <td>{row.executionType === "internal" ? "内制" : "外发"} · {row.colorNameSnapshot ?? "全单"}</td>
            <td>{row.plannedStartDate ?? "未记录"} — {row.plannedEndDate ?? "未记录"}</td><td>{closingNumber(row.plannedQuantity)}</td>
            <td>{data.executions[row.id] ? closingNumber(data.executions[row.id].completedQuantity) : "尚未登记"}</td><td>{row.status === "cancelled" ? "排单已取消" : "有效排单"}{data.executions[row.id] && (data.executions[row.id].status === "completed" ? " · 执行已结束" : " · 执行中")}</td>
          </tr>)}</tbody></table></div></details> : <p className="ow-help">暂未记录排单，不能据此推断其他环节状态。</p>}
      </div> : null}
  </Card>;
}

export function WorkbenchClosing({ orderId, historical = false }: { orderId: string; historical?: boolean }) {
  const session = useServerSession();
  const allowed = !historical && session.hasPermission("order.view") && session.hasPermission("closing.view");
  const client = useMemo(() => createClosingClient({ visibility: () => ({ sale: session.hasPermission("commercial.sale.view"), work: session.hasPermission("commercial.labor.view") }) }), [session]);
  const read = useCallback((current: () => boolean, signal: AbortSignal) => client.monthDisplay(orderId, current, signal), [client, orderId]);
  const state = useWorkbenchRead(orderId, allowed, read), data = state.data;
  const statusLabels = { not_created: "尚未创建期间", open: "未确认", confirmed: "已确认", locked: "已锁定" };
  return <Card className="oc-server-detail-section ow-execution-section" data-workbench-closing>
    <header><div><h2>财务关账</h2><small>分月安排与期间状态</small></div>{allowed && <a className="qc-button qc-button-text" href="/closing-center">进入关账中心 →</a>}</header>
    {historical ? <p className="ow-section-copy">历史订单不与有效订单合计，原财务历史保持。</p>
      : !allowed ? <p className="ow-section-copy">当前账号没有关账查看权限。</p>
      : state.loading ? <LoadingState compact label="读取关账安排" rows={2} />
      : state.error ? <ErrorState description={state.error} onRetry={state.retry} />
      : data ? <div className="ow-section-body">
        {data.sourceChanged && <p className="ow-data-warning" role="status">订单来源与当前分月依据有变化，请在关账中心核对。</p>}
        {data.plan ? <><p>默认归属月份：<strong>{data.plan.defaultMonth ?? "待分月"}</strong></p>
          <details><summary>查看分月数量与期间状态</summary><div className="ow-table-scroll" role="region" aria-label="本订单关账分月" tabIndex={0}><table><thead><tr><th>月份</th><th>数量</th><th>颜色</th><th>期间状态</th></tr></thead><tbody>{data.plan.lines.map(line => {
            const period = data.display.periods.find(item => item.month === line.month);
            const color = data.display.colors.find(item => item.colorId === line.colorId);
            return <tr key={line.id}><td>{line.month ?? "待分月"}</td><td>{closingNumber(line.quantity)}</td><td>{line.colorId ? color?.identityName ?? "名称待核对" : "全单"}</td><td>{period ? statusLabels[period.status] : "待核对"}</td></tr>;
          })}</tbody></table></div></details></> : <p>暂未取得分月安排。</p>}
        <p className="ow-help">此处为分月数量，不是财务确认数量。实际采用产值和财务历史请进入关账中心查看；成衣销售 CNY、加工 USD 分开，产值不代表收款或利润。</p>
      </div> : null}
  </Card>;
}

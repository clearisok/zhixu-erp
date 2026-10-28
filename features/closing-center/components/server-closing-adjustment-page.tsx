"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell, Button, Card, EmptyState, FloatingMenu, PageContainer, PageHeader, SearchField } from "@/components/foundation";
import { PermissionAuthorityProvider } from "@/features/permissions/components/permission-authority";
import { useServerNavigationProtection } from "@/components/foundation/server-navigation-protection";
import { useServerSession } from "@/features/server-auth";
import type { ClosingYear } from "../server/closing-year-projection";
import type { ClosingYearQuery } from "@/server/closing/annual-contract";
import { closingNumber, closingUiError, productionLabel, useClosingOwner } from "./closing-ui-owner";
import { ServerClosingMoveDialog } from "./server-closing-move-dialog";
import { ServerClosingPeriodDialog } from "./server-closing-period-dialog";
import { ServerClosingRecoveryDialog, type ClosingRecovery } from "./server-closing-recovery-dialog";
import { readClosingMonthPending } from "../server/closing-month-controller";
import { readClosingPending } from "../server/closing-pending";
import { ServerClosingSourceDialog } from "./server-closing-source-dialog";

type Summary = ClosingYear["totals"]["garmentSalesCny"];
function SummaryValue({ value, symbol }: { value: Summary; symbol: string }) {
  if (value.visibility === "restricted") return <span className="sc-muted">无金额权限</span>;
  if (value.state === "incomplete") return <span className="sc-incomplete">待完善<small>已知 {symbol}{closingNumber(value.knownSubtotal.decimal)} · {value.blockedPortions} 项待确认</small></span>;
  return <>{symbol}{closingNumber(value.amount!.decimal)}</>;
}
const price = (value: ClosingYear["items"][number]["processing"], symbol: string) => value.visibility === "restricted" ? "无金额权限" : value.state === "not_applicable" ? "不适用" : value.state === "blocked" ? "待确认" : symbol + closingNumber(value.price);
function Workspace() {
  const params = useSearchParams(), requested = params.get("month"), validMonth = requested && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/u.test(requested) ? requested : null;
  const [year, setYear] = useState(() => validMonth?.slice(0, 4) ?? (/^(19|20|21)\d{2}$/u.test(params.get("year") ?? "") ? params.get("year")! : String(new Date().getFullYear())));
  const [scope, setScope] = useState<ClosingYearQuery["scope"]>("all"), [production, setProduction] = useState<ClosingYearQuery["production"]>("all");
  const [search, setSearch] = useState(""), [offset, setOffset] = useState(0), [revision, setRevision] = useState(0);
  const context = JSON.stringify({ year, scope, production, search, offset }), { session, owner, owns, client } = useClosingOwner(context);
  const [owned, setOwned] = useState<{ owner: object; data: ClosingYear }>(), [failure, setFailure] = useState<{ owner: object; text: string }>();
  const [loading, setLoading] = useState(false), [move, setMove] = useState<ClosingYear["items"][number] | null>(null), [month, setMonth] = useState<string | null>(validMonth);
  const [originals, setOriginals] = useState<{ session: typeof session; items: ClosingRecovery[]; corrupt: boolean }>(), [recovery, setRecovery] = useState<ClosingRecovery | null>(null);
  const [sourceReview, setSourceReview] = useState<ClosingYear["items"][number] | null>(null);
  const pending = originals?.session === session ? originals : null;
  const pendingBlocked = pending === null || Boolean(pending.items.length || pending.corrupt);
  useServerNavigationProtection({ blocked: Boolean(pending?.items.length || pending?.corrupt), message: "有原关账请求待核对，请先使用核对入口确认结果。" });
  useEffect(() => {
    let active = true; void Promise.resolve().then(() => {
      if (!active || session.status !== "authenticated" || !session.user) return;
      const items: ClosingRecovery[] = []; let corrupt = false;
      try { const command = readClosingMonthPending(window.sessionStorage, { userId: session.user.id }); if (command) items.push({ kind: "month", command }); } catch { corrupt = true; }
      try { const command = readClosingPending(window.sessionStorage, { userId: session.user.id }); if (command) items.push({ kind: "financial", command }); } catch { corrupt = true; }
      if (active) setOriginals({ session, items, corrupt });
    }); return () => { active = false; };
  }, [revision, session]);
  const data = owned?.owner === owner ? owned.data : null, error = failure?.owner === owner ? failure.text : "";
  useEffect(() => {
    let active = true; const lease = () => active && owns();
    void Promise.resolve().then(async () => {
      if (!lease()) return; setLoading(true);
      try { const data = await client.year(new URLSearchParams({ year, scope, production, search, offset: String(offset), limit: "25" }), lease);
        if (lease()) { setOwned({ owner, data }); setFailure(undefined); }
      } catch (value) { if (lease()) { const status = (value as { status?: number }).status; setFailure({ owner, text: closingUiError(value) }); if (status === 401 || status === 403) setOwned(undefined); if (status === 401) session.invalidate(); } }
      finally { if (lease()) setLoading(false); }
    }); return () => { active = false; };
  }, [client, offset, owner, owns, production, revision, scope, search, session, year]);
  const refresh = () => setRevision(value => value + 1), filter = (run: () => void) => { setOffset(0); setMonth(null); setMove(null); setSourceReview(null); run(); };
  const selectedMonth = data?.months.find(row => row.month === month);
  return <PermissionAuthorityProvider can={session.hasPermission}><PageContainer className="sc-adjustment-page">
    <PageHeader eyebrow="CLOSING PLANNING" title="关账调整" description="按订单交期归月，结合制作进度调整；生产和出货只作参考。" actions={<div className="sc-year-select"><label htmlFor="sc-year">年份</label><input id="sc-year" aria-label="关账年份" type="number" min="1900" max="2199" value={year} onChange={e => filter(() => setYear(e.target.value))} /><Button size="compact" variant="secondary" onClick={refresh}>刷新</Button></div>} />
    {pending && (pending.items.length > 0 || pending.corrupt) && <div className="sc-alert sc-recovery-bar"><strong>有原请求待核对</strong>{pending.items.map(item => <Button key={item.kind} size="compact" variant="secondary" onClick={() => setRecovery(item)}>{item.kind === "month" ? "核对月份调整原请求" : "核对财务原请求"}</Button>)}{pending.corrupt && <p>有本机原请求无法完整读取，原字节已保留；请保留现场，勿清理缓存或重新建单。</p>}</div>}
    <div className="sc-query"><label>显示范围<select aria-label="关账显示范围" value={scope} onChange={e => filter(() => setScope(e.target.value as typeof scope))}><option value="all">全部（内制及外发）</option><option value="internal">仅内制</option><option value="outsource">仅外发</option><option value="unassigned">未分配执行方</option></select></label><p>范围同时影响明细和汇总，不改变订单或账本。</p></div>
    {error && <p role="alert" className="sc-alert">{error}</p>}{loading && <p role="status" className="sc-muted">正在读取全年同范围数据…</p>}
      <div className="sc-list-filters"><SearchField value={search} onChange={value => filter(() => setSearch(value))} label="搜索关账订单" placeholder="订单、款号、客户；空格为且" /><label className="sc-status-filter"><span className="sr-only">制作状态</span><select aria-label="关账制作状态" value={production} onChange={e => filter(() => setProduction(e.target.value as typeof production))}><option value="all">全部制作状态</option><option value="not_started">未制作</option><option value="in_progress">制作中</option><option value="completed">制作完成</option></select></label><span>{data ? data.total + " 个月份片段" : "正在读取"}</span></div>
    {data && <>
      <div className="sc-annual-totals"><Card><span>全年成衣销售产值 · CNY</span><strong><SummaryValue value={data.totals.garmentSalesCny} symbol="¥" /></strong></Card><Card><span>全年加工产值 · USD</span><strong><SummaryValue value={data.totals.processingUsd} symbol="$" /></strong></Card></div>
      <p className="sc-basis-note">开放月份为已采用价格的参考值；已确认、已锁定月份为冻结快照。不同币种分别列示。</p>
      <div className="sc-month-grid" aria-label="全年十二个月">{data.months.map(row => <button type="button" key={row.month} className="sc-month-card" disabled={pendingBlocked} onClick={() => setMonth(row.month)} aria-label={`管理 ${row.month}`}>
        <span className="sc-month-heading"><strong>{Number(row.month.slice(5))}月</strong><small>{row.period?.status === "locked" ? "已锁定" : row.period?.status === "confirmed" ? "已确认" : row.period ? "开放中" : "未建期间"}</small></span>
        <span>成衣 CNY <b><SummaryValue value={row.garmentSalesCny} symbol="¥" /></b></span><span>加工 USD <b><SummaryValue value={row.processingUsd} symbol="$" /></b></span>
      </button>)}</div>
      {data.pendingPortions > 0 && <p className="sc-alert">另有 {data.pendingPortions} 个待分月片段，未计入本年度已分月合计。</p>}

      <Card className="sc-order-card"><div className="sc-table-scroll"><table className="sc-order-table"><thead><tr><th>订单 / 款号</th><th>颜色 / 执行方</th><th>制作状态</th><th>订单量 / 完成量</th><th>关账月份 / 数量</th><th>成衣单价 CNY</th><th>加工单价 USD</th><th>操作</th></tr></thead><tbody>{data.items.map(row => <tr key={[row.order.id, row.id, row.month].join(":")}>
        <td><strong>{row.order.factoryStyleNo || row.order.styleNo || row.order.orderNo}</strong><small>{row.order.orderNo} · {row.order.customerName ?? "客户待确认"}</small></td>
        <td>{row.colorName ?? "整单 / 未分颜色"}<small>{row.executor ? (row.executor.type === "internal" ? "内制 · " : "外发 · ") + (row.executor.name ?? "历史执行方") : "未分配执行方"}</small></td>
        <td><span className="sc-production-status">{productionLabel[row.order.productionStatus]}</span>{row.executionReview?.laterCorrection && <small>生产依据有更正</small>}
          {row.issues.includes("month_source_changed") && <Button size="compact" variant="text" disabled={pendingBlocked || !session.hasPermission("closing.edit")} onClick={() => setSourceReview(row)}>来源待复核</Button>}
        </td>
        <td>{closingNumber(row.order.quantity)}<small>完成 {closingNumber(row.order.completedQuantity)}</small></td><td>{row.month ?? "待分月"}<strong>{closingNumber(row.quantity)}</strong></td>
        <td>{price(row.garmentSale, "¥")}</td><td>{price(row.processing, "$")}</td><td><div className="sc-row-actions"><Button size="compact" variant="text" disabled={pendingBlocked || !session.hasPermission("closing.edit")} onClick={() => setMove(row)}>调整月份</Button>
          <FloatingMenu label={row.order.orderNo + " 关账更多操作"} trigger="更多"><Button size="compact" variant="text" disabled={pendingBlocked || !session.hasPermission("closing.edit")} onClick={() => setSourceReview(row)}>复核来源数量</Button></FloatingMenu>
        </div></td>
      </tr>)}</tbody></table></div>{data.items.length === 0 && <EmptyState title="当前范围没有订单片段" description="调整筛选条件，或等待新订单按成衣交期建立月份计划。" />}</Card>
      <div className="sc-pagination"><Button size="compact" variant="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 25))}>上一页</Button><span>{data.total === 0 ? 0 : offset + 1}–{Math.min(offset + data.items.length, data.total)} / {data.total}</span><Button size="compact" variant="secondary" disabled={offset + data.items.length >= data.total || loading} onClick={() => setOffset(value => value + 25)}>下一页</Button></div>
    </>}
    {move && <ServerClosingMoveDialog row={move} context={context} onClose={() => setMove(null)} onChanged={refresh} />}
    {sourceReview && <ServerClosingSourceDialog row={sourceReview} context={context} onClose={() => setSourceReview(null)} onChanged={refresh} />}
    {selectedMonth && !pendingBlocked && <ServerClosingPeriodDialog month={selectedMonth} onClose={() => setMonth(null)} onChanged={refresh} />}
    {recovery && <ServerClosingRecoveryDialog original={recovery} onClose={() => { setRecovery(null); refresh(); }} />}
  </PageContainer></PermissionAuthorityProvider>;
}
export function ServerClosingAdjustmentPage() {
  const session = useServerSession();
  return <AppShell title="关账调整">{session.status !== "authenticated" ? <PageContainer><p role="status">正在核对登录状态…</p></PageContainer>
    : !["closing.view", "order.view", "schedule.view"].every(key => session.permissions.includes(key as "closing.view" | "order.view" | "schedule.view")) ? <PageContainer><EmptyState title="暂无关账查看权限" description="需要关账、订单及生产排单查看权限。" /></PageContainer> : <Workspace />}</AppShell>;
}

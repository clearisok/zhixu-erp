"use client";
import { useCallback, useState } from "react";
import { AlertBanner, Button, Card, DataTable, Drawer, EmptyState, ErrorState, LoadingState, StatusTag, type DataColumn } from "@/components/foundation";
import { useServerSession } from "../server-auth";
import { GARMENT_EMPTY_LABELS, type GarmentReadRow, type GarmentSourceField, type TimedGarmentView } from "./model";
import { useGarmentHistory, useGarmentObservation } from "./use-garment-shipments";

const sourceText = (field: GarmentSourceField) => field.state === "known" ? field.raw : "未提供";
const capturedTime = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
function quantity(row: GarmentReadRow) {
  const number = row.quantity.state === "known" ? row.quantity.value : row.quantity.state === "invalid" ? "待核对（" + row.quantity.raw + "）" : "数量未提供";
  return number + " · " + (row.fields.QtyUnit.state === "known" ? row.fields.QtyUnit.raw : "单位未知");
}
function businessDate(row: GarmentReadRow) { return row.businessDate.state === "known" ? row.businessDate.value : row.businessDate.state === "invalid" ? "日期待核对（" + row.businessDate.raw + "）" : "出运日期未提供"; }
function colorMatch(row: GarmentReadRow) {
  return row.colorMatch.state === "matched" ? row.colorMatch.orderColorName
    : { missing_source_color: "来源颜色未提供", unmatched: "未匹配订单颜色", ambiguous: "颜色重名，待核对" }[row.colorMatch.state];
}

function Observation({ view, stale, recordsOnly = false }: { view: TimedGarmentView; stale: boolean; recordsOnly?: boolean }) {
  const [page, setPage] = useState(0);
  if (view.status === "empty") return <EmptyState compact title={GARMENT_EMPTY_LABELS[view.model.sourceStatus]} />;
  const model = view.model, rows = model.rows.slice(page * 20, (page + 1) * 20);
  const columns: DataColumn<GarmentReadRow>[] = [
    { key: "document", header: "出货单据", width: 160, responsivePriority: "primary", render: row => sourceText(row.fields.billno) },
    { key: "date", header: "出运日期", width: 180, responsivePriority: "primary", render: row => <span>{businessDate(row)}<small style={{ display: "block" }}>单据日 {sourceText(row.fields.FDate)} · 进仓日 {sourceText(row.fields.indate)}</small></span> },
    { key: "sourceColor", header: "来源颜色", width: 140, responsivePriority: "primary", render: row => sourceText(row.fields.CnColor) },
    { key: "quantity", header: "本次出库数", width: 180, align: "right", responsivePriority: "primary", render: row => <span style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{quantity(row)}</span> },
    { key: "color", header: "当时匹配的订单颜色", width: 180, responsivePriority: "secondary", render: colorMatch },
  ];
  const record = (row: GarmentReadRow) => <div style={{ overflowWrap: "anywhere" }}><strong>{sourceText(row.fields.billno)} · {sourceText(row.fields.CnColor)}</strong><p>本次出库数 {quantity(row)}</p><p>{row.businessDate.state === "known" ? "出运日期 " : ""}{businessDate(row)}</p><p>当时匹配：{colorMatch(row)}</p><small>单据日 {sourceText(row.fields.FDate)} · 进仓日 {sourceText(row.fields.indate)}</small></div>;
  return <div style={{ overflowWrap: "anywhere" }}>
    <p><StatusTag tone={stale ? "neutral" : "success"}>{stale ? "已过期 · 历史观察" : "来源观察"}</StatusTag> 截至 {capturedTime(model.observedThrough)} · 第 {model.generation} 次记录</p>
    {model.targetPolicyChanged && <AlertBanner tone="warning" title="来源时效设置已变化">本记录仍按采集时的原策略判断时效。</AlertBanner>}
    {model.colorBasisChanged && <AlertBanner tone="warning" title="订单颜色已变化">以下保留采集时的颜色匹配，请核对差异。</AlertBanner>}
    {model.rows.length ? <>
      {recordsOnly ? <div role="list" aria-label="历史出货明细" style={{ display: "grid", gap: 12 }}>{rows.map(row => <Card role="listitem" key={row.observationId} data-garment-history-record style={{ padding: 14 }}>{record(row)}</Card>)}</div>
        : <DataTable rows={rows} columns={columns} rowKey={row => row.observationId} ariaLabel="成衣出货来源记录" moduleKey="order-center" tableKey="order-center.garment-shipments" layout="readable" renderRecord={record} />}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "12px 0" }}>
        <Button variant="text" disabled={page === 0} onClick={() => setPage(value => value - 1)}>上一页出货</Button>
        <span>{page * 20 + 1}–{Math.min((page + 1) * 20, model.rows.length)} / {model.rows.length} 条</span>
        <Button variant="text" disabled={(page + 1) * 20 >= model.rows.length} onClick={() => setPage(value => value + 1)}>下一页出货</Button>
      </div>
    </> : <EmptyState compact title="本次指定合同查询没有记录" description="这不表示订单未出货或旧记录已取消；其他采集记录仍可单独查看。" />}
    <p className="qc-help-text">每次采集独立查看，不跨次相加；出货记录不自动用于生产完成、收入或关账。</p>
  </div>;
}

export function GarmentShipmentSection({ orderId, contract, processing = false, historicalAlias = false }: { orderId: string; contract: string | null; processing?: boolean; historicalAlias?: boolean }) {
  const session = useServerSession(), [expanded, setExpanded] = useState(false), [historyOpen, setHistoryOpen] = useState(false);
  const [publicationId, setPublicationId] = useState<string | undefined>(), [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [block, setBlock] = useState<{ session: object; orderId: string; message: string } | null>(null);
  const blocked = block?.session === session && block.orderId === orderId ? block.message : "";
  const onBlock = useCallback((message: string) => setBlock({ session, orderId, message }), [session, orderId]);
  const active = !processing && !historicalAlias && Boolean(contract) && !blocked;
  // Opening history revalidates the current binding before exposing an index or
  // historical detail. An empty index alone cannot prove the source is enabled.
  const current = useGarmentObservation(orderId, contract ?? "", active && (expanded || historyOpen), undefined, "current/" + historyOpen, onBlock);
  const historyReady = active && historyOpen && Boolean(current.data);
  const history = useGarmentHistory(orderId, historyReady && !publicationId, cursors[cursors.length - 1], onBlock);
  const selected = useGarmentObservation(orderId, contract ?? "", historyReady && Boolean(publicationId), publicationId, "history", onBlock);
  const reread = () => { if (blocked) setBlock(null); else void current.reload(); };
  const openHistory = () => { setCursors([undefined]); setPublicationId(undefined); setHistoryOpen(true); };
  const closeHistory = () => { setHistoryOpen(false); setPublicationId(undefined); setCursors([undefined]); };
  if (!session.hasPermission("order.view") || !session.hasPermission("ainuoke.view")) return null;
  if (processing || historicalAlias || !contract) return <Card className="oc-server-detail-section"><header><h2>成衣出货</h2></header><p style={{ padding: 18 }}>{processing ? "加工订单不适用艾诺科成衣出货来源。" : historicalAlias ? "此历史订单保留原身份，不自动读取其他订单的成衣出货记录。" : "尚无可信销售合同，暂不能读取成衣出货。"}</p></Card>;
  return <Card className="oc-server-detail-section" data-garment-section>
    <header style={{ flexWrap: "wrap", gap: 12 }}><div><h2>成衣出货</h2><small>按合同查看已采集的来源记录</small></div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <Button size="compact" variant="text" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "收起出货记录" : "展开出货记录"}</Button>
      <Button size="compact" variant="secondary" onClick={openHistory}>出货历史</Button>
    </div></header>
    {expanded && <div style={{ padding: "0 18px 18px", minWidth: 0 }}>
      {blocked ? <ErrorState description={blocked} onRetry={reread} /> : current.loading ? <LoadingState compact rows={2} label="读取成衣出货" /> : current.error ? <ErrorState description={current.error.message} onRetry={reread} />
        : current.data ? <Observation key={current.data.status === "observed" ? current.data.model.publicationId : current.data.model.sourceStatus} view={current.data} stale={Boolean(current.stale)} /> : null}
      {!blocked && <Button variant="text" disabled={current.loading} onClick={reread}>重新读取出货记录</Button>}
    </div>}
    <Drawer open={historyOpen} title="成衣出货历史" description="每次采集独立保存，选择记录查看当时的数量、日期和颜色匹配。" onClose={closeHistory} footer={<Button variant="secondary" onClick={closeHistory}>关闭出货历史</Button>}>
      {blocked ? <ErrorState description={blocked} onRetry={reread} /> : current.loading ? <LoadingState compact rows={2} label="核对当前来源范围" /> : current.error ? <ErrorState description={current.error.message} onRetry={reread} />
        : publicationId ? <><Button variant="text" onClick={() => setPublicationId(undefined)}>返回出货记录列表</Button>
          {selected.loading ? <LoadingState compact rows={2} label="读取所选出货记录" /> : selected.error ? <ErrorState description={selected.error.message} onRetry={() => void selected.reload()} />
            : selected.data ? <Observation key={publicationId} view={selected.data} stale={Boolean(selected.stale)} recordsOnly /> : null}</>
        : history.loading ? <LoadingState compact rows={2} label="读取出货历史" /> : history.error ? <ErrorState description={history.error.message} onRetry={() => void history.reload()} /> : history.data ? <>
          {history.data.records.length ? history.data.records.map(record => <section key={record.publicationId} style={{ padding: "12px 0", borderBottom: "1px solid var(--qc-border)", overflowWrap: "anywhere" }}>
            <strong>{capturedTime(record.observedThrough)}</strong><p>第 {record.generation} 次记录 · {record.rowCount} 条来源明细</p><Button variant="text" onClick={() => setPublicationId(record.publicationId)}>查看第 {record.generation} 次记录</Button>
          </section>) : <EmptyState compact title="本页没有可展示的记录" description={history.data.nextBeforeGeneration !== null ? "仍可继续查看更早记录。" : "其他订单的记录不会移入或相加。"} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px 0" }}>
            <Button variant="text" disabled={cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}>较新出货记录</Button>
            <Button variant="text" disabled={history.data.nextBeforeGeneration === null} onClick={() => setCursors(value => [...value, history.data!.nextBeforeGeneration!])}>更早出货记录</Button>
          </div>
        </> : null}
    </Drawer>
  </Card>;
}

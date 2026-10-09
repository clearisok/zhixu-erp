"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Card, DataTable, ErrorState, FloatingMenu, FormItem, LoadingState, PageContainer, PageHeader, Toolbar, type DataColumn } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { quoteAuthority } from "../authority/quote-authority";
import { quoteServerClient, type QuoteServerListItem, type QuoteServerPage } from "../server/quote-server-client";
import { quoteServerEditorAdapter, type EditableServerQuoteRecord } from "../server/quote-server-editor-adapter";
import { createQuoteEditorPersistence } from "../server/quote-editor-persistence";
import { QuoteList } from "./quote-list";
import { QuoteDetailLoader, QuoteEditor, QuoteNewLoader } from "./quote-editor";
import type { QuoteType } from "../model/quote-view-model";
import { customerBatchExport, downloadCustomerFile, internalSummaryExport } from "../server/customer-export-client";
import { type BusinessColumn, type EstimateColumn } from "../model/quote-business-view";
import { listTablePreference, loadServerListPreferences, normalizeServerListPreferences, saveServerListPreferences, type ServerListPreferences } from "../server/list-preferences";
import { ListFieldSettingsModal } from "./quote-settings-modals";
import { ServerSummaryModal } from "./server-summary-modal";
import { applyPresentedTablePreference, presentedListColumns, presentedTablePreference } from "../server/list-presentation";
import { ServerListCell, serverListHeader } from "./server-list-cell";

const safeError = (error: unknown) => error && typeof error === "object" && "status" in error ? `Server HTTP ${String(error.status)}；无 Browser fallback。` : "Server 读取失败或数值无法安全转换；无 Browser fallback。";
function ServerList() {
  const router = useRouter();
  const session = useServerSession();
  const userId = session.user?.id ?? "";
  const [storedPreferences, setStoredPreferences] = useState<ServerListPreferences | null>(null);
  const preferences = useMemo(() => normalizeServerListPreferences(userId, session.permissions, storedPreferences?.userId === userId ? storedPreferences : undefined), [userId, session.permissions, storedPreferences]);
  const visibleBusinessColumns = preferences.columnOrder.filter(k => preferences.visibleColumns.includes(k));
  const columnSignature = visibleBusinessColumns.join(",");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const persistPreferences = (next: ServerListPreferences) => {
    try { setStoredPreferences(saveServerListPreferences(window.localStorage, next, session.permissions)); }
    catch { setStoredPreferences(next); setBatchMessage("个人 UI 设置未能存到本机；本次布局可用，不影响报价数据。"); }
  };
  const [rows, setRows] = useState<QuoteServerListItem[]>([]);
  const [page, setPage] = useState<QuoteServerPage | null>(null);
  const [query, setQuery] = useState({ search: "", type: "", status: "", offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectionMode,setSelectionMode]=useState(false);
  const [selected,setSelected]=useState<Record<string,{version:number;label:string}>>({});
  const [batchBusy,setBatchBusy]=useState(false);
  const [batchMessage,setBatchMessage]=useState("");
  const batchPending=useRef(false);
  useEffect(() => {
    void Promise.resolve().then(() => {
      if (userId) setStoredPreferences(loadServerListPreferences(window.localStorage, userId, session.permissions));
      else setStoredPreferences(null);
      setSelected({}); setSummaryOpen(false); setSummaryError(""); setSettingsOpen(false);
    });
  }, [userId, session.permissions]);
  const choose=(items:QuoteServerListItem[],checked:boolean)=>{
    const next={...selected};for(const row of items){if(checked)next[row.id]={version:row.version,label:row.summary?.quoteStyleNo||row.quoteCode};else delete next[row.id];}
    if(Object.keys(next).length>25){setBatchMessage("最多选择 25 张；未截断或改变原选择。");return;}
    setSelected(next);setBatchMessage("");
  };
  const exportBatch=async()=>{
    if(batchPending.current)return;batchPending.current=true;setBatchBusy(true);setBatchMessage("");
    const items=Object.entries(selected).map(([quoteId,value])=>({quoteId,expectedVersion:value.version}));
    try{const result=await customerBatchExport(items);if(result.file)downloadCustomerFile(result.file);
      setBatchMessage(`选中 ${result.report.selected} / 成功 ${result.report.success} / 失败 ${result.report.failed.length}${result.report.failed.map(f=>`；${selected[items[f.index].quoteId].label} (${items[f.index].quoteId}): ${f.code}`).join("")}${result.report.warnings.map(w=>`；${selected[items[w.index].quoteId].label}: ${w.count} 项警告（见 ZIP 清单）`).join("")}${!result.file?"；全失败，不提供空 ZIP":"；已生成项不是全库同时快照"}`);
    }catch(cause){setBatchMessage(cause instanceof Error?cause.message:"Server 批量导出未完成；无 Browser fallback");}
    finally{batchPending.current=false;setBatchBusy(false);}
  };
  const exportSummary = async (columns: BusinessColumn[], rowMode: "quote" | "price-version", estimateColumns: EstimateColumn[]) => {
    if (batchPending.current) return;
    batchPending.current = true; setBatchBusy(true); setSummaryError("");
    try {
      const file = await internalSummaryExport({ items: Object.entries(selected).map(([quoteId, item]) => ({ quoteId, expectedVersion: item.version })), columns, rowMode, estimateColumns });
      downloadCustomerFile(file); setSummaryOpen(false); setBatchMessage("内部汇总文件已生成；不代表 Server 已确认保存到本机。");
    } catch (cause) { setSummaryError(cause instanceof Error ? cause.message : "Server 汇总未完成；无 Browser fallback"); }
    finally { batchPending.current = false; setBatchBusy(false); }
  };
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { setLoading(true); setError(""); });
    if (!session.hasPermission("quote.view")) return;
    void quoteServerClient.list({ ...query, limit: 25, ...(columnSignature ? { columns: columnSignature.split(",") as BusinessColumn[] } : {}) }).then((result) => {
      if (!active) return;
      if (result.page.total === undefined || result.quotes.some((row) => !row.summary)) throw new Error("Incomplete Server summary");
      setRows(result.quotes); setPage(result.page);
    }).catch((cause) => { if (active) setError(safeError(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, retry, session, columnSignature]);
  const columns: DataColumn<QuoteServerListItem>[] = [
    ...(selectionMode?[{key:"select",header:"选择",render:(row:QuoteServerListItem)=><input type="checkbox" aria-label={`选择 ${row.id}`} disabled={batchBusy} checked={Boolean(selected[row.id])} onChange={e=>choose([row],e.target.checked)} />}]:[]),
    ...presentedListColumns(preferences).map(({ key, fields }) => ({
      key, header: serverListHeader(fields),
      minWidth: key === "styleImage" ? 56 : key === "styleIdentity" ? 156 : key === "quote" ? 180 : key === "quantity" ? 72 : key === "type" || key === "date" ? 80 : fields.includes("fabricCost") ? 126 : 88,
      width: preferences.columnWidths[key],
      align: (fields.every(field => ["quantity", "fabricCost", "trimCost", "labor", "garmentPrice", "confirmedLabor", "confirmedGarment"].includes(field)) ? "right" : "left") as "left" | "right",
      render: (row: QuoteServerListItem) => <ServerListCell fields={fields} row={row} />,
    })),
    { key: "action", header: "操作", minWidth: 104, width: 104, sticky: "right", render: (row) => <Button variant="text" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(row.id)}`)}>打开报价 →</Button> },
  ];
  return <AppShell title="报价中心"><PageContainer className="qc-quote-center-page qc-server-business-list">
    <PageHeader eyebrow="QUOTE CENTER" title="报价中心" count={page ? `${page.total} 条` : ""} description="按款式识别报价，区分报价历史、价格方案与客户确认。"
      secondaryActions={<FloatingMenu className="qc-list-more-actions" menuClassName="qc-list-more-menu" label="更多报价操作">
        <Button disabled={batchBusy || (!selectionMode && (!session.hasPermission("quote.export") || !session.hasPermission("quote.cost.view")))} variant="text" onClick={() => { setSelectionMode(!selectionMode); setSelected({}); setBatchMessage(""); }}>{selectionMode ? "退出选择" : "批量客户报价"}</Button>
        <Button disabled={batchBusy} variant="text" onClick={() => setSettingsOpen(true)}>列表页面设置</Button>
        <Button disabled={batchBusy || !session.hasPermission("quote.export")} variant="text" onClick={() => { if (!selectionMode) { setSelectionMode(true); setBatchMessage("请选择报价后打开内部汇总（支持跨页，最多25张）。"); } else if (Object.keys(selected).length) { setSummaryError(""); setSummaryOpen(true); } }}>{selectionMode ? "打开内部汇总" : "内部报价汇总"}</Button>
        <Button disabled={batchBusy} variant="text" onClick={() => persistPreferences({ ...preferences, presentation: preferences.presentation === "original" ? "fields" : "original" })}>{preferences.presentation === "original" ? "独立字段视图" : "原版组合视图"}</Button>
      </FloatingMenu>}
      primaryAction={<Button permission="quote.create" onClick={() => router.push("/quote-center/new")}>＋ 新建报价</Button>} />
    <Toolbar className="qc-quote-toolbar" search={<label className="qc-search-field"><span aria-hidden="true">⌕</span><input aria-label="搜索报价" placeholder="全库搜索编号、款号、款名、品牌、业务员" value={query.search} onChange={(event) => setQuery({ ...query, search: event.target.value, offset: 0 })} /></label>}
      resultSummary={page ? `显示 ${page.count} / ${page.total} 条` : ""} mobileFilterTitle="报价筛选"
      moreFilters={<><FormItem label="报价类型"><select className="qc-control" value={query.type} onChange={(event) => setQuery({ ...query, type: event.target.value, offset: 0 })}><option value="">全部类型</option><option value="distribution">经销</option><option value="processing">加工</option></select></FormItem><FormItem label="报价状态"><select className="qc-control" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value, offset: 0 })}><option value="">全部状态</option><option value="draft">草稿</option><option value="quoting">报价中</option><option value="partially_confirmed">部分确认</option><option value="confirmed">已确认</option></select></FormItem></>} />
    {selectionMode && <div className="qc-batch-selection-toolbar qc-server-selection-context"><Button disabled={batchBusy||loading} onClick={()=>choose(rows,true)}>本页全选</Button><Button disabled={batchBusy||!Object.keys(selected).length||!session.hasPermission("quote.export")||!session.hasPermission("quote.cost.view")} onClick={()=>void exportBatch()}>生成客户报价 ZIP</Button><span>已选 {Object.keys(selected).length} / 25 · 支持跨页</span></div>}{batchMessage&&<p role="status">{batchMessage}</p>}

    <ListFieldSettingsModal open={settingsOpen} settings={preferences} tablePreference={listTablePreference(preferences)} defaultVisibleColumns={normalizeServerListPreferences(userId, session.permissions).visibleColumns} defaultColumnWidths={normalizeServerListPreferences(userId, session.permissions).columnWidths} defaultColumnOrder={normalizeServerListPreferences(userId, session.permissions).columnOrder} onClose={() => setSettingsOpen(false)} onSave={(next, table, restored) => { persistPreferences({ ...next, presentation: restored ? "original" : preferences.presentation, columnOrder: table.columnOrder as BusinessColumn[], columnWidths: table.columnWidths }); setSettingsOpen(false); }} />
    {summaryOpen && <ServerSummaryModal visibleColumns={visibleBusinessColumns} permissions={session.permissions} busy={batchBusy} error={summaryError} onClose={() => { if (!batchBusy) setSummaryOpen(false); }} onGenerate={(columns, mode, estimate) => void exportSummary(columns, mode, estimate)} />}
    {!session.hasPermission("quote.view") ? <ErrorState permission title="Server HTTP 403 · 需要 quote.view" /> : loading ? <LoadingState label="读取 Server 报价" /> : error ? <ErrorState title="Server 报价不可用" description={error} onRetry={() => setRetry(retry + 1)} /> : <><Card className="qc-list-card"><DataTable layout="readable" columns={columns} rows={rows} rowKey={(row) => row.id} ariaLabel="报价列表" tablePreference={presentedTablePreference(preferences)} onTablePreferenceChange={next => persistPreferences(applyPresentedTablePreference(preferences, next))} onRowActivate={selectionMode ? undefined : row => router.push(`/quote-center/detail?id=${encodeURIComponent(row.id)}`)} renderRecord={row => <div className="qc-server-quote-record">{selectionMode && <input type="checkbox" aria-label={`选择 ${row.id}`} checked={Boolean(selected[row.id])} disabled={batchBusy} onChange={event => choose([row], event.target.checked)} />}{presentedListColumns(preferences).map(column => <div key={column.key}><small>{serverListHeader(column.fields)}</small><ServerListCell fields={column.fields} row={row} /></div>)}<Button variant="text" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(row.id)}`)}>打开报价 →</Button></div>} emptyTitle="暂无 Server 报价" emptyDescription="用户主动新建后才会出现；旧 Browser 报价不会补入。" /></Card><div className="qc-batch-selection-toolbar"><Button variant="secondary" disabled={batchBusy||!query.offset} onClick={() => setQuery({ ...query, offset: Math.max(0, query.offset - 25) })}>上一页</Button><span>本页 {page?.count} / 总计 {page?.total}</span><Button variant="secondary" disabled={batchBusy||!page || query.offset + page.count >= (page.total ?? 0)} onClick={() => setQuery({ ...query, offset: query.offset + 25 })}>下一页</Button></div></>}
  </PageContainer></AppShell>;
}
function ServerNew() {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [quoteType, setQuoteType] = useState<QuoteType>("distribution");
  const [createdId, setCreatedId] = useState("");
  const create = async () => {
    if (pending.current || uncertain) return;
    pending.current = true; setBusy(true);
    let draftId = "";
    try {
      const result = await quoteServerClient.create();
      draftId = result.quote.id; setCreatedId(draftId);
      const initialRevision = result.quote.revisions.find((revision) => revision.revisionId === result.quote.defaultRevisionId);
      if (!initialRevision) throw new Error("Missing initial Revision");
      if (initialRevision.baseInfo.quoteType !== quoteType) {
        const selected = structuredClone(result.quote);
        selected.revisions.find((revision) => revision.revisionId === selected.defaultRevisionId)!.baseInfo.quoteType = quoteType;
        await quoteServerClient.save(selected, result.version);
      }
      router.replace(`/quote-center/detail?id=${encodeURIComponent(draftId)}`);
    }
    catch (cause) {
      setError(`${safeError(cause)} ${draftId ? "草稿已创建，但所选类型尚未确认保存；请打开已创建草稿核对实际状态。" : "创建结果待核对，请返回列表检查。"} 不会重复 POST。`);
      setUncertain(true);
    }
    finally { pending.current = false; setBusy(false); }
  };
  return <AppShell title="新建报价" backTarget={{ href: "/quote-center", label: "返回报价中心" }}><PageContainer className="qc-server-new qc-original-quote-new">
    <PageHeader eyebrow="CREATE QUOTE" title="新建报价" count="尚未创建" description="选择加工或经销，创建后进入报价详情继续维护成本、附件与客户确认。" />
    {error && <ErrorState title="Server 创建未确认" description={error} />}
    {uncertain && createdId && <a href={`/quote-center/detail?id=${encodeURIComponent(createdId)}`}>打开已创建草稿（类型待核对）</a>}
    <Card className="qc-base-card qc-server-create-panel">
      <header><div><span className="qc-section-index">01</span><h2>报价基础信息</h2></div><p>加工报价与经销报价沿用各自的成本与报价规则。</p></header>
      <div className="qc-server-create-fields"><FormItem label="报价类型" required><select className="qc-control" disabled={busy || uncertain} value={quoteType} onChange={(event) => setQuoteType(event.target.value as QuoteType)}><option value="processing">加工报价</option><option value="distribution">经销报价</option></select></FormItem><p>点击创建后继续编辑款式、品牌、业务员及成本明细。返回或取消不会创建报价。</p></div>
      <footer className="qc-server-create-actions"><Button variant="secondary" disabled={busy} onClick={() => router.push('/quote-center')}>取消</Button><Button permission="quote.create" disabled={busy || uncertain} onClick={() => void create()}>{busy ? "创建 / 保存类型中…" : "创建报价"}</Button></footer>
    </Card>
  </PageContainer></AppShell>;
}
function ServerDetail() {
  const id = useSearchParams().get("id") ?? "";
  const session = useServerSession();
  const [record, setRecord] = useState<EditableServerQuoteRecord | null>(null);
  const [error, setError] = useState({ id: "", message: "" });
  useEffect(() => {
    let active = true;
    if (!id) { void Promise.resolve().then(() => setError({ id, message: "Server HTTP 404 · 缺少报价 ID" })); return; }
    void quoteServerEditorAdapter.load(id).then((result) => { if (active) { setRecord(result); setError({ id, message: "" }); } }).catch((cause) => { if (active) setError({ id, message: safeError(cause) }); });
    return () => { active = false; };
  }, [id]);
  const persistence = useMemo(() => record ? createQuoteEditorPersistence(record) : undefined, [record]);
  if (!session.hasPermission("quote.view")) return <ErrorState permission title="Server HTTP 403 · 需要 quote.view" />;
  if (error.id === id && error.message) return <AppShell title="报价详情不可用"><PageContainer><ErrorState title="Server 报价读取失败" description={error.message} /></PageContainer></AppShell>;
  if (!record || !persistence || record.quote.id !== id) return <LoadingState label="读取 Server 报价" />;
  return <QuoteEditor key={record.quote.id} initialQuote={record.quote} persistence={persistence} />;
}
export function ProductionQuoteList() { return quoteAuthority() === "server" ? <ServerList /> : <QuoteList />; }
export function ProductionQuoteNew() { return quoteAuthority() === "server" ? <ServerNew /> : <QuoteNewLoader />; }
export function ProductionQuoteDetail() { return quoteAuthority() === "server" ? <ServerDetail /> : <QuoteDetailLoader />; }

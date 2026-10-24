"use client";
import {QuoteOrderPricingDialog} from "./quote-order-pricing";
import {ProcessingQuotePushDialog} from "./processing-quote-push";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProtectedRouter as useRouter } from "@/components/foundation/server-navigation-protection";
import { AppShell, Button, Card, DataTable, ErrorState, FloatingMenu, FormItem, LoadingState, PageContainer, PageHeader, Toolbar, type DataColumn } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { quoteAuthority } from "../authority/quote-authority";
import { quoteServerClient, QuoteServerError, type QuoteServerListItem, type QuoteServerPage } from "../server/quote-server-client";
import { editableRecord, type EditableServerQuoteRecord } from "../server/quote-server-editor-adapter";
import type { CostRestrictedRecord } from "../../../server/quotes/quote-response";
import { RestrictedQuoteContent } from "./restricted-quote-content";
import { createQuoteEditorPersistence } from "../server/quote-editor-persistence";
import { QuoteList } from "./quote-list";
import { QuoteDetailLoader, QuoteEditor, QuoteNewLoader } from "./quote-editor";
import { DirectQuoteCreateButton, QuoteCreationRecovery } from "./quote-direct-create";
import { customerBatchExport, downloadCustomerFile, internalSummaryExport } from "../server/customer-export-client";
import { type BusinessColumn, type EstimateColumn } from "../model/quote-business-view";
import { listTablePreference, loadServerListPreferences, normalizeServerListPreferences, saveServerListPreferences, type ServerListPreferences } from "../server/list-preferences";
import { ListFieldSettingsModal } from "./quote-settings-modals";
import { ServerSummaryModal } from "./server-summary-modal";
import { applyPresentedTablePreference, presentedListColumns, fittedPresentedTablePreference, presentedMinWidth, presentedWidth, presentedWidthKey } from "../server/list-presentation";
import { ServerListCell, serverListHeader } from "./server-list-cell";
import { createListImageLoader } from "../server/list-image-loader";

const safeError = (error: unknown) => error && typeof error === "object" && "status" in error ? `Server HTTP ${String(error.status)}；无 Browser fallback。` : "Server 读取失败或数值无法安全转换；无 Browser fallback。";
function ServerList() {
  const router = useRouter();
  const session = useServerSession();
  const userId = session.user?.id ?? "";
  const identityScope = JSON.stringify([userId, session.permissions]);
  const imageLoader = useMemo(() => createListImageLoader({ scope: identityScope }), [identityScope]);
  useEffect(() => () => imageLoader.dispose(), [imageLoader]);
  const [storedPreferences, setStoredPreferences] = useState<ServerListPreferences | null>(null);
  const preferences = useMemo(() => normalizeServerListPreferences(userId, session.permissions, storedPreferences?.userId === userId ? storedPreferences : undefined), [userId, session.permissions, storedPreferences]);
  const visibleBusinessColumns = preferences.columnOrder.filter(k => preferences.visibleColumns.includes(k));
  const columnSignature = visibleBusinessColumns.join(",");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [priceDialog,setPriceDialog]=useState<"adjust"|"history"|null>(null);
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
  const tableContainer = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const node = tableContainer.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, error]);
  const [selectionMode,setSelectionMode]=useState<"zip"|"summary"|"processing"|null>(null);
  const [processingOpen,setProcessingOpen]=useState(false);
  const [selected,setSelected]=useState<Record<string,{version:number;label:string;quoteType?:string}>>({});
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
    const next={...selected};for(const row of items){if(selectionMode==="processing"&&row.summary?.quoteType!=="processing")continue;if(checked)next[row.id]={version:row.version,label:row.summary?.quoteStyleNo||row.quoteCode,quoteType:row.summary?.quoteType};else delete next[row.id];}
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
    }).catch((cause) => { if (active) { if (cause instanceof QuoteServerError && cause.status === 401) session.invalidate(); setError(safeError(cause)); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, retry, session, columnSignature]);
  const fittedTable=fittedPresentedTablePreference(preferences,containerWidth,selectionMode?160:104);
  const displayedTable:ReturnType<typeof fittedPresentedTablePreference>={...fittedTable,columnOrder:[...(selectionMode?["select"]:[]),...fittedTable.columnOrder,"action"],columnWidths:{...fittedTable.columnWidths,...(selectionMode?{select:56}:{}),action:104}};
  const beginSelection=(mode:"zip"|"summary"|"processing")=>{setSelectionMode(mode);setSelected({});setBatchMessage("");if(mode==="processing")setQuery(q=>({...q,type:"processing",offset:0}));};
  const modalWidths = (value: ServerListPreferences) => {
    const fitted = fittedPresentedTablePreference(value, containerWidth, selectionMode ? 160 : 104);
    return { ...listTablePreference(value).columnWidths, ...Object.fromEntries(presentedListColumns(value).map(({key}) => [presentedWidthKey(value,key),fitted.columnWidths[key]])) };
  };
  const defaults = normalizeServerListPreferences(userId, session.permissions);
  const columns: DataColumn<QuoteServerListItem>[] = [
    ...(selectionMode?[{key:"select",header:"选择",width:56,minWidth:56,sticky:"left" as const,render:(row:QuoteServerListItem)=><input type="checkbox" aria-label={`选择 ${row.id}`} disabled={batchBusy||(selectionMode==="processing"&&row.summary?.quoteType!=="processing")} checked={Boolean(selected[row.id])} onChange={e=>choose([row],e.target.checked)} />}]:[]),
    ...presentedListColumns(preferences).map(({ key, fields }) => {
      const leftSummary = (fields.length === 1 && fields[0] === "quantity") || (fields.length > 1 && fields.every(field => ["fabricCost", "trimCost", "labor"].includes(field)));
      return {
      key, header: rows.length&&rows.every(r=>r.summary?.quoteType==='processing')&&fields.includes('fabricCost')?'报价工价':rows.length&&rows.every(r=>r.summary?.quoteType==='processing')&&fields.includes('garmentPrice')?'客户确认':serverListHeader(fields),
      className: leftSummary ? "qc-server-left-summary" : undefined,
      minWidth: presentedMinWidth(key, fields),
      width: displayedTable.columnWidths[key],
      align: (!leftSummary && fields.every(field => ["quantity", "fabricCost", "trimCost", "labor", "garmentPrice", "confirmedLabor", "confirmedGarment"].includes(field)) ? "right" : "left") as "left" | "right",
      render: (row: QuoteServerListItem) => <ServerListCell fields={fields} row={row} imageLoader={imageLoader} />,
    }; }),
    { key: "action", header: "操作", minWidth: 104, width: 104, sticky: "right", render: (row) => <Button variant="text" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(row.id)}`)}>打开报价 →</Button> },
  ];
  return <AppShell title="报价中心"><PageContainer className="qc-quote-center-page qc-server-business-list">
    <PageHeader eyebrow="QUOTE CENTER" title="报价中心" count={page ? `${page.total} 条` : ""} description="按款式识别报价，区分报价历史、价格方案与客户确认。"
      secondaryActions={<FloatingMenu className="qc-list-more-actions" menuClassName="qc-list-more-menu" label="更多报价操作">
        <Button disabled={batchBusy||!session.hasPermission('quote.export')||!session.hasPermission('quote.cost.view')} variant="text" onClick={()=>beginSelection('zip')}>批量客户报价</Button>
        <Button disabled={batchBusy||!session.hasPermission('quote.export')} variant="text" onClick={()=>beginSelection('summary')}>内部报价汇总</Button>
        <Button disabled={batchBusy||!session.hasPermission('order.processing.consume')} variant="text" onClick={()=>beginSelection('processing')}>推送加工订单</Button>
        <Button disabled={batchBusy} variant="text" onClick={()=>setSettingsOpen(true)}>列表页面设置</Button>
        <Button variant="text" onClick={()=>setPriceDialog('adjust')}>批量调整订单成交价</Button>
        <Button variant="text" onClick={()=>setPriceDialog('history')}>订单调价历史</Button>
        <Button disabled={batchBusy} variant="text" onClick={() => persistPreferences({ ...preferences, presentation: preferences.presentation === "original" ? "fields" : "original" })}>{preferences.presentation === "original" ? "独立字段视图" : "原版组合视图"}</Button>
      </FloatingMenu>}
      primaryAction={<DirectQuoteCreateButton />} />
    <Toolbar className="qc-quote-toolbar" search={<label className="qc-search-field"><span aria-hidden="true">⌕</span><input aria-label="搜索报价" placeholder="全库搜索编号、款号、款名、品牌、业务员" value={query.search} onChange={(event) => setQuery({ ...query, search: event.target.value, offset: 0 })} /></label>}
      resultSummary={page ? `显示 ${page.count} / ${page.total} 条` : ""} mobileFilterTitle="报价筛选"
      moreFilters={<><FormItem label="报价类型"><select className="qc-control" value={query.type} onChange={(event) => setQuery({ ...query, type: event.target.value, offset: 0 })}><option value="">全部类型</option><option value="distribution">经销</option><option value="processing">加工</option></select></FormItem><FormItem label="报价状态"><select className="qc-control" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value, offset: 0 })}><option value="">全部状态</option><option value="draft">草稿</option><option value="quoting">报价中</option><option value="partially_confirmed">部分确认</option><option value="confirmed">已确认</option></select></FormItem></>} />
    {selectionMode&&<div className="qc-batch-selection-toolbar qc-server-selection-context"><Button disabled={batchBusy||loading} onClick={()=>choose(rows,true)}>本页全选</Button>{selectionMode==='zip'?<Button disabled={batchBusy||!Object.keys(selected).length||!session.hasPermission('quote.export')||!session.hasPermission('quote.cost.view')} onClick={()=>void exportBatch()}>生成客户报价 ZIP</Button>:selectionMode==='summary'?<Button disabled={batchBusy||!Object.keys(selected).length} onClick={()=>{setSummaryError('');setSummaryOpen(true);}}>打开内部汇总</Button>:<Button disabled={batchBusy||!Object.keys(selected).length} onClick={()=>setProcessingOpen(true)}>确认推送所选报价</Button>}<Button variant="secondary" disabled={batchBusy||processingOpen} onClick={()=>{setSelectionMode(null);setSelected({});setBatchMessage('');}}>退出选择</Button><span>已选 {Object.keys(selected).length} / 25 · 支持跨页</span></div>}{batchMessage&&<p role="status">{batchMessage}</p>}
    {processingOpen&&<ProcessingQuotePushDialog key={identityScope} selection={Object.entries(selected).map(([quoteId,v])=>({quoteId,expectedVersion:v.version}))} onClose={()=>{setProcessingOpen(false);setRetry(v=>v+1);}} onDone={()=>setRetry(v=>v+1)}/>}


    <QuoteOrderPricingDialog key={session.user?.id+JSON.stringify(session.permissions)+priceDialog} open={priceDialog!==null} historyOnly={priceDialog==="history"} onClose={()=>setPriceDialog(null)}/>
    <ListFieldSettingsModal open={settingsOpen} settings={preferences} tablePreference={{...listTablePreference(preferences),columnWidths:modalWidths(preferences)}} defaultVisibleColumns={defaults.visibleColumns} defaultColumnWidths={modalWidths(defaults)} defaultColumnOrder={defaults.columnOrder}
      getWidthOptions={(draft, order, restored) => {
        const current = { ...(restored ? normalizeServerListPreferences(userId, session.permissions) : draft), visibleColumns: draft.visibleColumns, presentation: restored ? "original" as const : draft.presentation, columnOrder: order as BusinessColumn[] };
        return presentedListColumns(current).map(({ key, fields }) => ({ key: presentedWidthKey(current, key), label: serverListHeader(fields), min: presentedMinWidth(key, fields), width: presentedWidth(current, key) }));
      }}
      onClose={() => setSettingsOpen(false)} onSave={(next, table, restored, widthEdited) => {
        const fill = restored && !widthEdited;
        persistPreferences({ ...next, widthMode: fill ? "fill" : "manual", presentation: restored ? "original" : preferences.presentation, columnOrder: table.columnOrder as BusinessColumn[], columnWidths: fill ? defaults.columnWidths : table.columnWidths, groupWidths: fill ? {} : Object.fromEntries(Object.entries(table.columnWidths).filter(([key]) => key.startsWith("group."))) });
        setSettingsOpen(false);
      }} />
    {summaryOpen && <ServerSummaryModal processingOnly={Object.values(selected).every(v=>v.quoteType==='processing')} visibleColumns={visibleBusinessColumns} permissions={session.permissions} busy={batchBusy} error={summaryError} onClose={() => { if (!batchBusy) setSummaryOpen(false); }} onGenerate={(columns, mode, estimate) => void exportSummary(columns, mode, estimate)} />}
    {!session.hasPermission("quote.view") ? <ErrorState permission title="Server HTTP 403 · 需要 quote.view" /> : loading ? <LoadingState label="读取 Server 报价" /> : error ? <ErrorState title="Server 报价不可用" description={error} onRetry={() => setRetry(retry + 1)} /> : <><Card className="qc-list-card"><div ref={tableContainer} className="qc-server-table-container"><DataTable layout="fixed" columns={columns} rows={rows} rowKey={(row) => row.id} ariaLabel="报价列表" tablePreference={displayedTable} onTablePreferenceChange={next => persistPreferences(applyPresentedTablePreference(preferences, next))} onRowActivate={selectionMode ? undefined : row => router.push(`/quote-center/detail?id=${encodeURIComponent(row.id)}`)} renderRecord={row => <div className="qc-server-quote-record">{selectionMode && <input type="checkbox" aria-label={`选择 ${row.id}`} checked={Boolean(selected[row.id])} disabled={batchBusy} onChange={event => choose([row], event.target.checked)} />}{presentedListColumns(preferences).map(column => <div key={column.key}><small>{serverListHeader(column.fields)}</small><ServerListCell fields={column.fields} row={row} imageLoader={imageLoader} /></div>)}<Button variant="text" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(row.id)}`)}>打开报价 →</Button></div>} emptyTitle="暂无 Server 报价" emptyDescription="用户主动新建后才会出现；旧 Browser 报价不会补入。" /></div></Card><div className="qc-batch-selection-toolbar"><Button variant="secondary" disabled={batchBusy||!query.offset} onClick={() => setQuery({ ...query, offset: Math.max(0, query.offset - 25) })}>上一页</Button><span>本页 {page?.count} / 总计 {page?.total}</span><Button variant="secondary" disabled={batchBusy||!page || query.offset + page.count >= (page.total ?? 0)} onClick={() => setQuery({ ...query, offset: query.offset + 25 })}>下一页</Button></div></>}
  </PageContainer></AppShell>;
}
function ServerNew() {
  const session = useServerSession();
  return <QuoteCreationRecovery key={session.user?.id ?? "anonymous"} />;
}
function ServerDetail() {
  const id = useSearchParams().get("id") ?? "";
  const session = useServerSession();
  const [record, setRecord] = useState<EditableServerQuoteRecord | null>(null);
  const [error, setError] = useState({ id: "", message: "" });
  const [restricted,setRestricted]=useState<CostRestrictedRecord|null>(null);
  const [loadedScope,setLoadedScope]=useState("");
  const scope=`${id}/${session.user?.id??""}/${session.permissions.join("|")}`;
  useEffect(() => {
    let active = true;
    if (!id) { void Promise.resolve().then(() => setError({ id, message: "Server HTTP 404 · 缺少报价 ID" })); return; }
    void quoteServerClient.getById(id).then((result) => { if (active) { setLoadedScope(scope);setRestricted(result.costVisibility==="restricted"?result:null);setRecord(result.costVisibility==="restricted"?null:editableRecord(result));setError({ id, message: "" }); } }).catch((cause) => { if (active) {if(cause instanceof QuoteServerError&&cause.status===401)session.invalidate();setLoadedScope(scope);setError({ id, message: safeError(cause) });} });
    return () => { active = false; };
  }, [id,scope,session]);
  const persistence = useMemo(() => record ? createQuoteEditorPersistence(record) : undefined, [record]);
  if (!session.hasPermission("quote.view")) return <ErrorState permission title="Server HTTP 403 · 需要 quote.view" />;
  if (loadedScope!==scope) return <LoadingState label="读取 Server 报价" />;
  if (error.id === id && error.message) return <AppShell title="报价详情不可用"><PageContainer><ErrorState title="Server 报价读取失败" description={error.message} /></PageContainer></AppShell>;
  if (restricted?.quote.id===id) return <RestrictedQuoteContent key={scope} initial={restricted} editable={session.hasPermission("quote.edit")}/>;
  if (!record || !persistence || record.quote.id !== id) return <LoadingState label="读取 Server 报价" />;
  return <QuoteEditor key={record.quote.id} initialQuote={record.quote} persistence={persistence} />;
}
export function ProductionQuoteList() { return quoteAuthority() === "server" ? <ServerList /> : <QuoteList />; }
export function ProductionQuoteNew() { return quoteAuthority() === "server" ? <ServerNew /> : <QuoteNewLoader />; }
export function ProductionQuoteDetail() { return quoteAuthority() === "server" ? <ServerDetail /> : <QuoteDetailLoader />; }

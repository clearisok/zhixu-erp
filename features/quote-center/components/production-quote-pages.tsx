"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Card, DataTable, EmptyState, ErrorState, FormItem, LoadingState, PageContainer, PageHeader, Toolbar, type DataColumn } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { quoteAuthority } from "../authority/quote-authority";
import { quoteServerClient, type QuoteServerListItem, type QuoteServerPage } from "../server/quote-server-client";
import { quoteServerEditorAdapter, type EditableServerQuoteRecord } from "../server/quote-server-editor-adapter";
import { createQuoteEditorPersistence } from "../server/quote-editor-persistence";
import { QuoteList } from "./quote-list";
import { QuoteDetailLoader, QuoteEditor, QuoteNewLoader } from "./quote-editor";

const safeError = (error: unknown) => error && typeof error === "object" && "status" in error ? `Server HTTP ${String(error.status)}；无 Browser fallback。` : "Server 读取失败或数值无法安全转换；无 Browser fallback。";
function ServerList() {
  const router = useRouter();
  const session = useServerSession();
  const [rows, setRows] = useState<QuoteServerListItem[]>([]);
  const [page, setPage] = useState<QuoteServerPage | null>(null);
  const [query, setQuery] = useState({ search: "", type: "", status: "", offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { setLoading(true); setError(""); });
    if (!session.hasPermission("quote.view")) return;
    void quoteServerClient.list({ ...query, limit: 25 }).then((result) => {
      if (!active) return;
      if (result.page.total === undefined || result.quotes.some((row) => !row.summary)) throw new Error("Incomplete Server summary");
      setRows(result.quotes); setPage(result.page);
    }).catch((cause) => { if (active) setError(safeError(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, retry, session]);
  const columns: DataColumn<QuoteServerListItem>[] = [
    { key: "quote", header: "报价编号", render: (row) => <strong>{row.quoteCode}</strong> },
    { key: "style", header: "款号 / 款名", render: (row) => <div className="qc-primary-cell"><strong>{row.summary?.quoteStyleNo || "未填写款号"}</strong><small>{row.summary?.styleName || "未填写款名"}</small></div> },
    { key: "brand", header: "品牌 / 业务员", render: (row) => <div className="qc-primary-cell"><strong>{row.summary?.brandName || "未填写品牌"}</strong><small>{row.summary?.salespersonName || "未填写业务员"}</small></div> },
    { key: "type", header: "类型 / 状态", render: (row) => `${row.summary?.quoteType === "processing" ? "加工" : "经销"} / ${row.summary?.status}` },
    { key: "revision", header: "报价版本 / 价格方案", render: (row) => `${row.summary?.revisionLabel} / ${row.summary?.priceVersionCount}` },
    { key: "date", header: "报价日期", render: (row) => row.summary?.quoteDate || "未填写" },
    { key: "action", header: "操作", render: (row) => <Button variant="text" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(row.id)}`)}>打开报价 →</Button> },
  ];
  return <AppShell title="报价中心"><PageContainer className="qc-quote-center-page">
    <PageHeader eyebrow="QUOTE CENTER · SERVER" title="报价中心" count={page ? `${page.total} 条` : ""} description="PostgreSQL 报价快照；成本统计、批量导出和整单复制尚未接线。" primaryAction={<Button permission="quote.create" onClick={() => router.push("/quote-center/new")}>＋ 新建报价</Button>} />
    <Toolbar search={<input className="qc-control" aria-label="搜索报价" placeholder="全库搜索编号、款号、款名、品牌、业务员" value={query.search} onChange={(event) => setQuery({ ...query, search: event.target.value, offset: 0 })} />}
      moreFilters={<><FormItem label="报价类型"><select className="qc-control" value={query.type} onChange={(event) => setQuery({ ...query, type: event.target.value, offset: 0 })}><option value="">全部类型</option><option value="distribution">经销</option><option value="processing">加工</option></select></FormItem><FormItem label="报价状态"><select className="qc-control" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value, offset: 0 })}><option value="">全部状态</option><option value="draft">草稿</option><option value="quoting">报价中</option><option value="partially_confirmed">部分确认</option><option value="confirmed">已确认</option></select></FormItem></>} />
    {!session.hasPermission("quote.view") ? <ErrorState permission title="Server HTTP 403 · 需要 quote.view" /> : loading ? <LoadingState label="读取 Server 报价" /> : error ? <ErrorState title="Server 报价不可用" description={error} onRetry={() => setRetry(retry + 1)} /> : <><Card><DataTable columns={columns} rows={rows} rowKey={(row) => row.id} ariaLabel="报价列表" emptyTitle="暂无 Server 报价" emptyDescription="用户主动新建后才会出现；旧 Browser 报价不会补入。" /></Card><div className="qc-batch-selection-toolbar"><Button variant="secondary" disabled={!query.offset} onClick={() => setQuery({ ...query, offset: Math.max(0, query.offset - 25) })}>上一页</Button><span>本页 {page?.count} / 总计 {page?.total}</span><Button variant="secondary" disabled={!page || query.offset + page.count >= (page.total ?? 0)} onClick={() => setQuery({ ...query, offset: query.offset + 25 })}>下一页</Button></div></>}
  </PageContainer></AppShell>;
}
function ServerNew() {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const create = async () => {
    if (pending.current || uncertain) return;
    pending.current = true; setBusy(true);
    try { const result = await quoteServerClient.create(); router.replace(`/quote-center/detail?id=${encodeURIComponent(result.quote.id)}`); }
    catch (cause) { setError(`${safeError(cause)} 创建结果待核对，请返回列表检查；不会自动重复 POST。`); setUncertain(true); }
    finally { pending.current = false; setBusy(false); }
  };
  return <AppShell title="新建报价" backTarget={{ href: "/quote-center", label: "返回报价中心" }}><PageContainer><PageHeader title="新建报价" description="打开此页不写数据库、不消耗编号。创建后进入正式编辑器。" />{error && <ErrorState title="Server 创建未确认" description={error} />}<EmptyState title="准备创建空白 Server 报价" description="ID、编号和初始版本由 Server 提供；不导入 Browser 草稿。" /><Button permission="quote.create" disabled={busy || uncertain} onClick={() => void create()}>{busy ? "创建中…" : "创建报价"}</Button></PageContainer></AppShell>;
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

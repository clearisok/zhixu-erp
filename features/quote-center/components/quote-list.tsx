"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Card, Checkbox, DataTable, PageContainer, PageHeader, StatusTag, type DataColumn } from "@/components/foundation";
import { totalPriceVersionQuantity } from "../model/quote-calculations";
import { confirmedPriceSummary, summarizeRevisionMetric } from "../model/quote-presentation";
import { defaultQuoteSettings, loadQuoteSettings, saveQuoteSettings, type ListColumnKey, type QuoteUserSettings } from "../model/quote-settings";
import { confirmationSummaryLabel, matchesQuoteSearch } from "../model/quote-workflows";
import { getCurrentRevision, type Quote } from "../model/quote-view-model";
import { mockQuoteRepository } from "../repository/mock-quote-repository";
import { ListFieldSettingsModal } from "./quote-settings-modals";
import { BatchExportModal } from "./batch-export-modal";
import { quoteListColumnDefinitionMap } from "../model/quote-list-column-definitions";
import { PermissionButton, usePermissions } from "@/features/permissions";

const statusLabels = { draft: "草稿", quoting: "报价中", partially_confirmed: "部分确认", confirmed: "全部确认" } as const;
const moneyRange = (value: number) => `¥${value.toFixed(2)}`;

export function QuoteList() {
  const router = useRouter();
  const { can } = usePermissions();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [settings, setSettings] = useState<QuoteUserSettings>(defaultQuoteSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchExportOpen, setBatchExportOpen] = useState(false);

  useEffect(() => {
    mockQuoteRepository.list().then(setQuotes);
    Promise.resolve().then(() => setSettings(loadQuoteSettings()));
  }, []);

  const rows = useMemo(() => quotes.filter((quote) => {
    const revision = getCurrentRevision(quote);
    const searchable = [quote.quoteCode, revision.baseInfo.brandName, revision.baseInfo.quoteStyleNo, revision.baseInfo.styleName, revision.baseInfo.salespersonName].join(" ");
    return matchesQuoteSearch(searchable, query) && (type === "all" || revision.baseInfo.quoteType === type) && (status === "all" || quote.aggregateStatus === status);
  }), [quotes, query, type, status]);
  const header = (key: ListColumnKey) => quoteListColumnDefinitionMap[key].label;

  const columnMap: Record<ListColumnKey, DataColumn<Quote>> = {
    quote: { key: "quote", header: header("quote"), render: (quote) => <strong>{quote.quoteCode}</strong> },
    style: { key: "style", header: header("style"), render: (quote) => { const revision = getCurrentRevision(quote); return <div className="qc-selection-style-cell">{selectionMode && <Checkbox aria-label={`选择 ${revision.baseInfo.quoteStyleNo || "未填写款号"}`} checked={selectedIds.includes(quote.id)} onClick={(event) => event.stopPropagation()} onChange={() => setSelectedIds((current) => current.includes(quote.id) ? current.filter((id) => id !== quote.id) : [...current, quote.id])} />}<span><strong>{revision.baseInfo.quoteStyleNo || "—"}</strong><small>{revision.baseInfo.styleName || "未填写款式名称"}</small></span></div>; } },
    brand: { key: "brand", header: header("brand"), render: (quote) => getCurrentRevision(quote).baseInfo.brandName || "—" },
    type: { key: "type", header: header("type"), render: (quote) => getCurrentRevision(quote).baseInfo.quoteType === "distribution" ? "经销" : "加工" },
    salesperson: { key: "salesperson", header: header("salesperson"), render: (quote) => getCurrentRevision(quote).baseInfo.salespersonName || "—" },
    versions: { key: "versions", header: header("versions"), render: (quote) => `${getCurrentRevision(quote).priceVersions.length} 个` },
    quantity: { key: "quantity", header: header("quantity"), render: (quote) => { const versions = getCurrentRevision(quote).priceVersions; return versions.every((version) => version.quantity === null) ? "—" : <strong>{totalPriceVersionQuantity(versions).toLocaleString()} 件</strong>; } },
    fabricCost: { key: "fabricCost", header: header("fabricCost"), render: (quote) => summarizeRevisionMetric(getCurrentRevision(quote), (metrics) => metrics.fabricCost, moneyRange) },
    trimCost: { key: "trimCost", header: header("trimCost"), render: (quote) => summarizeRevisionMetric(getCurrentRevision(quote), (metrics) => metrics.trimCost, moneyRange) },
    labor: { key: "labor", header: header("labor"), render: (quote) => summarizeRevisionMetric(getCurrentRevision(quote), (metrics) => metrics.laborInput, moneyRange) },
    garmentPrice: { key: "garmentPrice", header: header("garmentPrice"), render: (quote) => summarizeRevisionMetric(getCurrentRevision(quote), (metrics) => metrics.garmentSellingPrice, moneyRange) },
    confirmedLabor: { key: "confirmedLabor", header: header("confirmedLabor"), render: (quote) => confirmedPriceSummary(getCurrentRevision(quote), "confirmedLaborPrice") },
    confirmedGarment: { key: "confirmedGarment", header: header("confirmedGarment"), render: (quote) => confirmedPriceSummary(getCurrentRevision(quote), "confirmedGarmentPrice") },
    confirmationStatus: { key: "confirmationStatus", header: header("confirmationStatus"), render: (quote) => { const summary = getCurrentRevision(quote).confirmationSummary; return <StatusTag tone={summary.confirmedCount === summary.totalCount && summary.totalCount > 0 ? "success" : summary.confirmedCount > 0 ? "active" : "neutral"}>{confirmationSummaryLabel(summary)}</StatusTag>; } },
    revision: { key: "revision", header: header("revision"), render: (quote) => <span className="qc-revision-chip">{getCurrentRevision(quote).revisionLabel}</span> },
    status: { key: "status", header: header("status"), render: (quote) => <StatusTag tone={quote.aggregateStatus === "confirmed" ? "success" : quote.aggregateStatus === "partially_confirmed" ? "active" : "neutral"}>{statusLabels[quote.aggregateStatus]}</StatusTag> },
    date: { key: "date", header: header("date"), render: (quote) => getCurrentRevision(quote).baseInfo.quoteDate?.replaceAll("-", "/") || "—" },
  };
  const visibleKeys = selectionMode ? (["style", ...settings.visibleColumns.filter((key) => key !== "style")] as ListColumnKey[]) : settings.visibleColumns;
  const columns: DataColumn<Quote>[] = [...visibleKeys.map((key) => columnMap[key]).filter(Boolean), { key: "action", header: "操作", render: (quote) => <Button variant="text" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(quote.id)}`)}>打开报价 →</Button> }];

  return <AppShell title="报价中心"><PageContainer>
    <PageHeader eyebrow="QUOTE CENTER" title="报价中心" actions={<><PermissionButton permission="quote.export" variant="secondary" onClick={() => { setSelectionMode(true); setSelectedIds([]); }}>批量导出</PermissionButton><Button variant="secondary" onClick={() => setSettingsOpen(true)}>页面设置</Button><PermissionButton permission="quote.create" onClick={() => router.push("/quote-center/new")}>＋ 新建报价</PermissionButton></>} />
    <Card className="qc-filter-card"><div className="qc-filter-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="空格分词搜索多个报价款号或款式" /></div><label><span>报价类型</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部类型</option><option value="distribution">经销</option><option value="processing">加工</option></select></label><label><span>报价状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="draft">草稿</option><option value="quoting">报价中</option><option value="partially_confirmed">部分确认</option><option value="confirmed">全部确认</option></select></label></Card>
    <div className="qc-list-result-count" role="status" aria-live="polite"><strong>{rows.length}</strong><span> 条报价</span></div>
    {selectionMode && can("quote.export") && <div className="qc-batch-selection-toolbar"><strong>已选择 {selectedIds.length} 个报价</strong><Button variant="text" onClick={() => setSelectedIds((current) => [...new Set([...current, ...rows.map((quote) => quote.id)])])}>全选当前筛选结果</Button><Button disabled={!selectedIds.length} onClick={() => setBatchExportOpen(true)}>导出所选</Button><Button variant="secondary" onClick={() => { setSelectionMode(false); setSelectedIds([]); }}>退出选择</Button></div>}
    <Card className="qc-list-card">
      <div className="qc-desktop-quote-table"><DataTable rows={rows} columns={columns} rowKey={(quote) => quote.id} rowClassName={(quote) => selectedIds.includes(quote.id) ? "is-selected" : ""} empty={<div className="empty-state"><span>◇</span><strong>没有匹配的报价</strong><small>调整搜索或筛选条件后重试</small></div>} /></div>
      <div className="qc-mobile-quote-list" aria-label="报价卡片列表">
        {rows.map((quote) => {
          const revision = getCurrentRevision(quote);
          const versions = revision.priceVersions;
          const quantity = versions.every((version) => version.quantity === null) ? null : totalPriceVersionQuantity(versions);
          return <article key={quote.id} className={`qc-mobile-quote-card ${selectedIds.includes(quote.id) ? "is-selected" : ""}`} tabIndex={0} role="button" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(quote.id)}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") router.push(`/quote-center/detail?id=${encodeURIComponent(quote.id)}`); }}>
            <header>
              <div>{selectionMode && <Checkbox aria-label={`选择 ${revision.baseInfo.quoteStyleNo || "未填写款号"}`} checked={selectedIds.includes(quote.id)} onClick={(event) => event.stopPropagation()} onChange={() => setSelectedIds((current) => current.includes(quote.id) ? current.filter((id) => id !== quote.id) : [...current, quote.id])} />}<span><strong>{revision.baseInfo.quoteStyleNo || "未填写款号"}</strong></span></div>
              <StatusTag tone={quote.aggregateStatus === "confirmed" ? "success" : quote.aggregateStatus === "partially_confirmed" ? "active" : "neutral"}>{statusLabels[quote.aggregateStatus]}</StatusTag>
            </header>
            <p>{revision.baseInfo.styleName || "未填写款式名称"}</p>
            <dl>
              <div><dt>品牌</dt><dd>{revision.baseInfo.brandName || "—"}</dd></div>
              <div><dt>客户业务员</dt><dd>{revision.baseInfo.salespersonName || "—"}</dd></div>
              <div><dt>报价类型</dt><dd>{revision.baseInfo.quoteType === "distribution" ? "经销" : "加工"}</dd></div>
              <div><dt>价格版本</dt><dd>{versions.length} 个</dd></div>
              <div><dt>数量</dt><dd>{quantity === null ? "—" : `${quantity.toLocaleString()} 件`}</dd></div>
              <div><dt>客户确认</dt><dd>{confirmationSummaryLabel(revision.confirmationSummary)}</dd></div>
              <div><dt>报价日期</dt><dd>{revision.baseInfo.quoteDate?.replaceAll("-", "/") || "—"}</dd></div>
            </dl>
            <footer><span>{revision.revisionLabel}</span><strong>打开报价 →</strong></footer>
          </article>;
        })}
        {!rows.length && <div className="empty-state"><span>◇</span><strong>没有匹配的报价</strong><small>调整搜索或筛选条件后重试</small></div>}
      </div>
    </Card>
    <ListFieldSettingsModal open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onSave={(next) => { setSettings(saveQuoteSettings(next)); setSettingsOpen(false); }} />
    <BatchExportModal open={batchExportOpen} quotes={quotes.filter((quote) => selectedIds.includes(quote.id))} visibleColumns={settings.visibleColumns} onClose={() => setBatchExportOpen(false)} />
  </PageContainer></AppShell>;
}

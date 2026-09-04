"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AppShell, Button, Card, Checkbox, DataTable, EmptyState, ErrorState, FloatingMenu, FormItem, loadTablePreference, PageContainer, PageHeader, Radio, saveTablePreference, StatusTag, Toolbar, type DataColumn, type TablePreference } from "@/components/foundation";
import { totalPriceVersionQuantity } from "../model/quote-calculations";
import { confirmedPriceSummary, summarizeRevisionMetric } from "../model/quote-presentation";
import { formatFinalGarmentPrice } from "../model/final-quote-format";
import { defaultQuoteSettings, loadQuoteSettings, saveQuoteSettings, type ListColumnKey, type QuoteUserSettings } from "../model/quote-settings";
import { confirmationSummaryLabel, matchesQuoteRecordSearch, QUOTE_STRUCTURED_SEARCH_FIELDS } from "../model/quote-workflows";
import { getCurrentRevision, type Quote } from "../model/quote-view-model";
import { mockQuoteRepository } from "../repository/mock-quote-repository";
import { ListFieldSettingsModal } from "./quote-settings-modals";
import { BatchExportModal } from "./batch-export-modal";
import { quoteListColumnDefinitionMap } from "../model/quote-list-column-definitions";
import { PermissionButton, usePermissions } from "@/features/permissions";
import { createQuoteOperationLogs, operationLogRepository } from "@/features/operation-logs";
import { CopyQuoteModal } from "./copy-quote-modal";
import { revisionLegacyStyleReference, useAttachmentAsset } from "./attachment-panel";

type SelectionMode = "batch-export" | "copy-quote" | null;

const statusLabels = { draft: "草稿", quoting: "报价中", partially_confirmed: "部分确认", confirmed: "全部确认" } as const;
const moneyRange = (value: number) => `¥${value.toFixed(2)}`;
export const QUOTE_LIST_DEFAULT_COLUMN_WIDTHS: Record<string, number> = { quote: 150, style: 178, brand: 148, type: 72, salesperson: 118, versions: 96, quantity: 92, fabricCost: 108, trimCost: 108, labor: 102, garmentPrice: 110, confirmedLabor: 118, confirmedGarment: 124, confirmationStatus: 116, revision: 96, status: 92, date: 98, action: 96 };

function QuoteStyleThumbnail({ revision }: { revision: ReturnType<typeof getCurrentRevision> }) {
  const asset = useAttachmentAsset(revision.styleImageAttachmentId, revisionLegacyStyleReference(revision));
  return <span className="qc-quote-list-thumbnail">{asset ? <Image src={asset.url} alt={asset.attachment.name} fill sizes="56px" unoptimized /> : <span aria-hidden="true">◇</span>}</span>;
}

function QuoteSearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const anchor = useRef<HTMLLabelElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const open = /(?:^|\s)\/$/.test(value);
  useEffect(() => {
    if (!open) return;
    const update = () => { const rect = anchor.current?.getBoundingClientRect(); if (rect) setPosition({ left: rect.left, top: rect.bottom + 6, width: Math.max(rect.width, 360) }); };
    update(); window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open]);
  const choose = (field: string) => onChange(value.replace(/\/$/, `/${field}:`));
  return <><label ref={anchor} className="qc-search-field qc-quote-structured-search"><span>⌕</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="搜索款号、品牌、业务员、制作国家；输入 / 精确筛选" aria-label="搜索报价" /></label>{open && position && typeof document !== "undefined" && createPortal(<div className="qc-quote-search-suggestions qc-foundation-portal" role="listbox" aria-label="精确筛选字段" style={position}>{QUOTE_STRUCTURED_SEARCH_FIELDS.map((field) => <button type="button" role="option" aria-selected="false" key={field} onClick={() => choose(field)}><strong>{field}</strong><span>/{field}:</span></button>)}</div>, document.body)}</>;
}

export function QuoteList() {
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [settings, setSettings] = useState<QuoteUserSettings>(defaultQuoteSettings);
  const [tablePreference, setTablePreference] = useState<TablePreference>({ moduleKey: "quote-center", tableKey: "quote-center.quote-list", columnWidths: QUOTE_LIST_DEFAULT_COLUMN_WIDTHS });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  const [copyQuoteOpen, setCopyQuoteOpen] = useState(false);

  const loadQuotes = () => {
    setLoading(true);
    setLoadError(null);
    mockQuoteRepository.list().then(setQuotes).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "报价数据加载失败")).finally(() => setLoading(false));
  };

  useEffect(() => {
    mockQuoteRepository.list().then(setQuotes).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "报价数据加载失败")).finally(() => setLoading(false));
    Promise.resolve().then(() => { setSettings(loadQuoteSettings(currentUser.id)); setTablePreference(loadTablePreference(currentUser.id, "quote-center", "quote-center.quote-list", QUOTE_LIST_DEFAULT_COLUMN_WIDTHS)); });
  }, [currentUser.id]);

  const rows = useMemo(() => quotes.filter((quote) => {
    const revision = getCurrentRevision(quote);
    return matchesQuoteRecordSearch(quote, query) && (type === "all" || revision.baseInfo.quoteType === type) && (status === "all" || quote.aggregateStatus === status);
  }), [quotes, query, type, status]);
  const header = (key: ListColumnKey) => quoteListColumnDefinitionMap[key].label;
  const salespersonHasOwnColumn = settings.visibleColumns.includes("salesperson");

  const columnMap: Record<ListColumnKey, DataColumn<Quote>> = {
    quote: { key: "quote", header: header("quote"), render: (quote) => <strong>{quote.quoteCode}</strong> },
    style: { key: "style", header: "款式图 / 款式", render: (quote) => { const revision = getCurrentRevision(quote); return <div className="qc-selection-style-cell">{selectionMode === "batch-export" && <Checkbox aria-label={`选择 ${revision.baseInfo.quoteStyleNo || "未填写款号"}`} checked={selectedIds.includes(quote.id)} onClick={(event) => event.stopPropagation()} onChange={() => setSelectedIds((current) => current.includes(quote.id) ? current.filter((id) => id !== quote.id) : [...current, quote.id])} />}{selectionMode === "copy-quote" && <Radio name="copy-quote-source" aria-label={`复制 ${revision.baseInfo.quoteStyleNo || "未填写款号"}`} checked={selectedQuoteId === quote.id} onClick={(event) => event.stopPropagation()} onChange={() => setSelectedQuoteId(quote.id)} />}<QuoteStyleThumbnail revision={revision} /><span><strong>{revision.baseInfo.quoteStyleNo || "—"}</strong><small>{revision.baseInfo.styleName || "未填写款式名称"}</small></span></div>; } },
    brand: { key: "brand", header: salespersonHasOwnColumn ? "品牌 / 业务员" : "品牌 / 客户业务员", render: (quote) => { const base = getCurrentRevision(quote).baseInfo; return <div className="qc-primary-cell"><strong>{base.brandName || "—"}</strong><small>{base.salespersonName || "未填写客户业务员"}</small></div>; } },
    type: { key: "type", header: header("type"), render: (quote) => getCurrentRevision(quote).baseInfo.quoteType === "distribution" ? "经销" : "加工" },
    salesperson: { key: "salesperson", header: header("salesperson"), render: (quote) => getCurrentRevision(quote).baseInfo.salespersonName || "—" },
    versions: { key: "versions", header: "价格方案", render: (quote) => { const versions = getCurrentRevision(quote).priceVersions; return <div className="qc-price-version-cell"><strong>{versions.length} 个 PriceVersion</strong><small>{versions.slice(0, 2).map((version) => version.pricingParameters.manufacturingCountry || version.name).join(" · ") || "—"}</small></div>; } },
    quantity: { key: "quantity", header: header("quantity"), render: (quote) => { const versions = getCurrentRevision(quote).priceVersions; return versions.every((version) => version.quantity === null) ? "—" : <strong>{totalPriceVersionQuantity(versions).toLocaleString()} 件</strong>; } },
    fabricCost: { key: "fabricCost", header: header("fabricCost"), render: (quote) => summarizeRevisionMetric(getCurrentRevision(quote), (metrics) => metrics.fabricCost, moneyRange) },
    trimCost: { key: "trimCost", header: header("trimCost"), render: (quote) => summarizeRevisionMetric(getCurrentRevision(quote), (metrics) => metrics.trimCost, moneyRange) },
    labor: { key: "labor", header: header("labor"), render: (quote) => summarizeRevisionMetric(getCurrentRevision(quote), (metrics) => metrics.laborInput, moneyRange) },
    garmentPrice: { key: "garmentPrice", header: header("garmentPrice"), render: (quote) => summarizeRevisionMetric(getCurrentRevision(quote), (metrics) => metrics.garmentSellingPrice, formatFinalGarmentPrice) },
    confirmedLabor: { key: "confirmedLabor", header: header("confirmedLabor"), render: (quote) => confirmedPriceSummary(getCurrentRevision(quote), "confirmedLaborPrice") },
    confirmedGarment: { key: "confirmedGarment", header: header("confirmedGarment"), render: (quote) => confirmedPriceSummary(getCurrentRevision(quote), "confirmedGarmentPrice") },
    confirmationStatus: { key: "confirmationStatus", header: header("confirmationStatus"), render: (quote) => { const summary = getCurrentRevision(quote).confirmationSummary; return <StatusTag tone={summary.confirmedCount === summary.totalCount && summary.totalCount > 0 ? "success" : summary.confirmedCount > 0 ? "active" : "neutral"}>{confirmationSummaryLabel(summary)}</StatusTag>; } },
    revision: { key: "revision", header: "报价历史", render: (quote) => <div className="qc-revision-context-cell"><span className="qc-revision-chip">{getCurrentRevision(quote).revisionLabel}</span><small>QuoteRevision</small></div> },
    status: { key: "status", header: header("status"), render: (quote) => <StatusTag tone={quote.aggregateStatus === "confirmed" ? "success" : quote.aggregateStatus === "partially_confirmed" ? "active" : "neutral"}>{statusLabels[quote.aggregateStatus]}</StatusTag> },
    date: { key: "date", header: header("date"), render: (quote) => getCurrentRevision(quote).baseInfo.quoteDate?.replaceAll("-", "/") || "—" },
  };
  const visibleKeys = selectionMode !== null ? (["style", ...settings.visibleColumns.filter((key) => key !== "style")] as ListColumnKey[]) : settings.visibleColumns;
  const columns: DataColumn<Quote>[] = [...visibleKeys.map((key) => ({ ...columnMap[key], width: tablePreference.columnWidths[key] })).filter(Boolean), { key: "action", header: "操作", width: tablePreference.columnWidths.action, sticky: "right", render: (quote) => <Button variant="text" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(quote.id)}`)}>打开报价 →</Button> }];

  if (!can("quote.view")) return <AppShell title="报价中心"><PageContainer><Card><ErrorState permission title="暂无报价查看权限" description="请联系管理员分配 quote.view 权限。" /></Card></PageContainer></AppShell>;

  const filters = <><FormItem label="报价类型"><select className="qc-control" value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部类型</option><option value="distribution">经销</option><option value="processing">加工</option></select></FormItem><FormItem label="报价状态"><select className="qc-control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="draft">草稿</option><option value="quoting">报价中</option><option value="partially_confirmed">部分确认</option><option value="confirmed">全部确认</option></select></FormItem></>;

  return <AppShell title="报价中心"><PageContainer className="qc-quote-center-page">
    <PageHeader eyebrow="QUOTE CENTER" title="报价中心" count={`${rows.length} 条`} description="按款式识别报价，区分报价历史、价格方案与客户确认。" secondaryActions={<FloatingMenu className="qc-list-more-actions" menuClassName="qc-list-more-menu" label="更多报价操作"><PermissionButton permission="quote.export" variant="text" onClick={() => { setSelectionMode("batch-export"); setSelectedIds([]); setSelectedQuoteId(""); }}>批量导出</PermissionButton><PermissionButton permission="quote.create" variant="text" onClick={() => { setSelectionMode("copy-quote"); setSelectedQuoteId(""); setSelectedIds([]); }}>复制报价</PermissionButton><Button variant="text" onClick={() => setSettingsOpen(true)}>页面设置</Button></FloatingMenu>} primaryAction={<PermissionButton permission="quote.create" onClick={() => router.push("/quote-center/new")}>＋ 新建报价</PermissionButton>} />
    <Toolbar className="qc-quote-toolbar" search={<QuoteSearchField value={query} onChange={setQuery} />} moreFilters={filters} resultSummary={`显示 ${rows.length} / ${quotes.length} 条`} mobileFilterTitle="报价筛选" />
    {selectionMode === "batch-export" && can("quote.export") && <div className="qc-batch-selection-toolbar"><strong>批量导出 · 已选择 {selectedIds.length} 个报价</strong><Button variant="text" onClick={() => setSelectedIds((current) => [...new Set([...current, ...rows.map((quote) => quote.id)])])}>全选当前筛选结果</Button><Button disabled={!selectedIds.length} onClick={() => setBatchExportOpen(true)}>导出所选</Button><Button variant="secondary" onClick={() => { setSelectionMode(null); setSelectedIds([]); }}>退出选择</Button></div>}
    {selectionMode === "copy-quote" && can("quote.create") && <div className="qc-batch-selection-toolbar qc-copy-selection-toolbar"><strong>复制报价 · {selectedQuoteId ? "已选择 1 个报价" : "请选择一个来源报价"}</strong><span>复制来源为所选报价的当前默认报价版本</span><Button disabled={!selectedQuoteId} onClick={() => setCopyQuoteOpen(true)}>继续复制</Button><Button variant="secondary" onClick={() => { setSelectionMode(null); setSelectedQuoteId(""); }}>取消复制</Button></div>}
    <Card className="qc-list-card">
      <div className="qc-desktop-quote-table"><DataTable rows={rows} columns={columns} rowKey={(quote) => quote.id} rowClassName={(quote) => selectedIds.includes(quote.id) || selectedQuoteId === quote.id ? "is-selected" : ""} loading={loading} error={loadError} onRetry={loadQuotes} onRowActivate={selectionMode === null ? (quote) => router.push(`/quote-center/detail?id=${encodeURIComponent(quote.id)}`) : undefined} empty={<EmptyState title="没有匹配的报价" description="调整搜索或筛选条件后重试。" />} ariaLabel="报价中心列表" /></div>
      <div className="qc-mobile-quote-list" aria-label="报价卡片列表">
        {rows.map((quote) => {
          const revision = getCurrentRevision(quote);
          const versions = revision.priceVersions;
          const quantity = versions.every((version) => version.quantity === null) ? null : totalPriceVersionQuantity(versions);
          const chooseOrOpen = () => { if (selectionMode === "batch-export") setSelectedIds((current) => current.includes(quote.id) ? current.filter((id) => id !== quote.id) : [...current, quote.id]); else if (selectionMode === "copy-quote") setSelectedQuoteId(quote.id); else router.push(`/quote-center/detail?id=${encodeURIComponent(quote.id)}`); };
          return <article key={quote.id} className={`qc-mobile-quote-card ${selectedIds.includes(quote.id) || selectedQuoteId === quote.id ? "is-selected" : ""}`} tabIndex={0} role="button" onClick={chooseOrOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") chooseOrOpen(); }}>
            <header>
              <div>{selectionMode === "batch-export" && <Checkbox aria-label={`选择 ${revision.baseInfo.quoteStyleNo || "未填写款号"}`} checked={selectedIds.includes(quote.id)} onClick={(event) => event.stopPropagation()} onChange={() => setSelectedIds((current) => current.includes(quote.id) ? current.filter((id) => id !== quote.id) : [...current, quote.id])} />}{selectionMode === "copy-quote" && <Radio name="copy-quote-source-mobile" aria-label={`复制 ${revision.baseInfo.quoteStyleNo || "未填写款号"}`} checked={selectedQuoteId === quote.id} onClick={(event) => event.stopPropagation()} onChange={() => setSelectedQuoteId(quote.id)} />}<span><strong>{revision.baseInfo.quoteStyleNo || "未填写款号"}</strong></span></div>
              <StatusTag tone={quote.aggregateStatus === "confirmed" ? "success" : quote.aggregateStatus === "partially_confirmed" ? "active" : "neutral"}>{statusLabels[quote.aggregateStatus]}</StatusTag>
            </header>
            <p>{revision.baseInfo.styleName || "未填写款式名称"}</p>
            <dl>
              <div><dt>品牌 / 客户</dt><dd>{revision.baseInfo.brandName || "—"}<small>{revision.baseInfo.salespersonName || "—"}</small></dd></div>
              <div><dt>报价类型</dt><dd>{revision.baseInfo.quoteType === "distribution" ? "经销" : "加工"}</dd></div>
              <div><dt>报价历史</dt><dd>{revision.revisionLabel}<small>QuoteRevision</small></dd></div>
              <div><dt>价格方案</dt><dd>{versions.length} 个<small>PriceVersion</small></dd></div>
              <div><dt>数量</dt><dd>{quantity === null ? "—" : `${quantity.toLocaleString()} 件`}</dd></div>
              <div className="qc-mobile-final-price"><dt>最终报价</dt><dd>{summarizeRevisionMetric(revision, (versionMetrics) => versionMetrics.garmentSellingPrice, formatFinalGarmentPrice)}</dd></div>
              <div><dt>客户确认</dt><dd>{confirmationSummaryLabel(revision.confirmationSummary)}</dd></div>
              <div><dt>报价状态</dt><dd>{statusLabels[quote.aggregateStatus]}</dd></div>
              <div><dt>报价日期</dt><dd>{revision.baseInfo.quoteDate?.replaceAll("-", "/") || "—"}</dd></div>
            </dl>
            <footer><span>{revision.revisionLabel}</span><strong>打开报价 →</strong></footer>
          </article>;
        })}
        {!rows.length && <div className="empty-state"><span>◇</span><strong>没有匹配的报价</strong><small>调整搜索或筛选条件后重试</small></div>}
      </div>
    </Card>
    <ListFieldSettingsModal open={settingsOpen} settings={settings} tablePreference={tablePreference} defaultColumnWidths={QUOTE_LIST_DEFAULT_COLUMN_WIDTHS} onClose={() => setSettingsOpen(false)} onSave={(next, preference) => { setSettings(saveQuoteSettings(next)); setTablePreference(saveTablePreference(currentUser.id, preference, QUOTE_LIST_DEFAULT_COLUMN_WIDTHS)); setSettingsOpen(false); }} />
    <BatchExportModal open={batchExportOpen} quotes={quotes.filter((quote) => selectedIds.includes(quote.id))} visibleColumns={settings.visibleColumns} onClose={() => setBatchExportOpen(false)} />
    <CopyQuoteModal open={copyQuoteOpen} source={quotes.find((quote) => quote.id === selectedQuoteId) ?? null} quotes={quotes} createdBy={currentUser.name} onClose={() => setCopyQuoteOpen(false)} onCreated={async (copied) => { await operationLogRepository.appendMany(createQuoteOperationLogs(null, copied, { userId: currentUser.id, userName: currentUser.name })); setQuotes((current) => [copied, ...current]); setCopyQuoteOpen(false); setSelectionMode(null); setSelectedQuoteId(""); router.push(`/quote-center/detail?id=${encodeURIComponent(copied.id)}`); }} />
  </PageContainer></AppShell>;
}

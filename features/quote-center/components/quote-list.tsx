"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Card, DataTable, PageContainer, PageHeader, StatusTag, type DataColumn } from "@/components/foundation";
import { calculatePriceVersionMetrics, totalPriceVersionQuantity } from "../model/quote-calculations";
import type { ListColumnKey } from "../model/quote-settings";
import { matchesQuoteSearch } from "../model/quote-workflows";
import { getCurrentRevision, type Quote } from "../model/quote-view-model";
import { mockQuoteRepository } from "../repository/mock-quote-repository";

const statusLabels = { draft: "草稿", quoting: "报价中", partially_confirmed: "部分确认", confirmed: "全部确认" } as const;
const money = (value: number | null | undefined) => value === null || value === undefined ? "—" : `¥${value.toFixed(2)}`;

export function QuoteList() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    mockQuoteRepository.list().then(setQuotes);
  }, []);

  const rows = useMemo(() => quotes.filter((quote) => {
    const revision = getCurrentRevision(quote);
    const searchable = [quote.quoteCode, revision.baseInfo.brandName, revision.baseInfo.quoteStyleNo, revision.baseInfo.styleName, revision.baseInfo.salespersonName].join(" ");
    return matchesQuoteSearch(searchable, query) && (type === "all" || revision.baseInfo.quoteType === type) && (status === "all" || quote.aggregateStatus === status);
  }), [quotes, query, type, status]);

  const columnMap: Record<ListColumnKey, DataColumn<Quote>> = {
    quote: { key: "quote", header: "报价编号 / 品牌", render: (quote) => { const revision = getCurrentRevision(quote); return <><strong>{quote.quoteCode}</strong><small>{revision.baseInfo.brandName}</small></>; } },
    style: { key: "style", header: "报价款号 / 款式", render: (quote) => { const revision = getCurrentRevision(quote); return <><strong>{revision.baseInfo.styleName}</strong><small>{revision.baseInfo.quoteStyleNo}</small></>; } },
    type: { key: "type", header: "报价类型", render: (quote) => getCurrentRevision(quote).baseInfo.quoteType === "distribution" ? "经销" : "加工" },
    sales: { key: "sales", header: "业务员", render: (quote) => getCurrentRevision(quote).baseInfo.salespersonName },
    versions: { key: "versions", header: "价格版本", render: (quote) => `${getCurrentRevision(quote).priceVersions.length} 个` },
    quantity: { key: "quantity", header: "总数量", render: (quote) => <strong>{totalPriceVersionQuantity(getCurrentRevision(quote).priceVersions).toLocaleString()} 件</strong> },
    fabricCost: { key: "fabricCost", header: "面料成本", render: (quote) => { const revision = getCurrentRevision(quote); const version = revision.priceVersions[0]; return version ? money(calculatePriceVersionMetrics(version, revision.pricingParameters.laborCurrency, revision.pricingParameters.usdCnyRate, revision.pricingParameters.markupRate).fabricCost) : "—"; } },
    trimCost: { key: "trimCost", header: "辅料成本", render: (quote) => { const revision = getCurrentRevision(quote); const version = revision.priceVersions[0]; return version ? money(calculatePriceVersionMetrics(version, revision.pricingParameters.laborCurrency, revision.pricingParameters.usdCnyRate, revision.pricingParameters.markupRate).trimCost) : "—"; } },
    confirmedLabor: { key: "confirmedLabor", header: "客人确认工价", render: (quote) => money(getCurrentRevision(quote).priceVersions.find((version) => version.confirmation)?.confirmation?.confirmedLaborPrice) },
    confirmedGarment: { key: "confirmedGarment", header: "客人确认成衣价格", render: (quote) => money(getCurrentRevision(quote).priceVersions.find((version) => version.confirmation)?.confirmation?.confirmedGarmentPrice) },
    revision: { key: "revision", header: "当前 Revision", render: (quote) => <span className="qc-revision-chip">{getCurrentRevision(quote).revisionLabel}</span> },
    status: { key: "status", header: "状态", render: (quote) => <StatusTag tone={quote.aggregateStatus === "confirmed" ? "success" : quote.aggregateStatus === "partially_confirmed" ? "active" : "neutral"}>{statusLabels[quote.aggregateStatus]}</StatusTag> },
    date: { key: "date", header: "报价日期", render: (quote) => getCurrentRevision(quote).baseInfo.quoteDate?.replaceAll("-", "/") || "—" },
  };
  const visibleColumns: ListColumnKey[] = ["quote", "style", "type", "sales", "versions", "quantity", "revision", "status", "date"];
  const columns: DataColumn<Quote>[] = [...visibleColumns.map((key) => columnMap[key]), { key: "action", header: "操作", render: (quote) => <Button variant="text" onClick={() => router.push(`/quote-center/detail?id=${encodeURIComponent(quote.id)}`)}>打开报价 →</Button> }];

  return <AppShell title="报价中心"><PageContainer>
    <PageHeader eyebrow="QUOTE CENTER" title="报价中心" actions={<Button onClick={() => router.push("/quote-center/new")}>＋ 新建报价</Button>} />
    <Card className="qc-filter-card"><div className="qc-filter-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="空格分词搜索多个报价款号或款式" /></div><label><span>报价类型</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部类型</option><option value="distribution">经销</option><option value="processing">加工</option></select></label><label><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="draft">草稿</option><option value="quoting">报价中</option><option value="partially_confirmed">部分确认</option><option value="confirmed">全部确认</option></select></label><div className="qc-result-count"><strong>{rows.length}</strong><span>条报价</span></div></Card>
    <Card className="qc-list-card"><DataTable rows={rows} columns={columns} rowKey={(quote) => quote.id} empty={<div className="empty-state"><span>◇</span><strong>没有匹配的报价</strong><small>调整搜索或筛选条件后重试</small></div>} /></Card>
  </PageContainer></AppShell>;
}

"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Modal } from "@/components/foundation";
import { listColumnOptions, type ListColumnKey } from "../model/quote-settings";
import type { Quote } from "../model/quote-view-model";
import { indexedDbAttachmentRepository } from "../repository/indexeddb-attachment-repository";
import type { EstimateSummaryColumn, QuoteSummaryRowMode } from "../export/quote-batch-exporter";
import { usePermissions } from "@/features/permissions";
import { createBatchExportQuoteSnapshots, createOperationLogDraft, operationLogRepository } from "@/features/operation-logs";

export function BatchExportModal({ open, quotes, visibleColumns, onClose }: { open: boolean; quotes: Quote[]; visibleColumns: ListColumnKey[]; onClose: () => void }) {
  const { currentUser } = usePermissions();
  const [type, setType] = useState<"quote" | "summary">("quote");
  const [rowMode, setRowMode] = useState<QuoteSummaryRowMode>("quote");
  const [columns, setColumns] = useState<ListColumnKey[]>(visibleColumns);
  const [adjustColumns, setAdjustColumns] = useState(false);
  const [estimateColumns, setEstimateColumns] = useState<EstimateSummaryColumn[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  useEffect(() => { if (open) Promise.resolve().then(() => { setColumns(visibleColumns); setResult(""); setBusy(false); }); }, [open, visibleColumns]);
  const toggle = <T extends string>(items: T[], value: T) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
  const submit = async () => {
    if (!quotes.length || busy) return;
    setBusy(true); setResult("");
    try {
      const { exportQuoteSummary, exportQuoteZip } = await import("../export/quote-batch-exporter");
      const exportQuotes = createBatchExportQuoteSnapshots(quotes);
      if (type === "quote") {
        const outcome = await exportQuoteZip({ quotes, attachmentRepository: indexedDbAttachmentRepository });
        const failedByQuoteId = new Map(outcome.failed.map((item) => [item.quoteId, item.reason]));
        const loggedQuotes = exportQuotes.map((quote) => failedByQuoteId.has(quote.quoteId)
          ? { ...quote, exportStatus: "failed" as const, failureReason: failedByQuoteId.get(quote.quoteId) }
          : { ...quote, exportStatus: "success" as const });
        setResult(`成功 ${outcome.success}，失败 ${outcome.failed.length}${outcome.failed.length ? `；失败报价：${outcome.failed.map((item) => `${item.quote}（${item.reason}）`).join("、")}` : ""}`);
        await operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "报价中心", entityType: "Export", entityId: `batch-quote-${Date.now()}`, action: "批量导出", afterData: { values: { "导出类型": "报价单", "选择报价数": quotes.length, "成功": outcome.success, "失败": outcome.failed.length }, exportQuotes: loggedQuotes } }));
      } else {
        const outcome = await exportQuoteSummary({ quotes, visibleColumns: columns, rowMode, estimateColumns });
        setResult(`已生成 ${outcome.rowCount} 行报价汇总`);
        await operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "报价中心", entityType: "Export", entityId: `batch-summary-${Date.now()}`, action: "导出报价汇总表", afterData: { values: { "导出类型": "报价汇总表", "选择报价数": quotes.length, "导出行数": outcome.rowCount, "行模式": rowMode }, exportQuotes } }));
      }
    } catch (error) { setResult(error instanceof Error ? error.message : "批量导出失败"); }
    finally { setBusy(false); }
  };
  return <Modal open={open} className="qc-batch-export-modal" title="导出所选报价" description={`已选择 ${quotes.length} 个报价`} onClose={onClose} onSubmit={submit} footer={<><Button variant="secondary" onClick={onClose}>关闭</Button><Button type="submit" disabled={!quotes.length || busy}>{busy ? "正在导出…" : "开始导出"}</Button></>}>
    <div className="qc-batch-export-options"><section><strong>导出类型</strong><label><input type="radio" checked={type === "quote"} onChange={() => setType("quote")} />报价单<small>每个报价一个 xlsx，合并下载为 ZIP</small></label><label><input type="radio" checked={type === "summary"} onChange={() => setType("summary")} />报价汇总表<small>内部管理 Excel，复用当前列表字段定义</small></label></section>
    {type === "summary" && <><section><strong>价格版本展示</strong><label><input type="radio" checked={rowMode === "quote"} onChange={() => setRowMode("quote")} />每个款式一行<small>多价格版本使用当前列表的 aggregate / range 规则</small></label><label><input type="radio" checked={rowMode === "price-version"} onChange={() => setRowMode("price-version")} />每个价格版本一行<small>自动增加价格版本列，数量和确认使用该版本值</small></label></section><section><div className="qc-batch-section-title"><strong>导出字段</strong><Button variant="text" onClick={() => { setAdjustColumns((current) => !current); if (!adjustColumns) setColumns(visibleColumns); }}>{adjustColumns ? "收起调整" : "调整导出字段"}</Button></div><small>默认使用当前 Quote Center 页面显示字段，不会修改页面设置。</small>{adjustColumns && <div className="qc-batch-field-grid">{listColumnOptions.map((item) => <label key={item.key}><Checkbox checked={columns.includes(item.key)} onChange={() => setColumns((current) => toggle(current, item.key))} />{item.label}</label>)}</div>}</section><section><strong>内部估算字段（默认不选）</strong><div className="qc-batch-field-grid">{([['estimateTotal','估算总成本'],['estimateRevision','估算成本来源报价版本'],['estimateDifference','销售价与估算成本差额']] as Array<[EstimateSummaryColumn,string]>).map(([key,label]) => <label key={key}><Checkbox checked={estimateColumns.includes(key)} onChange={() => setEstimateColumns((current) => toggle(current, key))} />{label}</label>)}</div></section></>}
    {result && <div className="qc-batch-export-result">{result}</div>}</div>
  </Modal>;
}

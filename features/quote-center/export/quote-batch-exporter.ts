import { buildQuoteSummaryTable } from "./quote-summary-core.ts";
import type { AttachmentRepository } from "../repository/attachment-repository.ts";
import { quoteListColumnDefinitionMap, type ListColumnKey } from "../model/quote-list-column-definitions.ts";
import { estimateCostTotal } from "../model/estimate-cost.ts";
import { nullablePriceVersionMetrics } from "../model/quote-presentation.ts";
import { getDefaultRevision, type Quote } from "../model/quote-view-model.ts";
import { buildDefaultQuoteRevisionExcel } from "./quote-excel-exporter.ts";

export type QuoteSummaryRowMode = "quote" | "price-version";
export type EstimateSummaryColumn = "estimateTotal" | "estimateRevision" | "estimateDifference";
export type QuoteSummaryExportInput = { quotes: Quote[]; visibleColumns: Array<ListColumnKey | "style">; rowMode: QuoteSummaryRowMode; estimateColumns?: EstimateSummaryColumn[]; now?: Date };

const estimateLabels: Record<EstimateSummaryColumn, string> = { estimateTotal: "估算总成本", estimateRevision: "估算成本来源报价版本", estimateDifference: "销售价与估算成本差额" };
const dateStamp = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
const safeName = (value: string) => value.replace(/[\\/:*?"<>|]/g, "-").trim() || "未命名报价";
function download(buffer: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function differenceValue(quote: Quote, priceVersionId?: string): string | number | null {
  const estimate = quote.activeEstimateCost;
  const total = estimate ? estimateCostTotal(estimate) : null;
  if (total === null) return null;
  const revision = getDefaultRevision(quote);
  if (priceVersionId) {
    const version = revision.priceVersions.find((item) => item.id === priceVersionId);
    const sales = version ? nullablePriceVersionMetrics(version).garmentSellingPrice : null;
    return sales === null ? null : sales - total;
  }
  const values = revision.priceVersions.map((version) => nullablePriceVersionMetrics(version).garmentSellingPrice).filter((value): value is number => value !== null).map((value) => value - total);
  if (!values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  return min === max ? min : `${min.toFixed(2)} - ${max.toFixed(2)}`;
}

export async function buildQuoteSummaryExcel(input: QuoteSummaryExportInput): Promise<{ buffer: ArrayBuffer; fileName: string; rowCount: number; headers: string[] }> {
  const now = input.now ?? new Date();
  const sourceColumns = [...input.visibleColumns];
  const columns = sourceColumns.map((key) => key === "style" ? "styleIdentity" : key);
  const headers = columns.map((key, index) => sourceColumns[index] === "style" ? "报价款号 / 款式" : input.rowMode === "price-version" && key === "quantity" ? "数量" : quoteListColumnDefinitionMap[key].label);
  if (input.rowMode === "price-version") headers.splice(1, 0, "价格版本");
  for (const key of input.estimateColumns ?? []) headers.push(estimateLabels[key]);
  const rows: Array<Array<string | number | null>> = [];
  for (const quote of input.quotes) {
    const revision = getDefaultRevision(quote);
    const versions = input.rowMode === "price-version" ? revision.priceVersions : [undefined];
    for (const version of versions) {
      const row = columns.map((key) => quoteListColumnDefinitionMap[key].value(quote, version));
      if (input.rowMode === "price-version") row.splice(1, 0, version?.name ?? "");
      for (const key of input.estimateColumns ?? []) {
        if (key === "estimateTotal") row.push(quote.activeEstimateCost ? estimateCostTotal(quote.activeEstimateCost) : null);
        if (key === "estimateRevision") row.push(quote.activeEstimateCost ? quote.revisions.find((item) => item.revisionId === quote.activeEstimateCost?.basedOnRevisionId)?.revisionLabel ?? quote.activeEstimateCost.basedOnRevisionId : null);
        if (key === "estimateDifference") row.push(differenceValue(quote, version?.id));
      }
      rows.push(row);
    }
  }
  return buildQuoteSummaryTable({ headers, rows: rows.map(row => row.map(value => ({ value }))), now });
}

export async function exportQuoteSummary(input: QuoteSummaryExportInput) {
  const result = await buildQuoteSummaryExcel(input);
  download(result.buffer, result.fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return result;
}

export async function buildQuoteZipBundle(input: { quotes: Quote[]; attachmentRepository: AttachmentRepository; now?: Date; buildQuote?: typeof buildDefaultQuoteRevisionExcel }): Promise<{ success: number; failed: Array<{ quoteId: string; quote: string; reason: string }>; fileName: string | null; buffer: Uint8Array | null }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const failed: Array<{ quoteId: string; quote: string; reason: string }> = [];
  const now = input.now ?? new Date();
  const usedNames = new Set<string>();
  let success = 0;
  for (const quote of input.quotes) {
    const revision = getDefaultRevision(quote);
    const styleNo = revision.baseInfo.quoteStyleNo || quote.quoteCode;
    try {
      const result = await (input.buildQuote ?? buildDefaultQuoteRevisionExcel)({ quote, revision, priceVersions: revision.priceVersions, attachmentRepository: input.attachmentRepository, now });
      const baseName = `${safeName(styleNo)}_${safeName(revision.revisionLabel)}_${dateStamp(now)}`;
      let entryName = `${baseName}.xlsx`; let suffix = 2;
      while (usedNames.has(entryName)) entryName = `${baseName}_${suffix++}.xlsx`;
      usedNames.add(entryName); zip.file(entryName, result.buffer);
      success += 1;
    } catch (error) {
      failed.push({ quoteId: quote.id, quote: styleNo, reason: error instanceof Error ? error.message : "导出失败" });
    }
  }
  if (!success) return { success, failed, fileName: null, buffer: null };
  const fileName = `报价单_${dateStamp(now)}.zip`;
  return { success, failed, fileName, buffer: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }) };
}

export async function exportQuoteZip(input: { quotes: Quote[]; attachmentRepository: AttachmentRepository; now?: Date }): Promise<{ success: number; failed: Array<{ quoteId: string; quote: string; reason: string }>; fileName: string | null }> {
  const result = await buildQuoteZipBundle(input);
  if (result.buffer && result.fileName) {
    const browserBuffer = new Uint8Array(result.buffer.byteLength);
    browserBuffer.set(result.buffer);
    download(browserBuffer.buffer, result.fileName, "application/zip");
  }
  return { success: result.success, failed: result.failed, fileName: result.fileName };
}

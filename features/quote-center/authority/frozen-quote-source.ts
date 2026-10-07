import { LOCAL_DATA_SCHEMA_VERSION, type LocalDataStore } from "../../data-management/repository/local-data-store.ts";
import type { Quote } from "../model/quote-view-model.ts";

export class FrozenQuoteSourceError extends Error {
  readonly code = "quote_frozen_source_invalid";
  constructor() { super("报价冻结源不可安全读取"); this.name = "FrozenQuoteSourceError"; }
}
type Row = Record<string, unknown>;
function requireValue(value: unknown): asserts value { if (!value) throw new FrozenQuoteSourceError(); }
function row(value: unknown): Row {
  requireValue(value && typeof value === "object" && !Array.isArray(value)); return value as Row;
}
function rows(value: unknown): Row[] { requireValue(Array.isArray(value)); return value.map(row); }
function strings(value: Row, keys: string[]): void { for (const key of keys) requireValue(typeof value[key] === "string"); }
function numbers(value: Row, keys: string[]): void {
  for (const key of keys) requireValue(value[key] === null || (typeof value[key] === "number" && Number.isFinite(value[key])));
}
function unique(values: unknown[]): void {
  requireValue(values.every((id) => typeof id === "string" && id.length > 0) && new Set(values).size === values.length);
}
function snapshot(value: Row): void {
  const pricing = row(value.pricingParameters);
  strings(pricing, ["manufacturingCountry", "manufacturingPresetName", "freightName"]);
  requireValue(pricing.manufacturingPresetId === null || typeof pricing.manufacturingPresetId === "string");
  requireValue(["CNY", "USD"].includes(String(pricing.laborCurrency)) && typeof pricing.includeFreight === "boolean");
  numbers(pricing, ["usdCnyRate", "markupRate", "freightAmount"]);
  const labor = row(value.labor); strings(labor, ["description"]); numbers(labor, ["value"]);
  for (const category of ["fabrics", "trims", "otherCosts"]) {
    const lines = rows(value[category]); unique(lines.map((line) => line.id));
    for (const line of lines) {
      strings(line, ["name"]);
      if (category === "fabrics") {
        strings(line, ["composition", "supplier"]);
        requireValue(["kg", "meter"].includes(String(line.purchaseUnit)));
        numbers(line, ["segmentLengthCm", "netWidthCm", "gsm", "lossRate", "unitPrice"]);
      } else {
        strings(line, ["specification", "unit"]); numbers(line, ["usage", "lossRate", "unitPrice"]);
        if (category === "otherCosts") numbers(line, ["amount"]);
        else strings(line, ["supplier"]);
      }
    }
  }
}
/** Validate the saved current Browser shape, never normalize, migrate, resolve masters or write. */
export function readFrozenBrowserQuoteCollection(store: LocalDataStore): Quote[] {
  try {
    const raw = store.getRawRecords()[store.key("quotes")];
    requireValue(typeof raw === "string");
    const envelope = row(JSON.parse(raw));
    requireValue(envelope.schemaVersion === LOCAL_DATA_SCHEMA_VERSION);
    strings(envelope, ["initializedAt", "updatedAt"]);
    const quotes = rows(envelope.data); unique(quotes.map((quote) => quote.id));
    for (const quote of quotes) {
      strings(quote, ["id", "quoteCode", "defaultRevisionId"]);
      requireValue(quote.deletedAt === null || typeof quote.deletedAt === "string");
      requireValue(["draft", "quoting", "partially_confirmed", "confirmed"].includes(String(quote.aggregateStatus)));
      const revisions = rows(quote.revisions); requireValue(revisions.length > 0);
      unique(revisions.map((revision) => revision.revisionId));
      requireValue(revisions.some((revision) => revision.revisionId === quote.defaultRevisionId));
      if (quote.currentRevisionId !== undefined) requireValue(revisions.some((revision) => revision.revisionId === quote.currentRevisionId));
      for (const revision of revisions) {
        strings(revision, ["revisionId", "revisionLabel", "createdAt", "createdBy", "reason", "note"]);
        requireValue(typeof revision.readOnly === "boolean");
        requireValue(revision.revisionId === quote.defaultRevisionId ? !revision.readOnly : revision.readOnly);
        for (const pointer of [revision.parentRevisionId, revision.basedOnConfirmedRevisionId])
          requireValue(pointer === null || revisions.some((item) => item.revisionId === pointer));
        const base = row(revision.baseInfo);
        strings(base, ["brandId", "brandName", "salespersonId", "salespersonName", "quoteStyleNo", "styleName", "note"]);
        requireValue(["distribution", "processing"].includes(String(base.quoteType)));
        for (const key of ["quoteDate", "fabricLeadDate", "garmentLeadDate"]) requireValue(base[key] === null || typeof base[key] === "string");
        for (const key of ["imageAttachmentIds", "fileAttachmentIds"]) {
          requireValue(Array.isArray(revision[key])); unique(revision[key] as unknown[]);
        }
        requireValue(revision.styleImageAttachmentId === null || (revision.imageAttachmentIds as unknown[]).includes(revision.styleImageAttachmentId));
        for (const key of ["garmentMedia", "quoteDocuments"]) if (revision[key] !== undefined)
          for (const ref of rows(revision[key])) strings(ref, ["id", "fileName", "fileType", "url"]);
        const summary = row(revision.confirmationSummary); numbers(summary, ["confirmedCount", "totalCount"]);
        const versions = rows(revision.priceVersions); requireValue(versions.length > 0); unique(versions.map((version) => version.id));
        for (const version of versions) {
          strings(version, ["id", "name", "description"]); numbers(version, ["quantity"]); snapshot(version);
          if (version.confirmation !== null) {
            const confirmation = row(version.confirmation); strings(confirmation, ["note"]);
            numbers(confirmation, ["quotedGarmentPrice", "confirmedGarmentPrice", "quotedLaborPrice", "confirmedLaborPrice"]);
          }
        }
      }
      const estimates = [...rows(quote.estimateCostHistory), ...(quote.activeEstimateCost === null ? [] : [row(quote.activeEstimateCost)])];
      unique(estimates.map((estimate) => estimate.id));
      for (const estimate of estimates) {
        strings(estimate, ["id", "quoteId", "basedOnRevisionId", "sourcePriceVersionId", "generatedAt", "generatedBy"]);
        requireValue(estimate.quoteId === quote.id && revisions.some((revision) => revision.revisionId === estimate.basedOnRevisionId));
        snapshot(estimate);
      }
    }
    return quotes as unknown as Quote[];
  } catch { throw new FrozenQuoteSourceError(); }
}

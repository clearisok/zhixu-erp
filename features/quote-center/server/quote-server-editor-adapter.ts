import type { Quote } from "../model/quote-view-model";
import {
  normalizeServerQuote,
  quoteSnapshotFromBrowser,
  type ServerQuote,
} from "../../../server/quotes/decimal-projection";
import type { QuoteResponseRecord as QuoteRecord } from "../../../server/quotes/quote-response";
import type { QuoteEditorData } from "../model/quote-editor-data";
import { quoteServerRepository, type QuoteServerRepository } from "./quote-server-repository";

import { projectForBrowser, UnsafeServerQuoteDecimalError } from "../model/exact-decimal-view";
export { browserNumberFromExactDecimal, UnsafeServerQuoteDecimalError } from "../model/exact-decimal-view";

export type EditableServerQuoteRecord = {
  quote: QuoteEditorData;
  expectedVersion: number;
  estimateVisibility?: "restricted";
};

function sameSnapshot(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameSnapshot(item, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftEntries = Object.entries(left);
    const rightRecord = right as Record<string, unknown>;
    return leftEntries.length === Object.keys(rightRecord).length && leftEntries.every(([itemKey, item]) => itemKey in rightRecord && sameSnapshot(item, rightRecord[itemKey]));
  }
  return false;
}

export function editableQuoteFromServer(serverQuote: ServerQuote): Quote;
export function editableQuoteFromServer(serverQuote: QuoteRecord["quote"]): QuoteEditorData;
export function editableQuoteFromServer(serverQuote: QuoteRecord["quote"]): QuoteEditorData {
  const editable = projectForBrowser(serverQuote) as QuoteEditorData;
  const source = normalizeServerQuote(serverQuote as ServerQuote);
  const roundTrip = quoteSnapshotFromBrowser(editable as Quote);
  if (!sameSnapshot(source, roundTrip)) throw new UnsafeServerQuoteDecimalError("quote", "aggregate-round-trip");
  return editable;
}

export function serverQuoteFromEditable(quote: Quote): ServerQuote;
export function serverQuoteFromEditable(quote: QuoteEditorData): import("../../../server/quotes/quote-response").QuoteSaveContent;
export function serverQuoteFromEditable(quote: QuoteEditorData): import("../../../server/quotes/quote-response").QuoteSaveContent {
  return quoteSnapshotFromBrowser(quote as Quote);
}

export function editableRecord(record: QuoteRecord): EditableServerQuoteRecord {
  if (record.costVisibility === "restricted") throw new Error("Internal cost content is restricted; use the metadata view");
  if ("estimateVisibility" in record && record.estimateVisibility === "restricted" &&
    (Object.hasOwn(record.quote, "activeEstimateCost") || Object.hasOwn(record.quote, "estimateCostHistory"))) throw new Error("Invalid restricted Quote response");
  return { quote: editableQuoteFromServer(record.quote), expectedVersion: record.version,
    ...("estimateVisibility" in record ? { estimateVisibility: record.estimateVisibility } : {}) };
}

export type QuoteServerEditorAdapter = {
  load(id: string): Promise<EditableServerQuoteRecord>;
  save(quote: QuoteEditorData, expectedVersion: number): Promise<EditableServerQuoteRecord>;
};

export function createQuoteServerEditorAdapter(repository: QuoteServerRepository = quoteServerRepository): QuoteServerEditorAdapter {
  return {
    async load(id) {
      return editableRecord(await repository.getById(id));
    },
    async save(quote, expectedVersion) {
      return editableRecord(await repository.save(serverQuoteFromEditable(quote), expectedVersion));
    },
  };
}

export const quoteServerEditorAdapter = createQuoteServerEditorAdapter();

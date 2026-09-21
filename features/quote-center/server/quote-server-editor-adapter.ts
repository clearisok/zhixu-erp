import type { Quote } from "../model/quote-view-model";
import {
  QUOTE_DECIMAL_KEYS,
  canonicalDecimal,
  normalizeServerQuote,
  quoteSnapshotFromBrowser,
  type ServerQuote,
} from "../../../server/quotes/decimal-projection";
import type { QuoteRecord } from "../../../server/quotes/model";
import { quoteServerRepository, type QuoteServerRepository } from "./quote-server-repository";

export class UnsafeServerQuoteDecimalError extends Error {
  constructor(readonly fieldPath: string, readonly decimalValue: string) {
    super(`Server decimal cannot round-trip through the Browser Quote model: ${fieldPath}`);
    this.name = "UnsafeServerQuoteDecimalError";
  }
}

export type EditableServerQuoteRecord = {
  quote: Quote;
  expectedVersion: number;
};

function projectForBrowser(value: unknown, key = "", path = "quote"): unknown {
  if (value === null || value === undefined) return value;
  if ((QUOTE_DECIMAL_KEYS as readonly string[]).includes(key)) {
    if (typeof value !== "string") throw new UnsafeServerQuoteDecimalError(path, String(value));
    return browserNumberFromExactDecimal(value, path);
  }
  if (Array.isArray(value)) return value.map((item, index) => projectForBrowser(item, "", `${path}[${index}]`));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([itemKey, item]) => [itemKey, projectForBrowser(item, itemKey, `${path}.${itemKey}`)]));
  return value;
}

export function browserNumberFromExactDecimal(decimal: string, fieldPath: string): number {
  const canonicalSource = canonicalDecimal(decimal);
  const browserNumber = Number(canonicalSource);
  if (!Number.isFinite(browserNumber) || canonicalDecimal(String(browserNumber)) !== canonicalSource) {
    throw new UnsafeServerQuoteDecimalError(fieldPath, decimal);
  }
  return browserNumber;
}

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

export function editableQuoteFromServer(serverQuote: ServerQuote): Quote {
  const editable = projectForBrowser(serverQuote) as Quote;
  const source = normalizeServerQuote(serverQuote);
  const roundTrip = quoteSnapshotFromBrowser(editable);
  if (!sameSnapshot(source, roundTrip)) throw new UnsafeServerQuoteDecimalError("quote", "aggregate-round-trip");
  return editable;
}

export function serverQuoteFromEditable(quote: Quote): ServerQuote {
  return quoteSnapshotFromBrowser(quote);
}

function editableRecord(record: QuoteRecord): EditableServerQuoteRecord {
  return { quote: editableQuoteFromServer(record.quote), expectedVersion: record.version };
}

export type QuoteServerEditorAdapter = {
  load(id: string): Promise<EditableServerQuoteRecord>;
  save(quote: Quote, expectedVersion: number): Promise<EditableServerQuoteRecord>;
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

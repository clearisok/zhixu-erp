import { calculatePriceVersionMetrics, numberOrZero } from "./quote-calculations.ts";
import { getCurrentRevision, type NullableNumber, type PriceVersionConfirmation, type Quote, type QuoteRevision, type QuoteType } from "./quote-view-model.ts";

export function tokenizeQuoteSearch(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesQuoteSearch(searchable: string, query: string): boolean {
  const tokens = tokenizeQuoteSearch(query);
  if (!tokens.length) return true;
  const haystack = searchable.toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

export function validateCustomerConfirmation(quoteType: QuoteType, labor: NullableNumber, garment: NullableNumber): string | null {
  if (labor === null) return quoteType === "distribution" ? "经销报价必须填写确认工价和确认成衣价格。" : "加工报价必须填写确认工价。";
  if (quoteType === "distribution" && garment === null) return "经销报价必须填写确认工价和确认成衣价格。";
  return null;
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function applyCustomerConfirmation(quote: Quote, priceVersionId: string, confirmedLaborPrice: number, confirmedGarmentPrice: number | null, note: string): Quote {
  const current = getCurrentRevision(quote);
  const pricing = current.pricingParameters;
  const versions = current.priceVersions.map((version) => {
    if (version.id !== priceVersionId) return version;
    const metrics = calculatePriceVersionMetrics(version, pricing.laborCurrency, pricing.usdCnyRate, pricing.markupRate);
    const confirmation: PriceVersionConfirmation = {
      quotedGarmentPrice: metrics.garmentSellingPrice,
      confirmedGarmentPrice,
      quotedLaborPrice: numberOrZero(version.labor.value),
      confirmedLaborPrice,
      note,
      confirmedAt: new Date().toISOString(),
    };
    return { ...version, confirmation };
  });
  const confirmedCount = versions.filter((version) => version.confirmation !== null).length;
  const nextRevision = { ...current, priceVersions: versions, confirmationSummary: { confirmedCount, totalCount: versions.length } };
  const aggregateStatus = confirmedCount === 0 ? "quoting" : confirmedCount === versions.length ? "confirmed" : "partially_confirmed";
  return { ...quote, aggregateStatus, revisions: quote.revisions.map((revision) => revision.revisionId === current.revisionId ? nextRevision : revision) };
}

export function createRevisionSnapshot(quote: Quote, revisionNote: string, createdBy: string, nowIso: string, revisionId: string): Quote {
  const current = getCurrentRevision(quote);
  const nextNumber = Math.max(0, ...quote.revisions.map((revision) => Number(revision.revisionLabel.replace(/^V/i, "")) || 0)) + 1;
  const next: QuoteRevision = {
    ...clone(current), revisionId, revisionLabel: `V${nextNumber}`, createdAt: nowIso, createdBy,
    revisionNote: revisionNote.trim() || `基于 ${current.revisionLabel} 更新`, readOnly: false,
  };
  return {
    ...quote, currentRevisionId: revisionId,
    revisions: [...quote.revisions.map((revision) => ({ ...revision, readOnly: true })), next],
  };
}

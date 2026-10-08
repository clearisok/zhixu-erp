import type { QuoteRecord, ServerQuote } from "./model.js";
import type { TrustedIdentity } from "../auth/session.js";

export type QuoteContent = Omit<ServerQuote, "activeEstimateCost" | "estimateCostHistory">;
/** Missing protected properties are not authoritative empty values. */
export type QuoteResponseRecord = QuoteRecord | {
  quote: QuoteContent;
  version: number;
  estimateVisibility: "restricted";
};
export type QuoteSaveContent = QuoteContent & Partial<Pick<ServerQuote, "activeEstimateCost" | "estimateCostHistory">>;

export function projectQuoteResponse(actor: TrustedIdentity, record: QuoteRecord): QuoteResponseRecord {
  if (actor.permissions.includes("estimate.view")) return record;
  const quote: QuoteSaveContent = { ...record.quote };
  delete quote.activeEstimateCost;
  delete quote.estimateCostHistory;
  return { quote, version: record.version, estimateVisibility: "restricted" };
}

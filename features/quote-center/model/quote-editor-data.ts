import type { Quote } from "./quote-view-model";

/** Editor view data, not a complete persistence aggregate. Restricted responses
 * omit both Estimate fields; undefined must never be interpreted as empty. */
export type QuoteEditorData = Omit<Quote, "activeEstimateCost" | "estimateCostHistory"> &
  Partial<Pick<Quote, "activeEstimateCost" | "estimateCostHistory">>;

export function readableEstimateQuote(quote: QuoteEditorData): Quote {
  if (!Object.hasOwn(quote, "activeEstimateCost") || !Array.isArray(quote.estimateCostHistory)) {
    throw new Error("Estimate content is not authorized in this view");
  }
  return quote as Quote;
}

/** Independent of Q3 master/settings authority; selected by the compiled build. */
export type QuoteWriterMode = "writable" | "frozen";
declare const __ZHIXU_BUILD_INFO__: { quoteWriterMode?: string };

export function parseQuoteWriterMode(value: string | undefined): QuoteWriterMode {
  if (value === undefined || value === "" || value === "writable") return "writable";
  if (value === "frozen") return "frozen";
  throw new Error("invalid_quote_writer_mode");
}
export function quoteWriterMode(): QuoteWriterMode {
  return parseQuoteWriterMode(typeof __ZHIXU_BUILD_INFO__ !== "undefined"
    ? __ZHIXU_BUILD_INFO__.quoteWriterMode : process.env.NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE);
}
export function isBrowserQuoteFrozen(): boolean { return quoteWriterMode() === "frozen"; }
export function assertBrowserQuoteWrite(): void {
  if (isBrowserQuoteFrozen()) throw new Error("quote_browser_writer_frozen");
}

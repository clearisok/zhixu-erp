import { QuoteServerError } from "./quote-server-client";

export type QuoteServerReadFailure = "unauthorized" | "forbidden" | "not-found" | "unavailable";

export function classifyQuoteServerReadFailure(error: unknown): QuoteServerReadFailure {
  if (!(error instanceof QuoteServerError)) return "unavailable";
  if (error.status === 401) return "unauthorized";
  if (error.status === 403) return "forbidden";
  if (error.status === 404) return "not-found";
  return "unavailable";
}

/** Preserve the authoritative decimal string; null is deliberately visible and distinct from "0". */
export function displayServerDecimal(value: string | null): string {
  return value === null ? "未填写（null）" : value;
}

export function quoteServerReadErrorLabel(error: unknown): string {
  if (error instanceof QuoteServerError) return `${error.code}（HTTP ${error.status}）`;
  return "Quote Server 读取失败，请稍后重试。";
}

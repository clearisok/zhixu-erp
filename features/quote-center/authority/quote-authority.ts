import { isOrderReadRoute, orderReadEnabled } from "../../order-center/server/read-capability.js";
export type QuoteAuthority = "browser" | "server";
declare const __ZHIXU_BUILD_INFO__: { quoteAuthority?: string };
export function parseQuoteAuthority(value?: string): QuoteAuthority {
  if (value === undefined || value === "" || value === "browser") return "browser";
  if (value === "server") return "server";
  throw new Error("invalid_quote_authority");
}
export function validateQuoteAuthority(authority: QuoteAuthority, masters: string, writer: string): void {
  if (authority === "server" && (masters !== "server" || writer !== "writable")) throw new Error("invalid_server_quote_authority_combination");
}
export function quoteAuthority(): QuoteAuthority {
  return parseQuoteAuthority(typeof __ZHIXU_BUILD_INFO__ !== "undefined" ? __ZHIXU_BUILD_INFO__.quoteAuthority : process.env.NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY);
}
export function isServerQuoteRoute(path: string): boolean {
  return ["/", "/quote-center", "/quote-center/new", "/quote-center/detail", "/basic-settings/brands", "/basic-settings/customer-salespeople", "/basic-settings/fabrics", "/basic-settings/trims", "/system-settings/quote-settings", "/system-settings/operation-logs", "/basic-settings/user-permissions", "/order-center", "/order-center/server-detail", "/order-center/style-progress/detail", "/system-settings/progress-settings"].includes(path);
}

export function isEnabledServerRoute(path:string):boolean {
  return isServerQuoteRoute(path) && (!isOrderReadRoute(path) || orderReadEnabled());
}

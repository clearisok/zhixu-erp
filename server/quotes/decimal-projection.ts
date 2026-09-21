import type { Quote } from "../../features/quote-center/model/quote-view-model.js";

export const QUOTE_DECIMAL_KEYS = ["quantity", "usage", "lossRate", "unitPrice", "amount", "segmentLengthCm", "netWidthCm", "gsm", "value", "usdCnyRate", "markupRate", "freightAmount", "quotedGarmentPrice", "confirmedGarmentPrice", "quotedLaborPrice", "confirmedLaborPrice"] as const;
export type QuoteDecimalKey = typeof QUOTE_DECIMAL_KEYS[number];
type DecimalValue<T> = T extends number ? string : T;
export type DecimalSnapshot<T> = T extends readonly (infer U)[] ? DecimalSnapshot<U>[]
  : T extends object ? { [K in keyof T]: K extends QuoteDecimalKey ? DecimalValue<T[K]> : DecimalSnapshot<T[K]> } : T;
export type ServerQuote = DecimalSnapshot<Quote>;

export class QuoteInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteInvariantError";
  }
}

/** No rounding, number conversion or fixed scale at the persistence boundary. */
export function canonicalDecimal(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) throw new QuoteInvariantError("Invalid decimal");
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000 || value.length > 2000) throw new QuoteInvariantError("Decimal exceeds supported precision");
  const digits = match[2] + (match[3] ?? "");
  const point = match[2].length + exponent;
  const expanded = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [integer, fraction = ""] = expanded.split(".");
  const whole = integer.replace(/^0+(?=\d)/, "");
  const tail = fraction.replace(/0+$/, "");
  return `${whole === "0" && !tail ? "" : match[1]}${whole}${tail ? `.${tail}` : ""}`;
}

function project(value: unknown, browserNumbers: boolean, key = ""): unknown {
  if (value === null || value === undefined) return value;
  if ((QUOTE_DECIMAL_KEYS as readonly string[]).includes(key)) {
    if (browserNumbers && typeof value === "number" && Number.isFinite(value)) return canonicalDecimal(String(value));
    if (typeof value !== "string") throw new QuoteInvariantError("Decimal strings required");
    return canonicalDecimal(value);
  }
  if (Array.isArray(value)) return value.map((item) => project(item, browserNumbers));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([itemKey, item]) => [itemKey, project(item, browserNumbers, itemKey)]));
  if (typeof value === "number" && !Number.isFinite(value)) throw new QuoteInvariantError("Non-finite number");
  return value;
}

/** Pure projection only: no Browser repository/storage access or recalculation. */
export function quoteSnapshotFromBrowser(quote: Quote): ServerQuote {
  return project(quote, true) as ServerQuote;
}

export function normalizeServerQuote(quote: ServerQuote): ServerQuote {
  return project(quote, false) as ServerQuote;
}

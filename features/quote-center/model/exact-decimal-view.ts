import { canonicalDecimal, QUOTE_DECIMAL_KEYS } from "../../../server/quotes/decimal-projection.js";

export class UnsafeServerQuoteDecimalError extends Error {
  constructor(readonly fieldPath: string, readonly decimalValue: string) {
    super(`Server decimal cannot round-trip through the Browser Quote model: ${fieldPath}`);
    this.name = "UnsafeServerQuoteDecimalError";
  }
}

export function browserNumberFromExactDecimal(decimal: string, fieldPath: string): number {
  const canonicalSource = canonicalDecimal(decimal);
  const browserNumber = Number(canonicalSource);
  if (!Number.isFinite(browserNumber) || canonicalDecimal(String(browserNumber)) !== canonicalSource) {
    throw new UnsafeServerQuoteDecimalError(fieldPath, decimal);
  }
  return browserNumber;
}

/** Pure numeric view for the existing calculator. Never silently loses a saved decimal. */
export function projectForBrowser(value: unknown, key = "", path = "quote"): unknown {
  if (value === null || value === undefined) return value;
  if ((QUOTE_DECIMAL_KEYS as readonly string[]).includes(key)) {
    if (typeof value !== "string") throw new UnsafeServerQuoteDecimalError(path, String(value));
    return browserNumberFromExactDecimal(value, path);
  }
  if (Array.isArray(value)) return value.map((item, index) => projectForBrowser(item, "", `${path}[${index}]`));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([itemKey, item]) => [itemKey, projectForBrowser(item, itemKey, `${path}.${itemKey}`)]));
  return value;
}

import type { NullableNumber } from "./quote-view-model.ts";

export function truncateFinalQuoteValue(value: number, decimalPlaces = 1): number {
  if (!Number.isFinite(value)) throw new Error("最终报价不是有效数字");
  const factor = 10 ** decimalPlaces;
  return Math.trunc(value * factor) / factor;
}

export function finalQuoteNumberText(value: number, decimalPlaces = 1): string {
  return truncateFinalQuoteValue(value, decimalPlaces).toFixed(decimalPlaces);
}

export function formatFinalGarmentPrice(value: NullableNumber, currency = "¥"): string {
  return value === null ? "—" : `${currency}${finalQuoteNumberText(value, 1)}`;
}

export function formatFinalQuoteLabel(value: NullableNumber): string | null {
  return value === null ? null : `FOB RMB ${finalQuoteNumberText(value, 1)}`;
}

export type QuoteActionBarMode = "full" | "compact-navigation" | "compact" | "minimal";

export type QuoteActionRequiredWidths = Record<QuoteActionBarMode, number>;

const MODE_GUTTER = 2;

export function resolveQuoteActionBarMode(availableWidth: number, required: QuoteActionRequiredWidths): QuoteActionBarMode {
  if (availableWidth + MODE_GUTTER >= required.full) return "full";
  if (availableWidth + MODE_GUTTER >= required["compact-navigation"]) return "compact-navigation";
  if (availableWidth + MODE_GUTTER >= required.compact) return "compact";
  return "minimal";
}

import type { Quote, QuoteRevision } from "../model/quote-view-model.ts";
import { formatFinalQuoteLabel } from "../model/final-quote-format.ts";

const INVALID_SHEET_CHARACTERS = /[\\/?*\[\]:]/g;
const INVALID_FILE_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeSheetName(name: string): string {
  const normalized = name.replace(INVALID_SHEET_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  return (normalized || "价格版本").slice(0, 31);
}

export function uniqueSheetName(name: string, usedNames: Set<string>): string {
  const base = sanitizeSheetName(name);
  let candidate = base;
  let sequence = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    const suffix = ` (${sequence})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    sequence += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

export function formatFinalQuote(value: number | null): string | null {
  return formatFinalQuoteLabel(value);
}

function compactDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

export function quoteExportFileName(quote: Pick<Quote, "quoteCode">, revision: QuoteRevision, now = new Date()): string {
  const source = revision.baseInfo.quoteStyleNo.trim() || quote.quoteCode.trim() || "报价";
  const safeStyle = source.replace(INVALID_FILE_CHARACTERS, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "") || "报价";
  const safeRevision = revision.revisionLabel.replace(INVALID_FILE_CHARACTERS, "-").replace(/\s+/g, "").trim() || "V1";
  return `${safeStyle}_${safeRevision}_${compactDate(now)}.xlsx`;
}

export function excelDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

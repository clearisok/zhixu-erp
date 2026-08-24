import type { Quote, QuoteRevision } from "../model/quote-view-model.ts";

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

function expandExponential(value: string): string {
  const [coefficient, exponentText] = value.toLowerCase().split("e");
  if (exponentText === undefined) return coefficient;
  const exponent = Number(exponentText);
  const [integer, fraction = ""] = coefficient.split(".");
  const digits = `${integer}${fraction}`;
  const decimalPosition = integer.length + exponent;
  if (decimalPosition <= 0) return `0.${"0".repeat(-decimalPosition)}${digits}`;
  if (decimalPosition >= digits.length) return `${digits}${"0".repeat(decimalPosition - digits.length)}`;
  return `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}

export function roundDecimalHalfUp(value: number, decimalPlaces: number): string {
  if (!Number.isFinite(value)) throw new Error("最终报价不是有效数字");
  const sign = value < 0 ? "-" : "";
  const expanded = expandExponential(String(Math.abs(value)));
  const [integer = "0", fraction = ""] = expanded.split(".");
  const padded = `${fraction}${"0".repeat(decimalPlaces + 1)}`;
  const retained = padded.slice(0, decimalPlaces);
  const roundDigit = Number(padded[decimalPlaces] ?? "0");
  const digits = `${integer || "0"}${retained}`.split("").map(Number);
  if (roundDigit >= 5) {
    let cursor = digits.length - 1;
    while (cursor >= 0 && digits[cursor] === 9) {
      digits[cursor] = 0;
      cursor -= 1;
    }
    if (cursor < 0) digits.unshift(1);
    else digits[cursor] += 1;
  }
  const result = digits.join("").padStart(decimalPlaces + 1, "0");
  if (decimalPlaces === 0) return `${sign}${result}`;
  return `${sign}${result.slice(0, -decimalPlaces)}.${result.slice(-decimalPlaces)}`;
}

export function formatFinalQuote(value: number | null): string | null {
  return value === null ? null : `FOB RMB ${roundDecimalHalfUp(value, 1)}`;
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

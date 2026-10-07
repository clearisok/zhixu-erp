import { createHash } from "node:crypto";
import type { Quote } from "../../features/quote-center/model/quote-view-model.js";
import { LOCAL_DATA_BACKUP_VERSION } from "../../features/data-management/model/data-backup.js";
import { LOCAL_DATA_SCHEMA_VERSION, localDataKeys } from "../../features/data-management/repository/local-data-store.js";
import { quoteSnapshotFromBrowser, validateQuote, type ServerQuote } from "./model.js";

export const HISTORICAL_QUOTE_PREVIEW_CONTRACT = "quote-history-preview.v1" as const;
type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;

/** Stable key order, original array order, no timestamps/paths/random input. */
export function canonicalQuoteJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Unsupported canonical value");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalQuoteJson).join(",")}]`;
  return `{${Object.entries(value as UnknownRecord).filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalQuoteJson(item)}`).join(",")}}`;
}
export const quoteContentHash = (value: unknown): string => createHash("sha256").update(canonicalQuoteJson(value)).digest("hex");

export class QuoteBackupContractError extends Error {
  constructor(code: string) { super(code); this.name = "QuoteBackupContractError"; }
}

export type HistoricalQuotePreview = {
  contract: typeof HISTORICAL_QUOTE_PREVIEW_CONTRACT;
  capture: { timestamp: string; environment: string; origin: string; namespace: string; schemaVersion: number };
  sourceHash: string;
  projectionHash: string | null;
  counts: { quotes: number; revisions: number; priceVersions: number; estimatesCurrent: number; estimatesHistory: number;
    fabricLines: number; trimLines: number; otherCostLines: number };
  attachmentExclusion: { imageReferences: number; fileReferences: number; styleImageReferences: number;
    affectedQuotes: number; affectedRevisions: number; legacyGarmentMedia: number; legacyQuoteDocuments: number };
  legacyAttachmentCompatibility: "cleared_to_empty_arrays";
  sequence: { maximumValidSuffix: string | null; nextValue: string | null; malformedCodeCount: number };
  warnings: string[];
  blockers: string[];
  projection: ServerQuote[];
  databaseReads: 0;
  databaseWrites: 0;
  browserWrites: 0;
};

function requireString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new QuoteBackupContractError(code);
  return value;
}

function finite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === "object") return Object.values(value).every(finite);
  return true;
}

/** Pure Q5-A projection of the standard Browser full backup; never reads Browser or PostgreSQL. */
export function previewHistoricalQuoteBackup(value: unknown): HistoricalQuotePreview {
  const backup = record(value);
  if (!backup || backup.product !== "zhixu-erp" || backup.backupVersion !== LOCAL_DATA_BACKUP_VERSION)
    throw new QuoteBackupContractError("unsupported_backup");
  if (backup.schemaVersion !== LOCAL_DATA_SCHEMA_VERSION) throw new QuoteBackupContractError("unsupported_backup_schema");
  const timestamp = requireString(backup.createdAt, "missing_capture_timestamp");
  if (!Number.isFinite(Date.parse(timestamp))) throw new QuoteBackupContractError("invalid_capture_timestamp");
  const environment = requireString(backup.environment, "missing_environment");
  const origin = requireString(backup.origin, "missing_origin");
  const namespace = requireString(backup.namespace, "missing_namespace");
  if (!Array.isArray(backup.attachments) || !Array.isArray(backup.templates) || !record(backup.localRecords))
    throw new QuoteBackupContractError("incomplete_standard_backup");
  const raw = (backup.localRecords as UnknownRecord)[localDataKeys(namespace).quotes];
  if (typeof raw !== "string") throw new QuoteBackupContractError("missing_quotes_record");
  let envelope: UnknownRecord | null;
  try { envelope = record(JSON.parse(raw) as unknown); }
  catch { throw new QuoteBackupContractError("corrupt_quotes_record"); }
  if (!envelope || envelope.schemaVersion !== LOCAL_DATA_SCHEMA_VERSION || !Array.isArray(envelope.data))
    throw new QuoteBackupContractError("unsupported_quotes_envelope");
  const quotes = envelope.data as unknown[];
  if (!finite(quotes)) throw new QuoteBackupContractError("non_finite_source_value");
  const sourceHash = quoteContentHash({ contract: HISTORICAL_QUOTE_PREVIEW_CONTRACT, namespace, schemaVersion: backup.schemaVersion, quotes });
  const counts = { quotes: quotes.length, revisions: 0, priceVersions: 0, estimatesCurrent: 0, estimatesHistory: 0,
    fabricLines: 0, trimLines: 0, otherCostLines: 0 };
  const attachmentExclusion = { imageReferences: 0, fileReferences: 0, styleImageReferences: 0,
    affectedQuotes: 0, affectedRevisions: 0, legacyGarmentMedia: 0, legacyQuoteDocuments: 0 };
  const blockers: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const projected: ServerQuote[] = [];
  const countCostLines = (snapshot: UnknownRecord): void => {
    for (const [key, counter] of [["fabrics", "fabricLines"], ["trims", "trimLines"], ["otherCosts", "otherCostLines"]] as const) {
      const lines = snapshot[key];
      if (!Array.isArray(lines)) throw new QuoteBackupContractError("invalid_cost_lines");
      counts[counter] += lines.length;
    }
  };
  let maxSuffix: bigint | null = null;
  let malformedCodeCount = 0;
  for (const [index, rawQuote] of quotes.entries()) {
    const item = record(rawQuote);
    if (!item || typeof item.id !== "string" || !item.id || typeof item.quoteCode !== "string" || !item.quoteCode || !Array.isArray(item.revisions)) {
      blockers.push(`invalid_quote_structure:${index}`); continue;
    }
    if (seenIds.has(item.id)) blockers.push(`duplicate_quote_id:${index}`);
    seenIds.add(item.id);
    if (seenCodes.has(item.quoteCode)) blockers.push(`duplicate_exact_quote_code:${index}`);
    seenCodes.add(item.quoteCode);
    const match = /^QT-[0-9]{4}-[0-9]{4}-([0-9]+)$/u.exec(item.quoteCode);
    if (match) {
      const suffix = BigInt(match[1]);
      if (maxSuffix === null || suffix > maxSuffix) maxSuffix = suffix;
    } else malformedCodeCount += 1;
    const quote = item as unknown as Quote;
    let affected = false;
    for (const revision of quote.revisions) {
      if (!revision || typeof revision !== "object" || !Array.isArray(revision.priceVersions)
          || !Array.isArray(revision.imageAttachmentIds) || !Array.isArray(revision.fileAttachmentIds)) {
        blockers.push(`invalid_revision_structure:${index}`); continue;
      }
      counts.revisions += 1;
      counts.priceVersions += revision.priceVersions.length;
      for (const version of revision.priceVersions) {
        const snapshot = record(version);
        if (!snapshot) { blockers.push(`invalid_price_version_structure:${index}`); continue; }
        try { countCostLines(snapshot); } catch { blockers.push(`invalid_cost_lines:${index}`); }
      }
      const images = revision.imageAttachmentIds.length;
      const files = revision.fileAttachmentIds.length;
      const style = revision.styleImageAttachmentId ? 1 : 0;
      const legacyImages = revision.garmentMedia?.length ?? 0;
      const legacyFiles = revision.quoteDocuments?.length ?? 0;
      attachmentExclusion.imageReferences += images;
      attachmentExclusion.fileReferences += files;
      attachmentExclusion.styleImageReferences += style;
      attachmentExclusion.legacyGarmentMedia += legacyImages;
      attachmentExclusion.legacyQuoteDocuments += legacyFiles;
      if (images || files || style || legacyImages || legacyFiles) { attachmentExclusion.affectedRevisions += 1; affected = true; }
    }
    if (affected) attachmentExclusion.affectedQuotes += 1;
    counts.estimatesCurrent += quote.activeEstimateCost ? 1 : 0;
    counts.estimatesHistory += quote.estimateCostHistory?.length ?? 0;
    for (const estimate of [...(quote.estimateCostHistory ?? []), ...(quote.activeEstimateCost ? [quote.activeEstimateCost] : [])]) {
      const snapshot = record(estimate);
      if (!snapshot) { blockers.push(`invalid_estimate_structure:${index}`); continue; }
      try { countCostLines(snapshot); } catch { blockers.push(`invalid_cost_lines:${index}`); }
    }
    try {
      const target = quoteSnapshotFromBrowser({ ...quote, revisions: quote.revisions.map((revision) => ({ ...revision,
        imageAttachmentIds: [], fileAttachmentIds: [], styleImageAttachmentId: null,
        garmentMedia: [], quoteDocuments: [] })) });
      validateQuote(target);
      projected.push(target);
    } catch { blockers.push(`invalid_quote_aggregate_or_decimal:${index}`); }
  }
  if (malformedCodeCount) warnings.push("malformed_historical_quote_codes_preserved_and_excluded_from_sequence_max");
  const maxBigint = BigInt("9223372036854775807");
  if (maxSuffix !== null && maxSuffix >= maxBigint) blockers.push("quote_sequence_capacity_exhausted");
  const next = maxSuffix === null ? BigInt(1) : maxSuffix + BigInt(1);
  return {
    contract: HISTORICAL_QUOTE_PREVIEW_CONTRACT,
    capture: { timestamp, environment, origin, namespace, schemaVersion: backup.schemaVersion as number },
    sourceHash, projectionHash: blockers.length ? null : quoteContentHash(projected), counts, attachmentExclusion,
    legacyAttachmentCompatibility: "cleared_to_empty_arrays",
    sequence: { maximumValidSuffix: maxSuffix?.toString() ?? null, nextValue: next <= maxBigint ? next.toString() : null, malformedCodeCount },
    warnings, blockers, projection: blockers.length ? [] : projected,
    databaseReads: 0, databaseWrites: 0, browserWrites: 0,
  };
}

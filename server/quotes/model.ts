import { isDeepStrictEqual } from "node:util";
import { QuoteInvariantError, type ServerQuote } from "./decimal-projection.js";
export type { DecimalSnapshot, ServerQuote } from "./decimal-projection.js";
export { canonicalDecimal, normalizeServerQuote, quoteSnapshotFromBrowser, QuoteInvariantError } from "./decimal-projection.js";
export type QuoteRecord = { quote: ServerQuote; version: number };
export class QuoteConflictError extends Error { constructor() { super("Quote version conflict"); this.name = "QuoteConflictError"; } }

function requireInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new QuoteInvariantError(message);
}
function unique(ids: string[]) { requireInvariant(ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length, "Invalid or duplicate owner-scoped identity"); }
export function validateQuote(quote: ServerQuote): void {
  requireInvariant(typeof quote.id === "string" && quote.id.length > 0, "Quote identity required");
  requireInvariant(quote.revisions.length > 0, "Revision required");
  unique(quote.revisions.map((r) => r.revisionId));
  const defaultRevision = quote.revisions.find((r) => r.revisionId === quote.defaultRevisionId);
  requireInvariant(defaultRevision && !defaultRevision.readOnly, "Writable default Revision required");
  if (quote.currentRevisionId !== undefined) requireInvariant(quote.revisions.some((r) => r.revisionId === quote.currentRevisionId), "Invalid legacy revision pointer");
  for (const revision of quote.revisions) {
    requireInvariant(revision.revisionId === quote.defaultRevisionId || revision.readOnly, "Historical Revision must be read-only");
    for (const pointer of [revision.parentRevisionId, revision.basedOnConfirmedRevisionId]) requireInvariant(pointer === null || quote.revisions.some((r) => r.revisionId === pointer), "Invalid Revision provenance");
    requireInvariant(revision.priceVersions.length > 0, "PriceVersion required");
    unique(revision.priceVersions.map((v) => v.id));
    for (const ref of [...(revision.garmentMedia ?? []), ...(revision.quoteDocuments ?? [])]) requireInvariant(!/^data:/i.test(ref.url), "Binary attachment data is not supported");
  }
  const estimates = [...quote.estimateCostHistory, ...(quote.activeEstimateCost ? [quote.activeEstimateCost] : [])];
  unique(estimates.map((e) => e.id));
  for (const estimate of estimates) {
    const source = quote.revisions.find((r) => r.revisionId === estimate.basedOnRevisionId);
    // The source PV may later be removed from the editable Revision. The estimate
    // remains an independently readable snapshot; provenance is not a live FK.
    requireInvariant(estimate.quoteId === quote.id && source && typeof estimate.sourcePriceVersionId === "string" && estimate.sourcePriceVersionId.length > 0, "Invalid Estimate provenance");
  }
  for (const snapshot of [...quote.revisions.flatMap((r) => r.priceVersions), ...estimates]) {
    unique(snapshot.fabrics.map((r) => r.id)); unique(snapshot.trims.map((r) => r.id)); unique(snapshot.otherCosts.map((r) => r.id));
  }
}

/** Q1 aggregate save preserves every existing history row and its ordering. */
export function validateQuoteReplacement(previous: ServerQuote, next: ServerQuote): void {
  requireInvariant(previous.id === next.id, "Quote identity immutable");
  requireInvariant(previous.quoteCode === next.quoteCode, "Quote code immutable");
  for (const [index, revision] of previous.revisions.entries()) {
    const replacement = next.revisions[index];
    requireInvariant(replacement?.revisionId === revision.revisionId, "Revision removal/reordering forbidden");
    if (revision.readOnly) requireInvariant(isDeepStrictEqual(revision, replacement), "Historical Revision immutable");
    else if (next.defaultRevisionId !== revision.revisionId) requireInvariant(isDeepStrictEqual({ ...revision, readOnly: true }, replacement), "Frozen Revision content immutable");
  }
  for (const [index, estimate] of previous.estimateCostHistory.entries()) requireInvariant(isDeepStrictEqual(estimate, next.estimateCostHistory[index]), "Estimate history immutable");
  const oldActive = previous.activeEstimateCost;
  if (oldActive && oldActive.id !== next.activeEstimateCost?.id) requireInvariant(next.estimateCostHistory.some((e) => isDeepStrictEqual(e, oldActive)), "Previous estimate must be archived unchanged");
  if (oldActive && oldActive.id === next.activeEstimateCost?.id) {
    const active = next.activeEstimateCost;
    for (const field of ["quoteId", "basedOnRevisionId", "sourcePriceVersionId", "generatedAt", "generatedBy"] as const) requireInvariant(active[field] === oldActive[field], "Estimate provenance immutable");
    for (const field of ["fabrics", "trims", "otherCosts"] as const) requireInvariant(isDeepStrictEqual(active[field].map((r) => r.id), oldActive[field].map((r) => r.id)), "Estimate cost structure immutable");
  }
}

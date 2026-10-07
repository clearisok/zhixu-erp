import { resolve } from "node:path";
import type { Pool } from "pg";
import { inspectMigrationStatus } from "../db/migration-runner.js";
import { quoteContentHash, type HistoricalQuotePreview } from "./historical-preview.js";
import { createQuoteRepository, insertHistoricalQuoteInTransaction } from "./repository.js";

const QUOTE_TABLES = ["quote_center_quotes", "quote_center_revisions", "quote_center_price_versions", "quote_center_estimates",
  "quote_center_cost_snapshots", "quote_center_fabric_lines", "quote_center_trim_lines", "quote_center_other_cost_lines"] as const;
const ATTACHMENT_TABLES = ["quote_attachments", "quote_revision_attachments"] as const;

export class HistoricalQuoteImportError extends Error {
  constructor(readonly code: string) { super(code); this.name = "HistoricalQuoteImportError"; }
}

export type HistoricalQuoteTarget = {
  ledgerCurrent: boolean;
  tablesPresent: boolean;
  rowCounts: Record<string, number>;
  empty: boolean;
  sequence: { lastValue: string; isCalled: boolean } | null;
};

/** Read-only reusable target inspection. Never initializes a ledger or runs migrations. */
export async function inspectHistoricalQuoteTarget(pool: Pool): Promise<HistoricalQuoteTarget> {
  const status = await inspectMigrationStatus(pool, resolve("database/migrations"));
  const names = [...QUOTE_TABLES, ...ATTACHMENT_TABLES];
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const existing = await client.query<{ name: string }>(
      "SELECT relname AS name FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p') AND relname=ANY($1::text[])", [names]);
    const found = new Set(existing.rows.map((row) => row.name));
    const rowCounts: Record<string, number> = {};
    for (const name of names) if (found.has(name)) rowCounts[name] = Number((await client.query(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n);
    const sequencePresent = (await client.query("SELECT to_regclass('public.quote_center_quote_number_seq') IS NOT NULL AS present")).rows[0].present === true;
    const sequence = sequencePresent ? (await client.query<{ last_value: string; is_called: boolean }>(
      "SELECT last_value::text AS last_value,is_called FROM quote_center_quote_number_seq")).rows[0] : null;
    await client.query("COMMIT");
    return { ledgerCurrent: status.ledgerExists && status.integrity === "valid" && status.pending.length === 0,
      tablesPresent: names.every((name) => found.has(name)) && sequencePresent,
      rowCounts, empty: names.every((name) => rowCounts[name] === 0),
      sequence: sequence ? { lastValue: sequence.last_value, isCalled: sequence.is_called } : null };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export type HistoricalQuoteImportResult = {
  outcome: "COMMITTED_PASS" | "COMMITTED_BUT_UNVERIFIED";
  plannedCount: number;
  committedCount: number;
  projectionHash: string;
  readbackHash: string | null;
  sequenceNext: string;
  failureCode: string | null;
  readbackCounts: Record<string, number> | null;
};

function expectedRowCounts(preview: HistoricalQuotePreview): Record<string, number> {
  return {
    quote_center_quotes: preview.counts.quotes,
    quote_center_revisions: preview.counts.revisions,
    quote_center_price_versions: preview.counts.priceVersions,
    quote_center_estimates: preview.counts.estimatesCurrent + preview.counts.estimatesHistory,
    quote_center_cost_snapshots: preview.counts.priceVersions + preview.counts.estimatesCurrent + preview.counts.estimatesHistory,
    quote_center_fabric_lines: preview.counts.fabricLines,
    quote_center_trim_lines: preview.counts.trimLines,
    quote_center_other_cost_lines: preview.counts.otherCostLines,
    quote_attachments: 0,
    quote_revision_attachments: 0,
  };
}

/** Internal Q5 migration boundary: no HTTP entrypoint, actor, runtime ID/number allocation or CRUD logs. */
export async function importHistoricalQuoteProjection(
  pool: Pool, preview: HistoricalQuotePreview,
  options: { expectedSourceHash: string; expectedProjectionHash: string; readback?: (ids: string[]) => Promise<unknown[]> },
): Promise<HistoricalQuoteImportResult> {
  if (preview.blockers.length || !preview.projectionHash || !preview.sequence.nextValue || preview.projection.length !== preview.counts.quotes)
    throw new HistoricalQuoteImportError("blocked_preview");
  if (preview.sourceHash !== options.expectedSourceHash || preview.projectionHash !== options.expectedProjectionHash
      || quoteContentHash(preview.projection) !== preview.projectionHash)
    throw new HistoricalQuoteImportError("source_or_projection_hash_mismatch");
  const target = await inspectHistoricalQuoteTarget(pool);
  if (!target.ledgerCurrent || !target.tablesPresent || !target.empty || !target.sequence)
    throw new HistoricalQuoteImportError("target_not_empty_or_schema_pending");
  if (target.sequence.isCalled || target.sequence.lastValue !== "1")
    throw new HistoricalQuoteImportError("sequence_already_consumed");
  const client = await pool.connect();
  let committed = false;
  let commitStarted = false;
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE quote_center_quotes IN ACCESS EXCLUSIVE MODE");
    // Recheck under lock, not only against the earlier read-only inspection.
    for (const name of [...QUOTE_TABLES, ...ATTACHMENT_TABLES]) {
      if (Number((await client.query(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n) !== 0)
        throw new HistoricalQuoteImportError("target_became_nonempty");
    }
    for (const quote of preview.projection) await insertHistoricalQuoteInTransaction(client, quote);
    // RESTART is transactional; unlike setval it rolls back with a failed import.
    await client.query(`ALTER SEQUENCE quote_center_quote_number_seq RESTART WITH ${preview.sequence.nextValue}`);
    commitStarted = true;
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    if (commitStarted) throw new HistoricalQuoteImportError("commit_outcome_unknown");
    throw error;
  } finally { client.release(); }

  // A failure here is a committed-but-unverified state, never called a rollback.
  try {
    const ids = preview.projection.map((quote) => quote.id);
    const records = options.readback ? await options.readback(ids) : await Promise.all(ids.map(async (id) => {
      const item = await createQuoteRepository(pool).getById(id);
      if (!item) throw new HistoricalQuoteImportError("missing_readback_quote");
      return item.quote;
    }));
    const readbackHash = quoteContentHash(records);
    if (readbackHash !== preview.projectionHash) throw new HistoricalQuoteImportError("readback_hash_mismatch");
    const verified = await inspectHistoricalQuoteTarget(pool);
    if (Object.entries(expectedRowCounts(preview)).some(([name, count]) => verified.rowCounts[name] !== count)
        || verified.sequence?.lastValue !== preview.sequence.nextValue || verified.sequence.isCalled)
      throw new HistoricalQuoteImportError("readback_count_or_sequence_mismatch");
    return { outcome: "COMMITTED_PASS", plannedCount: ids.length, committedCount: ids.length,
      projectionHash: preview.projectionHash, readbackHash, sequenceNext: preview.sequence.nextValue, failureCode: null,
      readbackCounts: verified.rowCounts };
  } catch (error) {
    return { outcome: "COMMITTED_BUT_UNVERIFIED", plannedCount: preview.projection.length,
      committedCount: preview.projection.length, projectionHash: preview.projectionHash,
      readbackHash: null, sequenceNext: preview.sequence.nextValue,
      failureCode: error instanceof HistoricalQuoteImportError ? error.code : "readback_failed", readbackCounts: null };
  }
}

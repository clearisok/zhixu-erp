import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { discoverMigrations, runMigrations } from "../server/db/migration-runner.js";
import { startDisposablePostgres } from "../server/integration/postgres-container.js";
import { previewHistoricalQuoteBackup, quoteContentHash, QuoteBackupContractError } from "../server/quotes/historical-preview.js";
import { HistoricalQuoteImportError, importHistoricalQuoteProjection, inspectHistoricalQuoteTarget } from "../server/quotes/historical-import.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--backup" || !args[1])
    throw new QuoteBackupContractError("backup_argument_required");
  const bytes = await readFile(resolve(args[1]));
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const preview = previewHistoricalQuoteBackup(JSON.parse(bytes.toString("utf8")) as unknown);
  if (preview.blockers.length || !preview.projectionHash) {
    process.stdout.write(`${JSON.stringify({ outcome: "BLOCKED_PREVIEW", sourceHash: preview.sourceHash,
      fileSha256, blockers: preview.blockers })}\n`);
    process.exitCode = 2;
    return;
  }
  const postgres = await startDisposablePostgres();
  let pool: pg.Pool | null = null;
  try {
    pool = new pg.Pool({ connectionString: await postgres.createDatabase("q5a_quote_history") });
    const migration = await runMigrations(pool, resolve("database/migrations"));
    const migrationLedger = (await discoverMigrations(resolve("database/migrations")))
      .map(({ version, filename, checksum }) => ({ version, filename, checksum, state: "applied" as const }));
    const before = await inspectHistoricalQuoteTarget(pool);
    const result = await importHistoricalQuoteProjection(pool, preview,
      { expectedSourceHash: preview.sourceHash, expectedProjectionHash: preview.projectionHash });
    const after = await inspectHistoricalQuoteTarget(pool);
    const evidence = { evidenceKind: "quote_import_disposable_rehearsal.v1", outcome: result.outcome,
      sourceFileSha256: fileSha256, sourceHash: preview.sourceHash, projectionHash: preview.projectionHash,
      migrationLedger, plannedCounts: preview.counts, readbackCounts: result.readbackCounts,
      readbackHash: result.readbackHash, sequenceNext: result.sequenceNext, failureCode: result.failureCode };
    process.stdout.write(`${JSON.stringify({ ...evidence, rehearsalProofHash: quoteContentHash(evidence),
      migrationsApplied: migration.applied, before, after, disposablePostgres: true,
      realPostgresReads: 0, realPostgresWrites: 0, browserWrites: 0 })}\n`);
    if (result.outcome !== "COMMITTED_PASS") process.exitCode = 3;
  } finally {
    await pool?.end();
    await postgres.stop();
  }
}

await main().catch((error: unknown) => {
  const code = error instanceof QuoteBackupContractError ? error.message
    : error instanceof HistoricalQuoteImportError ? error.code : "quote_history_rehearsal_failed";
  process.stderr.write(`${JSON.stringify({ error: code })}\n`);
  process.exitCode = 1;
});

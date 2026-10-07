import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import pg from "pg";
import { createQuoteDraft, type Quote } from "../../features/quote-center/model/quote-view-model.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteContentHash, previewHistoricalQuoteBackup, QuoteBackupContractError } from "../quotes/historical-preview.js";
import { HistoricalQuoteImportError, importHistoricalQuoteProjection, inspectHistoricalQuoteTarget } from "../quotes/historical-import.js";
import { allocateQuoteCode } from "../quotes/numbering.js";
import { createQuoteService } from "../quotes/service.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

const execFileAsync = promisify(execFile);
const namespace = "zhixu.erp.test";

function syntheticQuotes(): Quote[] {
  const processing = createSyntheticQuoteFixture("q5-processing", "processing");
  processing.quoteCode = "QT-2026-0101-123";
  processing.revisions[0].priceVersions[0].fabrics[0].unitPrice = 0.12345678901234567;
  processing.revisions[0].quoteDocuments = [{ id: "legacy-document", fileName: "synthetic.pdf", fileType: "application/pdf", url: "https://example.invalid/synthetic.pdf" }];
  const distribution = createSyntheticQuoteFixture("q5-distribution", "distribution");
  distribution.quoteCode = "LEGACY-Q5-CODE"; // malformed historical code stays untouched, not a suffix source.
  const simple = createQuoteDraft("q5-simple", "QT-2026-0101-009", "2026-01-01");
  simple.revisions[0].createdAt = "2026-01-01T00:00:00.000Z";
  return [processing, distribution, simple];
}

function backup(quotes: Quote[], capturedAt = "2026-10-07T00:00:00.000Z") {
  return { product: "zhixu-erp", backupVersion: 1, schemaVersion: 13, createdAt: capturedAt,
    environment: "test", origin: "http://127.0.0.1:3001", namespace,
    localRecords: { [`${namespace}.quotes`]: JSON.stringify({ schemaVersion: 13,
      initializedAt: "2026-01-01T00:00:00Z", updatedAt: capturedAt, data: quotes }),
      [`${namespace}.sales-orders`]: "synthetic unrelated domain" },
    attachments: [{ attachment: { id: "synthetic-unrelated" }, file: { mimeType: "application/octet-stream", size: 1, base64: "AA==" } }],
    templates: [], styleProgress: { synthetic: true } };
}

test("Q5-A pure standard-backup preview is deterministic and preserves source", { timeout: 90_000 }, async (t) => {
  const source = backup(syntheticQuotes());
  const original = JSON.stringify(source);
  const preview = previewHistoricalQuoteBackup(source);
  assert.equal(preview.sourceHash, "f9b7bf0323e2f4ac367b13c38b92c5c636b0d64ba17917a11648a9776ec7450c");
  assert.equal(preview.projectionHash, "7508ddb03ef7f739dc5ab296d5d7cee288d65cd3fe4ff5a897010d0db8772387");
  assert.deepEqual(preview.blockers, []);
  assert.equal(JSON.stringify(source), original);
  assert.equal(preview.sourceHash, previewHistoricalQuoteBackup({ ...source, createdAt: "2026-10-08T00:00:00Z" }).sourceHash);
  assert.equal(preview.projectionHash, quoteContentHash(preview.projection));
  assert.equal(preview.projectionHash, previewHistoricalQuoteBackup(source).projectionHash);
  assert.equal(preview.counts.quotes, 3);
  assert.equal(preview.counts.revisions, 5);
  assert.equal(preview.counts.priceVersions, 9);
  assert.equal(preview.counts.estimatesCurrent, 2);
  assert.equal(preview.counts.estimatesHistory, 2);
  assert.deepEqual([preview.counts.fabricLines, preview.counts.trimLines, preview.counts.otherCostLines], [24, 24, 12]);
  assert.ok(preview.attachmentExclusion.imageReferences > 0);
  assert.ok(preview.attachmentExclusion.fileReferences > 0);
  assert.ok(preview.attachmentExclusion.styleImageReferences > 0);
  assert.ok(preview.attachmentExclusion.legacyGarmentMedia > 0);
  assert.ok(preview.attachmentExclusion.legacyQuoteDocuments > 0);
  for (const quote of preview.projection) for (const revision of quote.revisions) {
    assert.deepEqual([revision.imageAttachmentIds, revision.fileAttachmentIds, revision.styleImageAttachmentId], [[], [], null]);
    assert.deepEqual([revision.garmentMedia, revision.quoteDocuments], [[], []]);
  }
  assert.equal(preview.projection[0].id, "q5-processing");
  assert.equal(preview.projection[0].revisions[0].readOnly, true);
  assert.equal(preview.projection[0].revisions[1].readOnly, false);
  assert.equal(preview.projection[0].revisions[0].priceVersions[0].fabrics[0].unitPrice, String(0.12345678901234567));
  assert.equal(preview.projection[0].revisions[0].priceVersions[0].pricingParameters.manufacturingPresetId, null);
  assert.equal(preview.projection[0].revisions[0].priceVersions[0].fabrics[0].sourceLibraryItemId, "missing-fabric");
  assert.equal(preview.projection[0].revisions[0].priceVersions[0].fabrics[0].name,
    preview.projection[0].revisions[0].priceVersions[0].fabrics[1].name);
  assert.equal(preview.projection[0].revisions[0].priceVersions[0].confirmation?.confirmedLaborPrice, "0");
  assert.equal(preview.projection[0].revisions[0].priceVersions[0].confirmation?.confirmedGarmentPrice, null);
  assert.deepEqual(preview.sequence, { maximumValidSuffix: "123", nextValue: "124", malformedCodeCount: 1 });
  assert.equal(preview.databaseWrites, 0);

  const directory = await mkdtemp(join(tmpdir(), "zhixu-q5a-fixture-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "synthetic-standard-backup.json");
  await writeFile(path, original);
  const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "scripts/preview-quote-history-backup.ts", "--backup", path],
    { cwd: resolve("."), encoding: "utf8", windowsHide: true });
  const safe = JSON.parse(stdout) as Record<string, unknown>;
  assert.equal(safe.sourceHash, preview.sourceHash);
  assert.equal(safe.projectionHash, preview.projectionHash);
  assert.ok(!Object.hasOwn(safe, "projection"));
  assert.ok(!stdout.includes("synthetic.pdf"));
  const rehearsal = await execFileAsync(process.execPath,
    ["--import", "tsx", "scripts/rehearse-quote-history-backup.ts", "--backup", path],
    { cwd: resolve("."), encoding: "utf8", windowsHide: true });
  const rehearsalEvidence = JSON.parse(rehearsal.stdout) as Record<string, unknown>;
  assert.equal(rehearsalEvidence.evidenceKind, "quote_import_disposable_rehearsal.v1");
  assert.equal(rehearsalEvidence.outcome, "COMMITTED_PASS");
  assert.equal(rehearsalEvidence.sourceHash, preview.sourceHash);
  assert.equal(rehearsalEvidence.projectionHash, preview.projectionHash);
  assert.equal(rehearsalEvidence.readbackHash, preview.projectionHash);
  assert.equal(rehearsalEvidence.disposablePostgres, true);
  assert.equal(rehearsalEvidence.realPostgresWrites, 0);
  assert.ok(Array.isArray(rehearsalEvidence.migrationLedger));
  assert.match(String(rehearsalEvidence.rehearsalProofHash), /^[a-f0-9]{64}$/u);
  assert.ok(!rehearsal.stdout.includes("synthetic.pdf"));
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), source);
});

test("Q5-A backup and aggregate blockers fail before PostgreSQL writes", () => {
  const source = backup(syntheticQuotes());
  assert.throws(() => previewHistoricalQuoteBackup({ ...source, backupVersion: 99 }), QuoteBackupContractError);
  assert.throws(() => previewHistoricalQuoteBackup({ ...source, schemaVersion: 99 }), QuoteBackupContractError);
  assert.throws(() => previewHistoricalQuoteBackup({ ...source, localRecords: { [`${namespace}.quotes`]: "{" } }), QuoteBackupContractError);
  const duplicateCode = syntheticQuotes(); duplicateCode[1].quoteCode = duplicateCode[0].quoteCode;
  assert.ok(previewHistoricalQuoteBackup(backup(duplicateCode)).blockers.some((code) => code.startsWith("duplicate_exact_quote_code")));
  const duplicateId = syntheticQuotes(); duplicateId[1].id = duplicateId[0].id;
  assert.ok(previewHistoricalQuoteBackup(backup(duplicateId)).blockers.some((code) => code.startsWith("duplicate_quote_id")));
  const duplicateLine = syntheticQuotes();
  duplicateLine[0].revisions[0].priceVersions[0].fabrics[1].id = duplicateLine[0].revisions[0].priceVersions[0].fabrics[0].id;
  assert.ok(previewHistoricalQuoteBackup(backup(duplicateLine)).blockers.some((code) => code.startsWith("invalid_quote_aggregate")));
  const invalidDefault = syntheticQuotes(); invalidDefault[0].defaultRevisionId = "missing-revision";
  assert.ok(previewHistoricalQuoteBackup(backup(invalidDefault)).blockers.some((code) => code.startsWith("invalid_quote_aggregate")));
  const writableHistory = syntheticQuotes(); writableHistory[0].revisions[0].readOnly = false;
  assert.ok(previewHistoricalQuoteBackup(backup(writableHistory)).blockers.some((code) => code.startsWith("invalid_quote_aggregate")));
  const invalidDecimal = syntheticQuotes();
  (invalidDecimal[0].revisions[0].priceVersions[0].fabrics[0] as { unitPrice: unknown }).unitPrice = "invalid";
  assert.ok(previewHistoricalQuoteBackup(backup(invalidDecimal)).blockers.some((code) => code.startsWith("invalid_quote_aggregate_or_decimal")));
});

test("Q5-A disposable PostgreSQL import, rollback, second execute and post-commit semantics", { timeout: 240_000 }, async (t) => {
  const postgres = await startDisposablePostgres();
  const pools: pg.Pool[] = [];
  t.after(async () => { for (const pool of pools) await pool.end(); await postgres.stop(); });
  const createPool = async (label: string) => {
    const pool = new pg.Pool({ connectionString: await postgres.createDatabase(label) });
    pools.push(pool);
    await runMigrations(pool, resolve("database/migrations"));
    return pool;
  };
  const preview = previewHistoricalQuoteBackup(backup(syntheticQuotes()));
  assert.deepEqual(preview.blockers, []);
  const pool = await createPool("q5a_success");
  const before = await inspectHistoricalQuoteTarget(pool);
  assert.equal(before.ledgerCurrent && before.tablesPresent && before.empty, true);
  assert.deepEqual(before.sequence, { lastValue: "1", isCalled: false });
  const blocked = previewHistoricalQuoteBackup(backup([...syntheticQuotes(), syntheticQuotes()[0]]));
  await assert.rejects(() => importHistoricalQuoteProjection(pool, blocked, {
    expectedSourceHash: blocked.sourceHash, expectedProjectionHash: "invalid" }),
  (error: unknown) => error instanceof HistoricalQuoteImportError && error.code === "blocked_preview");
  assert.equal((await inspectHistoricalQuoteTarget(pool)).empty, true);
  await assert.rejects(() => importHistoricalQuoteProjection(pool, preview,
    { expectedSourceHash: "wrong", expectedProjectionHash: preview.projectionHash! }), HistoricalQuoteImportError);
  const result = await importHistoricalQuoteProjection(pool, preview,
    { expectedSourceHash: preview.sourceHash, expectedProjectionHash: preview.projectionHash! });
  assert.equal(result.outcome, "COMMITTED_PASS");
  assert.equal(result.readbackHash, preview.projectionHash);
  assert.deepEqual(result.readbackCounts, {
    quote_center_quotes: 3, quote_center_revisions: 5, quote_center_price_versions: 9,
    quote_center_estimates: 4, quote_center_cost_snapshots: 13,
    quote_center_fabric_lines: 24, quote_center_trim_lines: 24, quote_center_other_cost_lines: 12,
    quote_attachments: 0, quote_revision_attachments: 0,
  });
  assert.deepEqual((await inspectHistoricalQuoteTarget(pool)).sequence, { lastValue: "124", isCalled: false });
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_attachments")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_revision_attachments")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote'")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n, 0);
  for (const quote of preview.projection) assert.deepEqual((await createQuoteService(pool).getById(quote.id))?.quote, quote);
  await assert.rejects(() => importHistoricalQuoteProjection(pool, preview,
    { expectedSourceHash: preview.sourceHash, expectedProjectionHash: preview.projectionHash! }),
  (error: unknown) => error instanceof HistoricalQuoteImportError && error.code === "target_not_empty_or_schema_pending");
  const client = await pool.connect();
  try {
    const next = await allocateQuoteCode(client, new Date("2026-01-01T00:00:00Z"));
    assert.equal(next, "QT-2026-0101-124");
  } finally { client.release(); }
  assert.equal((await createQuoteService(pool).getById("q5-distribution"))?.quote.quoteCode, "LEGACY-Q5-CODE");

  const rollbackPool = await createPool("q5a_rollback");
  await rollbackPool.query("ALTER TABLE quote_center_quotes ADD CONSTRAINT q5a_synthetic_fail CHECK (quote_code <> 'LEGACY-Q5-CODE')");
  await assert.rejects(() => importHistoricalQuoteProjection(rollbackPool, preview,
    { expectedSourceHash: preview.sourceHash, expectedProjectionHash: preview.projectionHash! }));
  assert.equal((await inspectHistoricalQuoteTarget(rollbackPool)).empty, true);
  assert.deepEqual((await inspectHistoricalQuoteTarget(rollbackPool)).sequence, { lastValue: "1", isCalled: false });
  assert.equal((await rollbackPool.query("SELECT count(*)::int AS n FROM operation_logs")).rows[0].n, 0);

  const readbackPool = await createPool("q5a_readback");
  const uncertain = await importHistoricalQuoteProjection(readbackPool, preview, { expectedSourceHash: preview.sourceHash,
    expectedProjectionHash: preview.projectionHash!, readback: async () => { throw new Error("synthetic readback outage"); } });
  assert.equal(uncertain.outcome, "COMMITTED_BUT_UNVERIFIED");
  assert.equal((await readbackPool.query("SELECT count(*)::int AS n FROM quote_center_quotes")).rows[0].n, 3);
  assert.equal((await readbackPool.query("SELECT count(*)::int AS n FROM operation_logs")).rows[0].n, 0);
});

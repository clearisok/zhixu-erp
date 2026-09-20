import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createQuoteDraft, type Quote } from "../../features/quote-center/model/quote-view-model.js";
import { createRevisionFromSnapshot } from "../../features/quote-center/model/quote-workflows.js";
import { createEstimateCostFromRevision } from "../../features/quote-center/model/estimate-cost.js";
import { quoteSnapshotFromBrowser, QuoteConflictError, QuoteInvariantError } from "../quotes/model.js";
import { createQuoteService } from "../quotes/service.js";
import { runMigrations } from "../db/migration-runner.js";
import { startDisposablePostgres } from "./postgres-container.js";

function fixture(id: string, type: "processing" | "distribution" = "distribution"): Quote {
  let q = createQuoteDraft(id, "Synthetic Code", "2026-01-01");
  const r = q.revisions[0];
  r.createdAt = "2026-01-01T00:00:00.000Z";
  r.createdBy = "synthetic provenance";
  r.baseInfo = { ...r.baseInfo, brandId: "missing-brand", brandName: "Snapshot Brand", salespersonId: "missing-person", salespersonName: "Snapshot Person", quoteType: type };
  r.imageAttachmentIds = ["synthetic-image"]; r.fileAttachmentIds = ["synthetic-file"]; r.styleImageAttachmentId = "synthetic-image";
  r.garmentMedia = [{ id: "legacy-ref", fileName: "synthetic.png", fileType: "image/png", url: "https://example.invalid/synthetic.png" }];
  const v = r.priceVersions[0];
  v.quantity = 0;
  v.pricingParameters = { ...v.pricingParameters, usdCnyRate: 7.123456789, markupRate: 0, freightAmount: null };
  v.labor = { value: 0, description: "Synthetic labor" };
  v.fabrics = ["fabric-a", "fabric-b"].map((id) => ({ id, lineGroupId: "same-group", independentFields: ["unitPrice"], sourceLibraryItemId: "missing-fabric", name: "Same Fabric", composition: "Synthetic", segmentLengthCm: null, netWidthCm: 0, gsm: 123.4567, lossRate: null, supplier: "", unitPrice: 0, purchaseUnit: "kg" }));
  v.trims = ["trim-a", "trim-b"].map((id) => ({ id, name: "Same Trim", sourceLibraryItemId: null, specification: "", supplier: "", usage: null, unit: "piece", lossRate: 0, unitPrice: 1.25 }));
  v.otherCosts = [{ id: "other-a", name: "Other", specification: "", usage: 0, unit: "", lossRate: null, unitPrice: null, amount: 0, source: "global", globalSettingId: "missing-setting", overridden: true }];
  // Deliberately not today's calculated values.
  v.confirmation = { quotedGarmentPrice: 987.654321, confirmedGarmentPrice: null, quotedLaborPrice: 32.1, confirmedLaborPrice: 0, note: "Historical value", confirmedAt: "2026-01-01T00:00:00Z" };
  r.confirmationSummary = { confirmedCount: 1, totalCount: 2 };
  r.priceVersions.push({ ...structuredClone(v), id: "parallel-pv", quantity: null, pricingParameters: { ...v.pricingParameters, laborCurrency: "USD" }, confirmation: null });
  q = createRevisionFromSnapshot(q, { sourceRevisionId: r.revisionId, revisionId: "revision-two", createdBy: "synthetic provenance", nowIso: "2026-02-01T00:00:00Z", reason: "其他" });
  q.estimateCostHistory = [createEstimateCostFromRevision({ quoteId: id, revision: q.revisions[0], id: "estimate-old", generatedAt: "2026-01-02", generatedBy: "synthetic" })];
  q.activeEstimateCost = createEstimateCostFromRevision({ quoteId: id, revision: q.revisions[0], id: "estimate-active", generatedAt: "2026-02-02", generatedBy: "synthetic" });
  q.activeEstimateCost.ignoredForRevisionId = q.defaultRevisionId;
  return q;
}

test("Quote Q1 disposable PostgreSQL foundation", { timeout: 120_000 }, async (t) => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_q1") });
  const directory = await mkdtemp(join(tmpdir(), "zhixu-q1-migrations-"));
  t.after(async () => { await pool.end(); await postgres.stop(); await rm(directory, { recursive: true, force: true }); });
  const files = ["0001_trusted_auth_rbac_operation_logs.sql", "0002_sales_order_foundation.sql", "0003_sales_order_number_sequence.sql"];
  for (const name of files) await writeFile(join(directory, name), await readFile(resolve("database/migrations", name)));
  const migration = "0005_quote_foundation.sql";
  await t.test("0005 applies after main baseline; ledger rerun skips; no 0004 dependency", async () => {
    assert.deepEqual((await runMigrations(pool, directory)).applied, files);
    await writeFile(join(directory, migration), await readFile(resolve("database/migrations", migration)));
    assert.deepEqual((await runMigrations(pool, directory)).applied, [migration]);
    assert.deepEqual((await runMigrations(pool, directory)).skipped, [...files, migration]);
    assert.equal((await pool.query("SELECT to_regclass('confirmed_commercial_terms') AS name")).rows[0].name, null);
  });
  await t.test("runner accepts a subsequently supplied lower independent version", async () => {
    // Numbering test only; this is not PR #37 SQL and does not claim to validate it.
    await writeFile(join(directory, "0004_numbering_probe.sql"), "CREATE TABLE q1_numbering_probe(id INTEGER);");
    assert.deepEqual((await runMigrations(pool, directory)).applied, ["0004_numbering_probe.sql"]);
    assert.deepEqual((await runMigrations(pool, directory)).applied, []);
  });
  const service = createQuoteService(pool);
  await t.test("full distribution and processing aggregates round-trip with exact IDs and snapshots", async () => {
    for (const type of ["distribution", "processing"] as const) {
      const quote = quoteSnapshotFromBrowser(fixture(type, type));
      assert.deepEqual(await service.createAggregate(quote), { quote, version: 1 });
      assert.deepEqual(await service.getById(quote.id), { quote, version: 1 });
      assert.equal(quote.revisions[0].priceVersions[0].id, quote.revisions[1].priceVersions[0].id);
    }
    assert.equal((await service.list()).length, 2);
    assert.equal(await service.getById("missing"), null);
  });
  await t.test("NUMERIC preserves decimal precision, null and explicit zero without recalculation", async () => {
    const quote = quoteSnapshotFromBrowser(fixture("precision"));
    const v = quote.revisions[1].priceVersions[0];
    v.fabrics[0].unitPrice = "12345678901234567890.1234567890123456789";
    await service.createAggregate(quote);
    assert.deepEqual((await service.getById(quote.id))?.quote, quote);
    const values = (await pool.query("SELECT unit_price::text,segment_length_cm::text,net_width_cm::text FROM quote_center_fabric_lines WHERE snapshot_id=$1 AND id='fabric-a'", [JSON.stringify([quote.id, "price", "revision-two", v.id])])).rows[0];
    assert.equal(values.unit_price, v.fabrics[0].unitPrice); assert.equal(values.segment_length_cm, null); assert.equal(values.net_width_cm, "0");
  });
  await t.test("incomplete drafts, optional legacy fields and removed estimate source PV round-trip", async () => {
    const draft = quoteSnapshotFromBrowser(createQuoteDraft("draft", "Synthetic Code", "2026-01-01"));
    delete draft.currentRevisionId;
    await service.createAggregate(draft);
    assert.deepEqual((await service.getById("draft"))?.quote, draft);
    const q = quoteSnapshotFromBrowser(fixture("removed-source"));
    q.activeEstimateCost!.sourcePriceVersionId = "previously-removed-price-version";
    await service.createAggregate(q);
    assert.deepEqual((await service.getById(q.id))?.quote, q);
  });
  await t.test("numeric driver overrides cannot coerce stored high precision decimals", async () => {
    const original = pg.types.getTypeParser(1700, "text");
    pg.types.setTypeParser(1700, Number);
    try {
      const record = (await service.getById("precision"))!;
      assert.equal(record.quote.revisions[1].priceVersions[0].fabrics[0].unitPrice, "12345678901234567890.1234567890123456789");
    } finally { pg.types.setTypeParser(1700, original); }
  });
  await t.test("current aggregate save increments version; concurrent stale writer conflicts", async () => {
    const record = (await service.getById("distribution"))!;
    record.quote.revisions[1].baseInfo.note = "Edited current";
    const results = await Promise.allSettled([service.saveAggregate(record.quote, 1), service.saveAggregate(record.quote, 1)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failed = results.find((r) => r.status === "rejected");
    assert.ok(failed?.status === "rejected" && failed.reason instanceof QuoteConflictError);
    assert.deepEqual(await service.getById("distribution"), { quote: record.quote, version: 2 });
  });
  await t.test("history cannot be edited, removed or made writable", async () => {
    const record = (await service.getById("distribution"))!;
    for (const mutate of [
      (q: typeof record.quote) => { q.revisions[0].baseInfo.note = "tamper"; },
      (q: typeof record.quote) => { q.revisions.shift(); },
      (q: typeof record.quote) => { q.revisions[0].readOnly = false; },
      (q: typeof record.quote) => { q.estimateCostHistory[0].labor.value = "999"; },
    ]) {
      const next = structuredClone(record.quote); mutate(next);
      await assert.rejects(async () => service.saveAggregate(next, record.version), QuoteInvariantError);
    }
    assert.deepEqual(await service.getById("distribution"), record);
  });
  await t.test("new Revision freezes previous default without mutating historical costs", async () => {
    const record = (await service.getById("processing"))!;
    const next = structuredClone(record.quote);
    const revision = structuredClone(next.revisions[1]);
    revision.revisionId = "revision-three"; revision.parentRevisionId = "revision-two";
    next.revisions[1].readOnly = true; next.revisions.push(revision);
    next.defaultRevisionId = revision.revisionId; next.currentRevisionId = revision.revisionId;
    await service.saveAggregate(next, record.version);
    assert.deepEqual((await service.getById("processing"))?.quote, next);
  });
  await t.test("Estimate active/history archive and fixed structure boundary", async () => {
    const record = (await service.getById("processing"))!;
    const next = structuredClone(record.quote);
    next.estimateCostHistory.push(structuredClone(next.activeEstimateCost!));
    next.activeEstimateCost = { ...structuredClone(next.activeEstimateCost!), id: "estimate-new" };
    await service.saveAggregate(next, record.version);
    const saved = (await service.getById("processing"))!;
    assert.deepEqual(saved.quote, next);
    next.activeEstimateCost.fabrics.pop();
    await assert.rejects(async () => service.saveAggregate(next, saved.version), QuoteInvariantError);
  });
  await t.test("database failure mid-child-write rolls back create and update including version", async () => {
    await pool.query(`CREATE FUNCTION q1_reject_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'name' = 'FAIL_CHILD' THEN RAISE EXCEPTION 'synthetic child failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER q1_reject_line BEFORE INSERT ON quote_center_other_cost_lines FOR EACH ROW EXECUTE FUNCTION q1_reject_line();`);
    const quote = quoteSnapshotFromBrowser(fixture("rollback"));
    quote.revisions[1].priceVersions[0].otherCosts[0].name = "FAIL_CHILD";
    await assert.rejects(() => service.createAggregate(quote), /synthetic child failure/);
    assert.equal(await service.getById("rollback"), null);
    for (const table of ["quote_center_revisions", "quote_center_price_versions", "quote_center_estimates", "quote_center_cost_snapshots"]) assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE quote_id='rollback'`)).rows[0].n, 0);
    const before = (await service.getById("distribution"))!;
    const changed = structuredClone(before.quote); changed.revisions[1].priceVersions[0].otherCosts[0].name = "FAIL_CHILD";
    await assert.rejects(() => service.saveAggregate(changed, before.version), /synthetic child failure/);
    assert.deepEqual(await service.getById("distribution"), before);
  });
  await t.test("SalesOrder/source/log state and sequence remain untouched", async () => {
    for (const table of ["sales_orders", "sales_order_source_links", "ainuoke_sales_order_contract_mirrors", "ainuoke_sales_order_color_mirrors", "operation_logs"]) assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
    assert.deepEqual((await pool.query("SELECT last_value::text,is_called FROM sales_order_number_seq")).rows[0], { last_value: "1", is_called: false });
  });
});

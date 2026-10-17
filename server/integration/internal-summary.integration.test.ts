import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import pg from "pg";
import { runMigrations } from "../db/migration-runner.js";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { createInternalSummaryService, parseInternalSummary, type InternalSummarySelection } from "../quotes/internal-summary.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { updateConfirmedCommercialTermsByQuote } from "../confirmed-commercial-terms/service.js";
import { buildQuoteSummaryTable } from "../../features/quote-center/export/quote-summary-core.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

test("internal summary: synthetic saved sources, permissions, workbook and concurrency", { timeout: 180_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("internal_summary") });
  t.after(async () => { await pool.end(); await postgres.stop(); });
  await runMigrations(pool, resolve("database/migrations"));
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('summary-test','unused','Synthetic','viewer') RETURNING id::text,public_id::text")).rows[0];
  const admin: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "summary-test", userName: "Synthetic", permissions: [...PERMISSION_KEYS] };
  const basic = { ...admin, permissions: ["quote.view", "quote.export"] as TrustedIdentity["permissions"] };
  const repo = createQuoteRepository(pool);
  const ids = ["summary-A", "summary-B"];
  for (const id of ids) {
    const quote = createSyntheticQuoteFixture(id, id === ids[0] ? "processing" : "distribution");
    for (const r of quote.revisions) { r.imageAttachmentIds = []; r.fileAttachmentIds = []; r.styleImageAttachmentId = null; r.baseInfo.quoteStyleNo = "=NOT_A_FORMULA"; r.baseInfo.styleName = "Long synthetic name, text only; no hyperlink or formula"; r.priceVersions.forEach(pv => pv.trims.forEach(line => line.usage = 0)); }
    const current = quote.revisions.at(-1)!;
    current.priceVersions[0].labor.value = 0; current.priceVersions[1].labor.value = 2;
    current.priceVersions[0].quantity = null; current.priceVersions[1].quantity = 0;
    quote.activeEstimateCost!.labor.value = 5; quote.activeEstimateCost!.sourcePriceVersionId = "deleted-pv"; quote.activeEstimateCost!.ignoredForRevisionId = null;
    await repo.create(quoteSnapshotFromBrowser(quote));
  }
  const selection = (): InternalSummarySelection => ({ items: ids.map(quoteId => ({ quoteId, expectedVersion: 1 })), rowMode: "quote", columns: ["quote", "styleIdentity", "quantity", "labor", "garmentPrice"], estimateColumns: [] });
  const service = createInternalSummaryService(pool);
  const load = async (bytes: Buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as ArrayBuffer); return wb.worksheets[0]; };
  const logs = async () => (await pool.query("SELECT * FROM operation_logs WHERE metadata->>'workflowAction'='quote.summary.generated'")).rows;
  await t.test("per Quote and per PV preserve numbers/null/zero/currency/order and real XLSX structure", async () => {
    const perQuote = await service.generate(admin, selection());
    assert.equal(perQuote.rowCount, 2); assert.equal(createHash("sha256").update(perQuote.bytes).digest("hex"), perQuote.sha256);
    const sheet = await load(perQuote.bytes); assert.equal(sheet.getCell("C2").value, 0); assert.match(String(sheet.getCell("D2").value), /CNY.*USD/u);
    assert.equal(sheet.views[0].state, "frozen"); assert.ok(sheet.autoFilter); assert.ok(sheet.getColumn(2).width! >= 12); assert.equal(sheet.getCell("B2").type, ExcelJS.ValueType.String);
    assert.equal(sheet.getCell("B2").alignment.wrapText, true);
    const perPv = await service.generate(admin, { ...selection(), rowMode: "price-version" });
    const pvSheet = await load(perPv.bytes); assert.equal(perPv.rowCount, 4); assert.equal(pvSheet.getCell("B1").value, "价格版本"); assert.equal(pvSheet.getCell("D1").value, "数量");
    assert.equal(pvSheet.getCell("D2").value, null); assert.equal(pvSheet.getCell("D3").value, 0); assert.equal(pvSheet.getCell("E2").value, 0); assert.equal(pvSheet.getCell("E3").value, 2);
    const zip = await JSZip.loadAsync(perPv.bytes); assert.ok(!Object.keys(zip.files).some(n => /externalLink/u.test(n)));
    for (const name of Object.keys(zip.files).filter(n => /^xl\/worksheets\/.*xml$/u.test(n))) assert.doesNotMatch(await zip.file(name)!.async("string"), /<f[ >]/u);
    assert.doesNotMatch(JSON.stringify(pvSheet.getSheetValues()), /estimate-active|estimate-old|deleted-pv/u);
    t.diagnostic(`Synthetic summary XLSX: ${perPv.bytes.length} bytes SHA-256 ${perPv.sha256}; parse PASS`);
  });
  await t.test("Estimate is explicit, active only, deleted-PV source independent and difference uses raw price", async () => {
    const file = await service.generate(admin, { ...selection(), rowMode: "price-version", columns: ["quote"], estimateColumns: ["estimateTotal", "estimateRevision", "estimateDifference"] });
    const sheet = await load(file.bytes);
    assert.equal(sheet.getCell("C2").value, null); assert.equal(sheet.getCell("C3").value, null);
    assert.equal(sheet.getCell("C4").value, 5); assert.equal(sheet.getCell("C5").value, 5);
    assert.equal(sheet.getCell("D2").value,null);assert.match(String(sheet.getCell("D4").value), /V1.*旧来源/u);
    assert.equal(sheet.getCell("E2").value, null);assert.equal(sheet.getCell("E3").value,null);assert.equal(sheet.getCell("E4").value, -5); assert.equal(sheet.getCell("E5").value, 2 * 7.123456789 * 1.13 - 5);
    const differenceOnly = await service.generate(admin, { ...selection(), columns: ["quote"], estimateColumns: ["estimateDifference"] });
    assert.equal((await load(differenceOnly.bytes)).getCell("B2").value,null);assert.ok((await load(differenceOnly.bytes)).getCell("B3").value !== null);
    await pool.query("UPDATE quote_center_estimates SET is_active=false,position=1 WHERE quote_id=$1 AND is_active=true", [ids[1]]);
    const noActive = await service.generate(admin, { ...selection(), columns: ["quote"], estimateColumns: ["estimateTotal"] });
    assert.equal((await load(noActive.bytes)).getCell("B3").value, null, "History is not a substitute for active");
  });
  await t.test("ordinary export without Estimate/cost permissions and all protected requests fail closed", async () => {
    await pool.query("UPDATE quote_center_cost_snapshots SET labor_value=0.123456789012345678901 WHERE estimate_id IS NOT NULL");
    const ordinary = await service.generate(basic, { ...selection(), columns: ["quote", "quantity"] }); assert.equal(ordinary.rowCount, 2);
    await assert.rejects(service.generate(basic, selection()), { status: 403 });
    await assert.rejects(service.generate(basic, { ...selection(), columns: ["quote"], estimateColumns: ["estimateRevision"] }), { status: 403 });
    await assert.doesNotReject(service.generate(admin,{...selection(),columns:['quote'],estimateColumns:['estimateTotal']}));
    await pool.query("UPDATE quote_center_estimates SET is_active=true WHERE quote_id=$1 AND id='estimate-active'",[ids[1]]);
    await assert.rejects(service.generate(admin, { ...selection(), columns: ['quote'], estimateColumns: ['estimateTotal'] }), { status: 409 });
    assert.throws(() => parseInternalSummary({ ...selection(), actor: "evil" }), { status: 400 });
    assert.throws(() => parseInternalSummary({ ...selection(), columns: ["evil"] }), { status: 400 });
    assert.throws(() => parseInternalSummary({ ...selection(), items: [...selection().items, selection().items[0]] }), { status: 400 });
    assert.doesNotMatch(JSON.stringify(await logs()), /deleted-pv|estimate-active|confirmedLaborPrice|labor_value|123456789012/u);
  });
  await t.test("Quote source change during build is rejected, audit failure returns no file, stale selection all-or-nothing", async () => {
    const initial = (await logs()).length;
    const changed = createInternalSummaryService(pool, async input => { const quote = (await repo.getById(ids[0]))!; quote.quote.revisions.at(-1)!.baseInfo.note = "Synthetic concurrent mutation"; await repo.save(quote.quote, quote.version); return buildQuoteSummaryTable(input); });
    await assert.rejects(changed.generate(basic, { ...selection(), columns: ["quote"] }), { status: 409 });
    assert.equal((await logs()).length, initial);
    await assert.rejects(service.generate(basic, { ...selection(), columns: ["quote"] }), { status: 409 });
    const current = { ...selection(), columns: ["quote"] as const, items: [{ quoteId: ids[0], expectedVersion: 2 }] };
    await pool.query("CREATE FUNCTION summary_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'workflowAction'='quote.summary.generated' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await pool.query("CREATE TRIGGER summary_audit_fail BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION summary_audit_fail()");
    await assert.rejects(service.generate(basic, { ...current, columns: ["quote"] }), /synthetic audit failure/u);
    assert.equal((await logs()).length, initial); await pool.query("DROP TRIGGER summary_audit_fail ON operation_logs");
  });
  await t.test("terms-only concurrent change rejects even when Quote version stays unchanged", async () => {
    const draft = (await repo.getById(ids[0]))!;
    draft.quote.revisions.at(-1)!.priceVersions[0].quantity = "0";
    const record = await repo.save(draft.quote, draft.version); const revision = record.quote.revisions.at(-1)!; const provenance = { quoteId: ids[0], revisionId: revision.revisionId, priceVersionId: revision.priceVersions[0].id };
    await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: provenance.quoteId, sourceRevisionId: provenance.revisionId, sourcePriceVersionId: provenance.priceVersionId });
    await updateConfirmedCommercialTermsByQuote(pool, admin, provenance, { expectedQuoteVersion: record.version, expectedVersion: 0, confirmedLaborPrice: "3", customerConfirmedPrice: null, laborCurrency: "CNY" });
    const initial = (await logs()).length;
    const changed = createInternalSummaryService(pool, async input => { await updateConfirmedCommercialTermsByQuote(pool, admin, provenance, { expectedQuoteVersion: record.version, expectedVersion: 1, confirmedLaborPrice: "4", customerConfirmedPrice: null, laborCurrency: "CNY" }); return buildQuoteSummaryTable(input); });
    await assert.rejects(changed.generate(admin, { ...selection(), items: [{ quoteId: ids[0], expectedVersion: record.version }], columns: ["quote", "confirmedLabor"] }), { status: 409, code: "commercial_terms_version_conflict" });
    assert.equal((await repo.getById(ids[0]))!.version, record.version); assert.equal((await logs()).length, initial);
  });
});

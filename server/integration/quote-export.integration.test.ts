import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import pg from "pg";
import { buildQuoteExcel } from "../../features/quote-center/export/quote-excel-core.js";
import { parseQuoteExportTemplateLayout } from "../../features/quote-center/export/quote-export-template-layout.js";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import { createApp } from "../app.js";
import { createAttachmentService } from "../attachments/service.js";
import { MemoryAttachmentStorage } from "../attachments/storage.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { updateConfirmedCommercialTermsByQuote } from "../confirmed-commercial-terms/service.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

const origin = "http://127.0.0.1:39992";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const probe = "SYNTHETIC_PRIVATE_ESTIMATE_NOT_FOR_CUSTOMER";
async function workbook(bytes: Uint8Array) {
  const value = new ExcelJS.Workbook();
  await value.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return value;
}

test("Customer Quote export: disposable PostgreSQL, saved snapshots and trusted audit only", { timeout: 240_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_customer_export") });
  const storage = new MemoryAttachmentStorage();
  const repo = createQuoteRepository(pool);
  await runMigrations(pool, resolve("database/migrations"));
  const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES('export-test','synthetic-unused-hash','Trusted Export','viewer',true) RETURNING id::text,public_id::text")).rows[0];
  const actor: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, username: "export-test", userName: "Trusted Export", permissions: [...PERMISSION_KEYS] };
  let active: TrustedIdentity | null = actor;
  const server = createServer(createApp({ pool, attachmentStorage: storage, allowedOrigins: [origin], security: { secureCookies: false, sessionTtlSeconds: 3600 }, identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => active } }));
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); await pool.end(); await postgres.stop(); });
  const templatePath = resolve("templates/quote-export-template-v1.xlsx");
  const template = await readFile(templatePath);
  const templateHash = digest(template);
  const layout = parseQuoteExportTemplateLayout((await workbook(template)).worksheets[0]);
  const post = (id: string, body: object) => fetch(`${base}/api/v1/quotes/${id}/customer-export`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Zhixu-Request": "1" }, body: JSON.stringify(body) });
  const seeded = async (id: string, type: "processing" | "distribution" = "distribution", customize?: (quote: ReturnType<typeof createSyntheticQuoteFixture>) => void) => {
    const browser = createSyntheticQuoteFixture(id, type);
    for (const revision of browser.revisions) {
      revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; revision.garmentMedia = []; revision.quoteDocuments = [];
      revision.baseInfo.quoteStyleNo = revision.readOnly ? "HISTORY-SYNTHETIC" : "CURRENT-SYNTHETIC";
      revision.priceVersions.forEach((pv, index) => {
        pv.name = index ? "Same:Sheet" : "Same/Sheet";
        pv.labor.value = index ? 2 : 0;
        pv.pricingParameters.laborCurrency = index ? "USD" : "CNY";
        pv.trims[0].usage = null; pv.trims[1].usage = 0;
      });
    }
    browser.activeEstimateCost!.fabrics[0].name = probe;
    browser.estimateCostHistory[0].fabrics[0].name = probe;
    customize?.(browser);
    const record = await repo.create(quoteSnapshotFromBrowser(browser));
    return { browser, record };
  };
  const { browser, record } = await seeded("export-main");
  const current = record.quote.revisions.find(r => r.revisionId === record.quote.defaultRevisionId)!;
  const body = { expectedVersion: record.version, revisionId: current.revisionId, priceVersionIds: current.priceVersions.map(p => p.id) };
  const logCount = async (id: string) => (await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE quote_id=$1", [id])).rows[0].n as number;

  await t.test("anonymous, each required permission and historical permission fail closed", async () => {
    active = null; assert.equal((await post(record.quote.id, body)).status, 401);
    for (const permission of ["quote.view", "quote.export", "quote.cost.view"] as const) {
      active = { ...actor, permissions: actor.permissions.filter(p => p !== permission) };
      assert.equal((await post(record.quote.id, body)).status, 403);
    }
    active = { ...actor, permissions: ["quote.view", "quote.export", "quote.cost.view"] };
    const history = record.quote.revisions[0];
    assert.equal((await post(record.quote.id, { ...body, revisionId: history.revisionId, priceVersionIds: [history.priceVersions[0].id] })).status, 403);
    assert.equal(await logCount(record.quote.id), 0); active = actor;
  });

  await t.test("stale, foreign and malformed selection reject without snapshot or audit mutation", async () => {
    for (const ids of [[], [body.priceVersionIds[0], body.priceVersionIds[0]], Array.from({ length: 21 }, (_, n) => `synthetic-${n}`)]) {
      assert.equal((await post(record.quote.id, { ...body, priceVersionIds: ids })).status, 400);
    }
    assert.equal((await post(record.quote.id, { ...body, expectedVersion: record.version + 1 })).status, 409);
    assert.equal((await post(record.quote.id, { ...body, revisionId: "foreign-revision" })).status, 404);
    assert.equal((await post(record.quote.id, { ...body, priceVersionIds: ["foreign-price"] })).status, 404);
    assert.equal((await post(record.quote.id, { ...body, actor: "spoof", fileName: "spoof.xlsx" })).status, 400);
    assert.equal(await logCount(record.quote.id), 0); assert.deepEqual(await repo.getById(record.quote.id), record);
  });

  await t.test("one/all current and history exports match the formal builder, need no Estimate permission", async () => {
    active = { ...actor, permissions: ["quote.view", "quote.export", "quote.cost.view", "quote.revision.view"] };
    for (const revision of browser.revisions) for (const selected of [[revision.priceVersions[0]], revision.priceVersions]) {
      const response = await post(record.quote.id, { ...body, revisionId: revision.revisionId, priceVersionIds: selected.map(p => p.id) });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /spreadsheetml/);
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.equal(response.headers.get("x-zhixu-file-sha256"), digest(bytes));
      assert.match(decodeURIComponent(response.headers.get("x-zhixu-file-name") ?? ""), /\.xlsx$/);
      assert.ok(Array.isArray(JSON.parse(decodeURIComponent(response.headers.get("x-zhixu-export-warnings") ?? ""))));
      const actual = await workbook(bytes);
      const expectedBytes = (await buildQuoteExcel({ template: template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength) as ArrayBuffer, quote: browser, revision, priceVersions: selected })).buffer;
      const expected = await workbook(new Uint8Array(expectedBytes));
      assert.deepEqual(actual.worksheets.map(s => s.name), expected.worksheets.map(s => s.name));
      actual.worksheets.forEach((sheet, index) => {
        assert.deepEqual(sheet.getSheetValues(), expected.worksheets[index].getSheetValues());
        assert.equal(sheet.pageSetup.printArea, expected.worksheets[index].pageSetup.printArea);
        assert.doesNotMatch(JSON.stringify(sheet.getSheetValues()), new RegExp(probe));
        assert.equal(sheet.getCell(layout.sections.trim.dataStartRow, layout.sections.trim.columns.initialQuantity).value, null);
        assert.equal(sheet.getCell(layout.sections.trim.dataStartRow + 1, layout.sections.trim.columns.initialQuantity).value, 0);
      });
      assert.deepEqual(await repo.getById(record.quote.id), record);
    }
    const logs = (await pool.query("SELECT actor_user_id::text,actor_name,metadata FROM operation_logs WHERE quote_id=$1", [record.quote.id])).rows;
    assert.equal(logs.length, 4);
    assert.ok(logs.every(log => log.actor_user_id === actor.internalUserId && log.actor_name === actor.userName));
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(probe)); active = actor;
  });

  await t.test("processing Quote uses its own saved type and current selection", async () => {
    const processing = await seeded("export-processing", "processing");
    const revision = processing.record.quote.revisions.at(-1)!;
    const response = await post(processing.record.quote.id, { expectedVersion: processing.record.version, revisionId: revision.revisionId, priceVersionIds: [revision.priceVersions[0].id] });
    assert.equal(response.status, 200); assert.equal((await workbook(new Uint8Array(await response.arrayBuffer()))).worksheets.length, 1);
    assert.deepEqual(await repo.getById(processing.record.quote.id), processing.record);
  });

  await t.test("server-linked legal PNG is embedded from memory object storage", async () => {
    const image = await seeded("export-image"); const attachments = createAttachmentService(pool, storage);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
    const uploaded = await attachments.upload(actor, image.record.quote.id, image.record.quote.defaultRevisionId, image.record.version, { name: "synthetic.png", mimeType: "image/png", kind: "image", bytes: png, uploadToken: randomUUID() });
    await attachments.style(actor, image.record.quote.id, image.record.quote.defaultRevisionId, uploaded.attachment.id, uploaded.version);
    const saved = (await repo.getById(image.record.quote.id))!; const revision = saved.quote.revisions.at(-1)!;
    const response = await post(saved.quote.id, { expectedVersion: saved.version, revisionId: revision.revisionId, priceVersionIds: [revision.priceVersions[0].id] });
    assert.equal(response.status, 200); assert.equal((await workbook(new Uint8Array(await response.arrayBuffer()))).worksheets[0].getImages().length, 1);
    assert.deepEqual(await repo.getById(saved.quote.id), saved);
  });

  await t.test("linked current customer confirmation is shared CCT truth while history retains its own snapshot", async () => {
    const linked = await seeded("export-linked-confirmation", "distribution", quote => {
      for (const revision of quote.revisions) revision.priceVersions[0].confirmation = {
        quotedGarmentPrice: 21, confirmedGarmentPrice: revision.readOnly ? 19 : 17,
        quotedLaborPrice: 2, confirmedLaborPrice: 1, note: "Synthetic saved snapshot", confirmedAt: "2026-01-01T00:00:00Z",
      };
    });
    const current = linked.record.quote.revisions.at(-1)!;
    const provenance = { quoteId: linked.record.quote.id, revisionId: current.revisionId, priceVersionId: current.priceVersions[0].id };
    await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: provenance.quoteId, sourceRevisionId: provenance.revisionId, sourcePriceVersionId: provenance.priceVersionId });
    const confirmedCell = layout.summary.customerConfirmedPrice;
    const exportedPrice = async (revision: typeof current) => {
      const response = await post(linked.record.quote.id, { expectedVersion: linked.record.version, revisionId: revision.revisionId, priceVersionIds: [revision.priceVersions[0].id] });
      assert.equal(response.status, 200);
      return (await workbook(new Uint8Array(await response.arrayBuffer()))).worksheets[0].getCell(confirmedCell.row, confirmedCell.column).value;
    };
    assert.equal(await exportedPrice(current), null, "linked but unconfigured CCT must not fall back to saved PV confirmation 17");
    await updateConfirmedCommercialTermsByQuote(pool, actor, provenance, { expectedVersion: 0, customerConfirmedPrice: "88.25", confirmedLaborPrice: "1", laborCurrency: "CNY" });
    assert.equal(await exportedPrice(current), 88.25);
    assert.equal(await exportedPrice(linked.record.quote.revisions[0]), 19);
    assert.deepEqual(await repo.getById(linked.record.quote.id), linked.record, "CCT and export must not rewrite current or historical Quote snapshots");
  });

  await t.test("corrupt PNG and unsupported WebP produce warnings and no embedded image; authorization errors never become warnings", async () => {
    for (const [kind, bytes, mimeType] of [
      ["corrupt-png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"],
      ["crc-damaged-png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZxoAAAAASUVORK5CYII=", "base64"), "image/png"],
      ["unsupported-webp", Buffer.from("RIFF0000WEBPsynthetic", "ascii"), "image/webp"],
    ] as const) {
      const image = await seeded(`export-${kind}`); const attachments = createAttachmentService(pool, storage);
      const uploaded = await attachments.upload(actor, image.record.quote.id, image.record.quote.defaultRevisionId, image.record.version, { name: `${kind}.${mimeType.split("/")[1]}`, mimeType, kind: "image", bytes, uploadToken: randomUUID() });
      await attachments.style(actor, image.record.quote.id, image.record.quote.defaultRevisionId, uploaded.attachment.id, uploaded.version);
      const saved = (await repo.getById(image.record.quote.id))!; const revision = saved.quote.revisions.at(-1)!;
      const selection = { expectedVersion: saved.version, revisionId: revision.revisionId, priceVersionIds: [revision.priceVersions[0].id] };
      active = null; const unauthorized = await post(saved.quote.id, selection); assert.equal(unauthorized.status, 401); assert.equal(unauthorized.headers.get("x-zhixu-export-warnings"), null);
      active = { ...actor, permissions: ["quote.view", "quote.export"] }; const forbidden = await post(saved.quote.id, selection); assert.equal(forbidden.status, 403); assert.equal(forbidden.headers.get("x-zhixu-export-warnings"), null);
      active = actor; const response = await post(saved.quote.id, selection); assert.equal(response.status, 200);
      const warnings = JSON.parse(decodeURIComponent(response.headers.get("x-zhixu-export-warnings") ?? "")) as string[];
      assert.ok(warnings.some(warning => /款式图/.test(warning)));
      assert.equal((await workbook(new Uint8Array(await response.arrayBuffer()))).worksheets[0].getImages().length, 0);
      assert.deepEqual(await repo.getById(saved.quote.id), saved);
    }
  });

  await t.test("incomplete order Quote provenance rejects current export but leaves historical snapshot export available", async () => {
    const partial = await seeded("export-partial-provenance");
    await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: partial.record.quote.id });
    const current = partial.record.quote.revisions.at(-1)!;
    const before = await logCount(partial.record.quote.id);
    const response = await post(partial.record.quote.id, { expectedVersion: partial.record.version, revisionId: current.revisionId, priceVersionIds: [current.priceVersions[0].id] });
    assert.equal(response.status, 409); assert.equal(response.headers.get("x-zhixu-file-name"), null);
    assert.equal(await logCount(partial.record.quote.id), before);
    const history = partial.record.quote.revisions[0];
    const historical = await post(partial.record.quote.id, { expectedVersion: partial.record.version, revisionId: history.revisionId, priceVersionIds: [history.priceVersions[0].id] });
    assert.equal(historical.status, 200); assert.equal((await workbook(new Uint8Array(await historical.arrayBuffer()))).worksheets.length, 1);
    assert.deepEqual(await repo.getById(partial.record.quote.id), partial.record);
  });

  await t.test("audit failure returns no workbook and rolls back export log without changing Quote", async () => {
    const failure = await seeded("export-audit-failure"); const revision = failure.record.quote.revisions.at(-1)!;
    await pool.query(`CREATE FUNCTION synthetic_export_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.quote_id = 'export-audit-failure' THEN RAISE EXCEPTION 'synthetic export audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_export_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_export_audit_failure()`);
    try {
      const response = await post(failure.record.quote.id, { expectedVersion: failure.record.version, revisionId: revision.revisionId, priceVersionIds: [revision.priceVersions[0].id] });
      assert.equal(response.status, 500); assert.doesNotMatch(response.headers.get("content-type") ?? "", /spreadsheetml/);
      assert.equal(await logCount(failure.record.quote.id), 0); assert.deepEqual(await repo.getById(failure.record.quote.id), failure.record);
    } finally { await pool.query("DROP TRIGGER synthetic_export_audit_failure ON operation_logs; DROP FUNCTION synthetic_export_audit_failure()"); }
  });
  assert.equal(digest(await readFile(templatePath)), templateHash);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import pg from "pg";
import { buildQuoteExcel } from "../../features/quote-center/export/quote-excel-core.js";
import { createApp } from "../app.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

const origin = "http://127.0.0.1:39993";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const secretProbe = "SYNTHETIC_BATCH_PRIVATE_ESTIMATE";
type Report = { selected: number; success: number; failed: Array<{ index: number; code: string }> };
type ManifestItem = { index: number; quoteId: string; sourceVersion: number; revisionId?: string; priceVersionIds?: string[]; fileName?: string; sha256?: string; status: string; code?: string };
async function load(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

test("Customer batch export uses disposable Quote snapshots, bounded selections and honest ZIP reports", { timeout: 240_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_batch_export") });
  await runMigrations(pool, resolve("database/migrations"));
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES('batch-export-test','synthetic-unused-hash','Trusted Batch Export','viewer',true) RETURNING id::text,public_id::text")).rows[0];
  const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "batch-export-test", userName: "Trusted Batch Export", permissions: ["quote.view", "quote.export", "quote.cost.view"] };
  let active: TrustedIdentity | null = actor;
  const server = createServer(createApp({ pool, allowedOrigins: [origin], security: { secureCookies: false, sessionTtlSeconds: 3600 }, identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => active } }));
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); await pool.end(); await postgres.stop(); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const repo = createQuoteRepository(pool);
  const templatePath = resolve("templates/quote-export-template-v1.xlsx");
  const template = await readFile(templatePath); const templateSha = sha(template);
  const seeded = async (id: string, style: string) => {
    const browser = createSyntheticQuoteFixture(id);
    for (const revision of browser.revisions) {
      revision.baseInfo.quoteStyleNo = revision.readOnly ? "HISTORICAL-NOT-SELECTED" : style;
      revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; revision.garmentMedia = []; revision.quoteDocuments = [];
    }
    browser.activeEstimateCost!.fabrics[0].name = secretProbe; browser.estimateCostHistory[0].fabrics[0].name = secretProbe;
    return { browser, record: await repo.create(quoteSnapshotFromBrowser(browser)) };
  };
  const first = await seeded("batch-first", "Collision");
  const second = await seeded("batch-second", "collision");
  const selections = [first, second].map(q => ({ quoteId: q.record.quote.id, expectedVersion: q.record.version }));
  const post = (body: unknown) => fetch(`${base}/api/v1/quotes/customer-batch-export`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Zhixu-Request": "1" }, body: JSON.stringify(body) });
  const logCount = async () => (await pool.query("SELECT count(*)::int AS n FROM operation_logs")).rows[0].n as number;
  const readZip = async (response: Response) => {
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type") ?? "", /zip/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.headers.get("x-zhixu-file-sha256"), sha(bytes));
    assert.match(decodeURIComponent(response.headers.get("x-zhixu-file-name") ?? ""), /\.zip$/);
    const report = JSON.parse(decodeURIComponent(response.headers.get("x-zhixu-batch-report") ?? "")) as Report;
    const zip = await JSZip.loadAsync(bytes);
    const manifest = JSON.parse(await zip.file("export-results.json")!.async("string")) as Report & { snapshot: string; items: ManifestItem[] };
    assert.deepEqual({ selected: manifest.selected, success: manifest.success, failed: manifest.failed }, report);
    assert.match(manifest.snapshot, /not a global snapshot/);
    assert.doesNotMatch(JSON.stringify(manifest), new RegExp(secretProbe));
    return { zip, report, manifest };
  };

  await t.test("anonymous and each required permission reject without writes", async () => {
    active = null; assert.equal((await post({ items: selections })).status, 401);
    for (const key of actor.permissions) { active = { ...actor, permissions: actor.permissions.filter(p => p !== key) }; assert.equal((await post({ items: selections })).status, 403); }
    active = actor; assert.equal(await logCount(), 0);
  });
  await t.test("empty, duplicate, over-limit, unsafe versions and spoofed unknown fields reject", async () => {
    for (const body of [{ items: [] }, { items: [selections[0], selections[0]] }, { items: Array.from({ length: 26 }, (_, i) => ({ quoteId: `synthetic-${i}`, expectedVersion: 1 })) }, ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null].map(expectedVersion => ({ items: [{ ...selections[0], expectedVersion }] })), { items: selections, actor: "spoof" }, { items: [{ ...selections[0], revisionId: "spoof" }] }, { items: [{ ...selections[0], fileName: "spoof" }] }]) {
      assert.equal((await post(body)).status, 400);
    }
    assert.equal(await logCount(), 0);
  });
  await t.test("all successes use default Revision, all PVs, collision-safe names and formal workbook parity", async () => {
    const { zip, report, manifest } = await readZip(await post({ items: selections }));
    assert.deepEqual(report, { selected: 2, success: 2, failed: [] });
    assert.equal(Object.keys(zip.files).length, 3);
    const names = manifest.items.map(item => item.fileName!.toLowerCase()); assert.equal(new Set(names).size, 2); assert.match(names[1], /_2\.xlsx$/);
    for (const [index, source] of [first, second].entries()) {
      const item = manifest.items[index]; const revision = source.browser.revisions.find(r => r.revisionId === source.browser.defaultRevisionId)!;
      assert.equal(item.status, "success"); assert.equal(item.index, index); assert.equal(item.quoteId, source.record.quote.id); assert.equal(item.sourceVersion, source.record.version);
      assert.equal(item.revisionId, revision.revisionId); assert.deepEqual(item.priceVersionIds, revision.priceVersions.map(p => p.id));
      const bytes = await zip.file(item.fileName!)!.async("uint8array"); assert.equal(sha(bytes), item.sha256);
      const actual = await load(bytes); const expected = await load(new Uint8Array((await buildQuoteExcel({ template: template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength) as ArrayBuffer, quote: source.browser, revision, priceVersions: revision.priceVersions })).buffer));
      assert.deepEqual(actual.worksheets.map(s => s.name), expected.worksheets.map(s => s.name));
      actual.worksheets.forEach((sheet, i) => { assert.deepEqual(sheet.getSheetValues(), expected.worksheets[i].getSheetValues()); assert.doesNotMatch(JSON.stringify(sheet.getSheetValues()), new RegExp(secretProbe)); });
      assert.deepEqual(await repo.getById(source.record.quote.id), source.record);
    }
    const logs = (await pool.query("SELECT actor_user_id::text,actor_name,metadata FROM operation_logs ORDER BY id")).rows;
    const batch = logs.filter(row => row.metadata.workflowAction === "customer.batch.generated"); assert.equal(batch.length, 1);
    assert.equal(batch[0].actor_user_id, actor.internalUserId); assert.equal(batch[0].actor_name, actor.userName);
    assert.deepEqual(batch[0].metadata.items, manifest.items); assert.doesNotMatch(JSON.stringify(logs), new RegExp(secretProbe));
    assert.ok(!JSON.stringify(logs).includes('"fabrics"')); assert.ok(!JSON.stringify(logs).includes('"base64"'));
  });
  await t.test("partial stale and missing items remain explicit failures without phantom ZIP entries", async () => {
    const { zip, report, manifest } = await readZip(await post({ items: [selections[0], { ...selections[1], expectedVersion: 99 }, { quoteId: "synthetic-missing", expectedVersion: 1 }] }));
    assert.deepEqual(report, { selected: 3, success: 1, failed: [{ index: 1, code: "quote_version_conflict" }, { index: 2, code: "quote_not_found" }] });
    assert.equal(Object.keys(zip.files).length, 2); assert.deepEqual(manifest.items.map(item => item.status), ["success", "failed", "failed"]);
    assert.ok(manifest.items.slice(1).every(item => !item.fileName && !item.sha256));
  });
  await t.test("all failures return JSON report and no empty download or audit", async () => {
    const before = await logCount(); const response = await post({ items: [{ ...selections[0], expectedVersion: 99 }, { quoteId: "synthetic-missing", expectedVersion: 1 }] });
    assert.match(response.headers.get("content-type") ?? "", /json/); assert.equal(response.headers.get("x-zhixu-file-name"), null);
    assert.deepEqual((await response.json() as { report: Report }).report, { selected: 2, success: 0, failed: [{ index: 0, code: "quote_version_conflict" }, { index: 1, code: "quote_not_found" }] });
    assert.equal(await logCount(), before);
  });
  await t.test("one selection and the exact 25-Quote boundary are valid", async () => {
    const single = await readZip(await post({ items: [selections[0]] }));
    assert.deepEqual(single.report, { selected: 1, success: 1, failed: [] });
    assert.equal(single.manifest.items.length, 1);
    const before = await logCount();
    const response = await post({ items: Array.from({ length: 25 }, (_, index) => ({ quoteId: `synthetic-boundary-missing-${index}`, expectedVersion: 1 })) });
    const report = (await response.json() as { report: Report }).report;
    assert.equal(report.selected, 25); assert.equal(report.success, 0); assert.equal(report.failed.length, 25);
    assert.ok(report.failed.every((failure, index) => failure.index === index && failure.code === "quote_not_found"));
    assert.equal(await logCount(), before);
  });
  assert.deepEqual(await repo.getById(first.record.quote.id), first.record); assert.deepEqual(await repo.getById(second.record.quote.id), second.record);
  assert.equal(sha(await readFile(templatePath)), templateSha);
});

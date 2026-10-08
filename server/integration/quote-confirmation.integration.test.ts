import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import { calculatePriceVersionMetrics } from "../../features/quote-center/model/quote-calculations.js";
import { createApp } from "../app.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { canonicalDecimal, quoteSnapshotFromBrowser, type QuoteRecord } from "../quotes/model.js";
import type { QuoteResponseRecord } from "../quotes/quote-response.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

test("Quote confirmation commands: trusted snapshots, independent Estimate permissions and atomic CAS", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_confirmation") });
  t.after(async () => { await pool.end(); await postgres.stop(); });
  await runMigrations(pool, resolve("database/migrations"));
  const identity = async (name: string, permissions: TrustedIdentity["permissions"]): Promise<TrustedIdentity> => {
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES($1,'synthetic-unused',$2,'viewer',true) RETURNING id::text,public_id::text", [name, `Trusted ${name}`])).rows[0];
    return { internalUserId: row.id, userId: row.public_id, username: name, userName: `Trusted ${name}`, permissions };
  };
  const admin = await identity("confirmation-admin", [...PERMISSION_KEYS]);
  const confirmer = await identity("confirmation-no-estimate", ["quote.view", "quote.confirm", "quote.cost.view", "quote.revision.view"]);
  const viewer = await identity("confirmation-viewer", ["quote.view", "quote.cost.view", "quote.revision.view"]);
  let active: TrustedIdentity | null = admin;
  const requestOrigin = "http://127.0.0.1:39992";
  const server = createServer(createApp({ pool, allowedOrigins: [requestOrigin], identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => active } }));
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const repo = createQuoteRepository(pool);
  const seeded = async (id: string, type: "processing" | "distribution" = "distribution") => {
    const browser = createSyntheticQuoteFixture(id, type);
    browser.aggregateStatus = "draft";
    for (const revision of browser.revisions) {
      revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null;
      revision.garmentMedia = []; revision.quoteDocuments = [];
      revision.baseInfo.quoteStyleNo = `SYNTHETIC-${id}`; revision.baseInfo.styleName = "Synthetic confirmation";
      for (const pv of revision.priceVersions) {
        pv.quantity = 0; pv.trims.forEach(row => { row.usage = 0; });
        pv.labor.value = 12.5;
      }
      if (revision.revisionId === browser.defaultRevisionId) {
        revision.priceVersions.forEach(pv => { pv.confirmation = null; });
        revision.confirmationSummary = { confirmedCount: 0, totalCount: revision.priceVersions.length };
      }
    }
    return { browser, record: await repo.create(quoteSnapshotFromBrowser(browser)) };
  };
  const request = async (quoteId: string, body: object, suffix = "/confirmation-workflows", method = "POST") => {
    const response = await fetch(`${origin}/api/v1/quotes/${quoteId}${suffix}`, { method, headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1", Origin: requestOrigin }, body: JSON.stringify(body) });
    const payload = await response.json() as { quote?: QuoteResponseRecord; error?: { code: string } };
    return { status: response.status, payload };
  };
  const command = (record: QuoteRecord, index = 0, overrides: Record<string, unknown> = {}) => {
    const revision = record.quote.revisions.find(r => r.revisionId === record.quote.defaultRevisionId)!;
    return { action: "confirmation.save", expectedVersion: record.version, revisionId: revision.revisionId,
      priceVersionId: revision.priceVersions[index].id, confirmedLaborPrice: "0",
      confirmedGarmentPrice: revision.baseInfo.quoteType === "processing" ? null : "0", note: "Synthetic customer confirmation", ...overrides };
  };
  const logs = async (id: string) => (await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE quote_id=$1", [id])).rows[0].n;
  const read = async (id: string) => (await repo.getById(id))!;
  const restricted = (record: QuoteResponseRecord) => {
    assert.ok("estimateVisibility" in record && record.estimateVisibility === "restricted");
    assert.equal(Object.hasOwn(record.quote, "activeEstimateCost"), false);
    assert.equal(Object.hasOwn(record.quote, "estimateCostHistory"), false);
    assert.equal(JSON.stringify(record).includes("estimate-active"), false);
  };

  await t.test("401/403 and forged actor/time/quoted snapshot fields fail closed", async () => {
    const { record } = await seeded("confirmation-security");
    active = null; assert.equal((await request(record.quote.id, command(record))).status, 401);
    active = viewer; assert.equal((await request(record.quote.id, command(record))).status, 403);
    active = { ...confirmer, permissions: ["quote.confirm"] }; assert.equal((await request(record.quote.id, command(record))).status, 403);
    active = confirmer;
    for (const forged of [{ actor: "forged" }, { confirmedAt: "2020-01-01T00:00:00Z" }, { quotedLaborPrice: "123" }, { quotedGarmentPrice: "123" }, { aggregateStatus: "confirmed" }, { confirmationSummary: { confirmedCount: 2, totalCount: 2 } }]) {
      assert.equal((await request(record.quote.id, command(record, 0, forged))).status, 400);
    }
    assert.deepEqual(await read(record.quote.id), record); assert.equal(await logs(record.quote.id), 0);
  });

  await t.test("processing/distribution zero confirmation derives saved snapshots, preserves unrelated slices and projects response", async () => {
    for (const type of ["processing", "distribution"] as const) {
      const { browser, record } = await seeded(`confirmation-${type}`, type);
      active = confirmer; // quote.confirm is sufficient; this identity has neither quote.edit nor Estimate permissions.
      const result = await request(record.quote.id, command(record));
      assert.equal(result.status, 200); restricted(result.payload.quote!);
      const after = await read(record.quote.id), revision = after.quote.revisions.find(r => r.revisionId === after.quote.defaultRevisionId)!;
      const pv = revision.priceVersions[0], confirmation = pv.confirmation!;
      assert.equal(after.version, record.version + 1);
      assert.equal(confirmation.confirmedLaborPrice, "0");
      assert.equal(confirmation.confirmedGarmentPrice, type === "processing" ? null : "0");
      assert.equal(confirmation.quotedLaborPrice, "12.5");
      const browserRevision = browser.revisions.find(r => r.revisionId === browser.defaultRevisionId)!;
      assert.equal(confirmation.quotedGarmentPrice, canonicalDecimal(String(calculatePriceVersionMetrics(browserRevision.priceVersions[0]).garmentSellingPrice)));
      assert.equal(typeof confirmation.confirmedAt, "string");
      assert.ok(Number.isFinite(Date.parse(confirmation.confirmedAt!)));
      assert.notEqual(confirmation.confirmedAt, "2026-01-01T00:00:00Z");
      assert.deepEqual(revision.priceVersions[1], record.quote.revisions.find(r => r.revisionId === record.quote.defaultRevisionId)!.priceVersions[1]);
      assert.deepEqual(after.quote.revisions.filter(r => r.readOnly), record.quote.revisions.filter(r => r.readOnly));
      assert.deepEqual(after.quote.activeEstimateCost, record.quote.activeEstimateCost);
      assert.deepEqual(after.quote.estimateCostHistory, record.quote.estimateCostHistory);
      assert.equal(after.quote.aggregateStatus, "partially_confirmed");
      assert.deepEqual(revision.confirmationSummary, { confirmedCount: 1, totalCount: 2 });
      const audit = (await pool.query("SELECT actor_user_id::text,actor_name,metadata FROM operation_logs WHERE quote_id=$1", [record.quote.id])).rows;
      assert.equal(audit.length, 1); assert.equal(audit[0].actor_user_id, confirmer.internalUserId);
      assert.equal(audit[0].actor_name, confirmer.userName); assert.equal(audit[0].metadata.workflowAction, "confirmation.save");
      assert.equal((await request(record.quote.id, command(after, 1))).status, 200);
      const complete = await read(record.quote.id);
      assert.equal(complete.quote.aggregateStatus, "confirmed");
      assert.equal((await request(record.quote.id, command(complete, 0, { confirmedLaborPrice: "1.25", confirmedGarmentPrice: type === "processing" ? null : "30.125", note: "Updated synthetic input" }))).status, 200);
      const updated = await read(record.quote.id);
      assert.equal(updated.quote.revisions.find(r => r.revisionId === updated.quote.defaultRevisionId)!.priceVersions[0].confirmation!.confirmedLaborPrice, "1.25");
      assert.equal(updated.quote.aggregateStatus, "confirmed");
    }
  });

  await t.test("confirmation input validation and exact owner/current Revision boundary", async () => {
    active = admin;
    const { record } = await seeded("confirmation-validation");
    for (const invalid of [{ confirmedLaborPrice: null }, { confirmedLaborPrice: -1 }, { confirmedLaborPrice: "-1" }, { confirmedLaborPrice: "NaN" }, { confirmedGarmentPrice: null }]) {
      assert.equal((await request(record.quote.id, command(record, 0, invalid))).status, 400);
    }
    const processing = (await seeded("confirmation-processing-invalid", "processing")).record;
    assert.equal((await request(processing.quote.id, command(processing, 0, { confirmedGarmentPrice: "1" }))).status, 400);
    const historical = record.quote.revisions.find(r => r.readOnly)!;
    assert.equal((await request(record.quote.id, command(record, 0, { revisionId: historical.revisionId, priceVersionId: historical.priceVersions[0].id }))).status, 409);
    assert.equal((await request(record.quote.id, command(record, 0, { revisionId: "foreign-revision" }))).status, 404);
    assert.equal((await request(record.quote.id, command(record, 0, { priceVersionId: "foreign-price-version" }))).status, 404);
    assert.equal((await request(record.quote.id, command(record), "/confirmation-workflows", "POST")).status, 200);
    assert.equal((await request(record.quote.id, command(record))).status, 409);
  });

  await t.test("generic PUT cannot mutate confirmation even with quote.confirm; unchanged snapshots still save", async () => {
    active = admin;
    const { record } = await seeded("confirmation-generic-put");
    assert.equal((await request(record.quote.id, command(record))).status, 200);
    const saved = await read(record.quote.id), beforeLogs = await logs(record.quote.id);
    const changed = structuredClone(saved.quote), revision = changed.revisions.find(r => r.revisionId === changed.defaultRevisionId)!;
    revision.priceVersions[0].confirmation!.confirmedLaborPrice = "99";
    const rejected = await request(saved.quote.id, { quote: changed, expectedVersion: saved.version }, "", "PUT");
    assert.equal(rejected.status, 409); assert.equal(rejected.payload.error?.code, "confirmation_command_required");
    assert.deepEqual(await read(saved.quote.id), saved); assert.equal(await logs(saved.quote.id), beforeLogs);
    const ordinary = structuredClone(saved.quote); ordinary.revisions.find(r => r.revisionId === ordinary.defaultRevisionId)!.baseInfo.note = "Ordinary authorized edit";
    active = { ...admin, permissions: admin.permissions.filter(p => p !== "quote.confirm") };
    assert.equal((await request(saved.quote.id, { quote: ordinary, expectedVersion: saved.version }, "", "PUT")).status, 200);
    const after = await read(saved.quote.id);
    assert.deepEqual(after.quote.revisions.find(r => r.revisionId === after.quote.defaultRevisionId)!.priceVersions[0].confirmation,
      saved.quote.revisions.find(r => r.revisionId === saved.quote.defaultRevisionId)!.priceVersions[0].confirmation);
  });

  await t.test("concurrent confirmation has exactly one winner and one trusted audit", async () => {
    active = confirmer;
    const { record } = await seeded("confirmation-concurrent");
    const body = command(record);
    const results = await Promise.all([request(record.quote.id, body), request(record.quote.id, body)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal((await read(record.quote.id)).version, record.version + 1); assert.equal(await logs(record.quote.id), 1);
  });

  await t.test("confirmation audit failure rolls back Quote snapshot/version and all logs", async () => {
    active = admin;
    const { record } = await seeded("confirmation-audit-rollback");
    await pool.query(`CREATE FUNCTION synthetic_confirmation_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.metadata->>'workflowAction' = 'confirmation.save' THEN RAISE EXCEPTION 'synthetic confirmation audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_confirmation_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_confirmation_audit_failure()`);
    try {
      assert.equal((await request(record.quote.id, command(record))).status, 500);
      assert.deepEqual(await read(record.quote.id), record); assert.equal(await logs(record.quote.id), 0);
    } finally { await pool.query("DROP TRIGGER synthetic_confirmation_audit_failure ON operation_logs; DROP FUNCTION synthetic_confirmation_audit_failure()"); }
  });

  await t.test("exact linked current fails closed instead of maintaining second Quote current; no order creation", async () => {
    active = admin;
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n, 0);
    const { record } = await seeded("confirmation-linked"), body = command(record);
    await pool.query("INSERT INTO sales_orders(creation_source,source_quote_id,source_revision_id,source_price_version_id) VALUES('quote',$1,$2,$3)", [record.quote.id, body.revisionId, body.priceVersionId]);
    const response = await request(record.quote.id, body);
    assert.equal(response.status, 409); assert.equal(response.payload.error?.code, "quote_confirmation_linked_read_only");
    assert.deepEqual(await read(record.quote.id), record); assert.equal(await logs(record.quote.id), 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_order_source_links")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM ainuoke_sales_order_contract_mirrors")).rows[0].n, 0);
  });
});

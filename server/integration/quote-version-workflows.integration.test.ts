import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { createApp } from "../app.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { quoteSnapshotFromBrowser, type QuoteRecord } from "../quotes/model.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { createAttachmentService } from "../attachments/service.js";
import { MemoryAttachmentStorage } from "../attachments/storage.js";

test("Quote version commands: disposable PostgreSQL, trusted API and exact snapshots", { timeout: 180000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_versions") });
  await runMigrations(pool, resolve("database/migrations"));
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES('versions-test','synthetic-unused-hash','Trusted Versions','viewer',true) RETURNING id::text,public_id::text")).rows[0];
  const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "versions-test", userName: "Trusted Versions", permissions: [...PERMISSION_KEYS] };
  let active: TrustedIdentity | null = actor;
  const server = createServer(createApp({ pool, allowedOrigins: ["http://127.0.0.1:39991"], security: { secureCookies: false, sessionTtlSeconds: 3600 }, identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => active } }));
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  const repo = createQuoteRepository(pool);
  const quote = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("version-commands"));
  for (const r of quote.revisions) {
    r.imageAttachmentIds = []; r.fileAttachmentIds = []; r.styleImageAttachmentId = null; r.garmentMedia = []; r.quoteDocuments = [];
    r.baseInfo.quoteStyleNo = "SYNTHETIC"; r.baseInfo.styleName = "Synthetic";
    for (const p of r.priceVersions) { p.quantity = "0"; p.trims.forEach(row => { row.usage = "0"; }); }
  }
  quote.revisions.at(-1)!.priceVersions[0].fabrics[0].unitPrice = "9007199254740993.123456789";
  let record = await repo.create(quote);
  const initialHistory = structuredClone(record.quote.revisions[0]);
  const post = async (body: Record<string, unknown>, quoteId = quote.id) => {
    const response = await fetch(`${origin}/api/v1/quotes/${quoteId}/version-workflows`, { method: "POST", headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1", Origin: "http://127.0.0.1:39991" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as { quote: QuoteRecord } };
  };
  const action = (name: string) => ({ action: name, expectedVersion: record.version, revisionId: record.quote.defaultRevisionId, priceVersionId: record.quote.revisions.at(-1)!.priceVersions[0].id });
  const create = () => ({ ...action("price.create"), name: "Parallel", quantity: "0", description: "Independent" });
  try {
    await t.test("anonymous and missing action permissions reject without write", async () => {
      active = null; assert.equal((await post(create())).status, 401);
      active = { ...actor, permissions: ["quote.edit"] }; assert.equal((await post(create())).status, 403); active = actor;
      assert.equal((await repo.getById(quote.id))!.version, 1);
    });
    await t.test("unknown actor/time/label fields, invalid input and cross-owner IDs reject", async () => {
      for (const extra of [{ actor: "spoof" }, { createdAt: "fake" }, { revisionLabel: "V99" }]) assert.equal((await post({ ...create(), ...extra })).status, 400);
      assert.equal((await post({ ...create(), quantity: "bad" })).status, 400);
      assert.equal((await post({ ...create(), priceVersionId: "other-quote-pv" })).status, 404);
      assert.equal((await post({ action: "revision.create", expectedVersion: record.version, sourceRevisionId: "other-quote-revision", reason: "其他", note: "" })).status, 404);
      const incomplete = structuredClone(quote);
      incomplete.id = "incomplete-synthetic-version"; incomplete.quoteCode = "QT-SYNTHETIC-INCOMPLETE";
      incomplete.activeEstimateCost = null; incomplete.estimateCostHistory = [];
      incomplete.revisions.at(-1)!.baseInfo.quoteStyleNo = "";
      const saved = await repo.create(incomplete);
      assert.equal((await post({ action: "revision.create", expectedVersion: saved.version, sourceRevisionId: incomplete.defaultRevisionId, reason: "其他", note: "" }, incomplete.id)).status, 400);
      assert.deepEqual(await repo.getById(incomplete.id), saved);
    });
    await t.test("PV copy preserves exact decimals/null/zero, source quantity/confirmation and line groups; new owner IDs", async () => {
      const before = structuredClone(record);
      const result = await post(create()); assert.equal(result.status, 200); record = result.body.quote;
      const source = record.quote.revisions.at(-1)!.priceVersions[0]; const copy = record.quote.revisions.at(-1)!.priceVersions.at(-1)!;
      assert.equal(copy.quantity, "0"); assert.equal(copy.confirmation, null); assert.notEqual(copy.id, source.id);
      assert.notEqual(copy.fabrics[0].id, source.fabrics[0].id); assert.equal(copy.fabrics[0].lineGroupId, source.fabrics[0].lineGroupId);
      assert.equal(copy.fabrics[0].unitPrice, "9007199254740993.123456789"); assert.equal(copy.fabrics[0].segmentLengthCm, null);
      assert.equal(source.quantity, before.quote.revisions.at(-1)!.priceVersions[0].quantity);
      assert.deepEqual(source.confirmation, before.quote.revisions.at(-1)!.priceVersions[0].confirmation);
      assert.deepEqual(record.quote.revisions[0], initialHistory);
    });
    await t.test("stale and historical commands reject, deleting last PV rejects", async () => {
      assert.equal((await post({ ...create(), expectedVersion: 1 })).status, 409);
      assert.equal((await post({ ...action("price.delete"), revisionId: initialHistory.revisionId, priceVersionId: initialHistory.priceVersions[0].id })).status, 409);
      while (record.quote.revisions.at(-1)!.priceVersions.length > 1) { const result=await post(action("price.delete")); assert.equal(result.status,200); record=result.body.quote; }
      assert.equal((await post(action("price.delete"))).status, 409);
      assert.equal(record.quote.revisions.at(-1)!.priceVersions[0].name, "基础价格");
    });
    await t.test("PV metadata update uses bound owner/version without changing cost snapshots", async () => {
      const before = structuredClone(record.quote.revisions.at(-1)!.priceVersions[0]);
      const result = await post({ ...action("price.update"), name: "Updated", quantity: "12.34567890123456789", description: "Updated independently" });
      assert.equal(result.status, 200); record = result.body.quote;
      const next = record.quote.revisions.at(-1)!.priceVersions[0];
      assert.equal(next.quantity, "12.34567890123456789"); assert.equal(next.name, "Updated");
      assert.deepEqual(next.fabrics, before.fabrics); assert.deepEqual(next.pricingParameters, before.pricingParameters);
      assert.deepEqual(next.confirmation, before.confirmation);
      assert.equal((await post({ action: "revision.create", expectedVersion: record.version, sourceRevisionId: initialHistory.revisionId, reason: "invented", note: "" })).status, 400);
    });
    await t.test("historical branching uses selected source, trusted provenance and existing naming; immutable source and estimate", async () => {
      const before = structuredClone(record);
      const result = await post({ action: "revision.create", expectedVersion: record.version, sourceRevisionId: initialHistory.revisionId, reason: "客户调价", note: "Branch" });
      assert.equal(result.status, 200); record=result.body.quote;
      const next=record.quote.revisions.at(-1)!;
      assert.equal(next.revisionLabel,"V1²"); assert.equal(next.parentRevisionId,initialHistory.revisionId); assert.equal(next.createdBy,actor.userName);
      assert.equal(next.priceVersions[0].id, initialHistory.priceVersions[0].id); assert.equal(next.priceVersions[0].fabrics[0].id, initialHistory.priceVersions[0].fabrics[0].id);
      assert.equal(next.basedOnConfirmedRevisionId, initialHistory.revisionId); assert.ok(next.priceVersions.every(p=>p.confirmation===null));
      assert.deepEqual(record.quote.revisions[0],initialHistory); assert.deepEqual(record.quote.activeEstimateCost,before.quote.activeEstimateCost);
    });
    await t.test("audit failure rolls back whole workflow and concurrency permits one winner", async () => {
      const before = await repo.getById(quote.id);
      await pool.query("CREATE FUNCTION reject_version_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
      await pool.query("CREATE TRIGGER reject_version_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_version_audit()");
      try { assert.equal((await post(create())).status,500); assert.deepEqual(await repo.getById(quote.id),before); } finally { await pool.query("DROP TRIGGER reject_version_audit ON operation_logs"); }
      const results=await Promise.all([post(create()),post(create())]); assert.deepEqual(results.map(r=>r.status).sort(),[200,409]); record=results.find(r=>r.status===200)!.body.quote;
      const logs=await pool.query("SELECT actor_name FROM operation_logs WHERE entity_type='Quote'"); assert.ok(logs.rows.every(r=>r.actor_name===actor.userName));
      assert.equal((await pool.query("SELECT count(*)::int n FROM sales_orders")).rows[0].n,0);
    });
    await t.test("Revision relationship and inherited-link audit failures roll back atomically; successful inheritance reuses object", async () => {
      const storage = new MemoryAttachmentStorage();
      const attachments = createAttachmentService(pool, storage);
      await attachments.upload(actor, quote.id, record.quote.defaultRevisionId, record.version, { name: "synthetic.pdf", mimeType: "application/pdf", kind: "file", bytes: Buffer.from("synthetic version attachment"), uploadToken: "00000000-0000-4000-8000-000000000099" });
      record = (await repo.getById(quote.id))!;
      const sourceId = record.quote.defaultRevisionId;
      const command = { action: "revision.create", expectedVersion: record.version, sourceRevisionId: sourceId, reason: "其他", note: "With attachment" };
      const before = structuredClone(record);
      const logs = Number((await pool.query("SELECT count(*) n FROM operation_logs")).rows[0].n);
      await pool.query("CREATE FUNCTION reject_version_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic link failure'; END $$");
      await pool.query("CREATE FUNCTION reject_inherited_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type = 'Attachment' THEN RAISE EXCEPTION 'synthetic inherited audit failure'; END IF; RETURN NEW; END $$");
      for (const [table, fn] of [["quote_revision_attachments", "reject_version_link"], ["operation_logs", "reject_inherited_audit"]]) {
        await pool.query(`CREATE TRIGGER reject_workflow BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
        try {
          assert.equal((await post(command)).status, 500);
          assert.deepEqual(await repo.getById(quote.id), before);
          assert.equal(Number((await pool.query("SELECT count(*) n FROM operation_logs")).rows[0].n), logs);
          assert.equal(Number((await pool.query("SELECT count(*) n FROM quote_revision_attachments")).rows[0].n), 1);
        } finally { await pool.query(`DROP TRIGGER reject_workflow ON ${table}`); }
      }
      const result = await post(command); assert.equal(result.status, 200); record = result.body.quote;
      assert.deepEqual(record.quote.revisions.at(-1)!.fileAttachmentIds, before.quote.revisions.at(-1)!.fileAttachmentIds);
      assert.equal(Number((await pool.query("SELECT count(*) n FROM quote_revision_attachments")).rows[0].n), 2);
      assert.equal(storage.objects.size, 1);
    });
  } finally { await new Promise<void>(done=>server.close(()=>done())); await pool.end(); await postgres.stop(); }
});

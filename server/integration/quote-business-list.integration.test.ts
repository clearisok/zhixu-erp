import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createApp } from "../app.js";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { listQuoteSummaries } from "../quotes/list-summary.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { updateConfirmedCommercialTermsByQuote } from "../confirmed-commercial-terms/service.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

test("business list is bounded, permission-filtered and uses independent current provenance", { timeout: 180_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("business_list") });
  t.after(async () => { await pool.end(); await postgres.stop(); });
  await runMigrations(pool, resolve("database/migrations"));
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('list-test','unused','Synthetic','viewer') RETURNING id::text,public_id::text")).rows[0];
  const admin: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "list-test", userName: "Synthetic", permissions: [...PERMISSION_KEYS] };
  const viewer: TrustedIdentity = { ...admin, permissions: ["quote.view"] };
  let actor: TrustedIdentity | null = admin;
  const server = createServer(createApp({ pool, identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => actor } }));
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>(done => server.close(() => done())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const get = async (query: string) => { const response = await fetch(base + "/api/v1/quotes?" + query); return { status: response.status, body: await response.json() }; };
  const repo = createQuoteRepository(pool);
  for (let i = 0; i < 27; i++) {
    const quote = createSyntheticQuoteFixture(`list-${String(i).padStart(2, "0")}`, i % 2 ? "processing" : "distribution");
    for (const r of quote.revisions) {
      r.imageAttachmentIds = []; r.fileAttachmentIds = []; r.styleImageAttachmentId = null;
      r.baseInfo.quoteStyleNo = "SYNTHETIC-LIST"; r.baseInfo.styleName = "Synthetic business view";
      for (const pv of r.priceVersions) pv.trims.forEach(line => line.usage = 0);
    }
    const current = quote.revisions.at(-1)!;
    current.priceVersions[0].quantity = 10; current.priceVersions[1].quantity = 20;
    current.priceVersions[0].confirmation = { quotedLaborPrice: 1, confirmedLaborPrice: 1, quotedGarmentPrice: 2, confirmedGarmentPrice: 2, note: "Old confirmation", confirmedAt: "2026-10-09T00:00:00Z" };
    current.confirmationSummary = { confirmedCount: 1, totalCount: 2 };
    const record = await repo.create(quoteSnapshotFromBrowser(quote));
    if (i === 26) {
      const provenance = { quoteId: quote.id, revisionId: current.revisionId, priceVersionId: current.priceVersions[0].id };
      await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: provenance.quoteId, sourceRevisionId: provenance.revisionId, sourcePriceVersionId: provenance.priceVersionId });
      await updateConfirmedCommercialTermsByQuote(pool, admin, provenance, { expectedQuoteVersion: record.version, expectedVersion: 0, confirmedLaborPrice: "0", customerConfirmedPrice: "99.5", laborCurrency: "CNY" });
    }
  }
  await t.test("page and filters preserve actual total; selected current values, no aggregate/history/Estimate leakage", async () => {
    const page = await get("limit=25&columns=quote,quantity,confirmedLabor,confirmedGarment,confirmationStatus,status");
    assert.equal(page.status, 200); assert.equal(page.body.page.total, 27); assert.equal(page.body.quotes.length, 25);
    const top = page.body.quotes[0]; assert.equal(top.id, "list-26"); assert.equal(top.business.quantity.value, 30);
    assert.equal(top.business.confirmedLabor.value, 0); assert.equal(top.business.confirmedGarment.value, 99.5);
    assert.equal(top.confirmationSources[0].linkage, "linked"); assert.equal(top.confirmationSources[1].linkage, "unlinked");
    assert.equal(top.version, 1); assert.equal(top.business.status.value, "报价中");
    assert.doesNotMatch(JSON.stringify(page.body), /estimate-active|estimate-old|Historical value|garmentMedia|fabrics|pricingParameters/u);
    const next = await get("limit=25&offset=25&columns=quantity"); assert.equal(next.body.page.count, 2);
    const filter = await get("type=processing&columns=type"); assert.equal(filter.body.page.total, 13);
    const search = await get("search=list-00&columns=quote"); assert.equal(search.body.page.total, 1);
  });
  await t.test("cost SQL query count is constant per page and excludes Estimate/history", async () => {
    const sql: string[] = [];
    const counted = { connect: async () => { const client = await pool.connect(); return { query: async (query: string, values?: unknown[]) => { sql.push(query); return client.query(query, values); }, release: () => client.release() }; } } as unknown as pg.Pool;
    await listQuoteSummaries(counted, { limit: 25, offset: 0, columns: ["labor", "quantity"] }, admin);
    assert.equal(sql.length, 9); // BEGIN/count/page/PVs/four cost tables/COMMIT.
    assert.ok(!sql.some(q => q.includes("quote_center_estimates")));
    assert.ok(sql.filter(q => q.includes("quote_center_price_versions")).every(q => q.includes("default_revision_id")));
  });
  await t.test("explicit columns are strict and trusted permission checks happen before reading", async () => {
    actor = viewer;
    assert.equal((await get("columns=quote,quantity,confirmationStatus")).status, 200);
    assert.equal((await get("columns=labor")).status, 403);
    assert.equal((await get("columns=estimateTotal")).status, 400);
    assert.equal((await get("columns=quote,quote")).status, 400);
    assert.equal((await get("columns=quote&columns=labor")).status, 400);
    assert.equal((await get("sortBy=labor")).status, 400);
    actor = null; assert.equal((await get("columns=quote")).status, 401); actor = admin;
  });
  await t.test("empty linked current never falls back, incomplete provenance remains unknown", async () => {
    const record = (await repo.getById("list-25"))!;
    const revision = record.quote.revisions.at(-1)!;
    await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: record.quote.id, sourceRevisionId: revision.revisionId, sourcePriceVersionId: revision.priceVersions[0].id });
    const empty = await get("search=list-25&columns=confirmedLabor,confirmationStatus");
    assert.equal(empty.body.quotes[0].business.confirmedLabor.value, null);
    assert.equal(empty.body.quotes[0].business.confirmationStatus.value, "未确认");
    await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: record.quote.id, sourceRevisionId: revision.revisionId }); // Immutable partial synthetic provenance from creation.
    const unknown = await get("search=list-25&columns=confirmedLabor,confirmationStatus");
    assert.equal(unknown.body.quotes[0].business.confirmedLabor.value, "关联未核实");
  });
  await t.test("hidden unsafe Estimate does not break ordinary projection; requested unsafe decimal fails closed", async () => {
    await pool.query("UPDATE quote_center_cost_snapshots SET labor_value=0.123456789012345678901 WHERE quote_id='list-00' AND estimate_id IS NOT NULL");
    assert.equal((await get("search=list-00&columns=labor,quantity")).status, 200);
    await pool.query("UPDATE quote_center_price_versions SET quantity=0.123456789012345678901 WHERE quote_id='list-00' AND revision_id='revision-two'");
    assert.equal((await get("search=list-00&columns=quote")).status, 200);
    const unsafe = await get("search=list-00&columns=quantity"); assert.equal(unsafe.status, 409);
    assert.doesNotMatch(JSON.stringify(unsafe.body), /123456789012/u);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_center_quotes WHERE version<>1")).rows[0].n, 0);
  });
});

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import { createApp } from "../app.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { createTrustedQuoteService } from "../quotes/service.js";
import { createCustomerExportService } from "../quotes/customer-export.js";
import { updateConfirmedCommercialTermsByQuote, updateConfirmedCommercialTermsBySalesOrder, readConfirmedCommercialTermsBySalesOrder } from "../confirmed-commercial-terms/service.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

test("Linked terms: saved-source authority, independent CAS, independent Order adoption boundary and controlled lock interleavings", { timeout: 240_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("linked_terms") });
  t.after(async () => { await pool.end(); await postgres.stop(); });
  await runMigrations(pool, resolve("database/migrations"));
  const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES('linked-synthetic','unused','Trusted Linked','viewer',true) RETURNING id::text,public_id::text")).rows[0];
  const admin: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, username: "linked-synthetic", userName: "Trusted Linked", permissions: [...PERMISSION_KEYS] };
  const confirmer = { ...admin, permissions: ["quote.view", "quote.confirm", "commercial.sale.view", "commercial.sale.edit", "commercial.labor.view", "commercial.labor.edit"] as TrustedIdentity["permissions"] };
  const orderEditor = { ...admin, permissions: ["order.view", "order.edit", "commercial.sale.view", "commercial.sale.edit", "commercial.labor.view", "commercial.labor.edit"] as TrustedIdentity["permissions"] };
  let active: TrustedIdentity | null = confirmer;
  const allowed = "http://127.0.0.1:39992";
  const server = createServer(createApp({ pool, allowedOrigins: [allowed], identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => active } }));
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>(done => server.close(() => done())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const repo = createQuoteRepository(pool);
  const seed = async (id: string, type: "distribution" | "processing" = "distribution", currency: "CNY" | "USD" = "CNY") => {
    const browser = createSyntheticQuoteFixture(id, type);
    for (const revision of browser.revisions) {
      revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null;
      revision.baseInfo.quoteStyleNo = "SYNTHETIC-LINKED"; revision.baseInfo.styleName = "Synthetic linked";
      for (const pv of revision.priceVersions) { pv.quantity = 0; pv.trims.forEach(r => r.usage = 0); pv.pricingParameters.laborCurrency = currency; }
    }
    const record = await repo.create(quoteSnapshotFromBrowser(browser));
    const revision = record.quote.revisions.at(-1)!;
    const provenance = { quoteId: id, revisionId: revision.revisionId, priceVersionId: revision.priceVersions[0].id };
    const orders = await Promise.all([1, 2].map(() => createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: id, sourceRevisionId: revision.revisionId, sourcePriceVersionId: provenance.priceVersionId })));
    const values = { expectedQuoteVersion: record.version, expectedVersion: 0, customerConfirmedPrice: type === "processing" ? null : "0", confirmedLaborPrice: "0", laborCurrency: currency };
    const path = `/api/v1/quotes/${id}/revisions/${revision.revisionId}/price-versions/${provenance.priceVersionId}/confirmed-commercial-terms`;
    return { record, provenance, orders, values, path };
  };
  const call = async (path: string, values?: object) => {
    const response = await fetch(base + path, { method: values ? "PATCH" : "GET", headers: { Origin: allowed, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: values ? JSON.stringify(values) : undefined });
    return { status: response.status, body: await response.json() };
  };
  const logs = async (id: string) => (await pool.query("SELECT * FROM operation_logs WHERE quote_id=$1 ORDER BY created_at,id", [id])).rows;
  const blocked = async (pid: number) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if ((await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.wait_event_type === "Lock") return;
      await new Promise<void>(done => setTimeout(done, 10));
    }
    assert.fail("Competing transaction did not reach a database lock wait");
  };
  // Test-only connection instrumentation pauses AFTER acquiring the real Quote row
  // lock; competing pg_stat_activity proves ordering, not Promise.all or a sleep.
  const hold = () => {
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(done => entered = done), gate = new Promise<void>(done => release = done);
    // Cleanup-only deadline, never used as concurrency evidence.
    const cleanupTimer = setTimeout(() => release(), 15000);
    const controlled = { connect: async () => {
      const client = await pool.connect(), query = client.query.bind(client);
      return { query: async (sql: string, values?: unknown[]) => {
        const result = await query(sql, values);
        if (sql === "SELECT version FROM quote_center_quotes WHERE id=$1 FOR UPDATE") { entered(); await gate; }
        return result;
      }, release: () => client.release() };
    } } as unknown as pg.Pool;
    return { controlled, ready, release: () => { clearTimeout(cleanupTimer); release(); } };
  };

  await t.test("quote confirmation precision, no-op and unchanged aggregates; orders require explicit adoption", async () => {
    for (const type of ["processing", "distribution"] as const) for (const currency of ["CNY", "USD"] as const) {
      const x = await seed(`linked-${type}-${currency}`, type, currency);
      active = confirmer;
      const first = await call(x.path, { ...x.values, confirmedLaborPrice: "0.000000000000000001" });
      assert.equal(first.status, 200); assert.equal(first.body.confirmedCommercialTerms.verifiedQuoteVersion, 1);
      assert.equal(JSON.stringify(first.body).includes("estimate-active"), false);
      active = orderEditor;
      for (const order of x.orders) {
        const read = await call(`/api/v1/sales-orders/${order.id}/confirmed-commercial-terms`);
        assert.equal(read.body.confirmedCommercialTerms.current, null);
      }
      const updated = await call(`/api/v1/sales-orders/${x.orders[0].id}/confirmed-commercial-terms`, { ...x.values, expectedQuoteVersion: undefined, expectedVersion: 1, confirmedLaborPrice: "1.000000000000000001" });
      assert.equal(updated.status, 409); assert.equal(updated.body.error.code,"order_commercial_adoption_required"); active = confirmer;
      assert.deepEqual((await call(x.path)).body.confirmedCommercialTerms.current, first.body.confirmedCommercialTerms.current);
      assert.equal((await call(x.path, {...x.values,expectedVersion:1,confirmedLaborPrice:"1.000000000000000001"})).status,200);
      assert.equal((await call(x.path, { ...x.values, expectedVersion: 2, confirmedLaborPrice: "1.000000000000000001" })).status, 200);
      assert.equal((await logs(x.record.quote.id)).length, 2);
      assert.deepEqual(await repo.getById(x.record.quote.id), x.record);
      for (const order of x.orders) assert.equal((await pool.query("SELECT version FROM sales_orders WHERE id=$1", [order.id])).rows[0].version, order.version);
    }
  });
  await t.test("old PATCH cannot bypass: separate versions, forged fields/currency, unknown/partial owner and trusted permissions", async () => {
    const x = await seed("linked-security"); active = confirmer;
    const old: Partial<typeof x.values> = { ...x.values }; delete old.expectedQuoteVersion;
    for (const [values, status] of [[old, 400], [{ ...x.values, expectedQuoteVersion: 2 }, 409], [{ ...x.values, expectedVersion: 1 }, 409], [{ ...x.values, laborCurrency: "USD" }, 409], [{ ...x.values, actor: "forged" }, 400], [{ ...x.values, confirmedAt: "forged" }, 400], [{ ...x.values, associatedSalesOrderIds: [] }, 400]] as const) assert.equal((await call(x.path, values)).status, status);
    active = { ...confirmer, permissions: ["quote.view"] }; assert.equal((await call(x.path)).status, 200); assert.equal((await call(x.path, x.values)).status, 403);
    active = null; assert.equal((await call(x.path, x.values)).status, 401); active = confirmer;
    const history = x.record.quote.revisions[0];
    await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: x.record.quote.id, sourceRevisionId: history.revisionId, sourcePriceVersionId: history.priceVersions[0].id });
    assert.equal((await call(x.path.replace(x.provenance.revisionId, history.revisionId).replace(x.provenance.priceVersionId, history.priceVersions[0].id), x.values)).status, 409);
    await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: "legacy-only", sourceRevisionId: "r", sourcePriceVersionId: "p" });
    assert.equal((await call("/api/v1/quotes/legacy-only/revisions/r/price-versions/p/confirmed-commercial-terms", x.values)).status, 404);
    assert.equal((await call(x.path.replace(x.provenance.priceVersionId, "foreign-pv"), x.values)).status, 409);
    await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: x.record.quote.id });
    assert.equal((await call(x.path)).status, 409);
    assert.equal((await call(x.path, x.values)).status, 409);
    assert.equal((await logs(x.record.quote.id)).length, 0); assert.deepEqual(await repo.getById(x.record.quote.id), x.record);
  });
  await t.test("concurrent Quote confirmations serialize; old Order updates reject before taking a connection", async () => {
    const x = await seed("linked-winner"), h = hold();
    const first = updateConfirmedCommercialTermsByQuote(h.controlled, confirmer, x.provenance, x.values);
    await h.ready;
    const client = await pool.connect(), pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const otherPool = { connect: async () => client } as unknown as pg.Pool;
    const contender = updateConfirmedCommercialTermsByQuote(otherPool, confirmer, x.provenance, { ...x.values, confirmedLaborPrice: "2" });
    const rejection = assert.rejects(contender, (e: unknown) => (e as { status: number }).status === 409);
    await blocked(pid); h.release(); await first; await rejection;
    assert.equal((await logs(x.record.quote.id)).length, 1);
    const h2 = hold();
    const quoteUpdate = updateConfirmedCommercialTermsByQuote(h2.controlled, confirmer, x.provenance, { ...x.values, expectedVersion: 1, confirmedLaborPrice: "3" });
    await h2.ready;
    await assert.rejects(()=>updateConfirmedCommercialTermsBySalesOrder({connect:async()=>{throw Error("old order writer must not connect");}} as unknown as pg.Pool,orderEditor,x.orders[0].id,{expectedVersion:1,confirmedLaborPrice:"4",customerConfirmedPrice:"0",laborCurrency:"CNY"}),(e:unknown)=>(e as {code:string}).code==="order_commercial_adoption_required");
    h2.release(); await quoteUpdate;
    assert.equal((await logs(x.record.quote.id)).length, 2);
  });
  await t.test("locked saved PV remains valid until commit; concurrent currency edit waits then stale Quote version rejects", async () => {
    const x = await seed("linked-currency-lock"), h = hold();
    const confirmation = updateConfirmedCommercialTermsByQuote(h.controlled, confirmer, x.provenance, x.values); await h.ready;
    const writer = await pool.connect(), pid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const changed = structuredClone(x.record.quote); changed.revisions.at(-1)!.priceVersions[0].pricingParameters.laborCurrency = "USD";
    const save = createQuoteRepository({ connect: async () => writer } as unknown as pg.Pool).save(changed, 1);
    await blocked(pid); h.release(); const terms = await confirmation; await save;
    assert.equal(terms.current?.laborCurrency, "CNY");
    await assert.rejects(() => updateConfirmedCommercialTermsByQuote(pool, confirmer, x.provenance, { ...x.values, expectedVersion: 1 }), (e: unknown) => (e as { code: string }).code === "quote_version_conflict");
    await assert.rejects(() => updateConfirmedCommercialTermsByQuote(pool, confirmer, x.provenance, { ...x.values, expectedQuoteVersion: 2, expectedVersion: 1 }), (e: unknown) => (e as { code: string }).code === "saved_quote_labor_currency_conflict");
    assert.equal((await logs(x.record.quote.id)).length, 1);
  });
  await t.test("new Revision and PV deletion cannot cross locked confirmation; unadopted Order stays empty", async () => {
    for (const action of ["revision.create", "price.delete"] as const) {
      const x = await seed(`linked-lock-${action}`), h = hold();
      const confirmation = updateConfirmedCommercialTermsByQuote(h.controlled, confirmer, x.provenance, x.values); await h.ready;
      const command = action === "revision.create" ? { action, expectedVersion: 1, sourceRevisionId: x.provenance.revisionId, reason: "其他", note: "Synthetic" } as const
        : { action, expectedVersion: 1, revisionId: x.provenance.revisionId, priceVersionId: x.provenance.priceVersionId } as const;
      const mutation = createTrustedQuoteService(pool).versionWorkflow(admin, x.record.quote.id, command);
      // Observe a Quote UPDATE lock waiter, rather than rely on elapsed time.
      const deadline = Date.now() + 10000;
      while (!(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT version FROM quote_center_quotes%' ")).rowCount) { assert.ok(Date.now() < deadline); await new Promise<void>(done => setTimeout(done, 10)); }
      h.release(); await confirmation; await mutation;
      const current = await readConfirmedCommercialTermsBySalesOrder(pool, x.orders[0].id);
      assert.equal(current.current,null);
      await assert.rejects(()=>updateConfirmedCommercialTermsBySalesOrder(pool,orderEditor,x.orders[1].id,{expectedVersion:0,confirmedLaborPrice:"7",customerConfirmedPrice:"0",laborCurrency:"CNY"}),(e:unknown)=>(e as {code:string}).code==="order_commercial_adoption_required");
    }
  });
  await t.test("audit failure rolls back first current and all associations; linked snapshot and generic PUT cannot become a second writer", async () => {
    const x = await seed("linked-rollback");
    await assert.rejects(() => updateConfirmedCommercialTermsByQuote(pool, { ...confirmer, internalUserId: "9223372036854775807" }, x.provenance, x.values));
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, x.orders[0].id)).current, null);
    assert.equal((await pool.query("SELECT 1 FROM confirmed_commercial_terms_sales_orders WHERE sales_order_id=$1", [x.orders[0].id])).rowCount, 0);
    await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,labor_currency) VALUES('quote',$1,$2,$3,'CNY')",[x.provenance.quoteId,x.provenance.revisionId,x.provenance.priceVersionId]);
    await assert.rejects(() => createTrustedQuoteService(pool).confirmationWorkflow(confirmer, x.record.quote.id, { action: "confirmation.save", expectedVersion: 1, revisionId: x.provenance.revisionId, priceVersionId: x.provenance.priceVersionId, confirmedLaborPrice: "1", confirmedGarmentPrice: "2", note: "No second writer" }));
    assert.deepEqual(await repo.getById(x.record.quote.id), x.record); assert.equal((await logs(x.record.quote.id)).length, 0);
  });
  await t.test("linked confirmation versus one/multiple-PV export waits on shared context then rejects mixed source without success audit", async () => {
    for (const multi of [false, true]) {
      const x = await seed(`linked-export-lock-${multi}`), h = hold();
      const confirmation = updateConfirmedCommercialTermsByQuote(h.controlled, confirmer, x.provenance, x.values); await h.ready;
      const generation = createCustomerExportService(pool).generate(admin, x.record.quote.id, {
        expectedVersion: 1, revisionId: x.provenance.revisionId,
        priceVersionIds: multi ? x.record.quote.revisions.at(-1)!.priceVersions.map(p => p.id) : [x.provenance.priceVersionId],
      });
      const rejected = assert.rejects(generation, (e: unknown) => (e as { code: string }).code === "commercial_terms_version_conflict");
      try {
        const deadline = Date.now() + 10000;
        while (!(await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%' ")).rowCount) {
          assert.ok(Date.now() < deadline, "Export must reach actual advisory lock wait"); await new Promise<void>(done => setTimeout(done, 10));
        }
      } finally { h.release(); }
      await confirmation; await rejected;
      assert.equal((await logs(x.record.quote.id)).length, 1); assert.deepEqual(await repo.getById(x.record.quote.id), x.record);
    }
  });
  await t.test("association insertion failure rolls back terms and audit, no residual current", async () => {
    const x = await seed("linked-association-rollback");
    await pool.query(`CREATE FUNCTION reject_synthetic_terms_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic association fault'; END; $$`);
    await pool.query("CREATE TRIGGER reject_synthetic_terms_link BEFORE INSERT ON confirmed_commercial_terms_sales_orders FOR EACH ROW EXECUTE FUNCTION reject_synthetic_terms_link()");
    try { await assert.rejects(() => updateConfirmedCommercialTermsByQuote(pool, confirmer, x.provenance, x.values), /Synthetic association fault/); }
    finally { await pool.query("DROP TRIGGER reject_synthetic_terms_link ON confirmed_commercial_terms_sales_orders"); await pool.query("DROP FUNCTION reject_synthetic_terms_link()"); }
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, x.orders[0].id)).current, null); assert.equal((await logs(x.record.quote.id)).length, 0);
  });
});

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createQuoteServerClient, QuoteServerError } from "../../features/quote-center/server/quote-server-client.js";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteSnapshotFromBrowser, type QuoteRecord, type ServerQuote } from "../quotes/model.js";
import { createQuoteService, createTrustedQuoteService } from "../quotes/service.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

const browserOrigin = "http://127.0.0.1:3001";

async function seedUser(pool: pg.Pool, username: string, permissions: TrustedIdentity["permissions"]) {
  const password = `test-${username}-password`;
  const user = await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO app_users(username,password_hash,display_name,role,active)
     VALUES ($1,crypt($2,gen_salt('bf',4)),$3,'viewer',true)
     RETURNING id::text,public_id::text`,
    [username, password, `Quote ${username}`],
  );
  const roleId = `role-quote-api-${username}`;
  await pool.query("INSERT INTO app_roles(id,name,description) VALUES ($1,$1,'quote api fixture')", [roleId]);
  for (const permission of permissions) {
    await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES ($1,$2)", [roleId, permission]);
  }
  await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES ($1::bigint,$2)", [user.rows[0].id, roleId]);
  return {
    password,
    identity: {
      internalUserId: user.rows[0].id,
      userId: user.rows[0].public_id,
      username,
      userName: `Quote ${username}`,
      permissions,
    } satisfies TrustedIdentity,
  };
}

async function startApi(pool: pg.Pool) {
  const server = createServer(createApp({
    pool,
    allowedOrigins: [browserOrigin],
    security: { secureCookies: false, sessionTtlSeconds: 3600 },
  }));
  await new Promise<void>((resolve_) => server.listen(0, "127.0.0.1", resolve_));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve_, reject) => server.close((error) => error ? reject(error) : resolve_())),
  };
}

async function login(baseUrl: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: browserOrigin, "X-Zhixu-Request": "1" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function apiRequest<T = Record<string, unknown>>(baseUrl: string, path: string, options: {
  cookie?: string;
  method?: string;
  body?: Record<string, unknown>;
  mutationBoundary?: boolean;
} = {}) {
  const headers = new Headers();
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.mutationBoundary) {
    headers.set("Origin", browserOrigin);
    headers.set("X-Zhixu-Request", "1");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { response, payload: await response.json() as T };
}

function serverFixture(id: string, type: "processing" | "distribution" = "distribution"): ServerQuote {
  return quoteSnapshotFromBrowser(createSyntheticQuoteFixture(id, type));
}

test("Q2B2B Quote trusted API uses disposable PostgreSQL", { timeout: 180_000 }, async (t) => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_q2a") });
  const api = await startApi(pool);
  t.after(async () => { await api.close(); await pool.end(); await postgres.stop(); });

  const migration = await runMigrations(pool, resolve("database/migrations"));
  assert.deepEqual(migration.applied, [
    "0001_trusted_auth_rbac_operation_logs.sql",
    "0002_sales_order_foundation.sql",
    "0003_sales_order_number_sequence.sql",
    "0004_confirmed_commercial_terms.sql",
    "0005_quote_foundation.sql",
    "0006_quote_number_sequence.sql",
    "0007_quote_master_settings.sql",
    "0008_quote_attachments.sql",
    "0009_sales_order_delivery_plans.sql",
    "0010_quote_creation_receipts.sql",
  ]);
  await synchronizePermissionCatalog(pool);
  const denied = await seedUser(pool, "denied", []);
  const viewer = await seedUser(pool, "viewer", ["quote.view"]);
  const creator = await seedUser(pool, "creator", ["quote.create"]);
  const editor = await seedUser(pool, "editor", ["quote.edit"]);
  const full = await seedUser(pool, "full", [
    "quote.view", "quote.create", "quote.edit", "quote.confirm", "quote.revision.update",
    "quote.price_version.create", "quote.price_version.delete", "quote.cost.edit", "quote.settings.edit", "estimate.edit", "estimate.view",
  ]);
  const cookies = {
    denied: await login(api.baseUrl, denied.identity.username, denied.password),
    viewer: await login(api.baseUrl, viewer.identity.username, viewer.password),
    creator: await login(api.baseUrl, creator.identity.username, creator.password),
    editor: await login(api.baseUrl, editor.identity.username, editor.password),
    full: await login(api.baseUrl, full.identity.username, full.password),
  };

  await t.test("anonymous reads are 401 and missing quote.view is 403", async () => {
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes")).response.status, 401);
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.denied })).response.status, 403);
  });

  let createdRecord: QuoteRecord | null = null;
  await t.test("runtime create requires quote.create and accepts an empty object only", async () => {
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes", { method: "POST", mutationBoundary: true, body: {} })).response.status, 401);
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.creator, method: "POST", body: {} })).response.status, 403);
    const forbidden = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.viewer, method: "POST", mutationBoundary: true, body: {} });
    assert.equal(forbidden.response.status, 403);
    for (const body of [{ quoteCode: "QT-2099-0101-001" }, { id: "caller-id" }, { actor: { userId: "spoof" } }, { quote: serverFixture("caller-aggregate") }]) {
      assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.creator, method: "POST", mutationBoundary: true, body })).response.status, 400);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_center_quotes")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote'")).rows[0].n, 0);
  });

  await t.test("trusted create generates the neutral Server draft, UUIDs, number and one trusted log", async () => {
    const result = await apiRequest<{ quote: QuoteRecord }>(api.baseUrl, "/api/v1/quotes", {
      cookie: cookies.creator,
      method: "POST",
      mutationBoundary: true,
      body: {},
    });
    assert.equal(result.response.status, 201);
    createdRecord = result.payload.quote;
    const createdQuote = createdRecord.quote;
    assert.match(createdQuote.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.match(createdQuote.quoteCode, /^QT-\d{4}-\d{4}-\d{3,}$/);
    assert.equal(createdRecord.version, 1);
    assert.equal(createdQuote.aggregateStatus, "draft");
    assert.equal(createdQuote.deletedAt, null);
    assert.equal(createdQuote.revisions.length, 1);
    assert.match(createdQuote.revisions[0].revisionId, /^[0-9a-f-]{36}$/i);
    assert.equal(createdQuote.revisions[0].createdBy, creator.identity.userName);
    assert.ok(createdQuote.revisions[0].baseInfo.quoteDate);
    assert.match(createdQuote.revisions[0].baseInfo.quoteDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(createdQuote.revisions[0].baseInfo.brandId, "");
    assert.equal(createdQuote.revisions[0].baseInfo.salespersonId, "");
    assert.equal(createdQuote.revisions[0].priceVersions.length, 1);
    assert.match(createdQuote.revisions[0].priceVersions[0].id, /^[0-9a-f-]{36}$/i);
    assert.equal(createdQuote.revisions[0].priceVersions[0].quantity, null);
    assert.equal(createdQuote.revisions[0].priceVersions[0].confirmation, null);
    assert.deepEqual(createdQuote.revisions[0].imageAttachmentIds, []);
    const log = await pool.query<{ actor_public_id: string; actor_name: string; before_data: unknown; after_data: { quoteCode: string; values: Record<string, unknown> } }>(
      "SELECT actor_public_id::text,actor_name,before_data,after_data FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1",
      [createdQuote.id],
    );
    assert.equal(log.rowCount, 1);
    assert.equal(log.rows[0].actor_public_id, creator.identity.userId);
    assert.equal(log.rows[0].actor_name, creator.identity.userName);
    assert.equal(log.rows[0].before_data, null);
    assert.equal(log.rows[0].after_data.quoteCode, createdQuote.quoteCode);
    assert.equal(log.rows[0].after_data.values.aggregateVersion, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM confirmed_commercial_terms WHERE quote_id=$1", [createdQuote.id])).rows[0].n, 0);
  });

  await t.test("quote.view reads bounded metadata and exact aggregate", async () => {
    assert.ok(createdRecord);
    const createdQuote = createdRecord.quote;
    const list = await apiRequest<{ quotes: Array<{ id: string }>; page: { count: number } }>(api.baseUrl, "/api/v1/quotes?limit=10&offset=0", { cookie: cookies.viewer });
    assert.equal(list.response.status, 200);
    assert.ok(list.payload.quotes.some((quote) => quote.id === createdQuote.id));
    assert.equal(list.payload.page.count, list.payload.quotes.length);
    const detail = await apiRequest<{ quote: QuoteRecord }>(api.baseUrl, `/api/v1/quotes/${createdQuote.id}`, { cookie: cookies.viewer });
    assert.equal(detail.response.status, 200);
    assert.deepEqual(detail.payload.quote.quote, createdQuote);
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes?limit=101", { cookie: cookies.viewer })).response.status, 400);
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes/missing", { cookie: cookies.viewer })).response.status, 404);
  });

  await t.test("aggregate save requires quote.edit and operation-specific permissions", async () => {
    assert.ok(createdRecord);
    const createdQuote = createdRecord.quote;
    const basic = structuredClone(createdQuote);
    basic.revisions[0].baseInfo.note = "base edit";
    assert.equal((await apiRequest(api.baseUrl, `/api/v1/quotes/${basic.id}`, { cookie: cookies.viewer, method: "PUT", mutationBoundary: true, body: { quote: basic, expectedVersion: 1 } })).response.status, 403);
    const cost = structuredClone(createdQuote);
    cost.revisions[0].priceVersions[0].labor.value = "88";
    assert.equal((await apiRequest(api.baseUrl, `/api/v1/quotes/${cost.id}`, { cookie: cookies.editor, method: "PUT", mutationBoundary: true, body: { quote: cost, expectedVersion: 1 } })).response.status, 403);
    const saved = await apiRequest<{ quote: QuoteRecord }>(api.baseUrl, `/api/v1/quotes/${basic.id}`, { cookie: cookies.editor, method: "PUT", mutationBoundary: true, body: { quote: basic, expectedVersion: 1 } });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.quote.version, 2);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [basic.id])).rows[0].n, 2);
    const noOp = await apiRequest<{ quote: QuoteRecord }>(api.baseUrl, `/api/v1/quotes/${basic.id}`, { cookie: cookies.editor, method: "PUT", mutationBoundary: true, body: { quote: basic, expectedVersion: 2 } });
    assert.equal(noOp.response.status, 200);
    assert.equal(noOp.payload.quote.version, 2);
    const logs = await pool.query<{ actor_public_id: string; request_id: string }>(
      "SELECT actor_public_id::text,context->>'requestId' AS request_id FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1 ORDER BY created_at",
      [basic.id],
    );
    assert.equal(logs.rowCount, 2);
    assert.equal(logs.rows[1].actor_public_id, editor.identity.userId);
    assert.ok(logs.rows[1].request_id);
  });

  await t.test("stale version is 409 with zero aggregate or log mutation", async () => {
    assert.ok(createdRecord);
    const createdQuote = createdRecord.quote;
    const beforeLogs = (await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [createdQuote.id])).rows[0].n;
    const stale = structuredClone(createdQuote);
    stale.revisions[0].baseInfo.note = "stale overwrite";
    const response = await apiRequest<{ error: { code: string } }>(api.baseUrl, `/api/v1/quotes/${stale.id}`, { cookie: cookies.editor, method: "PUT", mutationBoundary: true, body: { quote: stale, expectedVersion: 1 } });
    assert.equal(response.response.status, 409);
    assert.equal(response.payload.error.code, "quote_version_conflict");
    assert.equal((await createTrustedQuoteService(pool).getById(stale.id))?.quote.revisions[0].baseInfo.note, "base edit");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [createdQuote.id])).rows[0].n, beforeLogs);
  });

  await t.test("historical Revision and Estimate history mutations are 409 with no log", async () => {
    const quote = serverFixture("immutable-history");
    await createQuoteService(pool).createAggregate(quote);
    const current = (await createTrustedQuoteService(pool).getById(quote.id))!;
    for (const [index, mutate] of [
      (quote: ServerQuote) => { quote.revisions[0].baseInfo.note = "tamper"; },
      (quote: ServerQuote) => { quote.estimateCostHistory[0].labor.value = "999"; },
    ].entries()) {
      const changed = structuredClone(current.quote);
      mutate(changed);
      const response = await apiRequest<{ error: { code: string } }>(api.baseUrl, `/api/v1/quotes/${changed.id}`, { cookie: cookies.full, method: "PUT", mutationBoundary: true, body: { quote: changed, expectedVersion: current.version } });
      assert.equal(response.response.status, 409);
      assert.equal(response.payload.error.code, index === 0 ? "quote_immutable_history" : "estimate_command_required");
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [quote.id])).rows[0].n, 0);
  });

  await t.test("quoteCode replacement is rejected without version or audit mutation", async () => {
    if (!createdRecord) throw new Error("runtime Quote was not created");
    const before = (await createTrustedQuoteService(pool).getById(createdRecord.quote.id))!;
    const beforeLogs = (await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [before.quote.id])).rows[0].n;
    const changed: import("../quotes/quote-response.js").QuoteSaveContent = structuredClone(before.quote);
    delete changed.activeEstimateCost;
    delete changed.estimateCostHistory;
    changed.quoteCode = "QT-2099-0101-999";
    const response = await apiRequest<{ error: { code: string } }>(api.baseUrl, `/api/v1/quotes/${changed.id}`, { cookie: cookies.editor, method: "PUT", mutationBoundary: true, body: { quote: changed, expectedVersion: before.version } });
    assert.equal(response.response.status, 409);
    assert.equal(response.payload.error.code, "quote_code_immutable");
    assert.deepEqual(await createTrustedQuoteService(pool).getById(before.quote.id), before);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [before.quote.id])).rows[0].n, beforeLogs);
  });

  await t.test("audit failure rolls back runtime create while its sequence value remains consumed", async () => {
    const beforeRows = (await pool.query("SELECT count(*)::int AS n FROM quote_center_quotes")).rows[0].n;
    const beforeLogs = (await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote'")).rows[0].n;
    const beforeSequence = BigInt((await pool.query("SELECT last_value::text AS value FROM quote_center_quote_number_seq")).rows[0].value);
    await pool.query(`CREATE FUNCTION q2a_reject_quote_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='Quote' AND NEW.action='创建报价' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER q2a_reject_quote_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q2a_reject_quote_audit();`);
    const response = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.full, method: "POST", mutationBoundary: true, body: {} });
    assert.equal(response.response.status, 500);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_center_quotes")).rows[0].n, beforeRows);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote'")).rows[0].n, beforeLogs);
    const afterSequence = BigInt((await pool.query("SELECT last_value::text AS value FROM quote_center_quote_number_seq")).rows[0].value);
    assert.ok(afterSequence > beforeSequence);
    await pool.query("DROP TRIGGER q2a_reject_quote_audit ON operation_logs; DROP FUNCTION q2a_reject_quote_audit();");

    if (!createdRecord) throw new Error("runtime Quote was not created");
    await pool.query(`CREATE FUNCTION q2a_reject_quote_save_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='Quote' AND NEW.action='保存报价' THEN RAISE EXCEPTION 'synthetic save audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER q2a_reject_quote_save_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q2a_reject_quote_save_audit();`);
    const before = (await createTrustedQuoteService(pool).getById(createdRecord.quote.id))!;
    const changed = structuredClone(before.quote);
    changed.revisions[0].baseInfo.note = "must rollback with audit";
    const failedSave = await apiRequest(api.baseUrl, `/api/v1/quotes/${changed.id}`, { cookie: cookies.full, method: "PUT", mutationBoundary: true, body: { quote: changed, expectedVersion: before.version } });
    assert.equal(failedSave.response.status, 500);
    assert.deepEqual(await createTrustedQuoteService(pool).getById(createdRecord.quote.id), before);
    await pool.query("DROP TRIGGER q2a_reject_quote_save_audit ON operation_logs; DROP FUNCTION q2a_reject_quote_save_audit();");
  });

  await t.test("non-empty create and binary attachment data fail closed", async () => {
    const malformed = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.full, method: "POST", mutationBoundary: true, body: { quote: "bad" } });
    assert.equal(malformed.response.status, 400);
    if (!createdRecord) throw new Error("runtime Quote was not created");
    const before = (await createTrustedQuoteService(pool).getById(createdRecord.quote.id))!;
    const binary = structuredClone(before.quote);
    binary.revisions[0].garmentMedia = [{ id: "binary", fileName: "x.png", fileType: "image/png", url: "data:image/png;base64,AAAA" }];
    const rejected = await apiRequest(api.baseUrl, `/api/v1/quotes/${binary.id}`, { cookie: cookies.full, method: "PUT", mutationBoundary: true, body: { quote: binary, expectedVersion: before.version } });
    assert.equal(rejected.response.status, 400);
    assert.deepEqual(await createTrustedQuoteService(pool).getById(binary.id), before);
  });

  await t.test("Quote aggregate save neither requires nor changes C4.2 current terms", async () => {
    const quote = serverFixture("terms-independent");
    const created = await createQuoteService(pool).createAggregate(quote);
    const provenance = { quoteId: quote.id, revisionId: quote.defaultRevisionId, priceVersionId: quote.revisions[1].priceVersions[0].id };
    const terms = await pool.query<{ id: string }>(
      `INSERT INTO confirmed_commercial_terms(
         ownership_scope,quote_id,revision_id,price_version_id,
         customer_confirmed_price,confirmed_labor_price,labor_currency
       ) VALUES ('quote',$1,$2,$3,123.45,6.78,'CNY') RETURNING id::text`,
      [provenance.quoteId, provenance.revisionId, provenance.priceVersionId],
    );
    const next = structuredClone(created.quote);
    next.revisions[1].baseInfo.note = "does not synchronize terms";
    await createTrustedQuoteService(pool).saveAggregate(full.identity, next, created.version);
    const stored = await pool.query("SELECT customer_confirmed_price::text,confirmed_labor_price::text,labor_currency,version FROM confirmed_commercial_terms WHERE id=$1::uuid", [terms.rows[0].id]);
    assert.deepEqual(stored.rows[0], { customer_confirmed_price: "123.45", confirmed_labor_price: "6.78", labor_currency: "CNY", version: 1 });
  });

  await t.test("Quote API never mutates SalesOrder state", async () => {
    for (const table of ["sales_orders", "sales_order_source_links", "ainuoke_sales_order_contract_mirrors", "ainuoke_sales_order_color_mirrors"]) {
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
    }
    assert.deepEqual((await pool.query("SELECT last_value::text,is_called FROM sales_order_number_seq")).rows[0], { last_value: "1", is_called: false });
  });
});

test("Q2B2B Browser client sends only the Server runtime create contract", async () => {
  const quote = serverFixture("client-fixture");
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ quote: { quote, version: 2 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = createQuoteServerClient({ fetchImpl });
  assert.deepEqual(await client.create(), { quote, version: 2 });
  assert.equal(calls[0].input, "/api/v1/quotes");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.body, "{}");
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(new Headers(calls[0].init?.headers).get("X-Zhixu-Request"), "1");
  assert.deepEqual(await client.save(quote, 1), { quote, version: 2 });
  assert.equal(calls[1].input, `/api/v1/quotes/${quote.id}`);
  const failing = createQuoteServerClient({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: "permission_denied", message: "denied" } }), { status: 403, headers: { "Content-Type": "application/json" } }) });
  await assert.rejects(() => failing.getById("x"), (error: unknown) => error instanceof QuoteServerError && error.status === 403 && error.code === "permission_denied");
});

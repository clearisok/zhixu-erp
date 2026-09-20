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
import { createTrustedQuoteService } from "../quotes/service.js";
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

test("Q2A Quote trusted API uses disposable PostgreSQL", { timeout: 180_000 }, async (t) => {
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
  ]);
  await synchronizePermissionCatalog(pool);
  const denied = await seedUser(pool, "denied", []);
  const viewer = await seedUser(pool, "viewer", ["quote.view"]);
  const creator = await seedUser(pool, "creator", ["quote.create"]);
  const editor = await seedUser(pool, "editor", ["quote.edit"]);
  const full = await seedUser(pool, "full", [
    "quote.view", "quote.create", "quote.edit", "quote.confirm", "quote.revision.update",
    "quote.price_version.create", "quote.price_version.delete", "quote.cost.edit", "quote.settings.edit", "estimate.edit",
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

  const createdQuote = serverFixture("quote-q2a", "distribution");
  await t.test("create requires quote.create and rejects actor spoof fields", async () => {
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.creator, method: "POST", body: { quote: createdQuote } })).response.status, 403);
    const forbidden = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.viewer, method: "POST", mutationBoundary: true, body: { quote: createdQuote } });
    assert.equal(forbidden.response.status, 403);
    const spoof = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.creator, method: "POST", mutationBoundary: true, body: { quote: createdQuote, actor: { userId: "spoof" } } });
    assert.equal(spoof.response.status, 400);
    const nestedSpoof = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.creator, method: "POST", mutationBoundary: true, body: { quote: { ...createdQuote, actor: { userId: "spoof" } } } });
    assert.equal(nestedSpoof.response.status, 400);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote'")).rows[0].n, 0);
  });

  await t.test("trusted create preserves full aggregate, IDs, decimals, null and zero and appends one trusted log", async () => {
    createdQuote.revisions[1].priceVersions[0].fabrics[0].unitPrice = "12345678901234567890.1234567890123456789";
    const result = await apiRequest<{ quote: QuoteRecord }>(api.baseUrl, "/api/v1/quotes", {
      cookie: cookies.creator,
      method: "POST",
      mutationBoundary: true,
      body: { quote: createdQuote },
    });
    assert.equal(result.response.status, 201);
    assert.deepEqual(result.payload.quote, { quote: createdQuote, version: 1 });
    const log = await pool.query<{ actor_public_id: string; actor_name: string; before_data: unknown; after_data: { values: Record<string, unknown> } }>(
      "SELECT actor_public_id::text,actor_name,before_data,after_data FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1",
      [createdQuote.id],
    );
    assert.equal(log.rowCount, 1);
    assert.equal(log.rows[0].actor_public_id, creator.identity.userId);
    assert.equal(log.rows[0].actor_name, creator.identity.userName);
    assert.equal(log.rows[0].before_data, null);
    assert.equal(log.rows[0].after_data.values.aggregateVersion, 1);
  });

  await t.test("quote.view reads bounded metadata and exact aggregate", async () => {
    const list = await apiRequest<{ quotes: Array<{ id: string }>; page: { count: number } }>(api.baseUrl, "/api/v1/quotes?limit=10&offset=0", { cookie: cookies.viewer });
    assert.equal(list.response.status, 200);
    assert.ok(list.payload.quotes.some((quote) => quote.id === createdQuote.id));
    assert.equal(list.payload.page.count, list.payload.quotes.length);
    const detail = await apiRequest<{ quote: QuoteRecord }>(api.baseUrl, `/api/v1/quotes/${createdQuote.id}`, { cookie: cookies.viewer });
    assert.equal(detail.response.status, 200);
    assert.deepEqual(detail.payload.quote.quote, createdQuote);
    assert.equal(detail.payload.quote.quote.revisions[1].priceVersions[0].fabrics[0].segmentLengthCm, null);
    assert.equal(detail.payload.quote.quote.revisions[1].priceVersions[0].fabrics[0].netWidthCm, "0");
    assert.equal(detail.payload.quote.quote.revisions[1].priceVersions[0].fabrics[0].unitPrice, "12345678901234567890.1234567890123456789");
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes?limit=101", { cookie: cookies.viewer })).response.status, 400);
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/quotes/missing", { cookie: cookies.viewer })).response.status, 404);
  });

  await t.test("aggregate save requires quote.edit and operation-specific permissions", async () => {
    const basic = structuredClone(createdQuote);
    basic.revisions[1].baseInfo.note = "base edit";
    assert.equal((await apiRequest(api.baseUrl, `/api/v1/quotes/${basic.id}`, { cookie: cookies.viewer, method: "PUT", mutationBoundary: true, body: { quote: basic, expectedVersion: 1 } })).response.status, 403);
    const cost = structuredClone(createdQuote);
    cost.revisions[1].priceVersions[0].labor.value = "88";
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
    const beforeLogs = (await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [createdQuote.id])).rows[0].n;
    const stale = structuredClone(createdQuote);
    stale.revisions[1].baseInfo.note = "stale overwrite";
    const response = await apiRequest<{ error: { code: string } }>(api.baseUrl, `/api/v1/quotes/${stale.id}`, { cookie: cookies.editor, method: "PUT", mutationBoundary: true, body: { quote: stale, expectedVersion: 1 } });
    assert.equal(response.response.status, 409);
    assert.equal(response.payload.error.code, "quote_version_conflict");
    assert.equal((await createTrustedQuoteService(pool).getById(stale.id))?.quote.revisions[1].baseInfo.note, "base edit");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [createdQuote.id])).rows[0].n, beforeLogs);
  });

  await t.test("historical Revision and Estimate history mutations are 409 with no log", async () => {
    const current = (await createTrustedQuoteService(pool).getById(createdQuote.id))!;
    for (const mutate of [
      (quote: ServerQuote) => { quote.revisions[0].baseInfo.note = "tamper"; },
      (quote: ServerQuote) => { quote.estimateCostHistory[0].labor.value = "999"; },
    ]) {
      const changed = structuredClone(current.quote);
      mutate(changed);
      const response = await apiRequest<{ error: { code: string } }>(api.baseUrl, `/api/v1/quotes/${changed.id}`, { cookie: cookies.full, method: "PUT", mutationBoundary: true, body: { quote: changed, expectedVersion: current.version } });
      assert.equal(response.response.status, 409);
      assert.equal(response.payload.error.code, "quote_immutable_history");
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE entity_type='Quote' AND entity_id=$1", [createdQuote.id])).rows[0].n, 2);
  });

  await t.test("audit failure rolls back the aggregate transaction", async () => {
    await pool.query(`CREATE FUNCTION q2a_reject_quote_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='Quote' AND NEW.entity_id='audit-rollback' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER q2a_reject_quote_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q2a_reject_quote_audit();`);
    const quote = serverFixture("audit-rollback", "processing");
    const response = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.full, method: "POST", mutationBoundary: true, body: { quote } });
    assert.equal(response.response.status, 500);
    assert.equal(await createTrustedQuoteService(pool).getById(quote.id), null);
    await pool.query(`CREATE FUNCTION q2a_reject_quote_save_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='Quote' AND NEW.entity_id='quote-q2a' THEN RAISE EXCEPTION 'synthetic save audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER q2a_reject_quote_save_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q2a_reject_quote_save_audit();`);
    const before = (await createTrustedQuoteService(pool).getById(createdQuote.id))!;
    const changed = structuredClone(before.quote);
    changed.revisions[1].baseInfo.note = "must rollback with audit";
    const failedSave = await apiRequest(api.baseUrl, `/api/v1/quotes/${changed.id}`, { cookie: cookies.full, method: "PUT", mutationBoundary: true, body: { quote: changed, expectedVersion: before.version } });
    assert.equal(failedSave.response.status, 500);
    assert.deepEqual(await createTrustedQuoteService(pool).getById(createdQuote.id), before);
  });

  await t.test("malformed request and binary attachment data fail closed", async () => {
    const malformed = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.full, method: "POST", mutationBoundary: true, body: { quote: "bad" } });
    assert.equal(malformed.response.status, 400);
    const malformedAggregate = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.full, method: "POST", mutationBoundary: true, body: { quote: { id: "missing-structure" } } });
    assert.equal(malformedAggregate.response.status, 400);
    const binary = serverFixture("binary-quote");
    binary.revisions[1].garmentMedia = [{ id: "binary", fileName: "x.png", fileType: "image/png", url: "data:image/png;base64,AAAA" }];
    const rejected = await apiRequest(api.baseUrl, "/api/v1/quotes", { cookie: cookies.full, method: "POST", mutationBoundary: true, body: { quote: binary } });
    assert.equal(rejected.response.status, 400);
    assert.equal(await createTrustedQuoteService(pool).getById(binary.id), null);
  });

  await t.test("Quote aggregate save neither requires nor changes C4.2 current terms", async () => {
    const quote = serverFixture("terms-independent");
    const created = await createTrustedQuoteService(pool).createAggregate(full.identity, quote);
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

test("Q2A Browser client is typed, same-origin and not wired into the Browser repository", async () => {
  const quote = serverFixture("client-fixture");
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ quote: { quote, version: 2 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = createQuoteServerClient({ fetchImpl });
  assert.deepEqual(await client.save(quote, 1), { quote, version: 2 });
  assert.equal(calls[0].input, `/api/v1/quotes/${quote.id}`);
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(new Headers(calls[0].init?.headers).get("X-Zhixu-Request"), "1");
  const failing = createQuoteServerClient({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: "permission_denied", message: "denied" } }), { status: 403, headers: { "Content-Type": "application/json" } }) });
  await assert.rejects(() => failing.getById("x"), (error: unknown) => error instanceof QuoteServerError && error.status === 403 && error.code === "permission_denied");
});

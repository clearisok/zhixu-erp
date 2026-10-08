import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import { createQuoteMasterServerClient } from "../../features/basic-settings/server/quote-master-server-client.js";
import { createServerQuoteMasterDependencies } from "../../features/basic-settings/server/quote-master-dependencies.js";
import { createQuoteServerClient } from "../../features/quote-center/server/quote-server-client.js";
import { createApp } from "../app.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { initializeServer } from "../startup.js";
import { startDisposablePostgres } from "./postgres-container.js";

// Generated credentials, random container/database, tmpfs PGDATA and ephemeral
// loopback ports only. No process DB environment or production resources used.
test("Fresh start: schema, technical-only bootstrap and Server-only empty paths", { timeout: 180_000 }, async (t) => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("fresh_start") });
  const migrations = resolve("database/migrations");
  const origin = "http://fresh-start.invalid";
  const server = createServer(createApp({ pool, allowedOrigins: [origin], security: { secureCookies: false, sessionTtlSeconds: 3600 } }));
  t.after(async () => {
    try {
      if (server.listening) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    } finally {
      try { await pool.end(); } finally { await postgres.stop(); }
    }
  });
  const counts = async () => {
    const tables = await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    const result: Record<string, number> = {};
    for (const { tablename } of tables.rows) {
      assert.match(tablename, /^[a-z_]+$/u);
      result[tablename] = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${tablename}"`)).rows[0].n;
    }
    return result;
  };
  const admin = { username: "fresh-test-admin", displayName: "Synthetic new administrator", password: "synthetic-fresh-password-only" };
  const initialize = (listen: () => Promise<void>) => initializeServer({
    verifyMigrations: () => verifyMigrationsCurrent(pool, migrations),
    synchronizePermissions: () => synchronizePermissionCatalog(pool),
    bootstrapAdmin: () => bootstrapAdmin(pool, admin),
    listen,
  });

  await t.test("formal migrations 0001–0008 apply; no legacy or business seeds", async () => {
    const applied = await runMigrations(pool, migrations);
    assert.equal(applied.applied.length, 8);
    assert.equal(applied.applied.at(-1), "0008_quote_attachments.sql");
    const actual = await counts();
    assert.equal(actual.schema_migrations, 8);
    for (const [table, n] of Object.entries(actual)) if (table !== "schema_migrations") assert.equal(n, 0, table);
    for (const legacy of ["customers", "quotes", "orders", "schedules", "audit_logs"]) assert.equal(actual[legacy], undefined);
    assert.equal(await bootstrapAdmin(pool, { username: "not-created", displayName: "Not created" }), false);
  });

  await t.test("startup and repeated startup only produce the explicit technical whitelist", async () => {
    await initialize(() => new Promise<void>((done) => server.listen(0, "127.0.0.1", done)));
    const whitelist = { schema_migrations: 8, app_permissions: PERMISSION_KEYS.length, app_roles: 1, app_users: 1, app_user_roles: 1, app_role_permissions: PERMISSION_KEYS.length };
    const first = await counts();
    for (const [table, n] of Object.entries(first)) assert.equal(n, whitelist[table as keyof typeof whitelist] ?? 0, table);
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    await initialize(() => new Promise<void>((done) => server.listen(0, "127.0.0.1", done)));
    assert.deepEqual(await counts(), first);
    const rerun = await runMigrations(pool, migrations);
    assert.deepEqual(rerun.applied, []);
    assert.equal(rerun.skipped.length, 8);
    for (const sequence of ["sales_order_number_seq", "quote_center_quote_number_seq"]) {
      assert.deepEqual((await pool.query(`SELECT last_value::int,is_called FROM ${sequence}`)).rows[0], { last_value: 1, is_called: false });
    }
    t.diagnostic(`Technical whitelist: ${JSON.stringify(whitelist)}; all other public tables = 0`);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  assert.ok(![3000, 3001, 3002].includes(address.port));
  const baseUrl = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${baseUrl}/api/v1/quotes`)).status, 401);
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-Zhixu-Request": "1" }, body: JSON.stringify({ username: admin.username, password: admin.password }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const authenticatedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Cookie", cookie);
    headers.set("Origin", origin);
    return fetch(input, { ...init, headers });
  };
  const quotes = createQuoteServerClient({ baseUrl, fetchImpl: authenticatedFetch });
  const masters = createQuoteMasterServerClient({ baseUrl, fetchImpl: authenticatedFetch });

  await t.test("empty API lists/defaults and missing detail are explicit", async () => {
    assert.deepEqual((await quotes.list()).quotes, []);
    for (const list of [masters.listBrands, masters.listSalespeople, masters.listFabrics, masters.listTrims, masters.listPresets, masters.supplierSuggestions]) assert.deepEqual(await list(), []);
    assert.equal(await masters.getSettings(), null);
    const defaults = await masters.resolveDefaults();
    for (const key of ["usdCnyRate", "markupRate", "laborCurrency", "laborDescription", "otherCost", "manufacturingPreset"] as const) assert.equal(defaults[key], null);
    assert.deepEqual(defaults.trims, []);
    const sales = await authenticatedFetch(`${baseUrl}/api/v1/sales-orders`);
    assert.equal(sales.status, 200);
    assert.equal((await sales.json()).page.total, 0);
    await assert.rejects(quotes.getById("00000000-0000-4000-8000-000000000000"), { status: 404 });
  });

  await t.test("Server adapters ignore synthetic old Browser data and fail closed on outage", async () => {
    const oldBrowser = JSON.stringify({ quotes: [{ id: "old-quote" }], brands: [{ id: "old-brand" }], defaultUsdCnyRate: 7.12 });
    let storageReads = 0;
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: () => { storageReads++; return oldBrowser; }, setItem: () => { throw new Error("Browser write forbidden"); } }, indexedDB: { open: () => { throw new Error("IndexedDB access forbidden"); } } } });
    try {
      const dependencies = createServerQuoteMasterDependencies(PERMISSION_KEYS, masters);
      const loaded = await dependencies.load();
      assert.deepEqual(loaded.state.brands, []);
      assert.deepEqual(loaded.state.fabricLibrary, []);
      assert.deepEqual(loaded.settings.manufacturingPresets, []);
      assert.equal(loaded.settings.defaultUsdCnyRate, null);
      assert.equal(loaded.settings.defaultMarkupRate, null);
      assert.equal(loaded.settings.defaultOtherCost, null);
      assert.equal(loaded.settings.defaultManufacturingPresetId, null);
      assert.deepEqual((await quotes.list()).quotes, []);
      const failedFetch: typeof fetch = async () => { throw new Error("Synthetic unavailable Server"); };
      await assert.rejects(createQuoteServerClient({ fetchImpl: failedFetch }).list());
      await assert.rejects(createServerQuoteMasterDependencies(PERMISSION_KEYS, createQuoteMasterServerClient({ fetchImpl: failedFetch })).load());
      assert.equal(storageReads, 0);
      assert.equal(oldBrowser, JSON.stringify({ quotes: [{ id: "old-quote" }], brands: [{ id: "old-brand" }], defaultUsdCnyRate: 7.12 }));
      assert.equal((await counts()).quote_center_quotes, 0);
      assert.equal((await counts()).quote_master_brands, 0);
    } finally {
      if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  await t.test("explicit new Quote create/save/read still works without masters or policy defaults", async () => {
    const created = await quotes.create();
    const revision = created.quote.revisions[0];
    const parameters = revision.priceVersions[0].pricingParameters;
    assert.equal(revision.baseInfo.brandId, "");
    assert.equal(revision.baseInfo.salespersonId, "");
    assert.equal(parameters.usdCnyRate, null);
    assert.equal(parameters.markupRate, null);
    assert.equal(parameters.manufacturingPresetId, null);
    assert.deepEqual(revision.imageAttachmentIds, []);
    revision.baseInfo.note = "Explicit synthetic user edit";
    const saved = await quotes.save(created.quote, created.version);
    assert.equal(saved.version, 2);
    assert.deepEqual(await quotes.getById(saved.quote.id), saved);
    assert.equal((await counts()).quote_master_brands, 0);
    assert.equal((await counts()).quote_global_settings, 0);
    assert.equal((await counts()).sales_orders, 0);
    assert.equal((await counts()).quote_attachments, 0);
  });

  await t.test("explicit new master save/read is not an initialization seed", async () => {
    const brand = await masters.createBrand({ name: "Synthetic new brand", status: "active", defaults: { defaultUsdCnyRate: null, defaultOtherCost: null, defaultTrims: [] } });
    assert.deepEqual(await masters.listBrands(), [brand]);
    assert.equal((await counts()).quote_master_brands, 1);
    assert.equal(await masters.getSettings(), null);
  });
});

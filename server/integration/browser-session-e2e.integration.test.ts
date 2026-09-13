import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import {
  createServerAuthClient,
  ServerAuthError,
} from "../../features/server-auth/server-auth-client.js";
import {
  createSalesOrderServerClient,
  SalesOrderServerReadError,
} from "../../features/order-center/server/sales-order-server-client.js";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { createAinuokeSalesOrder, type CreateAinuokeSalesOrderInput } from "../sales-orders/service.js";
import { startDisposablePostgres } from "./postgres-container.js";

const { Pool } = pg;
const browserOrigin = "http://127.0.0.1:3001";

async function startApi(pool: pg.Pool) {
  const server = createServer(createApp({
    pool,
    allowedOrigins: [browserOrigin],
    security: { secureCookies: false, sessionTtlSeconds: 43_200 },
  }));
  await new Promise<void>((resolve_) => server.listen(0, "127.0.0.1", resolve_));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve_, reject) => server.close((error) => error ? reject(error) : resolve_()));
    },
  };
}

async function seedUser(
  pool: pg.Pool,
  input: { username: string; password: string; permissions: string[] },
): Promise<TrustedIdentity> {
  const user = await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO app_users(username, password_hash, display_name, role, active)
     VALUES ($1, crypt($2, gen_salt('bf', 12)), $3, 'viewer', true)
     RETURNING id::text, public_id::text`,
    [input.username, input.password, `Browser ${input.username}`],
  );
  const roleId = `role-browser-${input.username}`;
  await pool.query(
    "INSERT INTO app_roles(id, name, description) VALUES ($1, $2, 'disposable browser acceptance fixture')",
    [roleId, `Browser role ${input.username}`],
  );
  for (const permission of input.permissions) {
    await pool.query(
      "INSERT INTO app_role_permissions(role_id, permission_key) VALUES ($1, $2)",
      [roleId, permission],
    );
  }
  await pool.query("INSERT INTO app_user_roles(user_id, role_id) VALUES ($1::bigint, $2)", [user.rows[0].id, roleId]);
  return {
    internalUserId: user.rows[0].id,
    userId: user.rows[0].public_id,
    username: input.username,
    userName: `Browser ${input.username}`,
    permissions: input.permissions as TrustedIdentity["permissions"],
  };
}

function salesOrderFixture(): CreateAinuokeSalesOrderInput {
  return {
    source: {
      sourceId: "browser-session-source-001",
      sourceRowIdentity: "6086103:browser-session-source-001",
      salesContractNo: "SC-BROWSER-001",
      insideOrderNo: "INSIDE-BROWSER-001",
      lifecycleStatusRaw: "active",
      contractDate: "2026-09-01",
      contractDeliveryDate: "2026-10-01",
      styleNo: "STYLE-BROWSER-001",
      companyNameSnapshot: "COMPANY-BROWSER",
      customerNameSnapshot: "CUSTOMER-BROWSER",
      brandNameSnapshot: "BRAND-BROWSER",
      quantity: 12,
      sourceHash: "browser-contract-hash",
      fetchedAt: "2026-09-13T00:00:00.000Z",
      sourceMetadata: { reportId: "6086103", fixture: true },
    },
    colors: [{
      sourceLineIdentity: "6087105:browser-blue",
      colorName: "BLUE",
      quantity: 12,
      deliveryDate: "2026-10-01",
      sourceHash: "browser-color-hash",
    }],
  };
}

function createBrowserFetch(): typeof fetch {
  let cookie = "";
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("Cookie", cookie);
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") headers.set("Origin", browserOrigin);
    const response = await fetch(input, { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      cookie = /Max-Age=0/i.test(setCookie) ? "" : setCookie.split(";", 1)[0];
    }
    return response;
  };
}

test("Browser trusted session UX reaches the real Node auth and SalesOrder contracts in disposable PostgreSQL", async (t) => {
  const postgres = await startDisposablePostgres();
  const resources: {
    pool?: pg.Pool;
    api?: Awaited<ReturnType<typeof startApi>>;
  } = {};
  t.after(async () => {
    await resources.api?.close();
    await resources.pool?.end();
    await postgres.stop();
  });
  const databaseUrl = await postgres.createDatabase("browser_session_e2e");
  const pool = new Pool({ connectionString: databaseUrl });
  resources.pool = pool;

  await runMigrations(pool, resolve("database/migrations"));
  await synchronizePermissionCatalog(pool);
  const reader = await seedUser(pool, {
    username: "browser-reader",
    password: "disposable-reader-password",
    permissions: ["order.view"],
  });
  await seedUser(pool, {
    username: "browser-denied",
    password: "disposable-denied-password",
    permissions: ["quote.view"],
  });
  const created = await createAinuokeSalesOrder(pool, reader, salesOrderFixture());
  const api = await startApi(pool);
  resources.api = api;

  const readerFetch = createBrowserFetch();
  const readerAuth = createServerAuthClient({ baseUrl: api.baseUrl, fetchImpl: readerFetch });
  const readerOrders = createSalesOrderServerClient({ baseUrl: api.baseUrl, fetchImpl: readerFetch });

  await assert.rejects(
    () => readerAuth.getMe(),
    (error: unknown) => error instanceof ServerAuthError && error.status === 401,
  );
  const login = await readerAuth.login("browser-reader", "disposable-reader-password");
  assert.equal(login.user.id, reader.userId);
  assert.deepEqual(login.permissions, ["order.view"]);
  assert.deepEqual(await readerAuth.getMe(), login.user);
  assert.deepEqual(await readerAuth.getPermissions(), ["order.view"]);

  const page = await readerOrders.list({ limit: 10, offset: 0 });
  assert.equal(page.page.total, 1);
  assert.equal(page.salesOrders[0].id, created.salesOrder.id);
  const detail = await readerOrders.getById(created.salesOrder.id);
  assert.equal(detail.id, created.salesOrder.id);
  assert.equal(detail.version, created.salesOrder.version);
  assert.deepEqual(detail.colors.map((color) => color.colorName), ["BLUE"]);

  await readerAuth.logout();
  await assert.rejects(
    () => readerAuth.getMe(),
    (error: unknown) => error instanceof ServerAuthError && error.status === 401,
  );
  await assert.rejects(
    () => readerOrders.list(),
    (error: unknown) => error instanceof SalesOrderServerReadError && error.status === 401,
  );

  const deniedFetch = createBrowserFetch();
  const deniedAuth = createServerAuthClient({ baseUrl: api.baseUrl, fetchImpl: deniedFetch });
  const deniedOrders = createSalesOrderServerClient({ baseUrl: api.baseUrl, fetchImpl: deniedFetch });
  const deniedLogin = await deniedAuth.login("browser-denied", "disposable-denied-password");
  assert.deepEqual(deniedLogin.permissions, ["quote.view"]);
  await assert.rejects(
    () => deniedOrders.list(),
    (error: unknown) => error instanceof SalesOrderServerReadError && error.status === 403,
  );
});

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

async function startApi(pool: pg.Pool, staticDirectory?: string) {
  const server = createServer(createApp({
    pool,
    allowedOrigins: [browserOrigin],
    security: { secureCookies: false, sessionTtlSeconds: 43_200 },
    staticDirectory,
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

function salesOrderFixture(index = 1, withColors = true): CreateAinuokeSalesOrderInput {
  const suffix = String(index).padStart(3, "0");
  return {
    source: {
      sourceId: `browser-session-source-${suffix}`,
      sourceRowIdentity: `6086103:browser-session-source-${suffix}`,
      salesContractNo: `SC-BROWSER-${suffix}`,
      insideOrderNo: `INSIDE-BROWSER-${suffix}`,
      lifecycleStatusRaw: "active",
      contractDate: "2026-09-01",
      contractDeliveryDate: "2026-10-01",
      styleNo: index <= 3 ? "STYLE-COMMON" : `STYLE-BROWSER-${suffix}`,
      companyNameSnapshot: "COMPANY-BROWSER",
      customerNameSnapshot: "CUSTOMER-BROWSER",
      brandNameSnapshot: "BRAND-BROWSER",
      quantity: 10 + index,
      sourceHash: `browser-contract-hash-${suffix}`,
      fetchedAt: "2026-09-13T00:00:00.000Z",
      sourceMetadata: { reportId: "6086103", fixture: true },
    },
    colors: withColors ? [{
      sourceLineIdentity: `6087105:browser-blue-${suffix}`,
      colorName: "BLUE",
      quantity: 10 + index,
      deliveryDate: "2026-10-01",
      sourceHash: `browser-color-hash-${suffix}`,
    }] : [],
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

test("production Order Center route reaches trusted auth and paged SalesOrder reads in disposable PostgreSQL", async (t) => {
  const postgres = await startDisposablePostgres();
  const resources: {
    pool?: pg.Pool;
    api?: Awaited<ReturnType<typeof startApi>>;
    staticDirectory?: string;
  } = {};
  t.after(async () => {
    await resources.api?.close();
    await resources.pool?.end();
    await postgres.stop();
    if (resources.staticDirectory) await rm(resources.staticDirectory, { recursive: true, force: true });
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
  const created: Awaited<ReturnType<typeof createAinuokeSalesOrder>>[] = [];
  for (let index = 1; index <= 55; index += 1) {
    created.push(await createAinuokeSalesOrder(pool, reader, salesOrderFixture(index, index !== 55)));
  }
  const staticDirectory = await mkdtemp(join(tmpdir(), "zhixu-production-order-center-"));
  resources.staticDirectory = staticDirectory;
  await writeFile(join(staticDirectory, "order-center.html"), "<!doctype html><title>订单中心</title><main>ServerOrderCenterPage</main>", "utf8");
  const api = await startApi(pool, staticDirectory);
  resources.api = api;

  const productionRoute = await fetch(`${api.baseUrl}/order-center`);
  assert.equal(productionRoute.status, 200);
  assert.match(await productionRoute.text(), /ServerOrderCenterPage/u);

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

  const page = await readerOrders.list({ limit: 50, offset: 0, sortBy: "orderNo", sortDirection: "asc" });
  assert.deepEqual(page.page, { limit: 50, offset: 0, total: 55, hasMore: true });
  assert.equal(page.salesOrders.length, 50);
  assert.equal(page.salesOrders[0].id, created[0].salesOrder.id);
  assert.equal(page.salesOrders[0].orderNo, "SO-00000001");
  const nextPage = await readerOrders.list({ limit: 50, offset: 50, sortBy: "orderNo", sortDirection: "asc" });
  assert.deepEqual(nextPage.page, { limit: 50, offset: 50, total: 55, hasMore: false });
  assert.equal(nextPage.salesOrders.length, 5);

  const commonStyle = await readerOrders.list({ search: "STYLE-COMMON", limit: 50, offset: 0 });
  assert.equal(commonStyle.page.total, 3);
  assert.equal(commonStyle.salesOrders.every((order) => order.styleNo === "STYLE-COMMON"), true);
  const draft = await readerOrders.list({ lifecycleState: "draft", limit: 50, offset: 0 });
  assert.equal(draft.page.total, 55);
  const ainuoke = await readerOrders.list({ creationSource: "ainuoke", limit: 50, offset: 0 });
  assert.equal(ainuoke.page.total, 55);
  const descending = await readerOrders.list({ limit: 50, offset: 0, sortBy: "orderNo", sortDirection: "desc" });
  assert.equal(descending.salesOrders[0].orderNo, "SO-00000055");

  const detail = await readerOrders.getById(created[0].salesOrder.id);
  assert.equal(detail.id, created[0].salesOrder.id);
  assert.equal(detail.version, created[0].salesOrder.version);
  assert.deepEqual(detail.colors.map((color) => color.colorName), ["BLUE"]);
  const zeroColorDetail = await readerOrders.getById(created[54].salesOrder.id);
  assert.equal(zeroColorDetail.orderNo, "SO-00000055");
  assert.equal(zeroColorDetail.colorCount, 0);
  assert.deepEqual(zeroColorDetail.colors, []);

  const restoredAuth = createServerAuthClient({ baseUrl: api.baseUrl, fetchImpl: readerFetch });
  assert.equal((await restoredAuth.getMe()).id, reader.userId);
  assert.deepEqual(await restoredAuth.getPermissions(), ["order.view"]);

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

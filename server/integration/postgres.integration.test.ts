import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { loadServerConfig } from "../config.js";
import { runMigrations } from "../db/migration-runner.js";
import { appendOperationLog, createServerOperationId } from "../operation-logs/repository.js";
import {
  createOrUpdateSourceLink,
  createSalesOrder,
  getSalesOrderById,
  getSalesOrderBySalesContractNo,
  getSalesOrderBySourceIdentity,
  listSalesOrders,
  replaceCurrentAinuokeColorSlice,
  updateSalesOrderLifecycle,
  upsertCurrentAinuokeContractMirror,
} from "../sales-orders/repository.js";
import { startDisposablePostgres } from "./postgres-container.js";

const { Pool } = pg;

async function migrationDirectory(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-migrations-"));
  await Promise.all(Object.entries(files).map(([filename, contents]) =>
    writeFile(join(directory, filename), contents, "utf8")
  ));
  return directory;
}

async function startApi(pool: pg.Pool, events: Record<string, unknown>[] = []) {
  const server = createServer(createApp({
    pool,
    logger: { error: (event) => events.push(event) },
    allowedOrigins: ["http://127.0.0.1:3001"],
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

async function loginRequest(baseUrl: string, username: string, password: string, spoof: Record<string, unknown> = {}) {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3001",
      "X-Zhixu-Request": "1",
    },
    body: JSON.stringify({ username, password, ...spoof }),
  });
}

async function seedUser(
  pool: pg.Pool,
  input: { username: string; password: string; active?: boolean; permissions: string[] },
): Promise<TrustedIdentity> {
  const user = await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO app_users(username, password_hash, display_name, role, active)
     VALUES ($1, crypt($2, gen_salt('bf', 12)), $3, 'viewer', $4)
     RETURNING id::text, public_id::text`,
    [input.username, input.password, `Test ${input.username}`, input.active ?? true],
  );
  const roleId = `role-test-${input.username}`;
  await pool.query(
    "INSERT INTO app_roles(id, name, description) VALUES ($1, $2, 'integration fixture')",
    [roleId, `Test role ${input.username}`],
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
    userName: `Test ${input.username}`,
    permissions: input.permissions as TrustedIdentity["permissions"],
  };
}

test("PostgreSQL server foundation uses only a disposable PG16 container", async (t) => {
  const postgres = await startDisposablePostgres();
  t.after(async () => postgres.stop());

  await t.test("empty migration and rerun are ordered and idempotent", async () => {
    const databaseUrl = await postgres.createDatabase("empty_rerun");
    const directory = await migrationDirectory({
      "0002_second.sql": "INSERT INTO ordered_values(value) VALUES (2);",
      "0001_first.sql": "CREATE TABLE ordered_values(value INTEGER NOT NULL); INSERT INTO ordered_values(value) VALUES (1);",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const first = await runMigrations(pool, directory);
      assert.deepEqual(first.applied, ["0001_first.sql", "0002_second.sql"]);
      const second = await runMigrations(pool, directory);
      assert.deepEqual(second.applied, []);
      assert.deepEqual(second.skipped, ["0001_first.sql", "0002_second.sql"]);
      const values = await pool.query<{ value: number }>("SELECT value FROM ordered_values ORDER BY value");
      assert.deepEqual(values.rows.map((row) => row.value), [1, 2]);
      const ledger = await pool.query("SELECT version, filename, checksum, applied_at, duration_ms FROM schema_migrations ORDER BY version");
      assert.equal(ledger.rowCount, 2);
      assert.match(ledger.rows[0].checksum, /^[a-f0-9]{64}$/);
      assert.ok(ledger.rows[0].applied_at instanceof Date);
      assert.ok(ledger.rows[0].duration_ms >= 0);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("checksum drift fails closed", async () => {
    const databaseUrl = await postgres.createDatabase("checksum");
    const directory = await migrationDirectory({ "0001_value.sql": "CREATE TABLE value_one(id INTEGER);" });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await runMigrations(pool, directory);
      await writeFile(join(directory, "0001_value.sql"), "CREATE TABLE changed_value(id INTEGER);", "utf8");
      await assert.rejects(() => runMigrations(pool, directory), /checksum mismatch/i);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("a failed migration rolls back only its transaction", async () => {
    const databaseUrl = await postgres.createDatabase("rollback");
    const directory = await migrationDirectory({
      "0001_good.sql": "CREATE TABLE durable_value(id INTEGER);",
      "0002_bad.sql": "CREATE TABLE rolled_back_value(id INTEGER); SELECT definitely_invalid();",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await assert.rejects(() => runMigrations(pool, directory), /0002_bad\.sql/);
      const durable = await pool.query("SELECT to_regclass('public.durable_value') AS name, to_regclass('public.rolled_back_value') AS rolled_back");
      assert.equal(durable.rows[0].name, "durable_value");
      assert.equal(durable.rows[0].rolled_back, null);
      const ledger = await pool.query("SELECT filename FROM schema_migrations ORDER BY version");
      assert.deepEqual(ledger.rows.map((row) => row.filename), ["0001_good.sql"]);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("concurrent runners serialize and never double-apply", async () => {
    const databaseUrl = await postgres.createDatabase("concurrency");
    const directory = await migrationDirectory({
      "0001_once.sql": "CREATE TABLE apply_once(id INTEGER PRIMARY KEY); SELECT pg_sleep(0.25); INSERT INTO apply_once VALUES (1);",
    });
    const firstPool = new Pool({ connectionString: databaseUrl });
    const secondPool = new Pool({ connectionString: databaseUrl });
    try {
      await Promise.all([
        runMigrations(firstPool, directory),
        runMigrations(secondPool, directory),
      ]);
      const rows = await firstPool.query("SELECT count(*)::int AS count FROM apply_once");
      const ledger = await firstPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE version = 1");
      assert.equal(rows.rows[0].count, 1);
      assert.equal(ledger.rows[0].count, 1);
    } finally {
      await Promise.all([firstPool.end(), secondPool.end()]);
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("formal migration upgrades the single existing user identity without touching legacy business data", async () => {
    const databaseUrl = await postgres.createDatabase("existing_identity");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await pool.query(await readFile(resolve("database/001_schema.sql"), "utf8"));
      await pool.query(`INSERT INTO app_users(username, password_hash, display_name, role)
        VALUES ('legacy-user', crypt('test-only-password', gen_salt('bf', 12)), 'Legacy User', 'viewer')`);
      const columnsBefore = await pool.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'quotes' ORDER BY ordinal_position",
      );
      const directory = resolve("database/migrations");
      const first = await runMigrations(pool, directory);
      assert.deepEqual(first.applied, [
        "0001_trusted_auth_rbac_operation_logs.sql",
        "0002_sales_order_foundation.sql",
      ]);
      const identity = await pool.query<{ public_id: string }>("SELECT public_id::text FROM app_users WHERE username = 'legacy-user'");
      assert.match(identity.rows[0].public_id, /^[0-9a-f-]{36}$/);
      const columns = await pool.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'quotes' ORDER BY ordinal_position",
      );
      assert.deepEqual(columns.rows, columnsBefore.rows);
      assert.equal((await pool.query("SELECT to_regprocedure('api_dispatch(text,text,jsonb,text)') AS function")).rows[0].function, "api_dispatch(text,text,jsonb,text)");
      await runMigrations(pool, directory);
      const stable = await pool.query<{ public_id: string }>("SELECT public_id::text FROM app_users WHERE username = 'legacy-user'");
      assert.equal(stable.rows[0].public_id, identity.rows[0].public_id);
      await assert.rejects(
        () => pool.query("UPDATE app_users SET public_id = gen_random_uuid() WHERE username = 'legacy-user'"),
        /immutable/i,
      );
    } finally {
      await pool.end();
    }
  });

  await t.test("SalesOrder migration and repository enforce stable identity, source ownership, and current mirrors", async () => {
    const databaseUrl = await postgres.createDatabase("sales_order_repository");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const migration = await runMigrations(pool, resolve("database/migrations"));
      assert.deepEqual(migration.applied, [
        "0001_trusted_auth_rbac_operation_logs.sql",
        "0002_sales_order_foundation.sql",
      ]);
      const tables = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN (
           'sales_orders',
           'sales_order_source_links',
           'ainuoke_sales_order_contract_mirrors',
           'ainuoke_sales_order_color_mirrors'
         ) ORDER BY table_name`,
      );
      assert.deepEqual(tables.rows.map((row) => row.table_name), [
        "ainuoke_sales_order_color_mirrors",
        "ainuoke_sales_order_contract_mirrors",
        "sales_order_source_links",
        "sales_orders",
      ]);

      const second = await createSalesOrder(pool, {
        orderNo: "  so-002  ",
        creationSource: "ainuoke",
      });
      const first = await createSalesOrder(pool, {
        orderNo: "SO-001",
        creationSource: "manual",
      });
      assert.match(second.id, /^[0-9a-f-]{36}$/);
      assert.equal(second.orderNo, "SO-002");
      assert.equal(second.version, 1);
      assert.deepEqual((await listSalesOrders(pool)).map((order) => order.orderNo), ["SO-001", "SO-002"]);
      await assert.rejects(
        () => createSalesOrder(pool, { orderNo: "so-002", creationSource: "manual" }),
        (error: unknown) => (error as { code?: string }).code === "23505",
      );
      await assert.rejects(
        () => pool.query("INSERT INTO sales_orders(order_no, creation_source) VALUES ('lowercase', 'manual')"),
        (error: unknown) => (error as { code?: string }).code === "23514",
      );

      await createOrUpdateSourceLink(pool, {
        salesOrderId: second.id,
        sourceSystem: "ainuoke",
        sourceEntityType: "sales_contract",
        externalId: "source-6086103-1",
        salesContractNo: "sc-api-001",
        insideOrderNo: "D1935",
      });
      await assert.rejects(
        () => createOrUpdateSourceLink(pool, {
          salesOrderId: first.id,
          sourceSystem: "ainuoke",
          sourceEntityType: "sales_contract",
          externalId: "source-6086103-1",
          salesContractNo: "SC-API-001",
          insideOrderNo: "D1935",
        }),
        /already bound/i,
      );
      await assert.rejects(
        () => createOrUpdateSourceLink(pool, {
          salesOrderId: "00000000-0000-0000-0000-000000000000",
          sourceSystem: "ainuoke",
          sourceEntityType: "sales_contract",
          externalId: "broken-owner",
        }),
        (error: unknown) => (error as { code?: string }).code === "23503",
      );
      await assert.rejects(
        () => pool.query(
          "UPDATE sales_order_source_links SET sales_order_id = $1::uuid WHERE external_id = 'source-6086103-1'",
          [first.id],
        ),
        /binding is immutable/i,
      );

      const mirror = {
        sourceId: "source-6086103-1",
        sourceRowIdentity: "6086103:sha256:contract-redacted",
        salesContractNo: "SC-API-001",
        insideOrderNo: "D1935",
        lifecycleStatusRaw: "生效",
        contractDate: "2026-08-01",
        contractDeliveryDate: "2026-10-01",
        styleNo: "STYLE-100",
        companyNameSnapshot: "COMPANY-A",
        customerNameSnapshot: "CUSTOMER-A",
        brandNameSnapshot: "BRAND-A",
        quantity: 100,
        sourceHash: "contract-hash-v1",
        fetchedAt: "2026-09-11T01:00:00.000Z",
        sourceMetadata: { reportId: "6086103" },
      };
      await upsertCurrentAinuokeContractMirror(pool, second.id, mirror);
      await replaceCurrentAinuokeColorSlice(pool, second.id, [
        { sourceLineIdentity: "color-red", colorName: "RED", quantity: 40, deliveryDate: null, sourceHash: "red-v1" },
        { sourceLineIdentity: "color-blue", colorName: "BLUE", quantity: 60, deliveryDate: "2026-10-01", sourceHash: "blue-v1" },
      ]);
      const bySource = await getSalesOrderBySourceIdentity(pool, "ainuoke", "sales_contract", "source-6086103-1");
      const byContract = await getSalesOrderBySalesContractNo(pool, "sc-api-001");
      assert.equal(bySource?.id, second.id);
      assert.equal(byContract?.id, second.id);
      assert.equal(byContract?.quantity, 100);

      await upsertCurrentAinuokeContractMirror(pool, second.id, {
        ...mirror,
        lifecycleStatusRaw: "草拟",
        quantity: 120,
        sourceHash: "contract-hash-v2",
        fetchedAt: "2026-09-11T02:00:00.000Z",
      });
      await replaceCurrentAinuokeColorSlice(pool, second.id, [
        { sourceLineIdentity: "color-green", colorName: "GREEN", quantity: 120, deliveryDate: null, sourceHash: "green-v2" },
      ]);
      const refreshed = await getSalesOrderById(pool, second.id);
      assert.equal(refreshed?.id, second.id);
      assert.equal(refreshed?.version, 1);
      assert.equal(refreshed?.quantity, 120);
      assert.equal(refreshed?.sourceLifecycleStatus, "草拟");
      assert.deepEqual(refreshed?.colors.map((color) => color.colorName), ["GREEN"]);

      const updated = await updateSalesOrderLifecycle(pool, {
        id: second.id,
        expectedVersion: 1,
        lifecycleState: "active",
      });
      assert.equal(updated?.id, second.id);
      assert.equal(updated?.version, 2);
      assert.equal(updated?.lifecycleState, "active");
      assert.equal((await updateSalesOrderLifecycle(pool, {
        id: second.id,
        expectedVersion: 1,
        lifecycleState: "completed",
      })), null);
      await assert.rejects(
        () => pool.query("UPDATE sales_orders SET lifecycle_state = 'completed' WHERE id = $1::uuid", [second.id]),
        /version must increment/i,
      );
      assert.equal((await getSalesOrderById(pool, second.id))?.id, second.id);
    } finally {
      await pool.end();
    }
  });

  await t.test("trusted auth, RBAC, session revocation, throttling, and OperationLog are enforced by PostgreSQL", async () => {
    const databaseUrl = await postgres.createDatabase("auth_rbac_logs");
    const pool = new Pool({ connectionString: databaseUrl });
    const events: Record<string, unknown>[] = [];
    try {
      await runMigrations(pool, resolve("database/migrations"));
      await synchronizePermissionCatalog(pool);
      const admin = await seedUser(pool, {
        username: "server-admin",
        password: "test-admin-password",
        permissions: ["audit_log.view", "user_permissions.manage"],
      });
      const limited = await seedUser(pool, {
        username: "limited-user",
        password: "test-limited-password",
        permissions: ["quote.view"],
      });
      await seedUser(pool, {
        username: "inactive-user",
        password: "test-inactive-password",
        active: false,
        permissions: ["audit_log.view"],
      });

      const api = await startApi(pool, events);
      try {
        const missingBoundary = await fetch(`${api.baseUrl}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "limited-user", password: "test-limited-password" }),
        });
        assert.equal(missingBoundary.status, 403);

        assert.equal((await loginRequest(api.baseUrl, "limited-user", "wrong-password")).status, 401);
        assert.equal((await loginRequest(api.baseUrl, "inactive-user", "test-inactive-password")).status, 401);

        const limitedLogin = await loginRequest(api.baseUrl, "limited-user", "test-limited-password", {
          userId: admin.userId,
          role: "admin",
          permissions: ["audit_log.view"],
        });
        assert.equal(limitedLogin.status, 200);
        const limitedPayload = await limitedLogin.json() as {
          user: { id: string; username: string; name: string };
          permissions: string[];
        };
        assert.deepEqual(limitedPayload.user, {
          id: limited.userId,
          username: "limited-user",
          name: "Test limited-user",
        });
        assert.deepEqual(limitedPayload.permissions, ["quote.view"]);
        assert.equal("internalUserId" in limitedPayload.user, false);
        const limitedCookie = limitedLogin.headers.get("set-cookie") ?? "";
        assert.match(limitedCookie, /HttpOnly/);
        assert.match(limitedCookie, /SameSite=Strict/);
        assert.doesNotMatch(limitedCookie, /Secure/);
        const rawLimitedToken = limitedCookie.match(/zhixu_v1_session=([^;]+)/)?.[1] ?? "";
        assert.ok(rawLimitedToken);
        const storedSession = await pool.query<{ token: string }>(
          "SELECT token FROM app_sessions WHERE user_id = $1::bigint AND session_kind = 'v1' ORDER BY created_at DESC LIMIT 1",
          [limited.internalUserId],
        );
        assert.match(storedSession.rows[0].token, /^v1:[a-f0-9]{64}$/);
        assert.notEqual(storedSession.rows[0].token, rawLimitedToken);

        const limitedHeaders = {
          Cookie: `${rawLimitedToken ? `zhixu_v1_session=${rawLimitedToken}` : ""}`,
          "X-User-Id": admin.userId,
          "X-Role": "admin",
        };
        const me = await fetch(`${api.baseUrl}/api/v1/auth/me`, { headers: limitedHeaders });
        assert.equal(me.status, 200);
        assert.equal(((await me.json()) as { user: { id: string } }).user.id, limited.userId);
        const permissions = await fetch(`${api.baseUrl}/api/v1/auth/permissions`, { headers: limitedHeaders });
        assert.deepEqual(await permissions.json(), { permissions: ["quote.view"] });
        const denied = await fetch(`${api.baseUrl}/api/v1/operation-logs`, { headers: limitedHeaders });
        assert.equal(denied.status, 403);

        await pool.query(
          "UPDATE app_sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1::bigint AND session_kind = 'v1'",
          [limited.internalUserId],
        );
        assert.equal((await fetch(`${api.baseUrl}/api/v1/auth/me`, { headers: limitedHeaders })).status, 401);

        const logoutLogin = await loginRequest(api.baseUrl, "limited-user", "test-limited-password");
        const logoutCookie = logoutLogin.headers.get("set-cookie")?.match(/zhixu_v1_session=([^;]+)/)?.[1] ?? "";
        const logout = await fetch(`${api.baseUrl}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            Cookie: `zhixu_v1_session=${logoutCookie}`,
            Origin: "http://127.0.0.1:3001",
            "X-Zhixu-Request": "1",
          },
        });
        assert.equal(logout.status, 200);
        assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
        assert.equal((await fetch(`${api.baseUrl}/api/v1/auth/me`, {
          headers: { Cookie: `zhixu_v1_session=${logoutCookie}` },
        })).status, 401);
        const revoked = await pool.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM app_sessions WHERE user_id = $1::bigint AND revoked_at IS NOT NULL",
          [limited.internalUserId],
        );
        assert.equal(revoked.rows[0].count, 1);

        for (let attempt = 0; attempt < 10; attempt += 1) {
          assert.equal((await loginRequest(api.baseUrl, "brute-force-user", "wrong-password")).status, 401);
        }
        assert.equal((await loginRequest(api.baseUrl, "brute-force-user", "wrong-password")).status, 429);

        const operationId = createServerOperationId();
        const log = await appendOperationLog(pool, admin, {
          operationId,
          module: "权限管理",
          action: "修改账号状态",
          entityType: "User",
          entityId: limited.userId,
          context: { source: "integration-test" },
          beforeData: { values: { status: "active" } },
          afterData: { values: { status: "inactive" } },
          metadata: { actorUserId: "spoofed", role: "admin" },
        });
        assert.match(log.id, /^operation-log-[0-9a-f-]{36}$/);
        assert.equal(log.operationId, operationId);
        assert.equal(log.actorUserId, admin.userId);
        assert.equal(log.actorName, admin.userName);
        assert.deepEqual(log.changes, [{ field: "status", beforeValue: "active", afterValue: "inactive" }]);
        const storedLog = await pool.query<{ actor_public_id: string; actor_name: string }>(
          "SELECT actor_public_id::text, actor_name FROM operation_logs WHERE id = $1",
          [log.id],
        );
        assert.deepEqual(storedLog.rows[0], { actor_public_id: admin.userId, actor_name: admin.userName });
        await assert.rejects(() => pool.query("UPDATE operation_logs SET actor_name = 'spoofed' WHERE id = $1", [log.id]), /append-only/i);
        await assert.rejects(() => pool.query("DELETE FROM operation_logs WHERE id = $1", [log.id]), /append-only/i);

        const adminLogin = await loginRequest(api.baseUrl, "server-admin", "test-admin-password");
        const adminToken = adminLogin.headers.get("set-cookie")?.match(/zhixu_v1_session=([^;]+)/)?.[1] ?? "";
        const allowed = await fetch(`${api.baseUrl}/api/v1/operation-logs`, {
          headers: { Cookie: `zhixu_v1_session=${adminToken}` },
        });
        assert.equal(allowed.status, 200);
        assert.equal(((await allowed.json()) as { operationLogs: unknown[] }).operationLogs.length, 1);
        assert.equal((await fetch(`${api.baseUrl}/api/v1/operation-logs?limit=invalid`, {
          headers: { Cookie: `zhixu_v1_session=${adminToken}` },
        })).status, 400);
        const noAppendApi = await fetch(`${api.baseUrl}/api/v1/operation-logs`, {
          method: "POST",
          headers: {
            Cookie: `zhixu_v1_session=${adminToken}`,
            Origin: "http://127.0.0.1:3001",
            "X-Zhixu-Request": "1",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ actorUserId: limited.userId }),
        });
        assert.equal(noAppendApi.status, 404);

        assert.equal(JSON.stringify(events).includes(rawLimitedToken), false);
        assert.equal(JSON.stringify(events).includes("test-limited-password"), false);
      } finally {
        await api.close();
      }
    } finally {
      await pool.end();
    }
  });

  await t.test("production configuration fails closed for origin and cookie security", () => {
    const database = {
      DATABASE_URL: "postgresql://example.invalid/zhixu",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv;
    assert.throws(() => loadServerConfig(database), /ALLOWED_ORIGINS/);
    assert.throws(() => loadServerConfig({
      ...database,
      ZHIXU_ALLOWED_ORIGINS: "https://erp.example.com",
      ZHIXU_COOKIE_SECURE: "false",
    }), /cannot be disabled/);
    const config = loadServerConfig({
      ...database,
      ZHIXU_ALLOWED_ORIGINS: "https://erp.example.com",
    });
    assert.equal(config.secureCookies, true);
  });

  await t.test("health reports ready and unavailable database states truthfully", async () => {
    const databaseUrl = await postgres.createDatabase("health");
    const pool = new Pool({ connectionString: databaseUrl });
    const events: Record<string, unknown>[] = [];
    const server = createServer(createApp({ pool, logger: { error: (event) => events.push(event) } }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    try {
      const ready = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: "ok", database: "ready" });
      await pool.end();
      const unavailable = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
      assert.equal(unavailable.status, 503);
      const payload = await unavailable.json() as { error: { code: string; requestId: string } };
      assert.equal(payload.error.code, "database_unavailable");
      assert.ok(payload.error.requestId);
      assert.deepEqual(events.map((event) => event.event), ["database_healthcheck_failed"]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (!pool.ended) await pool.end();
    }
  });
});

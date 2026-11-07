import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createApp } from "../app.js";
import { createLocalDemoEntry, type LocalDemoConfig } from "../auth/local-demo-entry.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { runMigrations } from "../db/migration-runner.js";
import { startDisposablePostgres } from "./postgres-container.js";

test("loopback demo uses ordinary revocable read-only sessions, preserves deep links and normal logins, and turns off safely", async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("local_demo_entry") });
  const staticDirectory = await mkdtemp(join(tmpdir(), "weaveops-demo-entry-"));
  const server = createServer();
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await pool.end(); await postgres.stop(); await rm(staticDirectory, { recursive: true, force: true }); });
  await runMigrations(pool, resolve("database/migrations"));
  await synchronizePermissionCatalog(pool);
  const seed = async (username: string, permissions: string[]) => {
    const u = (await pool.query(`INSERT INTO app_users(username,password_hash,display_name,role,active)
      VALUES($1,crypt('synthetic-demo-test',gen_salt('bf',4)),$1,'viewer',true) RETURNING id::text,public_id::text`, [username])).rows[0];
    await pool.query("INSERT INTO app_roles(id,name,description) VALUES($1,$1,'isolated demo test')", [username]);
    for (const key of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [username, key]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [u.id, username]);
    return { ...u, username };
  };
  const preview = await seed("demo.preview", ["order.view", "style_progress.read", "ainuoke.view"]);
  const ordinary = await seed("demo.ordinary", ["order.view", "order.edit"]);
  const original: LocalDemoConfig = { enabled: true, username: preview.username, userId: preview.public_id };
  let config: unknown;
  await mkdir(join(staticDirectory, "order-center/style-progress"), { recursive: true });
  await writeFile(join(staticDirectory, "order-center.html"), "<title>Existing order center</title>");
  await writeFile(join(staticDirectory, "order-center/style-progress/detail.html"), "<title>Existing material detail</title>");
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const security = { secureCookies: false, sessionTtlSeconds: 28_800 };
  const entry = createLocalDemoEntry({ pool, baseUrl: base, security, readConfig: async () => config });
  const app = createApp({ pool, staticDirectory, allowedOrigins: [base], security });
  server.on("request", (req, res) => { void entry(req, res).then(() => app(req, res)).catch(() => { res.writeHead(503, { "Content-Type": "application/json" }); res.end('{"error":{"code":"local_demo_unavailable"}}'); }); });
  const call = (path: string, cookie = "", headers = {}) => fetch(base + path, { headers: { Cookie: cookie, ...headers } });
  const cookieOf = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
  let demoCookie = "", normalCookie = "";

  await t.test("disabled default requires normal authentication", async () => {
    const r = await call("/api/v1/auth/me"); assert.equal(r.status, 401);
    assert.equal(Number((await pool.query("SELECT count(*) FROM app_sessions")).rows[0].count), 0);
  });
  await t.test("anonymous direct document receives an HttpOnly v1 session and keeps its destination", async () => {
    config = original;
    const path = "/order-center/style-progress/detail?orderId=" + randomUUID();
    const page = await call(path, "theme=green", { Accept: "text/html", "Sec-Fetch-Dest": "document", "Sec-Fetch-Site": "cross-site" });
    assert.equal(page.status, 200); assert.equal(page.url, base + path); assert.equal(page.headers.get("location"), null);
    assert.match(await page.text(), /Existing material detail/);
    assert.match(page.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict; Max-Age=28800/);
    assert.match(page.headers.get("cache-control")!, /no-store/);
    demoCookie = cookieOf(page);
    assert.equal((await (await call("/api/v1/auth/me", demoCookie)).json()).user.id, preview.public_id);
    assert.deepEqual((await (await call("/api/v1/auth/permissions", demoCookie)).json()).permissions, ["ainuoke.view", "order.view", "style_progress.read"]);
    const sessions = (await pool.query("SELECT token,session_kind FROM app_sessions")).rows;
    assert.equal(sessions.length, 1); assert.equal(sessions[0].session_kind, "v1"); assert.match(sessions[0].token, /^v1:[a-f0-9]{64}$/);
    assert.ok(!sessions[0].token.includes(demoCookie.split("=")[1]));
  });
  await t.test("reload reuses the session; another empty browser can enter without credentials", async () => {
    const page = await call("/order-center", demoCookie, { Accept: "text/html" }); assert.equal(page.status, 200); assert.equal(page.headers.get("set-cookie"), null);
    const fresh = await call("/api/v1/auth/me"); assert.equal(fresh.status, 200); assert.equal((await fresh.json()).user.id, preview.public_id);
    assert.ok(fresh.headers.get("set-cookie"));
  });
  await t.test("source refresh is denied by existing RBAC without creating a task", async () => {
    const r = await fetch(base + "/api/v1/ainuoke/catalog/sync", { method: "POST", headers: { Cookie: demoCookie, Origin: base, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ sourceKey: "local-demo-test", sourceId: "1", requestId: randomUUID() }) });
    assert.equal(r.status, 403); assert.equal(Number((await pool.query("SELECT count(*) FROM ainuoke_sync_jobs")).rows[0].count), 0);
    assert.equal(Number((await pool.query("SELECT count(*) FROM ainuoke_sync_capture_attempts")).rows[0].count), 0);
  });
  await t.test("ordinary login identity is not replaced and its cookie is not rewritten", async () => {
    const r = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { Origin: base, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: ordinary.username, password: "synthetic-demo-test" }) });
    assert.equal(r.status, 200); normalCookie = cookieOf(r);
    const me = await call("/api/v1/auth/me", normalCookie); assert.equal(me.status, 200); assert.equal((await me.json()).user.id, ordinary.public_id); assert.equal(me.headers.get("set-cookie"), null);
  });
  await t.test("unavailable or elevated preview identity fails closed rather than granting access", async () => {
    config = { ...original, userId: randomUUID() }; assert.equal((await call("/api/v1/auth/me")).status, 503);
    config = original;
    await pool.query("UPDATE app_users SET active=false WHERE id=$1", [preview.id]); assert.equal((await call("/api/v1/auth/me")).status, 503);
    await pool.query("UPDATE app_users SET active=true WHERE id=$1", [preview.id]);
    await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'ainuoke.sync')", [preview.username]);
    assert.equal((await call("/api/v1/auth/me")).status, 503); assert.equal((await call("/api/v1/auth/me", demoCookie)).status, 503);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='ainuoke.sync'", [preview.username]);
  });
  await t.test("an expired demo session is replaced through the same server mechanism", async () => {
    await pool.query("UPDATE app_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [preview.id]);
    const r = await call("/api/v1/auth/me", demoCookie); assert.equal(r.status, 200); demoCookie = cookieOf(r);
    assert.equal((await r.json()).user.id, preview.public_id);
  });
  await t.test("turning mode off rejects automatic sessions and leaves normal sessions valid", async () => {
    config = { enabled: false };
    const r = await call("/api/v1/auth/me", demoCookie); assert.equal(r.status, 401); assert.match(r.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal((await call("/api/v1/auth/me")).status, 401);
    assert.equal(Number((await pool.query("SELECT count(*) FROM app_sessions WHERE user_id=$1 AND revoked_at IS NOT NULL", [preview.id])).rows[0].count), 1);
    const normal = await call("/api/v1/auth/me", normalCookie); assert.equal(normal.status, 200); assert.equal((await normal.json()).user.id, ordinary.public_id);
  });
});

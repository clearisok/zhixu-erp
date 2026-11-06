import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loginSessionSecurity, sessionCookie } from "../auth/session.js";

test("five-day login validates opt-in without changing cookie protections or default configuration", () => {
  const config = { secureCookies: true, sessionTtlSeconds: 43200 };
  for (const flag of [undefined, false]) assert.equal(loginSessionSecurity(config, flag), config);
  for (const flag of [null, "true", 1, {}, []]) assert.throws(() => loginSessionSecurity(config, flag));
  const remembered = loginSessionSecurity(config, true);
  assert.equal(remembered.sessionTtlSeconds, 432000);
  assert.equal(config.sessionTtlSeconds, 43200);
  const cookie = sessionCookie("synthetic", remembered);
  for (const part of ["HttpOnly", "SameSite=Strict", "Secure", "Max-Age=432000"]) assert.ok(cookie.includes(part));
  assert.ok(sessionCookie(null, remembered).includes("Max-Age=0"));
});

test("remembered sessions retain expiration and administrative revocation boundaries", { timeout: 120000 }, async t => {
  const x = await startCommercialSecurityFixture(); t.after(x.close);
  await bootstrapAdmin(x.pool, { username: "remember.root", displayName: "Synthetic", password: "synthetic-only" });
  const login = async (username: string, rememberMe?: unknown, password = "synthetic-only") => {
    const r = await x.request("/api/v1/auth/login", undefined, { username, password, ...(rememberMe === undefined ? {} : { rememberMe }) }, "POST");
    return { ...r, cookie: r.response.headers.get("set-cookie")?.split(";")[0] };
  };
  const root = (await login("remember.root")).cookie!;
  const command = (body: unknown) => x.request("/api/v1/team-access", root, body, "POST");
  const me = (cookie?: string) => x.request("/api/v1/auth/me", cookie);
  const session = async (username: string) => (await x.pool.query(`SELECT s.token,s.expires_at,extract(epoch FROM s.expires_at-s.created_at)::float AS ttl FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE u.username=$1 ORDER BY s.created_at DESC LIMIT 1`, [username])).rows[0];
  await t.test("default and explicit false retain configured TTL; true persists exactly five days", async () => {
    for (const flag of [undefined, false, true]) {
      const r = await login("remember.root", flag); assert.equal(r.response.status, 200);
      const expected = flag ? 432000 : 3600; // fixture's existing ordinary-session configuration
      assert.ok(r.response.headers.get("set-cookie")!.includes(`Max-Age=${expected}`));
      const before = await session("remember.root"); assert.equal(before.ttl, expected);
      assert.equal((await me(r.cookie)).response.status, 200);
      assert.equal((await session("remember.root")).expires_at.toISOString(), before.expires_at.toISOString());
      assert.equal(JSON.stringify(r.body).includes("token"), false);
    }
  });
  await t.test("invalid option, bad password and missing origin do not issue a session", async () => {
    const before = (await x.pool.query("SELECT count(*)::int n FROM app_sessions")).rows[0].n;
    for (const flag of [null, "true", 1, {}]) assert.equal((await login("remember.root", flag)).response.status, 400);
    assert.equal((await login("remember.root", true, "wrong")).response.status, 401);
    assert.equal((await fetch(x.base + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "remember.root", password: "synthetic-only", rememberMe: true }) })).status, 403);
    assert.equal((await x.pool.query("SELECT count(*)::int n FROM app_sessions")).rows[0].n, before);
  });
  await t.test("expired and explicitly logged-out remembered sessions cannot restore", async () => {
    const r = await login("remember.root", true), row = await session("remember.root");
    await x.pool.query("UPDATE app_sessions SET expires_at=now()-interval '1 second' WHERE token=$1", [row.token]);
    assert.equal((await me(r.cookie)).response.status, 401);
    const fresh = await login("remember.root", true);
    const out = await x.request("/api/v1/auth/logout", fresh.cookie, {}, "POST");
    assert.equal(out.response.status, 200); assert.ok(out.response.headers.get("set-cookie")!.includes("Max-Age=0"));
    assert.equal((await me(fresh.cookie)).response.status, 401);
  });
  for (const action of ["disable", "archive", "role", "reset-password", "revoke-sessions"]) await t.test(`${action} revokes all five-day sessions`, async () => {
    const account = `remember.${action}`;
    const made = await command({ action: "create", requestId: randomUUID(), account, name: account, password: "synthetic-only", roleIds: ["role-team-quote-manager"] });
    assert.equal(made.response.status, 200); const u = made.body.user;
    const a = await login(account, true), b = await login(account, true);
    const change = { requestId: randomUUID(), id: u.id, expectedVersion: u.version };
    const result = await command(action === "disable" || action === "role"
      ? { ...change, action: "update", name: u.name, status: action === "disable" ? "inactive" : "active", roleIds: action === "role" ? ["role-team-production-manager"] : u.roleIds }
      : { ...change, action, ...(action === "reset-password" ? { password: "synthetic-new" } : {}) });
    assert.equal(result.response.status, 200, result.text);
    for (const r of [a, b]) assert.equal((await me(r.cookie)).response.status, 401);
  });
  assert.deepEqual(x.errors, []);
});

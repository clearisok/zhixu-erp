import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import { createApp } from "../app.js";
import { createIdentityAuthority } from "../auth/identity-authority.js";
import { requirePermission } from "../auth/permissions.js";
import { loadServerConfig } from "../config.js";
import { runMigrations } from "../db/migration-runner.js";
import { startDisposablePostgres } from "./postgres-container.js";

const origin = "http://127.0.0.1:3001";

test("local single-user config is explicit and loopback-only", () => {
  const base = { NODE_ENV: "development" as const, DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1/test" };
  assert.equal(loadServerConfig(base).identityMode, "session");
  assert.throws(() => loadServerConfig({ ...base, ZHIXU_IDENTITY_MODE: "local-single-user" }), /acknowledgement/u);
  assert.throws(() => loadServerConfig({ ...base, ZHIXU_IDENTITY_MODE: "local-single-user", ZHIXU_LOCAL_SINGLE_USER_ACK: "I_UNDERSTAND_NO_AUTH", ZHIXU_ALLOWED_ORIGINS: "https://public.example" }), /loopback/u);
  assert.equal(loadServerConfig({ ...base, ZHIXU_IDENTITY_MODE: "local-single-user", ZHIXU_LOCAL_SINGLE_USER_ACK: "I_UNDERSTAND_NO_AUTH" }).identityMode, "local-single-user");
  assert.throws(() => requirePermission([], "settings.brand.edit"), /permission/u);
});

test("local identity uses one technical FK actor without login and keeps business boundaries", { timeout: 180_000 }, async (t) => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("local_identity") });
  t.after(async () => { await pool.end(); await postgres.stop(); });
  await runMigrations(pool, resolve("database/migrations"));
  const actor = (await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO app_users(username,password_hash,display_name,role,active)
     VALUES ('admin', crypt('synthetic-not-used', gen_salt('bf', 4)), 'Legacy compatibility row', 'admin', true)
     RETURNING id::text, public_id::text`,
  )).rows[0];
  const identityAuthority = createIdentityAuthority(pool, "local-single-user");
  await identityAuthority.verify();
  const server = createServer(createApp({ pool, identityAuthority, allowedOrigins: [origin] }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const me = await fetch(`${baseUrl}/api/v1/auth/me`);
  assert.equal(me.status, 200);
  assert.equal(me.headers.get("set-cookie"), null);
  assert.deepEqual(await me.json(), { user: { id: actor.public_id, username: "local-single-user", name: "本地开发用户" } });
  const permissions = await fetch(`${baseUrl}/api/v1/auth/permissions`);
  assert.equal(permissions.status, 200);
  assert.deepEqual((await permissions.json()).permissions, [...PERMISSION_KEYS]);
  assert.equal(PERMISSION_KEYS.length, 54);

  for (const path of [
    "/api/v1/quote-masters/brands", "/api/v1/quote-masters/customer-salespeople",
    "/api/v1/quote-masters/fabrics", "/api/v1/quote-masters/trims",
    "/api/v1/quote-masters/supplier-suggestions", "/api/v1/quote-settings",
    "/api/v1/quote-settings/manufacturing-presets", "/api/v1/quote-settings/resolved-defaults",
  ]) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 200, path);
  }

  const mutationHeaders = { "Content-Type": "application/json", Origin: origin, "X-Zhixu-Request": "1", "X-User-Id": "forged" };
  const createBody = { name: "Synthetic local brand", status: "active", defaults: { defaultUsdCnyRate: null, defaultOtherCost: null, defaultTrims: [] } };
  assert.equal((await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: mutationHeaders, body: JSON.stringify({ username: "admin", password: "ignored" }) })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/v1/auth/logout`, { method: "POST", headers: mutationHeaders, body: "{}" })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/v1/quote-masters/brands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createBody) })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/v1/quote-masters/brands`, { method: "POST", headers: mutationHeaders, body: JSON.stringify({ ...createBody, actorUserId: "forged" }) })).status, 400);
  const created = await fetch(`${baseUrl}/api/v1/quote-masters/brands`, { method: "POST", headers: mutationHeaders, body: JSON.stringify(createBody) });
  assert.equal(created.status, 201);
  const log = (await pool.query<{ actor_user_id: string; actor_public_id: string; actor_name: string }>(
    "SELECT actor_user_id::text, actor_public_id::text, actor_name FROM operation_logs WHERE entity_type = 'Brand' ORDER BY created_at DESC LIMIT 1",
  )).rows[0];
  assert.deepEqual(log, { actor_user_id: actor.id, actor_public_id: actor.public_id, actor_name: "本地开发用户" });
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM app_sessions")).rows[0].count, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM login_attempts")).rows[0].count, 0);
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  assert.equal(PERMISSION_KEYS.length, 62);

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
  const brand = (await created.json()).brand;
  await t.test("roleless trusted local authority completes options/preview/atomic create/readback/receipt for both types", async () => {
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM app_user_roles WHERE user_id=$1", [actor.id])).rows[0].count, 0);
    const call = async (path: string, body?: unknown) => {
      const response = await fetch(`${baseUrl}/api/v1/quotes/${path}`, { headers: mutationHeaders, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const before = (await pool.query("SELECT count(*)::int AS count FROM quote_center_quotes")).rows[0].count;
    assert.equal((await call("creation-options")).status, 200);
    for (const quoteType of ["processing", "distribution"]) {
      const input = { source: null, quoteType, selection: { country: "Cambodia", presetId: null }, fields: { brandId: brand.id, salespersonId: null, styleNo: "SYNTHETIC-LOCAL-CREATION", styleName: "Roleless local draft", quantity: "0", garmentLeadDate: "2028-02-29", note: "Synthetic" }, parameterOverrides: {} };
      const preview = await call("creation-preview", input);
      assert.equal(preview.status, 200);
      assert.equal(preview.body.parametersVisibility, "visible");
      const command = { ...input, previewId: preview.body.previewId, clientRequestId: randomUUID(), imageSelection: null };
      const result = await call("creation-workflows", command);
      assert.equal(result.status, 201);
      const saved = await call(result.body.result.quoteId);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.quote.quote.revisions[0].baseInfo.quoteType, quoteType);
      assert.equal(saved.body.quote.quote.revisions[0].baseInfo.brandId, brand.id);
      assert.equal(saved.body.quote.quote.revisions[0].priceVersions[0].quantity, "0");
      assert.deepEqual((await call(`creation-receipts/${command.clientRequestId}`)).body.result, result.body.result);
      assert.equal((await call("creation-workflows", command)).status, 200);
      const audit = (await pool.query("SELECT actor_user_id::text,actor_public_id::text,actor_name FROM operation_logs WHERE quote_id=$1 AND action='创建报价'", [result.body.result.quoteId])).rows;
      assert.deepEqual(audit, [{ actor_user_id: actor.id, actor_public_id: actor.public_id, actor_name: "本地开发用户" }]);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM quote_center_quotes")).rows[0].count, before + 2);
    const directId=randomUUID();
    const direct=await call("creation-defaults",{clientRequestId:directId});
    assert.equal(direct.status,201);
    assert.equal((await call(direct.body.result.quoteId)).body.quote.quote.revisions[0].baseInfo.quoteType,"distribution");
    assert.deepEqual((await call("creation-defaults",{clientRequestId:directId})).body.result,direct.body.result);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM quote_center_quotes")).rows[0].count,before+3);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM app_user_roles WHERE user_id=$1", [actor.id])).rows[0].count, 0);
  });
  const log = (await pool.query<{ actor_user_id: string; actor_public_id: string; actor_name: string }>(
    "SELECT actor_user_id::text, actor_public_id::text, actor_name FROM operation_logs WHERE entity_type = 'Brand' ORDER BY created_at DESC LIMIT 1",
  )).rows[0];
  assert.deepEqual(log, { actor_user_id: actor.id, actor_public_id: actor.public_id, actor_name: "本地开发用户" });
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM app_sessions")).rows[0].count, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM login_attempts")).rows[0].count, 0);
});

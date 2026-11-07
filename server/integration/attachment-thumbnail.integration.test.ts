import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { createApp } from "../app.js";
import type { TrustedIdentity } from "../auth/session.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { runMigrations } from "../db/migration-runner.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createAttachmentService } from "../attachments/service.js";
import { MemoryAttachmentStorage } from "../attachments/storage.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteDraft } from "../../features/quote-center/model/quote-view-model.js";
import { syntheticPhoneJPEG } from "./attachment-thumbnail.test.js";

test("protected thumbnails: disposable PostgreSQL, trusted sessions, original preservation", { timeout: 120_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("thumbnails") });
  const storage = new MemoryAttachmentStorage(), origin = "http://127.0.0.1:32199";
  const server = createServer(createApp({ pool, allowedOrigins: [origin], attachmentStorage: storage }));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await pool.end(); await postgres.stop(); });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  const identities: TrustedIdentity[] = [];
  for (const name of ["allowed", "denied"]) {
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES($1,crypt('synthetic-password',gen_salt('bf',4)),$1,'viewer',true) RETURNING id::text,public_id::text", [name])).rows[0];
    await pool.query("INSERT INTO app_roles(id,name,description) VALUES($1,$1,'thumbnail test')", [name]);
    if (name === "allowed") for (const permission of ["quote.view", "quote.edit"])
      await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [name, permission]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, name]);
    identities.push({ internalUserId: row.id, userId: row.public_id, username: name, userName: name, permissions: ["quote.view", "quote.edit"] });
  }
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const login = async (username: string) => {
    const r = await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { Origin: origin, "X-Zhixu-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "synthetic-password" }) });
    assert.equal(r.status, 200); return r.headers.get("set-cookie")!.split(";", 1)[0];
  };
  const cookie = await login("allowed"), denied = await login("denied");
  const quote = quoteSnapshotFromBrowser(createQuoteDraft("thumbnail-quote", "SYNTHETIC-THUMB", "2026-10-10"));
  await createQuoteRepository(pool).create(quote);
  const service = createAttachmentService(pool, storage), revision = quote.defaultRevisionId;
  let version = 1;
  const path = (id: string, command = "thumbnail") => `/api/v1/quotes/${quote.id}/revisions/${revision}/attachments/${id}/${command}`;
  const read = (id: string, auth = cookie, command = "thumbnail") => fetch(base + path(id, command), { headers: auth ? { Cookie: auth } : {} });
  const originals = [await syntheticPhoneJPEG(), await sharp({ create: { width: 500, height: 1000, channels: 4, background: "#39705e88" } }).png().toBuffer(), await sharp({ create: { width: 1000, height: 500, channels: 3, background: "green" } }).webp().toBuffer()];
  const ids: string[] = [];
  await t.test("JPEG >2MiB / PNG / WebP read actual reduced bytes; no original write or quote/log mutation", async () => {
    for (const [index, bytes] of originals.entries()) {
      const mimeType = ["image/jpeg", "image/png", "image/webp"][index];
      const uploaded = await service.upload(identities[0], quote.id, revision, version++, { name: `synthetic.${mimeType.split("/")[1]}`, mimeType, kind: "image", bytes, uploadToken: randomUUID() });
      ids.push(uploaded.attachment.id);
      const before = JSON.stringify((await createQuoteRepository(pool).getById(quote.id)));
      const logs = (await pool.query("SELECT count(*)::int AS n FROM operation_logs")).rows[0].n;
      const r = await read(uploaded.attachment.id); assert.equal(r.status, 200);
      assert.equal(r.headers.get("cache-control"), "private, no-cache");
      assert.equal(r.headers.get("vary"), "Cookie, Authorization"); assert.equal(r.headers.get("content-type"), "image/jpeg");
      const thumb = Buffer.from(await r.arrayBuffer()), meta = await sharp(thumb).metadata();
      assert.ok(Math.max(meta.width!, meta.height!) <= 256 && thumb.length <= 96 * 1024);
      assert.equal(createHash("sha256").update(thumb).digest("hex"), r.headers.get("x-thumbnail-sha256"));
      const conditional = await fetch(base + path(uploaded.attachment.id), {headers:{Cookie:cookie,"If-None-Match":r.headers.get("etag")!}});
      assert.equal(conditional.status,304);assert.equal((await conditional.arrayBuffer()).byteLength,0);
      const deniedConditional = await fetch(base + path(uploaded.attachment.id), {headers:{Cookie:denied,"If-None-Match":r.headers.get("etag")!}});
      assert.equal(deniedConditional.status,403);
      const original = await read(uploaded.attachment.id, cookie, "download");
      assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), uploaded.attachment.sha256);
      assert.equal(JSON.stringify(await createQuoteRepository(pool).getById(quote.id)), before);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs")).rows[0].n, logs);
      assert.equal(storage.objects.size, index + 1);
      t.diagnostic(`Original ${mimeType} ${bytes.length} bytes -> ${meta.width}x${meta.height}, ${thumb.length} bytes`);
    }
  });
  await t.test("each request checks session/RBAC/exact relation, including after a successful read", async () => {
    assert.equal((await read(ids[0], "")).status, 401);
    assert.equal((await read(ids[0], denied)).status, 403);
    assert.equal((await fetch(base + path(ids[0]).replace(revision, "wrong-revision"), { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await read(randomUUID())).status, 404);
    assert.equal((await fetch(base + path(ids[0]) + "?width=999", { headers: { Cookie: cookie } })).status, 400);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id='allowed' AND permission_key='quote.view'");
    assert.equal((await read(ids[0])).status, 403);
    await pool.query("INSERT INTO app_role_permissions VALUES('allowed','quote.view')");
    await service.unlink(identities[0], quote.id, revision, ids[2], version++);
    assert.equal((await read(ids[2])).status, 404);
  });
  await t.test("missing/corrupt source is safe; full body hash checked, no storage address in error", async () => {
    const key = `attachments/${ids[0]}/original`, original = storage.objects.get(key)!;
    const head = storage.head.bind(storage);
    // Deliberately dishonest HEAD proves streamed bytes, not just metadata, are hashed.
    storage.objects.set(key, Buffer.from(original)); storage.objects.get(key)![original.length - 1] ^= 1;
    storage.head = async k => k === key ? { byteSize: original.length, sha256: createHash("sha256").update(original).digest("hex") } : head(k);
    const r = await read(ids[0]); assert.equal(r.status, 503);
    const error = await r.text(); assert.ok(!error.includes(key) && !error.includes("sharp") && !error.includes("storage_key"));
    storage.head = head; storage.objects.set(key, original);
    storage.objects.delete(`attachments/${ids[1]}/original`);
    assert.equal((await read(ids[1])).status, 503);
    const corrupt = await service.upload(identities[0], quote.id, revision, version++, { name: "damaged.jpg", mimeType: "image/jpeg", kind: "image", bytes: Buffer.from([255,216,255,0]), uploadToken: randomUUID() });
    assert.equal((await read(corrupt.attachment.id)).status, 503);
  });
});

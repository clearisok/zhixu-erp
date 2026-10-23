import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { inspectMigrationStatus, PendingMigrationsError, runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { createQuoteService, createTrustedQuoteService } from "../quotes/service.js";
import { initializeServer } from "../startup.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createAttachmentService } from "../attachments/service.js";
import { MemoryAttachmentStorage } from "../attachments/storage.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

const origin = "http://127.0.0.1:3001";
const token = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function seed(pool: pg.Pool, username: string, permissions: TrustedIdentity["permissions"]) {
  const row = (await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO app_users(username,password_hash,display_name,role,active)
     VALUES($1,crypt('test-password',gen_salt('bf',4)),$1,'viewer',true) RETURNING id::text,public_id::text`, [username])).rows[0];
  const role = `role-q4a-${username}`;
  await pool.query("INSERT INTO app_roles(id,name,description) VALUES($1,$1,'q4a test')", [role]);
  for (const key of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [role, key]);
  await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1::bigint,$2)", [row.id, role]);
  return { internalUserId: row.id, userId: row.public_id, username, userName: username, permissions } satisfies TrustedIdentity;
}
async function request(base: string, path: string, method = "GET", cookie = "", body?: object | Buffer, headers: Record<string, string> = {}) {
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers,
    ...(body && !Buffer.isBuffer(body) ? { "Content-Type": "application/json" } : {}) },
    body: body ? Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body) : undefined });
  return { response, payload: response.headers.get("content-type")?.includes("json") ? await response.json() as Record<string, unknown> : null };
}

test("Q4A attachment foundation uses disposable PostgreSQL and fake object storage only", { timeout: 240_000 }, async (t) => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("q4a_attachment") });
  const directory = await mkdtemp(join(tmpdir(), "zhixu-q4a-migrations-"));
  const storage = new MemoryAttachmentStorage();
  const server = createServer(createApp({ pool, allowedOrigins: [origin], attachmentStorage: storage }));
  t.after(async () => { await new Promise<void>((done) => server.close(() => done())); await pool.end(); await postgres.stop(); await rm(directory, { recursive: true, force: true }); });
  const prior = [
    "0001_trusted_auth_rbac_operation_logs.sql", "0002_sales_order_foundation.sql", "0003_sales_order_number_sequence.sql",
    "0004_confirmed_commercial_terms.sql", "0005_quote_foundation.sql", "0006_quote_number_sequence.sql", "0007_quote_master_settings.sql",
  ];
  for (const name of prior) await writeFile(join(directory, name), await readFile(resolve("database/migrations", name)));
  assert.deepEqual((await runMigrations(pool, directory)).applied, prior);
  assert.equal((await pool.query("SELECT to_regclass('public.quote_attachments') AS value")).rows[0].value, null);
  await writeFile(join(directory, "0008_quote_attachments.sql"), await readFile(resolve("database/migrations/0008_quote_attachments.sql")));
  const pending = await inspectMigrationStatus(pool, directory);
  assert.deepEqual(pending.pending, ["0008_quote_attachments.sql"]);
  await assert.rejects(() => verifyMigrationsCurrent(pool, directory), PendingMigrationsError);
  const startupCalls: string[] = [];
  await assert.rejects(() => initializeServer({
    verifyMigrations: () => verifyMigrationsCurrent(pool, directory),
    synchronizePermissions: async () => { startupCalls.push("permission-sync"); },
    bootstrapAdmin: async () => { startupCalls.push("admin-bootstrap"); },
    listen: async () => { startupCalls.push("listen"); },
  }), PendingMigrationsError);
  assert.deepEqual(startupCalls, []);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM operation_logs")).rows[0].n, 0);
  assert.deepEqual((await runMigrations(pool, directory)).applied, ["0008_quote_attachments.sql"]);
  assert.deepEqual((await runMigrations(pool, directory)).applied, []);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_master_brands")).rows[0].n, 0);
  const columns = (await pool.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='quote_attachments'")).rows.map((r) => r.column_name);
  assert.ok(!columns.includes("blob") && !columns.includes("binary") && !columns.includes("base64"));

  await synchronizePermissionCatalog(pool);
  const editor = await seed(pool, "attachment-editor", ["quote.view", "quote.edit", "quote.cost.view", "quote.revision.update", "estimate.view", "commercial.sale.view", "commercial.labor.view"]);
  const viewer = await seed(pool, "attachment-viewer", ["quote.view"]);
  await seed(pool, "attachment-denied", []);
  const fixture = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("q4a"));
  for (const revision of fixture.revisions) {
    revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null;
    revision.garmentMedia = []; revision.quoteDocuments = [];
  }
  await createQuoteService(pool).createAggregate(fixture);
  const quoteId = fixture.id;
  let revisionId = fixture.defaultRevisionId;
  const historyId = fixture.revisions.find((r) => r.readOnly)!.revisionId;
  const service = createAttachmentService(pool, storage);
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("synthetic q4a image bytes")]);
  const upload = (n: number, actor = editor, kind: "image" | "file" = "image", data = bytes) => service.upload(actor, quoteId, revisionId, 1,
    { name: kind === "image" ? "example.png" : "notes.pdf", mimeType: kind === "image" ? "image/png" : "application/pdf", kind, bytes: data, uploadToken: token(n) });

  await t.test("trusted upload persists UUID, hash, identity, ordered relation, mirror and audit", async () => {
    const saved = await upload(1);
    assert.match(saved.attachment.id, /^[0-9a-f-]{36}$/);
    assert.equal(saved.attachment.createdBy, editor.userId);
    assert.equal(saved.attachment.sha256.length, 64);
    assert.equal(saved.attachment.isStyleImage, true);
    assert.equal(saved.version, 2);
    assert.equal(storage.objects.size, 1);
    assert.ok(storage.objects.has(`attachments/${saved.attachment.id}/original`));
    const db = (await pool.query("SELECT lifecycle,created_by_user_id::text,storage_provider,storage_container,storage_key FROM quote_attachments WHERE id=$1", [saved.attachment.id])).rows[0];
    assert.deepEqual([db.lifecycle, db.created_by_user_id, db.storage_provider, db.storage_container], ["available", editor.internalUserId, "memory-test", "disposable"]);
    assert.equal(db.storage_key, `attachments/${saved.attachment.id}/original`);
    assert.deepEqual((await createQuoteService(pool).getById(quoteId))!.quote.revisions.find((r) => r.revisionId === revisionId)!.imageAttachmentIds, [saved.attachment.id]);
    const logs = (await pool.query("SELECT actor_public_id::text,action,before_data,after_data FROM operation_logs WHERE entity_type='Attachment' ORDER BY operation_sequence")).rows;
    assert.deepEqual(logs.map((r) => r.action), ["上传图片", "关联附件", "设置款式图"]);
    assert.ok(logs.every((r) => r.actor_public_id === editor.userId && !JSON.stringify(r).includes(bytes.toString())));
    assert.equal((await upload(1)).attachment.id, saved.attachment.id);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_attachments")).rows[0].n, 1);
    await assert.rejects(() => service.upload(editor, quoteId, revisionId, 1, { name: "different.png", mimeType: "image/png", kind: "image", bytes, uploadToken: token(1) }),
      (error: unknown) => (error as { status?: number }).status === 409);
  });
  const first = (await service.list(editor, quoteId, revisionId))[0];
  await t.test("additional image/file, rename, style and duplicate relation guards", async () => {
    const second = await service.upload(editor, quoteId, revisionId, 2, { name: "second.webp", mimeType: "image/webp", kind: "image", bytes: Buffer.from("RIFF0000WEBPsecond"), uploadToken: token(2) });
    assert.equal(second.attachment.position, 1);
    assert.equal(second.attachment.isStyleImage, false);
    const file = await service.upload(editor, quoteId, revisionId, 3, { name: "notes.pdf", mimeType: "application/pdf", kind: "file", bytes: Buffer.from("file"), uploadToken: token(3) });
    assert.equal(file.attachment.position, 0);
    assert.equal(file.attachment.isStyleImage, false);
    assert.equal((await service.rename(editor, quoteId, revisionId, first.id, 4, "renamed.jpg")).result.name, "renamed.png");
    assert.equal((await service.style(editor, quoteId, revisionId, second.attachment.id, 5)).result.styleImageAttachmentId, second.attachment.id);
    await assert.rejects(() => service.style(editor, quoteId, revisionId, file.attachment.id, 6), (error: unknown) => (error as { status?: number }).status === 409);
    const rows = await service.list(viewer, quoteId, revisionId);
    assert.deepEqual(rows.map((r) => [r.kind, r.position]), [["image", 0], ["image", 1], ["file", 0]]);
    assert.equal((await service.download(viewer, quoteId, revisionId, first.id)).attachment.id, first.id);
    await assert.rejects(() => service.rename(viewer, quoteId, revisionId, first.id, 6, "denied"), (error: unknown) => (error as { status?: number }).status === 403);
    await assert.rejects(() => service.upload(editor, quoteId, revisionId, 6, { name: "fake.png", mimeType: "image/png", kind: "image", bytes: Buffer.from("not an image"), uploadToken: token(9) }),
      (error: unknown) => (error as { code?: string }).code === "invalid_image_signature");
    await assert.rejects(() => service.unlink(editor, quoteId, historyId, first.id, 6), (error: unknown) => (error as { status?: number }).status === 409);
    await assert.rejects(() => pool.query(
      `INSERT INTO quote_revision_attachments(quote_id,revision_id,attachment_id,kind,position,is_style_image)
       VALUES($1,$2,$3::uuid,'file',99,true)`, [quoteId, revisionId, first.id]), /check constraint/i);
    await assert.rejects(() => pool.query(
      `INSERT INTO quote_revision_attachments(quote_id,revision_id,attachment_id,kind,position,is_style_image)
       VALUES($1,$2,$3::uuid,'file',99,false)`, [quoteId, historyId, first.id]), /foreign key constraint/i);
    const aggregate = (await createQuoteService(pool).getById(quoteId))!;
    const forged = structuredClone(aggregate.quote);
    forged.revisions.find((r) => r.revisionId === revisionId)!.imageAttachmentIds = [];
    await assert.rejects(() => createTrustedQuoteService(pool).saveAggregate(editor, forged, aggregate.version),
      (error: unknown) => (error as { code?: string }).code === "quote_attachment_command_required");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_revision_attachments")).rows[0].n, 3);
  });

  await t.test("shared attachment survives unlink on current revision after successor inherits it", async () => {
    const current = (await createQuoteService(pool).getById(quoteId))!;
    const previous = current.quote.revisions.find((r) => r.revisionId === revisionId)!;
    const successor = structuredClone(previous);
    successor.revisionId = "revision-three";
    successor.parentRevisionId = revisionId;
    successor.readOnly = false;
    previous.readOnly = true;
    current.quote.revisions.push(successor);
    current.quote.defaultRevisionId = successor.revisionId;
    await createTrustedQuoteService(pool).saveAggregate(editor, current.quote, current.version);
    const oldRevisionId = revisionId;
    revisionId = successor.revisionId;
    const version = (await createQuoteService(pool).getById(quoteId))!.version;
    assert.equal((await service.list(viewer, quoteId, revisionId)).some((r) => r.id === first.id), true);
    assert.ok((await pool.query("SELECT count(*)::int AS n FROM operation_logs WHERE action='关联附件' AND context->>'revisionId'=$1", [revisionId])).rows[0].n >= 3);
    await assert.rejects(() => service.link(editor, quoteId, revisionId, first.id, version), (error: unknown) => (error as { status?: number }).status === 409);
    await service.unlink(editor, quoteId, revisionId, first.id, version);
    const head = storage.head.bind(storage);
    storage.head = async (key) => key === `attachments/${first.id}/original` ? null : head(key);
    try {
      await assert.rejects(() => service.link(editor, quoteId, revisionId, first.id, version + 1),
        (error: unknown) => (error as { code?: string }).code === "attachment_object_unavailable");
    } finally { storage.head = head; }
    await service.link(editor, quoteId, revisionId, first.id, version + 1);
    await service.unlink(editor, quoteId, revisionId, first.id, version + 2);
    assert.equal((await service.list(viewer, quoteId, oldRevisionId)).some((r) => r.id === first.id), true);
    assert.equal((await service.list(viewer, quoteId, revisionId)).some((r) => r.id === first.id), false);
    assert.equal((await pool.query("SELECT lifecycle FROM quote_attachments WHERE id=$1", [first.id])).rows[0].lifecycle, "available");
    assert.ok(storage.objects.has(`attachments/${first.id}/original`));
    assert.equal((await service.style(editor, quoteId, revisionId, null, version + 3)).result.styleImageAttachmentId, null);
    assert.equal((await createQuoteService(pool).getById(quoteId))!.quote.revisions.find((r) => r.revisionId === revisionId)!.styleImageAttachmentId, null);
  });

  await t.test("PUT failure and post-PUT DB failure leave no relationship and classified cleanup evidence", async () => {
    const version = (await createQuoteService(pool).getById(quoteId))!.version;
    storage.failPut = true;
    await assert.rejects(() => service.upload(editor, quoteId, revisionId, version, { name: "fail.pdf", mimeType: "application/pdf", kind: "file", bytes, uploadToken: token(4) }),
      (error: unknown) => (error as { code?: string }).code === "attachment_upload_incomplete");
    storage.failPut = false;
    assert.equal((await pool.query("SELECT lifecycle FROM quote_attachments WHERE upload_token=$1::uuid", [token(4)])).rows[0].lifecycle, "pending_cleanup");
    const head = storage.head.bind(storage);
    storage.head = async () => ({ byteSize: bytes.length, sha256: "0".repeat(64) });
    try {
      await assert.rejects(() => service.upload(editor, quoteId, revisionId, version, { name: "mismatch.pdf", mimeType: "application/pdf", kind: "file", bytes, uploadToken: token(7) }),
        (error: unknown) => (error as { code?: string }).code === "attachment_upload_incomplete");
    } finally { storage.head = head; }
    assert.equal((await pool.query("SELECT lifecycle FROM quote_attachments WHERE upload_token=$1::uuid", [token(7)])).rows[0].lifecycle, "pending_cleanup");
    await pool.query(`CREATE FUNCTION q4a_fail_relation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic relation failure'; END $$`);
    await pool.query("CREATE TRIGGER q4a_fail_relation_trigger BEFORE INSERT ON quote_revision_attachments FOR EACH ROW EXECUTE FUNCTION q4a_fail_relation()");
    try {
      await assert.rejects(() => service.upload(editor, quoteId, revisionId, version, { name: "orphan.pdf", mimeType: "application/pdf", kind: "file", bytes, uploadToken: token(5) }),
        (error: unknown) => (error as { code?: string }).code === "attachment_commit_ambiguous_check_status");
    } finally { await pool.query("DROP TRIGGER q4a_fail_relation_trigger ON quote_revision_attachments"); await pool.query("DROP FUNCTION q4a_fail_relation()"); }
    const orphan = (await pool.query("SELECT id::text,lifecycle,storage_key FROM quote_attachments WHERE upload_token=$1::uuid", [token(5)])).rows[0];
    assert.equal(orphan.lifecycle, "pending_cleanup");
    assert.ok(storage.objects.has(orphan.storage_key));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_revision_attachments WHERE attachment_id=$1::uuid", [orphan.id])).rows[0].n, 0);
    assert.equal((await createQuoteService(pool).getById(quoteId))!.version, version);
    await assert.rejects(() => service.upload(editor, quoteId, revisionId, version, { name: "orphan.pdf", mimeType: "application/pdf", kind: "file", bytes, uploadToken: token(5) }),
      (error: unknown) => (error as { status?: number }).status === 409);
    await pool.query(`CREATE FUNCTION q4a_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='Attachment' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER q4a_fail_audit_trigger BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION q4a_fail_audit()");
    try {
      await assert.rejects(() => service.upload(editor, quoteId, revisionId, version, { name: "audit.pdf", mimeType: "application/pdf", kind: "file", bytes, uploadToken: token(8) }),
        (error: unknown) => (error as { code?: string }).code === "attachment_commit_ambiguous_check_status");
    } finally { await pool.query("DROP TRIGGER q4a_fail_audit_trigger ON operation_logs"); await pool.query("DROP FUNCTION q4a_fail_audit()"); }
    assert.equal((await pool.query("SELECT lifecycle FROM quote_attachments WHERE upload_token=$1::uuid", [token(8)])).rows[0].lifecycle, "pending_cleanup");
    assert.equal((await createQuoteService(pool).getById(quoteId))!.version, version);
  });

  await t.test("API uses trusted session, 401/403, typed metadata and binary read without actor spoof", async () => {
    // Earlier assertions deliberately exercise the original attachment schema.
    // Current HTTP authentication runs only after all forward migrations.
    await runMigrations(pool, resolve("database/migrations"));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const login = async (username: string) => {
      const result = await request(base, "/api/v1/auth/login", "POST", "", { username, password: "test-password" }, { Origin: origin, "X-Zhixu-Request": "1" });
      assert.equal(result.response.status, 200);
      return result.response.headers.get("set-cookie")!.split(";", 1)[0];
    };
    const editorCookie = await login(editor.username);
    const viewerCookie = await login(viewer.username);
    const deniedCookie = await login("attachment-denied");
    const path = `/api/v1/quotes/${quoteId}/revisions/${revisionId}/attachments`;
    assert.equal((await request(base, path)).response.status, 401);
    assert.equal((await request(base, path, "GET", deniedCookie)).response.status, 403);
    assert.equal((await request(base, path, "GET", viewerCookie)).response.status, 200);
    assert.equal((await request(base, path, "POST", viewerCookie, bytes, { Origin: origin, "X-Zhixu-Request": "1" })).response.status, 403);
    const version = (await createQuoteService(pool).getById(quoteId))!.version;
    const created = await request(base, `${path}?name=${encodeURIComponent("API 文档.pdf")}&kind=file`, "POST", editorCookie, Buffer.from("api bytes"),
      { Origin: origin, "X-Zhixu-Request": "1", "Content-Type": "application/pdf", "X-Quote-Version": String(version), "Idempotency-Key": token(6),
        "X-Actor-User-Id": viewer.userId, "X-Storage-Key": "spoofed", "X-Content-Hash": "spoofed" });
    assert.equal(created.response.status, 201);
    const attachment = (created.payload!.attachment ?? {}) as Record<string, unknown>;
    assert.equal(attachment.createdBy, editor.userId);
    assert.equal(attachment.name, "API 文档.pdf");
    assert.equal("storageKey" in attachment, false);
    const downloaded = await request(base, `${path}/${attachment.id}/download`, "GET", viewerCookie);
    assert.equal(downloaded.response.status, 200);
    assert.equal(Buffer.from(await downloaded.response.arrayBuffer()).toString(), "api bytes");
    const invalid = await request(base, `${path}/${attachment.id}`, "PATCH", editorCookie,
      { expectedVersion: version + 1, name: "x", actor: viewer.userId }, { Origin: origin, "X-Zhixu-Request": "1" });
    assert.equal(invalid.response.status, 400);
    assert.equal((await pool.query("SELECT actor_public_id::text FROM operation_logs WHERE entity_id=$1 AND action='上传文件'", [attachment.id])).rows[0].actor_public_id, editor.userId);
    const removed = await request(base, `${path}/${attachment.id}`, "DELETE", editorCookie,
      { expectedVersion: version + 1 }, { Origin: origin, "X-Zhixu-Request": "1" });
    assert.equal(removed.response.status, 200);
    const status = (await pool.query("SELECT lifecycle,storage_key FROM quote_attachments WHERE id=$1::uuid", [attachment.id])).rows[0];
    assert.equal(status.lifecycle, "pending_cleanup");
    assert.ok(storage.objects.has(status.storage_key));
  });
});

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createApp } from "../app.js";
import type { TrustedIdentity } from "../auth/session.js";
import { runMigrations } from "../db/migration-runner.js";
import { createAttachmentService } from "../attachments/service.js";
import { MemoryAttachmentStorage } from "../attachments/storage.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";
import { startDisposablePostgres } from "./postgres-container.js";

test("D099 relation-backed image summary, authorized scoped bytes, bounded read-only query", { timeout: 180_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase("d099_images") });
  t.after(async () => { await pool.end(); await postgres.stop(); });
  await runMigrations(pool, resolve("database/migrations"));
  const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('synthetic-image','unused','Synthetic','viewer') RETURNING id::text,public_id::text")).rows[0];
  const editor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "synthetic-image", userName: "Synthetic", permissions: ["quote.view", "quote.edit"] };
  let actor: TrustedIdentity | null = { ...editor, permissions: ["quote.view"] };
  const storage = new MemoryAttachmentStorage();
  const service = createAttachmentService(pool, storage);
  const server = createServer(createApp({ pool, attachmentStorage: storage, identityAuthority: { mode: "session", verify: async () => {}, resolve: async () => actor } }));
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>(done => server.close(() => done())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const quote = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("synthetic-list-image"));
  for (const r of quote.revisions) { r.imageAttachmentIds = []; r.fileAttachmentIds = []; r.styleImageAttachmentId = null; }
  await createQuoteRepository(pool).create(quote);
  const revisionId = quote.defaultRevisionId;
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVQAAAABJRU5ErkJggg==", "base64");
  const first = await service.upload(editor, quote.id, revisionId, 1, { name: "synthetic.png", mimeType: "image/png", kind: "image", bytes, uploadToken: "00000000-0000-4000-8000-000000000001" });
  const get = async (columns = "styleImage") => { const response = await fetch(`${base}/api/v1/quotes?columns=${columns}`); return { status: response.status, body: await response.json() }; };
  const image = async () => (await get()).body.quotes[0].styleImage;
  await t.test("default Revision relation projects only minimal image identity; selected-only", async () => {
    assert.deepEqual(await image(), { attachmentId: first.attachment.id, mimeType: "image/png", byteSize: bytes.length, sha256: first.attachment.sha256 });
    assert.equal(Object.hasOwn((await get("quote")).body.quotes[0], "styleImage"), false);
    assert.doesNotMatch(JSON.stringify((await get()).body), /storage_key|original_name|attachments\/|estimate-active|fabrics/);
    const response = await fetch(`${base}/api/v1/quotes/${quote.id}/revisions/${revisionId}/attachments/${first.attachment.id}/download`);
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  });
  await t.test("forged/missing mirror or non-style relation does not become an image", async () => {
    await pool.query("UPDATE quote_revision_attachments SET is_style_image=false WHERE quote_id=$1", [quote.id]);
    assert.equal(await image(), null);
    await pool.query("UPDATE quote_revision_attachments SET is_style_image=true WHERE attachment_id=$1", [first.attachment.id]);
    await pool.query("UPDATE quote_center_revisions SET metadata=jsonb_set(metadata,'{styleImageAttachmentId}','\"invalid-not-uuid\"') WHERE quote_id=$1 AND id=$2", [quote.id, revisionId]);
    assert.equal(await image(), null);
    await pool.query("UPDATE quote_center_revisions SET metadata=jsonb_set(metadata,'{styleImageAttachmentId}',to_jsonb($3::text)) WHERE quote_id=$1 AND id=$2", [quote.id, revisionId, first.attachment.id]);
    await pool.query("UPDATE quote_attachments SET lifecycle='pending_cleanup' WHERE id=$1", [first.attachment.id]);
    assert.equal(await image(), null);
    await pool.query("UPDATE quote_attachments SET lifecycle='available' WHERE id=$1", [first.attachment.id]);
  });
  await t.test("image switches/removal and unavailable object fail closed without changing history", async () => {
    const history = JSON.stringify((await pool.query("SELECT metadata FROM quote_center_revisions WHERE quote_id=$1 AND id<>$2 ORDER BY id", [quote.id, revisionId])).rows);
    const second = await service.upload(editor, quote.id, revisionId, 2, { name: "second.png", mimeType: "image/png", kind: "image", bytes, uploadToken: "00000000-0000-4000-8000-000000000002" });
    await service.style(editor, quote.id, revisionId, second.attachment.id, 3);
    assert.equal((await image()).attachmentId, second.attachment.id);
    storage.objects.delete(`attachments/${second.attachment.id}/original`);
    assert.equal((await fetch(`${base}/api/v1/quotes/${quote.id}/revisions/${revisionId}/attachments/${second.attachment.id}/download`)).status, 503);
    await service.unlink(editor, quote.id, revisionId, second.attachment.id, 4);
    assert.equal(await image(), null);
    assert.equal(JSON.stringify((await pool.query("SELECT metadata FROM quote_center_revisions WHERE quote_id=$1 AND id<>$2 ORDER BY id", [quote.id, revisionId])).rows), history);
  });
  await t.test("no quote.view/anonymous receives neither relation nor bytes", async () => {
    actor = { ...editor, permissions: [] }; assert.equal((await get()).status, 403);
    assert.equal((await fetch(`${base}/api/v1/quotes/${quote.id}/revisions/${revisionId}/attachments/${first.attachment.id}/download`)).status, 403);
    actor = null; assert.equal((await get()).status, 401);
  });
});

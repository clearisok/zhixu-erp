import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { createAttachmentService } from "../attachments/service.js";
import { AttachmentStorageFailure, S3AttachmentStorage } from "../attachments/s3-storage.js";
import { loadServerConfig } from "../config.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteService } from "../quotes/service.js";
import { startDisposableMinio } from "./minio-container.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const base: NodeJS.ProcessEnv = { NODE_ENV: "test", DATABASE_URL: "postgresql://synthetic:test@127.0.0.1:5432/synthetic" };

test("S3 runtime config is explicit and fails closed without leaking secrets", () => {
  assert.equal(loadServerConfig(base).attachmentStorage.kind, "disabled");
  const valid = { ...base, ZHIXU_ATTACHMENT_STORAGE: "s3", ZHIXU_ATTACHMENT_S3_ENDPOINT: "http://127.0.0.1:9000",
    ZHIXU_ATTACHMENT_S3_REGION: "us-east-1", ZHIXU_ATTACHMENT_S3_BUCKET: "synthetic-bucket",
    ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: "synthetic-key", ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: "synthetic-secret",
    ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: "true" };
  assert.deepEqual(loadServerConfig(valid).attachmentStorage, { kind: "s3", endpoint: "http://127.0.0.1:9000/",
    region: "us-east-1", bucket: "synthetic-bucket", accessKeyId: "synthetic-key", secretAccessKey: "synthetic-secret",
    forcePathStyle: true });
  for (const name of ["ZHIXU_ATTACHMENT_S3_ENDPOINT", "ZHIXU_ATTACHMENT_S3_REGION", "ZHIXU_ATTACHMENT_S3_BUCKET",
    "ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID", "ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY"]) {
  const invalid: NodeJS.ProcessEnv = { ...valid };
    delete invalid[name];
    assert.throws(() => loadServerConfig(invalid), (error: unknown) => error instanceof Error && !error.message.includes("synthetic-secret"));
  }
  assert.throws(() => loadServerConfig({ ...valid, NODE_ENV: "production", ZHIXU_ALLOWED_ORIGINS: "https://example.invalid" }), /requires HTTPS/u);
  assert.throws(() => loadServerConfig({ ...valid, ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: "maybe" }), /must be true or false/u);
  assert.throws(() => loadServerConfig({ ...valid, ZHIXU_ATTACHMENT_STORAGE: "memory" }), /disabled or s3/u);
});

test("disposable MinIO S3 adapter and PostgreSQL AttachmentService round-trip", { timeout: 300_000 }, async (t) => {
  const minio = await startDisposableMinio();
  let postgres: Awaited<ReturnType<typeof startDisposablePostgres>> | null = null;
  let pool: pg.Pool | null = null;
  let sdk: S3Client | null = null;
  t.after(async () => {
    let failure: unknown;
    try { await pool?.end(); } catch (error) { failure = error; }
    try { await postgres?.stop(); } catch (error) { failure ??= error; }
    sdk?.destroy();
    try { await minio.stop(); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  });
  const config = { kind: "s3" as const, endpoint: minio.endpoint, region: minio.region, bucket: minio.bucket,
    accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey, forcePathStyle: true };
  const storage = new S3AttachmentStorage(config);
  const id = randomUUID();
  const key = `attachments/${id}/original`;
  const missing = `attachments/${randomUUID()}/original`;
  const bytes = Buffer.from("synthetic S3 attachment \u0000 exact bytes", "utf8");
  const stat = await storage.put(key, bytes, "application/octet-stream");
  assert.deepEqual(stat, { byteSize: bytes.length, sha256: sha(bytes) });
  assert.deepEqual(await storage.head(key), stat);
  assert.deepEqual(await storage.head(missing), null);
  assert.deepEqual(await storage.get(missing), null);
  const chunks: Buffer[] = [];
  for await (const chunk of (await storage.get(key))!) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks), bytes);
  sdk = new S3Client({ endpoint: minio.endpoint, region: minio.region, forcePathStyle: true,
    credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey } });
  const rawHead = await sdk.send(new HeadObjectCommand({ Bucket: minio.bucket, Key: key }));
  assert.equal(rawHead.ContentType, "application/octet-stream");
  assert.equal(rawHead.ContentLength, bytes.length);
  assert.equal(rawHead.Metadata?.sha256, sha(bytes));
  await assert.rejects(() => storage.put("attachments/user-filename/original", bytes, "application/octet-stream"), AttachmentStorageFailure);
  const wrongCredentials = new S3AttachmentStorage({ ...config, secretAccessKey: "wrong-test-secret" });
  await assert.rejects(() => wrongCredentials.head(key), AttachmentStorageFailure);
  const wrongBucket = new S3AttachmentStorage({ ...config, bucket: "nonexistent-test-bucket" });
  await assert.rejects(() => wrongBucket.head(key), AttachmentStorageFailure);
  const noNetwork = new S3AttachmentStorage({ ...config, endpoint: "http://127.0.0.1:1" });
  await assert.rejects(() => noNetwork.get(key), AttachmentStorageFailure);

  postgres = await startDisposablePostgres();
  pool = new pg.Pool({ connectionString: await postgres.createDatabase("q4c_s3") });
  await runMigrations(pool, "database/migrations");
  const row = (await pool.query<{ id: string; public_id: string }>(
    "INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES('q4c-synthetic',crypt('test',gen_salt('bf',4)),'Q4C','viewer',true) RETURNING id::text, public_id::text"
  )).rows[0];
  const actor: TrustedIdentity = { internalUserId: row.id, userId: row.public_id, username: "q4c-synthetic", userName: "Q4C",
    permissions: ["quote.view", "quote.edit", "quote.revision.update"] };
  const fixture = quoteSnapshotFromBrowser(createSyntheticQuoteFixture("q4c-s3"));
  for (const revision of fixture.revisions) {
    revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null;
    revision.garmentMedia = []; revision.quoteDocuments = [];
  }
  await createQuoteService(pool).createAggregate(fixture);
  const service = createAttachmentService(pool, storage);
  const pdf = Buffer.from("%PDF-1.4\nsynthetic test bytes\n");
  const uploaded = await service.upload(actor, fixture.id, fixture.defaultRevisionId, 1,
    { name: "synthetic.pdf", mimeType: "application/pdf", kind: "file", bytes: pdf, uploadToken: randomUUID() });
  assert.equal(uploaded.attachment.sha256, sha(pdf));
  const db = (await pool.query<{ storage_provider: string; storage_container: string; storage_key: string }>(
    "SELECT storage_provider,storage_container,storage_key FROM quote_attachments WHERE id=$1", [uploaded.attachment.id])).rows[0];
  assert.deepEqual([db.storage_provider, db.storage_container, db.storage_key],
    ["s3", minio.bucket, `attachments/${uploaded.attachment.id}/original`]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM quote_revision_attachments")).rows[0].n, 1);
  const downloaded = await service.download(actor, fixture.id, fixture.defaultRevisionId, uploaded.attachment.id);
  const received: Buffer[] = [];
  for await (const chunk of downloaded.stream) received.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(received), pdf);
  assert.equal(sha(Buffer.concat(received)), uploaded.attachment.sha256);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales_orders")).rows[0].n, 0);
  await storage.remove(key); // Isolated test only; runtime never invokes removal.
  assert.equal(await storage.head(key), null);
});

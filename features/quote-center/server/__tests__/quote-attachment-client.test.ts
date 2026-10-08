import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteAttachmentClient, QuoteAttachmentServerError, QuoteAttachmentTransportError } from "../quote-attachment-client";
import { createServerQuoteAttachmentController, PartialAttachmentBatchError } from "../../model/quote-attachment-controller";
import { createQuoteDraft, getDefaultRevision } from "../../model/quote-view-model";
import { advanceAttachmentRecord, mergeAttachmentMirror } from "../quote-attachment-draft";

const quoteId = "quote-1";
const revisionId = "revision-1";
const attachmentId = "e7e15fb1-d3e8-4b7f-b9b6-1db684d1e304";
const image = (id: string, position = 0, isStyleImage = false) => ({ id, name: `${id}.png`, originalName: `${id}.png`,
  mimeType: "image/png", size: 3, sha256: "hash", kind: "image" as const, createdAt: "2026-10-05T00:00:00Z",
  createdBy: "trusted-user", position, isStyleImage });

test("typed Q4A client sends exact mutation boundary, raw body and stable caller token", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const client = createQuoteAttachmentClient({ fetchImpl: async (url, init) => {
    seen.push({ url: String(url), init });
    if (String(url).endsWith("/download")) return new Response(new Blob(["abc"]), { status: 200 });
    if (init?.method === "POST") return Response.json({ attachment: image(attachmentId), version: 2, replayed: false }, { status: 201 });
    return Response.json({ attachments: [image(attachmentId)] });
  } });
  const file = new File(["abc"], "sample.png", { type: "image/png" });
  const token = "b5b87fc1-65b6-4e2b-a741-48d4686d84d2";
  const uploaded = await client.upload(quoteId, revisionId, 1, file, "image", token);
  assert.equal(uploaded.version, 2);
  assert.equal(seen[0].init?.body, file);
  const headers = seen[0].init?.headers as Record<string, string>;
  assert.equal(headers["Idempotency-Key"], token);
  assert.equal(headers["X-Quote-Version"], "1");
  assert.equal(headers["X-Zhixu-Request"], "1");
  assert.equal(seen[0].init?.credentials, "include");
  assert.equal((await client.list(quoteId, revisionId))[0].id, attachmentId);
  assert.equal((await client.download(quoteId, revisionId, attachmentId)).size, 3);
});

test("a deliberate retry can reuse one upload token without minting a new identity", async () => {
  const keys: string[] = [];
  const client = createQuoteAttachmentClient({ fetchImpl: async (_url, init) => {
    keys.push((init?.headers as Record<string, string>)["Idempotency-Key"]);
    return Response.json({ attachment: image(attachmentId), version: 2, replayed: keys.length > 1 }, { status: keys.length > 1 ? 200 : 201 });
  } });
  const file = new File(["abc"], "sample.png", { type: "image/png" });
  const token = "b5b87fc1-65b6-4e2b-a741-48d4686d84d2";
  await client.upload(quoteId, revisionId, 1, file, "image", token);
  const replay = await client.upload(quoteId, revisionId, 1, file, "image", token);
  assert.equal(replay.replayed, true);
  assert.deepEqual(keys, [token, token]);
});

test("Q4A errors remain typed by HTTP status/code; network outcome remains unknown", async () => {
  for (const [status, code] of [[401, "authentication_required"], [403, "permission_denied"], [404, "attachment_not_found"],
    [409, "quote_version_conflict"], [409, "quote_immutable_history"], [409, "upload_token_reused"],
    [503, "attachment_storage_not_configured"], [503, "attachment_object_unavailable"],
    [503, "attachment_upload_incomplete"], [503, "attachment_commit_ambiguous_check_status"]] as const) {
    const client = createQuoteAttachmentClient({ fetchImpl: async () => Response.json({ error: { code } }, { status }) });
    await assert.rejects(client.list(quoteId, revisionId), (error: unknown) => error instanceof QuoteAttachmentServerError && error.status === status && error.code === code);
  }
  const broken = createQuoteAttachmentClient({ fetchImpl: async () => { throw new Error("socket failed"); } });
  await assert.rejects(broken.list(quoteId, revisionId), QuoteAttachmentTransportError);
});

test("rename, link, unlink and style use typed commands and expected version", async () => {
  const calls: { method?: string; url: string; body?: string; header?: string }[] = [];
  const client = createQuoteAttachmentClient({ fetchImpl: async (url, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({ method: init?.method, url: String(url), body: String(init?.body), header: headers?.["X-Zhixu-Request"] });
    return Response.json({ result: {}, version: 4 });
  } });
  await client.rename(quoteId, revisionId, attachmentId, 3, "renamed.png");
  await client.link(quoteId, revisionId, attachmentId, 4);
  await client.unlink(quoteId, revisionId, attachmentId, 5);
  await client.style(quoteId, revisionId, 6, attachmentId);
  assert.deepEqual(calls.map((call) => call.method), ["PATCH", "POST", "DELETE", "PUT"]);
  assert.ok(calls.every((call) => call.header === "1"));
  assert.deepEqual(calls.map((call) => JSON.parse(call.body ?? "{}").expectedVersion), [3, 4, 5, 6]);
  assert.ok(calls[3].url.endsWith("/style-image"));
  assert.deepEqual(JSON.parse(calls[3].body ?? "{}"), { expectedVersion: 6, attachmentId });
});

test("sequential Server upload chains versions and mirrors without dropping unsaved draft", async () => {
  const quote = createQuoteDraft("quote-1", "QT-1", "2026-10-05");
  const original = getDefaultRevision(quote);
  original.revisionId = revisionId;
  original.baseInfo.styleName = "unsaved local draft";
  let record: import("../quote-server-editor-adapter").EditableServerQuoteRecord = { quote, expectedVersion: 1 };
  let baseline = structuredClone(quote);
  baseline.revisions[0].baseInfo.styleName = "saved baseline";
  const rows: ReturnType<typeof image>[] = [];
  const versions: number[] = [];
  const tokens: string[] = [];
  const fake = {
    list: async () => rows,
    upload: async (_q: string, _r: string, version: number, _file: File, _kind: string, token: string) => {
      versions.push(version); tokens.push(token);
      const item = image(`00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`, rows.length, rows.length === 0);
      rows.push(item);
      return { attachment: item, version: version + 1, replayed: false };
    },
  } as unknown as ReturnType<typeof createQuoteAttachmentClient>;
  const controller = createServerQuoteAttachmentController({ quoteId, revisionId, getVersion: () => record.expectedVersion,
    isSharedWithHistorical: () => false, client: fake, token: () => `token-${tokens.length + 1}`,
    onCommitted: (snapshot) => {
      record = advanceAttachmentRecord(record, revisionId, snapshot);
      baseline = mergeAttachmentMirror(baseline, revisionId, snapshot);
    } });
  const files = [new File(["1"], "one.png", { type: "image/png" }), new File(["2"], "two.png", { type: "image/png" })];
  assert.equal(await controller.upload(original, files, "image", "ignored", () => undefined), 2);
  assert.deepEqual(versions, [1, 2]);
  assert.deepEqual(tokens, ["token-1", "token-2"]);
  assert.equal(record.expectedVersion, 3);
  assert.equal(record.quote.revisions[0].baseInfo.styleName, "unsaved local draft");
  assert.equal(baseline.revisions[0].baseInfo.styleName, "saved baseline");
  assert.deepEqual(record.quote.revisions[0].imageAttachmentIds, rows.map((row) => row.id));
  assert.equal(record.quote.revisions[0].styleImageAttachmentId, rows[0].id);
});

test("partial batch is not presented as atomic rollback and historical shared rename is disabled", async () => {
  const quote = createQuoteDraft("quote-1", "QT-1", "2026-10-05");
  const revision = getDefaultRevision(quote);
  let version = 1;
  let calls = 0;
  const rows: ReturnType<typeof image>[] = [];
  const fake = { list: async () => rows, upload: async () => {
    calls += 1;
    if (calls === 2) throw new QuoteAttachmentServerError(503, "attachment_commit_ambiguous_check_status");
    const item = image(attachmentId, 0, true); rows.push(item);
    return { attachment: item, version: 2, replayed: false };
  } } as unknown as ReturnType<typeof createQuoteAttachmentClient>;
  const controller = createServerQuoteAttachmentController({ quoteId, revisionId, getVersion: () => version,
    isSharedWithHistorical: (id) => id === attachmentId, client: fake,
    onCommitted: (snapshot) => { version = snapshot.version ?? version; } });
  await assert.rejects(controller.upload(revision, [new File(["a"], "a.png"), new File(["b"], "b.png")], "image", "", () => undefined),
    (error: unknown) => error instanceof PartialAttachmentBatchError && error.completed === 1 && error.cause instanceof QuoteAttachmentServerError);
  assert.equal(version, 2);
  assert.equal(controller.canRename(attachmentId), false);
  await assert.rejects(controller.rename(revision, image(attachmentId), "new.png"), /历史 Revision/);
});

test("409 leaves an unrelated dirty Quote draft unchanged and never reloads implicitly", async () => {
  const quote = createQuoteDraft("quote-1", "QT-1", "2026-10-05");
  const revision = getDefaultRevision(quote);
  revision.baseInfo.styleName = "unsaved";
  let committed = 0;
  let reads = 0;
  const fake = { list: async () => { reads += 1; return []; }, style: async () => { throw new QuoteAttachmentServerError(409, "quote_version_conflict"); } } as unknown as ReturnType<typeof createQuoteAttachmentClient>;
  const controller = createServerQuoteAttachmentController({ quoteId, revisionId: revision.revisionId,
    getVersion: () => 1, isSharedWithHistorical: () => false, client: fake, onCommitted: () => { committed += 1; } });
  await assert.rejects(controller.style(revision, null), (error: unknown) => error instanceof QuoteAttachmentServerError && error.code === "quote_version_conflict");
  assert.equal(revision.baseInfo.styleName, "unsaved");
  assert.equal(committed, 0);
  assert.equal(reads, 0);
});

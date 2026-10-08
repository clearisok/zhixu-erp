import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticQuoteFixture } from "../../../../server/integration/quote-fixture";
import { parseQuoteAuthority, validateQuoteAuthority, isServerQuoteRoute } from "../../authority/quote-authority";
import { createQuoteEditorPersistence } from "../quote-editor-persistence";
import type { QuoteServerEditorAdapter } from "../quote-server-editor-adapter";

test("explicit Quote authority defaults Browser, rejects illegal combinations, isolates unsupported routes", () => {
  assert.equal(parseQuoteAuthority(), "browser");
  assert.equal(parseQuoteAuthority("server"), "server");
  assert.throws(() => parseQuoteAuthority("unknown"));
  assert.throws(() => validateQuoteAuthority("server", "browser", "writable"));
  assert.throws(() => validateQuoteAuthority("server", "server", "frozen"));
  validateQuoteAuthority("server", "server", "writable");
  for (const path of ["/quote-center", "/quote-center/new", "/quote-center/detail", "/basic-settings/brands"]) assert.ok(isServerQuoteRoute(path));
  for (const path of ["/order-center", "/closing-center", "/production-scheduling", "/system-settings/data-management"]) assert.equal(isServerQuoteRoute(path), false);
});

test("per-editor version advances after confirmed saves; concurrent writes rejected without Browser fallback", async () => {
  const quote = createSyntheticQuoteFixture("persistence-synthetic");
  let release!: () => void;
  const wait = new Promise<void>((done) => { release = done; });
  const versions: number[] = [];
  const adapter: QuoteServerEditorAdapter = {
    async load() { throw new Error("not used"); },
    async save(next, expectedVersion) { versions.push(expectedVersion); await wait; return { quote: structuredClone(next), expectedVersion: expectedVersion + 1 }; },
  };
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 1 }, adapter);
  const first = persistence.save(quote);
  await assert.rejects(persistence.save(quote));
  release(); await first;
  assert.equal(persistence.getVersion(), 2);
  const revision = structuredClone(quote.revisions.find((r) => r.revisionId === quote.defaultRevisionId)!);
  revision.imageAttachmentIds = ["new-server-attachment"];
  persistence.acceptAttachment({ revision, attachments: [], version: 3 });
  assert.equal(persistence.getVersion(), 3);
  assert.equal(persistence.getBaseline().revisions.find((r) => r.revisionId === quote.defaultRevisionId)!.imageAttachmentIds[0], "new-server-attachment");
  await persistence.save(persistence.getBaseline());
  assert.deepEqual(versions, [1, 3]);
});

test("409/network failure keeps prior baseline/version and dirty draft; no automatic retry", async () => {
  const quote = createSyntheticQuoteFixture("persistence-conflict");
  let calls = 0;
  const adapter: QuoteServerEditorAdapter = {
    async load() { throw new Error("not used"); },
    async save() { calls++; throw Object.assign(new Error("Synthetic conflict"), { status: 409 }); },
  };
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 7 }, adapter);
  const draft = structuredClone(quote);
  draft.revisions[0].baseInfo.note = "Unsaved synthetic draft";
  await assert.rejects(persistence.save(draft), { status: 409 });
  assert.deepEqual(persistence.getBaseline(), quote);
  assert.equal(persistence.getVersion(), 7);
  assert.equal(draft.revisions[0].baseInfo.note, "Unsaved synthetic draft");
  await assert.rejects(persistence.save(draft));
  assert.equal(calls, 1);
});

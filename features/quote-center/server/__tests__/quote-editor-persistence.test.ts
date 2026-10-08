import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticQuoteFixture } from "../../../../server/integration/quote-fixture";
import { parseQuoteAuthority, validateQuoteAuthority, isServerQuoteRoute } from "../../authority/quote-authority";
import { createQuoteEditorPersistence } from "../quote-editor-persistence";
import type { QuoteServerEditorAdapter } from "../quote-server-editor-adapter";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { assertRuntimeBuildIdentity } from "../../../../server/build-identity";
import type { QuoteAttachmentController } from "../../model/quote-attachment-controller";
import { quoteServerClient } from "../quote-server-client";
import { quoteSnapshotFromBrowser } from "../../../../server/quotes/model";

test("compiled Quote authority and runtime must agree; malformed identity/illegal master combination reject", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quote-authority-test-"));
  const identity = { gitCommit: "a".repeat(40), buildId: "synthetic", buildTime: "2026-10-08T10:00:00+08:00", masterSettingsAuthority: "server", identityMode: "session", quoteWriterMode: "writable", quoteAuthority: "server" };
  const environment = { ZHIXU_GIT_COMMIT: identity.gitCommit, ZHIXU_BUILD_ID: identity.buildId, ZHIXU_BUILD_TIME: identity.buildTime, NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY: "server", ZHIXU_IDENTITY_MODE: "session", NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY: "server" };
  try {
    await writeFile(join(directory, "build-info.json"), JSON.stringify(identity));
    assert.equal((await assertRuntimeBuildIdentity(directory, "server", environment)).quoteAuthority, "server");
    await assert.rejects(assertRuntimeBuildIdentity(directory, "server", { ...environment, NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY: "browser" }));
    for (const quoteAuthority of [null, false, 0, "unknown"]) {
      await writeFile(join(directory, "build-info.json"), JSON.stringify({ ...identity, quoteAuthority }));
      await assert.rejects(assertRuntimeBuildIdentity(directory, "server", environment));
    }
    await writeFile(join(directory, "build-info.json"), JSON.stringify({ ...identity, masterSettingsAuthority: "browser" }));
    await assert.rejects(assertRuntimeBuildIdentity(directory, undefined, environment));
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes("quote-authority-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});

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

test("attachment/aggregate share the write lock; uncertain attachment failure preserves baseline and blocks retry", async () => {
  const quote = createSyntheticQuoteFixture("persistence-attachment-lock");
  let release!: () => void;
  const wait = new Promise<void>(done => { release = done; });
  const versions: number[] = [];
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 1 }, {
    async load() { throw new Error("not used"); },
    async save(next, expectedVersion) { versions.push(expectedVersion); return { quote: structuredClone(next), expectedVersion: expectedVersion + 1 }; },
  });
  let unlinkCalls = 0;
  const raw: QuoteAttachmentController = {
    mode: "server", load: async () => [], get: async () => null, blob: async () => null, canRename: () => true,
    upload: async () => { throw new Error("not used"); }, rename: async () => { throw new Error("not used"); },
    async style(revision) {
      await wait;
      const snapshot = { revision: { ...revision, styleImageAttachmentId: null }, attachments: [], version: 2 };
      persistence.acceptAttachment(snapshot);
      return snapshot;
    },
    async unlink() { unlinkCalls++; throw new Error("Synthetic transport outcome unknown"); },
  };
  const controller = persistence.coordinate(raw);
  const command = controller.style(quote.revisions[0], null);
  await assert.rejects(persistence.save(quote));
  release(); await command;
  assert.equal(persistence.getVersion(), 2);
  await persistence.save(persistence.getBaseline());
  assert.deepEqual(versions, [2]);
  const before = persistence.getBaseline();
  await assert.rejects(controller.unlink(quote.revisions[0], "synthetic-id"));
  assert.equal(persistence.getVersion(), 3);
  assert.deepEqual(persistence.getBaseline(), before);
  await assert.rejects(persistence.save(quote));
  await assert.rejects(controller.unlink(quote.revisions[0], "synthetic-id"));
  assert.equal(unlinkCalls, 1);
  assert.deepEqual(versions, [2]);
});

test("version commands share save/attachment lock, use latest confirmed version and block after uncertainty", async () => {
  const quote = createSyntheticQuoteFixture("version-write-lock");
  let release!: () => void;
  const wait = new Promise<void>(done => { release = done; });
  const versions: number[] = [];
  let calls = 0;
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 4 }, {
    async load() { throw new Error("not used"); },
    async save(next, expectedVersion) { return { quote: next, expectedVersion: expectedVersion + 1 }; },
  }, { ...quoteServerClient, async versionWorkflow(_id, command) {
    calls++; versions.push(command.expectedVersion);
    if (calls > 1) throw new Error("Uncertain transport outcome");
    await wait;
    return { quote: quoteSnapshotFromBrowser(quote), version: command.expectedVersion + 1 };
  } });
  await persistence.save(quote);
  const command = { action: "revision.create" as const, sourceRevisionId: quote.defaultRevisionId, reason: "其他" as const, note: "" };
  const pending = persistence.workflow(command);
  await assert.rejects(persistence.workflow(command));
  await assert.rejects(persistence.save(quote));
  const reject = async () => { throw new Error("must not be called"); };
  const raw: QuoteAttachmentController = { mode: "server", style: reject, load: reject, get: reject, blob: reject, upload: reject, rename: reject, unlink: reject, canRename: () => false };
  await assert.rejects(persistence.coordinate(raw).style(quote.revisions[0], null));
  release(); await pending;
  assert.equal(persistence.getVersion(), 6);
  const before = persistence.getBaseline();
  await assert.rejects(persistence.workflow(command));
  await assert.rejects(persistence.workflow(command));
  await assert.rejects(persistence.save(quote));
  assert.equal(calls, 2); assert.deepEqual(versions, [5, 6]);
  assert.equal(persistence.getVersion(), 6); assert.deepEqual(persistence.getBaseline(), before);
});

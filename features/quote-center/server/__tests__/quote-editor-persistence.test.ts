import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticQuoteFixture } from "../../../../server/integration/quote-fixture";
import { parseQuoteAuthority, validateQuoteAuthority, isEnabledServerRoute } from "../../authority/quote-authority";
import { createQuoteEditorPersistence } from "../quote-editor-persistence";
import type { QuoteServerEditorAdapter } from "../quote-server-editor-adapter";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { assertRuntimeBuildIdentity } from "../../../../server/build-identity";
import type { QuoteAttachmentController } from "../../model/quote-attachment-controller";
import { quoteServerClient } from "../quote-server-client";
import { quoteSnapshotFromBrowser } from "../../../../server/quotes/model";
import { getDefaultRevision } from "../../model/quote-view-model";
import { applyCostSyncDecisions, createCostSyncCandidates } from "../../model/price-version-cost-sync";
import { confirmedCommercialTermsServerClient } from "../../../confirmed-commercial-terms/client";

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
  for (const path of ["/quote-center", "/quote-center/new", "/quote-center/detail", "/basic-settings/brands"]) assert.ok(isEnabledServerRoute(path));
  for (const path of ["/order-center", "/closing-center", "/production-scheduling", "/system-settings/data-management"]) assert.equal(isEnabledServerRoute(path), false);
  const previous = process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ;
  try {
    process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ = "snapshot";
    for (const path of ["/order-center", "/production-scheduling"]) assert.ok(isEnabledServerRoute(path));
    for (const path of ["/closing-center", "/system-settings/data-management"]) assert.equal(isEnabledServerRoute(path), false);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ; else process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ = previous; }
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

test("linked terms shares editor lock, binds Quote CAS, and does not advance aggregate baseline/version", async () => {
  const quote = createSyntheticQuoteFixture("linked-persistence");
  const revision = getDefaultRevision(quote), price = revision.priceVersions[0];
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  let calls = 0;
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 7 }, undefined, undefined, { ...confirmedCommercialTermsServerClient,
    async updateByQuote(quoteId, revisionId, priceVersionId, input) {
      calls++; assert.equal(input.expectedVersion, 0); assert.equal(input.expectedQuoteVersion, 7);
      assert.equal(input.confirmedLaborPrice, "1.23456789"); await gate;
      return { linkage: "linked", scope: "quote", quoteProvenance: { quoteId, revisionId, priceVersionId }, associatedSalesOrderIds: ["synthetic-order"], current: null, verifiedQuoteVersion: 7 };
    },
  });
  const write = persistence.linkedConfirmation({ revisionId: revision.revisionId, priceVersionId: price.id, expectedQuoteVersion: 7 }, { expectedVersion: 0, customerConfirmedPrice: "0", confirmedLaborPrice: "1.23456789", laborCurrency: "CNY" });
  await assert.rejects(persistence.save(quote));
  await assert.rejects(persistence.workflow({ action: "price.delete", revisionId: revision.revisionId, priceVersionId: price.id }));
  release(); await write;
  assert.equal(calls, 1); assert.equal(persistence.getVersion(), 7); assert.deepEqual(persistence.getBaseline(), quote);
});

test("linked conflict/unknown outcome preserves exact input and blocks replay; stale captured Quote CAS makes no request", async () => {
  for (const status of [409, 0]) {
    const quote = createSyntheticQuoteFixture(`linked-failure-${status}`);
    const revision = getDefaultRevision(quote), price = revision.priceVersions[0]; let calls = 0;
    const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 7 }, undefined, undefined, { ...confirmedCommercialTermsServerClient,
      async updateByQuote() { calls++; throw Object.assign(new Error("Synthetic unknown result"), { status }); },
    });
    const target = { revisionId: revision.revisionId, priceVersionId: price.id, expectedQuoteVersion: 7 };
    const input = { expectedVersion: 3, customerConfirmedPrice: "0", confirmedLaborPrice: "1.23456789", laborCurrency: "CNY" as const };
    await assert.rejects(persistence.linkedConfirmation(target, input), { status });
    assert.deepEqual(input, { expectedVersion: 3, customerConfirmedPrice: "0", confirmedLaborPrice: "1.23456789", laborCurrency: "CNY" });
    await assert.rejects(persistence.linkedConfirmation(target, input));
    assert.equal(calls, 1); assert.equal(persistence.getVersion(), 7); assert.deepEqual(persistence.getBaseline(), quote);
    const stale = createQuoteEditorPersistence({ quote, expectedVersion: 8 }, undefined, undefined, { ...confirmedCommercialTermsServerClient, async updateByQuote() { calls++; throw new Error("must not call"); } });
    await assert.rejects(stale.linkedConfirmation(target, input)); assert.equal(calls, 1);
  }
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

function syncDraft(scope: "all" | "current") {
  const quote = createSyntheticQuoteFixture("sync-persistence");
  const baseline = getDefaultRevision(quote);
  baseline.priceVersions.forEach(p => { p.fabrics = [{ ...p.fabrics[0], unitPrice: 10, independentFields: undefined }]; });
  const changed = structuredClone(baseline); changed.priceVersions[0].fabrics[0].unitPrice = 22;
  const candidates = createCostSyncCandidates(baseline, changed, changed.priceVersions[0].id);
  const applied = applyCostSyncDecisions(changed, candidates, Object.fromEntries(candidates.map(c => [c.id, { scope, selectedVersionIds: [c.sourcePriceVersionId] }])));
  return { quote, draft: { ...quote, revisions: quote.revisions.map(r => r.revisionId === baseline.revisionId ? applied.revision : r) } };
}
for (const scope of ["all", "current"] as const) for (const failure of ["409", "network"] as const) test(`applied cost-sync ${scope} draft survives ${failure}; baseline/version stay blocked`, async () => {
  const { quote, draft } = syncDraft(scope);
  let calls = 0, commands = 0;
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 7 }, {
    async load() { throw new Error("not used"); },
    async save(value, version) {
      calls++; assert.equal(version, 7);
      assert.deepEqual(getDefaultRevision(value).priceVersions.map(p => p.fabrics[0].unitPrice), scope === "all" ? [22, 22] : [22, 10]);
      throw failure === "409" ? Object.assign(new Error("Synthetic conflict"), { status: 409 }) : new Error("Synthetic transport uncertainty");
    },
  }, { ...quoteServerClient, async versionWorkflow() { commands++; throw new Error("must not run"); } });
  await assert.rejects(persistence.save(draft));
  assert.equal(persistence.getVersion(), 7); assert.deepEqual(persistence.getBaseline(), quote);
  assert.deepEqual(getDefaultRevision(draft).priceVersions.map(p => p.fabrics[0].unitPrice), scope === "all" ? [22, 22] : [22, 10]);
  if (scope === "current") assert.ok(getDefaultRevision(draft).priceVersions[0].fabrics[0].independentFields?.includes("unitPrice"));
  await assert.rejects(persistence.save(draft));
  await assert.rejects(persistence.workflow({ action: "revision.create", sourceRevisionId: quote.defaultRevisionId, reason: "其他", note: "" }));
  assert.equal(calls, 1); assert.equal(commands, 0);
});
test("successful cost-sync advances version and adopts the authoritative Server baseline", async () => {
  const { quote, draft } = syncDraft("all");
  const response = structuredClone(draft); getDefaultRevision(response).baseInfo.note = "Server response";
  const persistence = createQuoteEditorPersistence({ quote, expectedVersion: 7 }, {
    async load() { throw new Error("not used"); },
    async save() { return { quote: response, expectedVersion: 8 }; },
  });
  const saved = await persistence.save(draft);
  assert.equal(saved.expectedVersion, 8); assert.equal(persistence.getVersion(), 8);
  assert.deepEqual(persistence.getBaseline(), response);
});

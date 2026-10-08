import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockQuoteRepository } from "../repository/mock-quote-repository.ts";
import { browserLocalDataStore } from "../../data-management/repository/local-data-store.ts";
import { parseQuoteWriterMode } from "../authority/quote-writer-mode.ts";
import { exportLocalDataBackup, initializeLocalDataLifecycle, restoreValidatedLocalDataBackup,
  resetAllLocalBusinessData, RESET_ALL_LOCAL_DATA_CONFIRMATION } from "../../data-management/service/data-management-service.ts";
import { browserQuoteAttachmentController as attachments, deleteBrowserQuoteAttachment } from "../model/quote-attachment-controller.ts";
import { indexedDbAttachmentRepository } from "../repository/indexeddb-attachment-repository.ts";

class Storage {
  values = new Map<string, string>();
  writes: string[] = [];
  get length() { return this.values.size; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes.push(key); this.values.set(key, value); }
  removeItem(key: string) { this.writes.push(key); this.values.delete(key); }
}
const runtime = globalThis as typeof globalThis & { __ZHIXU_BUILD_INFO__?: unknown };
test("Quote mode defaults writable and rejects invalid values", () => {
  assert.equal(parseQuoteWriterMode(undefined), "writable");
  assert.equal(parseQuoteWriterMode("frozen"), "frozen");
  assert.throws(() => parseQuoteWriterMode("server"), /invalid_quote_writer_mode/);
});

test("frozen Browser repository, attachments and full export preserve synthetic source bytes", async () => {
  const oldWindow = globalThis.window, oldInfo = runtime.__ZHIXU_BUILD_INFO__;
  const storage = new Storage(), legacy = new Storage();
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: legacy, indexedDB,
    location: { origin: "http://127.0.0.1:49123", hostname: "127.0.0.1", port: "49123" } } });
  runtime.__ZHIXU_BUILD_INFO__ = { masterSettingsAuthority: "browser", quoteWriterMode: "writable" };
  try {
    const repository = createMockQuoteRepository();
    const quotes = await repository.list();
    assert.ok(quotes.length);
    const key = browserLocalDataStore.key("quotes");
    const raw = storage.getItem(key)!;
    const asset = await indexedDbAttachmentRepository.save(new File(["synthetic attachment"], "sample.txt", { type: "text/plain" }),
      { id: "q5c-synthetic-asset", kind: "file", createdAt: "2026-10-07T00:00:00Z", createdBy: "synthetic" });
    legacy.setItem("zhixu.quote-center.slice-1.2", "legacy untouched sentinel");
    storage.writes = []; legacy.writes = [];
    runtime.__ZHIXU_BUILD_INFO__ = { masterSettingsAuthority: "server", quoteWriterMode: "frozen" };
    assert.deepEqual(await repository.list(), quotes);
    assert.deepEqual(await repository.getById(quotes[0].id), quotes[0]);
    assert.equal(storage.getItem(key), raw);
    assert.equal(storage.writes.length, 0);
    for (const action of [() => repository.save(quotes[0]), () => repository.delete(quotes[0].id),
      () => repository.createDraft("2026-10-07"), () => repository.copyFromDefaultRevision(quotes[0].id, {} as never)])
      await assert.rejects(action, /quote_browser_writer_frozen/);
    const revision = quotes[0].revisions[0];
    for (const action of [() => attachments.upload(revision, [], "image", "synthetic", () => {}),
      () => attachments.rename(revision, {} as never, "name"), () => attachments.unlink(revision, "id"),
      () => attachments.style(revision, null), () => attachments.style(revision, "id"), () => deleteBrowserQuoteAttachment("id")])
      await assert.rejects(action, /quote_browser_writer_frozen/);
    assert.equal(attachments.canRename("id"), false);
    assert.equal(await attachments.blob("absent"), null);
    assert.equal(await attachments.get("absent"), null);
    assert.deepEqual(await attachments.get(asset.id), { ...asset, legacyUrl: undefined });
    assert.equal(await (await attachments.blob(asset.id))?.text(), "synthetic attachment");
    await assert.rejects(deleteBrowserQuoteAttachment(asset.id), /quote_browser_writer_frozen/);
    assert.equal(await (await attachments.blob(asset.id))?.text(), "synthetic attachment");
    // Unrelated domains are still initialized; the canonical Quote and legacy key are untouched.
    await initializeLocalDataLifecycle();
    assert.ok(storage.writes.length > 0);
    assert.equal(storage.writes.includes(key), false);
    const backup = await exportLocalDataBackup();
    assert.equal(backup.backupVersion, 1);
    assert.equal(backup.schemaVersion, 13);
    assert.equal(backup.localRecords[key], raw);
    assert.equal(storage.getItem(key), raw);
    assert.equal(legacy.writes.length, 0);
    assert.equal(legacy.getItem("zhixu.quote-center.slice-1.2"), "legacy untouched sentinel");
    assert.deepEqual(await indexedDbAttachmentRepository.list([]), []);
    // Independent of Q3 authority, restore/reset must reject before any work.
    runtime.__ZHIXU_BUILD_INFO__ = { masterSettingsAuthority: "browser", quoteWriterMode: "frozen" };
    await assert.rejects(restoreValidatedLocalDataBackup(backup), /quote_browser_writer_frozen/);
    await assert.rejects(resetAllLocalBusinessData(RESET_ALL_LOCAL_DATA_CONFIRMATION), /quote_browser_writer_frozen/);
    for (const invalid of [null, "broken", JSON.stringify([]), raw.replace('"schemaVersion":13', '"schemaVersion":12'),
      JSON.stringify({ ...JSON.parse(raw), data: [{ id: "incomplete" }] })]) {
      if (invalid === null) storage.values.delete(key); else storage.values.set(key, invalid);
      const writes: number = storage.writes.length;
      await assert.rejects(repository.list(), /报价冻结源不可安全读取/);
      assert.equal(storage.getItem(key), invalid);
      assert.equal(storage.writes.length, writes);
      assert.equal(legacy.writes.length, 0);
    }
  } finally { Object.assign(globalThis, { window: oldWindow }); runtime.__ZHIXU_BUILD_INFO__ = oldInfo; }
});

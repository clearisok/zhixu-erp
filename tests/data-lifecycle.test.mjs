import assert from "node:assert/strict";
import test from "node:test";

import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";
import {
  createMockQuoteRepository,
  LEGACY_QUOTE_STORAGE_KEY,
} from "../features/quote-center/repository/mock-quote-repository.ts";
import {
  createLocalDataStore,
  LocalDataCorruptionError,
  TEST_LOCAL_DATA_NAMESPACE,
} from "../features/data-management/repository/local-data-store.ts";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

const createStore = (storage, namespace = "zhixu.erp.dev-test") => createLocalDataStore({
  storage,
  namespace,
  environment: namespace === TEST_LOCAL_DATA_NAMESPACE ? "test" : "development",
  now: () => "2026-08-25T10:00:00.000Z",
});

test("已有数据重新初始化时保持不变，Seed 不覆盖用户数据", () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  const userData = [{ id: "user-record", name: "长期验收数据", customField: "keep-me" }];
  store.save("records", userData);
  let seedCalls = 0;
  const loaded = store.initialize("records", { seed: () => { seedCalls += 1; return [{ id: "seed" }]; } });
  assert.deepEqual(loaded, userData);
  assert.equal(seedCalls, 0);
});

test("空数据空间首次启动只写入一次 Seed", () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  let seedCalls = 0;
  const initialize = () => store.initialize("records", { seed: () => { seedCalls += 1; return [{ id: "seed-1" }]; } });
  assert.deepEqual(initialize(), [{ id: "seed-1" }]);
  assert.deepEqual(initialize(), [{ id: "seed-1" }]);
  assert.equal(seedCalls, 1);
});

test("旧 schema 向前迁移保留 ID、业务字段和未知字段", () => {
  const storage = new MemoryStorage();
  const namespace = "zhixu.erp.migration-test";
  storage.setItem(`${namespace}.quotes`, JSON.stringify({ id: "quote-old", styleNo: "T2337", unknownFutureValue: "preserve" }));
  const store = createStore(storage, namespace);
  const migrated = store.initialize("quotes", {
    seed: () => ({ id: "seed" }),
    migrate: (value) => ({ ...value, salespersonId: value.salespersonId ?? null }),
  });
  assert.deepEqual(migrated, { id: "quote-old", styleNo: "T2337", unknownFutureValue: "preserve", salespersonId: null });
});

test("Migration 重复执行幂等，不重复破坏或替换数据", () => {
  const storage = new MemoryStorage();
  const namespace = "zhixu.erp.idempotent-test";
  storage.setItem(`${namespace}.records`, JSON.stringify({ id: "stable" }));
  const store = createStore(storage, namespace);
  let migrationCalls = 0;
  const migrate = (value) => { migrationCalls += 1; return { ...value, nullableField: value.nullableField ?? null }; };
  const first = store.initialize("records", { seed: () => ({ id: "stable" }), migrate });
  const second = store.initialize("records", { seed: () => ({ id: "different-seed" }), migrate });
  assert.deepEqual(first, second);
  assert.equal(first.id, "stable");
  assert.equal(migrationCalls, 2);
});

test("测试清理只清 test namespace，不影响 dev namespace", () => {
  const storage = new MemoryStorage();
  const devStore = createStore(storage, "zhixu.erp.dev");
  const testStore = createStore(storage, TEST_LOCAL_DATA_NAMESPACE);
  devStore.save("quotes", [{ id: "dev-quote" }]);
  testStore.save("quotes", [{ id: "test-quote" }]);
  testStore.clearNamespace();
  assert.deepEqual(devStore.initialize("quotes", { seed: () => [] }), [{ id: "dev-quote" }]);
  assert.deepEqual(testStore.initialize("quotes", { seed: () => [] }), []);
});

test("legacy sessionStorage 报价迁移到稳定 localStorage 并保留 Revision、PriceVersion 和 EstimateCost", async () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const legacyQuote = structuredClone(quoteFixtures[0]);
  legacyQuote.activeEstimateCost = { id: "estimate-active", quoteId: legacyQuote.id, status: "active" };
  legacyQuote.estimateCostHistory = [{ id: "estimate-history", quoteId: legacyQuote.id, status: "superseded" }];
  sessionStorage.setItem(LEGACY_QUOTE_STORAGE_KEY, JSON.stringify([legacyQuote]));
  const store = createStore(localStorage, "zhixu.erp.quote-migration-test");
  const repository = createMockQuoteRepository({ store, legacySessionStorage: sessionStorage });
  const [migrated] = await repository.list();
  assert.equal(migrated.id, legacyQuote.id);
  assert.equal(migrated.revisions[0].revisionId, legacyQuote.revisions[0].revisionId);
  assert.equal(migrated.revisions[0].priceVersions[0].id, legacyQuote.revisions[0].priceVersions[0].id);
  assert.equal(migrated.activeEstimateCost.id, "estimate-active");
  assert.equal(migrated.estimateCostHistory[0].id, "estimate-history");
  assert.ok(localStorage.getItem(store.key("quotes")), "迁移后应立即写入稳定 localStorage");
});

test("另一标签页已经初始化 Seed 后，原标签页的 legacy session 报价仍会非破坏合并", async () => {
  const localStorage = new MemoryStorage();
  const emptySession = new MemoryStorage();
  const originalQuoteSession = new MemoryStorage();
  const store = createStore(localStorage, "zhixu.erp.multi-tab-test");
  const firstTabRepository = createMockQuoteRepository({ store, legacySessionStorage: emptySession });
  await firstTabRepository.list();

  const userQuote = structuredClone(quoteFixtures[0]);
  userQuote.revisions[0].baseInfo.styleName = "用户长期验收款式";
  const customQuote = { ...structuredClone(quoteFixtures[1]), id: "quote-user-created", quoteCode: "QT-USER-CREATED" };
  originalQuoteSession.setItem(LEGACY_QUOTE_STORAGE_KEY, JSON.stringify([userQuote, customQuote]));
  const originalTabRepository = createMockQuoteRepository({ store, legacySessionStorage: originalQuoteSession });
  const merged = await originalTabRepository.list();
  assert.equal(merged.find((quote) => quote.id === userQuote.id).revisions[0].baseInfo.styleName, "用户长期验收款式");
  assert.ok(merged.some((quote) => quote.id === "quote-user-created"));
  assert.equal(originalQuoteSession.getItem(LEGACY_QUOTE_STORAGE_KEY), null, "合并成功后才移除当前标签页 legacy key");
});

test("附件 metadata 与 Revision 引用迁移后仍有效", async () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const legacyQuote = structuredClone(quoteFixtures[0]);
  legacyQuote.revisions[0].imageAttachmentIds = ["attachment-image-1"];
  legacyQuote.revisions[0].fileAttachmentIds = ["attachment-file-1"];
  legacyQuote.revisions[0].styleImageAttachmentId = "attachment-image-1";
  sessionStorage.setItem(LEGACY_QUOTE_STORAGE_KEY, JSON.stringify([legacyQuote]));
  const store = createStore(localStorage, "zhixu.erp.attachment-reference-test");
  store.save("attachment-metadata-test", [{ id: "attachment-image-1", storageKey: "attachments/attachment-image-1", unknownMetadata: "keep" }]);
  const repository = createMockQuoteRepository({ store, legacySessionStorage: sessionStorage });
  const [migrated] = await repository.list();
  assert.deepEqual(migrated.revisions[0].imageAttachmentIds, ["attachment-image-1"]);
  assert.deepEqual(migrated.revisions[0].fileAttachmentIds, ["attachment-file-1"]);
  assert.equal(migrated.revisions[0].styleImageAttachmentId, "attachment-image-1");
  assert.equal(store.initialize("attachment-metadata-test", { seed: () => [] })[0].unknownMetadata, "keep");
});

test("损坏的稳定数据不会被 Seed 静默覆盖", () => {
  const storage = new MemoryStorage();
  const namespace = "zhixu.erp.corruption-test";
  storage.setItem(`${namespace}.records`, "{broken-json");
  const store = createStore(storage, namespace);
  assert.throws(() => store.initialize("records", { seed: () => [{ id: "seed" }] }), LocalDataCorruptionError);
  assert.equal(storage.getItem(`${namespace}.records`), "{broken-json");
});

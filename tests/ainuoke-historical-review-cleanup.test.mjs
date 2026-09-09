import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createLocalDataStore } from "../features/data-management/repository/local-data-store.ts";
import { operationLogCategory } from "../features/operation-logs/model/operation-log-presentation.ts";
import { createOperationLogRepository } from "../features/operation-logs/repository/operation-log-repository.ts";
import { createAinuokeRepository } from "../features/ainuoke-sync/repository/ainuoke-repository.ts";
import {
  cleanupObsoleteHistoricalReviews,
  commitObsoleteHistoricalReviewCleanup,
  countObsoleteHistoricalReviews,
} from "../features/ainuoke-sync/service/ainuoke-historical-review-cleanup.ts";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

const now = "2026-09-09T13:00:00.000Z";
const actor = { userId: "user-admin", userName: "系统管理员" };
const review = (id, kind, resolvedAt = null) => ({
  id,
  kind,
  sourceKey: `source-${id}`,
  salesContractNo: kind === "order_match" || kind === "data_anomaly" ? "SC-KEEP" : null,
  candidateOrderIds: [`candidate-${id}`],
  reason: `reason-${id}`,
  resolvedAt,
  resolvedBy: resolvedAt ? "历史处理人" : null,
  createdAt: "2026-08-31T00:00:00.000Z",
});
const contract = {
  sourceKind: "excel",
  sourceFile: "sales.xlsx",
  sourceSheet: "sales",
  sourceRow: 2,
  sourceHash: "contract-hash",
  salesContractNo: "SC-KEEP",
  statusRaw: "",
  companyName: "公司",
  customerName: "客户",
  brandRaw: "品牌",
  brandNormalized: "品牌",
  styleNoRaw: "STYLE-1",
  strictStyleKey: "STYLE-1",
  baseStyleKey: "STYLE-1",
  factoryStyleNo: "FACTORY-1",
  poNo: "",
  quantity: 10,
  contractDate: "2026-08-31",
  contractDeliveryDate: "2026-10-01",
  colorRows: [],
  colorLines: [],
  deliveryLines: [],
  colorQuantity: 10,
  quantityDifference: 0,
  validationStatus: "valid",
  boundOrderId: "order-keep",
  lastDisposition: "synced",
  syncedAt: "2026-08-31T00:00:00.000Z",
};
const importRun = {
  id: "run-keep",
  sourceFiles: ["sales.xlsx"],
  sourceHashes: ["contract-hash"],
  sourceKind: "excel",
  mode: "commit",
  contractsSeen: 1,
  contractsChanged: 1,
  colorRowsSeen: 0,
  mismatchCount: 0,
  autoBoundCount: 0,
  reviewCount: 0,
  autoCreatedCount: 0,
  duplicatePreventedCount: 0,
  scheduleCount: 1,
  closingCount: 1,
  correctedDateCount: 0,
  createdAt: "2026-08-31T00:00:00.000Z",
  createdBy: "历史导入",
};
const state = () => ({
  contracts: [structuredClone(contract)],
  importRuns: [structuredClone(importRun)],
  reviews: [
    review("schedule-open", "schedule_match"),
    review("order-open", "order_match"),
    review("closing-open", "closing_match"),
    review("anomaly-open", "data_anomaly"),
    review("schedule-resolved", "schedule_match", "2026-09-01T00:00:00.000Z"),
    review("closing-resolved", "closing_match", "2026-09-01T00:01:00.000Z"),
  ],
});

test("cleanup only removes unresolved schedule_match and closing_match reviews immutably", () => {
  const input = state();
  const before = structuredClone(input);
  const result = cleanupObsoleteHistoricalReviews(input);
  assert.equal(result.removedScheduleReviews, 1);
  assert.equal(result.removedClosingReviews, 1);
  assert.equal(result.totalRemoved, 2);
  assert.deepEqual(input, before);
  assert.notEqual(result.state, input);
  assert.deepEqual(result.state.contracts, before.contracts);
  assert.deepEqual(result.state.importRuns, before.importRuns);
  assert.deepEqual(result.state.reviews.map((item) => item.id), ["order-open", "anomaly-open", "schedule-resolved", "closing-resolved"]);
});

test("cleanup is deterministic and a second run removes zero reviews", () => {
  const first = cleanupObsoleteHistoricalReviews(state());
  assert.deepEqual(first, cleanupObsoleteHistoricalReviews(state()));
  const second = cleanupObsoleteHistoricalReviews(first.state);
  assert.equal(second.totalRemoved, 0);
  assert.deepEqual(second.state, first.state);
  assert.deepEqual(countObsoleteHistoricalReviews(second.state), { scheduleReviews: 0, closingReviews: 0, total: 0 });
});

test("repository cleanup changes only Ainuoke reviews and appends count-only OperationLog metadata", async () => {
  const storage = new MemoryStorage();
  const store = createLocalDataStore({ storage, namespace: "zhixu.erp.test-ainuoke-cleanup", environment: "test", now: () => now });
  const ainuoke = createAinuokeRepository(store);
  const operationLogs = createOperationLogRepository(undefined, store);
  await ainuoke.save(state());
  store.save("sales-orders", { orders: ["order-keep"] });
  store.save("production-scheduling", { scheduleAssignments: ["schedule-keep"] });
  store.save("closing-center", { periods: ["period-keep"], allocations: ["allocation-keep"] });
  store.save("operations-settings", { productionGroups: ["group-keep"], outsourceFactories: ["factory-keep"] });
  const beforeRecords = store.getRawRecords();

  const result = await commitObsoleteHistoricalReviewCleanup({ canResolveConflicts: true, actor, repositories: { ainuoke, operationLogs }, timestamp: now });
  const afterRecords = store.getRawRecords();
  assert.equal(result.totalRemoved, 2);
  assert.deepEqual(result.state.contracts, [contract]);
  assert.deepEqual(result.state.importRuns, [importRun]);
  for (const name of ["sales-orders", "production-scheduling", "closing-center", "operations-settings"]) {
    assert.equal(afterRecords[store.key(name)], beforeRecords[store.key(name)]);
  }

  const logs = await operationLogs.list();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, "清理艾诺科旧迁移待确认");
  assert.equal(logs[0].module, "艾诺科同步");
  assert.equal(logs[0].entityType, "AinuokeImportReview");
  assert.equal(logs[0].userId, actor.userId);
  assert.equal(logs[0].createdAt, now);
  assert.deepEqual(logs[0].afterData.values, { removedScheduleReviewCount: 1, removedClosingReviewCount: 1, totalRemoved: 2 });
  assert.equal(operationLogCategory(logs[0]), "艾诺科同步");
  const serialized = JSON.stringify(logs[0]);
  for (const forbidden of ["schedule-open", "closing-open", "candidate-schedule-open", "reason-schedule-open", "password", "token", "session"]) assert.equal(serialized.includes(forbidden), false);

  const repeated = await commitObsoleteHistoricalReviewCleanup({ canResolveConflicts: true, actor, repositories: { ainuoke, operationLogs }, timestamp: now });
  assert.equal(repeated.totalRemoved, 0);
  assert.equal(repeated.operationLog, null);
  assert.equal((await operationLogs.list()).length, 1);
});

test("permission denied prevents repository load, save, and log append", async () => {
  const calls = { load: 0, save: 0, append: 0 };
  const repositories = {
    ainuoke: {
      async load() { calls.load += 1; return state(); },
      async save(value) { calls.save += 1; return value; },
    },
    operationLogs: { async append() { calls.append += 1; } },
  };
  await assert.rejects(() => commitObsoleteHistoricalReviewCleanup({ canResolveConflicts: false, actor, repositories }), /ainuoke\.resolve_conflict/);
  assert.deepEqual(calls, { load: 0, save: 0, append: 0 });
});

test("cleanup orchestration cannot touch order, scheduling, closing, or style progress repositories", () => {
  const source = readFileSync(new URL("../features/ainuoke-sync/service/ainuoke-historical-review-cleanup.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /orderRepository|productionSchedulingRepository|closingRepository|styleProgress|commitImport|saveAll|clearNamespace/);
  assert.match(source, /ainuoke\.load\(\)/);
  assert.match(source, /ainuoke\.save\(cleanup\.state\)/);
  assert.match(source, /operationLogs\.append\(operationLog\)/);
});

test("UI shows exact backlog counts only when nonzero and uses a confirmation modal", () => {
  const source = readFileSync(new URL("../features/ainuoke-sync/components/ainuoke-sync-page.tsx", import.meta.url), "utf8");
  assert.match(source, /obsoleteReviewCounts\.total > 0 && <Card>/);
  assert.match(source, /旧迁移待确认/);
  assert.match(source, /排单匹配/);
  assert.match(source, /生产\/关账匹配/);
  assert.match(source, /确认清理旧待确认/);
  assert.match(source, /不会删除/);
  assert.match(source, /permission="ainuoke\.resolve_conflict"/);
  assert.doesNotMatch(source, /permission="ainuoke\.view"[^>]*>清理旧迁移待确认/);
  const cleaned = cleanupObsoleteHistoricalReviews(state()).state;
  assert.equal(countObsoleteHistoricalReviews(cleaned).total, 0);
});

test("Backup and Restore preserve the filtered Ainuoke state without schema or namespace changes", async () => {
  const sourceStorage = new MemoryStorage();
  const sourceStore = createLocalDataStore({ storage: sourceStorage, namespace: "zhixu.erp.test-ainuoke-cleanup-backup", environment: "test", now: () => now });
  const filtered = cleanupObsoleteHistoricalReviews(state()).state;
  await createAinuokeRepository(sourceStore).save(filtered);
  const backup = sourceStore.getRawRecords();

  const restoredStorage = new MemoryStorage();
  const restoredStore = createLocalDataStore({ storage: restoredStorage, namespace: "zhixu.erp.test-ainuoke-cleanup-backup", environment: "test", now: () => now });
  restoredStore.replaceRawRecords(backup);
  const restored = await createAinuokeRepository(restoredStore).load();
  assert.deepEqual(restored, filtered);
  assert.deepEqual(restored.contracts, [contract]);
  assert.deepEqual(restored.importRuns, [importRun]);
});

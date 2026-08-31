import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateClosingState } from "../features/closing-center/model/closing.ts";
import { createClosingPeriod } from "../features/closing-center/service/closing-service.ts";
import { createLocalDataStore } from "../features/data-management/repository/local-data-store.ts";
import { getEffectiveQuantity, validateOrderCollection } from "../features/order-center/model/order.ts";
import { validateProductionSchedulingState } from "../features/production-scheduling/model/production-scheduling.ts";
import {
  createDeterministicRandom,
  createUiQaRepositories,
  installUiQaDataset,
  UI_QA_DATASET_ID,
  UI_QA_SEED,
} from "../scripts/ui-qa-data/dataset.ts";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

function setup(namespace) {
  const storage = new MemoryStorage();
  const store = createLocalDataStore({ storage, namespace, environment: "development", now: () => "2026-08-30T08:00:00.000+08:00" });
  return { storage, store, repositories: createUiQaRepositories(store) };
}

test("固定 seed 产生固定伪随机序列", () => {
  const first = createDeterministicRandom(UI_QA_SEED);
  const second = createDeterministicRandom(UI_QA_SEED);
  assert.deepEqual(Array.from({ length: 20 }, first), Array.from({ length: 20 }, second));
  assert.notDeepEqual(Array.from({ length: 5 }, createDeterministicRandom("another-seed")), Array.from({ length: 5 }, createDeterministicRandom(UI_QA_SEED)));
});

test("Phase 2.5 数据规模、关系、队列与状态分布满足验收要求", async () => {
  const { repositories } = setup("zhixu.erp.test-ui-qa-scale");
  const manifest = await installUiQaDataset(repositories);
  assert.equal(manifest.datasetId, UI_QA_DATASET_ID);
  assert.equal(manifest.seed, UI_QA_SEED);
  assert.equal(manifest.counts.customers, 10);
  assert.equal(manifest.counts.brands, 8);
  assert.equal(manifest.counts.quotes, 72);
  assert.equal(manifest.counts.orders, 168);
  assert.equal(manifest.counts.scheduledOrders, 150);
  assert.equal(manifest.counts.unscheduledOrders, 18);
  assert.equal(manifest.counts.productionGroups, 15);
  assert.equal(manifest.counts.closingPeriods, 3);
  assert.equal(manifest.counts.closingAllocations, 90);
  assert.equal(manifest.counts.operationLogs, 0);
  assert.equal(manifest.counts.attachments, 0);
  assert.deepEqual(manifest.productionGroups.map((row) => row.productionGroup), ["1组", "2组", "3组", "4组", "5组", "6组", "7组", "8组", "9组", "10组", "11组", "12组", "13组", "15组", "16组"]);
  assert.deepEqual(manifest.productionGroups.map((row) => row.scheduledOrders), [9, 11, 8, 10, 12, 9, 11, 8, 10, 12, 9, 11, 8, 10, 12]);
  assert.equal(manifest.integrity.noGroup14, true);
  assert.equal(manifest.integrity.allGroupsCovered, true);
  assert.equal(manifest.integrity.variedGroupCounts, true);
  assert.equal(manifest.integrity.uniqueGeneratedIds, true);
  assert.equal(manifest.integrity.referencesValid, true);
  assert.equal(manifest.integrity.oneOrderOneStyle, true);
  assert.deepEqual(manifest.distributions.revisionCount, { "1": 24, "2": 36, "3": 12 });
  assert.deepEqual(manifest.distributions.priceVersionCount, { "1": 24, "2": 24, "3": 24 });
  assert.ok(Object.keys(manifest.distributions.quoteStatus).length >= 3);
  assert.ok(Object.keys(manifest.distributions.productionStatus).length >= 3);
  assert.deepEqual(manifest.distributions.closingPeriodStatus, { locked: 1, confirmed: 1, open: 1 });
});

test("生成器使用正式 Repository 保存，重复运行只跳过且不覆盖用户数据", async () => {
  const { repositories } = setup("zhixu.erp.test-ui-qa-idempotent");
  const first = await installUiQaDataset(repositories);
  const ordersBefore = await repositories.orders.list();
  const protectedOrder = ordersBefore.find((order) => order.id === first.ids.orders[0]);
  assert.ok(protectedOrder);
  protectedOrder.customerPoNo = "USER-PRESERVED-PO";
  await repositories.orders.save(protectedOrder);

  const secondRepositories = createUiQaRepositories(repositories.store);
  const second = await installUiQaDataset(secondRepositories);
  assert.equal(second.installation.quotesAdded, 0);
  assert.equal(second.installation.quotesSkipped, 72);
  assert.equal(second.installation.ordersAdded, 0);
  assert.equal(second.installation.ordersSkipped, 168);
  assert.equal(second.installation.assignmentsAdded, 0);
  assert.equal(second.installation.assignmentsSkipped, 150);
  assert.equal(second.installation.closingPeriodsAdded, 0);
  assert.equal(second.installation.closingAllocationsAdded, 0);
  assert.equal((await secondRepositories.orders.getById(protectedOrder.id)).customerPoNo, "USER-PRESERVED-PO");
});

test("跨报价、订单、排单和关账的正式 owner 与指针完整", async () => {
  const { repositories } = setup("zhixu.erp.test-ui-qa-integrity");
  const manifest = await installUiQaDataset(repositories);
  const quotes = (await repositories.quotes.list()).filter((quote) => manifest.ids.quotes.includes(quote.id));
  const orders = (await repositories.orders.list()).filter((order) => manifest.ids.orders.includes(order.id));
  const scheduling = await repositories.scheduling.load();
  const closing = await repositories.closing.load();
  const settings = repositories.operationsSettings.load();
  validateOrderCollection(orders);
  validateProductionSchedulingState(scheduling, { orders, operationsSettings: settings });
  validateClosingState(closing, { orderIds: new Set(orders.map((order) => order.id)), assignmentIds: new Set(scheduling.scheduleAssignments.map((assignment) => assignment.id)) });
  assert.ok(quotes.every((quote) => quote.revisions.some((revision) => revision.revisionId === quote.defaultRevisionId && revision.readOnly === false)));
  assert.ok(orders.every((order) => order.remark.includes(UI_QA_DATASET_ID) && order.styleNo && !("items" in order)));
  const quotedOrderIds = new Set(manifest.ids.orders.slice(0, 60));
  assert.ok(orders.filter((order) => quotedOrderIds.has(order.id)).every((order) => order.sourceType === "quote" && manifest.ids.quotes.includes(order.sourceQuoteId)));
  assert.ok(orders.some((order) => order.quantityChanges.length > 0));
  assert.ok(orders.some((order) => order.deliveryPlans.some((plan) => plan.voidedAt !== null)));
  assert.ok(orders.some((order) => order.deliveryPlans.filter((plan) => plan.voidedAt === null).length > 1));
  assert.ok(scheduling.scheduleAssignments.filter((assignment) => manifest.ids.scheduleAssignments.includes(assignment.id)).every((assignment) => assignment.remark.includes(UI_QA_DATASET_ID) && assignment.plannedStartDate <= assignment.plannedEndDate));
  assert.ok(closing.periods.filter((period) => manifest.ids.closingPeriods.includes(period.id)).every((period) => period.remark.includes(UI_QA_DATASET_ID)));
  assert.ok(orders.every((order) => getEffectiveQuantity(order) >= 0));
});

test("实际 QA Manifest 的每个业务 ID 都能在正式 Repository 中解析", async () => {
  const manifest = JSON.parse(await readFile(new URL("../artifacts/ui-redesign-qa/manifest.json", import.meta.url), "utf8"));
  const { repositories } = setup("zhixu.erp.test-ui-qa-manifest");
  const existingClosing = await repositories.closing.load();
  const withProtectedAugust = createClosingPeriod(existingClosing, {
    month: "2026-08",
    taxRateSnapshot: 0.13,
    remark: "Existing non-QA closing period",
    actor: { id: "test-user", name: "Test User" },
    now: "2026-08-01T08:00:00.000+08:00",
  });
  await repositories.closing.save(withProtectedAugust.state);
  const generated = await installUiQaDataset(repositories);
  const quotes = await repositories.quotes.list();
  const orders = await repositories.orders.list();
  const scheduling = await repositories.scheduling.load();
  const closing = await repositories.closing.load();
  const settings = repositories.operationsSettings.load();
  assert.equal(manifest.datasetId, generated.datasetId);
  assert.equal(manifest.seed, generated.seed);
  assert.deepEqual(manifest.ids.quoteIds, generated.ids.quotes);
  assert.deepEqual(manifest.ids.orderIds, generated.ids.orders);
  assert.deepEqual(manifest.ids.scheduleAssignmentIds, generated.ids.scheduleAssignments);
  assert.deepEqual(manifest.ids.closingPeriodIds, generated.ids.closingPeriods);
  assert.deepEqual(manifest.ids.closingAllocationIds, generated.ids.closingAllocations);
  assert.ok(manifest.ids.quoteIds.every((id) => quotes.some((quote) => quote.id === id)));
  assert.ok(manifest.ids.orderIds.every((id) => orders.some((order) => order.id === id)));
  assert.ok(manifest.ids.productionGroupIds.every((id) => settings.productionGroups.some((group) => group.id === id)));
  assert.ok(manifest.ids.scheduleAssignmentIds.every((id) => scheduling.scheduleAssignments.some((assignment) => assignment.id === id)));
  assert.ok(manifest.ids.closingPeriodIds.every((id) => closing.periods.some((period) => period.id === id)));
  assert.ok(manifest.ids.closingAllocationIds.every((id) => closing.allocations.some((allocation) => allocation.id === id)));
});

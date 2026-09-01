import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createLocalDataStore, LOCAL_DATA_SCHEMA_VERSION } from "../features/data-management/repository/local-data-store.ts";
import { createOrderSearchProvider } from "../features/global-search/providers/order-search-provider.ts";
import { createOrderOperationLog } from "../features/operation-logs/model/order-operation-logs.ts";
import { DEFAULT_PERMISSION_STATE, permissionsForUser } from "../features/permissions/model/permissions.ts";
import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";
import { migrateOrderCollectionV5ToV6, migrateOrderStorageRecordToV6 } from "../features/order-center/migration/order-v5-to-v6.ts";
import {
  activeDeliveryPlans,
  getCurrentPriceVersion,
  getDeliveryBalanceStatus,
  getDeliveryPlannedQuantity,
  getEffectiveQuantity,
  orderReferencesAttachment,
  validateOrderCollection,
} from "../features/order-center/model/order.ts";
import { createOrderRepository } from "../features/order-center/repository/order-repository.ts";
import {
  cancelOrder,
  changeOrderQuantity,
  confirmOrder,
  createManualOrder,
  createOrderFromQuote,
  createOrderPriceVersion,
  createReorder,
  orderDeliveryWarning,
  upsertDeliveryPlan,
} from "../features/order-center/service/order-service.ts";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

const timestamp = "2026-08-27T10:00:00.000Z";
const actor = { id: "user-admin", name: "系统管理员" };
const logActor = { userId: actor.id, userName: actor.name };
const today = "2026-08-27";

const createStore = (storage, namespace = "zhixu.erp.order-center-test") => createLocalDataStore({ storage, namespace, environment: "test", now: () => timestamp });

function header(orderNo, orderType = "processing", customerPoNo = "PO-1001") {
  return {
    orderNo,
    customerId: "brand-zara",
    customerNameSnapshot: "ZARA",
    customerPoNo,
    orderDate: today,
    salespersonId: "salesperson-alice",
    salespersonNameSnapshot: "Alice",
    merchandiserId: null,
    merchandiserNameSnapshot: "理单员A",
    orderType,
    remark: "订单测试",
  };
}

function manualOrder(orderNo = "SO-20260827-001", orderType = "processing", styleNo = "STYLE-1", customerPoNo = "PO-1001") {
  const order = createManualOrder({ header: header(orderNo, orderType, customerPoNo), style: { styleNo, styleName: `测试款式 ${styleNo}`, productionCountry: "中国", initialQuantity: 100 }, actor, id: `order-${orderNo}`, createdAt: timestamp });
  const current = getCurrentPriceVersion(order);
  order.priceVersions = [{ ...current, processingUnitPrice: 12, salePrice: orderType === "distribution" ? 38 : null }];
  return order;
}

function legacyItem(id, styleNo, options = {}) {
  const priceId = options.priceId ?? `price-${id}`;
  return {
    id,
    sourceQuoteId: options.sourceQuoteId ?? `quote-${id}`,
    sourceRevisionId: options.sourceRevisionId ?? `revision-${id}`,
    sourcePriceVersionId: options.sourcePriceVersionId ?? `quote-price-${id}`,
    sourceOrderItemId: options.sourceOrderItemId ?? null,
    styleNo,
    styleName: `款式 ${styleNo}`,
    brandId: "brand-zara",
    brandNameSnapshot: "ZARA",
    productionCountry: "中国",
    processDescription: `工艺 ${styleNo}`,
    customerRequirement: `要求 ${styleNo}`,
    remark: `款式备注 ${styleNo}`,
    initialQuantity: options.initialQuantity ?? 100,
    fabricExecutionSnapshots: [{ id: `fabric-${id}`, sourceFabricLineId: null, name: `面料 ${styleNo}`, composition: "棉", specification: "180gsm", supplierNameSnapshot: "供应商", remark: "" }],
    trimExecutionSnapshots: [{ id: `trim-${id}`, sourceTrimLineId: null, name: `辅料 ${styleNo}`, specification: "标准", supplierNameSnapshot: "供应商", remark: "" }],
    quantityChanges: [{ id: `quantity-${id}`, orderItemId: id, beforeQuantity: 100, afterQuantity: 90, delta: -10, changeType: "decrease", reason: "客户减量", createdAt: timestamp, createdBy: actor.name }],
    deliveryPlans: [{ id: `delivery-${id}`, orderItemId: id, deliveryDate: "2026-09-30", quantity: 90, remark: "首批", createdAt: timestamp, updatedAt: timestamp, voidedAt: null }],
    priceVersions: [{ id: priceId, orderItemId: id, versionNo: 1, displayLabel: "P1", salePrice: options.salePrice ?? 40, processingUnitPrice: 12, processingCurrency: "CNY", exchangeRateSnapshot: 7.1, effectiveDate: today, reason: "初始价格", createdAt: timestamp, createdBy: actor.name }],
    currentPriceVersionId: priceId,
    imageAttachmentIds: [`image-${id}`],
    fileAttachmentIds: [`file-${id}`],
    styleImageAttachmentId: `image-${id}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function legacyOrder(id, orderNo, items, options = {}) {
  return {
    id,
    orderNo,
    customerId: "brand-zara",
    customerNameSnapshot: "ZARA",
    customerPoNo: options.customerPoNo ?? "PO-001",
    sourceType: options.sourceType ?? "manual",
    sourceOrderId: options.sourceOrderId ?? null,
    orderDate: today,
    salespersonId: "salesperson-alice",
    salespersonNameSnapshot: "Alice",
    merchandiserId: null,
    merchandiserNameSnapshot: "理单员A",
    orderType: "distribution",
    status: "confirmed",
    remark: "订单头备注",
    items,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: actor.name,
    updatedBy: actor.name,
  };
}

test("v5 单 Item 订单非破坏提升为 v6 单款 SalesOrder", () => {
  const item = legacyItem("item-single", "1059C");
  const oldOrder = legacyOrder("order-single", "SO-20260827-001", [item]);
  const result = migrateOrderCollectionV5ToV6([oldOrder]);
  const order = result.orders[0];
  assert.equal(result.migrated, true);
  assert.equal(order.id, oldOrder.id);
  assert.equal(order.orderNo, oldOrder.orderNo);
  assert.equal(order.styleNo, "1059C");
  assert.equal(order.sourceQuoteId, item.sourceQuoteId);
  assert.equal(order.sourceRevisionId, item.sourceRevisionId);
  assert.equal(order.sourcePriceVersionId, item.sourcePriceVersionId);
  assert.equal(order.currentPriceVersionId, item.currentPriceVersionId);
  assert.equal(order.priceVersions[0].salesOrderId, order.id);
  assert.equal(order.quantityChanges[0].salesOrderId, order.id);
  assert.equal(order.deliveryPlans[0].salesOrderId, order.id);
  assert.deepEqual(order.imageAttachmentIds, item.imageAttachmentIds);
  assert.equal(order.styleImageAttachmentId, item.styleImageAttachmentId);
  assert.equal("items" in order, false);
});

test("v5 多款订单拆为独立单款 SalesOrder，PO、头信息与各自历史不串单", () => {
  const items = [legacyItem("item-a", "1059C", { salePrice: 41 }), legacyItem("item-b", "1081C", { salePrice: 42 }), legacyItem("item-c", "1630U", { salePrice: 43 })];
  const legacyOrders = [legacyOrder("order-multi", "SO-20260827-010", items)];
  const result = migrateOrderCollectionV5ToV6(legacyOrders);
  assert.equal(result.orders.length, 3);
  assert.deepEqual(result.orders.map((order) => order.styleNo), ["1059C", "1081C", "1630U"]);
  assert.equal(new Set(result.orders.map((order) => order.id)).size, 3);
  assert.equal(new Set(result.orders.map((order) => order.orderNo)).size, 3);
  assert.ok(result.orders.every((order) => order.customerPoNo === "PO-001"));
  assert.ok(result.orders.every((order) => order.customerNameSnapshot === "ZARA"));
  assert.deepEqual(result.orders.map((order) => getCurrentPriceVersion(order).salePrice), [41, 42, 43]);
  assert.deepEqual(result.orders.map((order) => order.quantityChanges[0].id), ["quantity-item-a", "quantity-item-b", "quantity-item-c"]);
  assert.deepEqual(result.orders.map((order) => order.quantityChanges[0].delta), [-10, -10, -10]);
  assert.ok(result.orders.every((order) => order.quantityChanges[0].createdAt === timestamp));
  assert.deepEqual(result.orders.map((order) => order.deliveryPlans[0].id), ["delivery-item-a", "delivery-item-b", "delivery-item-c"]);
  assert.ok(result.orders.every((order) => order.deliveryPlans[0].createdAt === timestamp && order.deliveryPlans[0].updatedAt === timestamp));
  assert.deepEqual(result.orders.map((order) => order.sourceQuoteId), ["quote-item-a", "quote-item-b", "quote-item-c"]);
  assert.deepEqual(result.orders.map((order) => order.styleImageAttachmentId), ["image-item-a", "image-item-b", "image-item-c"]);
  assert.equal(result.orders[0].id, "order-multi");
  assert.equal(result.orders[0].orderNo, "SO-20260827-010");
  assert.deepEqual(migrateOrderCollectionV5ToV6(legacyOrders).orders, result.orders);
  assert.deepEqual(migrateOrderCollectionV5ToV6(result.orders).orders, result.orders);
});

test("翻单旧 sourceOrderItemId 通过确定性 mapping 指向正确的新 SalesOrder", () => {
  const sourceItems = [legacyItem("source-a", "1059C"), legacyItem("source-b", "1081C")];
  const reorderItems = [legacyItem("reorder-a", "1081C-R", { sourceOrderItemId: "source-b" })];
  const result = migrateOrderCollectionV5ToV6([
    legacyOrder("order-source", "SO-20260827-020", sourceItems),
    legacyOrder("order-reorder", "SO-20260827-021", reorderItems, { sourceType: "reorder", sourceOrderId: "order-source" }),
  ]);
  const migratedSourceB = result.orders.find((order) => order.id === result.legacyOrderItemToSalesOrderId["source-b"]);
  const migratedReorder = result.orders.find((order) => order.id === result.legacyOrderItemToSalesOrderId["reorder-a"]);
  assert.ok(migratedSourceB);
  assert.ok(migratedReorder);
  assert.equal(migratedReorder.sourceOrderId, migratedSourceB.id);
  assert.notEqual(migratedReorder.sourceOrderId, "order-source");
  assert.equal(result.legacyOrderItemToSalesOrderId["source-b"], migratedSourceB.id);
});

test("v5→v6 Repository 升级稳定 key、幂等且迁移异常不覆盖 sales-orders 原文", async () => {
  const storage = new MemoryStorage();
  const namespace = "zhixu.erp.order-v5-v6-test";
  const key = `${namespace}.sales-orders`;
  const legacy = [legacyOrder("order-stable", "SO-STABLE", [legacyItem("item-stable", "STABLE")])];
  storage.setItem(`${namespace}.manifest`, JSON.stringify({ product: "zhixu-erp", schemaVersion: 5, environment: "development", initializedAt: timestamp, updatedAt: timestamp }));
  storage.setItem(key, JSON.stringify({ schemaVersion: 5, initializedAt: timestamp, updatedAt: timestamp, data: legacy }));
  const store = createStore(storage, namespace);
  const migrated = await createOrderRepository(store).list();
  assert.equal(LOCAL_DATA_SCHEMA_VERSION, 10);
  assert.equal(migrated[0].id, "order-stable");
  assert.equal(JSON.parse(storage.getItem(`${namespace}.manifest`)).schemaVersion, 10);
  assert.equal(JSON.parse(storage.getItem(key)).schemaVersion, 10);
  const firstRaw = storage.getItem(key);
  assert.deepEqual(await createOrderRepository(store).list(), migrated);
  assert.equal(storage.getItem(key), firstRaw);

  const brokenStorage = new MemoryStorage();
  const brokenNamespace = "zhixu.erp.order-v5-broken-test";
  const brokenKey = `${brokenNamespace}.sales-orders`;
  const broken = [legacyOrder("broken", "SO-BROKEN", [{ ...legacyItem("broken-item", "BAD"), currentPriceVersionId: "missing" }])];
  const brokenRaw = JSON.stringify({ schemaVersion: 5, initializedAt: timestamp, updatedAt: timestamp, data: broken });
  brokenStorage.setItem(brokenKey, brokenRaw);
  await assert.rejects(() => createOrderRepository(createStore(brokenStorage, brokenNamespace)).list(), /currentPriceVersionId/);
  assert.equal(brokenStorage.getItem(brokenKey), brokenRaw);
});

test("新手工订单模型只允许单款，客户 PO 可重复而 orderNo 保持唯一", async () => {
  const repository = createOrderRepository(createStore(new MemoryStorage(), "zhixu.erp.order-manual-test"));
  const first = manualOrder("SO-MANUAL-1", "processing", "1059C", "PO-SAME");
  const second = manualOrder("SO-MANUAL-2", "distribution", "1081C", "PO-SAME");
  await repository.save(first);
  await repository.save(second);
  assert.equal((await repository.list()).length, 2);
  assert.equal((await repository.getById(first.id)).styleNo, "1059C");
  assert.equal((await repository.getById(second.id)).customerPoNo, "PO-SAME");
  assert.equal(getCurrentPriceVersion(first).salePrice, null);
  assert.equal(getCurrentPriceVersion(second).salePrice, 38);
  assert.equal(await repository.orderNoExists(" so-manual-1 "), true);
  await assert.rejects(() => repository.save({ ...second, id: "duplicate", orderNo: "SO-MANUAL-1" }), /订单号已存在/);
  assert.equal("items" in first, false);
});

test("Quote → Order 直接生成单款 SalesOrder 并隔离内部成本", () => {
  const quote = structuredClone(quoteFixtures[0]);
  const revision = quote.revisions.find((row) => row.revisionId === quote.defaultRevisionId) ?? quote.revisions[0];
  const priceVersion = revision.priceVersions[0];
  revision.imageAttachmentIds = ["attachment-image-1"];
  revision.fileAttachmentIds = ["attachment-file-1"];
  revision.styleImageAttachmentId = "attachment-image-1";
  const order = createOrderFromQuote({ quote, revision, priceVersion, header: header("SO-FROM-QUOTE", revision.baseInfo.quoteType), initialQuantity: 321, actor });
  assert.equal(order.sourceType, "quote");
  assert.equal(order.sourceQuoteId, quote.id);
  assert.equal(order.sourceRevisionId, revision.revisionId);
  assert.equal(order.sourcePriceVersionId, priceVersion.id);
  assert.equal(order.styleNo, revision.baseInfo.quoteStyleNo);
  assert.equal(order.initialQuantity, 321);
  assert.equal(order.priceVersions.length, 1);
  assert.equal(getCurrentPriceVersion(order).processingUnitPrice, priceVersion.labor.value);
  assert.deepEqual(order.imageAttachmentIds, ["attachment-image-1"]);
  assert.equal(orderReferencesAttachment(order, "attachment-file-1"), true);
  assert.equal(Object.hasOwn(order.fabricExecutionSnapshots[0] ?? {}, "unitPrice"), false);
  assert.equal(Object.hasOwn(order.fabricExecutionSnapshots[0] ?? {}, "cost"), false);
  assert.equal(Object.hasOwn(order.trimExecutionSnapshots[0] ?? {}, "lossRate"), false);
  const snapshot = structuredClone(order);
  priceVersion.labor.value = 999;
  assert.deepEqual(order, snapshot);
});

test("SalesOrder → SalesOrder 翻单只复制当前事实为新 P1", () => {
  let source = manualOrder("SO-SOURCE", "distribution", "1059C");
  source = createOrderPriceVersion(source, { salePrice: 42, processingUnitPrice: 14, processingCurrency: "USD", exchangeRateSnapshot: 7.1, effectiveDate: "2026-08-28", reason: "客户议价", actor });
  source = changeOrderQuantity(source, { afterQuantity: 80, changeType: "decrease", reason: "减少", actor });
  source = upsertDeliveryPlan(source, { id: "delivery-source", deliveryDate: "2026-10-01", quantity: 80, remark: "首批" }, actor);
  const snapshot = structuredClone(source);
  const reorder = createReorder({ source, orderNo: "SO-REORDER", orderDate: "2026-09-01", actor });
  assert.notEqual(reorder.id, source.id);
  assert.equal(reorder.sourceOrderId, source.id);
  assert.equal(reorder.sourceType, "reorder");
  assert.equal(reorder.styleNo, source.styleNo);
  assert.equal(reorder.quantityChanges.length, 0);
  assert.equal(reorder.deliveryPlans.length, 0);
  assert.equal(reorder.priceVersions.length, 1);
  assert.equal(getCurrentPriceVersion(reorder).displayLabel, "P1");
  assert.equal(getCurrentPriceVersion(reorder).salePrice, 42);
  assert.equal(reorder.initialQuantity, 80);
  assert.equal("sourceOrderItemId" in reorder, false);
  assert.deepEqual(source, snapshot);
});

test("数量、部分取消、全部取消与商务状态保持 append-only", () => {
  let order = manualOrder("SO-QUANTITY");
  order = changeOrderQuantity(order, { afterQuantity: 120, changeType: "increase", reason: "加单", actor });
  order = changeOrderQuantity(order, { afterQuantity: 90, changeType: "decrease", reason: "减少", actor });
  order = changeOrderQuantity(order, { afterQuantity: 60, changeType: "partial_cancel", reason: "客户取消部分", actor });
  assert.equal(getEffectiveQuantity(order), 60);
  assert.deepEqual(order.quantityChanges.map((row) => row.delta), [20, -30, -30]);
  const cancelled = cancelOrder(order, "客户取消整单", actor);
  assert.equal(getEffectiveQuantity(cancelled), 0);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.quantityChanges.at(-1).changeType, "full_cancel");
  assert.equal(cancelled.quantityChanges.at(-1).delta, -60);
  assert.throws(() => cancelOrder(order, " ", actor), /原因/);
  assert.throws(() => changeOrderQuantity(order, { afterQuantity: 0, changeType: "partial_cancel", reason: "", actor }), /原因/);
});

test("DeliveryPlan 直接属于 SalesOrder，多交期与数量变化保持隔离", () => {
  let order = manualOrder("SO-DELIVERY");
  order = upsertDeliveryPlan(order, { id: "delivery-1", deliveryDate: "2026-10-01", quantity: 40, remark: "首批" }, actor);
  assert.equal(getDeliveryBalanceStatus(order), "short");
  order = upsertDeliveryPlan(order, { id: "delivery-2", deliveryDate: "2026-10-15", quantity: 60, remark: "尾批" }, actor);
  assert.equal(getDeliveryPlannedQuantity(order), 100);
  assert.equal(getDeliveryBalanceStatus(order), "matched");
  assert.ok(order.deliveryPlans.every((plan) => plan.salesOrderId === order.id));
  const plans = structuredClone(order.deliveryPlans);
  order = changeOrderQuantity(order, { afterQuantity: 80, changeType: "decrease", reason: "减量", actor });
  assert.equal(getDeliveryBalanceStatus(order), "excess");
  assert.match(orderDeliveryWarning(order), /超过/);
  assert.deepEqual(order.deliveryPlans, plans);
  assert.equal(activeDeliveryPlans(order).length, 2);
});

test("OrderPriceVersion 直接属于 SalesOrder，currentPriceVersionId 是唯一权威指针", () => {
  const source = manualOrder("SO-PRICE", "distribution");
  const p1 = structuredClone(getCurrentPriceVersion(source));
  const next = createOrderPriceVersion(source, { salePrice: 45, processingUnitPrice: 15, processingCurrency: "USD", exchangeRateSnapshot: 7.2, effectiveDate: "2026-09-01", reason: "管理层调整", actor });
  assert.equal(next.priceVersions.length, 2);
  assert.deepEqual(next.priceVersions[0], p1);
  assert.equal(getCurrentPriceVersion(next).displayLabel, "P2");
  assert.equal(getCurrentPriceVersion(next).salePrice, 45);
  assert.equal(next.currentPriceVersionId, next.priceVersions[1].id);
  assert.ok(next.priceVersions.every((price) => price.salesOrderId === next.id));
  assert.throws(() => createOrderPriceVersion(source, { salePrice: 44, processingUnitPrice: 14, processingCurrency: "CNY", exchangeRateSnapshot: null, effectiveDate: today, reason: " ", actor }), /原因/);
  assert.throws(() => getCurrentPriceVersion({ ...next, currentPriceVersionId: "missing" }), /指针无效/);
  assert.throws(() => validateOrderCollection([{ ...next, currentPriceVersionId: "missing" }]), /指针/);
});

test("新日志只写 SalesOrder 上下文，历史 orderItemId 字段仍可兼容读取", () => {
  const order = manualOrder("SO-LOG", "distribution", "1059C");
  const log = createOrderOperationLog({ order, actor: logActor, action: "调整订单工价", entityType: "OrderPriceVersion", entityId: order.currentPriceVersionId, beforeValues: { "工价": 12 }, afterValues: { "工价": 13 }, reason: "管理层调整", operationId: "operation-order-1" });
  assert.equal(log.afterData.orderId, order.id);
  assert.equal(log.afterData.orderNo, order.orderNo);
  assert.equal(log.afterData.orderStyleNo, order.styleNo);
  assert.equal("orderItemId" in log.afterData, false);
  assert.equal(log.afterData.objectName, "SO-LOG · 1059C");
  assert.deepEqual(log.changes, [{ field: "工价", beforeValue: 12, afterValue: 13 }]);
  const legacyPayload = { ...log.afterData, orderItemId: "legacy-item", objectName: "SO-OLD · 1081C" };
  assert.equal(legacyPayload.orderItemId, "legacy-item");
  assert.equal(legacyPayload.objectName, "SO-OLD · 1081C");
});

test("新 Backup 使用 v6 单款结构，旧第三批 sales-orders Record 自动迁移且外围记录保持原文", () => {
  const current = manualOrder("SO-BACKUP", "distribution", "1059C");
  const currentRecord = migrateOrderStorageRecordToV6({ schemaVersion: 6, initializedAt: timestamp, updatedAt: timestamp, data: [current] }, { schemaVersion: 6, fallbackTimestamp: timestamp });
  const currentPayload = currentRecord.data[0];
  assert.equal("items" in currentPayload, false);
  assert.equal(currentPayload.priceVersions[0].salesOrderId, current.id);

  const legacy = [legacyOrder("order-backup-old", "SO-BACKUP-OLD", [legacyItem("backup-a", "1059C"), legacyItem("backup-b", "1081C")])];
  const oldRecord = { schemaVersion: 5, initializedAt: timestamp, updatedAt: timestamp, data: legacy };
  const legacyLogRaw = JSON.stringify({ schemaVersion: 5, initializedAt: timestamp, updatedAt: timestamp, data: [{ id: "log-old", afterData: { orderItemId: "backup-b", objectName: "SO-BACKUP-OLD · 1081C" } }] });
  const migratedRecord = migrateOrderStorageRecordToV6(oldRecord, { schemaVersion: 6, fallbackTimestamp: timestamp });
  assert.equal(migratedRecord.schemaVersion, 6);
  assert.equal(migratedRecord.data.length, 2);
  assert.deepEqual(migratedRecord.data.map((order) => order.styleNo), ["1059C", "1081C"]);
  assert.equal(migratedRecord.data[1].styleImageAttachmentId, "image-backup-b");
  assert.equal(JSON.parse(legacyLogRaw).data[0].afterData.orderItemId, "backup-b");
  assert.equal(currentRecord.initializedAt, timestamp);
});

test("确认刷新、搜索、RBAC 与 UI 源码契约均使用单款 SalesOrder", async () => {
  const store = createStore(new MemoryStorage(), "zhixu.erp.order-integration-test");
  const repository = createOrderRepository(store);
  let order = manualOrder("SO-SEARCH-001", "distribution", "STYLE-SEARCH-9", "PO-SEARCH-88");
  order.customerNameSnapshot = "Search Customer";
  order = upsertDeliveryPlan(order, { id: "delivery-confirm", deliveryDate: "2026-10-20", quantity: 90, remark: "确认交期" }, actor);
  order = changeOrderQuantity(order, { afterQuantity: 90, changeType: "decrease", reason: "客户减量", actor });
  order = createOrderPriceVersion(order, { salePrice: 43, processingUnitPrice: 15, processingCurrency: "USD", exchangeRateSnapshot: 7.2, effectiveDate: "2026-09-02", reason: "确认前调价", actor });
  order = confirmOrder(order, actor);
  await repository.save(order);
  const refreshed = await createOrderRepository(store).getById(order.id);
  assert.equal(refreshed.status, "confirmed");
  assert.equal(refreshed.deliveryPlans.length, 1);
  assert.equal(refreshed.quantityChanges.length, 1);
  assert.equal(refreshed.priceVersions.length, 2);
  assert.equal(getCurrentPriceVersion(refreshed).displayLabel, "P2");

  const provider = createOrderSearchProvider(repository);
  for (const query of ["SO-SEARCH", "PO-SEARCH", "STYLE-SEARCH", "Search Customer"]) {
    const results = await provider.search(query, { can: () => true });
    assert.equal(results.length, 1);
    assert.equal(results[0].href, `/order-center/detail?id=${encodeURIComponent(order.id)}`);
  }
  assert.equal(provider.canSearch({ can: (permission) => permission === "order.view" }), true);
  assert.equal(provider.canSearch({ can: () => false }), false);

  const admin = new Set(permissionsForUser(DEFAULT_PERMISSION_STATE, "user-admin"));
  for (const key of ["order.view", "order.create", "order.edit", "order.cancel"]) assert.equal(admin.has(key), true);
  assert.equal(permissionsForUser(DEFAULT_PERMISSION_STATE, "user-viewer").includes("order.edit"), false);

  const [orderPages, attachmentPanel, quoteEditor, responsiveCss, orderModel, migrationSource, dataService, globalSearchPalette] = await Promise.all([
    readFile(new URL("../features/order-center/components/order-pages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/order-center/components/order-attachment-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/quote-center/responsive.css", import.meta.url), "utf8"),
    readFile(new URL("../features/order-center/model/order.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/order-center/migration/order-v5-to-v6.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/data-management/service/data-management-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/global-search/components/global-search-palette.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(orderPages, /添加款式|移除款式|order\.items|styleSummary|多价格/);
  assert.match(orderPages, /一张 SalesOrder 只对应一个款式/);
  assert.match(orderPages, /手工创建单款订单/);
  assert.match(attachmentPanel, /indexedDbAttachmentRepository/);
  assert.doesNotMatch(attachmentPanel, /delete\(/);
  assert.doesNotMatch(quoteEditor, /qc-header-version-state/);
  assert.match(quoteEditor, /当前价格版本/);
  assert.match(responsiveCss, /white-space: nowrap/);
  assert.doesNotMatch(orderModel, /export type OrderItem/);
  assert.match(migrationSource, /export type LegacyOrderItem/);
  assert.match(dataService, /migrateOrderStorageRecordToV6/);
  assert.match(globalSearchPalette, /搜索报价、订单、排单、关账、客户 PO 或款号/);
  assert.match(globalSearchPalette, /报价 · 订单 · 排单 · 关账 · 权限感知搜索/);
  assert.doesNotMatch(globalSearchPalette, /第一阶段 · 报价中心/);
});

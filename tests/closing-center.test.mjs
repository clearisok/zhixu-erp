import test from "node:test";
import assert from "node:assert/strict";
import { createLocalDataStore, TEST_LOCAL_DATA_NAMESPACE } from "../features/data-management/repository/local-data-store.ts";
import { createClosingRepository } from "../features/closing-center/repository/closing-repository.ts";
import { validateClosingState } from "../features/closing-center/model/closing.ts";
import {
  acknowledgeAllocationSchedule,
  allocationOutput,
  allocationWarnings,
  createAllocationDraft,
  createClosingPeriod,
  currentScheduleDifference,
  projectMonthlyTargetBalance,
  projectOrderClosing,
  saveClosingAllocation,
  summarizeClosing,
  syncAllocationSchedule,
  transitionClosingPeriod,
  voidClosingAllocation,
} from "../features/closing-center/service/closing-service.ts";
import { createClosingAllocationLog } from "../features/operation-logs/model/closing-operation-logs.ts";
import { createClosingSearchProvider } from "../features/global-search/providers/closing-search-provider.ts";
import { DEFAULT_PERMISSION_STATE, userHasPermission } from "../features/permissions/model/permissions.ts";

const now = "2026-08-28T10:00:00.000Z";
const actor = { id: "user-admin", name: "系统管理员" };
const settings = { productionGroups: [{ id: "group-1", name: "一组", shortName: "一组", enabled: true, sortOrder: 1, remark: "", createdAt: now, updatedAt: now }], outsourceFactories: [{ id: "factory-1", name: "A外发厂", shortName: "A厂", enabled: true, contactPerson: "", phone: "", remark: "", createdAt: now, updatedAt: now }], closingSettings: { defaultSalesTaxRatePercent: 13, monthlyProductionTargets: [] } };
const order = (type = "processing") => ({ id: `order-${type}`, orderNo: `SO-${type}`, customerId: null, customerNameSnapshot: "ZARA", customerPoNo: "PO-1", sourceType: "manual", sourceOrderId: null, sourceQuoteId: null, sourceRevisionId: null, sourcePriceVersionId: null, orderDate: "2026-08-01", salespersonId: null, salespersonNameSnapshot: "", merchandiserId: null, merchandiserNameSnapshot: "", orderType: type, status: "confirmed", styleNo: type === "processing" ? "P100" : "D100", styleName: "测试款", brandId: null, brandNameSnapshot: "ZARA", productionCountry: "中国", processDescription: "", customerRequirement: "", remark: "", initialQuantity: 1000, fabricExecutionSnapshots: [], trimExecutionSnapshots: [], quantityChanges: [], deliveryPlans: [], priceVersions: [{ id: `price-${type}`, salesOrderId: `order-${type}`, versionNo: 1, displayLabel: "P1", salePrice: type === "distribution" ? 50 : null, processingUnitPrice: 10, processingCurrency: "CNY", exchangeRateSnapshot: null, effectiveDate: "2026-08-01", reason: "初始", createdAt: now, createdBy: actor.name }], currentPriceVersionId: `price-${type}`, imageAttachmentIds: [], fileAttachmentIds: [], styleImageAttachmentId: null, createdAt: now, updatedAt: now, createdBy: actor.name, updatedBy: actor.name });
const assignment = (type = "internal") => ({ id: `assignment-${type}`, salesOrderId: "order-processing", executionType: type, productionGroupId: type === "internal" ? "group-1" : null, outsourceFactoryId: type === "outsource" ? "factory-1" : null, queueSequence: type === "internal" ? 1 : null, plannedQuantity: 600, durationMode: "workdays", averageDailyOutputSnapshot: 30, requiredWorkdays: 20, plannedStartDate: "2026-08-01", plannedEndDate: "2026-08-20", nonWorkingDayCount: 0, completedQuantity: 400, actualStartDate: "2026-08-02", actualCompletedDate: null, dateMode: type === "internal" ? "auto_queue" : "manual_fixed", status: "in_progress", remark: "", createdAt: now, updatedAt: now, createdBy: actor.name, updatedBy: actor.name });
const scheduling = (items = [assignment()]) => ({ scheduleAssignments: items, orderExecutionTrackings: [] });
const periodState = () => createClosingPeriod({ periods: [], allocations: [] }, { month: "2026-08", taxRateSnapshot: 13, actor, now }).state;

test("schema v7 到 v8 只重封装旧记录并初始化空关账记录", async () => {
  const values = new Map(); const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } };
  values.set(`${TEST_LOCAL_DATA_NAMESPACE}.manifest`, JSON.stringify({ product: "zhixu-erp", schemaVersion: 7, environment: "test", initializedAt: now, updatedAt: now }));
  values.set(`${TEST_LOCAL_DATA_NAMESPACE}.sales-orders`, JSON.stringify({ schemaVersion: 7, initializedAt: now, updatedAt: now, data: [{ id: "keep", unknown: "preserve" }] }));
  const store = createLocalDataStore({ storage, namespace: TEST_LOCAL_DATA_NAMESPACE, environment: "test", now: () => now });
  const state = await createClosingRepository(store).load();
  assert.deepEqual(state, { periods: [], allocations: [] });
  assert.equal(JSON.parse(values.get(`${TEST_LOCAL_DATA_NAMESPACE}.manifest`)).schemaVersion, 11);
  assert.deepEqual(JSON.parse(values.get(`${TEST_LOCAL_DATA_NAMESPACE}.sales-orders`)).data, [{ id: "keep", unknown: "preserve" }]);
});

test("月份唯一、状态流转、锁定不可编辑且重开必须有原因", () => {
  let state = periodState(); const period = state.periods[0];
  assert.throws(() => createClosingPeriod(state, { month: "2026-08", taxRateSnapshot: 13, actor }), /已存在/);
  state = transitionClosingPeriod(state, period.id, "confirm", actor).state;
  assert.equal(state.periods[0].status, "confirmed");
  assert.throws(() => transitionClosingPeriod(state, period.id, "lock", actor, { warningCount: 1 }), /预警/);
  state = transitionClosingPeriod(state, period.id, "lock", actor, { warningCount: 1, warningsAcknowledged: true, reason: "已核对" }).state;
  assert.equal(state.periods[0].status, "locked");
  assert.throws(() => transitionClosingPeriod(state, period.id, "reopen", actor), /原因/);
  state = transitionClosingPeriod(state, period.id, "reopen", actor, { reason: "补录" }).state;
  assert.equal(state.periods[0].status, "open");
  assert.equal(state.periods[0].reopenReason, "补录");
});

test("内部、外发和待分配可并存且快照互斥", () => {
  let state = periodState(); const period = state.periods[0]; const source = order();
  const internal = createAllocationDraft({ period, order: source, assignment: assignment("internal"), settings, actor, quantity: 400, now });
  const outsource = createAllocationDraft({ period, order: source, assignment: assignment("outsource"), settings, actor, quantity: 300, now });
  const pending = createAllocationDraft({ period, order: source, assignment: null, settings, actor, quantity: 300, now });
  for (const item of [internal, outsource, pending]) state = saveClosingAllocation(state, item, actor, now).state;
  validateClosingState(state, { orderIds: new Set([source.id]) });
  const summary = summarizeClosing(state.allocations);
  assert.equal(summary.quantity, 1000); assert.equal(summary.internalProcessingOutputRmb, 4000); assert.equal(summary.outsourceProcessingOutputRmb, 3000); assert.equal(summary.pendingProcessingOutputRmb, 3000); assert.equal(summary.processingOutputRmb, 10000);
});

test("CNY 与 USD 加工产值使用关账汇率且不使用报价 1.13 因子", () => {
  const period = periodState().periods[0]; const source = order();
  const cny = createAllocationDraft({ period, order: source, settings, actor, quantity: 100 });
  const usd = { ...cny, id: "usd", processingCurrencySnapshot: "USD", currencySnapshot: "USD", legacyFxRateApplied: true, closingProcessingUnitPrice: 2, customerProcessingUnitPriceSnapshot: 2, fxRateSnapshot: 7.2 };
  assert.equal(allocationOutput(cny).processingOutputRmb, 1000);
  assert.equal(allocationOutput(usd).processingOutputRmb, 1440);
});

test("经销销售产值按不含税万元计算，加工订单为不适用", () => {
  const period = periodState().periods[0]; const distribution = createAllocationDraft({ period, order: order("distribution"), settings, actor, quantity: 1000 });
  assert.equal(Number(allocationOutput(distribution).salesOutputWan.toFixed(6)), Number((1000 * 50 / 1.13 / 10000).toFixed(6)));
  assert.equal(allocationOutput(createAllocationDraft({ period, order: order(), settings, actor, quantity: 1000 })).salesOutputWan, null);
});

test("同一订单和同一 Assignment 可跨月关账且不改变订单有效数量", () => {
  const source = order(); const scheduled = assignment(); let state = periodState(); const september = createClosingPeriod(state, { month: "2026-09", taxRateSnapshot: 13, actor, now }).period; state = { ...state, periods: [...state.periods, september] };
  state = saveClosingAllocation(state, createAllocationDraft({ period: state.periods[0], order: source, assignment: scheduled, settings, actor, quantity: 400 }), actor).state;
  state = saveClosingAllocation(state, createAllocationDraft({ period: september, order: source, assignment: scheduled, settings, actor, quantity: 600 }), actor).state;
  const projection = projectOrderClosing(source, state); assert.equal(projection.status, "closed"); assert.equal(projection.allocatedQuantity, 1000); assert.equal(source.initialQuantity, 1000); assert.deepEqual(state.allocations.map((item) => item.scheduleAssignmentId), [scheduled.id, scheduled.id]);
});

test("超订单、超排单、超完成和待分配只产生预警不截断", () => {
  const source = order(); let state = periodState(); const period = state.periods[0]; const linked = createAllocationDraft({ period, order: source, assignment: assignment(), settings, actor, quantity: 700 }); const pending = createAllocationDraft({ period, order: source, settings, actor, quantity: 400 }); state = saveClosingAllocation(state, linked, actor).state; state = saveClosingAllocation(state, pending, actor).state;
  const codes = allocationWarnings(linked, source, state, scheduling(), settings).map((item) => item.code); assert.ok(codes.includes("order-over")); assert.ok(codes.includes("assignment-over")); assert.ok(codes.includes("completed-over")); assert.equal(projectOrderClosing(source, state).allocatedQuantity, 1100);
  assert.ok(allocationWarnings(pending, source, state, scheduling(), settings).some((item) => item.code === "pending"));
});

test("排单执行方或计划数量变化形成 stale，完成数量变化不会 stale", () => {
  const source = order(); let state = periodState(); const period = state.periods[0]; const original = assignment(); const allocation = createAllocationDraft({ period, order: source, assignment: original, settings, actor }); state = saveClosingAllocation(state, allocation, actor).state;
  const completedOnly = { ...original, completedQuantity: 500, updatedAt: "2026-08-29T00:00:00.000Z" };
  assert.equal(currentScheduleDifference(allocation, scheduling([completedOnly]), settings), null);
  const changed = { ...original, plannedQuantity: 700, updatedAt: "2026-08-29T00:00:00.000Z" };
  assert.ok(currentScheduleDifference(allocation, scheduling([changed]), settings));
  const acknowledged = acknowledgeAllocationSchedule(state, allocation.id, scheduling([changed]), settings, actor, "保留月末口径").state.allocations[0];
  assert.equal(currentScheduleDifference(acknowledged, scheduling([changed]), settings).acknowledged, true);
  const synced = syncAllocationSchedule(state, allocation.id, scheduling([changed]), settings, actor).state.allocations[0]; assert.equal(synced.scheduleBasisSnapshot.plannedQuantity, 700);
});

test("系统价格变化不污染既有关账快照，关账工价可以独立覆盖", () => {
  const source = order(); const period = periodState().periods[0]; const allocation = { ...createAllocationDraft({ period, order: source, settings, actor }), closingProcessingUnitPrice: 12 };
  source.priceVersions[0].processingUnitPrice = 15;
  assert.equal(allocation.closingProcessingUnitPrice, 12); assert.ok(allocationWarnings(allocation, source, { periods: [period], allocations: [allocation] }, scheduling(), settings).some((item) => item.code === "price-diff"));
});

test("作废归属保留历史但退出所有投影", () => {
  const source = order(); let state = periodState(); const allocation = createAllocationDraft({ period: state.periods[0], order: source, settings, actor }); state = saveClosingAllocation(state, allocation, actor).state; state = voidClosingAllocation(state, allocation.id, actor, "录错月份").state;
  assert.equal(state.allocations.length, 1); assert.equal(state.allocations[0].status, "voided"); assert.equal(projectOrderClosing(source, state).allocatedQuantity, 0);
});

test("锁账以后普通归属保存与作废都被拒绝", () => {
  const source = order(); let state = periodState(); let allocation = createAllocationDraft({ period: state.periods[0], order: source, settings, actor }); state = saveClosingAllocation(state, allocation, actor).state; state = transitionClosingPeriod(state, state.periods[0].id, "confirm", actor).state; state = transitionClosingPeriod(state, state.periods[0].id, "lock", actor).state;
  allocation = { ...allocation, quantity: 900 }; assert.throws(() => saveClosingAllocation(state, allocation, actor), /锁定/); assert.throws(() => voidClosingAllocation(state, allocation.id, actor, "修改"), /锁定/);
});

test("OperationLog 带订单、月份、归属和排单上下文", () => {
  const source = order(); const allocation = createAllocationDraft({ period: periodState().periods[0], order: source, assignment: assignment(), settings, actor }); const log = createClosingAllocationLog({ after: allocation, actor: { userId: actor.id, userName: actor.name }, action: "新增关账归属", orderNo: source.orderNo, styleNo: source.styleNo });
  assert.equal(log.afterData.orderId, source.id); assert.equal(log.afterData.closingPeriodId, allocation.closingPeriodId); assert.equal(log.afterData.scheduleAssignmentId, allocation.scheduleAssignmentId); assert.ok(log.changes.some((item) => item.field === "关账数量"));
});

test("ClosingSearchProvider 按 closing.view 过滤并搜索月份和订单", async () => {
  const source = order(); let state = periodState(); state = saveClosingAllocation(state, createAllocationDraft({ period: state.periods[0], order: source, settings, actor }), actor).state;
  const provider = createClosingSearchProvider({ load: async () => state, save: async (value) => value }, { list: async () => [source], getById: async () => source, save: async (value) => value, orderNoExists: async () => false, isAttachmentReferenced: async () => false }, () => settings);
  assert.equal(provider.canSearch({ userId: "admin", can: (key) => key === "closing.view" }), true); assert.equal(provider.canSearch({ userId: "viewer", can: () => false }), false);
  const results = await provider.search("P100", { userId: "admin", can: () => true }); assert.equal(results[0].href, "/closing-center?month=2026-08");
});

test("月度目标差额和达成率由 Closing Service 投影且不修改关账事实", () => {
  const source = order(); let state = periodState();
  state = saveClosingAllocation(state, createAllocationDraft({ period: state.periods[0], order: source, settings, actor, quantity: 600 }), actor).state;
  const before = structuredClone(state);
  const balance = projectMonthlyTargetBalance(summarizeClosing(state.allocations), { totalProcessingOutputTargetRmb: 10000, internalProcessingOutputTargetRmb: 8000 });
  assert.deepEqual(balance.total, { target: 10000, actual: 6000, difference: -4000, completionRate: 60 });
  assert.deepEqual(balance.internal, { target: 8000, actual: 0, difference: -8000, completionRate: 0 });
  assert.deepEqual(state, before);
});

test("关账权限默认只授予管理员且 order/schedule 权限不能绕过", () => {
  for (const permission of ["closing.view", "closing.edit", "closing.confirm", "closing.lock", "closing.reopen", "closing.target.manage"]) {
    assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-admin", permission), true);
    assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-quote-operator", permission), false);
    assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-viewer", permission), false);
  }
  assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-quote-operator", "quote.edit"), true);
});

test("Backup/Restore 保留 ClosingPeriod、Allocation、locked 与全部快照", async () => {
  const createStorage = () => { const values = new Map(); return { values, storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } }; };
  const sourceMemory = createStorage(); const sourceStore = createLocalDataStore({ storage: sourceMemory.storage, namespace: TEST_LOCAL_DATA_NAMESPACE, environment: "test", now: () => now }); const sourceRepo = createClosingRepository(sourceStore);
  let state = periodState(); const sourceOrder = order(); const allocation = createAllocationDraft({ period: state.periods[0], order: sourceOrder, assignment: assignment(), settings, actor, quantity: 400, now }); state = saveClosingAllocation(state, allocation, actor, now).state; state = transitionClosingPeriod(state, state.periods[0].id, "confirm", actor, { now }).state; state = transitionClosingPeriod(state, state.periods[0].id, "lock", actor, { now }).state; await sourceRepo.save(state);
  const backup = sourceStore.getRawRecords(); assert.ok(backup[`${TEST_LOCAL_DATA_NAMESPACE}.closing-center`]);
  const restoredMemory = createStorage(); const restoredStore = createLocalDataStore({ storage: restoredMemory.storage, namespace: TEST_LOCAL_DATA_NAMESPACE, environment: "test", now: () => now }); restoredStore.replaceRawRecords(backup); const restored = await createClosingRepository(restoredStore).load();
  assert.equal(restored.periods[0].status, "locked"); assert.deepEqual(restored.allocations[0].scheduleBasisSnapshot, allocation.scheduleBasisSnapshot); assert.equal(restored.allocations[0].closingProcessingUnitPrice, 10); assert.equal(restored.allocations[0].taxRateSnapshot, 13);
});

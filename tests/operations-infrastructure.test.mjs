import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  defaultOperationsSettings,
  normalizeOperationsSettings,
  saveDefaultProcessingCurrency,
  saveClosingTaxRate,
  upsertMonthlyProductionTarget,
  upsertOutsourceFactory,
  upsertProductionGroup,
  upsertProductionCalendar,
  upsertProductionSite,
  upsertSupplyHub,
  upsertTransportPlan,
} from "../features/operations-settings/model/operations-settings.ts";
import { createOperationsSettingsRepository } from "../features/operations-settings/repository/operations-settings-repository.ts";
import { createOperationsSettingsOperationLogs } from "../features/operation-logs/model/operations-settings-operation-logs.ts";
import { groupOperationLogs, operationLogCategory } from "../features/operation-logs/model/operation-log-presentation.ts";
import { DEFAULT_PERMISSION_STATE, PERMISSION_KEYS, permissionsForUser } from "../features/permissions/model/permissions.ts";
import { createPermissionRepository } from "../features/permissions/repository/permission-repository.ts";
import { createLocalDataStore } from "../features/data-management/repository/local-data-store.ts";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

const timestamp = "2026-08-26T10:00:00.000Z";
const actor = { userId: "user-admin", userName: "系统管理员" };

const productionGroup = {
  id: "production-group-1", name: "一组", shortName: "PG1", enabled: true, sortOrder: 10,
  remark: "内部生产", createdAt: timestamp, updatedAt: timestamp,
};
const outsourceFactory = {
  id: "outsource-factory-1", name: "协作工厂", shortName: "OF1", enabled: true,
  contactPerson: "王师傅", phone: "13800000000", remark: "", createdAt: timestamp, updatedAt: timestamp,
};
const monthlyTarget = {
  id: "monthly-target-2026-09", month: "2026-09", totalProcessingOutputTargetRmb: 1200000,
  internalProcessingOutputTargetRmb: 800000, remark: "旺季", createdAt: timestamp, updatedAt: timestamp,
};

test("生产组、外发厂和关账设置使用独立稳定 ID，并保留 13% 默认税率", () => {
  let state = structuredClone(defaultOperationsSettings);
  assert.equal(state.closingSettings.defaultSalesTaxRatePercent, 13);
  state = upsertProductionGroup(state, productionGroup, timestamp);
  state = upsertOutsourceFactory(state, outsourceFactory, timestamp);
  state = upsertMonthlyProductionTarget(state, monthlyTarget, timestamp);
  state = saveClosingTaxRate(state, 11);
  const renamed = upsertProductionGroup(state, { ...state.productionGroups[0], name: "针织一组" }, "2026-08-26T11:00:00.000Z");
  assert.equal(renamed.productionGroups[0].id, productionGroup.id);
  assert.equal(renamed.outsourceFactories[0].id, outsourceFactory.id);
  assert.equal(renamed.closingSettings.defaultSalesTaxRatePercent, 11);
  assert.equal(renamed.closingSettings.monthlyProductionTargets[0].totalProcessingOutputTargetRmb, 1200000);
});

test("defaultProcessingCurrency 默认 USD，并非破坏迁移旧 companyProcessingCurrency", () => {
  assert.equal(defaultOperationsSettings.defaultProcessingCurrency, "USD");
  const legacy = normalizeOperationsSettings({ companyProcessingCurrency: "CNY", productionGroups: [productionGroup] }, timestamp);
  assert.equal(legacy.defaultProcessingCurrency, "CNY");
  const updated = saveDefaultProcessingCurrency(legacy, "USD");
  assert.equal(updated.defaultProcessingCurrency, "USD");
  assert.equal(updated.productionGroups[0].id, productionGroup.id);
});

test("operations-settings repository 写入稳定 namespace 且重复加载幂等", () => {
  const storage = new MemoryStorage();
  const store = createLocalDataStore({ storage, namespace: "zhixu.erp.operations-test", environment: "test", now: () => timestamp });
  const repository = createOperationsSettingsRepository(store);
  let state = repository.load();
  state = repository.save(upsertProductionGroup(state, productionGroup, timestamp));
  assert.deepEqual(repository.load(), state);
  const envelope = JSON.parse(storage.getItem("zhixu.erp.operations-test.operations-settings"));
  assert.equal(envelope.schemaVersion, 13);
  assert.equal(envelope.data.productionGroups[0].id, productionGroup.id);
});

test("生产组和外发厂编辑、停用后刷新仍保留且 ID 不变", () => {
  const storage = new MemoryStorage();
  const store = createLocalDataStore({ storage, namespace: "zhixu.erp.master-data-refresh", environment: "test", now: () => timestamp });
  const repository = createOperationsSettingsRepository(store);
  let state = repository.load();
  state = upsertProductionGroup(state, productionGroup, timestamp);
  state = upsertOutsourceFactory(state, outsourceFactory, timestamp);
  state = upsertProductionGroup(state, { ...state.productionGroups[0], name: "一车间", enabled: false }, "2026-08-26T11:00:00.000Z");
  state = upsertOutsourceFactory(state, { ...state.outsourceFactories[0], phone: "13900000000", enabled: false }, "2026-08-26T11:00:00.000Z");
  repository.save(state);
  const refreshed = createOperationsSettingsRepository(store).load();
  assert.deepEqual(refreshed.productionGroups[0], state.productionGroups[0]);
  assert.deepEqual(refreshed.outsourceFactories[0], state.outsourceFactories[0]);
  assert.equal(refreshed.productionGroups[0].id, productionGroup.id);
  assert.equal(refreshed.outsourceFactories[0].id, outsourceFactory.id);
});

test("v3 到 v7 独立记录升级只重封 envelope，不丢失 Quote 与未知用户字段", () => {
  const storage = new MemoryStorage();
  const namespace = "zhixu.erp.v3-v4-test";
  storage.setItem(`${namespace}.manifest`, JSON.stringify({ product: "zhixu-erp", schemaVersion: 3, environment: "development", initializedAt: timestamp, updatedAt: timestamp }));
  storage.setItem(`${namespace}.quotes`, JSON.stringify({ schemaVersion: 3, initializedAt: timestamp, updatedAt: timestamp, data: [{ id: "quote-stable", customUserField: "keep-me" }] }));
  const store = createLocalDataStore({ storage, namespace, environment: "development", now: () => "2026-08-26T12:00:00.000Z" });
  const loaded = store.initialize("quotes", { seed: () => [], migrate: (value) => value.map((item) => ({ id: item.id })) });
  assert.deepEqual(loaded, [{ id: "quote-stable" }]);
  const persisted = JSON.parse(storage.getItem(`${namespace}.quotes`));
  assert.equal(persisted.schemaVersion, 13);
  assert.equal(persisted.data[0].customUserField, "keep-me");
  assert.equal(JSON.parse(storage.getItem(`${namespace}.manifest`)).schemaVersion, 13);
  const second = store.initialize("quotes", { seed: () => [], migrate: (value) => value.map((item) => ({ id: item.id })) });
  assert.deepEqual(second, [{ id: "quote-stable" }]);
  assert.deepEqual(JSON.parse(storage.getItem(`${namespace}.quotes`)), persisted);
});

test("旧数据没有 operations-settings 时只补安全默认，不覆盖已有报价", () => {
  const storage = new MemoryStorage();
  const namespace = "zhixu.erp.old-backup-test";
  const store = createLocalDataStore({ storage, namespace, environment: "test", now: () => timestamp });
  store.save("quotes", [{ id: "quote-existing" }]);
  const repository = createOperationsSettingsRepository(store);
  assert.deepEqual(repository.load(), defaultOperationsSettings);
  assert.deepEqual(store.initialize("quotes", { seed: () => [] }), [{ id: "quote-existing" }]);
});

test("raw backup/restore 自动包含 operations-settings，旧备份缺失时可安全补默认", () => {
  const sourceStorage = new MemoryStorage();
  const sourceStore = createLocalDataStore({ storage: sourceStorage, namespace: "zhixu.erp.backup-test", environment: "test", now: () => timestamp });
  const sourceRepository = createOperationsSettingsRepository(sourceStore);
  sourceStore.save("quotes", [{ id: "quote-backup" }]);
  sourceStore.save("production-scheduling", { scheduleAssignments: [{ id: "assignment-backup", salesOrderId: "order-backup" }], orderExecutionTrackings: [] });
  sourceRepository.save(upsertProductionGroup(sourceRepository.load(), productionGroup, timestamp));
  const backup = sourceStore.getRawRecords();
  assert.ok(backup["zhixu.erp.backup-test.operations-settings"]);
  assert.ok(backup["zhixu.erp.backup-test.production-scheduling"]);

  const restoredStorage = new MemoryStorage();
  const restoredStore = createLocalDataStore({ storage: restoredStorage, namespace: "zhixu.erp.backup-test", environment: "test", now: () => timestamp });
  restoredStore.replaceRawRecords(backup);
  assert.equal(createOperationsSettingsRepository(restoredStore).load().productionGroups[0].id, productionGroup.id);
  assert.deepEqual(restoredStore.initialize("quotes", { seed: () => [] }), [{ id: "quote-backup" }]);
  assert.equal(restoredStore.initialize("production-scheduling", { seed: () => ({}) }).scheduleAssignments[0].id, "assignment-backup");

  const oldBackup = Object.fromEntries(Object.entries(backup).filter(([key]) => !key.endsWith(".operations-settings")));
  restoredStore.replaceRawRecords(oldBackup);
  assert.deepEqual(createOperationsSettingsRepository(restoredStore).load(), defaultOperationsSettings);
  assert.deepEqual(restoredStore.initialize("quotes", { seed: () => [] }), [{ id: "quote-backup" }]);
});

test("管理员自动得到新增权限，报价员和查看员不会被自动扩权", () => {
  const state = structuredClone(DEFAULT_PERMISSION_STATE);
  const adminPermissions = new Set(permissionsForUser(state, "user-admin"));
  for (const key of ["order.view", "schedule.edit", "closing.lock", "settings.production_group.edit", "settings.outsource_factory.edit", "settings.closing.edit"]) {
    assert.equal(adminPermissions.has(key), true, key);
  }
  assert.equal(permissionsForUser(state, "user-quote-operator").includes("order.view"), false);
  assert.equal(permissionsForUser(state, "user-viewer").includes("closing.view"), false);
  assert.equal(new Set(PERMISSION_KEYS).size, PERMISSION_KEYS.length);
});

test("已有持久化管理员角色加载后自动补齐新权限，其他角色保持原授权", () => {
  const storage = new MemoryStorage();
  const store = createLocalDataStore({ storage, namespace: "zhixu.erp.permission-upgrade", environment: "test", now: () => timestamp });
  store.save("permission-state", { ...structuredClone(DEFAULT_PERMISSION_STATE), roles: structuredClone(DEFAULT_PERMISSION_STATE.roles).map((role) => ({ ...role, permissions: role.id === "role-admin" ? ["quote.view"] : role.permissions })) });
  const loaded = createPermissionRepository(store).load();
  assert.deepEqual(new Set(permissionsForUser(loaded, "user-admin")), new Set(PERMISSION_KEYS));
  assert.equal(permissionsForUser(loaded, "user-quote-operator").includes("settings.production_group.edit"), false);
});

test("生产基础资料和关账设置复用 OperationLog，形成字段级 before/after", () => {
  const before = structuredClone(defaultOperationsSettings);
  let after = upsertProductionGroup(before, productionGroup, timestamp);
  after = upsertOutsourceFactory(after, outsourceFactory, timestamp);
  after = upsertMonthlyProductionTarget(after, monthlyTarget, timestamp);
  after = saveClosingTaxRate(after, 12);
  const logs = createOperationsSettingsOperationLogs(before, after, actor, timestamp, "operation-settings-1");
  assert.deepEqual(logs.map((log) => log.action), ["创建生产组", "创建外发厂", "修改关账默认税率", "新增月度产值目标"]);
  assert.ok(logs.every((log) => log.operationId === "operation-settings-1"));
  assert.equal(operationLogCategory(logs[0]), "生产组");
  assert.equal(logs.find((log) => log.entityType === "ClosingSettings").changes[0].beforeValue, 13);
  assert.equal(logs.find((log) => log.entityType === "ClosingSettings").changes[0].afterValue, 12);
  const groups = groupOperationLogs(logs.map((log, index) => ({ ...log, id: `log-${index}` })));
  assert.equal(groups.length, 1);
  assert.match(groups[0].targetLabel, /生产组|一组/);
});

test("生产组、外发厂和月度目标编辑/停用日志保留明确对象及字段差异", () => {
  let before = structuredClone(defaultOperationsSettings);
  before = upsertProductionGroup(before, productionGroup, timestamp);
  before = upsertOutsourceFactory(before, outsourceFactory, timestamp);
  before = upsertMonthlyProductionTarget(before, monthlyTarget, timestamp);
  let after = upsertProductionGroup(before, { ...before.productionGroups[0], name: "一车间", remark: "新备注" }, "2026-08-26T11:00:00.000Z");
  after = upsertOutsourceFactory(after, { ...after.outsourceFactories[0], enabled: false }, "2026-08-26T11:00:00.000Z");
  after = upsertMonthlyProductionTarget(after, { ...after.closingSettings.monthlyProductionTargets[0], totalProcessingOutputTargetRmb: 1300000, internalProcessingOutputTargetRmb: 850000 }, "2026-08-26T11:00:00.000Z");
  const logs = createOperationsSettingsOperationLogs(before, after, actor, timestamp, "operation-settings-edit");
  const groupLog = logs.find((log) => log.entityType === "ProductionGroup");
  const factoryLog = logs.find((log) => log.entityType === "OutsourceFactory");
  const targetLog = logs.find((log) => log.entityType === "MonthlyProductionTarget");
  assert.equal(groupLog.action, "编辑生产组");
  assert.equal(groupLog.afterData.objectName, "一车间");
  assert.deepEqual(groupLog.changes.find((change) => change.field === "名称"), { field: "名称", beforeValue: "一组", afterValue: "一车间" });
  assert.equal(factoryLog.action, "停用外发厂");
  assert.deepEqual(factoryLog.changes, [{ field: "状态", beforeValue: "启用", afterValue: "停用" }]);
  assert.equal(targetLog.action, "修改月度产值目标");
  assert.deepEqual(targetLog.changes.find((change) => change.field === "总加工产值目标（RMB）"), { field: "总加工产值目标（RMB）", beforeValue: 1200000, afterValue: 1300000 });
});

test("基础设施页面和导航入口存在，Legacy orders/schedules/closing 路由未被重新接入", async () => {
  const [shell, pages, localStore, lifecycle] = await Promise.all([
    readFile(new URL("../components/foundation/app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/operations-settings/components/operations-settings-pages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/data-management/repository/local-data-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/data-management/service/data-management-service.ts", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /basic-settings\/production-groups/);
  assert.match(shell, /basic-settings\/outsource-factories/);
  assert.match(shell, /system-settings\/closing-settings/);
  assert.match(pages, /settings\.production_group\.edit/);
  assert.match(pages, /closing\.target\.manage/);
  assert.match(localStore, /LOCAL_DATA_SCHEMA_VERSION = 13/);
  assert.match(lifecycle, /operationsSettingsRepository\.load/);
  assert.doesNotMatch(shell, /href: "\/orders"|href: "\/schedules"|href: "\/closing"/);
});

test("生产地点、可读工作日历、集货仓和组合运输方案继续写入既有正式实体", () => {
  let state = structuredClone(defaultOperationsSettings);
  state = upsertProductionCalendar(state, { id: "calendar-test", name: "测试日历", workingWeekdays: [1, 2, 3, 4, 5, 6], exceptions: [{ id: "exception-1", date: "2026-10-01", type: "non_working", name: "国庆休息" }], enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp });
  state = upsertProductionSite(state, { id: "site-test", name: "测试工厂", countryCode: "KH", productionCalendarId: "calendar-test", preProductionSampleLeadDays: 5, enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp });
  state = upsertSupplyHub(state, { id: "hub-test", name: "测试仓", enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp });
  state = upsertTransportPlan(state, {
    route: { id: "route-test", supplyHubId: "hub-test", productionSiteId: "site-test", name: "测试仓 → 测试工厂", enabled: true, remark: "", createdAt: timestamp, updatedAt: timestamp },
    modes: [
      { id: "mode-land", routeId: "wrong-route-is-repaired", name: "陆运", transitDays: 12, enabled: true, sortOrder: 20, remark: "", createdAt: timestamp, updatedAt: timestamp },
      { id: "mode-sea", routeId: "wrong-route-is-repaired", name: "海运", transitDays: 20, enabled: true, sortOrder: 30, remark: "", createdAt: timestamp, updatedAt: timestamp },
    ],
  });
  assert.deepEqual(state.productionCalendars.find((item) => item.id === "calendar-test").workingWeekdays, [1, 2, 3, 4, 5, 6]);
  assert.equal(state.productionCalendars.find((item) => item.id === "calendar-test").exceptions[0].type, "non_working");
  assert.equal(state.productionSites.find((item) => item.id === "site-test").productionCalendarId, "calendar-test");
  assert.equal(state.supplyRoutes.find((item) => item.id === "route-test").supplyHubId, "hub-test");
  assert.deepEqual(state.transportModes.filter((item) => item.id.startsWith("mode-")).map((item) => [item.name, item.transitDays, item.routeId]), [["陆运", 12, "route-test"], ["海运", 20, "route-test"]]);
});

test("生产与运输页面按三个业务问题组织，不暴露工作日数字串或例外 JSON 编辑", async () => {
  const [page, css, fields] = await Promise.all([
    readFile(new URL("../features/operations-settings/components/operations-settings-pages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../features/operations-settings/components/production-resource-fields.tsx", import.meta.url), "utf8"),
  ]);
  for (const label of ["在哪里生产", "物料从哪里发", "仓库到工厂怎么走", "新增运输方案", "系统如何选择运输方式", "特殊日期", "周一", "周日"]) assert.match(page + fields, new RegExp(label));
  assert.match(page, /upsertTransportPlan/);
  assert.match(page, /missingRoutePairs/);
  assert.match(page, /缺少路线/);
  assert.match(page, /referenceCount=\{groupCountFor\(draft\.value\.id\)\}/);
  assert.match(fields, /当前被 \$\{referenceCount\} 个生产组使用/);
  assert.doesNotMatch(page + fields, /例外日期 JSON|workingWeekdays\.join\(","\)|0=周日|＋ 路线|＋ 运输方式/);
  assert.doesNotMatch(page, /calculateLogisticsRisk|newRiskThreshold|运输风险算法/);
  assert.match(css, /qc-infrastructure-business-section/);
  assert.match(css, /@media \(max-width:699px\)/);
});

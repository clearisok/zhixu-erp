import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalDataStore } from "../features/data-management/repository/local-data-store.ts";
import { createTablePreferenceRepository } from "../components/foundation/table-preference.ts";
import { buildProductionGroupOverview, deriveRequiredWorkdays, projectOrderSchedule } from "../features/production-scheduling/service/production-scheduling-service.ts";
import { normalizeOperationsSettings, upsertProductionGroup } from "../features/operations-settings/model/operations-settings.ts";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

test("Table Preference 按 userId 与 tableKey 隔离，并可恢复默认", () => {
  const store = createLocalDataStore({ storage: new MemoryStorage(), namespace: "zhixu.erp.test-batch56-table", environment: "test" });
  const repository = createTablePreferenceRepository(store);
  const defaults = { style: 180, action: 110 };
  repository.save("user-a", { moduleKey: "quote-center", tableKey: "quote-center.quote-list", columnWidths: { style: 260, action: 120 } }, defaults);
  repository.save("user-a", { moduleKey: "order-center", tableKey: "order-center.order-list", columnWidths: { style: 320, action: 130 } }, defaults);
  assert.equal(repository.load("user-a", "quote-center", "quote-center.quote-list", defaults).columnWidths.style, 260);
  assert.equal(repository.load("user-a", "order-center", "order-center.order-list", defaults).columnWidths.style, 320);
  assert.deepEqual(repository.load("user-b", "quote-center", "quote-center.quote-list", defaults).columnWidths, defaults);
  repository.save("user-a", { moduleKey: "quote-center", tableKey: "quote-center.quote-list", columnWidths: defaults }, defaults);
  assert.deepEqual(repository.load("user-a", "quote-center", "quote-center.quote-list", defaults).columnWidths, defaults);
});

test("订单与报价列表接入独立列宽设置和右侧 Sticky 操作列", () => {
  const order = readFileSync(new URL("../features/order-center/components/order-pages.tsx", import.meta.url), "utf8");
  const quote = readFileSync(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/order-center/order-center.css", import.meta.url), "utf8");
  assert.match(order, /order-center\.order-list/);
  assert.match(quote, /quote-center\.quote-list/);
  assert.match(order, /oc-sticky-action/);
  assert.match(css, /position:\s*sticky;\s*right:\s*0/);
});

test("订单详情款号为主视觉、订单号只读并保护未保存返回", () => {
  const source = readFileSync(new URL("../features/order-center/components/order-pages.tsx", import.meta.url), "utf8");
  assert.match(source, /title=\{order\.styleNo/);
  assert.match(source, /系统订单号/);
  assert.doesNotMatch(source, /label="订单号" required><input/);
  for (const text of ["当前订单有未保存修改", "继续编辑", "不保存并返回", "保存并返回"]) assert.match(source, new RegExp(text));
  const singleStyle = source.slice(source.indexOf('<section id="order-business"'), source.indexOf('<section id="order-delivery"'));
  assert.match(singleStyle, /客户 PO/);
  assert.doesNotMatch(singleStyle, /平均日产量|工艺说明/);
});

test("排单 UI 隐藏排期依据，新建无变更原因并联动日产与工作日", () => {
  const source = readFileSync(new URL("../features/production-scheduling/components/production-scheduling-page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /工期口径|排期依据/);
  assert.match(source, /label="平均日产"/);
  assert.match(source, /label="所需工作日"/);
  assert.match(source, /Math\.ceil\(\(form\.quantity \?\? 0\) \/ value\)/);
  assert.match(source, /Math\.ceil\(\(form\.quantity \?\? 0\) \/ workdays\)/);
  assert.match(source, /\{form\.id && <><FormItem label="完成数量"/);
  assert.deepEqual(deriveRequiredWorkdays(4000, "average_daily_output", 500, null), { requiredWorkdays: 8, averageDailyOutputSnapshot: 500 });
  assert.deepEqual(deriveRequiredWorkdays(4000, "workdays", null, 6), { requiredWorkdays: 6, averageDailyOutputSnapshot: 667 });
});

test("未排池同时包含完全未排和部分排单，全部排完后退出", () => {
  const order = { id: "o1", initialQuantity: 4000, quantityChanges: [], deliveryPlans: [] };
  const empty = { scheduleAssignments: [], orderExecutionTrackings: [] };
  assert.equal(projectOrderSchedule(order, empty).unscheduledQuantity, 4000);
  const assignment = (plannedQuantity) => ({ id: `a-${plannedQuantity}`, salesOrderId: "o1", status: "planned", executionType: "internal", plannedQuantity, completedQuantity: 0, plannedEndDate: null });
  assert.equal(projectOrderSchedule(order, { ...empty, scheduleAssignments: [assignment(1000)] }).unscheduledQuantity, 3000);
  assert.equal(projectOrderSchedule(order, { ...empty, scheduleAssignments: [assignment(4000)] }).unscheduledQuantity, 0);
});

test("15 个生产组 × 10 款只生成 15 条总览并保留组内队列", () => {
  let settings = normalizeOperationsSettings({});
  const now = "2026-08-29T00:00:00.000Z";
  const orders = [];
  const scheduleAssignments = [];
  for (let groupIndex = 1; groupIndex <= 15; groupIndex += 1) {
    const groupId = `group-${groupIndex}`;
    settings = upsertProductionGroup(settings, { id: groupId, name: `${groupIndex}组`, shortName: "", productionSiteId: settings.productionSites[0].id, enabled: true, sortOrder: groupIndex, remark: "", createdAt: now, updatedAt: now }, now);
    for (let sequence = 1; sequence <= 10; sequence += 1) {
      const orderId = `order-${groupIndex}-${sequence}`;
      orders.push({ id: orderId, orderNo: `SO-${groupIndex}-${sequence}`, styleNo: `S${groupIndex}-${sequence}`, styleName: "测试款", customerNameSnapshot: "客户", initialQuantity: 1000, quantityChanges: [], deliveryPlans: [] });
      scheduleAssignments.push({ id: `assignment-${groupIndex}-${sequence}`, salesOrderId: orderId, executionType: "internal", productionGroupId: groupId, outsourceFactoryId: null, queueSequence: sequence, plannedQuantity: 1000, completedQuantity: 0, status: sequence === 1 ? "in_progress" : "planned", plannedEndDate: `2026-09-${String(sequence + 10).padStart(2, "0")}` });
    }
  }
  const overview = buildProductionGroupOverview(orders, { scheduleAssignments, orderExecutionTrackings: [] }, settings);
  assert.equal(overview.length, 15);
  assert.ok(overview.every((group) => group.assignments.length === 10));
  assert.ok(overview.every((group) => group.current?.queueSequence === 1));
  assert.ok(overview.every((group) => group.pendingCount === 9));
});

test("排单中心正式采用总览、未排订单、异常和单组 Sticky 队列", () => {
  const source = readFileSync(new URL("../features/production-scheduling/components/production-scheduling-page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/production-scheduling/production-scheduling.css", import.meta.url), "utf8");
  for (const text of ["生产组总览", "未排订单", "异常", "ps-group-overview", "ps-group-nav", "ps-queue-table", "平均日产", "工作日", "全部数量", "新建外发厂", "面料成分"]) assert.match(source, new RegExp(text));
  assert.match(css, /ps-queue-table th \{ position:sticky/);
  assert.match(css, /ps-queue-table \.ps-sticky-action \{ position:sticky; right:0/);
});

test("报价 Sticky Header 使用 56px 克制摘要并显示款号、版本和保存状态", () => {
  const source = readFileSync(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/quote-center/quote-center.css", import.meta.url), "utf8");
  assert.match(source, /qc-sticky-header/);
  assert.match(source, /\{pageTitle\}/);
  assert.match(source, /\{activePriceDisplayName\}/);
  assert.match(source, /有未保存修改/);
  assert.match(css, /\.qc-sticky-header \{[^}]*min-height:\s*56px/);
});

test("结束排单首层支持仅记录或预览后应用建议", () => {
  const source = readFileSync(new URL("../features/production-scheduling/components/production-scheduling-page.tsx", import.meta.url), "utf8");
  assert.match(source, /title="结束排单"/);
  assert.match(source, />仅记录结束</);
  assert.match(source, />结束并应用建议</);
  assert.match(source, /setCompletionPreview\(preview\)/);
  assert.doesNotMatch(source, />下一步</);
});

test("排单页 hydration、生产组 fallback 与外发厂审计采用统一正式路径", () => {
  const source = readFileSync(new URL("../features/production-scheduling/components/production-scheduling-page.tsx", import.meta.url), "utf8");
  assert.match(source, /useState<OperationsSettingsState>\(defaultOperationsSettings\)/);
  assert.match(source, /item\?\.productionGroupId \|\| selectedGroupId \|\| settings\.productionGroups\.find/);
  assert.match(source, /createOperationsSettingsOperationLogs\(settings, nextSettings/);
  assert.match(source, /operationLogRepository\.appendMany\(logs\)/);
});

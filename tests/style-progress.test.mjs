import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseMaterialFollowUpWorkbook } from "../features/style-progress/parser/material-follow-up-parser.ts";
import { actualReadyDate, buildStyleProgressProjections, deriveMaterialStatuses, fabricDisplayOrder, trimDisplayOrder } from "../features/style-progress/service/style-progress-service.ts";
import { mergeImportedDemand } from "../features/style-progress/repository/style-progress-repository.ts";
import { recommendMaterialTransport } from "../features/production-scheduling/service/material-logistics-service.ts";
import { emptyProductionSchedulingState } from "../features/production-scheduling/model/production-scheduling.ts";
import { normalizeOperationsSettings, upsertProductionGroup } from "../features/operations-settings/model/operations-settings.ts";
import { restoreLocalDataStores } from "../features/data-management/service/local-data-restore.ts";
import { emptyStyleProgressData } from "../features/style-progress/model/style-progress.ts";

const headers = ["款号", "类型", "公司抬头", "销售合同号", "客户品牌", "业务员", "跟单人", "工厂款号", "成衣颜色", "成衣数量", "客户名称", "销售交期", "面辅料编码", "面辅料名称", "申购实际名称", "单耗", "损耗", "总耗", "门幅", "克重", "颜色", "规格成分", "提供方式", "需求数量", "样衣用量", "未采购数量", "采购数量", "采购单号", "采购日期", "供应商", "采购抬头", "采购交期", "币种", "采购人", "采购面辅料名称", "开票名称", "实际名称", "采购规格", "采购颜色", "采购数量", "采购样衣用量", "采购价格", "采购金额", "额外费用", "最大入库数", "入库单号", "入库日期", "入库数", "多余仓", "出运单号", "出运日期", "运输方式", "出运数量", "出库数量", "出库单号", "出库日期"];
const base = () => ["D1", "面料", "宁波", "PI-1", "B", "业务", "跟单", "FD1", "红色", 100, "客户", new Date("2026-10-01"), "MAT-1", "主身布", "", .5, 5, .525, "150", "200", "红色", "棉", "厂供", 50, 1, 0, 50, "", null, "", "", null, "", "", "", "", "", "", "", null, null, null, null, null, null, "", null, null, null, "", null, "", null, null, ""];

async function workbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("面辅料申购统计"); sheet.getCell("A1").value = "面辅料申购统计"; sheet.getRow(3).values = [undefined, ...headers];
  for (const row of rows) sheet.addRow(row);
  return (await workbook.xlsx.writeBuffer()).buffer;
}

test("真实展开形态按需求与事件分别去重，厂供只映射实际用量", async () => {
  const rows = [];
  for (const purchase of [["P-1", 30], ["P-2", 20]]) for (const inbound of [["IN-1", 10], ["IN-2", 15], ["IN-3", 15], ["IN-4", 10]]) {
    const row = base(); row[27] = purchase[0]; row[28] = new Date("2026-09-01"); row[31] = new Date("2026-09-10"); row[39] = purchase[1]; row[45] = inbound[0]; row[46] = new Date("2026-09-08"); row[47] = inbound[1]; row[49] = "SHIP-1"; row[50] = new Date("2026-09-09"); row[51] = "Sea"; row[52] = 50; row[54] = "OUT-1"; row[55] = new Date("2026-09-10"); row[53] = 50; rows.push(row);
  }
  rows.push([...rows[0]]);
  const preview = await parseMaterialFollowUpWorkbook({ buffer: await workbookBuffer(rows), fileName: "面辅料申购统计.xlsx", actorName: "测试", now: "2026-09-01T00:00:00.000Z" });
  assert.equal(preview.demands.length, 1); assert.equal(preview.purchaseEvents.length, 2); assert.equal(preview.inboundEvents.length, 4); assert.equal(preview.shipmentEvents.length, 1); assert.equal(preview.outboundEvents.length, 1);
  assert.equal(preview.demands[0].actualConsumption, .5); assert.equal(preview.demands[0].supplyMethod, null); assert.equal(preview.demands[0].expectedMaterialReadyDate, "2026-09-10");
  assert.equal(preview.batch.rawRowCount, 9); assert.ok(preview.batch.duplicateDemandRows >= 8); assert.ok(preview.batch.duplicateEventRows > 0);
});

test("null 与 0 不等价，相同物料的不同颜色和不同合同不合并", async () => {
  const a = base(); a[23] = 0; a[26] = 0; a[27] = "P-0"; a[39] = 0;
  const b = base(); b[20] = "蓝色"; b[8] = "蓝色";
  const c = base(); c[3] = "PI-2";
  const preview = await parseMaterialFollowUpWorkbook({ buffer: await workbookBuffer([a, b, c]), fileName: "x.xlsx", actorName: "测试" });
  assert.equal(preview.demands.length, 3); assert.equal(preview.purchaseEvents.length, 1); assert.equal(preview.purchaseEvents[0].quantity, 0);
});

test("齐套按入库事实且达到需求的日期由事件累计推导", () => {
  assert.deepEqual(deriveMaterialStatuses(100, 0, 0, 0, 0), { readinessStatus: "not_purchased", lifecycleStatus: "pending_purchase" });
  assert.deepEqual(deriveMaterialStatuses(100, 100, 60, 0, 0), { readinessStatus: "pending_inbound", lifecycleStatus: "partial_inbound" });
  assert.equal(actualReadyDate(100, [{ eventDate: "2026-09-02", quantity: 40 }, { eventDate: "2026-09-01", quantity: 60 }]), "2026-09-02");
});

test("面料按实际或计划用量稳定排序，辅料严格按来源序号", () => {
  const row = (id, type, sourceSortNo, plannedConsumption, actualConsumption) => ({ demand: { id, materialType: type, sourceSortNo, plannedConsumption, actualConsumption } });
  const materials = [row("a", "fabric", 2, 10, null), row("b", "fabric", 1, 5, 20), row("c", "trim", 9, 99, null), row("d", "trim", 3, 1, null)];
  assert.deepEqual(fabricDisplayOrder(materials).map((item) => item.demand.id), ["b", "a"]); assert.deepEqual(trimDisplayOrder(materials).map((item) => item.demand.id), ["d", "c"]);
});

test("逐物料运输无排单和缺路线不猜测，有路线选择最慢可行方式", () => {
  const now = "2026-09-01T00:00:00.000Z"; const settings = upsertProductionGroup(normalizeOperationsSettings({}), { id: "group-a", name: "一组", shortName: "", productionSiteId: "production-site-cambodia-default", enabled: true, sortOrder: 1, remark: "", createdAt: now, updatedAt: now }, now);
  assert.equal(recommendMaterialTransport({ assignment: null, settings, supplyHubId: null, expectedMaterialReadyDate: "2026-09-01" }).message, "待排单后计算");
  const assignment = { executionType: "internal", productionGroupId: "group-a", plannedStartDate: "2026-09-30" };
  assert.equal(recommendMaterialTransport({ assignment, settings, supplyHubId: null, expectedMaterialReadyDate: "2026-09-01" }).message, "物流路线未配置");
  assert.equal(recommendMaterialTransport({ assignment, settings, supplyHubId: "supply-hub-ningbo-default", expectedMaterialReadyDate: "2026-09-01" }).recommendedMode.name, "海运");
  const faster = recommendMaterialTransport({ assignment, settings, supplyHubId: "supply-hub-ningbo-default", expectedMaterialReadyDate: "2026-09-10" });
  assert.equal(faster.recommendedMode.name, "陆运"); assert.equal(faster.escalationLevel, "faster_required");
  const onlyFastest = recommendMaterialTransport({ assignment, settings, supplyHubId: "supply-hub-ningbo-default", expectedMaterialReadyDate: "2026-09-17" });
  assert.equal(onlyFastest.recommendedMode.name, "定时达"); assert.equal(onlyFastest.escalationLevel, "only_fastest");
  const late = recommendMaterialTransport({ assignment, settings, supplyHubId: "supply-hub-ningbo-default", expectedMaterialReadyDate: "2026-09-18" });
  assert.equal(late.status, "late"); assert.equal(late.gapDays, 1);
  const actualWins = recommendMaterialTransport({ assignment, settings, supplyHubId: "supply-hub-ningbo-default", expectedMaterialReadyDate: "2026-09-18", actualMaterialReadyDate: "2026-09-01" });
  assert.equal(actualWins.recommendedMode.name, "海运");
});

test("Source 更新会推进跟随值，人工 Effective 值在重导入时保留", async () => {
  const preview = await parseMaterialFollowUpWorkbook({ buffer: await workbookBuffer([base()]), fileName: "source.xlsx", actorName: "测试", now: "2026-09-01T00:00:00.000Z" });
  const first = preview.demands[0];
  assert.equal(mergeImportedDemand(first).expectedMaterialReadyDate, first.sourceMaterialDueDate);
  const changed = { ...first, sourceMaterialDueDate: "2026-09-11", expectedMaterialReadyDate: "2026-09-11", updatedAt: "2026-09-02T00:00:00.000Z" };
  const followed = mergeImportedDemand(changed, { ...first, sourceMaterialDueDate: "2026-09-10", expectedMaterialReadyDate: "2026-09-10", expectedDateSource: "source" });
  assert.equal(followed.expectedMaterialReadyDate, "2026-09-11"); assert.equal(followed.expectedDateSource, "source");
  const preserved = mergeImportedDemand(changed, { ...first, sourceMaterialDueDate: "2026-09-10", expectedMaterialReadyDate: "2026-09-13", expectedDateSource: "manual" });
  assert.equal(preserved.sourceMaterialDueDate, "2026-09-11"); assert.equal(preserved.expectedMaterialReadyDate, "2026-09-13"); assert.equal(preserved.expectedDateSource, "manual");
});

test("款式进度仅按销售合同号投影订单，不按相同款号模糊绑定或创建订单", async () => {
  const preview = await parseMaterialFollowUpWorkbook({ buffer: await workbookBuffer([base()]), fileName: "projection.xlsx", actorName: "测试" });
  const projections = buildStyleProgressProjections({
    data: preview,
    orders: [{ id: "wrong-order", salesContractNo: "OTHER", styleNo: "D1", factoryStyleNo: "FD1" }],
    scheduling: emptyProductionSchedulingState(),
    settings: normalizeOperationsSettings({}),
    today: "2026-09-01",
  });
  assert.equal(projections.length, 1); assert.equal(projections[0].order, null); assert.equal(projections[0].salesContractNo, "PI-1");
});

test("v11 Restore 同时恢复 Raw、Demand、Events、人工 Override、ImportBatch 且保留旧业务存储", async () => {
  const styleProgress = emptyStyleProgressData();
  styleProgress.batches.push({ id: "batch-1", status: "committed" });
  styleProgress.rawSnapshots.push({ id: "raw-1", normalizedDemandId: "demand-1" });
  styleProgress.demands.push({ id: "demand-1", sourceMaterialDueDate: "2026-09-10", expectedMaterialReadyDate: "2026-09-13", expectedDateSource: "manual" });
  styleProgress.purchaseEvents.push({ id: "purchase-1", materialDemandId: "demand-1" });
  styleProgress.inboundEvents.push({ id: "inbound-1", materialDemandId: "demand-1" });
  styleProgress.shipmentEvents.push({ id: "shipment-1", materialDemandId: "demand-1" });
  styleProgress.outboundEvents.push({ id: "outbound-1", materialDemandId: "demand-1" });
  const formalRecords = { "zhixu.erp.local.sales-orders": "orders-v10", "zhixu.erp.local.ainuoke-sync": "ainuoke-v10", "zhixu.erp.local.production-scheduling": "schedule-v10", "zhixu.erp.local.closing-center": "closing-v10" };
  let restoredStyleProgress = emptyStyleProgressData(); let restoredLocalRecords = { old: "state" }; let attachments = []; let templates = [];
  await restoreLocalDataStores({ attachments: [], templates: [], styleProgress, localRecords: formalRecords }, {
    exportAttachments: async () => attachments,
    replaceAttachments: async (next) => { attachments = next; },
    exportTemplates: async () => templates,
    replaceTemplates: async (next) => { templates = next; },
    exportStyleProgress: async () => restoredStyleProgress,
    replaceStyleProgress: async (next) => { restoredStyleProgress = structuredClone(next); },
    getLocalRecords: () => restoredLocalRecords,
    replaceLocalRecords: (next) => { restoredLocalRecords = structuredClone(next); },
  });
  assert.deepEqual(restoredLocalRecords, formalRecords);
  assert.equal(restoredStyleProgress.batches[0].id, "batch-1"); assert.equal(restoredStyleProgress.rawSnapshots[0].id, "raw-1");
  assert.equal(restoredStyleProgress.demands[0].expectedDateSource, "manual"); assert.equal(restoredStyleProgress.demands[0].expectedMaterialReadyDate, "2026-09-13");
  assert.deepEqual([restoredStyleProgress.purchaseEvents.length, restoredStyleProgress.inboundEvents.length, restoredStyleProgress.shipmentEvents.length, restoredStyleProgress.outboundEvents.length], [1, 1, 1, 1]);
});

import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  emptyStyleProgressData,
  countStyleProgressRecords,
  isFactorySupplied,
  migrateStyleProgressDataV3,
  migrateStyleProgressDataV4,
  removeFactorySuppliedExpectedArrivals,
  resolveCanonicalMaterialIdentity,
  validateStyleProgressData,
} from "../features/style-progress/model/style-progress.ts";
import { parseMaterialFollowUpWorkbook, resolveMaterialFollowUpColumns } from "../features/style-progress/parser/material-follow-up-parser.ts";
import { reconcileExpectedArrivalBatchesAfterImport } from "../features/style-progress/repository/style-progress-repository.ts";
import { buildStyleProgressProjections } from "../features/style-progress/service/style-progress-service.ts";
import { saveExpectedArrivalPlan, restoreExpectedArrivalPlanToSource } from "../features/style-progress/service/expected-arrival-plan-service.ts";
import { createExpectedArrivalPlanOperationLogs } from "../features/operation-logs/model/style-progress-operation-logs.ts";
import { emptyProductionSchedulingState } from "../features/production-scheduling/model/production-scheduling.ts";
import { normalizeOperationsSettings } from "../features/operations-settings/model/operations-settings.ts";

const demand = (id, overrides = {}) => ({
  id,
  salesContractNo: "PI-1",
  materialType: "fabric",
  materialCode: `SOURCE-${id}`,
  materialName: "针织布",
  sourceActualName: "罗马布",
  materialColor: "绿色",
  garmentColors: ["绿色"],
  specification: "95%棉 5%氨纶",
  supplyMethod: "自购",
  garmentQuantity: 100,
  plannedConsumption: 0.5,
  actualConsumption: null,
  lossRate: 5,
  totalConsumption: 0.525,
  width: "153.0",
  gsm: "230",
  requiredQuantity: 100,
  sampleQuantity: 1,
  sourceMaterialDueDate: "2026-08-25",
  expectedMaterialReadyDate: "2026-08-25",
  expectedDateSource: "source",
  sourceSortNo: 1,
  sourceStyleNoSnapshot: "D1935",
  sourceFactoryStyleNoSnapshot: "D1935",
  sourceBrandSnapshot: "OYSHO",
  sourceOwnerSnapshot: "跟单",
  sourceCustomerSnapshot: "来源客户",
  sourceOrderQuantitySnapshot: 100,
  sourceContractDeliveryDateSnapshot: "2026-10-13",
  lastImportBatchId: "import-1",
  sourceFileHash: "hash-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const purchase = (id, materialDemandId, unitPrice) => ({
  id,
  materialDemandId,
  purchaseOrderNo: id,
  purchaseDate: "2026-08-01",
  supplier: "供应商",
  purchaseEntity: "采购主体",
  sourceMaterialDueDate: "2026-08-25",
  currency: "RMB",
  purchaser: "采购员",
  purchasedMaterialName: "罗马布",
  invoiceName: "针织布",
  actualName: "罗马布",
  specification: "95%棉 5%氨纶",
  color: "绿色",
  quantity: 100,
  sampleQuantity: 0,
  unitPrice,
  amount: unitPrice === null ? null : unitPrice * 100,
  extraCost: null,
  importBatchId: "import-1",
  sourceRows: [4],
});

const parserHeaders = [
  "款号", "类型", "销售合同号", "成衣颜色", "成衣数量", "面辅料编码", "面辅料名称", "申购实际名称", "门幅", "克重", "颜色", "规格成分", "提供方式", "需求数量",
  "未采购数量", "采购数量", "采购单号", "采购日期", "供应商", "采购交期", "采购数量", "采购价格", "入库单号", "入库日期", "入库数", "出运单号", "出运日期", "出运数量", "出库数量", "出库单号", "出库日期",
];
const parserValues = {
  款号: "D1935", 类型: "面料", 销售合同号: "PI2607-235", 成衣颜色: "绿色", 对应成衣颜色: "紫色", 成衣数量: 100,
  面辅料编码: "202607230001", 面辅料名称: "罗马布", 申购实际名称: "罗马布", 门幅: "153", 克重: "230", 颜色: "绿色", 规格成分: "95%棉",
  提供方式: "自购", 需求数量: 100, 未采购数量: 0, 采购数量: 100, 采购单号: "P-1", 采购日期: new Date("2026-08-01"), 供应商: "供应商",
  采购交期: new Date("2026-08-25"), 采购价格: 70.5, 入库单号: "IN-1", 入库日期: new Date("2026-08-20"), 入库数: 100,
  出运单号: "SHIP-1", 出运日期: new Date("2026-08-21"), 出运数量: 80, 出库数量: 70, 出库单号: "OUT-1", 出库日期: new Date("2026-08-22"),
  计量单位: "KG",
};

async function parserWorkbook(headers) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("面辅料申购统计");
  sheet.getCell("A1").value = "面辅料申购统计";
  sheet.getRow(3).values = headers;
  const purchaseQuantityIndexes = headers.flatMap((header, index) => header === "采购数量" ? [index] : []);
  const purchaseOrderIndex = headers.indexOf("采购单号");
  const values = headers.map((header, index) => header === "采购数量"
    ? index < purchaseOrderIndex ? 0 : 100
    : parserValues[header] ?? null);
  assert.equal(purchaseQuantityIndexes.length, 2);
  sheet.addRow(values);
  const bytes = await workbook.xlsx.writeBuffer();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test("Parser 通过语义表头同时兼容旧布局与新增对应成衣颜色列", async () => {
  const oldPreview = await parseMaterialFollowUpWorkbook({ buffer: await parserWorkbook(parserHeaders), fileName: "old.xlsx", actorName: "测试" });
  assert.equal(oldPreview.batch.validRowCount, 1);
  assert.deepEqual(oldPreview.demands[0].garmentColors, ["绿色"]);
  assert.equal(oldPreview.purchaseEvents[0].quantity, 100);

  const insertedHeaders = [...parserHeaders];
  insertedHeaders.splice(insertedHeaders.indexOf("成衣颜色") + 1, 0, "对应成衣颜色");
  const newPreview = await parseMaterialFollowUpWorkbook({ buffer: await parserWorkbook(insertedHeaders), fileName: "new.xlsx", actorName: "测试" });
  assert.equal(newPreview.batch.validRowCount, 1);
  assert.deepEqual(newPreview.demands[0].garmentColors, ["绿色", "紫色"]);
  assert.equal(newPreview.purchaseEvents[0].quantity, 100);
});

test("Parser 不受无关插列和非关键列换序影响", async () => {
  const reordered = [...parserHeaders];
  reordered.splice(4, 0, "无关备注列", "计量单位");
  const supplier = reordered.indexOf("供应商");
  const purchaseDate = reordered.indexOf("采购日期");
  [reordered[supplier], reordered[purchaseDate]] = [reordered[purchaseDate], reordered[supplier]];
  const preview = await parseMaterialFollowUpWorkbook({ buffer: await parserWorkbook(reordered), fileName: "reordered.xlsx", actorName: "测试" });
  assert.equal(preview.demands[0].salesContractNo, "PI2607-235");
  assert.equal(preview.purchaseEvents[0].supplier, "供应商");
  assert.equal(preview.purchaseEvents[0].purchaseDate, "2026-08-01");
  assert.equal(Object.values(preview.rawSnapshots[0].rawFields).includes("KG"), true);
  assert.equal("unit" in preview.demands[0], false, "来源没有正式单位语义映射时只保留 Raw，不猜测单位模型");
});

test("Parser 对缺失或重复关键表头明确失败，不静默取首列", () => {
  assert.throws(() => resolveMaterialFollowUpColumns(parserHeaders.filter((header) => header !== "销售合同号")), /缺少必需列：销售合同号/);
  const duplicated = [...parserHeaders, "销售合同号"];
  assert.throws(() => resolveMaterialFollowUpColumns(duplicated), /关键表头无法唯一识别：销售合同号/);
  const duplicateEventQuantity = [...parserHeaders];
  duplicateEventQuantity.splice(duplicateEventQuantity.indexOf("入库单号"), 0, "采购数量");
  assert.throws(() => resolveMaterialFollowUpColumns(duplicateEventQuantity), /关键表头无法唯一识别：采购数量（采购事件）/);
});

test("面料 Canonical identity 在同合同同类型下仅按标准化名称聚合", () => {
  const left = demand("a", { materialCode: "202607230001", width: "153", gsm: "230.0" });
  const right = demand("b", { materialCode: "OTHER", width: "180", gsm: "300", specification: "不同规格", materialColor: "不同颜色" });
  const leftIdentity = resolveCanonicalMaterialIdentity(left, [purchase("p-a", left.id, 70.5)]);
  const rightIdentity = resolveCanonicalMaterialIdentity(right, [purchase("p-b", right.id, 80)]);
  assert.equal(leftIdentity.status, "resolved");
  assert.equal(leftIdentity.key, rightIdentity.key);
  assert.notEqual(leftIdentity.key, resolveCanonicalMaterialIdentity({ ...right, salesContractNo: "PI-2" }, [purchase("p-b3", right.id, 70.5)]).key);
  assert.notEqual(leftIdentity.key, resolveCanonicalMaterialIdentity({ ...right, materialType: "trim" }, []).key);
});

test("面料价格缺失或冲突只保留为明细事实，不再拆分汇总身份", () => {
  const left = demand("missing-a");
  const right = demand("missing-b");
  const missingLeft = resolveCanonicalMaterialIdentity(left, []);
  const missingRight = resolveCanonicalMaterialIdentity(right, []);
  assert.equal(missingLeft.status, "resolved");
  assert.equal(missingLeft.key, missingRight.key);
  const conflict = resolveCanonicalMaterialIdentity(left, [purchase("p-1", left.id, 70.5), purchase("p-2", left.id, 80)]);
  assert.equal(conflict.status, "resolved");
  assert.deepEqual(conflict.purchasePrices, [70.5, 80]);
  assert.equal(conflict.key, missingLeft.key);
});

test("辅料在同一合同内按标准化名称聚合，规格、颜色和来源编码不参与身份", () => {
  const left = demand("trim-a", { materialType: "trim", materialName: " 拉链 ", sourceActualName: "", specification: "3#", materialColor: "黑色" });
  const right = demand("trim-b", { materialType: "trim", materialName: "拉链", sourceActualName: "", specification: "5#", materialColor: "白色", materialCode: "OTHER" });
  assert.equal(resolveCanonicalMaterialIdentity(left, []).key, resolveCanonicalMaterialIdentity(right, []).key);
});

test("旧单日期非破坏迁移为批次，人工语义保留且幂等", () => {
  const data = { ...emptyStyleProgressData(), dataVersion: 2 };
  data.demands = [
    demand("a", { requiredQuantity: 60 }),
    demand("b", { requiredQuantity: 40 }),
    demand("manual", { expectedMaterialReadyDate: "2026-09-01", expectedDateSource: "manual", requiredQuantity: 25 }),
    demand("factory", { supplyMethod: "厂供", requiredQuantity: 999 }),
  ];
  data.purchaseEvents = [purchase("p-a", "a", 70.5), purchase("p-b", "b", 70.5), purchase("p-manual", "manual", 70.5)];
  const migrated = migrateStyleProgressDataV3(data);
  assert.equal(migrated.dataVersion, 3);
  assert.equal(migrated.expectedArrivalBatches.length, 2);
  const sourceBatch = migrated.expectedArrivalBatches.find((item) => item.dateSource === "source");
  const manualBatch = migrated.expectedArrivalBatches.find((item) => item.dateSource === "manual");
  assert.deepEqual(sourceBatch.allocations.map((item) => [item.materialDemandId, item.quantity]), [["a", 60], ["b", 40]]);
  assert.equal(manualBatch.expectedArrivalAtHubDate, "2026-09-01");
  assert.equal(manualBatch.allocations[0].materialDemandId, "manual");
  assert.ok(isFactorySupplied(data.demands[3]));
  assert.equal(migrated.expectedArrivalBatches.some((item) => item.allocations.some((allocation) => allocation.materialDemandId === "factory")), false);
  assert.deepEqual(migrateStyleProgressDataV3(migrated), migrated);
});

test("v4 确定性 remap 旧 Canonical key，保留人工批次、Allocation 与审计字段且幂等", () => {
  const timestamp = "2026-08-01T00:00:00.000Z";
  const left = demand("left", { width: "153", gsm: "230", requiredQuantity: 60 });
  const right = demand("right", { materialCode: "OTHER", width: "180", gsm: "300", requiredQuantity: 40 });
  const data = { ...emptyStyleProgressData(), dataVersion: 3 };
  data.demands = [left, right];
  data.purchaseEvents = [purchase("p-left", left.id, 70.5), purchase("p-right", right.id, 80)];
  data.expectedArrivalBatches = [
    { id: "manual-left", salesContractNo: "PI-1", canonicalMaterialKey: "legacy-price-70", expectedArrivalAtHubDate: "2026-08-25", dateSource: "manual", allocations: [{ id: "allocation-left", materialDemandId: left.id, quantity: 30 }], createdAt: timestamp, createdBy: "planner", updatedAt: timestamp, updatedBy: "planner" },
    { id: "manual-right", salesContractNo: "PI-1", canonicalMaterialKey: "legacy-price-80", expectedArrivalAtHubDate: "2026-09-01", dateSource: "manual", allocations: [{ id: "allocation-right", materialDemandId: right.id, quantity: 25 }], createdAt: timestamp, createdBy: "planner", updatedAt: timestamp, updatedBy: "planner" },
  ];
  const migrated = migrateStyleProgressDataV4(data);
  assert.equal(migrated.dataVersion, 4);
  assert.equal(migrated.expectedArrivalBatches.length, 2);
  assert.equal(new Set(migrated.expectedArrivalBatches.map((batch) => batch.canonicalMaterialKey)).size, 1);
  assert.deepEqual(migrated.expectedArrivalBatches.map((batch) => [batch.id, batch.dateSource, batch.allocations[0].id, batch.createdBy, batch.updatedBy]), [
    ["manual-left", "manual", "allocation-left", "planner", "planner"],
    ["manual-right", "manual", "allocation-right", "planner", "planner"],
  ]);
  assert.deepEqual(migrateStyleProgressDataV4(migrated), migrated);
});

test("v4 migration 拒绝把一个旧批次猜测归入两个新的物料名称", () => {
  const left = demand("left");
  const right = demand("right", { materialName: "不同物料", sourceActualName: "不同物料" });
  const data = { ...emptyStyleProgressData(), dataVersion: 3, demands: [left, right] };
  data.expectedArrivalBatches = [{ id: "ambiguous", salesContractNo: "PI-1", canonicalMaterialKey: "legacy-key", expectedArrivalAtHubDate: "2026-09-01", dateSource: "manual", allocations: [{ id: "left", materialDemandId: left.id, quantity: 10 }, { id: "right", materialDemandId: right.id, quantity: 10 }], createdAt: left.createdAt, createdBy: "u", updatedAt: left.updatedAt, updatedBy: "u" }];
  assert.throws(() => migrateStyleProgressDataV4(data), /包含多个真实物料身份/);
});

test("v4 validator 拒绝 Restore payload 中的错误 canonical key 和空 Allocation 批次", () => {
  const material = demand("a");
  const canonicalMaterialKey = resolveCanonicalMaterialIdentity(material, []).key;
  const data = { ...emptyStyleProgressData(), demands: [material] };
  const batch = { id: "batch", salesContractNo: "PI-1", canonicalMaterialKey, expectedArrivalAtHubDate: "2026-09-01", dateSource: "manual", allocations: [{ id: "allocation", materialDemandId: material.id, quantity: 10 }], createdAt: material.createdAt, createdBy: "u", updatedAt: material.updatedAt, updatedBy: "u" };
  data.expectedArrivalBatches = [{ ...batch, canonicalMaterialKey: "wrong-key" }];
  assert.throws(() => validateStyleProgressData(data), /canonicalMaterialKey 与 Allocation 物料身份不一致/);
  data.expectedArrivalBatches = [{ ...batch, allocations: [] }];
  assert.throws(() => validateStyleProgressData(data), /至少包含一个 Allocation/);
  assert.throws(() => migrateStyleProgressDataV4({ ...data, dataVersion: 3 }), /至少包含一个 Allocation/);
});

test("批次允许部分分配和一需求多批，但拒绝超分配", () => {
  const data = emptyStyleProgressData();
  data.demands = [demand("a", { requiredQuantity: 100 })];
  const canonicalMaterialKey = resolveCanonicalMaterialIdentity(data.demands[0], []).key;
  data.expectedArrivalBatches = [
    { id: "batch-a", salesContractNo: "PI-1", canonicalMaterialKey, expectedArrivalAtHubDate: "2026-08-25", dateSource: "manual", allocations: [{ id: "allocation-a", materialDemandId: "a", quantity: 40 }], createdAt: "2026-08-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-08-01T00:00:00.000Z", updatedBy: "u" },
    { id: "batch-b", salesContractNo: "PI-1", canonicalMaterialKey, expectedArrivalAtHubDate: "2026-09-01", dateSource: "manual", allocations: [{ id: "allocation-b", materialDemandId: "a", quantity: 50 }], createdAt: "2026-08-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-08-01T00:00:00.000Z", updatedBy: "u" },
  ];
  assert.equal(validateStyleProgressData(data).expectedArrivalBatches.length, 2);
  data.expectedArrivalBatches[1].allocations[0].quantity = 61;
  assert.throws(() => validateStyleProgressData(data), /超出需求数量/);
});

test("重导入保留人工计划、刷新来源计划并移除厂供 Allocation", () => {
  const a = demand("manual", { requiredQuantity: 100, sourceMaterialDueDate: "2026-09-01" });
  const b = demand("source", { requiredQuantity: 80, sourceMaterialDueDate: "2026-09-05" });
  const factory = demand("factory", { requiredQuantity: 999, supplyMethod: "厂供", sourceMaterialDueDate: "2026-09-09" });
  const existingBatches = [
    { id: "manual-batch", salesContractNo: "PI-1", canonicalMaterialKey: "manual-key", expectedArrivalAtHubDate: "2026-08-30", dateSource: "manual", allocations: [{ id: "ma", materialDemandId: a.id, quantity: 40 }], createdAt: a.createdAt, createdBy: "user", updatedAt: a.updatedAt, updatedBy: "user" },
    { id: "source-old", salesContractNo: "PI-1", canonicalMaterialKey: "old-key", expectedArrivalAtHubDate: "2026-08-25", dateSource: "source", allocations: [{ id: "sa", materialDemandId: b.id, quantity: 80 }, { id: "fa", materialDemandId: factory.id, quantity: 999 }], createdAt: a.createdAt, createdBy: "source-import", updatedAt: a.updatedAt, updatedBy: "source-import" },
  ];
  const next = reconcileExpectedArrivalBatchesAfterImport({ existingBatches, incomingDemands: [a, b, factory], incomingPurchaseEvents: [purchase("p-a", a.id, 70.5), purchase("p-b", b.id, 70.5)] });
  assert.deepEqual(next.find((batch) => batch.id === "manual-batch").allocations, existingBatches[0].allocations);
  assert.equal(next.some((batch) => batch.allocations.some((allocation) => allocation.materialDemandId === factory.id)), false);
  const source = next.find((batch) => batch.allocations.some((allocation) => allocation.materialDemandId === b.id));
  assert.equal(source.expectedArrivalAtHubDate, "2026-09-05");
  assert.equal(source.dateSource, "source");
  assert.equal(source.allocations[0].quantity, 80);
});

test("厂供 backfill 后从 Expected Arrival、采购跟进、齐套、风险与物流投影全部退出", () => {
  const data = emptyStyleProgressData();
  const operational = demand("operational", { materialType: "trim", materialName: "拉链", sourceActualName: "", requiredQuantity: 20, supplyMethod: "自购" });
  const factory = demand("factory", { materialType: "trim", materialName: "厂供纽扣", sourceActualName: "", requiredQuantity: 999, supplyMethod: "厂供" });
  data.demands = [operational, factory];
  data.expectedArrivalBatches = [{ id: "mixed", salesContractNo: "PI-1", canonicalMaterialKey: "mixed", expectedArrivalAtHubDate: "2026-09-01", dateSource: "manual", allocations: [{ id: "oa", materialDemandId: operational.id, quantity: 20 }, { id: "fa", materialDemandId: factory.id, quantity: 999 }], createdAt: operational.createdAt, createdBy: "u", updatedAt: operational.updatedAt, updatedBy: "u" }];
  const sanitized = removeFactorySuppliedExpectedArrivals(data);
  assert.deepEqual(sanitized.expectedArrivalBatches[0].allocations.map((item) => item.materialDemandId), [operational.id]);
  const projection = buildStyleProgressProjections({ data: sanitized, orders: [], scheduling: emptyProductionSchedulingState(), settings: normalizeOperationsSettings({}), today: "2026-09-01" })[0];
  assert.equal(projection.totalMaterials, 1);
  assert.equal(projection.trimTotal, 1);
  assert.equal(projection.notPurchasedCount, 1);
  assert.equal(projection.factorySuppliedDemands.length, 1);
  assert.equal(projection.materials.some((item) => item.demand.id === factory.id), false);
});

test("预计到料 Service 只使用正式 Repository 与唯一 OperationLog，恢复来源具有明确动作", async () => {
  const sourceBatch = { id: "source", salesContractNo: "PI-1", canonicalMaterialKey: "key", expectedArrivalAtHubDate: "2026-09-01", dateSource: "source", allocations: [{ id: "a", materialDemandId: "d", quantity: 10 }], createdAt: "2026-08-01T00:00:00.000Z", createdBy: "source", updatedAt: "2026-08-01T00:00:00.000Z", updatedBy: "source" };
  const manualBatch = { ...sourceBatch, id: "manual", expectedArrivalAtHubDate: "2026-09-05", dateSource: "manual", createdBy: "user", updatedBy: "user" };
  const appended = [];
  const dependencies = {
    repository: {
      replaceExpectedArrivalBatches: async () => ({ before: [sourceBatch], after: [manualBatch] }),
      restoreExpectedArrivalBatchesToSource: async () => ({ before: [manualBatch], after: [sourceBatch] }),
    },
    logs: { appendMany: async (logs) => { appended.push(...logs); return logs; } },
  };
  const command = { salesContractNo: "PI-1", canonicalMaterialKey: "key", materialDemandIds: ["d"], batches: [manualBatch], actor: { userId: "u", userName: "用户" }, orderId: "order-1", orderNo: "SO-1", orderStyleNo: "D1935" };
  await saveExpectedArrivalPlan(command, dependencies);
  await restoreExpectedArrivalPlanToSource({ ...command, batches: undefined }, dependencies);
  assert.equal(appended[0].module, "款式进度");
  assert.equal(appended[0].entityType, "MaterialExpectedArrivalBatch");
  assert.equal(appended.at(-1).action, "恢复使用来源计划");
  assert.equal(appended.at(-1).afterData.salesContractNo, "PI-1");
  assert.equal(appended.at(-1).afterData.orderStyleNo, "D1935");
});

test("预计到料 OperationLog 区分创建、修改日期、调整分配与删除", () => {
  const baseBatch = { id: "batch", salesContractNo: "PI-1", canonicalMaterialKey: "key", expectedArrivalAtHubDate: "2026-09-01", dateSource: "manual", allocations: [{ id: "a", materialDemandId: "d", quantity: 10 }], createdAt: "2026-08-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-08-01T00:00:00.000Z", updatedBy: "u" };
  const context = { actor: { userId: "u", userName: "用户" }, salesContractNo: "PI-1", canonicalMaterialKey: "key" };
  assert.deepEqual(createExpectedArrivalPlanOperationLogs({ ...context, before: [], after: [baseBatch] }).map((log) => log.action), ["创建预计到料批次"]);
  assert.deepEqual(createExpectedArrivalPlanOperationLogs({ ...context, before: [baseBatch], after: [{ ...baseBatch, expectedArrivalAtHubDate: "2026-09-02", allocations: [{ ...baseBatch.allocations[0], quantity: 8 }] }] }).map((log) => log.action), ["修改预计到料批次", "调整预计到料分配"]);
  assert.deepEqual(createExpectedArrivalPlanOperationLogs({ ...context, before: [baseBatch], after: [] }).map((log) => log.action), ["删除预计到料批次"]);
});

test("Backup / Restore 数据集合计数包含 Expected Arrival Batch，旧备份仍可默认空集合", () => {
  const data = emptyStyleProgressData();
  data.demands = [demand("a")];
  data.expectedArrivalBatches = [{ id: "batch", salesContractNo: "PI-1", canonicalMaterialKey: "key", expectedArrivalAtHubDate: "2026-09-01", dateSource: "manual", allocations: [{ id: "a", materialDemandId: "a", quantity: 10 }], createdAt: "2026-08-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-08-01T00:00:00.000Z", updatedBy: "u" }];
  assert.equal(countStyleProgressRecords(data), 2);
  const legacy = { ...data, dataVersion: 2 };
  delete legacy.expectedArrivalBatches;
  assert.deepEqual(validateStyleProgressData(legacy).expectedArrivalBatches, []);
});

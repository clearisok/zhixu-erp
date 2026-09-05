import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyStyleProgressData } from "../features/style-progress/model/style-progress.ts";
import { buildStyleProgressProjections } from "../features/style-progress/service/style-progress-service.ts";
import { emptyProductionSchedulingState } from "../features/production-scheduling/model/production-scheduling.ts";
import { normalizeOperationsSettings } from "../features/operations-settings/model/operations-settings.ts";

const component = readFileSync(new URL("../features/style-progress/components/material-control-tower.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../features/style-progress/components/style-progress-pages.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/order-center/style-progress/style-progress.css", import.meta.url), "utf8");

const demand = {
  id: "demand-a",
  salesContractNo: "PI2607-235",
  materialType: "fabric",
  materialCode: "202607230001",
  materialName: "申购罗马布",
  sourceActualName: "罗马布",
  materialColor: "紫色",
  garmentColors: ["紫色"],
  specification: "153cm / 230gsm",
  supplyMethod: "自购",
  garmentQuantity: 100,
  plannedConsumption: 0.5,
  actualConsumption: 0.52,
  lossRate: 5,
  totalConsumption: 52,
  width: "153",
  gsm: "230",
  requiredQuantity: 100,
  sampleQuantity: 1,
  sourceMaterialDueDate: "2026-08-25",
  expectedMaterialReadyDate: "2026-08-25",
  expectedDateSource: "source",
  sourceSortNo: 1,
  sourceStyleNoSnapshot: "D1935",
  sourceFactoryStyleNoSnapshot: "D1935",
  sourceBrandSnapshot: "Boden",
  sourceOwnerSnapshot: "负责人",
  sourceCustomerSnapshot: "普通 UI 不得显示",
  sourceOrderQuantitySnapshot: 100,
  sourceContractDeliveryDateSnapshot: "2026-10-13",
  lastImportBatchId: "batch-a",
  sourceFileHash: "hash-a",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

test("Gate 4 V4 route renders the canonical Material Control Tower instead of the legacy flat-demand table", () => {
  assert.match(page, /<MaterialControlTower projection=\{projection\}/);
  assert.match(component, /projection\.canonicalMaterials\.filter/);
  assert.match(component, /STYLE PROGRESS · MATERIAL CONTROL TOWER/);
  assert.match(component, /合同交期/);
  assert.match(component, /面料齐套/);
  assert.match(component, /辅料齐套/);
  assert.match(component, /总齐套率/);
  assert.match(component, /需要跟进/);
  assert.doesNotMatch(component, /updateExpectedDate/);
  assert.doesNotMatch(component, /projection\.customer/);
});

test("Gate 4 factory-supply action is conditional and factory facts stay in a read-only information drawer", () => {
  assert.match(component, /projection\.factorySuppliedDemands\.length > 0/);
  assert.match(component, />厂供信息</);
  assert.match(component, /厂供仅用于来源追溯，不进入采购、齐套、风险、物流或预计到料计划/);
  assert.doesNotMatch(component, /厂供排除/);
});

test("Gate 4 expanded demand rows expose shipment facts and honest multi-batch summaries in an internal horizontal region", () => {
  for (const label of ["颜色 / 规格", "需求", "采购", "入库", "出运", "当前状态", "当前预计到料", "推荐出运", "预计到厂", "距上线", "实际入库"]) assert.match(component, new RegExp(label));
  assert.match(component, /row\.shipmentQuantity/);
  assert.match(component, /row\.batchSummary\.expectedArrival/);
  assert.match(component, /row\.batchSummary\.recommendedTransport/);
  assert.match(component, /sp-v4-color-scroll/);
  assert.match(css, /\.sp-v4-color-scroll[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.sp-v4-page \{ width: 100%; max-width: none; min-width: 0; \}/);
});

test("Gate 4 Batch Planner uses the formal service, permits partial plans, and blocks over-allocation without auto-fill", () => {
  assert.match(component, /saveExpectedArrivalPlan/);
  assert.match(component, /restoreExpectedArrivalPlanToSource/);
  assert.match(component, /recommendMaterialTransport/);
  assert.match(component, /calculateDaysToProduction/);
  assert.match(component, /运输 Buffer/);
  assert.match(component, /total > row\.demand\.requiredQuantity \+ 1e-9/);
  assert.match(component, /超分配：已安排/);
  assert.match(component, /未安排 \{quantity\(Math\.max\(0,/);
  assert.doesNotMatch(component, /requiredQuantity\s*-\s*total[^\n]*updateQuantity/);
  assert.match(component, /disabled=\{!can\("style_progress\.edit"\)\}/);
});

test("Gate 4 multi-event Drawer keeps purchase, inbound, shipment, outbound and date facts separate", () => {
  for (const tab of ["物料", "单耗 / 需求", "采购", "入库", "出运", "出库", "日期", "分批到料"]) assert.match(component, new RegExp(tab));
  assert.match(component, /event\.transportModeSnapshot/);
  assert.match(component, /event\.sourceRows\.join/);
  assert.doesNotMatch(component, /平均采购价/);
});

test("Gate 4 consistency projection reports mismatches without changing source or purchase facts", () => {
  const data = emptyStyleProgressData();
  data.demands = [demand];
  data.purchaseEvents = [{
    id: "purchase-a",
    materialDemandId: demand.id,
    purchaseOrderNo: "PO-A",
    purchaseDate: "2026-08-01",
    supplier: "供应商",
    purchaseEntity: "采购主体",
    sourceMaterialDueDate: "2026-08-25",
    currency: "RMB",
    purchaser: "采购员",
    purchasedMaterialName: "采购罗马布",
    invoiceName: "开票罗马布",
    actualName: "采购实际罗马布",
    specification: "160cm / 220gsm",
    color: "藏青",
    quantity: 100,
    sampleQuantity: 0,
    unitPrice: 70.5,
    amount: 7050,
    extraCost: 0,
    importBatchId: "batch-a",
    sourceRows: [4],
  }];
  const projection = buildStyleProgressProjections({ data, orders: [], scheduling: emptyProductionSchedulingState(), settings: normalizeOperationsSettings({}), today: "2026-09-01" })[0];
  assert.deepEqual(projection.canonicalMaterials[0].consistencyIssues.map((item) => item.field), ["material_name", "specification", "color"]);
  assert.equal(demand.sourceActualName, "罗马布");
  assert.equal(data.purchaseEvents[0].actualName, "采购实际罗马布");
});

test("Gate 4 responsive contract keeps task controls touch-sized and document width bounded", () => {
  assert.match(css, /@media \(max-width: 960px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.sp-v4-filter select, \.sp-v4-filter input \{ grid-column: auto; height: 44px; \}/);
  assert.match(css, /\.sp-v4-card-actions \.qc-button \{ min-height: 44px; \}/);
  assert.match(css, /max-width: 100%; overflow-x: auto/);
});

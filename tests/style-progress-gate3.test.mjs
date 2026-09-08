import test from "node:test";
import assert from "node:assert/strict";
import { emptyStyleProgressData } from "../features/style-progress/model/style-progress.ts";
import {
  bufferRiskForDays,
  buildStyleProgressProjections,
  calculateDaysToProduction,
} from "../features/style-progress/service/style-progress-service.ts";
import { emptyProductionSchedulingState } from "../features/production-scheduling/model/production-scheduling.ts";
import { normalizeOperationsSettings, upsertProductionGroup } from "../features/operations-settings/model/operations-settings.ts";

const now = "2026-08-01T00:00:00.000Z";
const demand = (id, overrides = {}) => ({
  id,
  salesContractNo: "PI2607-235",
  materialType: "fabric",
  materialCode: `SOURCE-${id}`,
  materialName: "针织布",
  sourceActualName: "罗马布",
  materialColor: "紫色",
  garmentColors: ["紫色"],
  specification: "95%棉 5%氨纶",
  supplyMethod: "自购",
  garmentQuantity: 100,
  plannedConsumption: 0.5,
  actualConsumption: null,
  lossRate: 5,
  totalConsumption: 0.525,
  width: "153",
  gsm: "230",
  requiredQuantity: 100,
  sampleQuantity: 0,
  sourceMaterialDueDate: "2026-08-20",
  expectedMaterialReadyDate: "2026-08-20",
  expectedDateSource: "source",
  sourceSortNo: 1,
  sourceStyleNoSnapshot: "D1935",
  sourceFactoryStyleNoSnapshot: "D1935",
  sourceBrandSnapshot: "OYSHO",
  sourceOwnerSnapshot: "跟单员",
  sourceCustomerSnapshot: "不得回退显示的来源客户",
  sourceOrderQuantitySnapshot: 100,
  sourceContractDeliveryDateSnapshot: "2026-10-13",
  lastImportBatchId: "import-1",
  sourceFileHash: "hash-1",
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const purchase = (id, materialDemandId, quantity, unitPrice = 70.5) => ({
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
  color: "紫色",
  quantity,
  sampleQuantity: 0,
  unitPrice,
  amount: quantity * unitPrice,
  extraCost: null,
  importBatchId: "import-1",
  sourceRows: [4],
});

const event = (id, materialDemandId, quantity, eventDate = "2026-08-22") => ({
  id,
  materialDemandId,
  documentNo: id,
  eventDate,
  quantity,
  importBatchId: "import-1",
  sourceRows: [4],
});

const expectedBatch = (id, date, allocations) => ({
  id,
  salesContractNo: "PI2607-235",
  canonicalMaterialKey: "legacy-key-is-not-used-as-an-event-link",
  expectedArrivalAtHubDate: date,
  dateSource: "manual",
  allocations: allocations.map(([materialDemandId, quantity], index) => ({ id: `${id}-${index}`, materialDemandId, quantity })),
  createdAt: now,
  createdBy: "planner",
  updatedAt: now,
  updatedBy: "planner",
});

function schedulingAndSettings() {
  const settings = upsertProductionGroup(normalizeOperationsSettings({}), {
    id: "group-a",
    name: "一组",
    shortName: "",
    productionSiteId: "production-site-cambodia-default",
    enabled: true,
    sortOrder: 1,
    remark: "",
    createdAt: now,
    updatedAt: now,
  }, now);
  const scheduling = {
    ...emptyProductionSchedulingState(),
    scheduleAssignments: [{ id: "assignment-a", salesOrderId: "order-a", executionType: "internal", productionGroupId: "group-a", plannedStartDate: "2026-09-22", status: "planned" }],
    orderExecutionTrackings: [{ salesOrderId: "order-a", supplyHubId: "supply-hub-ningbo-default" }],
  };
  return { settings, scheduling };
}

test("Gate 3 operational projection uses canonical materials and excludes factory-supplied demands everywhere", () => {
  const data = emptyStyleProgressData();
  const purple = demand("purple", { materialCode: "202607230001", requiredQuantity: 60 });
  const navy = demand("navy", { materialCode: "202607230099", materialColor: "藏青", garmentColors: ["藏青"], requiredQuantity: 40, sourceSortNo: 2 });
  const factory = demand("factory", { materialCode: "202608130002", materialName: "厂供里布", sourceActualName: "厂供里布", supplyMethod: "厂供", requiredQuantity: 3809, sourceSortNo: 3 });
  data.demands = [purple, navy, factory];
  data.purchaseEvents = [purchase("p-purple", purple.id, 60), purchase("p-navy", navy.id, 40), purchase("p-factory", factory.id, 3809)];
  data.inboundEvents = [event("in-purple", purple.id, 60), event("in-navy", navy.id, 20), event("in-factory", factory.id, 3809)];
  data.shipmentEvents = [{ ...event("ship-purple", purple.id, 25), transportModeSnapshot: "海运" }, { ...event("ship-navy", navy.id, 10), transportModeSnapshot: "陆运" }, { ...event("ship-factory", factory.id, 3809), transportModeSnapshot: "厂供" }];
  data.outboundEvents = [event("out-purple", purple.id, 7), event("out-navy", navy.id, 3), event("out-factory", factory.id, 3809)];
  data.expectedArrivalBatches = [
    expectedBatch("batch-a", "2026-08-25", [[purple.id, 30], [navy.id, 10]]),
    expectedBatch("batch-b", "2026-09-01", [[purple.id, 30], [navy.id, 30]]),
    expectedBatch("factory-batch", "2026-08-20", [[factory.id, 3809]]),
  ];
  const { settings, scheduling } = schedulingAndSettings();
  const order = { id: "order-a", salesContractNo: "PI2607-235", styleNo: "D1935", factoryStyleNo: "D1935", brandNameSnapshot: "OYSHO", customerNameSnapshot: "", initialQuantity: 100, quantityChanges: [], contractDeliveryDate: "2026-10-13" };
  const projection = buildStyleProgressProjections({ data, orders: [order], scheduling, settings, today: "2026-09-01" })[0];

  assert.equal(projection.customer, "");
  assert.equal(projection.canonicalMaterials.length, 1);
  assert.equal(projection.totalMaterials, 1);
  assert.equal(projection.fabricTotal, 1);
  assert.equal(projection.factorySuppliedDemands.length, 1);
  assert.equal(projection.materials.some((item) => item.demand.id === factory.id), false);
  assert.equal(projection.canonicalMaterials[0].demands.length, 2);
  assert.deepEqual(projection.canonicalMaterials[0].materialCodes, ["202607230001", "202607230099"]);
  assert.equal(projection.canonicalMaterials[0].requiredQuantity, 100);
  assert.equal(projection.canonicalMaterials[0].purchasedQuantity, 100);
  assert.equal(projection.canonicalMaterials[0].inboundQuantity, 80);
  assert.equal(projection.canonicalMaterials[0].shipmentQuantity, 35);
  assert.equal(projection.canonicalMaterials[0].outboundQuantity, 10);
  assert.equal(projection.canonicalMaterials[0].isReady, false);
  assert.equal(projection.readinessRate, 0);
  assert.equal(projection.canonicalMaterials[0].expectedArrivalBatches.length, 2);
  assert.equal(projection.canonicalMaterials[0].expectedArrivalBatches.some((item) => item.batch.id === "factory-batch"), false);
});

test("name-only Canonical group preserves width/GSM/code/price variants and does not double-count child events", () => {
  const data = emptyStyleProgressData();
  const first = demand("variant-a", { materialCode: "CODE-A", width: "153", gsm: "230", requiredQuantity: 60 });
  const second = demand("variant-b", { materialCode: "CODE-B", width: "180", gsm: "300", materialColor: "藏青", specification: "不同规格", requiredQuantity: 40, sourceSortNo: 2 });
  data.demands = [first, second];
  data.purchaseEvents = [purchase("purchase-a", first.id, 60, 70.5), purchase("purchase-b", second.id, 40, 80)];
  data.inboundEvents = [event("inbound-a", first.id, 30), event("inbound-b", second.id, 10)];
  data.shipmentEvents = [{ ...event("shipment-a", first.id, 12), transportModeSnapshot: "海运" }, { ...event("shipment-b", second.id, 8), transportModeSnapshot: "陆运" }];
  data.outboundEvents = [event("outbound-a", first.id, 5), event("outbound-b", second.id, 3)];
  const { settings, scheduling } = schedulingAndSettings();
  const order = { id: "order-a", salesContractNo: "PI2607-235", styleNo: "D1935", factoryStyleNo: "D1935", brandNameSnapshot: "OYSHO", customerNameSnapshot: "", initialQuantity: 100, quantityChanges: [], contractDeliveryDate: "2026-10-13" };
  const canonical = buildStyleProgressProjections({ data, orders: [order], scheduling, settings, today: "2026-09-01" })[0].canonicalMaterials;

  assert.equal(canonical.length, 1);
  assert.deepEqual(canonical[0].materialCodes, ["CODE-A", "CODE-B"]);
  assert.deepEqual(canonical[0].demands.map((item) => [item.demand.width, item.demand.gsm, item.purchaseEvents[0].unitPrice]), [["153", "230", 70.5], ["180", "300", 80]]);
  assert.equal(canonical[0].requiredQuantity, 100);
  assert.equal(canonical[0].purchasedQuantity, 100);
  assert.equal(canonical[0].inboundQuantity, 40);
  assert.equal(canonical[0].shipmentQuantity, 20);
  assert.equal(canonical[0].outboundQuantity, 8);
  assert.equal(canonical[0].isReady, false);
});

test("Gate 3 computes every expected-arrival batch through the formal logistics service and keeps multi-batch summaries honest", () => {
  const data = emptyStyleProgressData();
  const purple = demand("purple", { requiredQuantity: 60 });
  const navy = demand("navy", { materialCode: "OTHER", materialColor: "藏青", requiredQuantity: 40, sourceSortNo: 2 });
  data.demands = [purple, navy];
  data.purchaseEvents = [purchase("p-purple", purple.id, 60), purchase("p-navy", navy.id, 40)];
  data.inboundEvents = [event("in-purple", purple.id, 60, "2026-08-28")];
  data.expectedArrivalBatches = [
    expectedBatch("batch-a", "2026-08-25", [[purple.id, 30], [navy.id, 10]]),
    expectedBatch("batch-b", "2026-09-01", [[purple.id, 30], [navy.id, 30]]),
  ];
  const { settings, scheduling } = schedulingAndSettings();
  const order = { id: "order-a", salesContractNo: "PI2607-235", styleNo: "D1935", factoryStyleNo: "D1935", brandNameSnapshot: "OYSHO", customerNameSnapshot: "客户", initialQuantity: 100, quantityChanges: [], contractDeliveryDate: "2026-10-13" };
  const canonical = buildStyleProgressProjections({ data, orders: [order], scheduling, settings, today: "2026-09-01" })[0].canonicalMaterials[0];

  assert.deepEqual(canonical.expectedArrivalBatches.map((item) => item.recommendation.recommendedMode?.name), ["海运", "陆运"]);
  assert.deepEqual(canonical.expectedArrivalBatches.map((item) => item.recommendation.expectedArrivalDate), ["2026-09-14", "2026-09-13"]);
  assert.deepEqual(canonical.expectedArrivalBatches.map((item) => item.recommendation.latestRequiredArrivalDate), ["2026-09-17", "2026-09-17"]);
  assert.deepEqual(canonical.expectedArrivalBatches.map((item) => item.recommendation.bufferDays), [3, 4]);
  assert.deepEqual(canonical.expectedArrivalBatches.map((item) => item.recommendation.escalationLevel), ["none", "faster_required"]);
  assert.deepEqual(canonical.expectedArrivalBatches.map((item) => item.daysToProduction), [28, 21]);
  assert.equal(canonical.batchSummary.expectedArrival, "2批 · 最晚2026-09-01");
  assert.equal(canonical.batchSummary.recommendedTransport, "2种方式 / 2批");
  assert.equal(canonical.batchSummary.expectedFactoryArrival, "2批 · 最晚2026-09-14");
  assert.equal(canonical.batchSummary.daysToProduction, "最短 21天");
  assert.equal(canonical.batchSummary.tightestBufferDays, 3);
  assert.equal(canonical.batchSummary.bufferRisk, "yellow");
  assert.equal(canonical.sourceDueDates[0], "2026-08-20");
  assert.equal(canonical.actualInboundDates[0], "2026-08-28");
  assert.equal(canonical.expectedArrivalBatches[0].recommendation.materialReadyDate, "2026-08-25");
});

test("Gate 3 keeps days-to-production separate from transport buffer and applies the formal buffer colors", () => {
  assert.equal(calculateDaysToProduction("2026-09-01", "2026-09-22"), 21);
  assert.equal(calculateDaysToProduction("2026-09-23", "2026-09-22"), -1);
  assert.equal(calculateDaysToProduction("2026-09-01", null), null);
  assert.equal(bufferRiskForDays(8), "green");
  assert.equal(bufferRiskForDays(7), "yellow");
  assert.equal(bufferRiskForDays(0), "yellow");
  assert.equal(bufferRiskForDays(-1), "red");
  assert.equal(bufferRiskForDays(null), "unknown");
});

test("Gate 3 reports hub_missing per batch without inferring a default SupplyHub", () => {
  const data = emptyStyleProgressData();
  const material = demand("material", { requiredQuantity: 10 });
  data.demands = [material];
  data.purchaseEvents = [purchase("p", material.id, 10)];
  data.expectedArrivalBatches = [expectedBatch("batch", "2026-09-01", [[material.id, 10]])];
  const { settings, scheduling } = schedulingAndSettings();
  scheduling.orderExecutionTrackings = [];
  const order = { id: "order-a", salesContractNo: "PI2607-235", styleNo: "D1935", factoryStyleNo: "D1935", brandNameSnapshot: "OYSHO", customerNameSnapshot: "客户", initialQuantity: 100, quantityChanges: [], contractDeliveryDate: "2026-10-13" };
  const projection = buildStyleProgressProjections({ data, orders: [order], scheduling, settings, today: "2026-09-01" })[0];
  const batch = projection.canonicalMaterials[0].expectedArrivalBatches[0];
  assert.equal(batch.recommendation.status, "hub_missing");
  assert.equal(batch.recommendation.basis.supplyHub, null);
  assert.equal(projection.transportRisk, "hub_missing");
});

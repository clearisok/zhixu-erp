import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyStyleProgressData,
  isFactorySupplied,
  migrateStyleProgressDataV3,
  resolveCanonicalMaterialIdentity,
  validateStyleProgressData,
} from "../features/style-progress/model/style-progress.ts";

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

test("面料 Canonical identity 忽略来源编码，但严格包含名称、门幅、克重与正常化采购价", () => {
  const left = demand("a", { materialCode: "202607230001", width: "153", gsm: "230.0" });
  const right = demand("b", { materialCode: "OTHER", width: "153.00", gsm: "230" });
  const leftIdentity = resolveCanonicalMaterialIdentity(left, [purchase("p-a", left.id, 70.5)]);
  const rightIdentity = resolveCanonicalMaterialIdentity(right, [purchase("p-b", right.id, 70.50)]);
  assert.equal(leftIdentity.status, "resolved");
  assert.equal(leftIdentity.key, rightIdentity.key);
  assert.notEqual(leftIdentity.key, resolveCanonicalMaterialIdentity(right, [purchase("p-b2", right.id, 80)]).key);
  assert.notEqual(leftIdentity.key, resolveCanonicalMaterialIdentity({ ...right, salesContractNo: "PI-2" }, [purchase("p-b3", right.id, 70.5)]).key);
});

test("面料价格缺失或冲突时不猜测合并", () => {
  const left = demand("missing-a");
  const right = demand("missing-b");
  const missingLeft = resolveCanonicalMaterialIdentity(left, []);
  const missingRight = resolveCanonicalMaterialIdentity(right, []);
  assert.equal(missingLeft.status, "price_missing");
  assert.notEqual(missingLeft.key, missingRight.key);
  const conflict = resolveCanonicalMaterialIdentity(left, [purchase("p-1", left.id, 70.5), purchase("p-2", left.id, 80)]);
  assert.equal(conflict.status, "price_conflict");
  assert.deepEqual(conflict.purchasePrices, [70.5, 80]);
  assert.notEqual(conflict.key, missingLeft.key);
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

test("批次允许部分分配和一需求多批，但拒绝超分配", () => {
  const data = emptyStyleProgressData();
  data.demands = [demand("a", { requiredQuantity: 100 })];
  data.expectedArrivalBatches = [
    { id: "batch-a", salesContractNo: "PI-1", canonicalMaterialKey: "canonical-a", expectedArrivalAtHubDate: "2026-08-25", dateSource: "manual", allocations: [{ id: "allocation-a", materialDemandId: "a", quantity: 40 }], createdAt: "2026-08-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-08-01T00:00:00.000Z", updatedBy: "u" },
    { id: "batch-b", salesContractNo: "PI-1", canonicalMaterialKey: "canonical-a", expectedArrivalAtHubDate: "2026-09-01", dateSource: "manual", allocations: [{ id: "allocation-b", materialDemandId: "a", quantity: 50 }], createdAt: "2026-08-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-08-01T00:00:00.000Z", updatedBy: "u" },
  ];
  assert.equal(validateStyleProgressData(data).expectedArrivalBatches.length, 2);
  data.expectedArrivalBatches[1].allocations[0].quantity = 61;
  assert.throws(() => validateStyleProgressData(data), /超出需求数量/);
});

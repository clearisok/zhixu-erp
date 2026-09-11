import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import "fake-indexeddb/auto";

import { emptyProductionSchedulingState } from "../features/production-scheduling/model/production-scheduling.ts";
import { normalizeOperationsSettings } from "../features/operations-settings/model/operations-settings.ts";
import {
  replaceStyleProgressData,
  styleProgressRepository,
} from "../features/style-progress/repository/style-progress-repository.ts";
import {
  buildStyleProgressProjections,
  indexActiveScheduleAssignmentsByOrder,
  indexExpectedArrivalBatchesByDemand,
} from "../features/style-progress/service/style-progress-service.ts";
import { emptyStyleProgressData } from "../features/style-progress/model/style-progress.ts";
import { createStyleProgressBenchmarkFixture } from "../scripts/style-progress-benchmark-fixture.ts";

const EXPECTED_PRE_OPTIMIZATION_PROJECTION_HASH = "03b44ea3c898f353c8fca75b8a33341bf586667dcd2e78d05ea53c05a0ba51cc";

test("Expected Arrival index groups by Demand without changing source batch order", () => {
  const batches = [
    { id: "batch-a", allocations: [{ materialDemandId: "demand-a" }, { materialDemandId: "demand-b" }] },
    { id: "batch-b", allocations: [{ materialDemandId: "demand-b" }] },
    { id: "batch-c", allocations: [{ materialDemandId: "demand-a" }] },
  ];
  const index = indexExpectedArrivalBatchesByDemand(batches);
  assert.deepEqual(index.byDemandId.get("demand-a").map((batch) => batch.id), ["batch-a", "batch-c"]);
  assert.deepEqual(index.byDemandId.get("demand-b").map((batch) => batch.id), ["batch-a", "batch-b"]);
  assert.equal(index.byDemandId.has("missing"), false);
  assert.deepEqual([...index.sourceOrderByBatchId], [["batch-a", 0], ["batch-b", 1], ["batch-c", 2]]);
});

test("Scheduling index groups active assignments and excludes cancelled rows", () => {
  const assignments = [
    { id: "order-a-late", salesOrderId: "order-a", status: "planned", plannedStartDate: "2026-10-10" },
    { id: "order-a-cancelled", salesOrderId: "order-a", status: "cancelled", plannedStartDate: "2026-09-01" },
    { id: "order-b-active", salesOrderId: "order-b", status: "in_progress", plannedStartDate: "2026-10-01" },
    { id: "order-a-early", salesOrderId: "order-a", status: "planned", plannedStartDate: "2026-10-02" },
  ];
  const index = indexActiveScheduleAssignmentsByOrder(assignments);
  assert.deepEqual(index.get("order-a").map((item) => item.id), ["order-a-late", "order-a-early"]);
  assert.deepEqual(index.get("order-b").map((item) => item.id), ["order-b-active"]);
  assert.equal([...index.values()].flat().some((item) => item.status === "cancelled"), false);
});

test("empty Style Progress data produces an empty projection", () => {
  assert.deepEqual(buildStyleProgressProjections({
    data: emptyStyleProgressData(),
    orders: [],
    scheduling: emptyProductionSchedulingState(),
    settings: normalizeOperationsSettings({}),
    today: "2026-09-10",
  }), []);
});

test("optimized projection is byte-stable with the pre-optimization fixture output", () => {
  const fixture = createStyleProgressBenchmarkFixture(20);
  const projection = buildStyleProgressProjections({ ...fixture, today: "2026-09-10" });
  const hash = createHash("sha256").update(JSON.stringify(projection)).digest("hex");
  assert.equal(hash, EXPECTED_PRE_OPTIMIZATION_PROJECTION_HASH);

  const summary = projection[0];
  const requiredFields = [
    "salesContractNo", "styleNo", "factoryStyleNo", "brand", "owner",
    "garmentQuantity", "contractDeliveryDate", "salesRisk", "materialRisk",
    "transportRisk", "fabricReady", "fabricTotal", "trimReady", "trimTotal",
    "readinessRate", "notPurchasedCount", "pendingInboundCount",
    "expectedLatestMaterialDate", "canonicalMaterials", "materials", "keyExceptions",
  ];
  assert.deepEqual(requiredFields.filter((field) => !(field in summary)), []);
});

test("manual Expected Arrival and canonical sorting remain unchanged", () => {
  const fixture = createStyleProgressBenchmarkFixture(20);
  const projection = buildStyleProgressProjections({ ...fixture, today: "2026-09-10" })[0];
  assert.deepEqual(projection.canonicalMaterials.map((item) => [item.materialType, item.materialName]), [
    ["fabric", "Fabric 0"],
    ["fabric", "Fabric 1"],
    ["trim", "Trim 2"],
    ["trim", "Trim 3"],
  ]);
  const manual = projection.canonicalMaterials[0].expectedArrivalBatches[0];
  assert.equal(manual.batch.dateSource, "manual");
  assert.equal(manual.batch.expectedArrivalAtHubDate, "2026-09-18");
  assert.deepEqual(manual.demandIds, fixture.data.demands.slice(0, 5).map((demand) => demand.id));
});

test("projection read model skips import trace and produces the same business projection", async () => {
  const fixture = createStyleProgressBenchmarkFixture(20);
  await replaceStyleProgressData(fixture.data);
  const [full, projectionData] = await Promise.all([
    styleProgressRepository.loadAll(),
    styleProgressRepository.loadProjectionData(),
  ]);
  assert.equal(full.rawSnapshots.length, 20);
  assert.equal(full.batches.length, 1);
  assert.equal(projectionData.rawSnapshots.length, 0);
  assert.equal(projectionData.batches.length, 0);
  assert.deepEqual(
    [projectionData.demands.length, projectionData.purchaseEvents.length, projectionData.inboundEvents.length, projectionData.shipmentEvents.length, projectionData.outboundEvents.length, projectionData.expectedArrivalBatches.length],
    [20, 20, 20, 20, 20, 4],
  );
  const build = (data) => buildStyleProgressProjections({
    data,
    orders: fixture.orders,
    scheduling: fixture.scheduling,
    settings: fixture.settings,
    today: "2026-09-10",
  });
  assert.deepEqual(build(projectionData), build(full));
});

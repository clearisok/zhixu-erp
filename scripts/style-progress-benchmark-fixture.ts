import type { SalesOrder } from "../features/order-center/model/order.ts";
import { normalizeOperationsSettings, upsertProductionGroup, type OperationsSettingsState } from "../features/operations-settings/model/operations-settings.ts";
import type { ProductionSchedulingState, ScheduleAssignment } from "../features/production-scheduling/model/production-scheduling.ts";
import {
  emptyStyleProgressData,
  resolveCanonicalMaterialIdentity,
  type MaterialDemand,
  type MaterialInboundEvent,
  type MaterialOutboundEvent,
  type MaterialPurchaseEvent,
  type MaterialShipmentEvent,
  type StyleProgressData,
} from "../features/style-progress/model/style-progress.ts";

export type StyleProgressBenchmarkFixture = {
  data: StyleProgressData;
  orders: SalesOrder[];
  scheduling: ProductionSchedulingState;
  settings: OperationsSettingsState;
};

const NOW = "2026-09-10T00:00:00.000Z";
const DEMANDS_PER_CONTRACT = 20;
const DEMANDS_PER_CANONICAL_MATERIAL = 5;

function makeOrder(contractIndex: number, salesContractNo: string): SalesOrder {
  const id = `benchmark-order-${contractIndex}`;
  const priceVersionId = `benchmark-price-${contractIndex}`;
  return {
    id,
    orderNo: `BENCH-${String(contractIndex).padStart(5, "0")}`,
    customerId: null,
    customerNameSnapshot: `Customer ${contractIndex % 12}`,
    customerPoNo: "",
    sourceType: "ainuoke",
    creationSource: "ainuoke",
    sourceOrderId: null,
    sourceQuoteId: null,
    sourceRevisionId: null,
    sourcePriceVersionId: null,
    orderDate: "2026-08-01",
    salespersonId: null,
    salespersonNameSnapshot: "Benchmark Sales",
    merchandiserId: null,
    merchandiserNameSnapshot: "Benchmark Owner",
    orderType: "processing",
    status: "active",
    salesContractNo,
    ainuokeSyncStatus: "synced",
    ainuokeLastSyncedAt: NOW,
    styleNo: `STYLE-${contractIndex}`,
    factoryStyleNo: `FACTORY-${contractIndex}`,
    styleName: `Benchmark Style ${contractIndex}`,
    brandId: null,
    brandNameSnapshot: `Brand ${contractIndex % 8}`,
    productionCountry: "Cambodia",
    processDescription: "",
    customerRequirement: "",
    remark: "",
    businessConfirmedDeliveryDate: null,
    contractDeliveryDate: "2026-10-30",
    inspectionDate: null,
    initialQuantity: 1_000,
    orderColorLines: [],
    purchasedTrimUnitCostSnapshot: null,
    purchasedTrimCurrencySnapshot: null,
    purchasedTrimRuleId: null,
    purchasedTrimCostOverride: false,
    factorySettlementUnitPrice: null,
    averageDailyOutput: 100,
    fabricExecutionSnapshots: [],
    trimExecutionSnapshots: [],
    quantityChanges: [],
    deliveryPlans: [],
    priceVersions: [{
      id: priceVersionId,
      salesOrderId: id,
      versionNo: 1,
      displayLabel: "P1",
      salePrice: null,
      processingUnitPrice: 1,
      processingCurrency: "USD",
      exchangeRateSnapshot: 7.1,
      effectiveDate: "2026-08-01",
      reason: "benchmark",
      createdAt: NOW,
      createdBy: "benchmark",
    }],
    currentPriceVersionId: priceVersionId,
    imageAttachmentIds: [],
    fileAttachmentIds: [],
    styleImageAttachmentId: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "benchmark",
    updatedBy: "benchmark",
  };
}

function makeAssignment(contractIndex: number, orderId: string, status: ScheduleAssignment["status"], suffix: string): ScheduleAssignment {
  return {
    id: `benchmark-assignment-${contractIndex}-${suffix}`,
    salesOrderId: orderId,
    executionType: "internal",
    productionGroupId: "benchmark-production-group",
    outsourceFactoryId: null,
    colorLineId: null,
    colorNameSnapshot: null,
    outsourceUnitPrice: null,
    queueSequence: contractIndex,
    plannedQuantity: 1_000,
    durationMode: "workdays",
    averageDailyOutputSnapshot: null,
    requiredWorkdays: 10,
    plannedStartDate: suffix === "active" ? "2026-10-01" : "2026-09-20",
    plannedEndDate: suffix === "active" ? "2026-10-14" : "2026-10-01",
    nonWorkingDayCount: 2,
    completedQuantity: 0,
    actualStartDate: null,
    actualCompletedDate: null,
    dateMode: "manual_fixed",
    status,
    remark: "",
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "benchmark",
    updatedBy: "benchmark",
  };
}

function makeDemand(index: number, contractIndex: number, localIndex: number, salesContractNo: string): MaterialDemand {
  const canonicalIndex = Math.floor(localIndex / DEMANDS_PER_CANONICAL_MATERIAL);
  const materialType = canonicalIndex < 2 ? "fabric" : "trim";
  const sourceMaterialDueDate = `2026-09-${String(10 + canonicalIndex).padStart(2, "0")}`;
  return {
    id: `benchmark-demand-${index}`,
    salesContractNo,
    materialType,
    materialCode: `M-${contractIndex}-${localIndex}`,
    materialName: `${materialType === "fabric" ? "Fabric" : "Trim"} ${canonicalIndex}`,
    sourceActualName: "",
    materialColor: `Color ${localIndex % 5}`,
    garmentColors: [`Garment ${localIndex % 4}`],
    specification: `Spec ${localIndex % 3}`,
    supplyMethod: localIndex === DEMANDS_PER_CONTRACT - 1 && contractIndex % 10 === 0 ? "厂供" : "自购",
    garmentQuantity: 1_000,
    plannedConsumption: materialType === "fabric" ? 0.8 - canonicalIndex * 0.1 : null,
    actualConsumption: materialType === "fabric" && index % 3 === 0 ? 0.75 - canonicalIndex * 0.1 : null,
    lossRate: 3,
    totalConsumption: null,
    width: materialType === "fabric" ? "150" : "",
    gsm: materialType === "fabric" ? "180" : "",
    requiredQuantity: 100 + localIndex,
    sampleQuantity: 1,
    sourceMaterialDueDate,
    expectedMaterialReadyDate: sourceMaterialDueDate,
    expectedDateSource: "source",
    sourceSortNo: index + 1,
    sourceStyleNoSnapshot: `STYLE-${contractIndex}`,
    sourceFactoryStyleNoSnapshot: `FACTORY-${contractIndex}`,
    sourceBrandSnapshot: `Brand ${contractIndex % 8}`,
    sourceOwnerSnapshot: "Benchmark Owner",
    sourceCustomerSnapshot: `Customer ${contractIndex % 12}`,
    sourceOrderQuantitySnapshot: 1_000,
    sourceContractDeliveryDateSnapshot: "2026-10-30",
    lastImportBatchId: `benchmark-import-${contractIndex}`,
    sourceKind: "api",
    sourceArtifactHash: `artifact-${contractIndex}`,
    sourceFileHash: `artifact-${contractIndex}`,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makePurchase(demand: MaterialDemand, index: number): MaterialPurchaseEvent {
  return {
    id: `benchmark-purchase-${index}`,
    materialDemandId: demand.id,
    purchaseOrderNo: `PO-${index}`,
    purchaseDate: "2026-09-01",
    supplier: `Supplier ${index % 17}`,
    purchaseEntity: "Benchmark",
    sourceMaterialDueDate: demand.sourceMaterialDueDate,
    currency: "CNY",
    purchaser: "Benchmark Buyer",
    purchasedMaterialName: demand.materialName,
    invoiceName: demand.materialName,
    actualName: demand.materialName,
    specification: demand.specification,
    color: demand.materialColor,
    quantity: index % 7 === 0 ? demand.requiredQuantity * 0.6 : demand.requiredQuantity,
    sampleQuantity: 1,
    unitPrice: 10 + index % 5,
    amount: null,
    extraCost: null,
    importBatchId: demand.lastImportBatchId,
    sourceRows: [index + 4],
  };
}

function makeEvent<T extends MaterialInboundEvent | MaterialShipmentEvent | MaterialOutboundEvent>(
  prefix: string,
  demand: MaterialDemand,
  index: number,
  quantity: number,
  extra: Record<string, unknown> = {},
): T {
  return {
    id: `benchmark-${prefix}-${index}`,
    materialDemandId: demand.id,
    documentNo: `${prefix.toUpperCase()}-${index}`,
    eventDate: "2026-09-08",
    quantity,
    importBatchId: demand.lastImportBatchId,
    sourceRows: [index + 4],
    ...extra,
  } as T;
}

export function createStyleProgressBenchmarkFixture(demandCount: number): StyleProgressBenchmarkFixture {
  if (!Number.isInteger(demandCount) || demandCount <= 0 || demandCount % DEMANDS_PER_CONTRACT !== 0) {
    throw new Error(`benchmark demandCount 必须是 ${DEMANDS_PER_CONTRACT} 的正整数倍`);
  }
  const data = emptyStyleProgressData();
  const orders: SalesOrder[] = [];
  const scheduling: ProductionSchedulingState = { scheduleAssignments: [], orderExecutionTrackings: [], scheduleBatches: [] };
  let settings = normalizeOperationsSettings({}, NOW);
  settings = upsertProductionGroup(settings, {
    id: "benchmark-production-group",
    name: "Benchmark Group",
    shortName: "BENCH",
    productionSiteId: settings.productionSites[0].id,
    enabled: true,
    sortOrder: 1,
    remark: "",
    createdAt: NOW,
    updatedAt: NOW,
  }, NOW);

  for (let contractIndex = 0; contractIndex < demandCount / DEMANDS_PER_CONTRACT; contractIndex += 1) {
    const salesContractNo = `BENCH-CONTRACT-${String(contractIndex).padStart(5, "0")}`;
    const order = makeOrder(contractIndex, salesContractNo);
    orders.push(order);
    scheduling.scheduleAssignments.push(
      makeAssignment(contractIndex, order.id, "planned", "active"),
      makeAssignment(contractIndex, order.id, "cancelled", "cancelled"),
    );
    scheduling.orderExecutionTrackings.push({
      id: `benchmark-tracking-${contractIndex}`,
      salesOrderId: order.id,
      fabricReadiness: { status: "in_progress", remark: "" },
      trimReadiness: { status: "in_progress", remark: "" },
      sampleProgress: { status: "not_started", remark: "" },
      printingEmbroideryProgress: { status: "not_applicable", remark: "" },
      shortOverStatus: { status: "not_started", remark: "" },
      supplyHubId: settings.supplyHubs[0].id,
      fabricSupplyHubArrivalDate: null,
      trimSupplyHubArrivalDate: null,
      remark: "",
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: "benchmark",
      updatedBy: "benchmark",
    });
    data.batches.push({
      id: `benchmark-import-${contractIndex}`,
      sourceKind: "api",
      sourceArtifactHash: `artifact-${contractIndex}`,
      reportId: "6087050",
      snapshotHashes: [`snapshot-${contractIndex}`],
      fetchedAt: NOW,
      queryContext: { insideOrderNo: `STYLE-${contractIndex}` },
      sourceSchemaVersion: "ainuoke-direct-read.v2",
      rawRowCount: DEMANDS_PER_CONTRACT,
      validRowCount: DEMANDS_PER_CONTRACT,
      invalidRowCount: 0,
      demandCount: DEMANDS_PER_CONTRACT,
      purchaseEventCount: DEMANDS_PER_CONTRACT,
      inboundEventCount: DEMANDS_PER_CONTRACT,
      shipmentEventCount: DEMANDS_PER_CONTRACT,
      outboundEventCount: DEMANDS_PER_CONTRACT,
      duplicateDemandRows: 0,
      duplicateEventRows: 0,
      status: "committed",
      createdAt: NOW,
      createdBy: "benchmark",
      committedAt: NOW,
    });
  }

  for (let index = 0; index < demandCount; index += 1) {
    const contractIndex = Math.floor(index / DEMANDS_PER_CONTRACT);
    const localIndex = index % DEMANDS_PER_CONTRACT;
    const salesContractNo = orders[contractIndex].salesContractNo!;
    const demand = makeDemand(index, contractIndex, localIndex, salesContractNo);
    const purchased = makePurchase(demand, index);
    data.demands.push(demand);
    data.purchaseEvents.push(purchased);
    data.inboundEvents.push(makeEvent("inbound", demand, index, index % 4 === 0 ? demand.requiredQuantity : demand.requiredQuantity * 0.5));
    data.shipmentEvents.push(makeEvent("shipment", demand, index, demand.requiredQuantity * 0.8, { transportModeSnapshot: "Sea" }));
    data.outboundEvents.push(makeEvent("outbound", demand, index, demand.requiredQuantity * 0.7));
    data.rawSnapshots.push({
      id: `benchmark-raw-${index}`,
      importBatchId: demand.lastImportBatchId,
      sourceKind: "api",
      sourceArtifactHash: demand.sourceArtifactHash!,
      reportId: "6087050",
      sourceRowIdentity: `source-row-${index}`,
      snapshotHash: `snapshot-${contractIndex}`,
      fetchedAt: NOW,
      queryContext: { insideOrderNo: `STYLE-${contractIndex}` },
      sourceSchemaVersion: "ainuoke-direct-read.v2",
      rawFields: { SalesContractNo: salesContractNo, MaterialName: demand.materialName, Payload: `benchmark-${index}` },
      normalizedDemandId: demand.id,
      validationIssues: [],
    });
  }

  for (let start = 0; start < demandCount; start += DEMANDS_PER_CANONICAL_MATERIAL) {
    const group = data.demands.slice(start, start + DEMANDS_PER_CANONICAL_MATERIAL);
    const operational = group.filter((demand) => demand.supplyMethod !== "厂供");
    if (!operational.length) continue;
    const first = operational[0];
    const identity = resolveCanonicalMaterialIdentity(first, data.purchaseEvents.filter((event) => event.materialDemandId === first.id));
    const groupIndex = Math.floor(start / DEMANDS_PER_CANONICAL_MATERIAL);
    const dateSource = groupIndex % 9 === 0 ? "manual" : "source";
    const expectedArrivalAtHubDate = dateSource === "manual" ? "2026-09-18" : first.sourceMaterialDueDate!;
    data.expectedArrivalBatches.push({
      id: `benchmark-arrival-${groupIndex}`,
      salesContractNo: first.salesContractNo,
      canonicalMaterialKey: identity.key,
      expectedArrivalAtHubDate,
      dateSource,
      allocations: operational.map((demand) => ({
        id: `benchmark-allocation-${groupIndex}-${demand.id}`,
        materialDemandId: demand.id,
        quantity: demand.requiredQuantity,
      })),
      createdAt: NOW,
      createdBy: "benchmark",
      updatedAt: NOW,
      updatedBy: "benchmark",
    });
  }

  return { data, orders, scheduling, settings };
}

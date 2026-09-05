import type { SalesOrder } from "../../order-center/model/order.ts";
import { getEffectiveQuantity } from "../../order-center/model/order.ts";
import type { OperationsSettingsState } from "../../operations-settings/model/operations-settings.ts";
import type { ProductionSchedulingState, ScheduleAssignment } from "../../production-scheduling/model/production-scheduling.ts";
import { recommendMaterialTransport, type MaterialLogisticsRecommendation } from "../../production-scheduling/service/material-logistics-service.ts";
import {
  isFactorySupplied,
  resolveCanonicalMaterialIdentity,
  type CanonicalMaterialIdentity,
  type MaterialDemand,
  type MaterialExpectedArrivalBatch,
  type MaterialInboundEvent,
  type MaterialLifecycleStatus,
  type MaterialOutboundEvent,
  type MaterialPurchaseEvent,
  type MaterialReadinessStatus,
  type MaterialShipmentEvent,
  type MaterialType,
  type StyleProgressData,
} from "../model/style-progress.ts";

export type MaterialBufferRisk = "green" | "yellow" | "red" | "unknown";

export type ExpectedArrivalBatchProjection = {
  batch: MaterialExpectedArrivalBatch;
  allocatedQuantity: number;
  demandIds: string[];
  recommendation: MaterialLogisticsRecommendation;
  daysToProduction: number | null;
  bufferRisk: MaterialBufferRisk;
};

export type MaterialBatchSummary = {
  batchCount: number;
  expectedArrival: string | null;
  recommendedTransport: string | null;
  expectedFactoryArrival: string | null;
  daysToProduction: string | null;
  tightestBufferDays: number | null;
  bufferRisk: MaterialBufferRisk;
};

export type MaterialConsistencyIssue = {
  demandId: string;
  purchaseEventId: string;
  field: "material_name" | "specification" | "color";
  sourceValue: string;
  purchaseValue: string;
};

export type MaterialProgressProjection = {
  demand: MaterialDemand;
  purchaseEvents: MaterialPurchaseEvent[];
  inboundEvents: MaterialInboundEvent[];
  shipmentEvents: MaterialShipmentEvent[];
  outboundEvents: MaterialOutboundEvent[];
  purchasedQuantity: number;
  inboundQuantity: number;
  shipmentQuantity: number;
  outboundQuantity: number;
  actualInboundDate: string | null;
  readinessStatus: MaterialReadinessStatus;
  lifecycleStatus: MaterialLifecycleStatus;
  expectedArrivalBatches: ExpectedArrivalBatchProjection[];
  batchSummary: MaterialBatchSummary;
  /** Compatibility for the pre-Gate-4 UI. Multi-batch values use the tightest batch, never an arbitrary first/last batch. */
  logistics: MaterialLogisticsRecommendation;
};

export type CanonicalMaterialProgressProjection = {
  canonicalMaterialKey: string;
  identity: CanonicalMaterialIdentity;
  materialType: MaterialType;
  materialName: string;
  materialCodes: string[];
  demands: MaterialProgressProjection[];
  requiredQuantity: number;
  purchasedQuantity: number;
  inboundQuantity: number;
  shipmentQuantity: number;
  outboundQuantity: number;
  readinessStatus: MaterialReadinessStatus;
  lifecycleStatus: MaterialLifecycleStatus;
  isReady: boolean;
  hasUnpurchasedDemand: boolean;
  hasPendingInboundDemand: boolean;
  expectedArrivalBatches: ExpectedArrivalBatchProjection[];
  batchSummary: MaterialBatchSummary;
  sourceDueDates: string[];
  actualInboundDates: string[];
  consistencyIssues: MaterialConsistencyIssue[];
};

export type StyleProgressProjection = {
  salesContractNo: string;
  order: SalesOrder | null;
  styleNo: string;
  factoryStyleNo: string;
  brand: string;
  owner: string;
  customer: string;
  garmentQuantity: number | null;
  contractDeliveryDate: string | null;
  daysRemaining: number | null;
  salesRisk: "overdue" | "7d" | "14d" | "30d" | "normal" | "unknown";
  materialRisk: "ready" | "unpurchase" | "pending_inbound" | "late_expected" | "normal";
  transportRisk: "none" | "pending_schedule" | "hub_missing" | "site_missing" | "route_missing" | "modes_missing" | "faster_required" | "only_fastest" | "late";
  fabricReady: number;
  fabricTotal: number;
  trimReady: number;
  trimTotal: number;
  totalReady: number;
  totalMaterials: number;
  readinessRate: number;
  notPurchasedCount: number;
  pendingInboundCount: number;
  transportRiskCount: number;
  expectedLatestMaterialDate: string | null;
  logisticsBasis: MaterialLogisticsRecommendation["basis"];
  logisticsContext: { assignment: ScheduleAssignment | null; supplyHubId: string | null };
  /** Formal operational projection used by the Material Control Tower. */
  canonicalMaterials: CanonicalMaterialProgressProjection[];
  /** Demand-level detail retained for Gate-4 detail views and temporary UI compatibility. */
  materials: MaterialProgressProjection[];
  factorySuppliedDemands: MaterialDemand[];
  keyExceptions: string[];
};

const DAY_MS = 86_400_000;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const byDemand = <T extends { materialDemandId: string }>(rows: T[]) => {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(row.materialDemandId, [...(result.get(row.materialDemandId) ?? []), row]);
  return result;
};
const daysFromToday = (date: string | null, today: string) => date ? dateGap(today, date) : null;
const activeAssignments = (state: ProductionSchedulingState, orderId: string) => state.scheduleAssignments.filter((item) => item.salesOrderId === orderId && item.status !== "cancelled");
const earliestAssignment = (items: ScheduleAssignment[]) => items.filter((item) => item.plannedStartDate).sort((left, right) => (left.plannedStartDate ?? "").localeCompare(right.plannedStartDate ?? ""))[0] ?? null;
const uniqueStrings = (values: Array<string | null | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))];
const comparableText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase();

function dateGap(from: string, to: string): number {
  return Math.ceil((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS);
}

export function calculateDaysToProduction(expectedArrivalAtHubDate: string, plannedProductionStartDate: string | null): number | null {
  return plannedProductionStartDate ? dateGap(expectedArrivalAtHubDate, plannedProductionStartDate) : null;
}

export function bufferRiskForDays(bufferDays: number | null): MaterialBufferRisk {
  if (bufferDays === null) return "unknown";
  if (bufferDays < 0) return "red";
  return bufferDays <= 7 ? "yellow" : "green";
}

function summarizeBatchProjections(items: ExpectedArrivalBatchProjection[]): MaterialBatchSummary {
  if (!items.length) return { batchCount: 0, expectedArrival: null, recommendedTransport: null, expectedFactoryArrival: null, daysToProduction: null, tightestBufferDays: null, bufferRisk: "unknown" };
  const batchCount = items.length;
  const expectedDates = items.map((item) => item.batch.expectedArrivalAtHubDate).sort();
  const expectedArrival = batchCount === 1 ? expectedDates[0] : `${batchCount}批 · 最晚${expectedDates.at(-1)}`;
  const recommendationLabels = uniqueStrings(items.map((item) => item.recommendation.recommendedMode?.name ?? item.recommendation.message));
  const recommendedTransport = batchCount === 1
    ? recommendationLabels[0] ?? null
    : recommendationLabels.length === 1
      ? `${recommendationLabels[0]} · ${batchCount}批`
      : `${recommendationLabels.length}种方式 / ${batchCount}批`;
  const factoryDates = items.map((item) => item.recommendation.expectedArrivalDate);
  const completeFactoryDates = factoryDates.filter((value): value is string => Boolean(value)).sort();
  const expectedFactoryArrival = batchCount === 1
    ? completeFactoryDates[0] ?? null
    : completeFactoryDates.length === batchCount
      ? `${batchCount}批 · 最晚${completeFactoryDates.at(-1)}`
      : `${batchCount}批 · 待补齐物流依据`;
  const productionGaps = items.map((item) => item.daysToProduction).filter((value): value is number => value !== null);
  const tightestDays = productionGaps.length ? Math.min(...productionGaps) : null;
  const daysToProduction = tightestDays === null
    ? null
    : tightestDays < 0
      ? `晚 ${Math.abs(tightestDays)} 天`
      : batchCount === 1
        ? `${tightestDays}天`
        : `最短 ${tightestDays}天`;
  const buffers = items.map((item) => item.recommendation.bufferDays).filter((value): value is number => value !== null);
  const tightestBufferDays = buffers.length ? Math.min(...buffers) : null;
  return { batchCount, expectedArrival, recommendedTransport, expectedFactoryArrival, daysToProduction, tightestBufferDays, bufferRisk: bufferRiskForDays(tightestBufferDays) };
}

function projectExpectedArrivalBatch(input: {
  batch: MaterialExpectedArrivalBatch;
  demandIds: Set<string>;
  assignment: ScheduleAssignment | null;
  settings: OperationsSettingsState;
  supplyHubId: string | null;
}): ExpectedArrivalBatchProjection | null {
  const allocations = input.batch.allocations.filter((allocation) => input.demandIds.has(allocation.materialDemandId));
  if (!allocations.length) return null;
  const batch = { ...input.batch, allocations };
  const recommendation = recommendMaterialTransport({
    assignment: input.assignment,
    settings: input.settings,
    supplyHubId: input.supplyHubId,
    expectedMaterialReadyDate: batch.expectedArrivalAtHubDate,
  });
  return {
    batch,
    allocatedQuantity: sum(allocations.map((allocation) => allocation.quantity)),
    demandIds: uniqueStrings(allocations.map((allocation) => allocation.materialDemandId)),
    recommendation,
    daysToProduction: calculateDaysToProduction(batch.expectedArrivalAtHubDate, recommendation.plannedProductionStartDate),
    bufferRisk: bufferRiskForDays(recommendation.bufferDays),
  };
}

function tightestRecommendation(items: ExpectedArrivalBatchProjection[], fallback: MaterialLogisticsRecommendation): MaterialLogisticsRecommendation {
  if (!items.length) return fallback;
  const riskRank = (item: ExpectedArrivalBatchProjection) => item.recommendation.status === "late" ? 0
    : item.recommendation.status.endsWith("missing") ? 1
      : item.recommendation.escalationLevel === "only_fastest" ? 2
        : item.recommendation.escalationLevel === "faster_required" ? 3
          : item.recommendation.bufferDays ?? Number.POSITIVE_INFINITY;
  return [...items].sort((left, right) => riskRank(left) - riskRank(right) || left.batch.expectedArrivalAtHubDate.localeCompare(right.batch.expectedArrivalAtHubDate))[0].recommendation;
}

export function deriveMaterialStatuses(required: number, purchased: number, inbound: number, shipment: number, outbound: number): { readinessStatus: MaterialReadinessStatus; lifecycleStatus: MaterialLifecycleStatus } {
  const readinessStatus: MaterialReadinessStatus = inbound >= required ? "ready" : purchased <= 0 ? "not_purchased" : purchased < required ? "purchasing" : "pending_inbound";
  let lifecycleStatus: MaterialLifecycleStatus = purchased <= 0 ? "pending_purchase" : purchased < required ? "purchasing" : "purchase_complete";
  if (inbound > 0) lifecycleStatus = inbound >= required ? "inbound_complete" : "partial_inbound";
  if (shipment > 0) lifecycleStatus = shipment >= required ? "shipment_complete" : "partial_shipment";
  if (outbound > 0) lifecycleStatus = outbound >= required ? "outbound_complete" : "partial_outbound";
  return { readinessStatus, lifecycleStatus };
}

export function actualReadyDate(required: number, events: MaterialInboundEvent[]): string | null {
  let cumulative = 0;
  for (const event of [...events].filter((item) => item.eventDate).sort((left, right) => (left.eventDate ?? "").localeCompare(right.eventDate ?? ""))) {
    cumulative += event.quantity;
    if (cumulative >= required) return event.eventDate;
  }
  return null;
}

function aggregateLifecycleStatus(items: MaterialProgressProjection[]): MaterialLifecycleStatus {
  const order: MaterialLifecycleStatus[] = ["pending_purchase", "purchasing", "purchase_complete", "partial_inbound", "inbound_complete", "partial_shipment", "shipment_complete", "partial_outbound", "outbound_complete"];
  return order[Math.min(...items.map((item) => Math.max(0, order.indexOf(item.lifecycleStatus))))];
}

function findConsistencyIssues(items: MaterialProgressProjection[]): MaterialConsistencyIssue[] {
  return items.flatMap((item) => item.purchaseEvents.flatMap((event) => {
    const pairs: Array<[MaterialConsistencyIssue["field"], string, string]> = [
      ["material_name", item.demand.sourceActualName || item.demand.materialName, event.actualName],
      ["specification", item.demand.specification, event.specification],
      ["color", item.demand.materialColor, event.color],
    ];
    return pairs.flatMap(([field, sourceValue, purchaseValue]) => sourceValue && purchaseValue && comparableText(sourceValue) !== comparableText(purchaseValue)
      ? [{ demandId: item.demand.id, purchaseEventId: event.id, field, sourceValue, purchaseValue }]
      : []);
  }));
}

export function buildStyleProgressProjections(input: { data: StyleProgressData; orders: SalesOrder[]; scheduling: ProductionSchedulingState; settings: OperationsSettingsState; today?: string }): StyleProgressProjection[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const ordersByContract = new Map(input.orders.filter((order) => order.salesContractNo).map((order) => [order.salesContractNo!, order]));
  const purchaseByDemand = byDemand(input.data.purchaseEvents);
  const inboundByDemand = byDemand(input.data.inboundEvents);
  const shipmentByDemand = byDemand(input.data.shipmentEvents);
  const outboundByDemand = byDemand(input.data.outboundEvents);
  const demandsByContract = new Map<string, MaterialDemand[]>();
  for (const demand of input.data.demands) demandsByContract.set(demand.salesContractNo, [...(demandsByContract.get(demand.salesContractNo) ?? []), demand]);
  const trackings = new Map(input.scheduling.orderExecutionTrackings.map((item) => [item.salesOrderId, item]));
  const projections: StyleProgressProjection[] = [];

  for (const [salesContractNo, demands] of demandsByContract) {
    const order = ordersByContract.get(salesContractNo) ?? null;
    const assignment = order ? earliestAssignment(activeAssignments(input.scheduling, order.id)) : null;
    const tracking = order ? trackings.get(order.id) ?? null : null;
    const factorySuppliedDemands = demands.filter(isFactorySupplied);
    const operationalDemands = demands.filter((demand) => !isFactorySupplied(demand));
    const identityByDemand = new Map(operationalDemands.map((demand) => [demand.id, resolveCanonicalMaterialIdentity(demand, purchaseByDemand.get(demand.id) ?? [])]));
    const canonicalDemandGroups = new Map<string, MaterialDemand[]>();
    for (const demand of operationalDemands) {
      const identity = identityByDemand.get(demand.id)!;
      canonicalDemandGroups.set(identity.key, [...(canonicalDemandGroups.get(identity.key) ?? []), demand]);
    }

    const materialById = new Map<string, MaterialProgressProjection>();
    for (const demand of operationalDemands) {
      const purchaseEvents = purchaseByDemand.get(demand.id) ?? [];
      const inboundEvents = inboundByDemand.get(demand.id) ?? [];
      const shipmentEvents = shipmentByDemand.get(demand.id) ?? [];
      const outboundEvents = outboundByDemand.get(demand.id) ?? [];
      const purchasedQuantity = sum(purchaseEvents.map((event) => event.quantity));
      const inboundQuantity = sum(inboundEvents.map((event) => event.quantity));
      const shipmentQuantity = sum(shipmentEvents.map((event) => event.quantity));
      const outboundQuantity = sum(outboundEvents.map((event) => event.quantity));
      const actualInboundDate = actualReadyDate(demand.requiredQuantity, inboundEvents);
      const statuses = deriveMaterialStatuses(demand.requiredQuantity, purchasedQuantity, inboundQuantity, shipmentQuantity, outboundQuantity);
      const demandIds = new Set([demand.id]);
      const expectedArrivalBatches = input.data.expectedArrivalBatches.flatMap((batch) => projectExpectedArrivalBatch({ batch, demandIds, assignment, settings: input.settings, supplyHubId: tracking?.supplyHubId ?? null }) ?? []);
      const fallback = recommendMaterialTransport({ assignment, settings: input.settings, supplyHubId: tracking?.supplyHubId ?? null, expectedMaterialReadyDate: null });
      materialById.set(demand.id, {
        demand,
        purchaseEvents,
        inboundEvents,
        shipmentEvents,
        outboundEvents,
        purchasedQuantity,
        inboundQuantity,
        shipmentQuantity,
        outboundQuantity,
        actualInboundDate,
        ...statuses,
        expectedArrivalBatches,
        batchSummary: summarizeBatchProjections(expectedArrivalBatches),
        logistics: tightestRecommendation(expectedArrivalBatches, fallback),
      });
    }
    const materials = operationalDemands.map((demand) => materialById.get(demand.id)!);

    const canonicalMaterials = [...canonicalDemandGroups.entries()].map(([canonicalMaterialKey, canonicalDemands]): CanonicalMaterialProgressProjection => {
      const demandItems = canonicalDemands.map((demand) => materialById.get(demand.id)!);
      const demandIds = new Set(canonicalDemands.map((demand) => demand.id));
      const expectedArrivalBatches = input.data.expectedArrivalBatches.flatMap((batch) => projectExpectedArrivalBatch({ batch, demandIds, assignment, settings: input.settings, supplyHubId: tracking?.supplyHubId ?? null }) ?? []);
      const allReady = demandItems.length > 0 && demandItems.every((item) => item.readinessStatus === "ready");
      const hasUnpurchasedDemand = demandItems.some((item) => item.readinessStatus === "not_purchased");
      const hasPendingInboundDemand = demandItems.some((item) => item.readinessStatus === "purchasing" || item.readinessStatus === "pending_inbound");
      const readinessStatus: MaterialReadinessStatus = allReady ? "ready" : hasUnpurchasedDemand ? "not_purchased" : demandItems.some((item) => item.readinessStatus === "purchasing") ? "purchasing" : "pending_inbound";
      const first = canonicalDemands[0];
      return {
        canonicalMaterialKey,
        identity: identityByDemand.get(first.id)!,
        materialType: first.materialType,
        materialName: first.sourceActualName || first.materialName || first.materialCode,
        materialCodes: uniqueStrings(canonicalDemands.map((demand) => demand.materialCode)),
        demands: demandItems,
        requiredQuantity: sum(canonicalDemands.map((demand) => demand.requiredQuantity)),
        purchasedQuantity: sum(demandItems.map((item) => item.purchasedQuantity)),
        inboundQuantity: sum(demandItems.map((item) => item.inboundQuantity)),
        shipmentQuantity: sum(demandItems.map((item) => item.shipmentQuantity)),
        outboundQuantity: sum(demandItems.map((item) => item.outboundQuantity)),
        readinessStatus,
        lifecycleStatus: aggregateLifecycleStatus(demandItems),
        isReady: allReady,
        hasUnpurchasedDemand,
        hasPendingInboundDemand,
        expectedArrivalBatches,
        batchSummary: summarizeBatchProjections(expectedArrivalBatches),
        sourceDueDates: uniqueStrings(canonicalDemands.map((demand) => demand.sourceMaterialDueDate)).sort(),
        actualInboundDates: uniqueStrings(demandItems.map((item) => item.actualInboundDate)).sort(),
        consistencyIssues: findConsistencyIssues(demandItems),
      };
    }).sort((left, right) => left.demands[0].demand.sourceSortNo - right.demands[0].demand.sourceSortNo || left.canonicalMaterialKey.localeCompare(right.canonicalMaterialKey));

    const fabric = canonicalMaterials.filter((item) => item.materialType === "fabric");
    const trim = canonicalMaterials.filter((item) => item.materialType === "trim");
    const ready = canonicalMaterials.filter((item) => item.isReady);
    const notPurchasedCount = canonicalMaterials.filter((item) => item.hasUnpurchasedDemand).length;
    const pendingInboundCount = canonicalMaterials.filter((item) => !item.isReady && !item.hasUnpurchasedDemand && item.hasPendingInboundDemand).length;
    const canonicalRecommendations = (item: CanonicalMaterialProgressProjection): MaterialLogisticsRecommendation[] => item.expectedArrivalBatches.length
      ? item.expectedArrivalBatches.map((batch) => batch.recommendation)
      : item.demands[0]?.logistics ? [item.demands[0].logistics] : [];
    const recommendationIsRisky = (item: MaterialLogisticsRecommendation) => item.status === "late"
      || item.status.endsWith("missing")
      || item.escalationLevel === "faster_required"
      || item.escalationLevel === "only_fastest";
    const riskyCanonicalMaterials = canonicalMaterials.filter((item) => canonicalRecommendations(item).some(recommendationIsRisky));
    const source = demands[0];
    const delivery = order?.contractDeliveryDate ?? null;
    const remaining = daysFromToday(delivery, today);
    const salesRisk = remaining === null ? "unknown" : remaining < 0 ? "overdue" : remaining <= 7 ? "7d" : remaining <= 14 ? "14d" : remaining <= 30 ? "30d" : "normal";
    const allBatchDates = canonicalMaterials.flatMap((item) => item.expectedArrivalBatches.map((batch) => batch.batch.expectedArrivalAtHubDate)).sort();
    const expectedLatestMaterialDate = allBatchDates.at(-1) ?? null;
    const materialRisk = ready.length === canonicalMaterials.length && canonicalMaterials.length ? "ready" : notPurchasedCount ? "unpurchase" : expectedLatestMaterialDate && delivery && expectedLatestMaterialDate > delivery ? "late_expected" : pendingInboundCount ? "pending_inbound" : "normal";
    const batchRecommendations = canonicalMaterials.flatMap(canonicalRecommendations);
    const transportStatuses = new Set(batchRecommendations.map((item) => item.status));
    const transportRisk = transportStatuses.has("late") ? "late" : transportStatuses.has("hub_missing") ? "hub_missing" : transportStatuses.has("site_missing") ? "site_missing" : transportStatuses.has("route_missing") ? "route_missing" : transportStatuses.has("modes_missing") ? "modes_missing" : transportStatuses.has("pending_schedule") ? "pending_schedule" : batchRecommendations.some((item) => item.escalationLevel === "only_fastest") ? "only_fastest" : batchRecommendations.some((item) => item.escalationLevel === "faster_required") ? "faster_required" : "none";
    const exceptions: string[] = [];
    for (const item of canonicalMaterials.filter((material) => material.hasUnpurchasedDemand).slice(0, 2)) exceptions.push(`${item.materialName}尚未采购`);
    for (const item of canonicalMaterials.filter((material) => !material.isReady && !material.hasUnpurchasedDemand && material.hasPendingInboundDemand).slice(0, Math.max(0, 3 - exceptions.length))) exceptions.push(`${item.materialName}待入库`);
    for (const item of riskyCanonicalMaterials.slice(0, Math.max(0, 5 - exceptions.length))) {
      const recommendations = canonicalRecommendations(item);
      const recommendation = item.expectedArrivalBatches.length
        ? tightestRecommendation(item.expectedArrivalBatches, recommendations[0])
        : recommendations[0];
      exceptions.push(`${item.materialName}：${recommendation.message}`);
    }
    const basis = canonicalMaterials.flatMap((item) => item.expectedArrivalBatches).map((item) => item.recommendation.basis)[0]
      ?? materials[0]?.logistics.basis
      ?? { scheduleAssignmentId: assignment?.id ?? null, supplyHub: null, productionSite: null, matchedRoute: null, candidateTransportModes: [] };
    projections.push({
      salesContractNo,
      order,
      styleNo: order?.styleNo || source.sourceStyleNoSnapshot,
      factoryStyleNo: order?.factoryStyleNo || source.sourceFactoryStyleNoSnapshot,
      brand: order?.brandNameSnapshot || source.sourceBrandSnapshot,
      owner: source.sourceOwnerSnapshot,
      customer: order?.customerNameSnapshot?.trim() ?? "",
      garmentQuantity: order ? getEffectiveQuantity(order) : source.sourceOrderQuantitySnapshot,
      contractDeliveryDate: delivery,
      daysRemaining: remaining,
      salesRisk,
      materialRisk,
      transportRisk,
      fabricReady: fabric.filter((item) => item.isReady).length,
      fabricTotal: fabric.length,
      trimReady: trim.filter((item) => item.isReady).length,
      trimTotal: trim.length,
      totalReady: ready.length,
      totalMaterials: canonicalMaterials.length,
      readinessRate: canonicalMaterials.length ? ready.length / canonicalMaterials.length * 100 : 0,
      notPurchasedCount,
      pendingInboundCount,
      transportRiskCount: riskyCanonicalMaterials.length,
      expectedLatestMaterialDate,
      logisticsBasis: basis,
      logisticsContext: { assignment, supplyHubId: tracking?.supplyHubId ?? null },
      canonicalMaterials,
      materials,
      factorySuppliedDemands,
      keyExceptions: exceptions.slice(0, 5),
    });
  }
  return projections.sort((left, right) => {
    const risk = (value: StyleProgressProjection) => value.salesRisk === "overdue" ? 0 : value.transportRisk === "late" ? 1 : value.notPurchasedCount ? 2 : value.pendingInboundCount ? 3 : 4;
    return risk(left) - risk(right) || (left.contractDeliveryDate ?? "9999").localeCompare(right.contractDeliveryDate ?? "9999") || left.salesContractNo.localeCompare(right.salesContractNo);
  });
}

export function fabricDisplayOrder(materials: MaterialProgressProjection[]): MaterialProgressProjection[] {
  return materials.filter((item) => item.demand.materialType === "fabric").sort((left, right) => {
    const leftActual = left.demand.actualConsumption;
    const rightActual = right.demand.actualConsumption;
    if (leftActual !== null && rightActual === null) return -1;
    if (leftActual === null && rightActual !== null) return 1;
    const consumptionOrder = leftActual !== null && rightActual !== null
      ? rightActual - leftActual
      : (right.demand.plannedConsumption ?? -Infinity) - (left.demand.plannedConsumption ?? -Infinity);
    return consumptionOrder || left.demand.sourceSortNo - right.demand.sourceSortNo || left.demand.id.localeCompare(right.demand.id);
  });
}

export function trimDisplayOrder(materials: MaterialProgressProjection[]): MaterialProgressProjection[] { return materials.filter((item) => item.demand.materialType === "trim").sort((left, right) => left.demand.sourceSortNo - right.demand.sourceSortNo); }

export function normalizeGarmentColorTokens(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => value.normalize("NFKC").split(/[\/、，,；;。\s]+/).map((item) => item.trim()).filter(Boolean)))];
}

export function filterMaterialsByGarmentColor(materials: MaterialProgressProjection[], selectedColor: string): MaterialProgressProjection[] {
  if (selectedColor === "all") return materials;
  const target = selectedColor.normalize("NFKC").trim();
  return materials.filter((item) => normalizeGarmentColorTokens(item.demand.garmentColors).includes(target));
}

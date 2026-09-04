import type { SalesOrder } from "../../order-center/model/order.ts";
import { getEffectiveQuantity } from "../../order-center/model/order.ts";
import type { OperationsSettingsState } from "../../operations-settings/model/operations-settings.ts";
import type { ProductionSchedulingState, ScheduleAssignment } from "../../production-scheduling/model/production-scheduling.ts";
import { recommendMaterialTransport, type MaterialLogisticsRecommendation } from "../../production-scheduling/service/material-logistics-service.ts";
import type { MaterialDemand, MaterialInboundEvent, MaterialLifecycleStatus, MaterialReadinessStatus, StyleProgressData } from "../model/style-progress.ts";

export type MaterialProgressProjection = {
  demand: MaterialDemand;
  purchasedQuantity: number;
  inboundQuantity: number;
  shipmentQuantity: number;
  outboundQuantity: number;
  actualInboundDate: string | null;
  readinessStatus: MaterialReadinessStatus;
  lifecycleStatus: MaterialLifecycleStatus;
  logistics: MaterialLogisticsRecommendation;
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
  materials: MaterialProgressProjection[];
  keyExceptions: string[];
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const byDemand = <T extends { materialDemandId: string }>(rows: T[]) => {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(row.materialDemandId, [...(result.get(row.materialDemandId) ?? []), row]);
  return result;
};
const daysFromToday = (date: string | null, today: string) => date ? Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000) : null;
const activeAssignments = (state: ProductionSchedulingState, orderId: string) => state.scheduleAssignments.filter((item) => item.salesOrderId === orderId && item.status !== "cancelled");
const earliestAssignment = (items: ScheduleAssignment[]) => items.filter((item) => item.plannedStartDate).sort((left, right) => (left.plannedStartDate ?? "").localeCompare(right.plannedStartDate ?? ""))[0] ?? null;

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

export function buildStyleProgressProjections(input: { data: StyleProgressData; orders: SalesOrder[]; scheduling: ProductionSchedulingState; settings: OperationsSettingsState; today?: string }): StyleProgressProjection[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const ordersByContract = new Map(input.orders.filter((order) => order.salesContractNo).map((order) => [order.salesContractNo!, order]));
  const purchaseByDemand = byDemand(input.data.purchaseEvents); const inboundByDemand = byDemand(input.data.inboundEvents); const shipmentByDemand = byDemand(input.data.shipmentEvents); const outboundByDemand = byDemand(input.data.outboundEvents);
  const groups = new Map<string, MaterialDemand[]>();
  for (const demand of input.data.demands) groups.set(demand.salesContractNo, [...(groups.get(demand.salesContractNo) ?? []), demand]);
  const trackings = new Map(input.scheduling.orderExecutionTrackings.map((item) => [item.salesOrderId, item]));
  const projections: StyleProgressProjection[] = [];
  for (const [salesContractNo, demands] of groups) {
    const order = ordersByContract.get(salesContractNo) ?? null;
    const assignment = order ? earliestAssignment(activeAssignments(input.scheduling, order.id)) : null;
    const tracking = order ? trackings.get(order.id) ?? null : null;
    const materials = demands.map((demand): MaterialProgressProjection => {
      const purchasedQuantity = sum((purchaseByDemand.get(demand.id) ?? []).map((event) => event.quantity));
      const inboundEvents = inboundByDemand.get(demand.id) ?? [];
      const inboundQuantity = sum(inboundEvents.map((event) => event.quantity));
      const shipmentQuantity = sum((shipmentByDemand.get(demand.id) ?? []).map((event) => event.quantity));
      const outboundQuantity = sum((outboundByDemand.get(demand.id) ?? []).map((event) => event.quantity));
      const actualInboundDate = actualReadyDate(demand.requiredQuantity, inboundEvents);
      const statuses = deriveMaterialStatuses(demand.requiredQuantity, purchasedQuantity, inboundQuantity, shipmentQuantity, outboundQuantity);
      const logistics = recommendMaterialTransport({ assignment, settings: input.settings, supplyHubId: tracking?.supplyHubId ?? null, expectedMaterialReadyDate: demand.expectedMaterialReadyDate, actualMaterialReadyDate: actualInboundDate });
      return { demand, purchasedQuantity, inboundQuantity, shipmentQuantity, outboundQuantity, actualInboundDate, ...statuses, logistics };
    });
    const fabric = materials.filter((item) => item.demand.materialType === "fabric"); const trim = materials.filter((item) => item.demand.materialType === "trim");
    const ready = materials.filter((item) => item.readinessStatus === "ready"); const notPurchasedCount = materials.filter((item) => item.readinessStatus === "not_purchased").length; const pendingInboundCount = materials.filter((item) => item.readinessStatus === "pending_inbound" || item.readinessStatus === "purchasing").length;
    const riskyTransport = materials.filter((item) => ["late", "hub_missing", "site_missing", "route_missing", "modes_missing"].includes(item.logistics.status) || item.logistics.escalationLevel === "faster_required" || item.logistics.escalationLevel === "only_fastest");
    const source = demands[0]; const delivery = order?.contractDeliveryDate ?? null; const remaining = daysFromToday(delivery, today);
    const salesRisk = remaining === null ? "unknown" : remaining < 0 ? "overdue" : remaining <= 7 ? "7d" : remaining <= 14 ? "14d" : remaining <= 30 ? "30d" : "normal";
    const expectedLatestMaterialDate = materials.map((item) => item.demand.expectedMaterialReadyDate).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    const materialRisk = ready.length === materials.length && materials.length ? "ready" : notPurchasedCount ? "unpurchase" : expectedLatestMaterialDate && delivery && expectedLatestMaterialDate > delivery ? "late_expected" : pendingInboundCount ? "pending_inbound" : "normal";
    const logisticsStatuses = new Set(materials.map((item) => item.logistics.status));
    const transportRisk = logisticsStatuses.has("late") ? "late" : logisticsStatuses.has("hub_missing") ? "hub_missing" : logisticsStatuses.has("site_missing") ? "site_missing" : logisticsStatuses.has("route_missing") ? "route_missing" : logisticsStatuses.has("modes_missing") ? "modes_missing" : logisticsStatuses.has("pending_schedule") ? "pending_schedule" : materials.some((item) => item.logistics.escalationLevel === "only_fastest") ? "only_fastest" : materials.some((item) => item.logistics.escalationLevel === "faster_required") ? "faster_required" : "none";
    const exceptions: string[] = [];
    for (const item of materials.filter((material) => material.readinessStatus === "not_purchased").slice(0, 2)) exceptions.push(`${item.demand.materialName || item.demand.materialCode}尚未采购`);
    for (const item of materials.filter((material) => material.readinessStatus === "pending_inbound").slice(0, Math.max(0, 3 - exceptions.length))) exceptions.push(`${item.demand.materialName || item.demand.materialCode}待入库`);
    for (const item of riskyTransport.slice(0, Math.max(0, 5 - exceptions.length))) exceptions.push(`${item.demand.materialName || item.demand.materialCode}：${item.logistics.message}`);
    projections.push({ salesContractNo, order, styleNo: order?.styleNo || source.sourceStyleNoSnapshot, factoryStyleNo: order?.factoryStyleNo || source.sourceFactoryStyleNoSnapshot, brand: order?.brandNameSnapshot || source.sourceBrandSnapshot, owner: source.sourceOwnerSnapshot, customer: order?.customerNameSnapshot || source.sourceCustomerSnapshot, garmentQuantity: order ? getEffectiveQuantity(order) : source.sourceOrderQuantitySnapshot, contractDeliveryDate: delivery, daysRemaining: remaining, salesRisk, materialRisk, transportRisk, fabricReady: fabric.filter((item) => item.readinessStatus === "ready").length, fabricTotal: fabric.length, trimReady: trim.filter((item) => item.readinessStatus === "ready").length, trimTotal: trim.length, totalReady: ready.length, totalMaterials: materials.length, readinessRate: materials.length ? ready.length / materials.length * 100 : 0, notPurchasedCount, pendingInboundCount, transportRiskCount: riskyTransport.length, expectedLatestMaterialDate, logisticsBasis: materials[0]?.logistics.basis ?? { scheduleAssignmentId: null, supplyHub: null, productionSite: null, matchedRoute: null, candidateTransportModes: [] }, materials, keyExceptions: exceptions.slice(0, 5) });
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
  return [...new Set(values.flatMap((value) => value.normalize("NFKC").split(/[\/／,，;；、\s]+/).map((item) => item.trim()).filter(Boolean)))];
}

export function filterMaterialsByGarmentColor(materials: MaterialProgressProjection[], selectedColor: string): MaterialProgressProjection[] {
  if (selectedColor === "all") return materials;
  const target = selectedColor.normalize("NFKC").trim();
  return materials.filter((item) => normalizeGarmentColorTokens(item.demand.garmentColors).includes(target));
}

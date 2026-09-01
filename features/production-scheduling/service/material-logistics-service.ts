import type { OperationsSettingsState, ProductionSite, SupplyHub, SupplyRoute, TransportMode } from "../../operations-settings/model/operations-settings.ts";
import type { OrderExecutionTracking, ScheduleAssignment } from "../model/production-scheduling.ts";
import { getMaterialReadyDate } from "./production-scheduling-service.ts";

export type LogisticsRecommendation = { status: "incomplete" | "no_cross_border" | "feasible" | "late"; materialReadyDate: string | null; latestRequiredArrivalDate: string | null; recommendedMode: TransportMode | null; earliestArrivalDate: string | null; gapDays: number; message: string };
export type MaterialLogisticsRecommendation = {
  status: "pending_schedule" | "hub_missing" | "site_missing" | "route_missing" | "modes_missing" | "incomplete" | "feasible" | "late";
  materialReadyDate: string | null;
  plannedProductionStartDate: string | null;
  latestRequiredArrivalDate: string | null;
  recommendedMode: TransportMode | null;
  expectedArrivalDate: string | null;
  bufferDays: number | null;
  gapDays: number;
  escalationLevel: "none" | "faster_required" | "only_fastest" | "late";
  message: string;
  basis: {
    scheduleAssignmentId: string | null;
    supplyHub: SupplyHub | null;
    productionSite: ProductionSite | null;
    matchedRoute: SupplyRoute | null;
    candidateTransportModes: TransportMode[];
  };
};
const shift = (value: string, days: number) => { const result = new Date(`${value}T00:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); };
const gap = (from: string, to: string) => Math.ceil((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);

type LogisticsAssignment = Pick<ScheduleAssignment, "id" | "executionType" | "productionGroupId" | "plannedStartDate">;
export function productionSiteForAssignment(assignment: LogisticsAssignment, settings: OperationsSettingsState): ProductionSite | null { if (assignment.executionType !== "internal") return null; const group = settings.productionGroups.find((item) => item.id === assignment.productionGroupId); return settings.productionSites.find((item) => item.id === group?.productionSiteId) ?? null; }
export function recommendTransport(input: { assignment: LogisticsAssignment; tracking: OrderExecutionTracking | null; settings: OperationsSettingsState }): LogisticsRecommendation {
  const materialReadyDate = input.tracking ? getMaterialReadyDate(input.tracking) : null; const site = productionSiteForAssignment(input.assignment, input.settings);
  if (!materialReadyDate || !input.assignment.plannedStartDate || !site || !input.tracking?.supplyHubId) return { status: "incomplete", materialReadyDate, latestRequiredArrivalDate: null, recommendedMode: null, earliestArrivalDate: null, gapDays: 0, message: "请补全物料到仓、生产地点和计划开工日期" };
  const route = input.settings.supplyRoutes.find((item) => item.enabled && item.supplyHubId === input.tracking?.supplyHubId && item.productionSiteId === site.id);
  const latestRequiredArrivalDate = shift(input.assignment.plannedStartDate, -site.preProductionSampleLeadDays);
  if (!route) return { status: "no_cross_border", materialReadyDate, latestRequiredArrivalDate, recommendedMode: null, earliestArrivalDate: materialReadyDate, gapDays: 0, message: "无需跨境运输建议" };
  const modes = input.settings.transportModes.filter((item) => item.enabled && item.routeId === route.id).sort((a, b) => b.transitDays - a.transitDays);
  const feasible = modes.find((item) => shift(materialReadyDate, item.transitDays) <= latestRequiredArrivalDate) ?? null;
  if (feasible) return { status: "feasible", materialReadyDate, latestRequiredArrivalDate, recommendedMode: feasible, earliestArrivalDate: shift(materialReadyDate, feasible.transitDays), gapDays: 0, message: `建议 ${feasible.name}（${feasible.transitDays} 天）` };
  const fastest = modes.slice().sort((a, b) => a.transitDays - b.transitDays)[0] ?? null; const earliestArrivalDate = fastest ? shift(materialReadyDate, fastest.transitDays) : materialReadyDate; const gapDays = Math.max(0, gap(latestRequiredArrivalDate, earliestArrivalDate));
  return { status: "late", materialReadyDate, latestRequiredArrivalDate, recommendedMode: fastest, earliestArrivalDate, gapDays, message: `⚠ 当前所有运输方式均无法满足封样及计划开工时间；最快仍晚 ${gapDays} 天，预计 ${earliestArrivalDate} 到达` };
}

/**
 * Per-material projection. It deliberately reuses the same ProductionSite,
 * SupplyRoute and TransportMode facts as the order-level recommendation.
 */
export function recommendMaterialTransport(input: {
  assignment: LogisticsAssignment | null;
  settings: OperationsSettingsState;
  supplyHubId: string | null;
  expectedMaterialReadyDate: string | null;
  actualMaterialReadyDate?: string | null;
}): MaterialLogisticsRecommendation {
  const materialReadyDate = input.actualMaterialReadyDate || input.expectedMaterialReadyDate;
  const emptyBasis = { scheduleAssignmentId: input.assignment?.id ?? null, supplyHub: null, productionSite: null, matchedRoute: null, candidateTransportModes: [] };
  if (!input.assignment?.plannedStartDate) return { status: "pending_schedule", materialReadyDate, plannedProductionStartDate: null, latestRequiredArrivalDate: null, recommendedMode: null, expectedArrivalDate: null, bufferDays: null, gapDays: 0, escalationLevel: "none", message: "待排单后计算", basis: emptyBasis };
  const plannedProductionStartDate = input.assignment.plannedStartDate;
  const site = productionSiteForAssignment(input.assignment, input.settings);
  const hub = input.supplyHubId ? input.settings.supplyHubs.find((item) => item.id === input.supplyHubId) ?? null : null;
  const basis = { ...emptyBasis, supplyHub: hub, productionSite: site };
  if (!input.supplyHubId) return { status: "hub_missing", materialReadyDate, plannedProductionStartDate, latestRequiredArrivalDate: site ? shift(plannedProductionStartDate, -site.preProductionSampleLeadDays) : null, recommendedMode: null, expectedArrivalDate: null, bufferDays: null, gapDays: 0, escalationLevel: "none", message: "集货仓未设置", basis };
  if (!hub) return { status: "hub_missing", materialReadyDate, plannedProductionStartDate, latestRequiredArrivalDate: site ? shift(plannedProductionStartDate, -site.preProductionSampleLeadDays) : null, recommendedMode: null, expectedArrivalDate: null, bufferDays: null, gapDays: 0, escalationLevel: "none", message: "集货仓资料不存在", basis };
  if (!site) return { status: "site_missing", materialReadyDate, plannedProductionStartDate, latestRequiredArrivalDate: null, recommendedMode: null, expectedArrivalDate: null, bufferDays: null, gapDays: 0, escalationLevel: "none", message: "生产地点未设置", basis };
  const latestRequiredArrivalDate = shift(plannedProductionStartDate, -site.preProductionSampleLeadDays);
  const route = input.settings.supplyRoutes.find((item) => item.enabled && item.supplyHubId === input.supplyHubId && item.productionSiteId === site.id);
  if (!route) return { status: "route_missing", materialReadyDate, plannedProductionStartDate, latestRequiredArrivalDate, recommendedMode: null, expectedArrivalDate: null, bufferDays: null, gapDays: 0, escalationLevel: "none", message: `${hub.name} → ${site.name}路线未配置`, basis };
  const modes = input.settings.transportModes.filter((item) => item.enabled && item.routeId === route.id).sort((left, right) => right.transitDays - left.transitDays);
  const matchedBasis = { ...basis, matchedRoute: route, candidateTransportModes: modes };
  if (!modes.length) return { status: "modes_missing", materialReadyDate, plannedProductionStartDate, latestRequiredArrivalDate, recommendedMode: null, expectedArrivalDate: null, bufferDays: null, gapDays: 0, escalationLevel: "none", message: "当前路线未配置运输方式", basis: matchedBasis };
  if (!materialReadyDate) return { status: "incomplete", materialReadyDate: null, plannedProductionStartDate, latestRequiredArrivalDate, recommendedMode: null, expectedArrivalDate: null, bufferDays: null, gapDays: 0, escalationLevel: "none", message: "当前预计到料日未填写", basis: matchedBasis };
  const feasible = modes.find((mode) => shift(materialReadyDate, mode.transitDays) <= latestRequiredArrivalDate) ?? null;
  if (feasible) {
    const expectedArrivalDate = shift(materialReadyDate, feasible.transitDays);
    const fastestDays = Math.min(...modes.map((mode) => mode.transitDays));
    const slowestDays = Math.max(...modes.map((mode) => mode.transitDays));
    const escalationLevel = feasible.transitDays === fastestDays && fastestDays !== slowestDays ? "only_fastest" : feasible.transitDays < slowestDays ? "faster_required" : "none";
    const bufferDays = gap(expectedArrivalDate, latestRequiredArrivalDate);
    return { status: "feasible", materialReadyDate, plannedProductionStartDate, latestRequiredArrivalDate, recommendedMode: feasible, expectedArrivalDate, bufferDays, gapDays: 0, escalationLevel, message: `建议${feasible.name}，预计 ${expectedArrivalDate} 到厂`, basis: matchedBasis };
  }
  const fastest = [...modes].sort((left, right) => left.transitDays - right.transitDays)[0];
  const expectedArrivalDate = shift(materialReadyDate, fastest.transitDays);
  const gapDays = Math.max(0, gap(latestRequiredArrivalDate, expectedArrivalDate));
  return { status: "late", materialReadyDate, plannedProductionStartDate, latestRequiredArrivalDate, recommendedMode: fastest, expectedArrivalDate, bufferDays: -gapDays, gapDays, escalationLevel: "late", message: `最快${fastest.name}仍晚 ${gapDays} 天`, basis: matchedBasis };
}

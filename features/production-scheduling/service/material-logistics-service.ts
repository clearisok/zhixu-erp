import type { OperationsSettingsState, ProductionSite, TransportMode } from "../../operations-settings/model/operations-settings.ts";
import type { OrderExecutionTracking, ScheduleAssignment } from "../model/production-scheduling.ts";
import { getMaterialReadyDate } from "./production-scheduling-service.ts";

export type LogisticsRecommendation = { status: "incomplete" | "no_cross_border" | "feasible" | "late"; materialReadyDate: string | null; latestRequiredArrivalDate: string | null; recommendedMode: TransportMode | null; earliestArrivalDate: string | null; gapDays: number; message: string };
const shift = (value: string, days: number) => { const result = new Date(`${value}T00:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); };
const gap = (from: string, to: string) => Math.ceil((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);

type LogisticsAssignment = Pick<ScheduleAssignment, "executionType" | "productionGroupId" | "plannedStartDate">;
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

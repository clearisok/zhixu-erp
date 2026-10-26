import { recommendMaterialTransport, type LogisticsAssignment, type MaterialLogisticsRecommendation, type MaterialLogisticsSettings } from "../../production-scheduling/service/material-logistics-service.ts";
import { bufferRiskForDays, calculateDaysToProduction } from "../service/style-progress-service.ts";
import { productionResourceDate } from "../../../server/production-resources/contract.ts";

export type ArrivalLogisticsContext = {
  schemaVersion: "material-arrival-logistics.v1";
  orderId: string;
  status: "ready" | "unavailable";
  planVersion: number;
  assignment: (LogisticsAssignment & { version: number; resourceSnapshotHash: string }) | null;
  supplyHubId: string | null;
  settings: MaterialLogisticsSettings;
  versions: { hub: number | null; route: number | null; modes: { id: string; version: number }[] };
  issues: ("hub_disabled" | "route_ambiguous" | "context_unavailable")[];
};
export type ArrivalBatchLogistics = {
  status: "ready" | "blocked";
  message: string;
  recommendation: MaterialLogisticsRecommendation | null;
  daysToProduction: number | null;
  bufferRisk: "unknown" | "green" | "yellow" | "red";
};

/** No second transport formula: saved and draft batches use the original
 * calculator. A historical date never silently becomes an arrival at a new Hub. */
export function projectArrivalBatchLogistics(context: ArrivalLogisticsContext, arrivalDate: string, planIssues: readonly string[] = []): ArrivalBatchLogistics {
  const blocked = (message: string): ArrivalBatchLogistics => ({ status: "blocked", message, recommendation: null, daysToProduction: null, bufferRisk: "unknown" });
  if (planIssues.length) return blocked("原到料计划需核对，暂不测算运输");
  if (context.status !== "ready" || context.issues.includes("context_unavailable")) return blocked("运输资料暂不可用");
  if (context.issues.includes("hub_disabled")) return blocked("所选集货仓已停用，请核对");
  if (context.issues.includes("route_ambiguous")) return blocked("运输路线无法唯一识别，请核对");
  try { productionResourceDate(arrivalDate); } catch { return blocked("请填写有效的预计到集货仓日期"); }
  const recommendation = recommendMaterialTransport({ assignment: context.assignment, settings: context.settings,
    supplyHubId: context.supplyHubId, expectedMaterialReadyDate: arrivalDate });
  return { status: "ready", message: recommendation.message, recommendation,
    daysToProduction: calculateDaysToProduction(arrivalDate, recommendation.plannedProductionStartDate),
    bufferRisk: bufferRiskForDays(recommendation.bufferDays) };
}

import type { ProductionSchedulingState, ScheduleAssignment } from "../model/production-scheduling.ts";

type LegacyProductionPlanV8 = { id: string; salesOrderId: string };
type LegacyScheduleAssignmentV8 = Omit<ScheduleAssignment, "salesOrderId" | "queueSequence" | "durationMode" | "averageDailyOutputSnapshot" | "requiredWorkdays" | "nonWorkingDayCount" | "dateMode"> & { productionPlanId: string };
type LegacySchedulingStateV8 = { productionPlans: LegacyProductionPlanV8[]; scheduleAssignments: LegacyScheduleAssignmentV8[]; orderExecutionTrackings: Array<Record<string, unknown>> };

const daySpan = (start: string | null, end: string | null) => {
  if (!start || !end) return 1;
  return Math.max(1, Math.floor((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1);
};

export function migrateProductionSchedulingV8ToV9(value: unknown): ProductionSchedulingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("生产排单本地数据格式无效");
  const source = value as Partial<LegacySchedulingStateV8 & ProductionSchedulingState>;
  if (!Array.isArray(source.scheduleAssignments) || !Array.isArray(source.orderExecutionTrackings)) throw new Error("生产排单集合结构无效");
  const planOwners = new Map((Array.isArray(source.productionPlans) ? source.productionPlans : []).map((plan) => [plan.id, plan.salesOrderId]));
  const queueByGroup = new Map<string, number>();
  const scheduleAssignments = source.scheduleAssignments.map((raw) => {
    const item = raw as unknown as Record<string, unknown>;
    const salesOrderId = typeof item.salesOrderId === "string" ? item.salesOrderId : planOwners.get(String(item.productionPlanId ?? ""));
    if (!salesOrderId) throw new Error(`旧排单 ${String(item.id ?? "")} 无法映射到订单`);
    const groupKey = item.executionType === "internal" ? String(item.productionGroupId ?? "") : "";
    const nextQueue = groupKey ? (queueByGroup.get(groupKey) ?? 0) + 1 : null;
    if (groupKey && nextQueue) queueByGroup.set(groupKey, nextQueue);
    const { productionPlanId: _legacyProductionPlanId, ...runtimeFields } = item;
    void _legacyProductionPlanId;
    return {
      ...runtimeFields,
      salesOrderId,
      queueSequence: typeof item.queueSequence === "number" ? item.queueSequence : nextQueue,
      durationMode: item.durationMode === "average_daily_output" ? "average_daily_output" : "workdays",
      averageDailyOutputSnapshot: typeof item.averageDailyOutputSnapshot === "number" ? item.averageDailyOutputSnapshot : null,
      requiredWorkdays: typeof item.requiredWorkdays === "number" ? Math.max(1, Math.ceil(item.requiredWorkdays)) : daySpan(item.plannedStartDate as string | null, item.plannedEndDate as string | null),
      nonWorkingDayCount: typeof item.nonWorkingDayCount === "number" ? Math.max(0, Math.floor(item.nonWorkingDayCount)) : 0,
      dateMode: item.dateMode === "auto_queue" ? "auto_queue" : "manual_fixed",
    } as ScheduleAssignment;
  });
  const orderExecutionTrackings = source.orderExecutionTrackings.map((raw) => ({
    ...raw,
    supplyHubId: typeof raw.supplyHubId === "string" ? raw.supplyHubId : null,
    fabricSupplyHubArrivalDate: typeof raw.fabricSupplyHubArrivalDate === "string" ? raw.fabricSupplyHubArrivalDate : null,
    trimSupplyHubArrivalDate: typeof raw.trimSupplyHubArrivalDate === "string" ? raw.trimSupplyHubArrivalDate : null,
  })) as ProductionSchedulingState["orderExecutionTrackings"];
  return { scheduleAssignments, orderExecutionTrackings };
}

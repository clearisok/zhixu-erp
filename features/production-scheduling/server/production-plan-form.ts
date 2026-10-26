import { derivePlanDuration, parsePlanIntent, planDecimal, type PlanIntent } from "../../../server/production-scheduling/contract";
import { ProductionPlanError, type Assignment, type PlanOrderRead } from "./production-plan-client";

export type PlanForm = {
  orderId: string; assignmentId: string | null; expectedVersion: number; expectedPlanVersion: number;
  executionType: "internal" | "outsource"; executorId: string; colorId: string;
  plannedQuantity: string; durationMode: "average_daily_output" | "workdays"; dailyOutput: string; workdays: string;
  dateMode: "auto_queue" | "manual_fixed"; startDate: string; endDate: string; remark: string; reason: string;
};
export function newPlanForm(order: PlanOrderRead, preferredGroupId = ""): PlanForm {
  return { orderId: order.order.id, assignmentId: null, expectedVersion: 0, expectedPlanVersion: order.order.planVersion,
    executionType: "internal", executorId: preferredGroupId, colorId: "", plannedQuantity: order.summary.remainingQuantity ?? "",
    durationMode: "average_daily_output", dailyOutput: "", workdays: "", dateMode: "auto_queue", startDate: "", endDate: "", remark: "", reason: "" };
}
export function editPlanForm(order: PlanOrderRead, row: Assignment): PlanForm {
  if (row.orderId !== order.order.id || row.status !== "planned") throw new ProductionPlanError(409, "production_assignment_version_conflict");
  return { orderId: row.orderId, assignmentId: row.id, expectedVersion: row.version, expectedPlanVersion: order.order.planVersion,
    executionType: row.executionType, executorId: row.productionGroupId ?? row.outsourceFactoryId ?? "", colorId: row.colorId ?? "",
    plannedQuantity: row.plannedQuantity, durationMode: row.durationMode, dailyOutput: row.dailyOutputSnapshot, workdays: String(row.requiredWorkdays),
    dateMode: row.dateMode, startDate: row.plannedStartDate, endDate: row.plannedEndDate, remark: row.remark, reason: "" };
}
function duration(form: PlanForm) {
  if (form.durationMode === "average_daily_output") return { mode: "average_daily_output" as const, dailyOutput: planDecimal(form.dailyOutput, true) };
  if (!/^\d{1,5}$/u.test(form.workdays)) throw new Error("invalid_workdays");
  const workdays = Number(form.workdays); if (workdays < 1 || workdays > 36600) throw new Error("invalid_workdays");
  return { mode: "workdays" as const, workdays };
}
/** Display the existing exact calculation; never coerce an empty field to zero. */
export function planFormDuration(form: PlanForm) {
  try { return derivePlanDuration({ plannedQuantity: planDecimal(form.plannedQuantity), duration: duration(form) }); } catch { return null; }
}
export function planFormIntent(form: PlanForm): PlanIntent {
  try {
    const data = { executionType: form.executionType, executorId: form.executorId, colorId: form.colorId || null, plannedQuantity: planDecimal(form.plannedQuantity),
      duration: duration(form), dates: form.dateMode === "auto_queue" ? { mode: "auto_queue", startDate: form.startDate }
        : { mode: "manual_fixed", startDate: form.startDate, endDate: form.endDate }, remark: form.remark };
    return parsePlanIntent({ action: form.assignmentId ? "update" : "create", orderId: form.orderId, assignmentId: form.assignmentId,
      expectedVersion: form.expectedVersion, expectedPlanVersion: form.expectedPlanVersion, data, ...(form.assignmentId ? { reason: form.reason } : {}) });
  } catch { throw new ProductionPlanError(400, "invalid_production_plan_intent", true); }
}

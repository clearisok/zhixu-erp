import { HttpError } from "../http/errors.js";
import { canonicalDecimal } from "../quotes/decimal-projection.js";
import { productionResourceDate, productionResourceUuid } from "../production-resources/contract.js";
import { SCHEDULE_PLANNING_LIMITS } from "./planning-preview.js";

export type PlanData = {
  executionType: "internal" | "outsource";
  executorId: string;
  colorId: string | null;
  plannedQuantity: string;
  duration: { mode: "average_daily_output"; dailyOutput: string } | { mode: "workdays"; workdays: number };
  dates: { mode: "auto_queue"; startDate: string } | { mode: "manual_fixed"; startDate: string; endDate: string };
  remark: string;
};
type OrderIntentBase = { orderId: string; expectedPlanVersion: number };
export type PlanIntent =
  | (OrderIntentBase & { action: "create"; assignmentId: null; expectedVersion: 0; data: PlanData })
  | (OrderIntentBase & { action: "update"; assignmentId: string; expectedVersion: number; data: PlanData; reason: string })
  | (OrderIntentBase & { action: "cancel"; assignmentId: string; expectedVersion: number; reason: string })
  | { action: "replan"; groupId: string; expectedQueueVersion: number; anchorDate: string; orderedAssignmentIds: string[] | null };
export type PlanCommand = { requestId: string; intent: PlanIntent; previewHash: string };

const fail = (): never => { throw new HttpError(400, "invalid_production_plan_intent", "Invalid production plan intent"); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]) {
  const result = object(value);
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key))) return fail();
  return result;
}
const uuid = (value: unknown) => { try { return productionResourceUuid(value); } catch { return fail(); } };
const date = (value: unknown) => { try { return productionResourceDate(value); } catch { return fail(); } };
function integer(value: unknown, min: number, max = 2_147_483_646): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return fail();
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max || value.includes("\0")
    || Array.from(value).some(char => char.length === 1 && /[\uD800-\uDFFF]/u.test(char))) return fail();
  return value;
}
export function planDecimal(value: unknown, positive = false): string {
  if (typeof value !== "string" || value.length > 128 || !/^\d+(?:\.\d+)?$/u.test(value)) return fail();
  const result = canonicalDecimal(value);
  if (positive && result === "0") return fail();
  return result;
}
function planData(value: unknown): PlanData {
  const raw = exact(value, ["executionType", "executorId", "colorId", "plannedQuantity", "duration", "dates", "remark"]);
  if (raw.executionType !== "internal" && raw.executionType !== "outsource") return fail();
  const durationRaw = object(raw.duration);
  let duration: PlanData["duration"];
  if (durationRaw.mode === "average_daily_output") {
    exact(durationRaw, ["mode", "dailyOutput"]);
    duration = { mode: durationRaw.mode, dailyOutput: planDecimal(durationRaw.dailyOutput, true) };
  } else {
    exact(durationRaw, ["mode", "workdays"]);
    if (durationRaw.mode !== "workdays") return fail();
    duration = { mode: durationRaw.mode, workdays: integer(durationRaw.workdays, 1, SCHEDULE_PLANNING_LIMITS.workdays) };
  }
  const datesRaw = object(raw.dates);
  let dates: PlanData["dates"];
  if (datesRaw.mode === "auto_queue") {
    exact(datesRaw, ["mode", "startDate"]);
    if (raw.executionType !== "internal") return fail();
    dates = { mode: datesRaw.mode, startDate: date(datesRaw.startDate) };
  } else {
    exact(datesRaw, ["mode", "startDate", "endDate"]);
    if (datesRaw.mode !== "manual_fixed") return fail();
    dates = { mode: datesRaw.mode, startDate: date(datesRaw.startDate), endDate: date(datesRaw.endDate) };
    if (dates.endDate < dates.startDate) return fail();
  }
  return { executionType: raw.executionType, executorId: uuid(raw.executorId), colorId: raw.colorId === null ? null : uuid(raw.colorId),
    plannedQuantity: planDecimal(raw.plannedQuantity), duration, dates, remark: text(raw.remark, 2000) };
}
export function parsePlanIntent(value: unknown): PlanIntent {
  const raw = object(value);
  if (raw.action === "replan") {
    exact(raw, ["action", "groupId", "expectedQueueVersion", "anchorDate", "orderedAssignmentIds"]);
    let orderedAssignmentIds: string[] | null = null;
    if (raw.orderedAssignmentIds !== null) {
      if (!Array.isArray(raw.orderedAssignmentIds) || raw.orderedAssignmentIds.length > SCHEDULE_PLANNING_LIMITS.queueRows) return fail();
      orderedAssignmentIds = Array.from(raw.orderedAssignmentIds, uuid);
      if (new Set(orderedAssignmentIds).size !== orderedAssignmentIds.length) return fail();
    }
    return { action: raw.action, groupId: uuid(raw.groupId), expectedQueueVersion: integer(raw.expectedQueueVersion, 0), anchorDate: date(raw.anchorDate), orderedAssignmentIds };
  }
  const baseKeys = ["action", "orderId", "expectedPlanVersion", "assignmentId", "expectedVersion"];
  if (raw.action === "create") {
    exact(raw, [...baseKeys, "data"]);
    if (raw.assignmentId !== null || raw.expectedVersion !== 0) return fail();
    return { action: raw.action, orderId: uuid(raw.orderId), expectedPlanVersion: integer(raw.expectedPlanVersion, 0), assignmentId: null, expectedVersion: 0, data: planData(raw.data) };
  }
  if (raw.action === "update" || raw.action === "cancel") {
    exact(raw, [...baseKeys, "reason", ...(raw.action === "update" ? ["data"] : [])]);
    const base = { orderId: uuid(raw.orderId), expectedPlanVersion: integer(raw.expectedPlanVersion, 0), assignmentId: uuid(raw.assignmentId), expectedVersion: integer(raw.expectedVersion, 1), reason: text(raw.reason, 2000) };
    return raw.action === "update" ? { ...base, action: raw.action, data: planData(raw.data) } : { ...base, action: raw.action };
  }
  return fail();
}
export function parsePlanCommand(value: unknown): PlanCommand {
  const raw = exact(value, ["requestId", "intent", "previewHash"]);
  if (typeof raw.previewHash !== "string" || !/^[a-f0-9]{64}$/u.test(raw.previewHash)) return fail();
  return { requestId: uuid(raw.requestId), intent: parsePlanIntent(raw.intent), previewHash: raw.previewHash };
}
function parts(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return { n: BigInt(whole + fraction), scale: fraction.length };
}
const ceil = (a: bigint, b: bigint) => (a + b - BigInt(1)) / b;
/** Same approved ceil formulas, evaluated exactly on Server decimal quantities. */
export function derivePlanDuration(data: Pick<PlanData, "plannedQuantity" | "duration">) {
  const quantity = parts(planDecimal(data.plannedQuantity));
  if (data.duration.mode === "workdays") {
    const requiredWorkdays = integer(data.duration.workdays, 1, SCHEDULE_PLANNING_LIMITS.workdays);
    return { requiredWorkdays, dailyOutputSnapshot: ceil(quantity.n, BigInt(requiredWorkdays) * BigInt(10) ** BigInt(quantity.scale)).toString() };
  }
  const dailyOutputSnapshot = planDecimal(data.duration.dailyOutput, true), output = parts(dailyOutputSnapshot);
  const days = ceil(quantity.n * BigInt(10) ** BigInt(output.scale), output.n * BigInt(10) ** BigInt(quantity.scale));
  if (days > BigInt(SCHEDULE_PLANNING_LIMITS.workdays)) throw new HttpError(422, "production_schedule_duration_too_long", "Production schedule exceeds supported duration");
  return { requiredWorkdays: Math.max(1, Number(days)), dailyOutputSnapshot };
}

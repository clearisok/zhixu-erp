import { activeDeliveryPlans, getEffectiveQuantity, type SalesOrder } from "../../order-center/model/order.ts";
import type { OperationsSettingsState, ProductionCalendar } from "../../operations-settings/model/operations-settings.ts";
import { scheduleAssignmentIsActive, type DeliveryRiskProjection, type ExecutionMode, type OrderExecutionTracking, type OrderScheduleProjection, type ProductionSchedulingState, type ProductionStatus, type ScheduleAssignment, type ScheduleBatch, type TrackingField } from "../model/production-scheduling.ts";

export const DEFAULT_DELIVERY_WARNING_LEAD_DAYS = 7;
export type SchedulingActor = { id: string; name: string };
const id = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();
const nonNegative = (value: number, label: string) => { if (!Number.isFinite(value) || value < 0) throw new Error(`${label}不能小于 0`); return value; };
const positiveInteger = (value: number, label: string) => { if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}必须大于 0`); return Math.ceil(value); };
const sum = <T>(items: T[], select: (item: T) => number) => items.reduce((total, item) => total + select(item), 0);
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const dateText = (value: Date) => value.toISOString().slice(0, 10);
const plusDays = (value: string, days: number) => { const next = date(value); next.setUTCDate(next.getUTCDate() + days); return dateText(next); };

export function assignmentsForOrder(state: ProductionSchedulingState, salesOrderId: string) { return state.scheduleAssignments.filter((assignment) => assignment.salesOrderId === salesOrderId); }
export function activeAssignmentsForOrder(state: ProductionSchedulingState, salesOrderId: string) { return assignmentsForOrder(state, salesOrderId).filter(scheduleAssignmentIsActive); }
export function suggestInternalQueueTailStartDate(state: ProductionSchedulingState, productionGroupId: string, fallbackDate = new Date().toISOString().slice(0, 10)): string {
  const tail = state.scheduleAssignments.filter((item) => item.productionGroupId === productionGroupId && item.status !== "cancelled").sort((a, b) => (a.queueSequence ?? Number.MAX_SAFE_INTEGER) - (b.queueSequence ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt)).at(-1);
  return tail?.actualCompletedDate ?? tail?.plannedEndDate ?? fallbackDate;
}

export function deriveRequiredWorkdays(plannedQuantity: number, durationMode: ScheduleAssignment["durationMode"], averageDailyOutput: number | null, workdays: number | null): { requiredWorkdays: number; averageDailyOutputSnapshot: number | null } {
  nonNegative(plannedQuantity, "排单数量");
  if (durationMode === "average_daily_output") {
    if (!averageDailyOutput || averageDailyOutput <= 0) throw new Error("按日产量排期必须填写有效日产量");
    return { requiredWorkdays: Math.max(1, Math.ceil(plannedQuantity / averageDailyOutput)), averageDailyOutputSnapshot: averageDailyOutput };
  }
  const requiredWorkdays = positiveInteger(workdays ?? 0, "工作日");
  return { requiredWorkdays, averageDailyOutputSnapshot: plannedQuantity > 0 ? Math.ceil(plannedQuantity / requiredWorkdays) : 0 };
}

export type SchedulingCalendar = Pick<ProductionCalendar, "workingWeekdays"> & {
  exceptions: Pick<ProductionCalendar["exceptions"][number], "date" | "type">[];
};

export class ScheduleScanLimitError extends Error {
  constructor() { super("排期日期超出本次扫描范围，请缩小排期范围"); this.name = "ScheduleScanLimitError"; }
}

export function isCalendarWorkingDate(calendar: SchedulingCalendar, value: string): boolean {
  const exception = calendar.exceptions.find((item) => item.date === value);
  if (exception) return exception.type === "working";
  return calendar.workingWeekdays.includes(date(value).getUTCDay());
}

export function calculateScheduleDates(input: { startDate: string; requiredWorkdays: number; calendar: SchedulingCalendar; handoffStart?: boolean; scanLimit?: number }) {
  const required = positiveInteger(input.requiredWorkdays, "工作日");
  if (input.scanLimit !== undefined && (!Number.isSafeInteger(input.scanLimit) || input.scanLimit < 1)) throw new ScheduleScanLimitError();
  let cursor = input.startDate;
  let remaining = required;
  let nonWorkingDayCount = 0;
  let firstProductionDate: string | null = null;
  let scanned = 0;
  if (input.handoffStart) cursor = plusDays(cursor, 1);
  while (remaining > 0) {
    // Server callers supply a whole-preview budget. Existing Browser calls keep
    // their original calculation and do not acquire a new persistence path.
    if (input.scanLimit !== undefined && (scanned >= input.scanLimit || !/^\d{4}-\d{2}-\d{2}$/u.test(cursor))) throw new ScheduleScanLimitError();
    scanned += 1;
    if (isCalendarWorkingDate(input.calendar, cursor)) { firstProductionDate ??= cursor; remaining -= 1; }
    else nonWorkingDayCount += 1;
    if (remaining > 0) cursor = plusDays(cursor, 1);
  }
  return { plannedStartDate: input.startDate, firstProductionDate: firstProductionDate ?? input.startDate, plannedEndDate: cursor, nonWorkingDayCount };
}

function calendarForAssignment(assignment: ScheduleAssignment, settings: OperationsSettingsState): ProductionCalendar | null {
  if (assignment.executionType !== "internal") return null;
  const group = settings.productionGroups.find((item) => item.id === assignment.productionGroupId);
  const site = settings.productionSites.find((item) => item.id === group?.productionSiteId);
  return settings.productionCalendars.find((item) => item.id === site?.productionCalendarId) ?? null;
}

function assertEnabledExecutor(input: Pick<ScheduleAssignment, "executionType" | "productionGroupId" | "outsourceFactoryId">, settings: OperationsSettingsState) {
  if (input.executionType === "internal") {
    if (!input.productionGroupId || input.outsourceFactoryId) throw new Error("内部排单必须且只能选择生产组");
    if (!settings.productionGroups.some((item) => item.id === input.productionGroupId && item.enabled)) throw new Error("请选择已启用的生产组");
  } else {
    if (!input.outsourceFactoryId || input.productionGroupId) throw new Error("外发排单必须且只能选择外发厂");
    if (!settings.outsourceFactories.some((item) => item.id === input.outsourceFactoryId && item.enabled)) throw new Error("请选择已启用的外发厂");
  }
}

export function createScheduleAssignment(state: ProductionSchedulingState, input: {
  salesOrderId: string; executionType: ScheduleAssignment["executionType"]; productionGroupId?: string | null; outsourceFactoryId?: string | null;
  colorLineId?: string | null; colorNameSnapshot?: string | null; outsourceUnitPrice?: number | null;
  plannedQuantity: number; durationMode?: ScheduleAssignment["durationMode"]; averageDailyOutput?: number | null; requiredWorkdays?: number | null;
  plannedStartDate?: string | null; plannedEndDate?: string | null; dateMode?: ScheduleAssignment["dateMode"]; remark?: string; actor: SchedulingActor; settings: OperationsSettingsState; timestamp?: string;
}): { state: ProductionSchedulingState; assignment: ScheduleAssignment } {
  const timestamp = input.timestamp ?? now(); const durationMode = input.durationMode ?? "workdays";
  const duration = deriveRequiredWorkdays(input.plannedQuantity, durationMode, input.averageDailyOutput ?? null, input.requiredWorkdays ?? 1);
  const executionType = input.executionType;
  const groupAssignments = executionType === "internal" ? state.scheduleAssignments.filter((item) => item.productionGroupId === input.productionGroupId && item.status !== "cancelled") : [];
  const assignment: ScheduleAssignment = {
    id: id("schedule"), salesOrderId: input.salesOrderId, executionType,
    productionGroupId: executionType === "internal" ? input.productionGroupId ?? null : null, outsourceFactoryId: executionType === "outsource" ? input.outsourceFactoryId ?? null : null,
    colorLineId: input.colorLineId ?? null, colorNameSnapshot: input.colorNameSnapshot?.trim() || null, outsourceUnitPrice: executionType === "outsource" ? input.outsourceUnitPrice ?? null : null,
    queueSequence: executionType === "internal" ? Math.max(0, ...groupAssignments.map((item) => item.queueSequence ?? 0)) + 1 : null,
    plannedQuantity: nonNegative(input.plannedQuantity, "排单数量"), durationMode, averageDailyOutputSnapshot: duration.averageDailyOutputSnapshot, requiredWorkdays: duration.requiredWorkdays,
    plannedStartDate: input.plannedStartDate ?? null, plannedEndDate: input.plannedEndDate ?? null, nonWorkingDayCount: 0, completedQuantity: 0, actualStartDate: null, actualCompletedDate: null,
    dateMode: input.dateMode ?? (executionType === "internal" ? "auto_queue" : "manual_fixed"), status: "planned", remark: input.remark?.trim() ?? "", createdAt: timestamp, updatedAt: timestamp, createdBy: input.actor.name, updatedBy: input.actor.name,
  };
  assertEnabledExecutor(assignment, input.settings);
  const calendar = calendarForAssignment(assignment, input.settings);
  if (assignment.dateMode === "auto_queue" && assignment.plannedStartDate && calendar) Object.assign(assignment, calculateScheduleDates({ startDate: assignment.plannedStartDate, requiredWorkdays: assignment.requiredWorkdays, calendar }));
  if (assignment.plannedStartDate && assignment.plannedEndDate && assignment.plannedStartDate > assignment.plannedEndDate) throw new Error("排单开始日期不能晚于结束日期");
  return { state: { ...state, scheduleAssignments: [...state.scheduleAssignments, assignment] }, assignment };
}

export function updateScheduleAssignment(state: ProductionSchedulingState, assignmentId: string, patch: Partial<Pick<ScheduleAssignment, "executionType" | "productionGroupId" | "outsourceFactoryId" | "colorLineId" | "colorNameSnapshot" | "outsourceUnitPrice" | "queueSequence" | "plannedQuantity" | "durationMode" | "averageDailyOutputSnapshot" | "requiredWorkdays" | "plannedStartDate" | "plannedEndDate" | "nonWorkingDayCount" | "completedQuantity" | "actualStartDate" | "actualCompletedDate" | "dateMode" | "status" | "remark">>, input: { actor: SchedulingActor; settings: OperationsSettingsState; reason?: string; timestamp?: string }) {
  const before = state.scheduleAssignments.find((item) => item.id === assignmentId); if (!before) throw new Error("排单不存在");
  const started = before.status === "in_progress" || before.status === "completed" || before.completedQuantity > 0 || Boolean(before.actualStartDate);
  const executorChanged = (patch.executionType !== undefined && patch.executionType !== before.executionType) || (patch.productionGroupId !== undefined && patch.productionGroupId !== before.productionGroupId) || (patch.outsourceFactoryId !== undefined && patch.outsourceFactoryId !== before.outsourceFactoryId);
  if (started && (executorChanged || patch.status === "cancelled") && !input.reason?.trim()) throw new Error("已开工排单更换执行方或取消时必须填写原因");
  if (patch.completedQuantity !== undefined && patch.completedQuantity < before.completedQuantity && !input.reason?.trim()) throw new Error("减少完成数量时必须填写原因");
  const executionType = patch.executionType ?? before.executionType;
  const plannedQuantity = patch.plannedQuantity === undefined ? before.plannedQuantity : nonNegative(patch.plannedQuantity, "排单数量");
  const durationMode = patch.durationMode ?? before.durationMode;
  const duration = deriveRequiredWorkdays(
    plannedQuantity,
    durationMode,
    patch.averageDailyOutputSnapshot === undefined ? before.averageDailyOutputSnapshot : patch.averageDailyOutputSnapshot,
    patch.requiredWorkdays === undefined ? before.requiredWorkdays : patch.requiredWorkdays,
  );
  const assignment: ScheduleAssignment = { ...before, ...patch, executionType, productionGroupId: executionType === "internal" ? (patch.productionGroupId === undefined ? before.productionGroupId : patch.productionGroupId) : null, outsourceFactoryId: executionType === "outsource" ? (patch.outsourceFactoryId === undefined ? before.outsourceFactoryId : patch.outsourceFactoryId) : null, colorNameSnapshot: patch.colorNameSnapshot === undefined ? before.colorNameSnapshot : patch.colorNameSnapshot?.trim() || null, outsourceUnitPrice: executionType === "outsource" ? (patch.outsourceUnitPrice === undefined ? before.outsourceUnitPrice : patch.outsourceUnitPrice) : null, plannedQuantity, durationMode, averageDailyOutputSnapshot: duration.averageDailyOutputSnapshot, completedQuantity: patch.completedQuantity === undefined ? before.completedQuantity : nonNegative(patch.completedQuantity, "完成数量"), requiredWorkdays: duration.requiredWorkdays, remark: patch.remark === undefined ? before.remark : patch.remark.trim(), updatedAt: input.timestamp ?? now(), updatedBy: input.actor.name };
  if (assignment.outsourceUnitPrice !== null) nonNegative(assignment.outsourceUnitPrice, "外发单价");
  if (assignment.status === "in_progress" && !assignment.actualStartDate) assignment.actualStartDate = (input.timestamp ?? now()).slice(0, 10);
  if (executorChanged) assertEnabledExecutor(assignment, input.settings);
  const calendar = calendarForAssignment(assignment, input.settings);
  if (assignment.dateMode === "auto_queue" && assignment.plannedStartDate && calendar) Object.assign(assignment, calculateScheduleDates({ startDate: assignment.plannedStartDate, requiredWorkdays: assignment.requiredWorkdays, calendar }));
  if (assignment.plannedStartDate && assignment.plannedEndDate && assignment.plannedStartDate > assignment.plannedEndDate) throw new Error("排单开始日期不能晚于结束日期");
  return { before, assignment, state: { ...state, scheduleAssignments: state.scheduleAssignments.map((item) => item.id === assignmentId ? assignment : item) } };
}

export function projectOrderColorSchedule(order: SalesOrder, state: ProductionSchedulingState) {
  const assignments = activeAssignmentsForOrder(state, order.id);
  return order.orderColorLines.map((line) => {
    const assignedQuantity = assignments.filter((assignment) => assignment.colorLineId === line.id).reduce((sum, assignment) => sum + assignment.plannedQuantity, 0);
    const completedQuantity = assignments.filter((assignment) => assignment.colorLineId === line.id).reduce((sum, assignment) => sum + assignment.completedQuantity, 0);
    return { line, assignedQuantity, completedQuantity, remainingQuantity: Math.max(line.quantity - assignedQuantity, 0), overAssignedQuantity: Math.max(assignedQuantity - line.quantity, 0) };
  });
}

export function createScheduleBatch(state: ProductionSchedulingState, input: { name: string; assignmentIds: string[]; actor: SchedulingActor; remark?: string; timestamp?: string }): { state: ProductionSchedulingState; batch: ScheduleBatch } {
  const assignments = input.assignmentIds.map((assignmentId) => state.scheduleAssignments.find((item) => item.id === assignmentId)).filter((item): item is ScheduleAssignment => Boolean(item));
  if (assignments.length !== input.assignmentIds.length || assignments.length < 2) throw new Error("合并排单至少需要两条有效排单");
  if (new Set(assignments.map((item) => item.salesOrderId)).size < 2) throw new Error("合并排单必须包含至少两张销售合同订单");
  const createdAt = input.timestamp ?? now();
  const batch: ScheduleBatch = { id: id("schedule-batch"), name: input.name.trim() || `合并排单 ${createdAt.slice(0, 10)}`, allocations: assignments.map((item) => ({ salesOrderId: item.salesOrderId, scheduleAssignmentId: item.id, assignedQuantity: item.plannedQuantity })), remark: input.remark?.trim() ?? "", createdAt, updatedAt: createdAt, createdBy: input.actor.name, updatedBy: input.actor.name };
  return { batch, state: { ...state, scheduleBatches: [...state.scheduleBatches, batch] } };
}

export type QueueDateChange = { assignmentId: string; beforeStartDate: string | null; beforeEndDate: string | null; afterStartDate: string | null; afterEndDate: string | null };
export function recalculateInternalQueue(state: ProductionSchedulingState, productionGroupId: string, settings: OperationsSettingsState, anchorDate?: string): { state: ProductionSchedulingState; changes: QueueDateChange[] } {
  const group = settings.productionGroups.find((item) => item.id === productionGroupId); const site = settings.productionSites.find((item) => item.id === group?.productionSiteId); const calendar = settings.productionCalendars.find((item) => item.id === site?.productionCalendarId);
  if (!group || !calendar) throw new Error("生产组缺少有效生产地点或生产日历");
  const queue = state.scheduleAssignments.filter((item) => item.productionGroupId === productionGroupId && item.status !== "cancelled").sort((a, b) => (a.queueSequence ?? Number.MAX_SAFE_INTEGER) - (b.queueSequence ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt));
  let previousEnd: string | null = null; const changes: QueueDateChange[] = [];
  const nextAssignments = state.scheduleAssignments.map((assignment) => {
    if (!queue.some((item) => item.id === assignment.id)) return assignment;
    if (assignment.dateMode !== "auto_queue" || assignment.status !== "planned" || assignment.actualStartDate) { previousEnd = assignment.actualCompletedDate ?? assignment.plannedEndDate ?? previousEnd; return assignment; }
    const startDate = previousEnd ?? assignment.plannedStartDate ?? anchorDate ?? new Date().toISOString().slice(0, 10);
    const calculated = calculateScheduleDates({ startDate, requiredWorkdays: assignment.requiredWorkdays, calendar, handoffStart: Boolean(previousEnd) });
    const next = { ...assignment, ...calculated };
    previousEnd = next.plannedEndDate;
    if (next.plannedStartDate !== assignment.plannedStartDate || next.plannedEndDate !== assignment.plannedEndDate) changes.push({ assignmentId: assignment.id, beforeStartDate: assignment.plannedStartDate, beforeEndDate: assignment.plannedEndDate, afterStartDate: next.plannedStartDate, afterEndDate: next.plannedEndDate });
    return next;
  });
  return { state: { ...state, scheduleAssignments: nextAssignments }, changes };
}

export function completeAssignmentWithQueuePreview(state: ProductionSchedulingState, assignmentId: string, completedQuantity: number, actualCompletedDate: string, settings: OperationsSettingsState, actor: SchedulingActor, applyQueue: boolean) {
  const result = updateScheduleAssignment(state, assignmentId, { completedQuantity, actualCompletedDate, status: "completed" }, { actor, settings });
  const groupId = result.assignment.productionGroupId; if (!applyQueue || !groupId) return { ...result, queueChanges: [] as QueueDateChange[] };
  const queue = recalculateInternalQueue(result.state, groupId, settings, actualCompletedDate);
  return { ...result, state: queue.state, queueChanges: queue.changes };
}

export function markScheduleAssignmentCompleted(state: ProductionSchedulingState, assignmentId: string, actor: SchedulingActor, settings: OperationsSettingsState, timestamp = now()) { const before = state.scheduleAssignments.find((item) => item.id === assignmentId); if (!before) throw new Error("排单不存在"); return completeAssignmentWithQueuePreview(state, assignmentId, before.plannedQuantity, timestamp.slice(0, 10), settings, actor, false); }

export function getExecutionMode(assignments: ScheduleAssignment[]): ExecutionMode { const types = new Set(assignments.filter(scheduleAssignmentIsActive).map((item) => item.executionType)); return !types.size ? "unscheduled" : types.size > 1 ? "mixed" : types.has("internal") ? "internal" : "outsource"; }
export function getProductionStatus(effectiveQuantity: number, assignments: ScheduleAssignment[]): ProductionStatus { const active = assignments.filter(scheduleAssignmentIsActive); if (!active.length) return "unscheduled"; const scheduled = sum(active, (item) => item.plannedQuantity); const completed = sum(active, (item) => item.completedQuantity); if (effectiveQuantity > 0 && completed >= effectiveQuantity) return "completed"; if (completed > 0) return "partially_completed"; if (active.some((item) => item.status === "in_progress" || item.actualStartDate)) return "in_production"; return scheduled < effectiveQuantity ? "partially_scheduled" : "scheduled_pending"; }
const daysBetween = (from: string, to: string) => Math.ceil((date(to).getTime() - date(from).getTime()) / 86400000);
export function projectDeliveryRisk(order: SalesOrder, assignments: ScheduleAssignment[], options: { today?: string; leadDays?: number } = {}): DeliveryRiskProjection { const deliveries = activeDeliveryPlans(order).slice().sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)); if (!deliveries.length) return { level: "none", nearestDeliveryDate: null, withinWarningWindow: false, checkpoints: [], messages: [] }; const active = assignments.filter(scheduleAssignmentIsActive); let cumulativeDemand = 0; const checkpoints = deliveries.map((delivery) => { cumulativeDemand += delivery.quantity; const cumulativeExpectedSupply = active.reduce((total, assignment) => total + assignment.completedQuantity + (assignment.plannedEndDate && assignment.plannedEndDate <= delivery.deliveryDate ? Math.max(assignment.plannedQuantity - assignment.completedQuantity, 0) : 0), 0); const gap = Math.max(cumulativeDemand - cumulativeExpectedSupply, 0); const late = active.some((assignment) => assignment.plannedEndDate && assignment.plannedEndDate > delivery.deliveryDate && assignment.completedQuantity < assignment.plannedQuantity); return { deliveryPlanId: delivery.id, deliveryDate: delivery.deliveryDate, deliveryQuantity: delivery.quantity, cumulativeDemand, cumulativeExpectedSupply, gap, riskType: gap === 0 ? "none" as const : active.length === 0 ? "unscheduled" as const : late ? "delay" as const : "shortfall" as const }; }); const risky = checkpoints.filter((item) => item.riskType !== "none"); const nearestDeliveryDate = deliveries[0]?.deliveryDate ?? null; const withinWarningWindow = Boolean(nearestDeliveryDate && daysBetween(options.today ?? new Date().toISOString().slice(0, 10), nearestDeliveryDate) <= (options.leadDays ?? DEFAULT_DELIVERY_WARNING_LEAD_DAYS)); return { level: risky.length ? withinWarningWindow ? "risk" : "attention" : "none", nearestDeliveryDate, withinWarningWindow, checkpoints, messages: risky.map((item) => `${item.deliveryDate} 累计缺口 ${item.gap.toLocaleString("zh-CN")} 件（${item.riskType === "unscheduled" ? "尚未排单" : item.riskType === "delay" ? "计划晚于交期" : "排产不足"}）`) }; }
export function projectOrderSchedule(order: SalesOrder, state: ProductionSchedulingState, options: { today?: string; leadDays?: number } = {}): OrderScheduleProjection { const assignments = activeAssignmentsForOrder(state, order.id); const effectiveOrderQuantity = getEffectiveQuantity(order); const scheduledQuantity = sum(assignments, (item) => item.plannedQuantity); const completedQuantity = sum(assignments, (item) => item.completedQuantity); const warnings: string[] = []; if (scheduledQuantity > effectiveOrderQuantity) warnings.push(`超额排单 ${scheduledQuantity - effectiveOrderQuantity} 件`); if (completedQuantity > scheduledQuantity) warnings.push(`完成数量超出排单 ${completedQuantity - scheduledQuantity} 件`); return { effectiveOrderQuantity, scheduledQuantity, unscheduledQuantity: Math.max(effectiveOrderQuantity - scheduledQuantity, 0), internalScheduledQuantity: sum(assignments.filter((item) => item.executionType === "internal"), (item) => item.plannedQuantity), outsourceScheduledQuantity: sum(assignments.filter((item) => item.executionType === "outsource"), (item) => item.plannedQuantity), completedQuantity, remainingQuantity: Math.max(effectiveOrderQuantity - completedQuantity, 0), warnings, executionMode: getExecutionMode(assignments), productionStatus: getProductionStatus(effectiveOrderQuantity, assignments), deliveryRisk: projectDeliveryRisk(order, assignments, options) }; }

export type ProductionGroupOverviewItem = {
  group: OperationsSettingsState["productionGroups"][number];
  assignments: ScheduleAssignment[];
  current: ScheduleAssignment | null;
  pendingCount: number;
  tailDate: string | null;
  anomalyCount: number;
};

export function buildProductionGroupOverview(orders: SalesOrder[], state: ProductionSchedulingState, settings: OperationsSettingsState): ProductionGroupOverviewItem[] {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const projections = new Map(orders.map((order) => [order.id, projectOrderSchedule(order, state)]));
  const activeInternal = state.scheduleAssignments.filter((item) => scheduleAssignmentIsActive(item) && item.executionType === "internal");
  return settings.productionGroups.filter((group) => group.enabled).map((group) => {
    const assignments = activeInternal.filter((item) => item.productionGroupId === group.id).sort((a, b) => (a.queueSequence ?? 9999) - (b.queueSequence ?? 9999));
    const current = assignments.find((item) => item.status === "in_progress") ?? assignments.find((item) => item.status !== "completed") ?? null;
    return {
      group,
      assignments,
      current,
      pendingCount: assignments.filter((item) => item.status === "planned").length,
      tailDate: assignments.map((item) => item.plannedEndDate).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
      anomalyCount: assignments.filter((item) => { const order = orderById.get(item.salesOrderId); const projection = projections.get(item.salesOrderId); return Boolean(order && projection && (projection.warnings.length || projection.deliveryRisk.level === "risk")); }).length,
    };
  });
}

const emptyTrackingField = (): TrackingField => ({ status: "not_started", remark: "" });
export function getMaterialReadyDate(tracking: Pick<OrderExecutionTracking, "fabricSupplyHubArrivalDate" | "trimSupplyHubArrivalDate">): string | null { return tracking.fabricSupplyHubArrivalDate && tracking.trimSupplyHubArrivalDate ? [tracking.fabricSupplyHubArrivalDate, tracking.trimSupplyHubArrivalDate].sort().at(-1) ?? null : null; }
export function upsertOrderExecutionTracking(state: ProductionSchedulingState, input: { salesOrderId: string; patch: Partial<Omit<OrderExecutionTracking, "id" | "salesOrderId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">>; actor: SchedulingActor; timestamp?: string }) { const timestamp = input.timestamp ?? now(); const before = state.orderExecutionTrackings.find((item) => item.salesOrderId === input.salesOrderId) ?? null; const tracking: OrderExecutionTracking = { id: before?.id ?? id("order-tracking"), salesOrderId: input.salesOrderId, fabricReadiness: input.patch.fabricReadiness ?? before?.fabricReadiness ?? emptyTrackingField(), trimReadiness: input.patch.trimReadiness ?? before?.trimReadiness ?? emptyTrackingField(), sampleProgress: input.patch.sampleProgress ?? before?.sampleProgress ?? emptyTrackingField(), printingEmbroideryProgress: input.patch.printingEmbroideryProgress ?? before?.printingEmbroideryProgress ?? emptyTrackingField(), shortOverStatus: input.patch.shortOverStatus ?? before?.shortOverStatus ?? emptyTrackingField(), supplyHubId: input.patch.supplyHubId ?? before?.supplyHubId ?? null, fabricSupplyHubArrivalDate: input.patch.fabricSupplyHubArrivalDate ?? before?.fabricSupplyHubArrivalDate ?? null, trimSupplyHubArrivalDate: input.patch.trimSupplyHubArrivalDate ?? before?.trimSupplyHubArrivalDate ?? null, remark: input.patch.remark ?? before?.remark ?? "", createdAt: before?.createdAt ?? timestamp, updatedAt: timestamp, createdBy: before?.createdBy ?? input.actor.name, updatedBy: input.actor.name }; return { before, tracking, state: { ...state, orderExecutionTrackings: before ? state.orderExecutionTrackings.map((item) => item.id === before.id ? tracking : item) : [...state.orderExecutionTrackings, tracking] } }; }

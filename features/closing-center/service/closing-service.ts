import { calculateFactorySettlementUnitPrice, getCurrentPriceVersion, getEffectiveQuantity, type SalesOrder } from "../../order-center/model/order.ts";
import type { OperationsSettingsState } from "../../operations-settings/model/operations-settings.ts";
import type { ProductionSchedulingState, ScheduleAssignment } from "../../production-scheduling/model/production-scheduling.ts";
import { assignmentsForOrder } from "../../production-scheduling/service/production-scheduling-service.ts";
import { activeClosingAllocations, type ClosingAllocation, type ClosingPeriod, type ClosingState, type ClosingStatusProjection, type ScheduleBasisSnapshot } from "../model/closing.ts";

export type ClosingActor = { id: string; name: string };
export type ClosingWarning = { code: "order-over" | "assignment-over" | "completed-over" | "pending" | "schedule-stale" | "price-diff"; message: string };
export type AllocationOutput = { originalAmount: number; originalCurrency: "CNY" | "USD"; processingOutputRmb: number; customerProcessingOutput: number; factoryPayableAmount: number; salesOutputWan: number | null };
export type ClosingSummary = { quantity: number; processingOutputRmb: number; customerProcessingOutput: number; factoryPayableAmount: number; internalProcessingOutputRmb: number; outsourceProcessingOutputRmb: number; pendingProcessingOutputRmb: number; salesOutputWan: number; originalByCurrency: Record<"CNY" | "USD", number> };
export type MonthlyTargetMetric = { target: number | null; actual: number; difference: number | null; completionRate: number | null };
export type MonthlyTargetBalance = { total: MonthlyTargetMetric; internal: MonthlyTargetMetric; outsourceActual: number; pendingActual: number };

const uid = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const timestamp = () => new Date().toISOString();
const assertEditable = (period: ClosingPeriod) => { if (period.status === "locked") throw new Error("该关账月份已锁定，不能修改"); };
const actorFields = (actor: ClosingActor) => ({ updatedBy: actor.id, updatedByName: actor.name });
const executorName = (assignment: ScheduleAssignment, settings: OperationsSettingsState) => assignment.executionType === "internal"
  ? settings.productionGroups.find((item) => item.id === assignment.productionGroupId)?.name ?? "历史生产组"
  : settings.outsourceFactories.find((item) => item.id === assignment.outsourceFactoryId)?.name ?? "历史外发厂";

export function scheduleBasis(assignment: ScheduleAssignment, settings: OperationsSettingsState): ScheduleBasisSnapshot {
  const name = executorName(assignment, settings);
  return { scheduleAssignmentId: assignment.id, assignmentUpdatedAt: assignment.updatedAt, executionType: assignment.executionType, productionGroupId: assignment.productionGroupId, productionGroupName: assignment.executionType === "internal" ? name : null, outsourceFactoryId: assignment.outsourceFactoryId, outsourceFactoryName: assignment.executionType === "outsource" ? name : null, plannedQuantity: assignment.plannedQuantity };
}

export function createClosingPeriod(state: ClosingState, input: { month: string; taxRateSnapshot: number; remark?: string; actor: ClosingActor; now?: string }) {
  if (state.periods.some((item) => item.month === input.month)) throw new Error(`${input.month} 已存在关账月份`);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error("关账月份格式无效");
  if (!Number.isFinite(input.taxRateSnapshot) || input.taxRateSnapshot < 0) throw new Error("关账税率不能小于 0");
  const now = input.now ?? timestamp();
  const period: ClosingPeriod = { id: uid("closing-period"), month: input.month, status: "open", taxRateSnapshot: input.taxRateSnapshot, remark: input.remark?.trim() ?? "", confirmedAt: null, confirmedBy: null, confirmedByName: null, lockedAt: null, lockedBy: null, lockedByName: null, reopenedAt: null, reopenedBy: null, reopenedByName: null, reopenReason: null, createdAt: now, updatedAt: now, createdBy: input.actor.id, createdByName: input.actor.name, updatedBy: input.actor.id, updatedByName: input.actor.name };
  return { period, state: { ...state, periods: [...state.periods, period] } };
}

export function createAllocationDraft(input: { period: ClosingPeriod; order: SalesOrder; assignment?: ScheduleAssignment | null; settings: OperationsSettingsState; quantity?: number; actor: ClosingActor; now?: string }): ClosingAllocation {
  assertEditable(input.period);
  const price = getCurrentPriceVersion(input.order);
  const assignment = input.assignment ?? null;
  const basis = assignment ? scheduleBasis(assignment, input.settings) : null;
  const now = input.now ?? timestamp();
  const customerProcessingUnitPriceSnapshot = price.processingUnitPrice ?? 0;
  const factorySettlementUnitPriceSnapshot = calculateFactorySettlementUnitPrice(input.order) ?? customerProcessingUnitPriceSnapshot;
  const currencySnapshot = input.settings.defaultProcessingCurrency ?? price.processingCurrency;
  return { id: uid("closing-allocation"), closingPeriodId: input.period.id, salesOrderId: input.order.id, scheduleAssignmentId: assignment?.id ?? null, quantity: input.quantity ?? assignment?.plannedQuantity ?? getEffectiveQuantity(input.order), orderTypeSnapshot: input.order.orderType, salePriceSnapshot: price.salePrice, closingProcessingUnitPrice: customerProcessingUnitPriceSnapshot, processingCurrencySnapshot: currencySnapshot, fxRateSnapshot: null, currencySnapshot, legacyFxRateApplied: false, salesContractNoSnapshot: input.order.salesContractNo, customerProcessingUnitPriceSnapshot, purchasedTrimUnitCostSnapshot: input.order.purchasedTrimUnitCostSnapshot, factorySettlementUnitPriceSnapshot, taxRateSnapshot: input.period.taxRateSnapshot, executionTypeSnapshot: assignment?.executionType ?? null, productionGroupIdSnapshot: basis?.productionGroupId ?? null, productionGroupNameSnapshot: basis?.productionGroupName ?? null, outsourceFactoryIdSnapshot: basis?.outsourceFactoryId ?? null, outsourceFactoryNameSnapshot: basis?.outsourceFactoryName ?? null, scheduleBasisSnapshot: basis, staleAcknowledgedFingerprint: null, staleAcknowledgedAt: null, staleAcknowledgedBy: null, staleAcknowledgedByName: null, staleAcknowledgedReason: null, remark: "", status: "active", voidedAt: null, voidedBy: null, voidedByName: null, voidReason: null, createdAt: now, updatedAt: now, createdBy: input.actor.id, createdByName: input.actor.name, updatedBy: input.actor.id, updatedByName: input.actor.name };
}

export function saveClosingAllocation(state: ClosingState, allocation: ClosingAllocation, actor: ClosingActor, now = timestamp()) {
  const period = state.periods.find((item) => item.id === allocation.closingPeriodId);
  if (!period) throw new Error("关账月份不存在");
  assertEditable(period);
  const existing = state.allocations.find((item) => item.id === allocation.id);
  const existingPeriod = existing ? state.periods.find((item) => item.id === existing.closingPeriodId) : null;
  if (existingPeriod?.status === "locked") throw new Error("原关账月份已锁定，不能移动或修改归属");
  const next = { ...allocation, remark: allocation.remark.trim(), updatedAt: now, ...actorFields(actor), createdAt: existing?.createdAt ?? allocation.createdAt ?? now, createdBy: existing?.createdBy ?? allocation.createdBy ?? actor.id, createdByName: existing?.createdByName ?? allocation.createdByName ?? actor.name };
  return { before: existing ?? null, allocation: next, state: { ...state, allocations: existing ? state.allocations.map((item) => item.id === next.id ? next : item) : [...state.allocations, next] } };
}

export function voidClosingAllocation(state: ClosingState, allocationId: string, actor: ClosingActor, reason: string, now = timestamp()) {
  const before = state.allocations.find((item) => item.id === allocationId);
  if (!before) throw new Error("关账归属不存在");
  const period = state.periods.find((item) => item.id === before.closingPeriodId);
  if (!period) throw new Error("关账月份不存在");
  assertEditable(period);
  if (!reason.trim()) throw new Error("作废关账归属必须填写原因");
  const allocation = { ...before, status: "voided" as const, voidedAt: now, voidedBy: actor.id, voidedByName: actor.name, voidReason: reason.trim(), updatedAt: now, ...actorFields(actor) };
  return { before, allocation, state: { ...state, allocations: state.allocations.map((item) => item.id === allocationId ? allocation : item) } };
}

export function allocationOutput(allocation: ClosingAllocation): AllocationOutput {
  const originalAmount = allocation.quantity * allocation.customerProcessingUnitPriceSnapshot;
  const customerProcessingOutput = originalAmount;
  const factoryPayableAmount = allocation.quantity * allocation.factorySettlementUnitPriceSnapshot;
  const processingOutputRmb = allocation.legacyFxRateApplied && allocation.processingCurrencySnapshot === "USD" ? originalAmount * (allocation.fxRateSnapshot ?? 0) : originalAmount;
  const salesOutputWan = allocation.orderTypeSnapshot === "distribution" && allocation.salePriceSnapshot !== null ? allocation.quantity * allocation.salePriceSnapshot / (1 + allocation.taxRateSnapshot / 100) / 10000 : null;
  return { originalAmount, originalCurrency: allocation.currencySnapshot, processingOutputRmb, customerProcessingOutput, factoryPayableAmount, salesOutputWan };
}

export function summarizeClosing(allocations: ClosingAllocation[]): ClosingSummary {
  const active = allocations.filter((item) => item.status !== "voided" && item.voidedAt === null);
  return active.reduce<ClosingSummary>((result, item) => { const output = allocationOutput(item); result.quantity += item.quantity; result.processingOutputRmb += output.processingOutputRmb; result.customerProcessingOutput += output.customerProcessingOutput; result.factoryPayableAmount += output.factoryPayableAmount; result.salesOutputWan += output.salesOutputWan ?? 0; result.originalByCurrency[output.originalCurrency] += output.originalAmount; if (item.executionTypeSnapshot === "internal") result.internalProcessingOutputRmb += output.processingOutputRmb; else if (item.executionTypeSnapshot === "outsource") result.outsourceProcessingOutputRmb += output.processingOutputRmb; else result.pendingProcessingOutputRmb += output.processingOutputRmb; return result; }, { quantity: 0, processingOutputRmb: 0, customerProcessingOutput: 0, factoryPayableAmount: 0, internalProcessingOutputRmb: 0, outsourceProcessingOutputRmb: 0, pendingProcessingOutputRmb: 0, salesOutputWan: 0, originalByCurrency: { CNY: 0, USD: 0 } });
}

function targetMetric(actual: number, target: number | null): MonthlyTargetMetric {
  return { target, actual, difference: target === null ? null : actual - target, completionRate: target === null ? null : target === 0 ? 0 : actual / target * 100 };
}

export function projectMonthlyTargetBalance(summary: ClosingSummary, target: { totalProcessingOutputTargetRmb: number | null; internalProcessingOutputTargetRmb: number | null } | null | undefined): MonthlyTargetBalance {
  return {
    total: targetMetric(summary.processingOutputRmb, target?.totalProcessingOutputTargetRmb ?? null),
    internal: targetMetric(summary.internalProcessingOutputRmb, target?.internalProcessingOutputTargetRmb ?? null),
    outsourceActual: summary.outsourceProcessingOutputRmb,
    pendingActual: summary.pendingProcessingOutputRmb,
  };
}

export function projectOrderClosing(order: SalesOrder, state: ClosingState) {
  const allocations = activeClosingAllocations(state).filter((item) => item.salesOrderId === order.id);
  const allocatedQuantity = allocations.reduce((sum, item) => sum + item.quantity, 0);
  const effectiveQuantity = getEffectiveQuantity(order);
  const difference = effectiveQuantity - allocatedQuantity;
  const status: ClosingStatusProjection = allocatedQuantity === 0 ? "unclosed" : difference < 0 ? "over_allocated" : difference === 0 ? "closed" : "partially_closed";
  return { effectiveQuantity, allocatedQuantity, unallocatedQuantity: Math.max(difference, 0), overAllocatedQuantity: Math.max(-difference, 0), status, summary: summarizeClosing(allocations), allocations };
}

export function scheduleFingerprint(basis: ScheduleBasisSnapshot | null) { return basis ? JSON.stringify([basis.executionType, basis.productionGroupId, basis.outsourceFactoryId, basis.plannedQuantity]) : "missing"; }
export function currentScheduleDifference(allocation: ClosingAllocation, scheduling: ProductionSchedulingState, settings: OperationsSettingsState) {
  if (!allocation.scheduleAssignmentId || !allocation.scheduleBasisSnapshot) return null;
  const current = scheduling.scheduleAssignments.find((item) => item.id === allocation.scheduleAssignmentId && item.status !== "cancelled");
  const currentBasis = current ? scheduleBasis(current, settings) : null;
  const changed = !currentBasis || currentBasis.executionType !== allocation.scheduleBasisSnapshot.executionType || currentBasis.productionGroupId !== allocation.scheduleBasisSnapshot.productionGroupId || currentBasis.outsourceFactoryId !== allocation.scheduleBasisSnapshot.outsourceFactoryId || currentBasis.plannedQuantity !== allocation.scheduleBasisSnapshot.plannedQuantity;
  if (!changed) return null;
  const fingerprint = scheduleFingerprint(currentBasis);
  return { current, currentBasis, fingerprint, acknowledged: allocation.staleAcknowledgedFingerprint === fingerprint };
}

export function allocationWarnings(allocation: ClosingAllocation, order: SalesOrder, state: ClosingState, scheduling: ProductionSchedulingState, settings: OperationsSettingsState): ClosingWarning[] {
  const warnings: ClosingWarning[] = [];
  const orderProjection = projectOrderClosing(order, state);
  if (orderProjection.allocatedQuantity > orderProjection.effectiveQuantity) warnings.push({ code: "order-over", message: `订单超额关账 ${orderProjection.overAllocatedQuantity} 件` });
  if (!allocation.scheduleAssignmentId) warnings.push({ code: "pending", message: "该归属尚未关联排单，计入待分配产值" });
  const assignment = allocation.scheduleAssignmentId ? scheduling.scheduleAssignments.find((item) => item.id === allocation.scheduleAssignmentId) : null;
  const assignmentAllocated = activeClosingAllocations(state).filter((item) => item.scheduleAssignmentId === allocation.scheduleAssignmentId).reduce((sum, item) => sum + item.quantity, 0);
  if (assignment && assignmentAllocated > assignment.plannedQuantity) warnings.push({ code: "assignment-over", message: `该排单超额关账 ${assignmentAllocated - assignment.plannedQuantity} 件` });
  if (assignment && assignmentAllocated > assignment.completedQuantity) warnings.push({ code: "completed-over", message: `关账数量高于完成数量 ${assignmentAllocated - assignment.completedQuantity} 件` });
  const difference = currentScheduleDifference(allocation, scheduling, settings);
  if (difference && !difference.acknowledged) warnings.push({ code: "schedule-stale", message: "当前排单与关账快照不同，请同步或确认保留" });
  const price = getCurrentPriceVersion(order);
  if (price.processingUnitPrice !== allocation.customerProcessingUnitPriceSnapshot || calculateFactorySettlementUnitPrice(order) !== allocation.factorySettlementUnitPriceSnapshot || (order.orderType === "distribution" && price.salePrice !== allocation.salePriceSnapshot)) warnings.push({ code: "price-diff", message: "当前订单价格与关账快照不同" });
  return warnings;
}

export function syncAllocationSchedule(state: ClosingState, allocationId: string, scheduling: ProductionSchedulingState, settings: OperationsSettingsState, actor: ClosingActor, now = timestamp()) {
  const allocation = state.allocations.find((item) => item.id === allocationId); if (!allocation) throw new Error("关账归属不存在");
  const period = state.periods.find((item) => item.id === allocation.closingPeriodId); if (!period) throw new Error("关账月份不存在"); assertEditable(period);
  const assignment = scheduling.scheduleAssignments.find((item) => item.id === allocation.scheduleAssignmentId && item.status !== "cancelled"); if (!assignment) throw new Error("当前排单不存在或已取消");
  const basis = scheduleBasis(assignment, settings);
  const next: ClosingAllocation = { ...allocation, executionTypeSnapshot: basis.executionType, productionGroupIdSnapshot: basis.productionGroupId, productionGroupNameSnapshot: basis.productionGroupName, outsourceFactoryIdSnapshot: basis.outsourceFactoryId, outsourceFactoryNameSnapshot: basis.outsourceFactoryName, scheduleBasisSnapshot: basis, staleAcknowledgedFingerprint: null, staleAcknowledgedAt: null, staleAcknowledgedBy: null, staleAcknowledgedByName: null, staleAcknowledgedReason: null, updatedAt: now, ...actorFields(actor) };
  return { before: allocation, allocation: next, state: { ...state, allocations: state.allocations.map((item) => item.id === allocationId ? next : item) } };
}

export function acknowledgeAllocationSchedule(state: ClosingState, allocationId: string, scheduling: ProductionSchedulingState, settings: OperationsSettingsState, actor: ClosingActor, reason: string, now = timestamp()) {
  if (!reason.trim()) throw new Error("保留原关账快照必须填写原因");
  const allocation = state.allocations.find((item) => item.id === allocationId); if (!allocation) throw new Error("关账归属不存在");
  const period = state.periods.find((item) => item.id === allocation.closingPeriodId); if (!period) throw new Error("关账月份不存在"); assertEditable(period);
  const difference = currentScheduleDifference(allocation, scheduling, settings); if (!difference) throw new Error("当前没有需要确认的排单差异");
  const next = { ...allocation, staleAcknowledgedFingerprint: difference.fingerprint, staleAcknowledgedAt: now, staleAcknowledgedBy: actor.id, staleAcknowledgedByName: actor.name, staleAcknowledgedReason: reason.trim(), updatedAt: now, ...actorFields(actor) };
  return { before: allocation, allocation: next, state: { ...state, allocations: state.allocations.map((item) => item.id === allocationId ? next : item) } };
}

export function transitionClosingPeriod(state: ClosingState, periodId: string, action: "confirm" | "unconfirm" | "lock" | "reopen", actor: ClosingActor, input: { reason?: string; warningCount?: number; warningsAcknowledged?: boolean; now?: string } = {}) {
  const before = state.periods.find((item) => item.id === periodId); if (!before) throw new Error("关账月份不存在");
  const now = input.now ?? timestamp(); let period: ClosingPeriod;
  if (action === "confirm") { if (before.status !== "open") throw new Error("只有开放月份可以确认"); period = { ...before, status: "confirmed", confirmedAt: now, confirmedBy: actor.id, confirmedByName: actor.name, updatedAt: now, ...actorFields(actor) }; }
  else if (action === "unconfirm") { if (before.status !== "confirmed") throw new Error("只有已确认月份可以取消确认"); period = { ...before, status: "open", confirmedAt: null, confirmedBy: null, confirmedByName: null, updatedAt: now, ...actorFields(actor) }; }
  else if (action === "lock") { if (before.status !== "confirmed") throw new Error("只有已确认月份可以锁定"); if ((input.warningCount ?? 0) > 0 && (!input.warningsAcknowledged || !input.reason?.trim())) throw new Error("存在预警时锁账必须明确确认并填写原因"); period = { ...before, status: "locked", lockedAt: now, lockedBy: actor.id, lockedByName: actor.name, updatedAt: now, ...actorFields(actor) }; }
  else { if (before.status !== "locked") throw new Error("只有已锁定月份可以重新打开"); if (!input.reason?.trim()) throw new Error("重新打开月份必须填写原因"); period = { ...before, status: "open", lockedAt: null, lockedBy: null, lockedByName: null, reopenedAt: now, reopenedBy: actor.id, reopenedByName: actor.name, reopenReason: input.reason.trim(), updatedAt: now, ...actorFields(actor) }; }
  return { before, period, state: { ...state, periods: state.periods.map((item) => item.id === periodId ? period : item) } };
}

export function getAssignmentsForClosing(order: SalesOrder, scheduling: ProductionSchedulingState) { return assignmentsForOrder(scheduling, order.id).filter((item) => item.status !== "cancelled"); }

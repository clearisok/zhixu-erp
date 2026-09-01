import type { SalesOrder } from "../../order-center/model/order.ts";
import type { OperationsSettingsState } from "../../operations-settings/model/operations-settings.ts";
import type { ExecutionType } from "../../shared-domain/model/operations.ts";

export type ScheduleAssignmentStatus = "planned" | "in_progress" | "completed" | "cancelled";
export type ScheduleDurationMode = "average_daily_output" | "workdays";
export type ScheduleDateMode = "auto_queue" | "manual_fixed";
export type ExecutionMode = "unscheduled" | "internal" | "outsource" | "mixed";
export type ProductionStatus = "unscheduled" | "partially_scheduled" | "scheduled_pending" | "in_production" | "partially_completed" | "completed";
export type TrackingStatus = "not_started" | "in_progress" | "ready" | "issue" | "not_applicable";

export type ScheduleAssignment = {
  id: string;
  salesOrderId: string;
  executionType: ExecutionType;
  productionGroupId: string | null;
  outsourceFactoryId: string | null;
  colorLineId: string | null;
  colorNameSnapshot: string | null;
  outsourceUnitPrice: number | null;
  queueSequence: number | null;
  plannedQuantity: number;
  durationMode: ScheduleDurationMode;
  averageDailyOutputSnapshot: number | null;
  requiredWorkdays: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  nonWorkingDayCount: number;
  completedQuantity: number;
  actualStartDate: string | null;
  actualCompletedDate: string | null;
  dateMode: ScheduleDateMode;
  status: ScheduleAssignmentStatus;
  remark: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type ScheduleBatchAllocation = { salesOrderId: string; scheduleAssignmentId: string; assignedQuantity: number };
export type ScheduleBatch = { id: string; name: string; allocations: ScheduleBatchAllocation[]; remark: string; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string };

export type TrackingField = { status: TrackingStatus; remark: string };

export type OrderExecutionTracking = {
  id: string;
  salesOrderId: string;
  fabricReadiness: TrackingField;
  trimReadiness: TrackingField;
  sampleProgress: TrackingField;
  printingEmbroideryProgress: TrackingField;
  shortOverStatus: TrackingField;
  supplyHubId: string | null;
  fabricSupplyHubArrivalDate: string | null;
  trimSupplyHubArrivalDate: string | null;
  remark: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type ProductionSchedulingState = {
  scheduleAssignments: ScheduleAssignment[];
  orderExecutionTrackings: OrderExecutionTracking[];
  scheduleBatches: ScheduleBatch[];
};

export type QuantityProjection = {
  effectiveOrderQuantity: number;
  scheduledQuantity: number;
  unscheduledQuantity: number;
  internalScheduledQuantity: number;
  outsourceScheduledQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  warnings: string[];
};

export type DeliveryRiskCheckpoint = {
  deliveryPlanId: string;
  deliveryDate: string;
  deliveryQuantity: number;
  cumulativeDemand: number;
  cumulativeExpectedSupply: number;
  gap: number;
  riskType: "none" | "unscheduled" | "shortfall" | "delay";
};

export type DeliveryRiskProjection = {
  level: "none" | "attention" | "risk";
  nearestDeliveryDate: string | null;
  withinWarningWindow: boolean;
  checkpoints: DeliveryRiskCheckpoint[];
  messages: string[];
};

export type OrderScheduleProjection = QuantityProjection & {
  executionMode: ExecutionMode;
  productionStatus: ProductionStatus;
  deliveryRisk: DeliveryRiskProjection;
};

export const emptyProductionSchedulingState = (): ProductionSchedulingState => ({
  scheduleAssignments: [],
  orderExecutionTrackings: [],
  scheduleBatches: [],
});

const statuses = <T extends string>(...values: T[]) => new Set<string>(values);
const assignmentStatuses = statuses<ScheduleAssignmentStatus>("planned", "in_progress", "completed", "cancelled");
const trackingStatuses = statuses<TrackingStatus>("not_started", "in_progress", "ready", "issue", "not_applicable");
const durationModes = statuses<ScheduleDurationMode>("average_daily_output", "workdays");
const dateModes = statuses<ScheduleDateMode>("auto_queue", "manual_fixed");

function assertDateOrder(start: string | null, end: string | null, label: string) {
  if (start && end && start > end) throw new Error(`${label}开始日期不能晚于结束日期`);
}

function assertTrackingField(field: TrackingField, label: string) {
  if (!field || !trackingStatuses.has(field.status) || typeof field.remark !== "string") throw new Error(`${label}跟进状态无效`);
}

export function validateProductionSchedulingState(
  value: unknown,
  context?: { orders?: SalesOrder[]; operationsSettings?: OperationsSettingsState },
): ProductionSchedulingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("生产排单本地数据格式无效");
  const source = value as Partial<ProductionSchedulingState>;
  if (!Array.isArray(source.scheduleAssignments) || !Array.isArray(source.orderExecutionTrackings)) throw new Error("生产排单集合结构无效");
  const state = structuredClone({ ...source, scheduleBatches: Array.isArray(source.scheduleBatches) ? source.scheduleBatches : [] }) as ProductionSchedulingState;
  state.scheduleAssignments = state.scheduleAssignments.map((assignment) => ({ ...assignment, colorLineId: assignment.colorLineId ?? null, colorNameSnapshot: assignment.colorNameSnapshot ?? null, outsourceUnitPrice: assignment.outsourceUnitPrice ?? null }));
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) throw new Error(`${label}存在重复 ID`); };
  unique(state.scheduleAssignments.map((item) => item.id), "排单");
  unique(state.orderExecutionTrackings.map((item) => item.id), "订单跟进");
  unique(state.scheduleBatches.map((item) => item.id), "合并排单批次");
  unique(state.orderExecutionTrackings.map((item) => item.salesOrderId), "订单跟进归属");
  const orderIds = context?.orders ? new Set(context.orders.map((order) => order.id)) : null;
  for (const assignment of state.scheduleAssignments) {
    if (!assignment.id || !assignment.salesOrderId || !assignmentStatuses.has(assignment.status)) throw new Error("排单字段或订单归属无效");
    if (orderIds && !orderIds.has(assignment.salesOrderId)) throw new Error(`排单 ${assignment.id} 引用了不存在的订单`);
    if (!durationModes.has(assignment.durationMode) || !dateModes.has(assignment.dateMode)) throw new Error("排单工期或日期模式无效");
    if (!Number.isFinite(assignment.plannedQuantity) || assignment.plannedQuantity < 0 || !Number.isFinite(assignment.completedQuantity) || assignment.completedQuantity < 0) throw new Error("排单数量不能小于 0");
    if (assignment.outsourceUnitPrice !== null && (!Number.isFinite(assignment.outsourceUnitPrice) || assignment.outsourceUnitPrice < 0)) throw new Error("外发单价不能小于 0");
    if (!Number.isInteger(assignment.requiredWorkdays) || assignment.requiredWorkdays < 1) throw new Error("排单工作日必须为正整数");
    if (!Number.isInteger(assignment.nonWorkingDayCount) || assignment.nonWorkingDayCount < 0) throw new Error("非工作日数量无效");
    if (assignment.durationMode === "average_daily_output" && (!assignment.averageDailyOutputSnapshot || assignment.averageDailyOutputSnapshot <= 0)) throw new Error("按日产量排期必须保存有效日产量快照");
    if (assignment.executionType === "internal") {
      if (!assignment.productionGroupId || assignment.outsourceFactoryId) throw new Error("内部排单必须且只能选择生产组");
    } else if (assignment.executionType === "outsource") {
      if (!assignment.outsourceFactoryId || assignment.productionGroupId) throw new Error("外发排单必须且只能选择外发厂");
    } else throw new Error("排单执行类型无效");
    assertDateOrder(assignment.plannedStartDate, assignment.plannedEndDate, "排单");
    assertDateOrder(assignment.actualStartDate, assignment.actualCompletedDate, "排单实际");
  }
  for (const batch of state.scheduleBatches) {
    if (!batch.id || !batch.name.trim() || !Array.isArray(batch.allocations) || batch.allocations.length < 2) throw new Error("合并排单批次结构无效");
    if (batch.allocations.some((item) => !item.salesOrderId || !item.scheduleAssignmentId || !Number.isFinite(item.assignedQuantity) || item.assignedQuantity <= 0)) throw new Error("合并排单分配无效");
  }
  for (const tracking of state.orderExecutionTrackings) {
    if (!tracking.id || !tracking.salesOrderId || (orderIds && !orderIds.has(tracking.salesOrderId))) throw new Error("订单跟进归属无效");
    assertTrackingField(tracking.fabricReadiness, "面料");
    assertTrackingField(tracking.trimReadiness, "辅料");
    assertTrackingField(tracking.sampleProgress, "样品");
    assertTrackingField(tracking.printingEmbroideryProgress, "印绣花");
    assertTrackingField(tracking.shortOverStatus, "短溢装");
  }
  void context?.operationsSettings;
  return state;
}

export const scheduleAssignmentIsActive = (assignment: ScheduleAssignment) => assignment.status !== "cancelled";

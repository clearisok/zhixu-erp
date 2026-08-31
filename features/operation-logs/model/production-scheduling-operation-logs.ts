import type { SalesOrder } from "../../order-center/model/order.ts";
import type { OrderExecutionTracking, ScheduleAssignment } from "../../production-scheduling/model/production-scheduling.ts";
import { createOperationLogDraft, type OperationLogAction, type OperationLogActor, type OperationLogDraft } from "./operation-log.ts";

type SchedulingEntity = ScheduleAssignment | OrderExecutionTracking;
export function createProductionSchedulingOperationLog(input: { actor: OperationLogActor; order: SalesOrder; action: OperationLogAction; entityType: "ScheduleAssignment" | "OrderExecutionTracking"; entity: SchedulingEntity; beforeValues?: Record<string, string | number | null>; afterValues?: Record<string, string | number | null>; reason?: string; operationId?: string }): OperationLogDraft {
  const scheduleAssignmentId = input.entityType === "ScheduleAssignment" ? input.entity.id : undefined;
  const trackingId = input.entityType === "OrderExecutionTracking" ? input.entity.id : undefined;
  const data = (values?: Record<string, string | number | null>) => ({ orderId: input.order.id, orderNo: input.order.orderNo, orderStyleNo: input.order.styleNo, styleName: input.order.styleName, scheduleAssignmentId, orderExecutionTrackingId: trackingId, reason: input.reason, objectSource: "order" as const, objectType: input.entityType, objectId: input.entity.id, objectName: `${input.order.orderNo} · ${input.order.styleNo}`, values });
  const draft = createOperationLogDraft({ actor: input.actor, module: "生产排单", entityType: input.entityType, entityId: input.entity.id, action: input.action, beforeData: input.beforeValues ? data(input.beforeValues) : null, afterData: input.afterValues ? data(input.afterValues) : null });
  return { ...draft, operationId: input.operationId ?? draft.operationId };
}

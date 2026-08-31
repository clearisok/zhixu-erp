import type { SalesOrder } from "../../order-center/model/order.ts";
import { createOperationLogDraft, type OperationLogAction, type OperationLogActor, type OperationLogData, type OperationLogDraft } from "./operation-log.ts";

export type OrderLogContext = {
  order: SalesOrder;
  action: OperationLogAction;
  actor: OperationLogActor;
  beforeValues?: Record<string, string | number | null>;
  afterValues?: Record<string, string | number | null>;
  reason?: string;
  entityType?: "SalesOrder" | "DeliveryPlan" | "OrderQuantityChange" | "OrderPriceVersion";
  entityId?: string;
  operationId?: string;
  operationSequence?: number;
};

function contextData(input: OrderLogContext, values?: Record<string, string | number | null>): OperationLogData {
  return {
    orderId: input.order.id,
    orderNo: input.order.orderNo,
    orderStyleNo: input.order.styleNo,
    sourceQuoteId: input.order.sourceQuoteId ?? undefined,
    sourceRevisionId: input.order.sourceRevisionId ?? undefined,
    sourcePriceVersionId: input.order.sourcePriceVersionId ?? undefined,
    reason: input.reason,
    objectSource: "order",
    objectType: input.entityType ?? "SalesOrder",
    objectId: input.entityId ?? input.order.id,
    objectName: `${input.order.orderNo} · ${input.order.styleNo || input.order.styleName || "未填写款号"}`,
    values,
  };
}

export function createOrderOperationLog(input: OrderLogContext): OperationLogDraft {
  return createOperationLogDraft({
    actor: input.actor,
    module: "订单中心",
    entityType: input.entityType ?? "SalesOrder",
    entityId: input.entityId ?? input.order.id,
    operationId: input.operationId,
    operationSequence: input.operationSequence,
    action: input.action,
    beforeData: input.beforeValues ? contextData(input, input.beforeValues) : null,
    afterData: input.afterValues ? contextData(input, input.afterValues) : null,
  });
}

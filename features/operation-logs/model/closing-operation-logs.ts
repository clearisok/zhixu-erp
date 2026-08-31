import type { ClosingAllocation, ClosingPeriod } from "../../closing-center/model/closing.ts";
import { createOperationLogDraft, type OperationLogAction, type OperationLogActor, type OperationLogDraft } from "./operation-log.ts";

const periodValues = (item: ClosingPeriod) => ({ "月份": item.month, "状态": item.status, "税率": item.taxRateSnapshot });
const allocationValues = (item: ClosingAllocation) => ({ "月份ID": item.closingPeriodId, "关账数量": item.quantity, "关账工价": item.closingProcessingUnitPrice, "加工币种": item.processingCurrencySnapshot, "汇率": item.fxRateSnapshot, "销售价": item.salePriceSnapshot, "执行类型": item.executionTypeSnapshot, "执行方": item.productionGroupNameSnapshot ?? item.outsourceFactoryNameSnapshot, "状态": item.status });

export function createClosingPeriodLog(input: { before?: ClosingPeriod | null; after: ClosingPeriod; actor: OperationLogActor; action: OperationLogAction; reason?: string; operationId?: string }): OperationLogDraft {
  return createOperationLogDraft({ actor: input.actor, module: "关账中心", entityType: "ClosingPeriod", entityId: input.after.id, operationId: input.operationId, action: input.action, beforeData: input.before ? { closingPeriodId: input.before.id, reason: input.reason, objectName: input.before.month, values: periodValues(input.before) } : null, afterData: { closingPeriodId: input.after.id, reason: input.reason, objectName: input.after.month, values: periodValues(input.after) } });
}

export function createClosingAllocationLog(input: { before?: ClosingAllocation | null; after: ClosingAllocation; actor: OperationLogActor; action: OperationLogAction; orderNo?: string; styleNo?: string; reason?: string; operationId?: string; operationSequence?: number; fields?: string[] }): OperationLogDraft {
  const context = (item: ClosingAllocation) => { const allValues = allocationValues(item); const values = input.fields?.length ? Object.fromEntries(Object.entries(allValues).filter(([field]) => input.fields?.includes(field))) : allValues; return { orderId: item.salesOrderId, orderNo: input.orderNo, orderStyleNo: input.styleNo, closingPeriodId: item.closingPeriodId, closingAllocationId: item.id, scheduleAssignmentId: item.scheduleAssignmentId ?? undefined, reason: input.reason, objectName: `${input.orderNo ?? item.salesOrderId} · ${input.styleNo ?? ""}`, values }; };
  return createOperationLogDraft({ actor: input.actor, module: "关账中心", entityType: "ClosingAllocation", entityId: input.after.id, operationId: input.operationId, operationSequence: input.operationSequence, action: input.action, beforeData: input.before ? context(input.before) : null, afterData: context(input.after) });
}

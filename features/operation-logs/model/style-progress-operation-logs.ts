import type { MaterialExpectedArrivalBatch } from "../../style-progress/model/style-progress.ts";
import {
  createOperationId,
  createOperationLogDraft,
  type OperationLogActor,
  type OperationLogData,
  type OperationLogDraft,
} from "./operation-log.ts";

export type StyleProgressPlanLogContext = {
  actor: OperationLogActor;
  salesContractNo: string;
  canonicalMaterialKey: string;
  orderId?: string;
  orderNo?: string;
  orderStyleNo?: string;
  createdAt?: string;
  operationId?: string;
};

const sortedAllocations = (batch: MaterialExpectedArrivalBatch) => [...batch.allocations]
  .sort((left, right) => left.materialDemandId.localeCompare(right.materialDemandId) || left.id.localeCompare(right.id));

const batchData = (batch: MaterialExpectedArrivalBatch, context: StyleProgressPlanLogContext): OperationLogData => ({
  orderId: context.orderId,
  orderNo: context.orderNo,
  orderStyleNo: context.orderStyleNo,
  salesContractNo: context.salesContractNo,
  canonicalMaterialKey: context.canonicalMaterialKey,
  objectType: "MaterialExpectedArrivalBatch",
  objectId: batch.id,
  objectName: batch.expectedArrivalAtHubDate,
  values: {
    "预计到集货仓": batch.expectedArrivalAtHubDate,
    "日期来源": batch.dateSource === "manual" ? "人工计划" : "来源计划",
    "分配需求数": batch.allocations.length,
    "本批数量": sortedAllocations(batch).reduce((total, allocation) => total + allocation.quantity, 0),
    "分配明细": sortedAllocations(batch).map((allocation) => `${allocation.materialDemandId}:${allocation.quantity}`).join("；"),
  },
});

const equalAllocations = (left: MaterialExpectedArrivalBatch, right: MaterialExpectedArrivalBatch) =>
  JSON.stringify(sortedAllocations(left)) === JSON.stringify(sortedAllocations(right));

const planData = (batches: MaterialExpectedArrivalBatch[], context: StyleProgressPlanLogContext): OperationLogData => ({
  orderId: context.orderId,
  orderNo: context.orderNo,
  orderStyleNo: context.orderStyleNo,
  salesContractNo: context.salesContractNo,
  canonicalMaterialKey: context.canonicalMaterialKey,
  objectType: "MaterialExpectedArrivalBatch",
  objectId: context.canonicalMaterialKey,
  objectName: context.salesContractNo,
  values: {
    "批次数": batches.length,
    "预计到集货仓": [...batches].sort((left, right) => left.expectedArrivalAtHubDate.localeCompare(right.expectedArrivalAtHubDate)).map((batch) => batch.expectedArrivalAtHubDate).join("；"),
    "已分配数量": batches.flatMap((batch) => batch.allocations).reduce((total, allocation) => total + allocation.quantity, 0),
    "分配明细": batches.flatMap((batch) => sortedAllocations(batch).map((allocation) => `${batch.expectedArrivalAtHubDate}/${allocation.materialDemandId}:${allocation.quantity}`)).join("；"),
  },
});

export function createExpectedArrivalPlanOperationLogs(input: StyleProgressPlanLogContext & {
  before: MaterialExpectedArrivalBatch[];
  after: MaterialExpectedArrivalBatch[];
  restoreToSource?: boolean;
}): OperationLogDraft[] {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const operationId = input.operationId ?? createOperationId();
  if (input.restoreToSource) {
    return [createOperationLogDraft({
      actor: input.actor,
      module: "款式进度",
      entityType: "MaterialExpectedArrivalBatch",
      entityId: input.after[0]?.id ?? input.before[0]?.id ?? input.canonicalMaterialKey,
      operationId,
      action: "恢复使用来源计划",
      beforeData: planData(input.before, input),
      afterData: planData(input.after, input),
      createdAt,
    })];
  }

  const beforeById = new Map(input.before.map((batch) => [batch.id, batch]));
  const afterById = new Map(input.after.map((batch) => [batch.id, batch]));
  const logs: OperationLogDraft[] = [];
  const append = (draft: Omit<Parameters<typeof createOperationLogDraft>[0], "actor" | "module" | "operationId" | "operationSequence" | "createdAt">) => {
    logs.push(createOperationLogDraft({
      ...draft,
      actor: input.actor,
      module: "款式进度",
      operationId,
      operationSequence: logs.length,
      createdAt,
    }));
  };
  for (const batch of input.after) {
    const previous = beforeById.get(batch.id);
    if (!previous) {
      append({ entityType: "MaterialExpectedArrivalBatch", entityId: batch.id, action: "创建预计到料批次", beforeData: null, afterData: batchData(batch, input) });
      continue;
    }
    if (previous.expectedArrivalAtHubDate !== batch.expectedArrivalAtHubDate || previous.dateSource !== batch.dateSource) {
      append({ entityType: "MaterialExpectedArrivalBatch", entityId: batch.id, action: "修改预计到料批次", beforeData: batchData(previous, input), afterData: batchData(batch, input) });
    }
    if (!equalAllocations(previous, batch)) {
      append({ entityType: "MaterialExpectedArrivalBatch", entityId: batch.id, action: "调整预计到料分配", beforeData: batchData(previous, input), afterData: batchData(batch, input) });
    }
  }
  for (const batch of input.before) {
    if (afterById.has(batch.id)) continue;
    append({ entityType: "MaterialExpectedArrivalBatch", entityId: batch.id, action: "删除预计到料批次", beforeData: batchData(batch, input), afterData: null });
  }
  return logs;
}

"use client";

import {
  createExpectedArrivalPlanOperationLogs,
  operationLogRepository,
  type OperationLogActor,
  type OperationLogRepository,
} from "../../operation-logs/index.ts";
import {
  styleProgressRepository,
  type ExpectedArrivalPlanMutation,
  type ExpectedArrivalPlanMutationResult,
  type StyleProgressRepository,
} from "../repository/style-progress-repository.ts";

export type ExpectedArrivalPlanCommand = ExpectedArrivalPlanMutation & {
  actor: OperationLogActor;
  orderId?: string;
  orderNo?: string;
  orderStyleNo?: string;
  createdAt?: string;
};

export type RestoreExpectedArrivalPlanCommand = Omit<ExpectedArrivalPlanCommand, "batches">;

type Dependencies = {
  repository: StyleProgressRepository;
  logs: OperationLogRepository;
};

const defaultDependencies: Dependencies = { repository: styleProgressRepository, logs: operationLogRepository };

const appendPlanLogs = async (
  command: ExpectedArrivalPlanCommand | RestoreExpectedArrivalPlanCommand,
  result: ExpectedArrivalPlanMutationResult,
  dependencies: Dependencies,
  restoreToSource: boolean,
) => {
  await dependencies.logs.appendMany(createExpectedArrivalPlanOperationLogs({
    actor: command.actor,
    salesContractNo: command.salesContractNo,
    canonicalMaterialKey: command.canonicalMaterialKey,
    orderId: command.orderId,
    orderNo: command.orderNo,
    orderStyleNo: command.orderStyleNo,
    createdAt: command.createdAt,
    before: result.before,
    after: result.after,
    restoreToSource,
  }));
};

export async function saveExpectedArrivalPlan(
  command: ExpectedArrivalPlanCommand,
  dependencies: Dependencies = defaultDependencies,
): Promise<ExpectedArrivalPlanMutationResult> {
  const result = await dependencies.repository.replaceExpectedArrivalBatches(command);
  await appendPlanLogs(command, result, dependencies, false);
  return result;
}

export async function restoreExpectedArrivalPlanToSource(
  command: RestoreExpectedArrivalPlanCommand,
  dependencies: Dependencies = defaultDependencies,
): Promise<ExpectedArrivalPlanMutationResult> {
  const result = await dependencies.repository.restoreExpectedArrivalBatchesToSource({
    salesContractNo: command.salesContractNo,
    canonicalMaterialKey: command.canonicalMaterialKey,
    materialDemandIds: command.materialDemandIds,
    updatedAt: command.createdAt,
    updatedBy: command.actor.userName,
  });
  await appendPlanLogs(command, result, dependencies, true);
  return result;
}

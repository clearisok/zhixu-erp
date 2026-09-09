import { createOperationLogDraft, type OperationLogActor, type OperationLogDraft } from "../../operation-logs/model/operation-log.ts";

export type AinuokeAccountLogAction = "绑定艾诺科个人账号" | "更新艾诺科个人账号" | "解除艾诺科个人账号";

export function createAinuokeAccountOperationLog(input: { actor: OperationLogActor; action: AinuokeAccountLogAction; result: "success"; createdAt?: string }): OperationLogDraft {
  return createOperationLogDraft({
    actor: input.actor,
    module: "艾诺科个人账号",
    entityType: "AinuokeAccount",
    entityId: input.actor.userId,
    action: input.action,
    beforeData: null,
    afterData: { values: { "结果": input.result } },
    createdAt: input.createdAt,
  });
}

import { parseExecutionIntent, type ExecutionIntent } from "../../../server/production-scheduling/execution-contract";
import { previewExecutionChange } from "../../../server/production-scheduling/execution-preview";
import { ProductionPlanError, type ExecutionScope } from "./production-plan-client";

export type ExecutionForm = { status: "in_progress" | "completed"; completedQuantity: string; actualStartDate: string; actualCompletedDate: string; reason: string };
export function newExecutionForm(scope: ExecutionScope, finish = false): ExecutionForm {
  const saved = scope.order.executions[scope.assignment.id];
  return { status: finish ? "completed" : saved?.status ?? "in_progress", completedQuantity: saved?.completedQuantity ?? "",
    actualStartDate: saved?.actualStartDate ?? "", actualCompletedDate: saved?.actualCompletedDate ?? "", reason: "" };
}
export function executionFormIntent(scope: ExecutionScope, form: ExecutionForm, replan = false): ExecutionIntent {
  let intent: ExecutionIntent;
  const saved = scope.order.executions[scope.assignment.id] ?? null;
  try {
    intent = parseExecutionIntent({ action: "record_execution", orderId: scope.order.order.id, assignmentId: scope.assignment.id,
      expectedAssignmentVersion: scope.assignment.version, expectedExecutionVersion: saved?.version ?? 0, expectedPlanVersion: scope.order.order.planVersion,
      data: { status: form.status, completedQuantity: form.completedQuantity, actualStartDate: form.actualStartDate || null,
        actualCompletedDate: form.status === "completed" ? form.actualCompletedDate || null : null }, reason: form.reason,
      replan: replan && scope.queue ? { expectedQueueVersion: scope.queue.version } : null });
    if (replan && (!scope.queue || scope.assignment.executionType !== "internal" || scope.assignment.status === "cancelled")) throw Error("invalid_replan");
  } catch { throw new ProductionPlanError(400, "invalid_production_execution_intent", true); }
  // Reuse the domain's correction/attribution rules. Queue calculation stays on the server.
  try { previewExecutionChange({ intent: { ...intent, replan: null }, assignment: scope.assignment, planVersion: scope.order.order.planVersion,
    execution: saved ? { version: saved.version, status: saved.status, completedQuantity: saved.completedQuantity, actualStartDate: saved.actualStartDate, actualCompletedDate: saved.actualCompletedDate } : null, queue: null }); }
  catch (error) { const known = error as { status?: number; code?: string }; throw new ProductionPlanError(known.status ?? 400, known.code ?? "invalid_production_execution_intent", true); }
  return intent;
}

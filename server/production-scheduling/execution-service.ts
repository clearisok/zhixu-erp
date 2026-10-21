import type { Pool, PoolClient } from "pg";
import { readCurrentActor } from "../auth/current-actor.js";
import type { TrustedIdentity } from "../auth/session.js";
import { productionResourceUuid } from "../production-resources/contract.js";
import { appendOperationLog, createServerOperationId } from "../operation-logs/repository.js";
import { freezePhysicalOrderGroups } from "../sales-orders/effective-attribution.js";
import { boundProductionPayload, requireProductionPermissions, runProductionCommand } from "./command-transaction.js";
import { executionRequiredPermissions, parseExecutionCommand, parseExecutionIntent, type ExecutionIntent } from "./execution-contract.js";
import { executionFacts, executionsForAssignments, persistExecution, productionExecutionsAvailable, type StoredExecution } from "./execution-store.js";
import { executionQueueRow, previewExecutionChange } from "./execution-preview.js";
import { assignmentsForGroup, bumpPlanHeads, currentResourceFacts, groupPlanVersion, orderPlanVersion, planFail, planHash,
  productionPlansAvailable, publicAssignment, readAssignment, readOrderPlanFacts, type StoredAssignment } from "./repository.js";
import { applyPlanBuild, planDraft, validateProductionOrder, type PlanBuild } from "./service.js";
import type { PlanCommand } from "./contract.js";

async function buildExecution(client: PoolClient, intent: ExecutionIntent, freeze: boolean) {
  await productionExecutionsAvailable(client);
  const assignment = await readAssignment(client, intent.assignmentId);
  if (assignment.orderId !== intent.orderId) planFail(409, "production_assignment_order_conflict");
  if (intent.replan && (!assignment.productionGroupId || assignment.status === "cancelled")) planFail(409, "production_internal_queue_required");
  const rows = intent.replan ? await assignmentsForGroup(client, assignment.productionGroupId!) : [];
  const ids = [...new Set([intent.orderId, ...rows.map(row => row.orderId)])].sort();
  if (freeze) await freezePhysicalOrderGroups(client, ids);
  const order = await validateProductionOrder(client, intent.orderId);
  const orders = [];
  for (const id of ids) orders.push(id === order.id ? order : await readOrderPlanFacts(client, id));
  const executions = await executionsForAssignments(client, [...new Set([assignment.id, ...rows.map(row => row.id)])]);
  const resources = intent.replan ? await currentResourceFacts(client, "internal", assignment.productionGroupId!, freeze) : null;
  if (resources && resources.executionType !== "internal") return planFail(503, "production_resource_type_invalid");
  const queueVersion = assignment.productionGroupId ? await groupPlanVersion(client, assignment.productionGroupId) : null;
  if (queueVersion !== null && queueVersion >= 2147483647) planFail(409, "production_queue_version_exhausted");
  // Frozen/aliased physical orders remain readable anchors. They are never
  // adopted as writable targets or silently merged into an effective owner.
  const readOnlyIds = new Set(orders.filter(item => item.effectiveOrderId !== item.id || ["completed", "cancelled"].includes(item.lifecycleState)).map(item => item.id));
  const queueRows = rows.map(row => {
    const value = executionQueueRow(row, executionFacts(executions[row.id]));
    return readOnlyIds.has(row.orderId) && value.dateMode === "auto_queue" ? { ...value, dateMode: "manual_fixed" as const } : value;
  });
  let change: ReturnType<typeof previewExecutionChange>;
  try {
    change = previewExecutionChange({ intent, assignment, execution: executionFacts(executions[assignment.id]), planVersion: order.planVersion,
      queue: resources?.executionType === "internal" ? { queueVersion: queueVersion!, resources, assignments: queueRows } : null });
  } catch (error) {
    if (error instanceof Error && error.name === "SchedulePlanningError") return planFail(422, error.message); throw error;
  }
  const queues = intent.replan ? [{ groupId: assignment.productionGroupId!, version: queueVersion!, assignments: rows }] : [];
  const plan: PlanBuild | null = intent.replan ? { intent: { action: "replan", groupId: assignment.productionGroupId!, expectedQueueVersion: queueVersion!,
    anchorDate: intent.data.actualCompletedDate!, orderedAssignmentIds: null }, orders, queues, mutations: [], warnings: [], executions } : null;
  if (plan && resources) {
    for (const id of change.replannableAssignmentIds) {
      const before = rows.find(row => row.id === id)!;
      await validateProductionOrder(client, before.orderId);
      const dates = change.queuePreview!.changes.find(item => item.assignmentId === id)?.after;
      if (dates && (!dates.plannedStartDate || !dates.plannedEndDate)) planFail(503, "production_plan_dates_invalid");
      const after = { ...planDraft(before), ...(dates ? { plannedStartDate: dates.plannedStartDate!, plannedEndDate: dates.plannedEndDate!,
        firstProductionDate: dates.firstProductionDate, nonWorkingDayCount: dates.nonWorkingDayCount } : {}), resourceFacts: resources, resourceSnapshotHash: planHash(resources) };
      if (planHash(after) !== planHash(planDraft(before))) {
        if (before.version >= 2147483647) planFail(409, "production_assignment_version_exhausted");
        after.version++; plan.mutations.push({ before, after });
      }
    }
  }
  return { assignment, order, orders, executions, queueVersion, resources, queues, change, plan };
}
function projection(build: Awaited<ReturnType<typeof buildExecution>>, actor: TrustedIdentity) {
  const changes = build.plan?.mutations.map(item => ({ before: publicAssignment(item.before!), after: (() => {
    const { resourceFacts: _facts, ...row } = item.after; void _facts; return row;
  })() })) ?? [];
  const fingerprint = { actorId: actor.userId, intent: build.change.intent, assignment: publicAssignment(build.assignment), orders: build.orders,
    executions: build.executions, queueVersion: build.queueVersion, queues: build.queues.map(queue => ({ ...queue, assignments: queue.assignments.map(publicAssignment) })),
    resources: build.resources, change: build.change, changes };
  boundProductionPayload(fingerprint, "production_execution_preview_too_large");
  const result = { ...build.change, previewHash: planHash(fingerprint), planChanges: changes,
    orderVersions: build.orders.map(order => ({ orderId: order.id, version: order.planVersion })),
    queueVersions: build.assignment.productionGroupId ? [{ groupId: build.assignment.productionGroupId, version: build.queueVersion! }] : [] };
  boundProductionPayload(result, "production_execution_preview_too_large"); return result;
}
export async function previewProductionExecution(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const intent = parseExecutionIntent(raw), client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const actor = await readCurrentActor(client, identity); requireProductionPermissions(actor, executionRequiredPermissions(intent));
    await productionPlansAvailable(client);
    const result = projection(await buildExecution(client, intent, false), actor);
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
function auditExecution(assignment: StoredAssignment, execution: StoredExecution | null, orderNo: string) {
  const executor = assignment.resourceFacts.executionType === "internal" ? assignment.resourceFacts.group.name : assignment.resourceFacts.factory.name;
  return { orderId: assignment.orderId, objectName: `${orderNo} · ${executor}`, scheduleAssignmentId: assignment.id, values: execution ? {
    执行方: executor, 颜色: assignment.colorNameSnapshot, 累计完成: execution.completedQuantity,
    实际开工: execution.actualStartDate, 实际结束: execution.actualCompletedDate, 状态: execution.status === "completed" ? "已结束" : "进行中",
  } : undefined };
}
export async function executeProductionExecution(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const command = parseExecutionCommand(raw);
  return runProductionCommand(pool, identity, command, executionRequiredPermissions(command.intent), async (client, actor) => {
    const build = await buildExecution(client, command.intent, true), preview = projection(build, actor);
    if (preview.previewHash !== command.previewHash) planFail(409, "production_execution_preview_changed");
    const changed = build.change.changed || Boolean(build.plan?.mutations.length), operationId = changed ? createServerOperationId() : null;
    let execution = build.executions[build.assignment.id] ?? null;
    if (build.change.changed) {
      const before = execution;
      execution = await persistExecution(client, build.assignment, before, build.change.after, actor, command.requestId, operationId!, command.intent.reason);
      await appendOperationLog(client, actor, { operationId: operationId!, operationSequence: 0, module: "生产排单", entityType: "ScheduleAssignment", entityId: build.assignment.id,
        action: execution.status === "completed" ? "标记生产完成" : "修改完成数量", beforeData: before ? auditExecution(build.assignment, before, build.order.orderNo) : null,
        afterData: auditExecution(build.assignment, execution, build.order.orderNo), metadata: { requestId: command.requestId, previewHash: command.previewHash, appliedVersion: execution.version, reason: command.intent.reason } });
    }
    const applied = build.plan ? await applyPlanBuild(client, actor, { ...command, intent: build.plan.intent } as PlanCommand, build.plan,
      { operationId, sequenceStart: build.change.changed ? 1 : 0, deferHeads: true }) : null;
    const changedOrders = new Set(build.plan?.mutations.map(item => item.after.orderId) ?? []);
    const changedGroups = new Set(build.plan?.mutations.length ? build.queues.map(queue => queue.groupId) : []);
    if (build.change.changed) { changedOrders.add(build.assignment.orderId); if (build.assignment.productionGroupId) changedGroups.add(build.assignment.productionGroupId); }
    await bumpPlanHeads(client, [...changedOrders], [...changedGroups]);
    const orderVersions = [], queueVersions = [];
    for (const order of build.orders) orderVersions.push({ orderId: order.id, version: await orderPlanVersion(client, order.id) });
    if (build.assignment.productionGroupId) queueVersions.push({ groupId: build.assignment.productionGroupId, version: await groupPlanVersion(client, build.assignment.productionGroupId) });
    return { result: { requestId: command.requestId, status: "applied" as const, changed, operationId, assignments: applied?.assignments ?? [],
      execution, assignmentId: build.assignment.id, orderVersions, queueVersions }, orderIds: build.orders.filter(order => order.effectiveOrderId === order.id).map(order => order.id) };
  });
}
export async function readProductionExecutionHistory(pool: Pool, identity: TrustedIdentity, inputId: string, offset = 0, asOfVersion: number | null = null) {
  const id = productionResourceUuid(inputId);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) planFail(400, "invalid_production_history_query");
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const actor = await readCurrentActor(client, identity); requireProductionPermissions(actor, ["order.view", "schedule.view"]);
    await productionPlansAvailable(client); await productionExecutionsAvailable(client);
    const assignment = await readAssignment(client, id), execution = (await executionsForAssignments(client, [id]))[id] ?? null;
    const anchor = asOfVersion ?? execution?.version ?? 0;
    if (!Number.isSafeInteger(anchor) || anchor < 0 || anchor > (execution?.version ?? 0) || execution && anchor === 0) planFail(400, "invalid_production_history_query");
    const history = (await client.query(`SELECT v.version,v.snapshot,v.request_id::text AS "requestId",v.operation_id AS "operationId",v.reason,v.recorded_at AS "recordedAt"
      FROM production_schedule_execution_versions v WHERE assignment_id=$1 AND version<=$3 ORDER BY version DESC LIMIT 51 OFFSET $2`, [id, offset, anchor])).rows;
    if (history.length > 50 && offset + 50 > 100000) planFail(422, "production_history_projection_limit");
    const result = { assignment: publicAssignment(assignment), execution, history: history.slice(0, 50), offset, limit: 50,
      asOfVersion: anchor, hasMore: history.length > 50, nextOffset: history.length > 50 ? offset + 50 : null };
    boundProductionPayload(result, "production_execution_read_too_large");
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

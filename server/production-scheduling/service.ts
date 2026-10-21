import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { calculateScheduleDates, ScheduleScanLimitError } from "../../features/production-scheduling/service/production-scheduling-service.js";
import { readCurrentActor } from "../auth/current-actor.js";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { appendOperationLog, createServerOperationId } from "../operation-logs/repository.js";
import { productionResourceUuid } from "../production-resources/contract.js";
import { readProductionResourceSnapshot } from "../production-resources/service.js";
import { ensureStableOrderColor } from "../sales-orders/color-identities.js";
import { freezePhysicalOrderGroups } from "../sales-orders/effective-attribution.js";
import { requireVerifiedOrderBusiness } from "../sales-orders/identity-service.js";
import { derivePlanDuration, parsePlanCommand, parsePlanIntent, type PlanCommand, type PlanData, type PlanIntent } from "./contract.js";
import { previewInternalQueue, queuePlanningRowIsProtected, SCHEDULE_PLANNING_LIMITS } from "./planning-preview.js";
import { assertExecutionAttributionUnchanged, executionQueueRow, projectExecutionQuantities } from "./execution-preview.js";
import { executionFacts, executionsForAssignments, productionExecutionsAvailable, type StoredExecution } from "./execution-store.js";
import { productionRequestLock, requireProductionPermissions, runProductionCommand, savedCommandPermissions } from "./command-transaction.js";
import { parsePlanListQuery } from "./read-contract.js";
import { listPlanGroups, listPlanOrders, readPlanOrderSummaries } from "./read-model.js";
import {
  assignmentsForGroup, assignmentsForOrder, bumpPlanHeads, currentResourceFacts, groupPlanVersion, orderPlanVersion,
  persistAssignment, planFail, planHash, productionPlansAvailable, publicAssignment, readAssignment, readOrderPlanFacts, storeResourceFacts,
  type Assignment, type ResourceFacts, type StoredAssignment,
} from "./repository.js";

export type Draft = Omit<StoredAssignment, "id" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt"> & { id: string | null };
export type Mutation = { before: StoredAssignment | null; after: Draft };
type Warning = { kind: string; assignmentId: string | null; orderId?: string; previousEndDate?: string | null };
export type PlanBuild = { intent: PlanIntent; orders: Awaited<ReturnType<typeof readOrderPlanFacts>>[]; queues: { groupId: string; version: number; assignments: StoredAssignment[] }[]; mutations: Mutation[]; warnings: Warning[]; executions: Record<string, StoredExecution> };
export type AppliedPlanOutcome = { requestId: string; status: "applied"; changed: boolean; operationId: string | null; assignments: Assignment[];
  orderVersions: { orderId: string; version: number }[]; queueVersions: { groupId: string; version: number }[];
};
export type PlanOutcome = AppliedPlanOutcome | { requestId: string; status: "rejected"; error: { status: number; code: string } };
const intentPermission = (intent: PlanIntent): PermissionKey => intent.action === "create" ? "schedule.create" : "schedule.edit";
function requirePlanActor(actor: TrustedIdentity, permission: PermissionKey = "schedule.view") {
  for (const key of ["order.view", "schedule.view", permission] as PermissionKey[]) requirePermission(actor.permissions, key);
}
function bounded(value: unknown, code = "production_plan_preview_too_large") { if (Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024) planFail(422, code); }
export function planDraft(row: StoredAssignment): Draft {
  const { createdBy: _createdBy, updatedBy: _updatedBy, createdAt: _createdAt, updatedAt: _updatedAt, ...result } = row;
  void _createdBy; void _updatedBy; void _createdAt; void _updatedAt; return result;
}
function resourceSummary(facts: ResourceFacts) {
  return facts.executionType === "internal" ? { executionType: facts.executionType, group: { id: facts.group.id, name: facts.group.name, version: facts.group.version },
    site: { id: facts.site.id, name: facts.site.name, version: facts.site.version }, calendar: { id: facts.calendar.id, name: facts.calendar.name, version: facts.calendar.version } }
    : { executionType: facts.executionType, factory: { id: facts.factory.id, name: facts.factory.name, version: facts.factory.version } };
}
function previewProjection(build: PlanBuild, actor: TrustedIdentity) {
  const resources = new Map<string, ReturnType<typeof resourceSummary>>();
  const project = (row: Draft | StoredAssignment) => {
    resources.set(row.resourceSnapshotHash, resourceSummary(row.resourceFacts));
      const { resourceFacts: _facts, ...rest } = row; void _facts; return rest;
  };
  const changes = build.mutations.map(mutation => ({ before: mutation.before ? project(planDraft(mutation.before)) : null, after: project(mutation.after) }));
  const facts = Object.fromEntries(build.mutations.map(mutation => [mutation.after.resourceSnapshotHash, mutation.after.resourceFacts]));
  const fingerprint = { actorId: actor.userId, intent: build.intent, orders: build.orders,
    queues: build.queues.map(queue => ({ ...queue, assignments: queue.assignments.map(publicAssignment) })), executions: build.executions, changes, facts, warnings: build.warnings };
  bounded(fingerprint);
  const result = { intent: build.intent, previewHash: planHash(fingerprint),
    changes, resources: Object.fromEntries(resources), warnings: build.warnings,
    orderVersions: build.orders.map(order => ({ orderId: order.id, version: order.planVersion })),
    queueVersions: build.queues.map(queue => ({ groupId: queue.groupId, version: queue.version })) };
  bounded(result); return result;
}
export async function validateProductionOrder(client: PoolClient, id: string) {
  const order = await readOrderPlanFacts(client, id);
  if (order.effectiveOrderId !== id) planFail(409, "historical_duplicate_order_read_only");
  const business = await requireVerifiedOrderBusiness(client, id);
  if (["completed", "cancelled"].includes(business.lifecycle_state)) planFail(409, "production_order_frozen");
  if (order.planVersion >= 2147483647) planFail(409, "production_plan_version_exhausted");
  return order;
}
async function scope(client: PoolClient, intent: PlanIntent) {
  if (intent.action === "replan") return { orderIds: [...new Set((await assignmentsForGroup(client, intent.groupId)).map(row => row.orderId))].sort(), groupIds: [intent.groupId] };
  const before = intent.action === "create" ? null : await readAssignment(client, intent.assignmentId);
  if (before && before.orderId !== intent.orderId) planFail(409, "production_assignment_order_conflict");
  const newGroup = intent.action !== "cancel" && intent.data.executionType === "internal" ? intent.data.executorId : null;
  return { orderIds: [intent.orderId], groupIds: [...new Set([before?.productionGroupId, newGroup].filter((id): id is string => Boolean(id)))].sort() };
}
function plannedDates(data: PlanData, resources: ResourceFacts, requiredWorkdays: number, previousEnd: string | null) {
  if (data.dates.mode === "manual_fixed") return { plannedStartDate: data.dates.startDate, plannedEndDate: data.dates.endDate, firstProductionDate: null, nonWorkingDayCount: null };
  if (resources.executionType !== "internal") return planFail(409, "production_internal_calendar_required");
  try {
    return calculateScheduleDates({ startDate: previousEnd ?? data.dates.startDate, requiredWorkdays, calendar: resources.calendar,
      handoffStart: previousEnd !== null, scanLimit: SCHEDULE_PLANNING_LIMITS.scanDays });
  } catch (error) {
    if (error instanceof ScheduleScanLimitError) return planFail(422, "production_schedule_scan_limit"); throw error;
  }
}
function sum(values: readonly string[]): { n: bigint; scale: number } {
  const parts = values.map(value => { const [whole, fraction = ""] = value.split("."); return { n: BigInt(whole + fraction), scale: fraction.length }; });
  const scale = Math.max(0, ...parts.map(item => item.scale));
  return { n: parts.reduce((n, item) => n + item.n * BigInt(10) ** BigInt(scale - item.scale), BigInt(0)), scale };
}
function exceeds(values: readonly string[], target: string) {
  const total = sum(values), limit = sum([target]), scale = Math.max(total.scale, limit.scale);
  return total.n * BigInt(10) ** BigInt(scale - total.scale) > limit.n * BigInt(10) ** BigInt(scale - limit.scale);
}
async function buildPlan(client: PoolClient, intent: PlanIntent, freeze: boolean): Promise<PlanBuild> {
  const targetScope = await scope(client, intent);
  if (freeze && targetScope.orderIds.length) await freezePhysicalOrderGroups(client, targetScope.orderIds);
  const orders = [];
  for (const id of targetScope.orderIds) orders.push(intent.action === "replan" ? await readOrderPlanFacts(client, id) : await validateProductionOrder(client, id));
  const queues = [];
  for (const groupId of targetScope.groupIds) {
    const version = await groupPlanVersion(client, groupId);
    if (version >= 2147483647) planFail(409, "production_queue_version_exhausted");
    queues.push({ groupId, version, assignments: await assignmentsForGroup(client, groupId) });
  }
  const orderAssignments = intent.action === "replan" ? [] : await assignmentsForOrder(client, intent.orderId);
  const executions = await executionsForAssignments(client, [...new Set([...orderAssignments, ...queues.flatMap(queue => queue.assignments)].map(row => row.id))]);
  const result: PlanBuild = { intent, orders, queues, mutations: [], warnings: [], executions };
  if (intent.action === "replan") {
    const queue = queues[0]; if (queue.version !== intent.expectedQueueVersion) planFail(409, "production_queue_version_conflict");
    const resources = await currentResourceFacts(client, "internal", intent.groupId, freeze);
    if (resources.executionType !== "internal") return planFail(503, "production_resource_type_invalid");
    const ids = intent.orderedAssignmentIds;
    if (ids && (ids.length !== queue.assignments.length || ids.some(id => !queue.assignments.some(row => row.id === id)))) planFail(409, "production_queue_members_changed");
    const rows = queue.assignments.map((row, i) => ({ ...row, queueSequence: ids ? ids.indexOf(row.id) + 1 : row.queueSequence ?? i + 1 }));
    const readOnlyOrders = new Set(orders.filter(order => order.effectiveOrderId !== order.id || ["completed", "cancelled"].includes(order.lifecycleState)).map(order => order.id));
    const queueRow = (row: StoredAssignment) => {
      const value = executionQueueRow(row, executionFacts(executions[row.id]));
      return readOnlyOrders.has(row.orderId) && value.dateMode === "auto_queue" ? { ...value, dateMode: "manual_fixed" as const } : value;
    };
    let preview: ReturnType<typeof previewInternalQueue>;
    try {
      preview = previewInternalQueue({ queueVersion: queue.version, anchorDate: intent.anchorDate, resources,
        assignments: rows.map(queueRow) });
    } catch (error) {
      if (error instanceof Error && error.name === "SchedulePlanningError") return planFail(422, error.message); throw error;
    }
    result.warnings.push(...preview.warnings);
    for (const row of rows) {
      const before = queue.assignments.find(item => item.id === row.id)!;
      const dates = preview.changes.find(change => change.assignmentId === row.id)?.after;
      if (dates && (!dates.plannedStartDate || !dates.plannedEndDate)) return planFail(503, "production_plan_dates_invalid");
      const calculated = dates ? { plannedStartDate: dates.plannedStartDate!, plannedEndDate: dates.plannedEndDate!, firstProductionDate: dates.firstProductionDate, nonWorkingDayCount: dates.nonWorkingDayCount } : {};
      const protectedRow = queuePlanningRowIsProtected(queueRow(before));
      if (protectedRow && before.queueSequence !== row.queueSequence) planFail(409, "production_execution_queue_position_locked");
      const after: Draft = { ...planDraft(before), queueSequence: row.queueSequence,
        ...(!protectedRow ? { ...calculated, resourceFacts: resources, resourceSnapshotHash: planHash(resources) } : {}) };
      if (planHash(planDraft(before)) !== planHash(after)) {
        await validateProductionOrder(client, before.orderId);
        if (before.version >= 2147483647) planFail(409, "production_assignment_version_exhausted");
        after.version++; result.mutations.push({ before, after });
      }
    }
    return result;
  }
  const order = orders[0];
  if (order.planVersion !== intent.expectedPlanVersion) planFail(409, "production_order_plan_version_conflict");
  const existing = orderAssignments;
  const before = intent.action === "create" ? null : existing.find(row => row.id === intent.assignmentId);
  if (intent.action !== "create" && !before) return planFail(404, "production_assignment_not_found");
  if (before && (before.version !== intent.expectedVersion || before.status === "cancelled")) planFail(409, "production_assignment_version_conflict");
  if (before && before.version >= 2147483647) planFail(409, "production_assignment_version_exhausted");
  if (intent.action === "cancel") {
    if (executions[before!.id] && !intent.reason.trim()) planFail(409, "production_execution_reason_required");
    result.mutations.push({ before: before!, after: { ...planDraft(before!), version: before!.version + 1, status: "cancelled" } });
    if (before!.productionGroupId) result.warnings.push({ kind: "queue_replan_available", assignmentId: before!.id }); return result;
  }
  if (!before && existing.length >= SCHEDULE_PLANNING_LIMITS.queueRows) planFail(422, "production_order_plan_limit");
  const data = intent.data;
  const execution = before ? executionFacts(executions[before.id]) : null;
  if (before) assertExecutionAttributionUnchanged(before, data, execution);
  const executorUnchanged = before && before.executionType === data.executionType && (before.productionGroupId ?? before.outsourceFactoryId) === data.executorId;
  // Editing a saved plan keeps its adopted calendar. Only explicit replan or
  // selecting a different executor adopts current master facts.
  const resources = executorUnchanged ? before!.resourceFacts : await currentResourceFacts(client, data.executionType, data.executorId, freeze);
  const color = data.colorId === null ? null : order.colors.find(item => item.id === data.colorId);
  const historicalSameColor = before?.colorId === data.colorId && data.colorId !== null;
  if (data.colorId !== null && (!color || color.ambiguous) && !historicalSameColor) planFail(409, color?.ambiguous ? "order_color_identity_ambiguous" : "production_order_color_changed");
  if (historicalSameColor && (!color || color.ambiguous)) result.warnings.push({ kind: "historical_color_needs_review", assignmentId: before!.id });
  const duration = derivePlanDuration(data);
  const groupQueue = data.executionType === "internal" ? queues.find(queue => queue.groupId === data.executorId)! : null;
  if (groupQueue && !executorUnchanged && groupQueue.assignments.length >= SCHEDULE_PLANNING_LIMITS.queueRows) planFail(422, "production_queue_limit");
  const sequence = groupQueue ? executorUnchanged ? before!.queueSequence! : Math.max(0, ...groupQueue.assignments.map(row => row.queueSequence!)) + 1 : null;
  if (sequence !== null && !Number.isSafeInteger(sequence)) planFail(409, "production_queue_sequence_exhausted");
  const preceding = groupQueue ? executorUnchanged ? groupQueue.assignments.slice(0, groupQueue.assignments.findIndex(row => row.id === before!.id)) : groupQueue.assignments : [];
  const ends = preceding.map(row => executions[row.id]?.actualCompletedDate ?? row.plannedEndDate);
  const previousEnd = ends.length ? ends.reduce((end, value) => value > end ? value : end) : null;
  if (before && execution && data.dates.mode === "auto_queue" && data.dates.startDate !== before.plannedStartDate) planFail(409, "production_execution_auto_dates_locked");
  const dates = before && execution && data.dates.mode === "auto_queue" ? { plannedStartDate: before.plannedStartDate, plannedEndDate: before.plannedEndDate,
    firstProductionDate: before.firstProductionDate, nonWorkingDayCount: before.nonWorkingDayCount } : plannedDates(data, resources, duration.requiredWorkdays, previousEnd);
  const after: Draft = { id: before?.id ?? null, orderId: order.id, version: (before?.version ?? 0) + 1, executionType: data.executionType,
    productionGroupId: data.executionType === "internal" ? data.executorId : null, outsourceFactoryId: data.executionType === "outsource" ? data.executorId : null,
    colorId: data.colorId, colorNameSnapshot: data.colorId === null ? null : historicalSameColor ? before!.colorNameSnapshot : color!.colorName,
    plannedQuantity: data.plannedQuantity, durationMode: data.duration.mode, ...duration, dateMode: data.dates.mode, ...dates,
    queueSequence: sequence, resourceSnapshotHash: planHash(resources), resourceFacts: resources, status: "planned", remark: data.remark };
  if (data.dates.mode === "manual_fixed" && previousEnd && after.plannedStartDate < previousEnd) result.warnings.push({ kind: "protected_overlap", assignmentId: after.id, previousEndDate: previousEnd });
  if (before) {
    const sameVersion = { ...after, version: before.version };
    if (planHash(planDraft(before)) === planHash(sameVersion)) return result;
    if (execution && intent.action === "update" && !intent.reason.trim()) planFail(409, "production_execution_reason_required");
    if (queues.some(queue => queue.assignments.some(row => row.id !== before.id && row.queueSequence! > (before.queueSequence ?? Number.MAX_SAFE_INTEGER)))) result.warnings.push({ kind: "queue_replan_available", assignmentId: before.id });
  }
  const projected = [...existing.filter(row => row.id !== before?.id), after].map(row => ({ ...row, execution: row.id ? executionFacts(executions[row.id]) : null }));
  if (order.quantity !== null && exceeds([projectExecutionQuantities(projected).accountedQuantity], order.quantity)) result.warnings.push({ kind: "order_over_assigned", assignmentId: after.id, orderId: order.id });
  if (color && !color.ambiguous && exceeds([projectExecutionQuantities(projected.filter(row => row.colorId === color.id)).accountedQuantity], color.quantity)) result.warnings.push({ kind: "color_over_assigned", assignmentId: after.id, orderId: order.id });
  result.mutations.push({ before: before ?? null, after }); return result;
}
async function readTransaction<T>(pool: Pool, identity: TrustedIdentity, callback: (client: PoolClient, actor: TrustedIdentity) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const actor = await readCurrentActor(client, identity); requirePlanActor(actor); await productionPlansAvailable(client); await productionExecutionsAvailable(client);
    const result = await callback(client, actor); bounded(result, "production_plan_read_too_large"); await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function previewProductionPlan(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const intent = parsePlanIntent(raw);
  return readTransaction(pool, identity, async (client, actor) => { requirePlanActor(actor, intentPermission(intent)); return previewProjection(await buildPlan(client, intent, false), actor); });
}
export async function listProductionPlanOrders(pool: Pool, identity: TrustedIdentity, params = new URLSearchParams()) {
  const query = parsePlanListQuery(params, "orders");
  if (query.kind !== "orders") return planFail(400, "invalid_production_plan_query");
  return readTransaction(pool, identity, client => listPlanOrders(client, query));
}
export async function listProductionPlanGroups(pool: Pool, identity: TrustedIdentity, params = new URLSearchParams()) {
  const query = parsePlanListQuery(params, "groups");
  if (query.kind !== "groups") return planFail(400, "invalid_production_plan_query");
  return readTransaction(pool, identity, async (client, actor) => {
    const result = await listPlanGroups(client, query);
    return { ...result, items: result.items.map(item => ({ ...item, canCreate: actor.permissions.includes("schedule.create") && item.resourcesEnabled
      && item.assignmentCount < SCHEDULE_PLANNING_LIMITS.queueRows && item.queueVersion < 2147483647 })) };
  });
}
export async function readOrderProductionPlans(pool: Pool, identity: TrustedIdentity, inputId: string) {
  const id = productionResourceUuid(inputId);
  return readTransaction(pool, identity, async (client, actor) => {
    const order = await readOrderPlanFacts(client, id), assignments = await assignmentsForOrder(client, id), summary = (await readPlanOrderSummaries(client, [id]))[id];
    const writable = summary?.eligible === true && order.planVersion < 2147483647;
    return { order, summary, assignments: assignments.map(publicAssignment), resources: Object.fromEntries(assignments.map(row => [row.resourceSnapshotHash, resourceSummary(row.resourceFacts)])),
      executions: await executionsForAssignments(client, assignments.map(row => row.id)),
      canCreate: actor.permissions.includes("schedule.create") && writable,
      canEdit: actor.permissions.includes("schedule.edit") && writable,
      canComplete: actor.permissions.includes("schedule.complete") && writable };
  });
}
export async function readProductionQueue(pool: Pool, identity: TrustedIdentity, inputId: string) {
  const id = productionResourceUuid(inputId);
  return readTransaction(pool, identity, async client => {
    const group = await readProductionResourceSnapshot(client, "groups", id), assignments = await assignmentsForGroup(client, id);
    return { groupId: id, group: { id: group.id, name: group.name, version: group.version, enabled: group.enabled }, version: await groupPlanVersion(client, id),
      assignments: assignments.map(publicAssignment), resources: Object.fromEntries(assignments.map(row => [row.resourceSnapshotHash, resourceSummary(row.resourceFacts)])),
      executions: await executionsForAssignments(client, assignments.map(row => row.id)),
      ordersById: await readPlanOrderSummaries(client, [...new Set(assignments.map(row => row.orderId))]) };
  });
}
export async function readProductionAssignment(pool: Pool, identity: TrustedIdentity, inputId: string, offset = 0, asOfVersion: number | null = null) {
  const id = productionResourceUuid(inputId);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) planFail(400, "invalid_production_history_query");
  return readTransaction(pool, identity, async client => {
    const row = await readAssignment(client, id);
    const anchor = asOfVersion ?? row.version;
    if (!Number.isSafeInteger(anchor) || anchor < 1 || anchor > row.version) planFail(400, "invalid_production_history_query");
    const history = (await client.query(`SELECT version,snapshot,request_id::text AS "requestId",operation_id AS "operationId",reason,recorded_at AS "recordedAt"
      FROM production_schedule_plan_versions WHERE assignment_id=$1 AND version<=$3 ORDER BY version DESC LIMIT 51 OFFSET $2`, [id, offset, anchor])).rows;
    if (history.length > 50 && offset + 50 > 100000) planFail(422, "production_history_projection_limit");
    const page = history.slice(0, 50), hashes = [...new Set(page.map(item => String(item.snapshot.resource_snapshot_hash)))];
    const resources: Record<string, ReturnType<typeof resourceSummary>> = {};
    if (hashes.length) {
      const snapshots = (await client.query<{ hash: string; facts: ResourceFacts }>("SELECT hash,facts FROM production_schedule_resource_snapshots WHERE hash=ANY($1::text[])", [hashes])).rows;
      if (snapshots.length !== hashes.length) planFail(503, "production_resource_snapshot_invalid");
      for (const snapshot of snapshots) {
        if (planHash(snapshot.facts) !== snapshot.hash) planFail(503, "production_resource_snapshot_invalid");
        resources[snapshot.hash] = resourceSummary(snapshot.facts);
      }
    }
    return { assignment: publicAssignment(row), execution: (await executionsForAssignments(client, [row.id]))[row.id] ?? null, resourceSnapshot: row.resourceFacts, history: page, resources, offset, limit: 50,
      asOfVersion: anchor, hasMore: history.length > 50, nextOffset: history.length > 50 ? offset + 50 : null };
  });
}
function auditSnapshot(row: StoredAssignment, orderNo?: string) {
  const executor = row.resourceFacts.executionType === "internal" ? row.resourceFacts.group.name : row.resourceFacts.factory.name;
  return { orderId: row.orderId, objectName: orderNo ? `${orderNo} · ${executor}` : executor, scheduleAssignmentId: row.id, values: {
    执行类型: row.executionType === "internal" ? "内部生产" : "外发生产", 执行方: executor, 颜色: row.colorNameSnapshot,
    排单数量: row.plannedQuantity, 排单开始: row.plannedStartDate, 排单结束: row.plannedEndDate, 所需工作日: row.requiredWorkdays,
    每日产量: row.dailyOutputSnapshot, 日期方式: row.dateMode === "auto_queue" ? "队列计算" : "固定日期", 队列位置: row.queueSequence,
    状态: row.status === "planned" ? "已排单" : "已取消", 备注: row.remark,
  } };
}
export async function applyPlanBuild(client: PoolClient, actor: TrustedIdentity, command: PlanCommand, build: PlanBuild,
  context?: { operationId: string | null; sequenceStart: number; deferHeads: boolean }): Promise<AppliedPlanOutcome> {
  const operationId = context ? context.operationId : build.mutations.length ? createServerOperationId() : null, assignments: Assignment[] = [];
  for (const [index, mutation] of build.mutations.entries()) {
    const { after, before } = mutation;
    const color = build.orders.find(order => order.id === after.orderId)?.colors.find(row => row.id === after.colorId && !row.ambiguous);
    if (color && (!before || before.colorId !== color.id)) await ensureStableOrderColor(client, after.orderId, color);
    await storeResourceFacts(client, after.resourceFacts);
    const now = new Date().toISOString(), row: StoredAssignment = { ...after, id: after.id ?? randomUUID(), createdBy: before?.createdBy ?? actor.internalUserId,
      updatedBy: actor.internalUserId, createdAt: before?.createdAt ?? now, updatedAt: now };
    await persistAssignment(client, row, before === null);
    const saved = await readAssignment(client, row.id);
    await client.query(`INSERT INTO production_schedule_plan_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
      SELECT id,sales_order_id,version,production_plan_row_snapshot(a),$2,$3,$4,$5 FROM production_schedule_assignments a WHERE id=$1`,
    [saved.id, actor.internalUserId, command.requestId, operationId, command.intent.action === "update" || command.intent.action === "cancel" ? command.intent.reason : ""]);
    const orderNo = build.orders.find(order => order.id === saved.orderId)?.orderNo;
    await appendOperationLog(client, actor, { operationId: operationId!, operationSequence: index + (context?.sequenceStart ?? 0), module: "生产排单", entityType: "ScheduleAssignment", entityId: saved.id,
      action: command.intent.action === "create" ? "新增排单" : command.intent.action === "cancel" ? "取消排单" : command.intent.action === "replan" ? "队列重排" : "修改排单",
      beforeData: before ? auditSnapshot(before, orderNo) : null, afterData: auditSnapshot(saved, orderNo), metadata: { requestId: command.requestId, previewHash: command.previewHash, appliedVersion: saved.version,
        reason: command.intent.action === "update" || command.intent.action === "cancel" ? command.intent.reason : "" } });
    assignments.push(publicAssignment(saved));
  }
  const changedOrders = [...new Set(build.mutations.map(mutation => mutation.after.orderId))].sort();
  const changedGroups = build.mutations.length ? [...new Set(build.queues.map(queue => queue.groupId))].sort() : [];
  if (!context?.deferHeads) await bumpPlanHeads(client, changedOrders, changedGroups);
  const orderVersions = [], queueVersions = [];
  for (const order of build.orders) orderVersions.push({ orderId: order.id, version: await orderPlanVersion(client, order.id) });
  for (const queue of build.queues) queueVersions.push({ groupId: queue.groupId, version: await groupPlanVersion(client, queue.groupId) });
  return { requestId: command.requestId, status: "applied", changed: assignments.length > 0, operationId, assignments, orderVersions, queueVersions };
}
export async function executeProductionPlan(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const command = parsePlanCommand(raw);
  return runProductionCommand(pool, identity, command, ["order.view", "schedule.view", intentPermission(command.intent)], async (client, actor) => {
    await productionExecutionsAvailable(client);
    const build = await buildPlan(client, command.intent, true), projection = previewProjection(build, actor);
    if (projection.previewHash !== command.previewHash) planFail(409, "production_plan_preview_changed");
    return { result: await applyPlanBuild(client, actor, command, build), orderIds: build.orders.filter(order => order.effectiveOrderId === order.id).map(order => order.id) };
  });
}
export async function readProductionPlanReceipt(pool: Pool, identity: TrustedIdentity, inputId: string) {
  const requestId = productionResourceUuid(inputId), client = await pool.connect();
  try {
    await client.query("BEGIN"); const actor = await readCurrentActor(client, identity); requirePlanActor(actor); await productionPlansAvailable(client);
    if (!["schedule.create", "schedule.edit", "schedule.complete"].some(key => actor.permissions.includes(key as PermissionKey))) planFail(403, "permission_denied");
    const ready = (await client.query<{ ready: boolean }>("SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1,0)) ready", [productionRequestLock(actor, requestId)])).rows[0].ready;
    const row = ready ? (await client.query<{ command: unknown; payload_hash: string; result: PlanOutcome }>("SELECT command,payload_hash,result FROM production_schedule_commands WHERE actor_id=$1 AND request_id=$2", [actor.internalUserId, requestId])).rows[0] : null;
    if (row) requireProductionPermissions(actor, savedCommandPermissions(row.command));
    await client.query("COMMIT"); return row ? { state: "known" as const, requestId, result: { ...row.result, payloadHash: row.payload_hash } } : { state: ready ? "unknown" as const : "pending" as const, requestId, result: null };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

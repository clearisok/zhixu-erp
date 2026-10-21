import { canonicalPlanJson } from "../../../server/production-scheduling/canonical-json";
import { derivePlanDuration, parsePlanCommand, parsePlanIntent, planDecimal, type PlanCommand, type PlanIntent } from "../../../server/production-scheduling/contract";
import type { Assignment } from "../../../server/production-scheduling/repository";
import type { PlanOutcome, previewProductionPlan } from "../../../server/production-scheduling/service";
import { productionResourceDate, productionResourceUuid } from "../../../server/production-resources/contract";
import { ServerAuthError } from "../../server-auth/server-auth-client";
import { canonicalDecimal } from "../../../server/quotes/decimal-projection";
import { parsePlanListQuery, type PlanListQuery } from "../../../server/production-scheduling/read-contract";
import type { PlanOrderSummary } from "../../../server/production-scheduling/read-model";
import { parseExecutionData, parseExecutionIntent, type ExecutionCommand, type ExecutionIntent } from "../../../server/production-scheduling/execution-contract";
import type { ExecutionFacts } from "../../../server/production-scheduling/execution-preview";
import type { StoredExecution } from "../../../server/production-scheduling/execution-store";
import { parseProductionCommand, type ProductionCommand } from "./production-command";

export type { PlanCommand, PlanIntent, Assignment };
export type { ExecutionCommand, ExecutionIntent, StoredExecution, ProductionCommand };
export type { PlanOrderSummary, PlanListQuery };
export type PlanPreview = Awaited<ReturnType<typeof previewProductionPlan>>;
export type VerifiedPlanOutcome = PlanOutcome & { payloadHash: string };
export type PlanReceipt = { state: "known"; requestId: string; result: VerifiedPlanOutcome }
  | { state: "pending" | "unknown"; requestId: string; result: null };
export type VerifiedExecutionOutcome = Extract<VerifiedPlanOutcome, { status: "rejected" }> | {
  requestId: string; payloadHash: string; status: "applied"; changed: boolean; operationId: string | null;
  assignments: Assignment[]; execution: StoredExecution; assignmentId: string;
  orderVersions: { orderId: string; version: number }[]; queueVersions: { groupId: string; version: number }[];
};
export type ProductionReceipt = { state: "known"; requestId: string; result: VerifiedPlanOutcome | VerifiedExecutionOutcome }
  | { state: "pending" | "unknown"; requestId: string; result: null };
export type ExecutionPreview = { intent: ExecutionIntent; previewHash: string; before: ExecutionFacts | null; after: ExecutionFacts; changed: boolean;
  warnings: { kind: string; assignmentId: string }[]; planChanges: { before: Assignment; after: PlanDraft }[];
  orderVersions: { orderId: string; version: number }[]; queueVersions: { groupId: string; version: number }[] };
type Lease = () => boolean;
type PlanDraft = PlanPreview["changes"][number]["after"];
type ResourceSummary = PlanPreview["resources"][string];
export type PlanResources = Record<string, ResourceSummary>;
export type PlanGroupRow = { id: string; name: string; shortName: string; enabled: boolean; version: number; queueVersion: number;
  assignmentCount: number; pendingAssignmentCount: number; plannedQuantity: string; completedQuantity: string; outstandingPlannedQuantity: string; headAssignmentId: string | null; headOrderId: string | null;
  plannedThroughDate: string | null; siteName: string; calendarName: string; resourcesEnabled: boolean; canCreate: boolean };
export type PlanOrderRead = { summary: PlanOrderSummary; order: { id: string; orderNo: string; planVersion: number;
  colors: { id: string; colorName: string; quantity: string; ambiguous: boolean }[];
  deliveryPlans: { id: string; date: string | null; quantity: string }[] };
  assignments: Assignment[]; executions: Record<string, StoredExecution>; resources: PlanResources; canCreate: boolean; canEdit: boolean; canComplete: boolean };
export type PlanQueueRead = { groupId: string; group: { id: string; name: string; version: number; enabled: boolean }; version: number;
  assignments: Assignment[]; executions: Record<string, StoredExecution>; resources: PlanResources; ordersById: Record<string, PlanOrderSummary> };
export type ExecutionScope = { order: PlanOrderRead; assignment: Assignment; queue: PlanQueueRead | null };
export type ExecutionHistoryRead = { assignment: Assignment; execution: StoredExecution | null; asOfVersion: number; offset: number; hasMore: boolean; nextOffset: number | null;
  history: { version: number; requestId: string; operationId: string; reason: string; recordedAt: string;
    snapshot: ExecutionFacts & { assignmentVersion: number } }[] };
type Page<T> = { items: T[]; total: number; offset: number; limit: number; hasMore: boolean };
export type PlanOrderDirectory = Page<PlanOrderSummary>;
export type PlanGroupDirectory = Page<PlanGroupRow> & { ordersById: Record<string, PlanOrderSummary> };
export type PlanHistoryRead = { assignment: Assignment; resources: PlanResources; asOfVersion: number; offset: number; hasMore: boolean; nextOffset: number | null;
  history: { version: number; requestId: string; operationId: string; reason: string; recordedAt: string;
    snapshot: Pick<Assignment, "id" | "orderId" | "version" | "plannedQuantity" | "plannedStartDate" | "plannedEndDate" | "resourceSnapshotHash" | "status" | "remark" | "colorNameSnapshot"> }[] };

const messages: Record<string, string> = {
  invalid_production_execution_intent: "请检查累计完成数量、执行状态和实际日期。",
  production_executions_unavailable: "生产执行暂时不可用，请重新读取。",
  production_execution_version_conflict: "本条实际进度已更新，请重新读取后预览。",
  production_execution_preview_changed: "实际进度、订单或后续队列已变化，请重新读取后预览。",
  production_execution_reason_required: "减少完成量、更正已记录日期、重新打开或修改已取消排单时，请填写说明。",
  production_execution_attribution_locked: "已有实际记录，不能更换执行方或颜色；请为剩余任务新增排单。",
  production_execution_auto_dates_locked: "已有实际记录，自动排期不会移动；请核对原记录。",
  production_execution_queue_position_locked: "已有实际记录的排单不能移动队列位置。",
  production_execution_queue_changed: "后续队列已变化，请重新读取后预览。",
  production_cancelled_assignment_has_no_execution: "已取消的排单不能新增实际记录。",
  production_internal_queue_required: "只有未取消的内部排单可联动后续队列。",
  production_execution_snapshot_invalid: "实际记录无法安全核对，请联系管理员。",
  production_execution_projection_limit: "本次实际记录过多，请缩小范围。",
  production_execution_preview_too_large: "本次完成与重排预览过大，请缩小范围。",
  production_execution_read_too_large: "本次实际历史过多，请缩小范围。",
  invalid_production_plan_intent: "请检查执行方、数量、工期和日期。",
  production_plans_unavailable: "生产排单暂时不可用，请重新读取。",
  production_order_frozen: "这张订单已完成或取消，不能修改排单。",
  historical_duplicate_order_read_only: "这张历史订单仅可查看，请使用当前有效订单。",
  production_assignment_not_found: "这条排单不存在，请重新读取。",
  sales_order_not_found: "这张订单不存在，请重新读取。",
  production_plan_preview_changed: "订单、来源或队列已变化，请重新预览后确认。",
  production_order_plan_version_conflict: "这张订单的排单已更新，请重新读取。",
  production_assignment_version_conflict: "这条排单已更新或取消，请重新读取。",
  production_queue_version_conflict: "生产组队列已更新，请重新读取。",
  production_queue_members_changed: "队列成员已变化，请重新读取完整队列。",
  production_plan_request_conflict: "原请求内容不一致，请先核对原操作。",
  production_order_color_changed: "订单颜色已变化，请重新选择。",
  order_color_identity_ambiguous: "来源颜色无法唯一识别，请先核对。",
  production_resources_disabled: "所选生产组、地点或日历已停用，请重新选择。",
  production_factory_disabled: "所选外发厂已停用，请重新选择。",
  production_schedule_scan_limit: "排期超出本次计算范围，请缩小范围。",
  production_schedule_duration_too_long: "工期超出支持范围，请检查数量和日产量。",
  production_queue_limit: "这个生产组的队列过长，请缩小范围。",
  production_order_plan_limit: "这张订单的排单过多，请先核对。",
  production_delivery_projection_limit: "这张订单的交期明细过多，请先核对。",
  production_plan_preview_too_large: "本次排单预览过大，请缩小范围。",
  production_plan_receipt_too_large: "本次排单保存范围过大，未应用变更，请缩小范围。",
  invalid_production_plan_query: "请检查搜索和分页条件。",
  invalid_production_history_query: "历史读取条件已变化，请重新打开历史。",
  production_order_projection_limit: "匹配订单过多，请缩小筛选范围。",
  production_group_projection_limit: "匹配生产组过多，请增加搜索关键词。",
  production_history_projection_limit: "本次历史范围过大，请联系管理员核对。",
  production_plan_read_too_large: "本次资料较多，无法安全读取，请缩小范围。",
  plan_client_unavailable: "当前浏览器无法安全核对请求，请使用受支持的安全访问入口。",
  plan_response_invalid: "返回的排单资料无法安全核对，已保留原请求。",
  plan_receipt_mismatch: "核对结果与原请求不一致，已保留原请求。",
  plan_owner_changed: "登录状态已变化；原请求仍保留，请重新读取后核对。",
  plan_outcome_unknown: "保存结果尚未确认，请核对原请求；不会自动重试。",
  plan_known_rejection: "本次排单未应用，请核对资料后重新预览。",
};
export class ProductionPlanError extends ServerAuthError {
  constructor(status: number, code: string, readonly knownNotApplied = false) { super(status, code, messages[code]); }
}
const invalid = (): never => { throw new ProductionPlanError(502, "plan_response_invalid"); };
const mismatch = (): never => { throw new ProductionPlanError(502, "plan_receipt_mismatch"); };
const assertLease = (current: Lease) => { if (!current()) throw new ProductionPlanError(0, "plan_owner_changed"); };
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) return invalid(); return value as number; }
function text(value: unknown, max = 2000): string { if (typeof value !== "string" || value.length > max || value.includes("\0")) return invalid(); return value; }
function uuid(value: unknown) { try { return productionResourceUuid(value); } catch { return invalid(); } }
function date(value: unknown) { try { return productionResourceDate(value); } catch { return invalid(); } }
function decimal(value: unknown, positive = false) { try { return planDecimal(value, positive); } catch { return invalid(); } }
function hash(value: unknown): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) return invalid(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") return invalid(); return value; }
function timestamp(value: unknown): string { const result = text(value, 30); if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) return invalid(); return result; }
function array(value: unknown, max = 500): unknown[] { if (!Array.isArray(value) || value.length > max) return invalid(); return value; }
function unique<T>(items: T[], id: (item: T) => string): T[] { if (new Set(items.map(id)).size !== items.length) return invalid(); return items; }

export function canonicalProductionPlanCommand(value: unknown): PlanCommand {
  try { return parsePlanCommand(value); } catch { throw new ProductionPlanError(400, "invalid_production_plan_intent", true); }
}
export function canonicalProductionCommand(value: unknown): ProductionCommand {
  try { return parseProductionCommand(value); } catch { throw new ProductionPlanError(400,
    (value as { intent?: { action?: unknown } } | null)?.intent?.action === "record_execution" ? "invalid_production_execution_intent" : "invalid_production_plan_intent", true); }
}
export async function productionPlanFingerprint(value: ProductionCommand): Promise<string> {
  const command = canonicalProductionCommand(value);
  if (!globalThis.crypto?.subtle) throw new ProductionPlanError(0, "plan_client_unavailable");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPlanJson(command)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
function draft(value: unknown, newIdentity = false): PlanDraft {
  const raw = object(value), executionType = raw.executionType, dateMode = raw.dateMode, durationMode = raw.durationMode;
  if (!["internal", "outsource"].includes(executionType as string) || !["auto_queue", "manual_fixed"].includes(dateMode as string)
    || !["average_daily_output", "workdays"].includes(durationMode as string) || !["planned", "cancelled"].includes(raw.status as string)) return invalid();
  const productionGroupId = raw.productionGroupId === null ? null : uuid(raw.productionGroupId);
  const outsourceFactoryId = raw.outsourceFactoryId === null ? null : uuid(raw.outsourceFactoryId);
  const colorId = raw.colorId === null ? null : uuid(raw.colorId), colorNameSnapshot = raw.colorNameSnapshot === null ? null : text(raw.colorNameSnapshot);
  if ((colorId === null) !== (colorNameSnapshot === null)
    || (executionType === "internal" ? !productionGroupId || outsourceFactoryId !== null : !outsourceFactoryId || productionGroupId !== null || dateMode !== "manual_fixed")) return invalid();
  const plannedQuantity = decimal(raw.plannedQuantity), dailyOutputSnapshot = decimal(raw.dailyOutputSnapshot, durationMode === "average_daily_output");
  const requiredWorkdays = integer(raw.requiredWorkdays, 1, 36600), plannedStartDate = date(raw.plannedStartDate), plannedEndDate = date(raw.plannedEndDate);
  const firstProductionDate = raw.firstProductionDate === null ? null : date(raw.firstProductionDate);
  const nonWorkingDayCount = raw.nonWorkingDayCount === null ? null : integer(raw.nonWorkingDayCount);
  const queueSequence = raw.queueSequence === null ? null : integer(raw.queueSequence, 1);
  if (plannedEndDate < plannedStartDate || (firstProductionDate !== null && (firstProductionDate < plannedStartDate || firstProductionDate > plannedEndDate))
    || (dateMode === "manual_fixed" ? firstProductionDate !== null || nonWorkingDayCount !== null : firstProductionDate === null || nonWorkingDayCount === null)
    || (executionType === "internal" ? queueSequence === null : queueSequence !== null)) return invalid();
  const derived = derivePlanDuration({ plannedQuantity, duration: durationMode === "workdays" ? { mode: "workdays", workdays: requiredWorkdays } : { mode: "average_daily_output", dailyOutput: dailyOutputSnapshot } });
  if (derived.requiredWorkdays !== requiredWorkdays || derived.dailyOutputSnapshot !== dailyOutputSnapshot) return invalid();
  return { id: raw.id === null && newIdentity ? null : uuid(raw.id), orderId: uuid(raw.orderId), version: integer(raw.version, 1),
    executionType: executionType as PlanDraft["executionType"], productionGroupId, outsourceFactoryId, colorId, colorNameSnapshot,
    plannedQuantity, durationMode: durationMode as PlanDraft["durationMode"], dailyOutputSnapshot, requiredWorkdays,
    dateMode: dateMode as PlanDraft["dateMode"], plannedStartDate, plannedEndDate, firstProductionDate, nonWorkingDayCount, queueSequence,
    resourceSnapshotHash: hash(raw.resourceSnapshotHash), status: raw.status as PlanDraft["status"], remark: text(raw.remark) };
}
function assignment(value: unknown): Assignment {
  const raw = object(value), item = draft(raw);
  const actor = (v: unknown) => { if (typeof v !== "string" || !/^[1-9]\d{0,18}$/u.test(v)) return invalid(); return v; };
  return { ...item, id: uuid(item.id), createdBy: actor(raw.createdBy), updatedBy: actor(raw.updatedBy), createdAt: timestamp(raw.createdAt), updatedAt: timestamp(raw.updatedAt) };
}
function summary(value: unknown): ResourceSummary {
  const raw = object(value), reference = (v: unknown) => { const row = object(v); return { id: uuid(row.id), name: text(row.name), version: integer(row.version, 1) }; };
  if (raw.executionType === "internal") return { executionType: "internal", group: reference(raw.group), site: reference(raw.site), calendar: reference(raw.calendar) };
  if (raw.executionType === "outsource") return { executionType: "outsource", factory: reference(raw.factory) };
  return invalid();
}
function versions(value: unknown, key: "orderId" | "groupId") {
  return unique(array(value).map(v => { const raw = object(v); return { id: uuid(raw[key]), version: integer(raw.version) }; }), row => row.id);
}
function readDecimal(value: unknown) {
  if (typeof value !== "string" || value.length > 2000 || !/^\d+(?:\.\d+)?$/u.test(value)) return invalid();
  try { return canonicalDecimal(value); } catch { return invalid(); }
}
const optionalText = (value: unknown) => value === null ? null : text(value);
const optionalDate = (value: unknown) => value === null ? null : date(value);
const optionalUuid = (value: unknown) => value === null ? null : uuid(value);
function projectOrderSummary(value: unknown): PlanOrderSummary {
  const raw = object(value), businessType = raw.businessType, lifecycleState = text(raw.lifecycleState, 30), allocationState = raw.allocationState;
  if (!["ainuoke_contract", "processing", "unclassified"].includes(businessType as string)
    || !["draft", "confirmed", "active", "completed", "cancelled"].includes(lifecycleState)
    || !["unassigned", "partial", "allocated", "overassigned", "unknown"].includes(allocationState as string)) return invalid();
  const id = uuid(raw.id), effectiveOrderId = uuid(raw.effectiveOrderId), eligible = boolean(raw.eligible);
  const quantity = raw.quantity === null ? null : readDecimal(raw.quantity), remainingQuantity = raw.remainingQuantity === null ? null : readDecimal(raw.remainingQuantity);
  const overassignedQuantity = raw.overassignedQuantity === null ? null : readDecimal(raw.overassignedQuantity);
  if ((quantity === null ? remainingQuantity !== null || overassignedQuantity !== null || allocationState !== "unknown" : remainingQuantity === null || overassignedQuantity === null || allocationState === "unknown")
    || eligible && (id !== effectiveOrderId || businessType === "unclassified" || ["completed", "cancelled"].includes(lifecycleState))) return invalid();
  return { id, effectiveOrderId, eligible, orderNo: text(raw.orderNo), lifecycleState, businessType: businessType as PlanOrderSummary["businessType"],
    quantity, plannedQuantity: readDecimal(raw.plannedQuantity), completedQuantity: readDecimal(raw.completedQuantity), outstandingPlannedQuantity: readDecimal(raw.outstandingPlannedQuantity),
    accountedQuantity: readDecimal(raw.accountedQuantity), remainingQuantity, overassignedQuantity, allocationState: allocationState as PlanOrderSummary["allocationState"],
    assignmentCount: integer(raw.assignmentCount), planVersion: integer(raw.planVersion, 0, 2147483647), styleNo: optionalText(raw.styleNo), factoryStyleNo: optionalText(raw.factoryStyleNo),
    customerName: optionalText(raw.customerName), brandName: optionalText(raw.brandName), contractNo: optionalText(raw.contractNo), customerReference: optionalText(raw.customerReference), deliveryDate: optionalDate(raw.deliveryDate) };
}
function projectOrdersById(value: unknown, ids: readonly string[]) {
  const raw = object(value), result: Record<string, PlanOrderSummary> = {};
  if (Object.keys(raw).length !== ids.length || ids.some(id => !Object.hasOwn(raw, id))) return mismatch();
  for (const id of ids) { const row = projectOrderSummary(raw[id]); if (row.id !== id) return mismatch(); result[id] = row; }
  return result;
}
function projectResources(value: unknown, rows: readonly Pick<Assignment, "resourceSnapshotHash" | "executionType" | "productionGroupId" | "outsourceFactoryId">[]) {
  const result = Object.fromEntries(Object.entries(object(value)).map(([key, row]) => [hash(key), summary(row)]));
  if (Object.keys(result).length > 500) return invalid();
  for (const row of rows) {
    const resource = result[row.resourceSnapshotHash];
    if (!resource || resource.executionType !== row.executionType || (resource.executionType === "internal" ? resource.group.id !== row.productionGroupId : resource.factory.id !== row.outsourceFactoryId)) return mismatch();
  }
  return result;
}
function projectPage<T>(raw: Record<string, unknown>, query: Pick<PlanListQuery, "offset" | "limit">, project: (value: unknown) => T) {
  const items = array(raw.items, query.limit).map(project), total = integer(raw.total), hasMore = boolean(raw.hasMore);
  if (integer(raw.offset) !== query.offset || integer(raw.limit, 1, 100) !== query.limit || query.offset + items.length > total && items.length > 0
    || hasMore !== (query.offset + items.length < total) || hasMore && (items.length !== query.limit || query.offset + items.length > 100000)) return mismatch();
  return { items, total, offset: query.offset, limit: query.limit, hasMore };
}
function matchesData(row: PlanDraft, intent: Exclude<PlanIntent, { action: "replan" | "cancel" }>) {
  const data = intent.data, expected = derivePlanDuration(data);
  return row.orderId === intent.orderId && row.executionType === data.executionType && (row.productionGroupId ?? row.outsourceFactoryId) === data.executorId
    && row.colorId === data.colorId && row.plannedQuantity === data.plannedQuantity && row.durationMode === data.duration.mode
    && row.dailyOutputSnapshot === expected.dailyOutputSnapshot && row.requiredWorkdays === expected.requiredWorkdays && row.dateMode === data.dates.mode
    && (data.dates.mode !== "manual_fixed" || (row.plannedStartDate === data.dates.startDate && row.plannedEndDate === data.dates.endDate)) && row.remark === data.remark;
}
function projectPreview(value: unknown, intent: PlanIntent): PlanPreview {
  const raw = object(value); let responseIntent: PlanIntent;
  try { responseIntent = parsePlanIntent(raw.intent); } catch { return invalid(); }
  if (canonicalPlanJson(responseIntent) !== canonicalPlanJson(intent)) return mismatch();
  const resources = Object.fromEntries(Object.entries(object(raw.resources)).map(([key, val]) => [hash(key), summary(val)]));
  const changes = array(raw.changes).map(value => {
    const change = object(value), before = change.before === null ? null : draft(change.before), after = draft(change.after, intent.action === "create");
    if ((!before && intent.action !== "create") || (before && (before.id !== after.id || before.orderId !== after.orderId || before.version + 1 !== after.version))) return invalid();
    for (const row of [before, after]) if (row) {
      const fact = resources[row.resourceSnapshotHash];
      if (!fact || fact.executionType !== row.executionType || (fact.executionType === "internal" ? fact.group?.id !== row.productionGroupId : fact.factory?.id !== row.outsourceFactoryId)) return invalid();
    }
    if (intent.action === "replan") { if (after.productionGroupId !== intent.groupId || after.status !== "planned" || (intent.orderedAssignmentIds && !intent.orderedAssignmentIds.includes(after.id!))) return mismatch(); }
    else if (after.orderId !== intent.orderId || (intent.action === "create" ? before !== null || after.id !== null || after.version !== 1 : after.id !== intent.assignmentId || before?.version !== intent.expectedVersion)) return mismatch();
    if (intent.action === "cancel" ? after.status !== "cancelled" : after.status !== "planned") return mismatch();
    if ((intent.action === "create" || intent.action === "update") && !matchesData(after, intent)) return mismatch();
    return { before, after };
  });
  unique(changes, change => change.after.id ?? "new");
  if ((intent.action === "create" || intent.action === "cancel") && changes.length !== 1 || intent.action === "update" && changes.length > 1) return mismatch();
  const warningKinds = ["protected_overlap", "protected_end_missing", "queue_replan_available", "historical_color_needs_review", "order_over_assigned", "color_over_assigned"];
  const warnings = array(raw.warnings, 2000).map(value => { const row = object(value); if (!warningKinds.includes(row.kind as string)) return invalid();
    return { kind: row.kind as string, assignmentId: row.assignmentId === null ? null : uuid(row.assignmentId),
      ...(Object.hasOwn(row, "orderId") ? { orderId: uuid(row.orderId) } : {}), ...(Object.hasOwn(row, "previousEndDate") ? { previousEndDate: row.previousEndDate === null ? null : date(row.previousEndDate) } : {}) }; });
  const orderVersions = versions(raw.orderVersions, "orderId").map(row => ({ orderId: row.id, version: row.version }));
  const queueVersions = versions(raw.queueVersions, "groupId").map(row => ({ groupId: row.id, version: row.version }));
  if (changes.some(change => !orderVersions.some(row => row.orderId === change.after.orderId)
    || [change.before, change.after].some(item => item?.productionGroupId && !queueVersions.some(row => row.groupId === item.productionGroupId)))) return mismatch();
  if (intent.action === "replan" ? queueVersions.find(row => row.groupId === intent.groupId)?.version !== intent.expectedQueueVersion
    : orderVersions.length !== 1 || orderVersions[0].orderId !== intent.orderId || orderVersions[0].version !== intent.expectedPlanVersion) return mismatch();
  return { intent: responseIntent, previewHash: hash(raw.previewHash), changes, resources, warnings, orderVersions, queueVersions };
}
function projectOutcome(value: unknown, command: PlanCommand, fingerprint: string): VerifiedPlanOutcome {
  const raw = object(value); if (raw.requestId !== command.requestId || raw.payloadHash !== fingerprint) return mismatch();
  if (raw.status === "rejected") {
    const error = object(raw.error); if (![404, 409, 422].includes(error.status as number) || typeof error.code !== "string") return invalid();
    const code = Object.hasOwn(messages, error.code) ? error.code : "plan_known_rejection";
    return { status: "rejected", requestId: command.requestId, payloadHash: fingerprint, error: { status: error.status as number, code } };
  }
  if (raw.status !== "applied") return invalid();
  const changed = boolean(raw.changed), assignments = unique(array(raw.assignments).map(assignment), row => row.id), intent = command.intent;
  if (changed !== (assignments.length > 0) || (changed ? typeof raw.operationId !== "string" || !raw.operationId.startsWith("operation-") || raw.operationId !== "operation-" + uuid(raw.operationId.slice(10)) : raw.operationId !== null)) return invalid();
  if (intent.action === "replan") {
    if (assignments.some(row => row.productionGroupId !== intent.groupId || row.status !== "planned" || (intent.orderedAssignmentIds && !intent.orderedAssignmentIds.includes(row.id)))) return mismatch();
  } else {
    if ((intent.action === "create" || intent.action === "cancel") && assignments.length !== 1 || assignments.length > 1) return mismatch();
    const row = assignments[0];
    if (row && (row.orderId !== intent.orderId || row.version !== intent.expectedVersion + 1 || (intent.action !== "create" && row.id !== intent.assignmentId)
      || (intent.action === "cancel" ? row.status !== "cancelled" : row.status !== "planned" || !matchesData(row, intent)))) return mismatch();
  }
  const orderVersions = versions(raw.orderVersions, "orderId").map(row => ({ orderId: row.id, version: row.version }));
  const queueVersions = versions(raw.queueVersions, "groupId").map(row => ({ groupId: row.id, version: row.version }));
  if (assignments.some(item => !orderVersions.some(row => row.orderId === item.orderId)
    || item.productionGroupId && !queueVersions.some(row => row.groupId === item.productionGroupId))) return mismatch();
  if (intent.action === "replan" ? queueVersions.find(row => row.groupId === intent.groupId)?.version !== intent.expectedQueueVersion + Number(changed)
    : orderVersions.length !== 1 || orderVersions[0].orderId !== intent.orderId || orderVersions[0].version !== intent.expectedPlanVersion + Number(changed)) return mismatch();
  return { requestId: command.requestId, payloadHash: fingerprint, status: "applied", changed, assignments, orderVersions, queueVersions, operationId: raw.operationId as string | null };
}

function facts(value: unknown): ExecutionFacts {
  const raw = object(value);
  try { return { ...parseExecutionData({ status: raw.status, completedQuantity: raw.completedQuantity, actualStartDate: raw.actualStartDate, actualCompletedDate: raw.actualCompletedDate }), version: integer(raw.version, 1, 2147483647) }; }
  catch { return invalid(); }
}
function execution(value: unknown, plan?: Assignment): StoredExecution {
  const raw = object(value), attr = object(raw.attribution), data = facts(raw), executionType = attr.executionType;
  if (executionType !== "internal" && executionType !== "outsource") return invalid();
  const assignmentId = uuid(raw.assignmentId), orderId = uuid(raw.orderId), assignmentVersion = integer(raw.assignmentVersion, 1, 2147483647);
  const attribution: StoredExecution["attribution"] = { assignmentId: uuid(attr.assignmentId), orderId: uuid(attr.orderId), executionType,
    productionGroupId: optionalUuid(attr.productionGroupId), outsourceFactoryId: optionalUuid(attr.outsourceFactoryId),
    colorId: optionalUuid(attr.colorId), colorNameSnapshot: optionalText(attr.colorNameSnapshot), resourceSnapshotHash: hash(attr.resourceSnapshotHash) };
  if (attribution.assignmentId !== assignmentId || attribution.orderId !== orderId
    || (attribution.colorId === null) !== (attribution.colorNameSnapshot === null)
    || (executionType === "internal" ? !attribution.productionGroupId || attribution.outsourceFactoryId !== null : !attribution.outsourceFactoryId || attribution.productionGroupId !== null)) return mismatch();
  if (plan && (assignmentId !== plan.id || orderId !== plan.orderId || assignmentVersion > plan.version
    || canonicalPlanJson(attribution) !== canonicalPlanJson({ assignmentId: plan.id, orderId: plan.orderId, executionType: plan.executionType,
      productionGroupId: plan.productionGroupId, outsourceFactoryId: plan.outsourceFactoryId, colorId: plan.colorId,
      colorNameSnapshot: plan.colorNameSnapshot, resourceSnapshotHash: plan.resourceSnapshotHash }))) return mismatch();
  const createdAt = timestamp(raw.createdAt), updatedAt = timestamp(raw.updatedAt);
  if (updatedAt < createdAt) return invalid();
  return { ...data, assignmentId, orderId, assignmentVersion, attribution, createdAt, updatedAt };
}
function projectExecutions(value: unknown, rows: readonly Assignment[]): Record<string, StoredExecution> {
  const raw = object(value), result: Record<string, StoredExecution> = {};
  if (Object.keys(raw).length > rows.length) return mismatch();
  for (const [id, value] of Object.entries(raw)) {
    const row = rows.find(item => item.id === id); if (!row) return mismatch();
    const item = execution(value, row); if (item.assignmentId !== id) return mismatch(); result[id] = item;
  }
  return result;
}
const executionFactsOnly = (row: StoredExecution | null | undefined): ExecutionFacts | null => row ? {
  version: row.version, status: row.status, completedQuantity: row.completedQuantity, actualStartDate: row.actualStartDate, actualCompletedDate: row.actualCompletedDate,
} : null;
function projectExecutionPreview(value: unknown, intent: ExecutionIntent, scope: ExecutionScope): ExecutionPreview {
  const raw = object(value); let responseIntent: ExecutionIntent;
  try { responseIntent = parseExecutionIntent(raw.intent); } catch { return invalid(); }
  const row = scope.assignment;
  if (canonicalPlanJson(responseIntent) !== canonicalPlanJson(intent) || row.id !== intent.assignmentId || row.orderId !== intent.orderId
    || row.version !== intent.expectedAssignmentVersion || scope.order.order.planVersion !== intent.expectedPlanVersion) return mismatch();
  const before = raw.before === null ? null : facts(raw.before), after = facts(raw.after), changed = boolean(raw.changed);
  const expected = executionFactsOnly(scope.order.executions[row.id]);
  if (canonicalPlanJson(before) !== canonicalPlanJson(expected) || (before?.version ?? 0) !== intent.expectedExecutionVersion
    || after.version !== intent.expectedExecutionVersion + Number(changed)
    || canonicalPlanJson(after) !== canonicalPlanJson({ ...intent.data, version: after.version })
    || changed !== (before === null || canonicalPlanJson({ ...intent.data, version: before.version }) !== canonicalPlanJson(before))) return mismatch();
  const queue = scope.queue, replannable = unique(array(raw.replannableAssignmentIds).map(uuid), id => id);
  const target = queue?.assignments.findIndex(item => item.id === row.id) ?? -1;
  if (intent.replan ? !queue || raw.queuePreview === null || target < 0 || queue.groupId !== row.productionGroupId || queue.version !== intent.replan.expectedQueueVersion
    || queue.ordersById[intent.orderId]?.planVersion !== intent.expectedPlanVersion : raw.queuePreview !== null || replannable.length > 0) return mismatch();
  const eligibleIds = new Set(queue?.assignments.slice(target + 1).filter(item => item.status === "planned" && item.dateMode === "auto_queue"
    && !queue.executions[item.id] && queue.ordersById[item.orderId]?.eligible).map(item => item.id) ?? []);
  if (replannable.some(id => !eligibleIds.has(id))) return mismatch();
  const planChanges = unique(array(raw.planChanges).map(value => {
    const item = object(value), before = assignment(item.before), after = draft(item.after);
    const current = queue?.assignments.find(item => item.id === before.id);
    if (!intent.replan || !current || !replannable.includes(before.id) || canonicalPlanJson(before) !== canonicalPlanJson(current)
      || after.id !== before.id || after.version !== before.version + 1 || after.status !== "planned") return mismatch();
    // Completion may only re-date and explicitly refresh resources of unstarted later plans.
    const stable = (value: PlanDraft) => { const { version: _version, plannedStartDate: _start, plannedEndDate: _end, firstProductionDate: _first,
      nonWorkingDayCount: _days, resourceSnapshotHash: _hash, ...rest } = value; void _version; void _start; void _end; void _first; void _days; void _hash; return rest; };
    const { createdBy: _createdBy, updatedBy: _updatedBy, createdAt: _createdAt, updatedAt: _updatedAt, ...oldDraft } = before;
    void _createdBy; void _updatedBy; void _createdAt; void _updatedAt;
    if (canonicalPlanJson(stable(oldDraft)) !== canonicalPlanJson(stable(after))) return mismatch();
    return { before, after };
  }), item => item.before.id);
  const orderVersions = versions(raw.orderVersions, "orderId").map(item => ({ orderId: item.id, version: item.version }));
  const expectedOrders = intent.replan ? [...new Set(queue!.assignments.map(item => item.orderId))] : [intent.orderId];
  if (orderVersions.length !== expectedOrders.length || expectedOrders.some(id => !orderVersions.some(item => item.orderId === id
    && item.version === (id === intent.orderId ? intent.expectedPlanVersion : queue!.ordersById[id].planVersion)))) return mismatch();
  const queueVersions = versions(raw.queueVersions, "groupId").map(item => ({ groupId: item.id, version: item.version }));
  if (row.productionGroupId ? queueVersions.length !== 1 || queueVersions[0].groupId !== row.productionGroupId
    || intent.replan && queueVersions[0].version !== intent.replan.expectedQueueVersion : queueVersions.length !== 0) return mismatch();
  const warnings = array(raw.warnings).map(value => { const item = object(value); if (item.kind !== "production_over_completed" || uuid(item.assignmentId) !== row.id) return invalid(); return { kind: item.kind, assignmentId: row.id }; });
  if (raw.queuePreview !== null) {
    const preview = object(raw.queuePreview);
    for (const item of array(preview.warnings)) { const warning = object(item), id = uuid(warning.assignmentId);
      if (!["protected_overlap", "protected_end_missing"].includes(warning.kind as string) || !queue?.assignments.some(row => row.id === id)) return invalid();
      warnings.push({ kind: warning.kind as string, assignmentId: id });
    }
  }
  return { intent: responseIntent, previewHash: hash(raw.previewHash), before, after, changed, warnings, planChanges, orderVersions, queueVersions };
}
function projectExecutionOutcome(value: unknown, command: ExecutionCommand, fingerprint: string): VerifiedExecutionOutcome {
  const raw = object(value);
  if (raw.requestId !== command.requestId || raw.payloadHash !== fingerprint) return mismatch();
  if (raw.status === "rejected") {
    const error = object(raw.error); if (![404, 409, 422].includes(error.status as number) || typeof error.code !== "string") return invalid();
    return { status: "rejected", requestId: command.requestId, payloadHash: fingerprint,
      error: { status: error.status as number, code: Object.hasOwn(messages, error.code) ? error.code : "plan_known_rejection" } };
  }
  if (raw.status !== "applied") return invalid();
  const intent = command.intent, saved = execution(raw.execution), assignments = unique(array(raw.assignments).map(assignment), row => row.id);
  const executionChanged = saved.version === intent.expectedExecutionVersion + 1, changed = boolean(raw.changed);
  if (uuid(raw.assignmentId) !== intent.assignmentId || saved.assignmentId !== intent.assignmentId || saved.orderId !== intent.orderId
    || saved.assignmentVersion > intent.expectedAssignmentVersion || executionChanged && saved.assignmentVersion !== intent.expectedAssignmentVersion
    || !executionChanged && saved.version !== intent.expectedExecutionVersion
    || canonicalPlanJson(executionFactsOnly(saved)) !== canonicalPlanJson({ ...intent.data, version: saved.version })
    || changed !== (executionChanged || assignments.length > 0)
    || (changed ? raw.operationId !== "operation-" + uuid(typeof raw.operationId === "string" ? raw.operationId.slice(10) : null) : raw.operationId !== null)) return mismatch();
  const group = saved.attribution.productionGroupId;
  if (assignments.some(row => !intent.replan || !group || row.productionGroupId !== group || row.id === saved.assignmentId || row.executionType !== "internal" || row.dateMode !== "auto_queue" || row.status !== "planned")) return mismatch();
  const orderVersions = versions(raw.orderVersions, "orderId").map(row => ({ orderId: row.id, version: row.version }));
  const queueVersions = versions(raw.queueVersions, "groupId").map(row => ({ groupId: row.id, version: row.version }));
  const targetChanged = executionChanged || assignments.some(row => row.orderId === intent.orderId);
  if (!orderVersions.some(row => row.orderId === intent.orderId && row.version === intent.expectedPlanVersion + Number(targetChanged))
    || !intent.replan && orderVersions.length !== 1 || assignments.some(item => !orderVersions.some(row => row.orderId === item.orderId))
    || (group ? queueVersions.length !== 1 || queueVersions[0].groupId !== group
      || intent.replan && queueVersions[0].version !== intent.replan.expectedQueueVersion + Number(changed) : queueVersions.length !== 0)) return mismatch();
  return { status: "applied", requestId: command.requestId, payloadHash: fingerprint, changed, operationId: raw.operationId as string | null,
    execution: saved, assignmentId: saved.assignmentId, assignments, orderVersions, queueVersions };
}

export function createProductionPlanClient(fetchImpl: typeof fetch = fetch) {
  // Server bounds the logical result at1MiB before adding its digest/replay
  // fields or receipt wrapper. Keep a fixed envelope allowance, not an
  // unbounded read or a larger domain/command payload limit.
  const prefix = "/api/v1/production-scheduling", maxBytes = 1024 * 1024 + 4096;
  async function request(path: string, current: Lease, body?: PlanIntent | ProductionCommand | ExecutionIntent) {
    assertLease(current); let response: Response;
    try { response = await fetchImpl(prefix + path, { method: body ? "POST" : "GET", credentials: "include", cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1" }, body: JSON.stringify(body) } : {}) }); }
    catch { assertLease(current); throw new ProductionPlanError(0, "plan_outcome_unknown"); }
    assertLease(current);
    let data: unknown;
    try {
      if (!response.body) return invalid();
      const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0, json = "";
      try { for (;;) { const chunk = await reader.read(); assertLease(current); if (chunk.done) break; bytes += chunk.value.byteLength;
        if (bytes > maxBytes) { await reader.cancel(); return invalid(); } json += decoder.decode(chunk.value, { stream: true }); }
        json += decoder.decode(); data = JSON.parse(json);
      } finally { reader.releaseLock(); }
    } catch (error) { assertLease(current); if (error instanceof ProductionPlanError) throw error; throw new ProductionPlanError(response.status, "plan_outcome_unknown"); }
    assertLease(current); return { response, data: object(data) };
  }
  function httpError(response: Response, data: Record<string, unknown>, command = false): never {
    const raw = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
    const code = response.status === 401 ? "authentication_required" : response.status === 403 ? "permission_denied"
      : typeof raw.code === "string" && Object.hasOwn(messages, raw.code) ? raw.code : "plan_outcome_unknown";
    throw new ProductionPlanError(response.status, code, command && response.status === 400 && code === "invalid_production_plan_intent");
  }
  return {
    async orders(input: Omit<Extract<PlanListQuery, { kind: "orders" }>, "kind">, current: Lease = () => true): Promise<PlanOrderDirectory> {
      const params = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])), query = parsePlanListQuery(params, "orders");
      if (query.kind !== "orders") return invalid();
      const { response, data } = await request(`/orders?${params}`, current); if (!response.ok) return httpError(response, data);
      const page = projectPage(data, query, projectOrderSummary); unique(page.items, item => item.id);
      if (page.items.some(item => !item.eligible || (query.allocation === "remaining" ? !["unassigned", "partial"].includes(item.allocationState) : query.allocation !== "all" && item.allocationState !== query.allocation))) return mismatch();
      return page;
    },
    async groups(input: Omit<Extract<PlanListQuery, { kind: "groups" }>, "kind">, current: Lease = () => true): Promise<PlanGroupDirectory> {
      const params = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])), query = parsePlanListQuery(params, "groups");
      if (query.kind !== "groups") return invalid();
      const { response, data } = await request(`/groups?${params}`, current); if (!response.ok) return httpError(response, data);
      const page = projectPage(data, query, value => {
        const raw = object(value), enabled = boolean(raw.enabled), resourcesEnabled = boolean(raw.resourcesEnabled), canCreate = boolean(raw.canCreate);
        const assignmentCount = integer(raw.assignmentCount), pendingAssignmentCount = integer(raw.pendingAssignmentCount, 0, assignmentCount), queueVersion = integer(raw.queueVersion, 0, 2147483647);
        const headAssignmentId = optionalUuid(raw.headAssignmentId), headOrderId = optionalUuid(raw.headOrderId), plannedThroughDate = optionalDate(raw.plannedThroughDate);
        if ((pendingAssignmentCount === 0 ? headAssignmentId !== null || headOrderId !== null || plannedThroughDate !== null : !headAssignmentId || !headOrderId || !plannedThroughDate)
          || canCreate && (!resourcesEnabled || assignmentCount >= 500 || queueVersion === 2147483647) || resourcesEnabled && !enabled) return invalid();
        return { id: uuid(raw.id), name: text(raw.name), shortName: text(raw.shortName), enabled, resourcesEnabled, canCreate,
          version: integer(raw.version, 1, 2147483647), queueVersion, assignmentCount, pendingAssignmentCount, plannedQuantity: readDecimal(raw.plannedQuantity),
          completedQuantity: readDecimal(raw.completedQuantity), outstandingPlannedQuantity: readDecimal(raw.outstandingPlannedQuantity), headAssignmentId, headOrderId, plannedThroughDate,
          siteName: text(raw.siteName), calendarName: text(raw.calendarName) };
      });
      unique(page.items, item => item.id);
      if (page.items.some(item => query.status === "enabled" ? !item.enabled : query.status === "disabled" ? item.enabled : query.status === "relevant" && !item.enabled && item.assignmentCount === 0)) return mismatch();
      return { ...page, ordersById: projectOrdersById(data.ordersById, [...new Set(page.items.flatMap(item => item.headOrderId ? [item.headOrderId] : []))]) };
    },
    async order(inputId: string, current: Lease = () => true): Promise<PlanOrderRead> {
      const id = uuid(inputId), { response, data } = await request(`/orders/${id}`, current); if (!response.ok) return httpError(response, data);
      const raw = object(data.order), info = projectOrderSummary(data.summary), planVersion = integer(raw.planVersion, 0, 2147483647);
      if (uuid(raw.id) !== id || info.id !== id || text(raw.orderNo) !== info.orderNo || planVersion !== info.planVersion) return mismatch();
      const colors = array(raw.colors, 1000).map(value => { const row = object(value); return { id: uuid(row.id), colorName: text(row.colorName), quantity: readDecimal(row.quantity), ambiguous: boolean(row.ambiguous) }; });
      if (colors.some(item => !item.ambiguous && colors.filter(row => row.id === item.id).length !== 1)) return invalid();
      const deliveryPlans = unique(array(raw.deliveryPlans, 1000).map(value => { const row = object(value); return { id: uuid(row.id), date: optionalDate(row.date), quantity: readDecimal(row.quantity) }; }), item => item.id);
      const assignments = unique(array(data.assignments).map(assignment), item => item.id), canCreate = boolean(data.canCreate), canEdit = boolean(data.canEdit), canComplete = boolean(data.canComplete);
      if (assignments.some(row => row.orderId !== id) || (canCreate || canEdit || canComplete) && (!info.eligible || planVersion === 2147483647)) return mismatch();
      return { order: { id, orderNo: info.orderNo, planVersion, colors, deliveryPlans }, summary: info, assignments,
        executions: projectExecutions(data.executions, assignments), resources: projectResources(data.resources, assignments), canCreate, canEdit, canComplete };
    },
    async queue(inputId: string, current: Lease = () => true): Promise<PlanQueueRead> {
      const id = uuid(inputId), { response, data } = await request(`/groups/${id}`, current); if (!response.ok) return httpError(response, data);
      const raw = object(data.group), assignments = unique(array(data.assignments).map(assignment), row => row.id);
      if (uuid(data.groupId) !== id || uuid(raw.id) !== id || assignments.some(row => row.productionGroupId !== id || row.status !== "planned")) return mismatch();
      return { groupId: id, group: { id, name: text(raw.name), version: integer(raw.version, 1, 2147483647), enabled: boolean(raw.enabled) }, version: integer(data.version, 0, 2147483647),
        assignments, executions: projectExecutions(data.executions, assignments), resources: projectResources(data.resources, assignments), ordersById: projectOrdersById(data.ordersById, [...new Set(assignments.map(item => item.orderId))]) };
    },
    async history(inputId: string, offset = 0, asOfVersion: number | null = null, current: Lease = () => true): Promise<PlanHistoryRead> {
      const id = uuid(inputId), pageOffset = integer(offset, 0, 100000), anchor = asOfVersion === null ? null : integer(asOfVersion, 1, 2147483647);
      const { response, data } = await request(`/assignments/${id}?offset=${pageOffset}${anchor === null ? "" : `&asOfVersion=${anchor}`}`, current); if (!response.ok) return httpError(response, data);
      const saved = assignment(data.assignment), at = integer(data.asOfVersion, 1, saved.version), hasMore = boolean(data.hasMore), nextOffset = data.nextOffset === null ? null : integer(data.nextOffset, 0, 100000);
      if (saved.id !== id || anchor !== null && at !== anchor || integer(data.offset) !== pageOffset || integer(data.limit) !== 50 || (hasMore ? nextOffset !== pageOffset + 50 : nextOffset !== null)) return mismatch();
      const scopes: Pick<Assignment, "resourceSnapshotHash" | "executionType" | "productionGroupId" | "outsourceFactoryId">[] = [];
      const history = unique(array(data.history, 50).map(value => {
        const raw = object(value), row = object(raw.snapshot), version = integer(raw.version, 1, at), resourceSnapshotHash = hash(row.resource_snapshot_hash);
        if (uuid(row.id) !== id || uuid(row.sales_order_id) !== saved.orderId || integer(row.version) !== version || !["planned", "cancelled"].includes(row.status as string) || !["internal", "outsource"].includes(row.execution_type as string)) return mismatch();
        scopes.push({ resourceSnapshotHash, executionType: row.execution_type as "internal" | "outsource", productionGroupId: optionalUuid(row.production_group_id), outsourceFactoryId: optionalUuid(row.outsource_factory_id) });
        return { version, requestId: uuid(raw.requestId), operationId: text(raw.operationId), reason: text(raw.reason), recordedAt: timestamp(raw.recordedAt),
          snapshot: { id, orderId: saved.orderId, version, resourceSnapshotHash, plannedQuantity: decimal(row.planned_quantity), plannedStartDate: date(row.planned_start_date), plannedEndDate: date(row.planned_end_date),
            status: row.status as Assignment["status"], remark: text(row.remark), colorNameSnapshot: optionalText(row.color_name_snapshot) } };
      }), row => String(row.version));
      if (hasMore && history.length !== 50 || history.some((row, index) => index > 0 && row.version >= history[index - 1].version)) return mismatch();
      return { assignment: saved, history, resources: projectResources(data.resources, scopes), asOfVersion: at, offset: pageOffset, hasMore, nextOffset };
    },
    async preview(value: PlanIntent, current: Lease = () => true): Promise<PlanPreview> {
      let intent: PlanIntent; try { intent = parsePlanIntent(value); } catch { throw new ProductionPlanError(400, "invalid_production_plan_intent", true); }
      const { response, data } = await request("/preview", current, intent); if (!response.ok) return httpError(response, data);
      return projectPreview(data, intent);
    },
    async executionPreview(value: ExecutionIntent, scope: ExecutionScope, current: Lease = () => true): Promise<ExecutionPreview> {
      let intent: ExecutionIntent; try { intent = parseExecutionIntent(value); } catch { throw new ProductionPlanError(400, "invalid_production_execution_intent", true); }
      const { response, data } = await request("/execution/preview", current, intent); if (!response.ok) return httpError(response, data);
      return projectExecutionPreview(data, intent, scope);
    },
    async executionHistory(inputId: string, offset = 0, asOfVersion: number | null = null, current: Lease = () => true): Promise<ExecutionHistoryRead> {
      const id = uuid(inputId), pageOffset = integer(offset, 0, 100000), anchor = asOfVersion === null ? null : integer(asOfVersion, 0, 2147483647);
      const { response, data } = await request(`/executions/${id}?offset=${pageOffset}${anchor === null ? "" : `&asOfVersion=${anchor}`}`, current); if (!response.ok) return httpError(response, data);
      const plan = assignment(data.assignment), head = data.execution === null ? null : execution(data.execution, plan), at = integer(data.asOfVersion, 0, head?.version ?? 0);
      const hasMore = boolean(data.hasMore), nextOffset = data.nextOffset === null ? null : integer(data.nextOffset, 0, 100000);
      if (plan.id !== id || head && at === 0 || anchor !== null && at !== anchor || integer(data.offset) !== pageOffset || integer(data.limit) !== 50
        || (hasMore ? nextOffset !== pageOffset + 50 : nextOffset !== null)) return mismatch();
      const history = array(data.history, 50).map((value, index) => {
        const row = object(value), raw = object(row.snapshot), version = integer(row.version, 1, at);
        const item = execution({ ...raw, assignmentId: raw.assignment_id, orderId: raw.sales_order_id, assignmentVersion: raw.assignment_version,
          completedQuantity: raw.completed_quantity, actualStartDate: raw.actual_start_date, actualCompletedDate: raw.actual_completed_date,
          // Normalize the event's own PG timestamp representation, never borrow today's head values.
          createdAt: new Date(text(raw.created_at, 50)).toISOString(), updatedAt: new Date(text(raw.updated_at, 50)).toISOString() }, plan);
        if (version !== at - pageOffset - index || item.version !== version || item.assignmentId !== id) return mismatch();
        return { version, requestId: uuid(row.requestId), operationId: text(row.operationId), reason: text(row.reason), recordedAt: timestamp(row.recordedAt),
          snapshot: { ...executionFactsOnly(item)!, assignmentVersion: item.assignmentVersion } };
      });
      if (history.length !== Math.max(0, Math.min(50, at - pageOffset)) || hasMore !== (pageOffset + history.length < at)) return mismatch();
      return { assignment: plan, execution: head, history, asOfVersion: at, offset: pageOffset, hasMore, nextOffset };
    },
    async execute(value: ProductionCommand, current: Lease = () => true) {
      assertLease(current); const command = canonicalProductionCommand(value), fingerprint = await productionPlanFingerprint(command); assertLease(current);
      const { response, data } = await request(command.intent.action === "record_execution" ? "/execution/commands" : "/commands", current, command);
      if (!response.ok && data.status !== "rejected") return httpError(response, data, true);
      const outcome = command.intent.action === "record_execution" ? projectExecutionOutcome(data, command as ExecutionCommand, fingerprint) : projectOutcome(data, command as PlanCommand, fingerprint);
      if (typeof data.replayed !== "boolean" || (outcome.status === "applied" ? !response.ok : response.status !== outcome.error.status)) return invalid();
      return { ...outcome, replayed: data.replayed };
    },
    async receipt(value: ProductionCommand, current: Lease = () => true): Promise<ProductionReceipt> {
      assertLease(current); const command = canonicalProductionCommand(value), fingerprint = await productionPlanFingerprint(command); assertLease(current);
      const { response, data } = await request(`/commands/${command.requestId}`, current); if (!response.ok) return httpError(response, data);
      if (data.requestId !== command.requestId) return mismatch();
      if (data.state === "known") return { state: "known", requestId: command.requestId, result: command.intent.action === "record_execution"
        ? projectExecutionOutcome(data.result, command as ExecutionCommand, fingerprint) : projectOutcome(data.result, command as PlanCommand, fingerprint) };
      if (!["pending", "unknown"].includes(data.state as string) || data.result !== null) return invalid();
      return { state: data.state as "pending" | "unknown", requestId: command.requestId, result: null };
    },
  };
}
export const productionPlanClient = createProductionPlanClient();

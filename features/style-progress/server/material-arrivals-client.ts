import { canonicalPlanJson } from "../../../server/production-scheduling/canonical-json";
import { arrivalKey, arrivalQuantity, arrivalUuid, compareArrivalQuantities, parseArrivalCommand, parseArrivalIntent, sumArrivalQuantities, type ArrivalCommand, type ArrivalIntent } from "../../../server/material-arrivals/contract";
import { productionResourceDate, PRODUCTION_RESOURCE_LIMITS } from "../../../server/production-resources/contract";
import { LOGISTICS_RESOURCE_LIMITS } from "../../../server/production-resources/logistics-contract";
import type { ArrivalBasis, ArrivalTracking, StoredArrivalPlan } from "../../../server/material-arrivals/store";
import type { ArrivalDemand, ArrivalGeneration } from "../../../server/material-arrivals/source";
import type { readMaterialArrivals, readMaterialArrivalHistory } from "../../../server/material-arrivals/service";
import type { ArrivalLogisticsContext } from "../model/server-arrival-logistics";
import { ServerAuthError } from "../../server-auth/server-auth-client";

export type ArrivalRead = Awaited<ReturnType<typeof readMaterialArrivals>>;
export type ArrivalHistory = Awaited<ReturnType<typeof readMaterialArrivalHistory>>;
export type ArrivalPreview = { intent: ArrivalIntent; order: ArrivalRead["order"]; before: StoredArrivalPlan | null; after: ArrivalBasis; changed: boolean; sourceStatus: string; previewHash: string };
export type ArrivalResult = { requestId: string; status: "applied"; changed: boolean; operationId: string | null; plan: StoredArrivalPlan | null; payloadHash: string }
  | { requestId: string; status: "rejected"; error: { status: number; code: string }; payloadHash: string };
export type ArrivalReceipt = { state: "known"; requestId: string; result: ArrivalResult } | { state: "pending" | "unknown"; requestId: string; result: null };
export type ArrivalLease = () => boolean;
const messages: Record<string, string> = {
  invalid_material_arrival_intent: "请检查日期及每批分配数量。",
  material_arrivals_unavailable: "分批到料暂不可用，原物料来源仍可查看。",
  material_arrival_version_conflict: "到料计划已被其他人修改，请重新读取后预览。",
  material_arrival_preview_changed: "来源、订单或集货仓已变化，请重新读取后预览。",
  material_arrival_source_unavailable: "当前物料来源不可用；已有计划可查看或明确清空，不能新增分配。",
  material_arrival_hub_missing: "请先在订单的“物料与运输”中设置集货仓。",
  material_arrival_demand_unmatched: "颜色或规格无法唯一匹配，请核对来源。",
  material_arrival_demand_unavailable: "本项需求的数量、单位或采购归属待核对。",
  material_arrival_unit_changed: "单位已变化；请先移除旧单位分配并保存，再按新单位填写。",
  material_arrival_identity_conflict: "物料身份已变化，请核对原计划。",
  material_arrival_overallocated: "累计安排数量超过当前需求，请调整分批数量。",
  material_arrival_order_read_only: "订单已完成或取消，只能查看原计划及历史。",
  historical_duplicate_order_read_only: "该历史订单仅可查看，原计划与流水保留。",
  material_arrival_projection_limit: "本次资料较多，无法安全完整处理，请缩小计划范围。",
  material_arrival_history_invalid: "历史记录无法安全核对，请联系管理员。",
  material_arrival_request_conflict: "请求编号与原内容不一致，请先核对原请求。",
  arrival_response_invalid: "返回资料无法安全核对，原请求已保留。",
  arrival_receipt_mismatch: "核对结果与原请求不一致，原请求已保留。",
  arrival_owner_changed: "登录或页面已变化，原请求保留供重新核对。",
  arrival_client_unavailable: "当前访问方式无法安全保存并核对请求。",
  arrival_result_unknown: "保存结果尚未确认，请核对原请求；不会自动重试。",
  arrival_known_rejection: "本次操作未应用，请核对资料后重新预览。",
};
export class MaterialArrivalError extends ServerAuthError {
  constructor(status: number, code: string) { super(status, code, messages[code]); }
}
const invalid = (): never => { throw new MaterialArrivalError(502, "arrival_response_invalid"); };
const mismatch = (): never => { throw new MaterialArrivalError(502, "arrival_receipt_mismatch"); };
const lease = (current: ArrivalLease) => { if (!current()) throw new MaterialArrivalError(0, "arrival_owner_changed"); };
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; };
const text = (value: unknown, max = 4096): string => { if (typeof value !== "string" || value.length > max || value.includes("\0")) return invalid(); return value; };
const integer = (value: unknown, min = 0, max = 2147483647): number => { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) return invalid(); return value as number; };
const boolean = (value: unknown): boolean => { if (typeof value !== "boolean") return invalid(); return value; };
const uuid = (value: unknown): string => { try { return arrivalUuid(value); } catch { return invalid(); } };
const key = (value: unknown): string => { try { return arrivalKey(value); } catch { return invalid(); } };
const date = (value: unknown): string => { try { return productionResourceDate(value); } catch { return invalid(); } };
const quantity = (value: unknown): string => { try { const result = arrivalQuantity(value, false); if (result !== value) return invalid(); return result; } catch { return invalid(); } };
const nullable = <T,>(value: unknown, read: (value: unknown) => T): T | null => value === null ? null : read(value);
const array = (value: unknown, max = 10000): unknown[] => { if (!Array.isArray(value) || value.length > max) return invalid(); return value; };
const unique = <T,>(rows: T[], id: (value: T) => string): T[] => { if (new Set(rows.map(id)).size !== rows.length) return invalid(); return rows; };
const hash = (value: unknown): string => { const v = text(value, 64); if (!/^[a-f0-9]{64}$/u.test(v)) return invalid(); return v; };
const timestamp = (value: unknown): string => { const v = text(value, 50); if (!/^\d{4}-\d{2}-\d{2}T/u.test(v) || !Number.isFinite(Date.parse(v))) return invalid(); return new Date(v).toISOString(); };
const operation = (value: unknown): string => { const v = text(value, 46); if (v !== "operation-" + uuid(v.slice(10))) return invalid(); return v; };
function materialIdentity(value: unknown): ArrivalDemand["canonicalIdentity"] { const r = object(value), type = text(r.materialType, 10); if (type !== "fabric" && type !== "trim") return invalid(); return { salesContractNo: text(r.salesContractNo), materialType: type, materialName: text(r.materialName) }; }
function demand(value: unknown, orderId: string): ArrivalDemand {
  const r = object(value), identity = object(r.identity), eligibility = text(r.eligibility, 30), canonicalIdentity = materialIdentity(r.canonicalIdentity);
  if (!["eligible", "ambiguous", "unit_unknown", "quantity_unknown", "factory_confirmed"].includes(eligibility) || identity.schemaVersion !== "server-material-demand.v1" || uuid(identity.orderId) !== orderId) return invalid();
  const i = materialIdentity(identity), garmentColors = array(identity.garmentColors, 1000).map(v => text(v));
  const row: ArrivalDemand = { id: uuid(r.id), identityKey: hash(r.identityKey), identity: { ...i, schemaVersion: "server-material-demand.v1", orderId,
    materialCode: text(identity.materialCode), materialColor: text(identity.materialColor), specification: text(identity.specification), width: text(identity.width), gsm: text(identity.gsm), garmentColors },
    sourceDemandId: text(r.sourceDemandId, 200), canonicalKey: key(r.canonicalKey), canonicalIdentity, name: text(r.name), materialCode: text(r.materialCode), color: text(r.color),
    garmentColors: array(r.garmentColors, 1000).map(v => text(v)), specification: text(r.specification), requiredQuantity: nullable(r.requiredQuantity, quantity),
    unit: nullable(r.unit, v => text(v, 100)), sourceMaterialDueDate: nullable(r.sourceMaterialDueDate, date), eligibility: eligibility as ArrivalDemand["eligibility"] };
  if (canonicalPlanJson(i) !== canonicalPlanJson(canonicalIdentity) || row.eligibility === "eligible" && (row.requiredQuantity === null || !row.unit)) return invalid();
  return row;
}
function generation(value: unknown): ArrivalGeneration { const r = object(value); return { sourceKey: text(r.sourceKey, 100), runId: uuid(r.runId), contentHash: hash(r.contentHash), sourceLinkId: uuid(r.sourceLinkId), capturedOrderVersion: integer(r.capturedOrderVersion, 1) }; }
function tracking(value: unknown): ArrivalTracking | null {
  if (value === null) return null; const r = object(value), h = r.hubSnapshot === null ? null : object(r.hubSnapshot);
  const result = { id: uuid(r.id), version: integer(r.version, 1), supplyHubId: nullable(r.supplyHubId, uuid),
    hubSnapshot: h ? { id: uuid(h.id), name: text(h.name), enabled: boolean(h.enabled), version: integer(h.version, 1) } : null };
  if ((result.hubSnapshot?.id ?? null) !== result.supplyHubId) return invalid(); return result;
}
function basis(value: unknown, orderId: string, canonicalKey: string): ArrivalBasis {
  const r = object(value); if (r.dateSource !== "manual") return invalid();
  let batches; try { batches = parseArrivalIntent({ action: "replace_arrival_plan", orderId, canonicalKey, expectedVersion: 0, batches: r.batches }).batches; } catch { return invalid(); }
  const demands = unique(array(r.demands, 200).map(v => demand(v, orderId)), v => v.id), ids = new Set(demands.map(v => v.id));
  if (demands.some(v => v.canonicalKey !== canonicalKey) || batches.some(b => b.allocations.some(a => !ids.has(a.materialDemandId)))) return invalid();
  for (const d of demands) { const values = batches.flatMap(b => b.allocations.filter(a => a.materialDemandId === d.id).map(a => a.quantity));
    if (!values.length || d.eligibility !== "eligible" || d.requiredQuantity === null || !d.unit || compareArrivalQuantities(sumArrivalQuantities(values), d.requiredQuantity) > 0) return invalid(); }
  return { dateSource: "manual", batches, demands, source: generation(r.source), tracking: tracking(r.tracking) };
}
function plan(value: unknown, orderId: string, canonicalKey?: string): StoredArrivalPlan | null {
  if (value === null) return null; const r = object(value), k = key(r.canonicalKey);
  const result: StoredArrivalPlan = { id: uuid(r.id), orderId: uuid(r.orderId), canonicalKey: k, canonicalIdentity: materialIdentity(r.canonicalIdentity), supplyHubId: nullable(r.supplyHubId, uuid),
    sourceRunId: uuid(r.sourceRunId), data: basis(r.data, orderId, k), version: integer(r.version, 1), createdAt: timestamp(r.createdAt), updatedAt: timestamp(r.updatedAt) };
  if (result.orderId !== orderId || canonicalKey && k !== canonicalKey || result.sourceRunId !== result.data.source.runId || result.supplyHubId !== (result.data.tracking?.supplyHubId ?? null)
    || result.updatedAt < result.createdAt || result.data.demands.some(v => canonicalPlanJson(v.canonicalIdentity) !== canonicalPlanJson(result.canonicalIdentity))) return invalid();
  return result;
}
function order(value: unknown, orderId: string): ArrivalRead["order"] {
  const r = object(value), i = object(r.identity), lifecycleState = text(r.lifecycleState, 30);
  const identity = { originalOrderId: uuid(i.originalOrderId), effectiveOrderId: uuid(i.effectiveOrderId), attributionVersion: integer(i.attributionVersion), attributionChangeId: nullable(i.attributionChangeId, uuid), historicalDuplicate: boolean(i.historicalDuplicate) };
  if (uuid(r.id) !== orderId || identity.originalOrderId !== orderId || identity.historicalDuplicate !== (orderId !== identity.effectiveOrderId)
    || (identity.attributionVersion === 0) !== (identity.attributionChangeId === null) || !["draft", "confirmed", "active", "completed", "cancelled"].includes(lifecycleState)) return invalid();
  return { id: orderId, orderNo: text(r.orderNo, 100), version: integer(r.version, 1), lifecycleState, identity };
}
function logistics(value: unknown, orderId: string, saved: ArrivalTracking | null): ArrivalLogisticsContext {
  const r = object(value), s = object(r.settings), v = object(r.versions), status = text(r.status, 20);
  if (r.schemaVersion !== "material-arrival-logistics.v1" || uuid(r.orderId) !== orderId || !["ready", "unavailable"].includes(status)) return invalid();
  const a = r.assignment === null ? null : object(r.assignment), executionType = a ? text(a.executionType, 10) : null;
  if (a && executionType !== "internal" && executionType !== "outsource") return invalid();
  const assignment = a ? { id: uuid(a.id), version: integer(a.version, 1), executionType: executionType as "internal" | "outsource", productionGroupId: nullable(a.productionGroupId, uuid), plannedStartDate: date(a.plannedStartDate), resourceSnapshotHash: hash(a.resourceSnapshotHash) } : null;
  const settings: ArrivalLogisticsContext["settings"] = {
    productionGroups: array(s.productionGroups, 1).map(x => { const x0 = object(x); return { id: uuid(x0.id), productionSiteId: uuid(x0.productionSiteId) }; }),
    productionSites: array(s.productionSites, 1).map(x => { const x0 = object(x); return { id: uuid(x0.id), name: text(x0.name), enabled: boolean(x0.enabled), preProductionSampleLeadDays: integer(x0.preProductionSampleLeadDays, 0, PRODUCTION_RESOURCE_LIMITS.leadDays) }; }),
    supplyHubs: array(s.supplyHubs, 1).map(x => { const x0 = object(x); return { id: uuid(x0.id), name: text(x0.name), enabled: boolean(x0.enabled) }; }),
    supplyRoutes: array(s.supplyRoutes, 1).map(x => { const x0 = object(x); return { id: uuid(x0.id), name: text(x0.name), enabled: boolean(x0.enabled), supplyHubId: uuid(x0.supplyHubId), productionSiteId: uuid(x0.productionSiteId) }; }),
    transportModes: unique(array(s.transportModes, LOGISTICS_RESOURCE_LIMITS.modes).map(x => { const x0 = object(x); if (typeof x0.sortOrder !== "number" || !Number.isFinite(x0.sortOrder) || Math.abs(x0.sortOrder) > PRODUCTION_RESOURCE_LIMITS.sortMagnitude) return invalid();
      return { id: uuid(x0.id), routeId: uuid(x0.routeId), name: text(x0.name), enabled: boolean(x0.enabled), transitDays: integer(x0.transitDays, 0, LOGISTICS_RESOURCE_LIMITS.transitDays), sortOrder: x0.sortOrder }; }), x => x.id),
  };
  const versions = { hub: nullable(v.hub, x => integer(x, 1)), route: nullable(v.route, x => integer(x, 1)), modes: unique(array(v.modes, 100).map(x => { const x0 = object(x); return { id: uuid(x0.id), version: integer(x0.version, 1) }; }), x => x.id) };
  const issues = unique(array(r.issues, 3).map(x => text(x, 30)), x => x);
  if (issues.some(x => !["hub_disabled", "route_ambiguous", "context_unavailable"].includes(x)) || nullable(r.supplyHubId, uuid) !== (saved?.supplyHubId ?? null)
    || settings.supplyHubs.some(h => h.id !== saved?.supplyHubId) || settings.productionGroups.some(g => g.id !== assignment?.productionGroupId)
    || settings.productionSites.some(p => p.id !== settings.productionGroups[0]?.productionSiteId) || settings.supplyRoutes.some(p => p.supplyHubId !== saved?.supplyHubId || p.productionSiteId !== settings.productionSites[0]?.id)
    || settings.transportModes.some(m => m.routeId !== settings.supplyRoutes[0]?.id) || canonicalPlanJson(versions.modes.map(m => m.id).sort()) !== canonicalPlanJson(settings.transportModes.map(m => m.id).sort())) return invalid();
  return { schemaVersion: "material-arrival-logistics.v1", orderId, status: status as ArrivalLogisticsContext["status"], planVersion: integer(r.planVersion), assignment,
    supplyHubId: saved?.supplyHubId ?? null, settings, versions, issues: issues as ArrivalLogisticsContext["issues"] };
}
export function parseMaterialArrivalRead(value: unknown, orderId: string): ArrivalRead {
  const r = object(value), source = object(r.source), current = order(r.order, orderId), saved = tracking(r.tracking), canEdit = boolean(r.canEdit);
  const sourceStatus = text(source.status, 50), demands = array(source.demands).map(x => demand(x, orderId)), sourceGeneration = nullable(source.generation, generation);
  if (sourceStatus === "ready" && !sourceGeneration || sourceStatus !== "ready" && (sourceGeneration !== null || demands.length) || canEdit && (current.identity.historicalDuplicate || ["completed", "cancelled"].includes(current.lifecycleState))) return invalid();
  const plans = unique(array(r.plans, 1000).map(x => { const raw = object(x), savedPlan = plan(raw.plan, orderId); if (!savedPlan) return invalid(); const issues = unique(array(raw.issues, 5).map(v => text(v, 30)), v => v);
    if (issues.some(v => !["source_unavailable", "hub_changed", "demand_unavailable", "unit_changed", "overallocated"].includes(v))) return invalid(); return { plan: savedPlan, issues }; }), x => x.plan.canonicalKey);
  return { order: current, source: { status: sourceStatus, generation: sourceGeneration, demands, factoryExcluded: integer(source.factoryExcluded) }, tracking: saved,
    logistics: logistics(r.logistics, orderId, saved), canEdit, plans };
}
export function parseMaterialArrivalPreview(value: unknown, intent: ArrivalIntent, scope: ArrivalRead): ArrivalPreview {
  const r = object(value); let normalized; try { normalized = parseArrivalIntent(r.intent); } catch { return invalid(); }
  const before = plan(r.before, intent.orderId, intent.canonicalKey), after = basis(r.after, intent.orderId, intent.canonicalKey), current = order(r.order, intent.orderId), changed = boolean(r.changed);
  if (canonicalPlanJson(normalized) !== canonicalPlanJson(intent) || canonicalPlanJson(after.batches) !== canonicalPlanJson(intent.batches)
    || (before?.version ?? 0) !== intent.expectedVersion || canonicalPlanJson(before) !== canonicalPlanJson(scope.plans.find(x => x.plan.canonicalKey === intent.canonicalKey)?.plan ?? null)
    || canonicalPlanJson(current.identity) !== canonicalPlanJson(scope.order.identity) || current.identity.historicalDuplicate || ["completed", "cancelled"].includes(current.lifecycleState)) return mismatch();
  if (canonicalPlanJson(after.tracking) !== canonicalPlanJson(scope.tracking) || scope.source.generation && canonicalPlanJson(after.source) !== canonicalPlanJson(scope.source.generation))
    throw new MaterialArrivalError(409, "material_arrival_preview_changed");
  return { intent: normalized, before, after, order: current, changed, sourceStatus: text(r.sourceStatus, 50), previewHash: hash(r.previewHash) };
}
export function parseMaterialArrivalHistory(value: unknown, orderId: string, canonicalKey: string, offset: number, anchor: number | null): ArrivalHistory {
  const r = object(value), current = order(r.order, orderId), savedPlan = plan(r.plan, orderId, canonicalKey), asOfVersion = integer(r.asOfVersion), hasMore = boolean(r.hasMore);
  const history = array(r.history, 25).map(x => { const raw = object(x), snapshot = plan(raw.snapshot, orderId, canonicalKey); if (!snapshot) return invalid(); const version = integer(raw.version, 1);
    if (version !== snapshot.version || snapshot.id !== savedPlan?.id || version > asOfVersion) return mismatch();
    return { version, snapshot, requestId: uuid(raw.requestId), operationId: operation(raw.operationId), recordedAt: timestamp(raw.recordedAt) }; });
  if (integer(r.offset) !== offset || r.limit !== 25 || anchor !== null && asOfVersion !== anchor || asOfVersion > (savedPlan?.version ?? 0)
    || history.some((x, i) => x.version !== asOfVersion - offset - i) || hasMore !== (asOfVersion > offset + history.length)
    || r.nextOffset !== (hasMore ? offset + 25 : null)) return mismatch();
  return { order: current, plan: savedPlan, history, asOfVersion, offset, limit: 25, hasMore, nextOffset: hasMore ? offset + 25 : null };
}
export async function materialArrivalCommandDigest(command: ArrivalCommand, current: ArrivalLease = () => true): Promise<string> {
  lease(current); if (!globalThis.crypto?.subtle) throw new MaterialArrivalError(0, "arrival_client_unavailable");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPlanJson(parseArrivalCommand(command)))); lease(current);
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}
async function outcome(value: unknown, command: ArrivalCommand, current: ArrivalLease, expectedHash?: string): Promise<ArrivalResult> {
  const r = object(value), digest = expectedHash ?? hash(r.payloadHash); if (uuid(r.requestId) !== command.requestId || digest !== await materialArrivalCommandDigest(command, current)) return mismatch();
  if (r.status === "rejected") { const error = object(r.error), status = integer(error.status, 400, 499), code = text(error.code, 100); if (![404, 409, 422].includes(status) || !/^[a-z0-9_]+$/u.test(code)) return invalid(); return { requestId: command.requestId, status: "rejected", error: { status, code: Object.hasOwn(messages, code) ? code : "arrival_known_rejection" }, payloadHash: digest }; }
  if (r.status !== "applied") return invalid(); const savedPlan = plan(r.plan, command.intent.orderId, command.intent.canonicalKey), changed = boolean(r.changed), operationId = nullable(r.operationId, operation);
  if (Boolean(operationId) !== changed || (savedPlan?.version ?? 0) !== command.intent.expectedVersion + (changed ? 1 : 0)
    || canonicalPlanJson(savedPlan?.data.batches ?? []) !== canonicalPlanJson(command.intent.batches)) return mismatch();
  return { requestId: command.requestId, status: "applied", changed, operationId, plan: savedPlan, payloadHash: digest };
}
type Request = (input: string, init?: RequestInit) => Promise<Response>;
export function createMaterialArrivalsClient(request: Request = fetch) {
  async function json(path: string, current: ArrivalLease, body?: unknown, signal?: AbortSignal) {
    lease(current); const response = await request("/api/v1/material-arrivals" + path, { method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store", signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1" }, body: JSON.stringify(body) }) });
    const raw = await response.text(); lease(current); if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) return invalid();
    let value: unknown; try { value = JSON.parse(raw); } catch { throw new MaterialArrivalError(response.status || 0, "arrival_result_unknown"); }
    return { response, value };
  }
  function success(result: Awaited<ReturnType<typeof json>>) { if (!result.response.ok) { const raw = object(result.value), error = object(raw.error), code = text(error.code, 100); throw new MaterialArrivalError(result.response.status, Object.hasOwn(messages, code) || ["authentication_required", "permission_denied"].includes(code) ? code : "arrival_result_unknown"); } return result.value; }
  return {
    async read(orderId: string, current: ArrivalLease, signal?: AbortSignal) { return parseMaterialArrivalRead(success(await json("/orders/" + uuid(orderId), current, undefined, signal)), orderId); },
    async preview(value: ArrivalIntent, scope: ArrivalRead, current: ArrivalLease, signal?: AbortSignal) { const intent = parseArrivalIntent(value); return parseMaterialArrivalPreview(success(await json("/preview", current, intent, signal)), intent, scope); },
    async submit(value: ArrivalCommand, current: ArrivalLease) { const command = parseArrivalCommand(value), result = await json("/commands", current, command), raw = object(result.value);
      // Durable domain rejections intentionally retain their 404/409/422 HTTP
      // status. Only a verified original-command outcome releases the slot.
      if (!result.response.ok && raw.status !== "rejected") success(result);
      const verified = await outcome(raw, command, current); if (verified.status === "rejected" && result.response.status !== verified.error.status || verified.status === "applied" && !result.response.ok) return mismatch(); return verified; },
    async receipt(value: ArrivalCommand, current: ArrivalLease) { const command = parseArrivalCommand(value), raw = object(success(await json("/commands/" + command.requestId, current)));
      if (uuid(raw.requestId) !== command.requestId) return mismatch();
      if (raw.state === "known") return { state: "known" as const, requestId: command.requestId, result: await outcome(raw.result, command, current, hash(raw.payloadHash)) };
      if (raw.state !== "pending" && raw.state !== "unknown") return invalid(); return { state: raw.state, requestId: command.requestId, result: null } as ArrivalReceipt; },
    async history(orderId: string, canonicalKey: string, offset: number, anchor: number | null, current: ArrivalLease, signal?: AbortSignal) {
      const path = "/orders/" + uuid(orderId) + "/materials/" + key(canonicalKey) + "/history?offset=" + integer(offset, 0, 100000) + (anchor === null ? "" : "&asOfVersion=" + integer(anchor));
      return parseMaterialArrivalHistory(success(await json(path, current, undefined, signal)), orderId, canonicalKey, offset, anchor); },
  };
}
export const materialArrivalsClient = createMaterialArrivalsClient();
export const materialArrivalMessage = (error: unknown) => error instanceof ServerAuthError ? error.message : "操作尚未确认，请保留输入并核对原请求。";

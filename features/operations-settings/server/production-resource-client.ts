// This shared validator is deliberately isomorphic: no Node/PG/auth side effects.
// The Server always validates again; using it here grants no mutation authority.
import { parseProductionResourceCommand, productionResourceUuid, type ProductionResourceCommand, type ProductionResourceType } from "../../../server/production-resources/contract";
import type { ProductionResource, ProductionResourceSummary, ResourceListQuery, ResourceOutcome } from "../../../server/production-resources/service";
import { ServerAuthError } from "../../server-auth/server-auth-client";
export type { ProductionResource, ProductionResourceSummary, ProductionResourceCommand, ProductionResourceType, ResourceListQuery };
export type VerifiedResourceOutcome = ResourceOutcome & { payloadHash: string };
export type ResourceDirectory = { items: ProductionResourceSummary[]; total: number; offset: number; limit: number; canEdit: boolean };
export type ResourceReceipt = { state: "known"; requestId: string; result: VerifiedResourceOutcome } | { state: "pending" | "unknown"; requestId: string; result: null };

const messages: Record<string, string> = {
  invalid_production_resource_command: "请检查名称、关联资料、数值和日期，特殊日期说明不能留空。",
  production_resources_unavailable: "生产资料暂时不可用，请稍后重新读取。",
  production_resource_search_too_broad: "匹配资料过多，请增加搜索关键词。",
  invalid_production_resource_query: "请检查搜索和分页条件。",
  production_resource_not_found: "这条生产资料不存在，请重新读取。",
  production_resource_version_conflict: "资料已被其他人更新，请重新读取后再修改。",
  production_resource_version_exhausted: "这条资料暂时不能继续修改，请联系管理员。",
  production_calendar_not_found: "工作日历不存在，请重新选择。",
  production_calendar_disabled: "工作日历已停用，请选择启用的日历。",
  production_site_not_found: "生产地点不存在，请重新选择。",
  production_site_disabled: "生产地点已停用，请选择启用的地点。",
  production_resource_request_conflict: "原请求的内容不一致，请先核对原操作。",
  resource_receipt_mismatch: "核对结果与原请求不一致，已保留原请求，请联系管理员核查。",
  resource_outcome_unknown: "保存结果尚未确认，请核对原请求；不会自动重试。",
  invalid_resource_response: "返回的生产资料无法安全读取，请重新读取。",
  resource_client_unavailable: "浏览器暂时无法安全保存，请使用受支持的安全访问入口。",
  resource_owner_changed: "登录状态已变化；原请求仍保留，请重新读取后核对。",
};
export class ProductionResourceError extends ServerAuthError {
  constructor(status: number, code: string, readonly knownNotApplied = false) { super(status, code, messages[code]); }
}
const invalid = (): never => { throw new ProductionResourceError(502, "invalid_resource_response"); };
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function integer(value: unknown, min = 0): number { if (!Number.isSafeInteger(value) || (value as number) < min) return invalid(); return value as number; }
function uuid(value: unknown) { try { return productionResourceUuid(value); } catch { return invalid(); } }
function timestamp(value: unknown): string { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid(); return value; }
const fields = {
  calendars: ["workingWeekdays", "exceptions"], sites: ["countryCode", "productionCalendarId", "preProductionSampleLeadDays"],
  groups: ["shortName", "productionSiteId", "sortOrder"], factories: ["shortName", "contactPerson", "phone"],
} as const;
export function canonicalResourceCommand(value: unknown): ProductionResourceCommand {
  try { return parseProductionResourceCommand(value); } catch { throw new ProductionResourceError(400, "invalid_production_resource_command", true); }
}
export async function resourceCommandFingerprint(value: ProductionResourceCommand): Promise<string> {
  const command = canonicalResourceCommand(value);
  if (!globalThis.crypto?.subtle) throw new ProductionResourceError(0, "resource_client_unavailable");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(command)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function productionResourceInput(resource: ProductionResource) {
  const { id: _id, kind: _kind, version: _version, createdAt: _created, updatedAt: _updated, ...data } = resource;
  void _id; void _kind; void _version; void _created; void _updated;
  return data;
}
function projectResource(value: unknown, kind: ProductionResourceType, summary: boolean): ProductionResource | ProductionResourceSummary {
  const raw = object(value); if (raw.kind !== kind) return invalid();
  const common = { id: uuid(raw.id), kind, version: integer(raw.version, 1), createdAt: timestamp(raw.createdAt), updatedAt: timestamp(raw.updatedAt) };
  const data = Object.fromEntries(["name", "enabled", "remark", ...fields[kind]].map(key => [key, raw[key]]));
  // A list omits exception bodies. Validate its week template without inventing
  // a detail resource with an empty exception list.
  if (summary && kind === "calendars") data.exceptions = [];
  let parsed: ProductionResourceCommand;
  try { parsed = parseProductionResourceCommand({ requestId: common.id, action: "update", kind, resourceId: common.id, expectedVersion: common.version, data }); } catch { return invalid(); }
  if (summary && parsed.kind === "calendars") {
    const { exceptions: _exceptions, ...calendar } = parsed.data; void _exceptions;
    return { ...common, kind: "calendars", ...calendar, exceptionCount: integer(raw.exceptionCount) };
  }
  return { ...common, ...parsed.data } as ProductionResource;
}
async function projectOutcome(value: unknown, command: ProductionResourceCommand, fingerprint: string): Promise<VerifiedResourceOutcome> {
  const raw = object(value);
  if (raw.requestId !== command.requestId || raw.kind !== command.kind || raw.payloadHash !== fingerprint) throw new ProductionResourceError(502, "resource_receipt_mismatch");
  if (raw.status === "rejected") {
    const error = object(raw.error);
    if (![404, 409].includes(error.status as number) || typeof error.code !== "string" || !Object.hasOwn(messages, error.code)) return invalid();
    return { requestId: command.requestId, kind: command.kind, payloadHash: fingerprint, status: "rejected", error: { status: error.status as number, code: error.code } };
  }
  if (raw.status !== "applied" || typeof raw.changed !== "boolean") return invalid();
  const resource = projectResource(raw.resource, command.kind, false) as ProductionResource;
  const expectedVersion = command.action === "create" ? 1 : command.expectedVersion + (raw.changed ? 1 : 0);
  if ((command.action === "update" && resource.id !== command.resourceId) || resource.version !== expectedVersion || (command.action === "create" && !raw.changed)
    || JSON.stringify(productionResourceInput(resource)) !== JSON.stringify(command.data)) throw new ProductionResourceError(502, "resource_receipt_mismatch");
  if (raw.changed) {
    if (typeof raw.operationId !== "string" || !raw.operationId.startsWith("operation-") || "operation-" + uuid(raw.operationId.slice(10)) !== raw.operationId) return invalid();
  } else if (raw.operationId !== null) return invalid();
  return { requestId: command.requestId, kind: command.kind, payloadHash: fingerprint, status: "applied", resource, changed: raw.changed, operationId: raw.operationId as string | null };
}
export function createProductionResourceClient(fetchImpl: typeof fetch = fetch) {
  const prefix = "/api/v1/production-resources";
  async function request(path: string, command?: ProductionResourceCommand) {
    let response: Response;
    try { response = await fetchImpl(prefix + path, { method: command ? "POST" : "GET", credentials: "include", cache: "no-store", ...(command ? { headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1" }, body: JSON.stringify(command) } : {}) }); }
    catch { throw new ProductionResourceError(0, "resource_outcome_unknown"); }
    let data: unknown; try { data = await response.json(); } catch { throw new ProductionResourceError(response.status, "resource_outcome_unknown"); }
    return { response, data: object(data) };
  }
  function httpError(response: Response, data: Record<string, unknown>, mutation = false): never {
    const raw = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
    const code = response.status === 401 ? "authentication_required" : response.status === 403 ? "permission_denied" : typeof raw.code === "string" && Object.hasOwn(messages, raw.code) ? raw.code : "resource_outcome_unknown";
    throw new ProductionResourceError(response.status, code, mutation && response.status === 400 && code === "invalid_production_resource_command");
  }
  return {
    async list(kind: ProductionResourceType, query: ResourceListQuery): Promise<ResourceDirectory> {
      const params = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
      const { response, data } = await request(`/${kind}?${params}`); if (!response.ok) httpError(response, data);
      if (!Array.isArray(data.items) || data.items.length > query.limit || typeof data.canEdit !== "boolean" || integer(data.offset) !== query.offset || integer(data.limit, 1) !== query.limit) return invalid();
      const items = data.items.map(item => projectResource(item, kind, true) as ProductionResourceSummary), total = integer(data.total);
      if (new Set(items.map(item => item.id)).size !== items.length || items.length > total) return invalid();
      return { items, total, offset: query.offset, limit: query.limit, canEdit: data.canEdit };
    },
    async read(kind: ProductionResourceType, id: string): Promise<ProductionResource> {
      const expectedId = uuid(id), { response, data } = await request(`/${kind}/${expectedId}`); if (!response.ok) httpError(response, data);
      const resource = projectResource(data.resource, kind, false) as ProductionResource;
      if (resource.id !== expectedId) return invalid(); return resource;
    },
    async execute(value: ProductionResourceCommand, isCurrent: () => boolean = () => true) {
      if (!isCurrent()) throw new ProductionResourceError(0, "resource_owner_changed");
      const command = canonicalResourceCommand(value), fingerprint = await resourceCommandFingerprint(command);
      if (!isCurrent()) throw new ProductionResourceError(0, "resource_owner_changed");
      const { response, data } = await request("/commands", command);
      if (!response.ok && data.status !== "rejected") return httpError(response, data, true);
      const result = await projectOutcome(data, command, fingerprint);
      if ((result.status === "applied" && !response.ok) || (result.status === "rejected" && response.status !== result.error.status) || typeof data.replayed !== "boolean") return invalid();
      return { ...result, replayed: data.replayed };
    },
    async receipt(value: ProductionResourceCommand, isCurrent: () => boolean = () => true): Promise<ResourceReceipt> {
      if (!isCurrent()) throw new ProductionResourceError(0, "resource_owner_changed");
      const command = canonicalResourceCommand(value), fingerprint = await resourceCommandFingerprint(command);
      if (!isCurrent()) throw new ProductionResourceError(0, "resource_owner_changed");
      const { response, data } = await request(`/commands/${command.requestId}`); if (!response.ok) return httpError(response, data);
      if (data.requestId !== command.requestId) throw new ProductionResourceError(502, "resource_receipt_mismatch");
      if (data.state === "known") return { state: "known", requestId: command.requestId, result: await projectOutcome(data.result, command, fingerprint) };
      if (!["pending", "unknown"].includes(data.state as string) || data.result !== null) return invalid();
      return { state: data.state as "pending" | "unknown", requestId: command.requestId, result: null };
    },
  };
}
export const productionResourceClient = createProductionResourceClient();

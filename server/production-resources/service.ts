import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { productionGroupsForMasterData } from "../../features/operations-settings/model/master-data-presentation.js";
import { requirePermission } from "../auth/permissions.js";
import { readCurrentActor as currentActor } from "../auth/current-actor.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog, type ServerOperationLogInput } from "../operation-logs/repository.js";
import { lockProductionResourceScope } from "./snapshot-lock.js";
import {
  productionResourceUuid, PRODUCTION_RESOURCE_TYPES,
  type CalendarExceptionInput, type ProductionResourceInputs, type ProductionResourceType,
} from "./contract.js";
import { assertTransportPlanModeMembership, type SupplyHubInput, type TransportPlanInput } from "./logistics-contract.js";
import { managedResourceKind, parseManagedResourceCommand, type ManagedResourceCommand, type ManagedResourceType } from "./managed-contract.js";
import { assertLogisticsReceiptCapacity, checkTransportPlanDependencies, readTransportModes, rethrowLogisticsConstraint, storeTransportModes, type StoredTransportMode } from "./logistics-store.js";

type ManagedResourceInputs = ProductionResourceInputs & { hubs: SupplyHubInput; "transport-plans": Omit<TransportPlanInput, "modes"> & { modes: StoredTransportMode[] } };
export type ManagedProductionResource = {
  [K in ManagedResourceType]: ManagedResourceInputs[K] & {
    kind: K; id: string; version: number; createdAt: string; updatedAt: string;
  }
}[ManagedResourceType];
export type ProductionResource = Extract<ManagedProductionResource, { kind: ProductionResourceType }>;
type Calendar = Extract<ProductionResource, { kind: "calendars" }>;
type TransportPlan = Extract<ManagedProductionResource, { kind: "transport-plans" }>;
export type ProductionResourceSummary = Exclude<ProductionResource, Calendar> | (Omit<Calendar, "exceptions"> & { exceptionCount: number });
type ManagedResourceSummary = ProductionResourceSummary | Extract<ManagedProductionResource, { kind: "hubs" }> | (Omit<TransportPlan, "modes"> & { modeCount: number; enabledModeCount: number });
export type ResourceOutcome<R extends ManagedProductionResource = ProductionResource> = {
  requestId: string; kind: R["kind"]; status: "applied"; resource: R;
  changed: boolean; operationId: string | null;
} | {
  requestId: string; kind: R["kind"]; status: "rejected"; error: { status: number; code: string };
};
type ManagedOutcome = ResourceOutcome<ManagedProductionResource>;
type CommandResult<R extends ManagedProductionResource> = ResourceOutcome<R> & { payloadHash: string; replayed: boolean };
export type ResourceListQuery = { search: string; status: "enabled" | "disabled" | "all"; offset: number; limit: number };
const fail = (status: number, code: string): never => { throw new HttpError(status, code, code); };
const specifications = {
  calendars: { table: "production_calendars", edit: "settings.production_infrastructure.edit", entity: "ProductionCalendar", action: "修改生产日历" },
  sites: { table: "production_sites", edit: "settings.production_infrastructure.edit", entity: "ProductionSite", action: "修改生产地点" },
  groups: { table: "production_groups", edit: "settings.production_group.edit", entity: "ProductionGroup", action: "编辑生产组" },
  factories: { table: "production_outsource_factories", edit: "settings.outsource_factory.edit", entity: "OutsourceFactory", action: "编辑外发厂" },
  hubs: { table: "production_supply_hubs", edit: "settings.production_infrastructure.edit", entity: "SupplyHub", action: "修改供应枢纽" },
  "transport-plans": { table: "production_supply_routes", edit: "settings.production_infrastructure.edit", entity: "SupplyRoute", action: "修改供应路线" },
} as const;
export function productionResourceKind(value: unknown): ProductionResourceType {
  if (typeof value !== "string" || !(PRODUCTION_RESOURCE_TYPES as readonly string[]).includes(value)) return fail(400, "invalid_production_resource_kind");
  return value as ProductionResourceType;
}
export function parseResourceListQuery(params: URLSearchParams): ResourceListQuery {
  if ([...params.keys()].some(key => !["search", "status", "offset", "limit"].includes(key) || params.getAll(key).length !== 1)) fail(400, "invalid_production_resource_query");
  const number = (key: string, fallback: number, min: number, max: number) => {
    const raw = params.get(key); if (raw === null) return fallback;
    if (!/^\d{1,6}$/u.test(raw)) return fail(400, "invalid_production_resource_query");
    const value = Number(raw); if (value < min || value > max) fail(400, "invalid_production_resource_query"); return value;
  };
  const status = params.get("status") ?? "all", search = (params.get("search") ?? "").trim();
  if (!["enabled", "disabled", "all"].includes(status) || search.length > 200 || search.includes("\0") || search.split(/\s+/u).length > 10) fail(400, "invalid_production_resource_query");
  return { search, status: status as ResourceListQuery["status"], offset: number("offset", 0, 0, 100000), limit: number("limit", 50, 1, 100) };
}
async function available(client: PoolClient, kind?: ManagedResourceType) {
  const tables = [...PRODUCTION_RESOURCE_TYPES.map(kind => specifications[kind].table), "production_calendar_exceptions", "production_resource_commands"];
  if (kind === "hubs" || kind === "transport-plans") tables.push("production_supply_hubs", "production_supply_routes", "production_transport_modes");
  const row = (await client.query<{ ready: boolean }>("SELECT bool_and(to_regclass('public.'||name) IS NOT NULL) AS ready FROM unnest($1::text[]) name", [tables])).rows[0];
  if (!row.ready) fail(503, "production_resources_unavailable");
}
function canRead(actor: TrustedIdentity, kind: ManagedResourceType) {
  const permissions: PermissionKey[] = ["schedule.view", specifications[kind].edit];
  // A group editor needs its site/calendar selectors, not edit access to them.
  if (kind === "calendars" || kind === "sites") permissions.push("settings.production_group.edit");
  if (!permissions.some(permission => actor.permissions.includes(permission))) requirePermission(actor.permissions, permissions[0]);
}
type Row = {
  id: string; name: string; enabled: boolean; remark: string; version: number; created_at: Date; updated_at: Date;
  short_name: string; working_weekdays: number[]; exception_count: number;
  production_calendar_id: string; country_code: string | null; pre_production_sample_lead_days: number;
  production_site_id: string; sort_order: number; contact_person: string; phone: string;
  supply_hub_id: string; mode_count: number; enabled_mode_count: number;
};
function mapResource(kind: ManagedResourceType, row: Row, exceptions: CalendarExceptionInput[] = [], modes: StoredTransportMode[] = []): ManagedProductionResource {
  const common = { id: row.id, name: row.name, enabled: row.enabled, remark: row.remark, version: row.version, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
  switch (kind) {
    case "calendars": return { ...common, kind, workingWeekdays: row.working_weekdays, exceptions };
    case "sites": return { ...common, kind, countryCode: row.country_code, productionCalendarId: row.production_calendar_id, preProductionSampleLeadDays: row.pre_production_sample_lead_days };
    case "groups": return { ...common, kind, shortName: row.short_name, productionSiteId: row.production_site_id, sortOrder: row.sort_order };
    case "factories": return { ...common, kind, shortName: row.short_name, contactPerson: row.contact_person, phone: row.phone };
    case "hubs": return { ...common, kind };
    case "transport-plans": return { ...common, kind, supplyHubId: row.supply_hub_id, productionSiteId: row.production_site_id, modes };
  }
}
async function getResource<K extends ManagedResourceType>(client: PoolClient, kind: K, id: string, lock: boolean | "share" = false): Promise<Extract<ManagedProductionResource, { kind: K }>> {
  const row = (await client.query<Row>(`SELECT * FROM ${specifications[kind].table} WHERE id=$1::uuid ${lock ? lock === "share" ? "FOR SHARE" : "FOR UPDATE" : ""}`, [id])).rows[0];
  if (!row) return fail(404, "production_resource_not_found");
  const exceptions = kind === "calendars" ? (await client.query<CalendarExceptionInput>(`SELECT exception_date::text AS date,exception_type AS type,name
    FROM production_calendar_exceptions WHERE calendar_id=$1 ORDER BY exception_date`, [id])).rows : [];
  const modes = kind === "transport-plans" ? await readTransportModes(client, id, lock) : [];
  return mapResource(kind, row, exceptions, modes) as Extract<ManagedProductionResource, { kind: K }>;
}
/** Internal repository primitive. Caller supplies transaction, domain authority
 * and, for freeze=true, the shared resource-snapshot scope lock. */
export async function readProductionResourceSnapshot(client: PoolClient, kindInput: ProductionResourceType, idInput: string, freeze = false): Promise<ProductionResource> {
  return getResource(client, productionResourceKind(kindInput), productionResourceUuid(idInput), freeze ? "share" : false);
}
async function readTransaction<T>(pool: Pool, identity: TrustedIdentity, fn: (client: PoolClient, actor: TrustedIdentity) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const actor = await currentActor(client, identity); await available(client);
    const result = await fn(client, actor); await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function readProductionResource<K extends ManagedResourceType>(pool: Pool, identity: TrustedIdentity, kindInput: K, idInput: string) {
  const kind = managedResourceKind(kindInput) as K, id = productionResourceUuid(idInput);
  return readTransaction(pool, identity, async (client, actor) => { canRead(actor, kind); await available(client, kind); return getResource(client, kind, id); });
}
export async function listProductionResources(pool: Pool, identity: TrustedIdentity, kindInput: ManagedResourceType, input: ResourceListQuery) {
  const kind = managedResourceKind(kindInput);
  const query = parseResourceListQuery(new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])));
  return readTransaction(pool, identity, async (client, actor) => {
    canRead(actor, kind); await available(client, kind);
    const values: unknown[] = [], clauses: string[] = [];
    if (query.status !== "all") { values.push(query.status === "enabled"); clauses.push(`r.enabled=$${values.length}`); }
    const shortName = kind === "groups" || kind === "factories" ? "r.short_name" : "''";
    const contact = kind === "factories" ? ",r.contact_person,r.phone" : "";
    for (const token of query.search.split(/\s+/u).filter(Boolean)) {
      values.push(token.toLowerCase()); clauses.push(`strpos(lower(concat_ws(' ',r.name,${shortName},r.remark${contact})),$${values.length})>0`);
    }
    // Complete bounded candidate set is required before reusing the existing natural group sort.
    const counts = kind === "calendars" ? ", (SELECT count(*)::int FROM production_calendar_exceptions e WHERE e.calendar_id=r.id) AS exception_count"
      : kind === "transport-plans" ? ", (SELECT count(*)::int FROM production_transport_modes m WHERE m.route_id=r.id) AS mode_count, (SELECT count(*)::int FROM production_transport_modes m WHERE m.route_id=r.id AND m.enabled) AS enabled_mode_count" : "";
    const rows = (await client.query<Row>(`SELECT r.*${counts}
      FROM ${specifications[kind].table} r ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} LIMIT 5001`, values)).rows;
    if (rows.length > 5000) return fail(422, "production_resource_search_too_broad");
    let items: ManagedResourceSummary[] = rows.map(row => {
      const resource = mapResource(kind, row);
      if (resource.kind === "calendars") {
        const { exceptions: _exceptions, ...summary } = resource; void _exceptions;
        return { ...summary, exceptionCount: row.exception_count };
      }
      if (resource.kind === "transport-plans") {
        const { modes: _modes, ...summary } = resource; void _modes;
        return { ...summary, modeCount: row.mode_count, enabledModeCount: row.enabled_mode_count };
      }
      return resource;
    });
    if (kind === "groups") {
      const groups = items as Extract<ProductionResource, { kind: "groups" }>[];
      const byId = new Map(groups.map(group => [group.id, group]));
      items = productionGroupsForMasterData(groups).map(group => byId.get(group.id)!);
    } else items.sort((a, b) => a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id));
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length, offset: query.offset, limit: query.limit, canEdit: actor.permissions.includes(specifications[kind].edit) };
  });
}
async function checkDependencies(client: PoolClient, command: ManagedResourceCommand) {
  if (command.kind === "transport-plans") await checkTransportPlanDependencies(client, command);
  if (command.kind === "sites") {
    const calendar = (await client.query<{ enabled: boolean }>("SELECT enabled FROM production_calendars WHERE id=$1 FOR SHARE", [command.data.productionCalendarId])).rows[0];
    if (!calendar) fail(409, "production_calendar_not_found");
    if (command.data.enabled && !calendar.enabled) fail(409, "production_calendar_disabled");
  }
  if (command.kind === "groups") {
    const row = (await client.query<{ site_enabled: boolean; calendar_enabled: boolean }>(`SELECT s.enabled AS site_enabled,c.enabled AS calendar_enabled
      FROM production_sites s JOIN production_calendars c ON c.id=s.production_calendar_id WHERE s.id=$1 FOR SHARE OF s,c`, [command.data.productionSiteId])).rows[0];
    if (!row) fail(409, "production_site_not_found");
    if (command.data.enabled && !row.site_enabled) fail(409, "production_site_disabled");
    if (command.data.enabled && !row.calendar_enabled) fail(409, "production_calendar_disabled");
  }
}
function fields(command: ManagedResourceCommand): Record<string, unknown> {
  const common = { name: command.data.name, enabled: command.data.enabled, remark: command.data.remark };
  switch (command.kind) {
    case "calendars": return { ...common, working_weekdays: command.data.workingWeekdays };
    case "sites": return { ...common, country_code: command.data.countryCode, production_calendar_id: command.data.productionCalendarId, pre_production_sample_lead_days: command.data.preProductionSampleLeadDays };
    case "groups": return { ...common, short_name: command.data.shortName, production_site_id: command.data.productionSiteId, sort_order: command.data.sortOrder };
    case "factories": return { ...common, short_name: command.data.shortName, contact_person: command.data.contactPerson, phone: command.data.phone };
    case "hubs": return common;
    case "transport-plans": return { ...common, supply_hub_id: command.data.supplyHubId, production_site_id: command.data.productionSiteId };
  }
}
function resourceData(resource: ManagedProductionResource) {
  const { id: _id, version: _version, createdAt: _createdAt, updatedAt: _updatedAt, kind: _kind, ...data } = resource;
  void _id; void _version; void _createdAt; void _updatedAt; void _kind;
  return data;
}
function snapshot(resource: ManagedProductionResource | null) {
  if (!resource) return null;
  const labels: Record<string, string> = { name: "名称", enabled: "状态", remark: "备注", shortName: "简称", workingWeekdays: "每周工作日", exceptions: "特殊日期", countryCode: "国家/地区", productionCalendarId: "生产日历", preProductionSampleLeadDays: "产前准备天数", productionSiteId: "生产地点", sortOrder: "排序", contactPerson: "联系人", phone: "电话", supplyHubId: "集货仓", modes: "运输方式" };
  const values: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(resourceData(resource))) values[labels[key]] = typeof value === "boolean" ? (value ? "启用" : "停用") : Array.isArray(value) ? JSON.stringify(value) : value;
  return { objectName: resource.name, values };
}
function auditAction(kind: ManagedResourceType, before: ManagedProductionResource | null, after: ManagedProductionResource): ServerOperationLogInput["action"] {
  if (kind === "groups") return !before ? "创建生产组" : before.enabled !== after.enabled ? (after.enabled ? "启用生产组" : "停用生产组") : "编辑生产组";
  if (kind === "factories") return !before ? "创建外发厂" : before.enabled !== after.enabled ? (after.enabled ? "启用外发厂" : "停用外发厂") : "编辑外发厂";
  return specifications[kind].action;
}
async function apply(client: PoolClient, actor: TrustedIdentity, command: ManagedResourceCommand): Promise<ManagedOutcome> {
  const before = command.action === "update" ? await getResource(client, command.kind, command.resourceId, true) : null;
  if (before && before.version !== command.expectedVersion) fail(409, "production_resource_version_conflict");
  if (command.kind === "transport-plans") assertTransportPlanModeMembership(command, before?.kind === "transport-plans" ? before.modes.map(mode => mode.modeId) : []);
  await checkDependencies(client, command);
  if (before && JSON.stringify(resourceData(before)) === JSON.stringify(command.data)) return { requestId: command.requestId, kind: command.kind, status: "applied", resource: before, changed: false, operationId: null };
  if (before?.version === 2147483647) fail(409, "production_resource_version_exhausted");
  const table = specifications[command.kind].table, data = fields(command), keys = Object.keys(data), values = Object.values(data);
  let id: string;
  if (command.action === "create") {
    const row = (await client.query<{ id: string }>(`INSERT INTO ${table}(${keys.join(",")},created_by,updated_by)
      VALUES(${keys.map((_, index) => "$" + (index + 1)).join(",")},$${values.length + 1},$${values.length + 1}) RETURNING id::text`, [...values, actor.internalUserId])).rows[0]; id = row.id;
  } else {
    const row = (await client.query<{ id: string }>(`UPDATE ${table} SET ${keys.map((key, index) => `${key}=$${index + 1}`).join(",")},updated_by=$${values.length + 1},version=version+1
      WHERE id=$${values.length + 2}::uuid AND version=$${values.length + 3} RETURNING id::text`, [...values, actor.internalUserId, command.resourceId, command.expectedVersion])).rows[0];
    if (!row) return fail(409, "production_resource_version_conflict"); id = row.id;
  }
  if (command.kind === "calendars") {
    await client.query("DELETE FROM production_calendar_exceptions WHERE calendar_id=$1 AND NOT(exception_date=ANY($2::date[]))", [id, command.data.exceptions.map(item => item.date)]);
    await client.query(`INSERT INTO production_calendar_exceptions(calendar_id,exception_date,exception_type,name)
      SELECT $1,e.date::date,e.type,e.name FROM jsonb_to_recordset($2::jsonb) AS e(date TEXT,type TEXT,name TEXT)
      ON CONFLICT(calendar_id,exception_date) DO UPDATE SET exception_type=EXCLUDED.exception_type,name=EXCLUDED.name`, [id, JSON.stringify(command.data.exceptions)]);
  }
  if (command.kind === "transport-plans") await storeTransportModes(client, actor, id, command);
  const resource = await getResource(client, command.kind, id);
  const audit = await appendOperationLog(client, actor, { module: "基础设置", entityType: specifications[command.kind].entity, entityId: id, action: auditAction(command.kind, before, resource),
    beforeData: snapshot(before), afterData: snapshot(resource), metadata: { command: command.action, requestId: command.requestId, appliedVersion: resource.version } });
  return { requestId: command.requestId, kind: command.kind, status: "applied", resource, changed: true, operationId: audit.operationId };
}
function commandLock(actor: TrustedIdentity, requestId: string) { return `production-resource:${actor.internalUserId}:${requestId}`; }
export function executeProductionResourceCommand<C extends ManagedResourceCommand>(pool: Pool, identity: TrustedIdentity, input: C): Promise<CommandResult<Extract<ManagedProductionResource, { kind: C["kind"] }>>>;
export async function executeProductionResourceCommand(pool: Pool, identity: TrustedIdentity, input: ManagedResourceCommand) {
  const command = parseManagedResourceCommand(input), digest = createHash("sha256").update(JSON.stringify(command)).digest("hex"), client = await pool.connect();
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='5s'");
    const actor = await currentActor(client, identity, true); requirePermission(actor.permissions, specifications[command.kind].edit); await available(client, command.kind);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [commandLock(actor, command.requestId)]);
    const prior = (await client.query<{ payload_hash: string; result: ManagedOutcome }>("SELECT payload_hash,result FROM production_resource_commands WHERE actor_id=$1 AND request_id=$2", [actor.internalUserId, command.requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== digest) fail(409, "production_resource_request_conflict");
      await client.query("COMMIT"); return { ...prior.result, payloadHash: prior.payload_hash, replayed: true };
    }
    await lockProductionResourceScope(client, "write");
    await client.query("SAVEPOINT resource_apply");
    let result: ManagedOutcome;
    try {
      try { result = await apply(client, actor, command); } catch (error) { rethrowLogisticsConstraint(error); }
      if (command.kind === "hubs" || command.kind === "transport-plans") await assertLogisticsReceiptCapacity(client, result);
    }
    catch (error) {
      const boundedRejection = (command.kind === "hubs" || command.kind === "transport-plans") && error instanceof HttpError && error.status === 422 && error.code === "logistics_result_too_large";
      if (!(error instanceof HttpError) || (!boundedRejection && ![404, 409].includes(error.status))) throw error;
      await client.query("ROLLBACK TO SAVEPOINT resource_apply");
      result = { requestId: command.requestId, kind: command.kind, status: "rejected", error: { status: error.status, code: error.code } };
    }
    await client.query("INSERT INTO production_resource_commands(actor_id,request_id,kind,payload_hash,result) VALUES($1,$2,$3,$4,$5::jsonb)", [actor.internalUserId, command.requestId, command.kind, digest, JSON.stringify(result)]);
    await client.query("COMMIT"); return { ...result, payloadHash: digest, replayed: false };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function readProductionResourceReceipt(pool: Pool, identity: TrustedIdentity, requestInput: string) {
  const requestId = productionResourceUuid(requestInput), client = await pool.connect();
  try {
    await client.query("BEGIN"); const actor = await currentActor(client, identity); await available(client);
    if (!Object.values(specifications).some(spec => actor.permissions.includes(spec.edit))) fail(403, "permission_denied");
    const lock = (await client.query<{ ready: boolean }>("SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1,0)) AS ready", [commandLock(actor, requestId)])).rows[0].ready;
    const row = lock ? (await client.query<{ kind: ManagedResourceType; payload_hash: string; result: ManagedOutcome }>("SELECT kind,payload_hash,result FROM production_resource_commands WHERE actor_id=$1 AND request_id=$2", [actor.internalUserId, requestId])).rows[0] : null;
    if (row) requirePermission(actor.permissions, specifications[row.kind].edit);
    await client.query("COMMIT");
    return row ? { state: "known" as const, requestId, result: { ...row.result, payloadHash: row.payload_hash } } : { state: lock ? "unknown" as const : "pending" as const, requestId, result: null };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

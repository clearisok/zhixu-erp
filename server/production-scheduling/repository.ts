import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpError } from "../http/errors.js";
import { canonicalDecimal } from "../quotes/decimal-projection.js";
import { effectiveOrderJoins, sourceOwnerSql } from "../sales-orders/effective-order-sql.js";
import { readStableOrderColors } from "../sales-orders/color-identities.js";
import { readProductionResourceSnapshot, type ProductionResource } from "../production-resources/service.js";
import { SCHEDULE_PLANNING_LIMITS } from "./planning-preview.js";

export const planFail = (status: number, code: string): never => { throw new HttpError(status, code, code); };
export function planHash(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export type ResourceFacts = { schemaVersion: "production-resource.v1"; executionType: "internal";
  group: Extract<ProductionResource, { kind: "groups" }>; site: Extract<ProductionResource, { kind: "sites" }>; calendar: Extract<ProductionResource, { kind: "calendars" }>
} | { schemaVersion: "production-resource.v1"; executionType: "outsource"; factory: Extract<ProductionResource, { kind: "factories" }> };
export type Assignment = {
  id: string; orderId: string; version: number; executionType: "internal" | "outsource";
  productionGroupId: string | null; outsourceFactoryId: string | null; colorId: string | null; colorNameSnapshot: string | null;
  plannedQuantity: string; durationMode: "average_daily_output" | "workdays"; dailyOutputSnapshot: string; requiredWorkdays: number;
  dateMode: "auto_queue" | "manual_fixed"; plannedStartDate: string; firstProductionDate: string | null; plannedEndDate: string;
  nonWorkingDayCount: number | null; queueSequence: number | null; resourceSnapshotHash: string; status: "planned" | "cancelled"; remark: string;
  createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
};
export type StoredAssignment = Assignment & { resourceFacts: ResourceFacts };
type DatabaseRow = Omit<StoredAssignment, "createdAt" | "updatedAt" | "queueSequence"> & { createdAt: Date; updatedAt: Date; queueSequence: string | null };
const columns = `a.id::text,a.sales_order_id::text AS "orderId",a.version,a.execution_type AS "executionType",
 a.production_group_id::text AS "productionGroupId",a.outsource_factory_id::text AS "outsourceFactoryId",a.color_id::text AS "colorId",a.color_name_snapshot AS "colorNameSnapshot",
 a.planned_quantity::text AS "plannedQuantity",a.duration_mode AS "durationMode",a.daily_output_snapshot::text AS "dailyOutputSnapshot",a.required_workdays AS "requiredWorkdays",
 a.date_mode AS "dateMode",a.planned_start_date::text AS "plannedStartDate",a.first_production_date::text AS "firstProductionDate",a.planned_end_date::text AS "plannedEndDate",
 a.non_working_day_count AS "nonWorkingDayCount",a.queue_sequence::text AS "queueSequence",a.resource_snapshot_hash AS "resourceSnapshotHash",a.status,a.remark,
 a.created_by::text AS "createdBy",a.updated_by::text AS "updatedBy",a.created_at AS "createdAt",a.updated_at AS "updatedAt",s.facts AS "resourceFacts"`;
const from = "FROM production_schedule_assignments a JOIN production_schedule_resource_snapshots s ON s.hash=a.resource_snapshot_hash";
const map = (row: DatabaseRow): StoredAssignment => {
  if (planHash(row.resourceFacts) !== row.resourceSnapshotHash) planFail(503, "production_resource_snapshot_invalid");
  return { ...row, plannedQuantity: canonicalDecimal(row.plannedQuantity), dailyOutputSnapshot: canonicalDecimal(row.dailyOutputSnapshot),
    queueSequence: row.queueSequence === null ? null : Number(row.queueSequence), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
};
export function publicAssignment(row: StoredAssignment): Assignment { const { resourceFacts: _facts, ...result } = row; void _facts; return result; }
export async function productionPlansAvailable(client: PoolClient) {
  const names = ["production_schedule_resource_snapshots", "production_order_plan_heads", "production_group_plan_heads", "production_schedule_assignments", "production_schedule_plan_versions", "production_schedule_commands", "production_schedule_command_orders"];
  if (!(await client.query<{ ready: boolean }>("SELECT bool_and(to_regclass('public.'||name) IS NOT NULL) ready FROM unnest($1::text[]) name", [names])).rows[0].ready) planFail(503, "production_plans_unavailable");
}
export async function assignmentsForOrder(client: PoolClient, orderId: string): Promise<StoredAssignment[]> {
  const rows = (await client.query<DatabaseRow>(`SELECT ${columns} ${from} WHERE a.sales_order_id=$1 ORDER BY a.created_at,a.id LIMIT 501`, [orderId])).rows;
  if (rows.length > SCHEDULE_PLANNING_LIMITS.queueRows) planFail(422, "production_order_plan_limit"); return rows.map(map);
}
export async function assignmentsForGroup(client: PoolClient, groupId: string): Promise<StoredAssignment[]> {
  const rows = (await client.query<DatabaseRow>(`SELECT ${columns} ${from} WHERE a.production_group_id=$1 AND a.status='planned' ORDER BY a.queue_sequence,a.created_at,a.id LIMIT 501`, [groupId])).rows;
  if (rows.length > SCHEDULE_PLANNING_LIMITS.queueRows) planFail(422, "production_queue_limit"); return rows.map(map);
}
export async function readAssignment(client: PoolClient, id: string) {
  const row = (await client.query<DatabaseRow>(`SELECT ${columns} ${from} WHERE a.id=$1`, [id])).rows[0];
  return row ? map(row) : planFail(404, "production_assignment_not_found");
}
export async function orderPlanVersion(client: PoolClient, id: string) { return (await client.query<{ version: number }>("SELECT version FROM production_order_plan_heads WHERE sales_order_id=$1", [id])).rows[0]?.version ?? 0; }
export async function groupPlanVersion(client: PoolClient, id: string) { return (await client.query<{ version: number }>("SELECT version FROM production_group_plan_heads WHERE production_group_id=$1", [id])).rows[0]?.version ?? 0; }
export async function readOrderPlanFacts(client: PoolClient, orderId: string) {
  // Only non-monetary fields are selected. In particular batch confirmations,
  // Quote/CCT and commercial versions are not needed before production planning.
  const order = (await client.query<{ id: string; orderNo: string; lifecycleState: string; version: number; effectiveOrderId: string; attributionVersion: number; quantity: string | null; styleNo: string | null; sourceHash: string | null; deliveryDate: string | null; batchVersion: number | null }>(`SELECT so.id::text,so.order_no AS "orderNo",so.lifecycle_state AS "lifecycleState",so.version,
    attribution.effective_order_id::text AS "effectiveOrderId",attribution.attribution_version AS "attributionVersion",
    COALESCE(m.quantity,b.quantity)::text AS quantity,COALESCE(m.inside_order_no,b.business_style_no) AS "styleNo",m.source_hash AS "sourceHash",
    COALESCE(m.contract_delivery_date,b.delivery_date)::text AS "deliveryDate",b.version AS "batchVersion"
    FROM sales_orders so ${effectiveOrderJoins(true)} LEFT JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=${sourceOwnerSql(true)}
    LEFT JOIN processing_order_batch_consumptions bc ON bc.sales_order_id=so.id LEFT JOIN processing_order_batches b ON b.id=bc.batch_id WHERE so.id=$1`, [orderId])).rows[0];
  if (!order) return planFail(404, "sales_order_not_found");
  const deliveryPlans = (await client.query<{ id: string; date: string | null; quantity: string }>("SELECT id::text,delivery_date::text AS date,quantity::text FROM sales_order_delivery_plans WHERE sales_order_id=$1 AND voided_at IS NULL ORDER BY delivery_date,id LIMIT 1001", [orderId])).rows;
  if (deliveryPlans.length > 1000) planFail(422, "production_delivery_projection_limit");
  return { ...order, colors: await readStableOrderColors(client, orderId), deliveryPlans, planVersion: await orderPlanVersion(client, orderId) };
}
export async function currentResourceFacts(client: PoolClient, type: "internal" | "outsource", id: string, freeze: boolean): Promise<ResourceFacts> {
  if (type === "outsource") {
    const factory = await readProductionResourceSnapshot(client, "factories", id, freeze);
    if (factory.kind !== "factories") return planFail(503, "production_resource_type_invalid");
    if (!factory.enabled) planFail(409, "production_factory_disabled");
    return { schemaVersion: "production-resource.v1", executionType: type, factory };
  }
  const group = await readProductionResourceSnapshot(client, "groups", id, freeze);
  if (group.kind !== "groups") return planFail(503, "production_resource_type_invalid");
  const site = await readProductionResourceSnapshot(client, "sites", group.productionSiteId, freeze);
  if (site.kind !== "sites") return planFail(503, "production_resource_type_invalid");
  const calendar = await readProductionResourceSnapshot(client, "calendars", site.productionCalendarId, freeze);
  if (calendar.kind !== "calendars") return planFail(503, "production_resource_type_invalid");
  if (!group.enabled || !site.enabled || !calendar.enabled) planFail(409, "production_resources_disabled");
  return { schemaVersion: "production-resource.v1", executionType: type, group, site, calendar };
}
export async function storeResourceFacts(client: PoolClient, facts: ResourceFacts) {
  const hash = planHash(facts);
  await client.query("INSERT INTO production_schedule_resource_snapshots(hash,facts) VALUES($1,$2) ON CONFLICT(hash) DO NOTHING", [hash, facts]);
  if (planHash((await client.query<{ facts: ResourceFacts }>("SELECT facts FROM production_schedule_resource_snapshots WHERE hash=$1", [hash])).rows[0].facts) !== hash) planFail(409, "production_resource_snapshot_conflict");
  return hash;
}
export async function persistAssignment(client: PoolClient, row: StoredAssignment, create: boolean) {
  const fields = { sales_order_id: row.orderId, version: row.version, execution_type: row.executionType, production_group_id: row.productionGroupId,
    outsource_factory_id: row.outsourceFactoryId, color_id: row.colorId, color_name_snapshot: row.colorNameSnapshot, planned_quantity: row.plannedQuantity,
    duration_mode: row.durationMode, daily_output_snapshot: row.dailyOutputSnapshot, required_workdays: row.requiredWorkdays, date_mode: row.dateMode,
    planned_start_date: row.plannedStartDate, first_production_date: row.firstProductionDate, planned_end_date: row.plannedEndDate, non_working_day_count: row.nonWorkingDayCount,
    queue_sequence: row.queueSequence, resource_snapshot_hash: row.resourceSnapshotHash, status: row.status, remark: row.remark, updated_by: row.updatedBy };
  const keys = Object.keys(fields), values: unknown[] = Object.values(fields);
  if (create) await client.query(`INSERT INTO production_schedule_assignments(${keys.join(",")},id,created_by) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")},$${keys.length + 1},$${keys.length + 2})`, [...values, row.id, row.createdBy]);
  else {
    const result = await client.query(`UPDATE production_schedule_assignments SET ${keys.map((key, i) => `${key}=$${i + 1}`).join(",")},updated_at=now() WHERE id=$${keys.length + 1} AND version=$${keys.length + 2}`, [...values, row.id, row.version - 1]);
    if (result.rowCount !== 1) planFail(409, "production_assignment_version_conflict");
  }
}
export async function bumpPlanHeads(client: PoolClient, orders: readonly string[], groups: readonly string[]) {
  for (const id of [...orders].sort()) await client.query("INSERT INTO production_order_plan_heads(sales_order_id,version) VALUES($1,1) ON CONFLICT(sales_order_id) DO UPDATE SET version=production_order_plan_heads.version+1", [id]);
  for (const id of [...groups].sort()) await client.query("INSERT INTO production_group_plan_heads(production_group_id,version) VALUES($1,1) ON CONFLICT(production_group_id) DO UPDATE SET version=production_group_plan_heads.version+1", [id]);
}

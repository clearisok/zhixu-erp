import type { PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import type { StoredOrderTracking } from "../production-scheduling/tracking-store.js";
import { canonicalPlanJson } from "../production-scheduling/canonical-json.js";
import { arrivalFail, type ArrivalBatch } from "./contract.js";
import type { ArrivalDemand, ArrivalGeneration } from "./source.js";

export type ArrivalTracking = Pick<StoredOrderTracking, "id" | "version" | "supplyHubId"> & {
  hubSnapshot: Pick<NonNullable<StoredOrderTracking["hubSnapshot"]>, "id" | "name" | "enabled" | "version"> | null };
export function arrivalTrackingBasis(row: StoredOrderTracking | null): ArrivalTracking | null {
  if (!row) return null;
  const hub = row.hubSnapshot;
  return { id: row.id, version: row.version, supplyHubId: row.supplyHubId,
    hubSnapshot: hub ? { id: hub.id, name: hub.name, enabled: hub.enabled, version: hub.version } : null };
}
export type ArrivalBasis = { dateSource: "manual"; batches: ArrivalBatch[]; demands: ArrivalDemand[]; source: ArrivalGeneration;
  tracking: ArrivalTracking | null };
export type StoredArrivalPlan = { id: string; orderId: string; canonicalKey: string; canonicalIdentity: ArrivalDemand["canonicalIdentity"];
  supplyHubId: string | null; sourceRunId: string; data: ArrivalBasis; version: number; createdAt: string; updatedAt: string };
type PlanRow = Omit<StoredArrivalPlan, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };
const columns = `id::text,sales_order_id::text AS "orderId",canonical_key AS "canonicalKey",canonical_identity AS "canonicalIdentity",
  supply_hub_id::text AS "supplyHubId",source_run_id::text AS "sourceRunId",data,version,created_at AS "createdAt",updated_at AS "updatedAt"`;
const map = (row: PlanRow): StoredArrivalPlan => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
export async function materialArrivalsAvailable(client: PoolClient) {
  const names = ["material_arrival_demands", "material_arrival_plans", "material_arrival_plan_versions", "material_arrival_commands", "material_arrival_command_orders", "production_order_execution_trackings"];
  if (!(await client.query<{ ready: boolean }>("SELECT bool_and(to_regclass('public.'||name) IS NOT NULL) ready FROM unnest($1::text[]) name", [names])).rows[0].ready)
    arrivalFail(503, "material_arrivals_unavailable");
}
export function boundArrivalPayload(value: unknown, bytes = 1024 * 1024) {
  if (Buffer.byteLength(JSON.stringify(value)) > bytes) arrivalFail(422, "material_arrival_projection_limit");
}
export async function readArrivalPlans(client: PoolClient, orderId: string) {
  const rows = (await client.query<PlanRow>(`SELECT ${columns} FROM material_arrival_plans WHERE sales_order_id=$1 ORDER BY canonical_key LIMIT 501`, [orderId])).rows;
  if (rows.length > 500) arrivalFail(422, "material_arrival_projection_limit"); return rows.map(map);
}
export async function readArrivalPlan(client: PoolClient, orderId: string, key: string) {
  const row = (await client.query<PlanRow>(`SELECT ${columns} FROM material_arrival_plans WHERE sales_order_id=$1 AND canonical_key=$2`, [orderId, key])).rows[0];
  return row ? map(row) : null;
}
export async function verifyArrivalDemandRegistry(client: PoolClient, orderId: string, demands: ArrivalDemand[]) {
  const current = new Map(demands.map(row => [row.id, row]));
  const keys = new Map(demands.map(row => [row.identityKey, row]));
  const registered = (await client.query<{ id: string; sales_order_id: string; canonical_key: string; identity_key: string; identity: unknown }>(
    "SELECT id::text,sales_order_id::text,canonical_key,identity_key,identity FROM material_arrival_demands WHERE id=ANY($1::uuid[]) OR (sales_order_id=$2 AND identity_key=ANY($3::text[]))", [[...current.keys()], orderId, [...keys.keys()]])).rows;
  for (const row of registered) {
    const candidate = current.get(row.id) ?? keys.get(row.identity_key);
    if (candidate && (row.id !== candidate.id || row.sales_order_id !== orderId || row.canonical_key !== candidate.canonicalKey || row.identity_key !== candidate.identityKey
      || canonicalPlanJson(row.identity) !== canonicalPlanJson(candidate.identity))) arrivalFail(409, "material_arrival_identity_conflict");
  }
}
export async function persistArrivalPlan(client: PoolClient, actor: TrustedIdentity, orderId: string, key: string,
  canonicalIdentity: ArrivalDemand["canonicalIdentity"], before: StoredArrivalPlan | null, data: ArrivalBasis, requestId: string, operationId: string) {
  boundArrivalPayload(data, 24000);
  const bytes = (await client.query<{ bytes: number }>("SELECT octet_length($1::jsonb::text) AS bytes", [data])).rows[0].bytes;
  if (bytes > 24576) arrivalFail(422, "material_arrival_projection_limit");
  for (const demand of data.demands) {
    boundArrivalPayload(demand.identity, 8000);
    await client.query(`INSERT INTO material_arrival_demands(id,sales_order_id,canonical_key,identity_key,identity,created_by)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [demand.id, orderId, key, demand.identityKey, demand.identity, actor.internalUserId]);
  }
  await verifyArrivalDemandRegistry(client, orderId, data.demands);
  const values = [orderId, key, canonicalIdentity, data.tracking?.supplyHubId ?? null, data.source.runId, data, actor.internalUserId];
  if (!before) await client.query(`INSERT INTO material_arrival_plans(sales_order_id,canonical_key,canonical_identity,supply_hub_id,source_run_id,data,created_by,updated_by,version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7,1)`, values);
  else {
    const result = await client.query(`UPDATE material_arrival_plans SET supply_hub_id=$4,source_run_id=$5,data=$6,updated_by=$7,version=version+1,updated_at=clock_timestamp()
      WHERE sales_order_id=$1 AND canonical_key=$2 AND canonical_identity=$3 AND version=$8`, [...values, before.version]);
    if (result.rowCount !== 1) arrivalFail(409, "material_arrival_version_conflict");
  }
  await client.query(`INSERT INTO material_arrival_plan_versions(plan_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id)
    SELECT id,sales_order_id,version,material_arrival_plan_row_snapshot(p),$3,$4,$5 FROM material_arrival_plans p WHERE sales_order_id=$1 AND canonical_key=$2`,
  [orderId, key, actor.internalUserId, requestId, operationId]);
  return (await readArrivalPlan(client, orderId, key))!;
}

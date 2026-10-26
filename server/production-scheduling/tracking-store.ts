import type { PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import type { readProductionSupplyHubSnapshot } from "../production-resources/service.js";
import { planFail } from "./repository.js";
import type { OrderTrackingData } from "./tracking-contract.js";

export type TrackingHubSnapshot = Awaited<ReturnType<typeof readProductionSupplyHubSnapshot>>;
export type StoredOrderTracking = OrderTrackingData & { id: string; orderId: string; version: number;
  hubSnapshot: TrackingHubSnapshot | null; createdAt: string; updatedAt: string };
export async function orderTrackingAvailable(client: PoolClient) {
  const names = ["production_order_execution_trackings", "production_order_execution_tracking_versions", "production_supply_hubs"];
  if (!(await client.query<{ ready: boolean }>("SELECT bool_and(to_regclass('public.'||name) IS NOT NULL) ready FROM unnest($1::text[]) name", [names])).rows[0].ready) planFail(503, "order_tracking_unavailable");
}
export async function readStoredOrderTracking(client: PoolClient, orderId: string): Promise<StoredOrderTracking | null> {
  const row = (await client.query<Omit<StoredOrderTracking, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date }>(`SELECT id::text,sales_order_id::text AS "orderId",supply_hub_id::text AS "supplyHubId",
    hub_snapshot AS "hubSnapshot",remark,version,created_at AS "createdAt",updated_at AS "updatedAt" FROM production_order_execution_trackings WHERE sales_order_id=$1`, [orderId])).rows[0];
  return row ? { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } : null;
}
/** Caller owns the shared command transaction, physical-order and resource freeze. */
export async function persistOrderTracking(client: PoolClient, orderId: string, before: StoredOrderTracking | null,
  data: OrderTrackingData, hub: TrackingHubSnapshot | null, actor: TrustedIdentity, requestId: string, operationId: string) {
  const values = [orderId, data.supplyHubId, hub, data.remark, actor.internalUserId];
  if (before === null) {
    await client.query(`INSERT INTO production_order_execution_trackings(sales_order_id,supply_hub_id,hub_snapshot,remark,created_by,updated_by,version)
      VALUES($1,$2,$3,$4,$5,$5,1)`, values);
  } else {
    const changed = await client.query(`UPDATE production_order_execution_trackings SET supply_hub_id=$2,hub_snapshot=$3,remark=$4,updated_by=$5,
      version=version+1,updated_at=clock_timestamp() WHERE sales_order_id=$1 AND version=$6`, [...values, before.version]);
    if (changed.rowCount !== 1) planFail(409, "order_tracking_version_conflict");
  }
  await client.query(`INSERT INTO production_order_execution_tracking_versions(tracking_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id)
    SELECT id,sales_order_id,version,production_order_tracking_row_snapshot(t),$2,$3,$4 FROM production_order_execution_trackings t WHERE sales_order_id=$1`,
  [orderId, actor.internalUserId, requestId, operationId]);
  return (await readStoredOrderTracking(client, orderId))!;
}

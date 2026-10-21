import type { PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { LOGISTICS_RESOURCE_LIMITS, type TransportModeInput, type TransportPlanCommand } from "./logistics-contract.js";

export type StoredTransportMode = Omit<TransportModeInput, "modeId"> & { modeId: string };
const fail = (code: string): never => { throw new HttpError(409, code, code); };

/** Called under the same parent/global resource lock as the existing resource writer. */
export async function readTransportModes(client: PoolClient, id: string, lock: boolean | "share" = false): Promise<StoredTransportMode[]> {
  const rows = (await client.query<{ id: string; name: string; enabled: boolean; remark: string; transit_days: number; sort_order: number }>(
    `SELECT id,name,enabled,remark,transit_days,sort_order FROM production_transport_modes WHERE route_id=$1 ORDER BY display_position,id ${lock ? lock === "share" ? "FOR SHARE" : "FOR UPDATE" : ""}`, [id])).rows;
  if (rows.length > LOGISTICS_RESOURCE_LIMITS.modes) return fail("logistics_mode_membership_conflict");
  return rows.map(row => ({ name: row.name, enabled: row.enabled, remark: row.remark, modeId: row.id, transitDays: row.transit_days, sortOrder: row.sort_order }));
}

export async function checkTransportPlanDependencies(client: PoolClient, command: TransportPlanCommand): Promise<void> {
  const hub = (await client.query<{ enabled: boolean }>("SELECT enabled FROM production_supply_hubs WHERE id=$1 FOR SHARE", [command.data.supplyHubId])).rows[0];
  if (!hub) fail("production_supply_hub_not_found");
  if (command.data.enabled && !hub.enabled) fail("production_supply_hub_disabled");
  const site = (await client.query<{ site_enabled: boolean; calendar_enabled: boolean }>(`SELECT s.enabled AS site_enabled,c.enabled AS calendar_enabled
    FROM production_sites s JOIN production_calendars c ON c.id=s.production_calendar_id WHERE s.id=$1 FOR SHARE OF s,c`, [command.data.productionSiteId])).rows[0];
  if (!site) fail("production_site_not_found");
  if (command.data.enabled && !site.site_enabled) fail("production_site_disabled");
  if (command.data.enabled && !site.calendar_enabled) fail("production_calendar_disabled");
  if (command.data.enabled && (await client.query(`SELECT id FROM production_supply_routes WHERE enabled AND supply_hub_id=$1 AND production_site_id=$2
    AND ($3::uuid IS NULL OR id<>$3)`, [command.data.supplyHubId, command.data.productionSiteId, command.resourceId])).rows.length) fail("logistics_route_pair_conflict");
}

/** No separate transaction or writer: parent, children, audit and receipt share the caller's transaction. */
export async function storeTransportModes(client: PoolClient, actor: TrustedIdentity, routeId: string, command: TransportPlanCommand): Promise<void> {
  for (const [position, mode] of command.data.modes.entries()) {
    const values = [mode.name, mode.enabled, mode.remark, mode.transitDays, mode.sortOrder, position, actor.internalUserId, routeId];
    if (mode.modeId === null) {
      await client.query(`INSERT INTO production_transport_modes(name,enabled,remark,transit_days,sort_order,display_position,created_by,updated_by,route_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8)`, values);
    } else {
      const changed = await client.query(`UPDATE production_transport_modes SET name=$1,enabled=$2,remark=$3,transit_days=$4,sort_order=$5,display_position=$6,
        updated_by=$7,version=version+1 WHERE route_id=$8 AND id=$9 RETURNING id`, [...values, mode.modeId]);
      if (changed.rowCount !== 1) fail("logistics_mode_membership_conflict");
    }
  }
}

export function rethrowLogisticsConstraint(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "23505" && "constraint" in error && error.constraint === "production_supply_routes_active_pair_key") fail("logistics_route_pair_conflict");
  throw error;
}

/** JSONB's stored text includes generated IDs and spaces, so the HTTP input size
 * cannot prove that the immutable receipt fits its existing 0034 constraint. */
export async function assertLogisticsReceiptCapacity(client: PoolClient, result: unknown): Promise<void> {
  const bytes = (await client.query<{ bytes: number }>("SELECT octet_length($1::jsonb::text) AS bytes", [JSON.stringify(result)])).rows[0].bytes;
  if (bytes > 1048576) throw new HttpError(422, "logistics_result_too_large", "Transport plan is too large to save as one operation");
}

import type { PoolClient } from "pg";
import type { ArrivalLogisticsContext } from "../../features/style-progress/model/server-arrival-logistics.js";
import { HttpError } from "../http/errors.js";
import { LOGISTICS_RESOURCE_LIMITS } from "../production-resources/logistics-contract.js";
import { assignmentsForOrder, orderPlanVersion, productionPlansAvailable } from "../production-scheduling/repository.js";

/** Narrow derived read within the arrival caller's repeatable-read transaction.
 * style_progress.read already grants per-material logistics, not a schedule or
 * resource directory. No notes, contacts, quantities, colors or amounts escape. */
export async function readArrivalLogisticsContext(client: PoolClient, orderId: string, supplyHubId: string | null): Promise<ArrivalLogisticsContext> {
  const context: ArrivalLogisticsContext = { schemaVersion: "material-arrival-logistics.v1", orderId, status: "ready", planVersion: 0,
    assignment: null, supplyHubId, settings: { productionGroups: [], productionSites: [], supplyHubs: [], supplyRoutes: [], transportModes: [] },
    versions: { hub: null, route: null, modes: [] }, issues: [] };
  const tables = ["production_schedule_assignments", "production_schedule_resource_snapshots", "production_order_plan_heads", "production_supply_hubs", "production_supply_routes", "production_transport_modes"];
  if (!(await client.query<{ ready: boolean }>("SELECT bool_and(to_regclass('public.'||name) IS NOT NULL) ready FROM unnest($1::text[]) name", [tables])).rows[0].ready)
    return { ...context, status: "unavailable", issues: ["context_unavailable"] };
  await productionPlansAvailable(client);
  context.planVersion = await orderPlanVersion(client, orderId);
  // Original Style Progress rule: earliest non-cancelled assignment. Stable
  // created-at/UUID input order is retained for equal start dates.
  const assignment = (await assignmentsForOrder(client, orderId)).filter(row => row.status !== "cancelled")
    .sort((a, b) => a.plannedStartDate.localeCompare(b.plannedStartDate))[0] ?? null;
  if (assignment) {
    context.assignment = { id: assignment.id, version: assignment.version, executionType: assignment.executionType,
      productionGroupId: assignment.productionGroupId, plannedStartDate: assignment.plannedStartDate, resourceSnapshotHash: assignment.resourceSnapshotHash };
    if (assignment.resourceFacts.executionType === "internal") {
      const { group, site } = assignment.resourceFacts;
      if (assignment.executionType !== "internal" || group.id !== assignment.productionGroupId || site.id !== group.productionSiteId)
        throw new HttpError(503, "production_resource_snapshot_invalid", "production_resource_snapshot_invalid");
      context.settings.productionGroups = [{ id: group.id, productionSiteId: group.productionSiteId }];
      context.settings.productionSites = [{ id: site.id, name: site.name, enabled: site.enabled, preProductionSampleLeadDays: site.preProductionSampleLeadDays }];
    }
  }
  if (supplyHubId) {
    const hub = (await client.query<{ id: string; name: string; enabled: boolean; version: number }>(
      "SELECT id::text,name,enabled,version FROM production_supply_hubs WHERE id=$1", [supplyHubId])).rows[0];
    if (hub) { const { version, ...facts } = hub; context.settings.supplyHubs = [facts]; context.versions.hub = version; if (!hub.enabled) context.issues.push("hub_disabled"); }
  }
  const site = context.settings.productionSites[0];
  if (supplyHubId && site) {
    const routes = (await client.query<{ id: string; name: string; enabled: boolean; supplyHubId: string; productionSiteId: string; version: number }>(
      `SELECT id::text,name,enabled,supply_hub_id::text AS "supplyHubId",production_site_id::text AS "productionSiteId",version
       FROM production_supply_routes WHERE enabled AND supply_hub_id=$1 AND production_site_id=$2 ORDER BY id LIMIT 2`, [supplyHubId, site.id])).rows;
    if (routes.length > 1) context.issues.push("route_ambiguous");
    else if (routes.length === 1) {
      const { version, ...route } = routes[0]; context.settings.supplyRoutes = [route]; context.versions.route = version;
      const modes = (await client.query<{ id: string; routeId: string; name: string; enabled: boolean; transitDays: number; sortOrder: number; version: number }>(
        `SELECT id::text,route_id::text AS "routeId",name,enabled,transit_days AS "transitDays",sort_order AS "sortOrder",version
         FROM production_transport_modes WHERE route_id=$1 ORDER BY display_position,id LIMIT $2`, [route.id, LOGISTICS_RESOURCE_LIMITS.modes + 1])).rows;
      if (modes.length > LOGISTICS_RESOURCE_LIMITS.modes) throw new HttpError(422, "material_arrival_projection_limit", "material_arrival_projection_limit");
      context.settings.transportModes = modes.map(({ version: _version, ...mode }) => { void _version; return mode; });
      context.versions.modes = modes.map(({ id, version }) => ({ id, version }));
    }
  }
  return context;
}

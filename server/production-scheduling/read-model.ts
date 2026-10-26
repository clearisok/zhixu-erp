import type { PoolClient } from "pg";
import { productionGroupsForMasterData } from "../../features/operations-settings/model/master-data-presentation.js";
import { canonicalDecimal } from "../quotes/decimal-projection.js";
import { verifiedOrderBusinessSql } from "../sales-orders/business-verification-sql.js";
import { effectiveOrderJoins, sourceOwnerSql } from "../sales-orders/effective-order-sql.js";
import { planPageInfo, type PlanAllocationState, type PlanListQuery } from "./read-contract.js";
import { planFail } from "./repository.js";

export type PlanOrderSummary = {
  id: string; orderNo: string; lifecycleState: string; businessType: "ainuoke_contract" | "processing" | "unclassified";
  effectiveOrderId: string; quantity: string | null; plannedQuantity: string; completedQuantity: string; outstandingPlannedQuantity: string; accountedQuantity: string; remainingQuantity: string | null;
  overassignedQuantity: string | null; allocationState: PlanAllocationState; assignmentCount: number; planVersion: number;
  styleNo: string | null; factoryStyleNo: string | null; customerName: string | null; brandName: string | null;
  contractNo: string | null; customerReference: string | null; deliveryDate: string | null; eligible: boolean;
};

// Aggregate only the exact SO owner. Historical alias plans are never silently
// moved to, or counted in, the effective order's executable quantity.
const orderProjection = (restricted = false) => `WITH planned AS (
  SELECT a.sales_order_id,COALESCE(sum(a.planned_quantity) FILTER(WHERE a.status='planned'),0) AS quantity,
    sum(COALESCE(e.completed_quantity,0)) AS completed,
    sum(CASE WHEN a.status='planned' AND COALESCE(e.status,'in_progress')<>'completed' THEN greatest(a.planned_quantity-COALESCE(e.completed_quantity,0),0) ELSE 0 END) AS outstanding,
    count(*) FILTER(WHERE a.status='planned')::int AS assignment_count
  FROM production_schedule_assignments a LEFT JOIN production_schedule_executions e ON e.assignment_id=a.id
  ${restricted ? "WHERE a.sales_order_id=ANY($1::uuid[])" : ""} GROUP BY a.sales_order_id
), facts AS (
  SELECT so.id::text,so.order_no AS "orderNo",so.lifecycle_state AS "lifecycleState",
    ${verifiedOrderBusinessSql(true)} AS "businessType",attribution.effective_order_id::text AS "effectiveOrderId",
    COALESCE(m.quantity,b.quantity) AS quantity,COALESCE(p.quantity,0) AS planned_quantity,
    COALESCE(p.completed,0) AS completed_quantity,COALESCE(p.outstanding,0) AS outstanding_quantity,
    COALESCE(p.completed,0)+COALESCE(p.outstanding,0) AS accounted_quantity,
    COALESCE(p.assignment_count,0) AS "assignmentCount",COALESCE(h.version,0) AS "planVersion",
    COALESCE(m.style_no,b.business_style_no) AS "styleNo",m.inside_order_no AS "factoryStyleNo",
    COALESCE(m.customer_name_snapshot,b.customer_name) AS "customerName",m.brand_name_snapshot AS "brandName",
    m.sales_contract_no AS "contractNo",b.customer_reference AS "customerReference",
    COALESCE(m.contract_delivery_date,b.delivery_date)::text AS "deliveryDate"
  FROM sales_orders so ${effectiveOrderJoins(true)}
  LEFT JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=${sourceOwnerSql(true)}
  LEFT JOIN processing_order_batch_consumptions bc ON bc.sales_order_id=so.id LEFT JOIN processing_order_batches b ON b.id=bc.batch_id
  LEFT JOIN planned p ON p.sales_order_id=so.id LEFT JOIN production_order_plan_heads h ON h.sales_order_id=so.id
  ${restricted ? "WHERE so.id=ANY($1::uuid[])" : ""}
), summaries AS (
  SELECT id,"orderNo","lifecycleState","businessType","effectiveOrderId",quantity::text,
    planned_quantity::text AS "plannedQuantity",
    completed_quantity::text AS "completedQuantity",outstanding_quantity::text AS "outstandingPlannedQuantity",accounted_quantity::text AS "accountedQuantity",
    CASE WHEN quantity IS NULL THEN NULL ELSE greatest(quantity-accounted_quantity,0)::text END AS "remainingQuantity",
    CASE WHEN quantity IS NULL THEN NULL ELSE greatest(accounted_quantity-quantity,0)::text END AS "overassignedQuantity",
    CASE WHEN quantity IS NULL THEN 'unknown' WHEN accounted_quantity>quantity THEN 'overassigned'
      WHEN accounted_quantity=quantity THEN 'allocated' WHEN accounted_quantity=0 THEN 'unassigned' ELSE 'partial' END AS "allocationState",
    "assignmentCount","planVersion","styleNo","factoryStyleNo","customerName","brandName","contractNo","customerReference","deliveryDate",
    ("effectiveOrderId"=id AND "lifecycleState" NOT IN ('completed','cancelled') AND "businessType"<>'unclassified') AS eligible FROM facts
)`;
const normalize = (row: PlanOrderSummary): PlanOrderSummary => ({ ...row,
  quantity: row.quantity === null ? null : canonicalDecimal(row.quantity), plannedQuantity: canonicalDecimal(row.plannedQuantity),
  completedQuantity: canonicalDecimal(row.completedQuantity), outstandingPlannedQuantity: canonicalDecimal(row.outstandingPlannedQuantity), accountedQuantity: canonicalDecimal(row.accountedQuantity),
  remainingQuantity: row.remainingQuantity === null ? null : canonicalDecimal(row.remainingQuantity),
  overassignedQuantity: row.overassignedQuantity === null ? null : canonicalDecimal(row.overassignedQuantity) });

export async function readPlanOrderSummaries(client: PoolClient, ids: readonly string[]) {
  if (!ids.length) return {} as Record<string, PlanOrderSummary>;
  if (ids.length > 500) planFail(422, "production_order_projection_limit");
  const rows = (await client.query<PlanOrderSummary>(`${orderProjection(true)} SELECT * FROM summaries`, [ids])).rows;
  return Object.fromEntries(rows.map(row => [row.id, normalize(row)]));
}

export async function listPlanOrders(client: PoolClient, query: Extract<PlanListQuery, { kind: "orders" }>) {
  const values: unknown[] = [], clauses = ["eligible"];
  if (query.allocation === "remaining") clauses.push(`"allocationState" IN ('unassigned','partial')`);
  else if (query.allocation !== "all") { values.push(query.allocation); clauses.push(`"allocationState"=$${values.length}`); }
  for (const token of query.search.split(/\s+/u).filter(Boolean)) {
    values.push(token.toLowerCase()); clauses.push(`strpos(lower(concat_ws(' ',"orderNo","styleNo","factoryStyleNo","customerName","brandName","contractNo","customerReference")),$${values.length})>0`);
  }
  const sql = `${orderProjection()}, filtered AS (SELECT * FROM summaries WHERE ${clauses.join(" AND ")})`;
  const count = (await client.query<{ total: string }>(`${sql} SELECT count(*)::text total FROM filtered`, values)).rows[0].total;
  const total = Number(count); if (!Number.isSafeInteger(total)) planFail(422, "production_order_projection_limit");
  const items = (await client.query<PlanOrderSummary>(`${sql} SELECT * FROM filtered ORDER BY "deliveryDate" NULLS LAST,"orderNo",id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, query.offset])).rows.map(normalize);
  return { items, ...planPageInfo(total, query.offset, items.length, query.limit) };
}

type GroupOverview = {
  id: string; name: string; shortName: string; enabled: boolean; version: number; sortOrder: number; remark: string;
  productionSiteId: string; createdAt: string; updatedAt: string; siteName: string; calendarName: string; resourcesEnabled: boolean;
  queueVersion: number; assignmentCount: number; pendingAssignmentCount: number; plannedQuantity: string; completedQuantity: string; outstandingPlannedQuantity: string; headAssignmentId: string | null;
  headOrderId: string | null; plannedThroughDate: string | null;
};
export async function listPlanGroups(client: PoolClient, query: Extract<PlanListQuery, { kind: "groups" }>) {
  const values: unknown[] = [], clauses: string[] = [];
  if (query.status === "relevant") clauses.push("(g.enabled OR COALESCE(p.assignment_count,0)>0)");
  else if (query.status !== "all") { values.push(query.status === "enabled"); clauses.push(`g.enabled=$${values.length}`); }
  for (const token of query.search.split(/\s+/u).filter(Boolean)) {
    values.push(token.toLowerCase()); clauses.push(`strpos(lower(concat_ws(' ',g.name,g.short_name,g.remark,s.name,c.name)),$${values.length})>0`);
  }
  const rows = (await client.query<GroupOverview>(`WITH all_plans AS (
    SELECT a.*,COALESCE(e.completed_quantity,0) AS completed_quantity,e.status AS execution_status
    FROM production_schedule_assignments a LEFT JOIN production_schedule_executions e ON e.assignment_id=a.id WHERE a.production_group_id IS NOT NULL
  ), active AS (
    SELECT * FROM all_plans WHERE status='planned'
  ), planned AS (
    SELECT production_group_id,count(*)::int assignment_count,sum(planned_quantity)::text quantity,
      count(*) FILTER(WHERE COALESCE(execution_status,'in_progress')<>'completed')::int pending_count,
      sum(CASE WHEN COALESCE(execution_status,'in_progress')<>'completed' THEN greatest(planned_quantity-completed_quantity,0) ELSE 0 END)::text outstanding,
      max(planned_end_date) FILTER(WHERE COALESCE(execution_status,'in_progress')<>'completed')::text tail FROM active GROUP BY production_group_id
  ), completed AS (
    SELECT production_group_id,sum(completed_quantity)::text quantity FROM all_plans GROUP BY production_group_id
  ), heads AS (
    SELECT DISTINCT ON (production_group_id) production_group_id,id,sales_order_id FROM active WHERE COALESCE(execution_status,'in_progress')<>'completed' ORDER BY production_group_id,queue_sequence,created_at,id
  ) SELECT g.id::text,g.name,g.short_name AS "shortName",g.enabled,g.version,g.sort_order AS "sortOrder",g.remark,
    g.production_site_id::text AS "productionSiteId",g.created_at::text AS "createdAt",g.updated_at::text AS "updatedAt",
    s.name AS "siteName",c.name AS "calendarName",(g.enabled AND s.enabled AND c.enabled) AS "resourcesEnabled",
    COALESCE(h.version,0) AS "queueVersion",COALESCE(p.assignment_count,0) AS "assignmentCount",COALESCE(p.quantity,'0') AS "plannedQuantity",
    COALESCE(p.pending_count,0) AS "pendingAssignmentCount",
    COALESCE(done.quantity,'0') AS "completedQuantity",COALESCE(p.outstanding,'0') AS "outstandingPlannedQuantity",
    head.id::text AS "headAssignmentId",head.sales_order_id::text AS "headOrderId",p.tail AS "plannedThroughDate"
    FROM production_groups g JOIN production_sites s ON s.id=g.production_site_id JOIN production_calendars c ON c.id=s.production_calendar_id
    LEFT JOIN planned p ON p.production_group_id=g.id LEFT JOIN completed done ON done.production_group_id=g.id LEFT JOIN heads head ON head.production_group_id=g.id LEFT JOIN production_group_plan_heads h ON h.production_group_id=g.id
    ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} LIMIT 5001`, values)).rows;
  if (rows.length > 5000) planFail(422, "production_group_projection_limit");
  const byId = new Map(rows.map(row => [row.id, row]));
  const items = productionGroupsForMasterData(rows).slice(query.offset, query.offset + query.limit).map(row => {
    const overview = byId.get(row.id)!; return { ...overview, plannedQuantity: canonicalDecimal(overview.plannedQuantity), completedQuantity: canonicalDecimal(overview.completedQuantity), outstandingPlannedQuantity: canonicalDecimal(overview.outstandingPlannedQuantity) };
  });
  const ordersById = await readPlanOrderSummaries(client, [...new Set(items.flatMap(item => item.headOrderId ? [item.headOrderId] : []))]);
  return { items, ordersById, total: rows.length, offset: query.offset, limit: query.limit, hasMore: query.offset + items.length < rows.length };
}

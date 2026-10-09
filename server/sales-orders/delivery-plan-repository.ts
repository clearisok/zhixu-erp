import type { Queryable } from './repository.js';
import type { DeliveryPlanSetDto } from './delivery-plan-model.js';
import { HttpError } from '../http/errors.js';

export async function readDeliveryPlanSet(client: Queryable, salesOrderId: string): Promise<DeliveryPlanSetDto> {
  // One statement snapshot prevents mixed source/plan versions during refresh.
  const result = await client.query<{
    ownership: DeliveryPlanSetDto['ownership'] | null; version: number | null;
    source_date: string | null; source_quantity: string | null;
    plans: DeliveryPlanSetDto['plans']; plan_dates: string[];
    quantity_status: DeliveryPlanSetDto['reconciliation']['quantityStatus'];
  }>(`SELECT ds.ownership, ds.version, to_char(m.contract_delivery_date, 'YYYY-MM-DD') AS source_date,
      m.quantity::text AS source_quantity,
      COALESCE(p.plans, '[]'::jsonb) AS plans, COALESCE(p.dates, ARRAY[]::text[]) AS plan_dates,
      CASE WHEN m.quantity IS NULL THEN 'no_source_quantity' WHEN COALESCE(p.active_count, 0) = 0 THEN 'unplanned'
        WHEN p.total < m.quantity THEN 'short' WHEN p.total > m.quantity THEN 'excess' ELSE 'matched' END AS quantity_status
    FROM sales_orders so LEFT JOIN sales_order_delivery_plan_sets ds ON ds.sales_order_id = so.id
    LEFT JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id = so.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', id, 'deliveryDate', to_char(delivery_date, 'YYYY-MM-DD'),
          'quantity', quantity::text, 'isDerivedDefault', is_derived_default, 'voidedAt', voided_at)
          ORDER BY created_at, id) AS plans,
        array_agg(DISTINCT to_char(delivery_date, 'YYYY-MM-DD') ORDER BY to_char(delivery_date, 'YYYY-MM-DD'))
          FILTER (WHERE voided_at IS NULL AND delivery_date IS NOT NULL) AS dates,
        sum(quantity) FILTER (WHERE voided_at IS NULL AND delivery_date IS NOT NULL) AS total,
        count(*) FILTER (WHERE voided_at IS NULL AND delivery_date IS NOT NULL) AS active_count
      FROM sales_order_delivery_plans WHERE sales_order_id = so.id
    ) p ON true WHERE so.id = $1::uuid`, [salesOrderId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'sales_order_not_found', 'SalesOrder was not found');
  return {
    salesOrderId, ownership: row.ownership ?? 'uninitialized', version: row.version ?? 0,
    plans: row.plans, sourceDeliveryDate: row.source_date, sourceQuantity: row.source_quantity,
    reconciliation: {
      dateStatus: row.source_date === null ? (row.plan_dates.length ? 'drift' : 'no_source_date')
        : row.plan_dates.length === 1 && row.plan_dates[0] === row.source_date ? 'matched' : 'drift',
      planDates: row.plan_dates, quantityStatus: row.quantity_status,
    },
  };
}

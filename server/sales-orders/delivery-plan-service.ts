import {lockEffectiveAttribution,requireEffectiveOrderForWrite} from './effective-attribution.js';
import {requireOrderCommandActor} from './identity-service.js';
import type { Pool } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { parseDeliveryPlanCommand } from './delivery-plan-model.js';
import { readDeliveryPlanSet } from './delivery-plan-repository.js';

export async function updateDeliveryPlans(pool: Pool, actor: TrustedIdentity, salesOrderId: string, values: Record<string, unknown>) {
  requirePermission(actor.permissions, 'order.view');
  requirePermission(actor.permissions, 'order.edit');
  const input = parseDeliveryPlanCommand(values);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await lockEffectiveAttribution(client);
    const currentActor=await requireOrderCommandActor(client,actor,'order.edit');
    await requireEffectiveOrderForWrite(client,salesOrderId);
    // Source refresh takes the same root lock before mirror/collection locks.
    const order = await client.query('SELECT id FROM sales_orders WHERE id=$1::uuid FOR UPDATE', [salesOrderId]);
    if (!order.rowCount) throw new HttpError(404, 'sales_order_not_found', 'SalesOrder was not found');
    await client.query('SELECT sales_order_id FROM sales_order_delivery_plan_sets WHERE sales_order_id=$1::uuid FOR UPDATE', [salesOrderId]);
    const before = await readDeliveryPlanSet(client, salesOrderId);
    if (input.expectedVersion !== before.version) throw new HttpError(409, 'delivery_plan_version_conflict', 'DeliveryPlan collection version is stale');
    const rows = new Map(before.plans.map(row => [row.id, row]));
    const affectedIds = new Set([...input.upserts.flatMap(row => row.id ? [row.id] : []), ...input.voidIds]);
    for (const id of affectedIds) {
      if (!rows.has(id) || rows.get(id)?.voidedAt !== null) throw new HttpError(409, 'delivery_plan_row_conflict', 'DeliveryPlan row is absent or voided');
    }
    if (before.ownership === 'uninitialized') {
      await client.query("INSERT INTO sales_order_delivery_plan_sets(sales_order_id, ownership) VALUES ($1::uuid, 'user_managed')", [salesOrderId]);
    } else {
      await client.query("UPDATE sales_order_delivery_plan_sets SET ownership='user_managed', version=version+1 WHERE sales_order_id=$1::uuid AND version=$2", [salesOrderId, input.expectedVersion]);
    }
    for (const row of input.upserts) {
      if (row.id === null) {
        await client.query('INSERT INTO sales_order_delivery_plans(sales_order_id, delivery_date, quantity) VALUES ($1::uuid,$2::date,$3::numeric)', [salesOrderId, row.deliveryDate, row.quantity]);
      } else {
        await client.query('UPDATE sales_order_delivery_plans SET delivery_date=$3::date, quantity=$4::numeric WHERE sales_order_id=$1::uuid AND id=$2::uuid', [salesOrderId, row.id, row.deliveryDate, row.quantity]);
      }
    }
    for (const id of input.voidIds) {
      await client.query('UPDATE sales_order_delivery_plans SET voided_at=now() WHERE sales_order_id=$1::uuid AND id=$2::uuid', [salesOrderId, id]);
    }
    const after = await readDeliveryPlanSet(client, salesOrderId);
    await appendOperationLog(client, currentActor, {
      module: '订单中心', action: '修改交期', entityType: 'SalesOrder', entityId: salesOrderId,
      beforeData: { orderId: salesOrderId, values: { ownership: before.ownership, version: before.version,
        plans: JSON.stringify(before.plans.filter(row => affectedIds.has(row.id))) } },
      afterData: { orderId: salesOrderId, values: { ownership: after.ownership, version: after.version,
        plans: JSON.stringify(after.plans.filter(row => !rows.has(row.id) || affectedIds.has(row.id))) } },
      metadata: { domain: 'DeliveryPlan', mutationSurface: 'order' },
    });
    await client.query('COMMIT');
    return after;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

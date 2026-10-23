import { lockEffectiveAttribution, requireEffectiveOrderForWrite } from './effective-attribution.js';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { readCurrentActor } from '../auth/current-actor.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { readDeliveryPlanSet } from './delivery-plan-repository.js';
import { DELIVERY_PLAN_COMMAND_MAX_BYTES, DELIVERY_PLAN_RECEIPT_MAX_BYTES, deliveryPlanReceipt, prepareDeliveryPlanRequest,
  readSavedDeliveryPlanResult, stableDeliveryPlanRejection, type DeliveryPlanRequest, type DeliveryPlanRequestResult } from './delivery-plan-request.js';

export async function updateDeliveryPlans(pool: Pool, actor: TrustedIdentity, salesOrderId: string, values: Record<string, unknown>) {
  requirePlanPermissions(actor);
  const request = prepareDeliveryPlanRequest(salesOrderId, values);
  const client = await pool.connect();
  let result: DeliveryPlanRequestResult;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await lockEffectiveAttribution(client);
    const currentActor = await readCurrentActor(client, actor, true);
    requirePlanPermissions(currentActor);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`delivery-plan:${currentActor.internalUserId}:${request.requestKey}`]);
    const prior = await readPrior(client, currentActor, request);
    if (prior) result = prior;
    else {
      await client.query('SAVEPOINT delivery_plan_apply');
      let auditLogId: string | null = null;
      try {
        const applied = await applyDeliveryPlans(client, currentActor, request);
        result = applied.result; auditLogId = applied.auditLogId;
        await boundJson(client, result, DELIVERY_PLAN_RECEIPT_MAX_BYTES, 'delivery_plan_receipt_too_large');
      } catch (error) {
        const rejected = stableDeliveryPlanRejection(error);
        if (!rejected) throw error;
        await client.query('ROLLBACK TO SAVEPOINT delivery_plan_apply');
        result = rejected; auditLogId = null;
      }
      await boundJson(client, request.command, DELIVERY_PLAN_COMMAND_MAX_BYTES, 'invalid_delivery_plan_command');
      await client.query(`INSERT INTO sales_order_delivery_plan_requests
        (actor_id,request_mode,request_id,request_key,sales_order_id,command_hash,command,outcome,result,audit_log_id)
        VALUES($1,$2,$3::uuid,$4,$5::uuid,$6,$7::jsonb,$8,$9::jsonb,$10)`,
      [currentActor.internalUserId, request.requestMode, request.requestId, request.requestKey, request.command.salesOrderId,
        request.commandHash, request.serializedCommand, result.status, JSON.stringify(result), auditLogId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
  // Rejected terminal receipts commit before retaining the original PATCH error contract.
  if (result.status === 'rejected') throw new HttpError(result.error.status, result.error.code, result.error.message);
  return result.deliveryPlanSet;
}

/** Result lookup only. Absence can race an in-flight commit and never authorizes retry. */
export async function readDeliveryPlanRequestReceipt(pool: Pool, actor: TrustedIdentity, salesOrderId: string, values: Record<string, unknown>) {
  requirePlanPermissions(actor);
  const request = prepareDeliveryPlanRequest(salesOrderId, values);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    const currentActor = await readCurrentActor(client, actor, true);
    requirePlanPermissions(currentActor);
    const result = await readPrior(client, currentActor, request);
    await client.query('COMMIT');
    return deliveryPlanReceipt(request, result ?? undefined);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); throw error;
  } finally { client.release(); }
}

function requirePlanPermissions(actor: TrustedIdentity) {
  requirePermission(actor.permissions, 'order.view'); requirePermission(actor.permissions, 'order.edit');
}
async function readPrior(client: PoolClient, actor: TrustedIdentity, request: DeliveryPlanRequest) {
  const row = (await client.query<Parameters<typeof readSavedDeliveryPlanResult>[1]>(
    `SELECT sales_order_id::text,command_hash,command,result,outcome,audit_log_id FROM sales_order_delivery_plan_requests
      WHERE actor_id=$1::bigint AND request_key=$2`, [actor.internalUserId, request.requestKey])).rows[0];
  return row ? readSavedDeliveryPlanResult(request, row) : null;
}
async function boundJson(client: PoolClient, value: unknown, limit: number, code: string) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > limit || (await client.query<{ bytes: number }>(
    'SELECT octet_length($1::jsonb::text) AS bytes', [json])).rows[0].bytes > limit) {
    throw new HttpError(code === 'invalid_delivery_plan_command' ? 400 : 422, code, 'DeliveryPlan payload exceeds capacity');
  }
}

async function applyDeliveryPlans(client: PoolClient, currentActor: TrustedIdentity, request: DeliveryPlanRequest) {
    const input = request.command, salesOrderId = input.salesOrderId;
    await requireEffectiveOrderForWrite(client, salesOrderId);
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
    const log = await appendOperationLog(client, currentActor, {
      module: '订单中心', action: '修改交期', entityType: 'SalesOrder', entityId: salesOrderId,
      beforeData: { orderId: salesOrderId, values: { ownership: before.ownership, version: before.version,
        plans: JSON.stringify(before.plans.filter(row => affectedIds.has(row.id))) } },
      afterData: { orderId: salesOrderId, values: { ownership: after.ownership, version: after.version,
        plans: JSON.stringify(after.plans.filter(row => !rows.has(row.id) || affectedIds.has(row.id))) } },
      metadata: { domain: 'DeliveryPlan', mutationSurface: 'order' },
    });
    return { result: { status: 'applied' as const, deliveryPlanSet: after, operationId: log.operationId }, auditLogId: log.id };
}

import type { Pool } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import type { CreateAinuokeSalesOrderInput } from './service.js';
import { createOrUpdateSourceLink, getSalesOrderById, replaceCurrentAinuokeColorSlice, upsertCurrentAinuokeContractMirror } from './repository.js';
import { readDeliveryPlanSet } from './delivery-plan-repository.js';
import { validDeliveryDate } from './delivery-plan-model.js';

/** Internal typed source command only. No HTTP route or Bridge/source-module writer. */
export async function refreshAinuokeSalesOrderSource(
  pool: Pool, actor: TrustedIdentity, salesOrderId: string,
  input: CreateAinuokeSalesOrderInput & { expectedSourceHash: string; expectedPlanVersion: number },
) {
  requirePermission(actor.permissions, 'order.view');
  requirePermission(actor.permissions, 'ainuoke.sync');
  if (!Number.isSafeInteger(input.expectedPlanVersion) || input.expectedPlanVersion < 0
      || typeof input.expectedSourceHash !== 'string' || !input.expectedSourceHash
      || !Number.isFinite(input.source.quantity) || input.source.quantity < 0
      || (input.source.contractDeliveryDate !== null && !validDeliveryDate(input.source.contractDeliveryDate))
      || (input.source.contractDate !== null && !validDeliveryDate(input.source.contractDate))
      || !Number.isFinite(Date.parse(input.source.fetchedAt))
      || input.colors.some(row => !Number.isFinite(row.quantity) || row.quantity < 0
        || (row.deliveryDate !== null && !validDeliveryDate(row.deliveryDate)))) {
    throw new HttpError(400, 'invalid_source_refresh', 'Invalid typed source refresh');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const root = await client.query("SELECT id FROM sales_orders WHERE id=$1::uuid AND creation_source='ainuoke' FOR UPDATE", [salesOrderId]);
    if (!root.rowCount) throw new HttpError(404, 'sales_order_not_found', 'Ainuoke SalesOrder was not found');
    const current = await client.query<{ source_id: string; sales_contract_no: string; source_hash: string; fetched_at: Date }>(
      'SELECT source_id, sales_contract_no, source_hash, fetched_at FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1::uuid FOR UPDATE', [salesOrderId]);
    const mirror = current.rows[0];
    if (!mirror || mirror.source_id !== input.source.sourceId.normalize('NFKC').trim()
        || mirror.sales_contract_no !== input.source.salesContractNo.normalize('NFKC').trim().toUpperCase()) {
      throw new HttpError(409, 'source_binding_conflict', 'Source refresh must preserve the existing binding');
    }
    if (mirror.source_hash !== input.expectedSourceHash || Date.parse(input.source.fetchedAt) < mirror.fetched_at.getTime()) {
      throw new HttpError(409, 'source_version_conflict', 'Source evidence is stale');
    }
    await client.query('SELECT sales_order_id FROM sales_order_delivery_plan_sets WHERE sales_order_id=$1::uuid FOR UPDATE', [salesOrderId]);
    const beforePlans = await readDeliveryPlanSet(client, salesOrderId);
    if (beforePlans.version !== input.expectedPlanVersion) throw new HttpError(409, 'delivery_plan_version_conflict', 'DeliveryPlan collection version is stale');
    const before = await getSalesOrderById(client, salesOrderId);
    await createOrUpdateSourceLink(client, { salesOrderId, sourceSystem: 'ainuoke', sourceEntityType: 'sales_contract',
      externalId: mirror.source_id, salesContractNo: mirror.sales_contract_no, insideOrderNo: input.source.insideOrderNo });
    await upsertCurrentAinuokeContractMirror(client, salesOrderId, input.source);
    await replaceCurrentAinuokeColorSlice(client, salesOrderId, input.colors);
    const afterPlans = await readDeliveryPlanSet(client, salesOrderId);
    const after = await getSalesOrderById(client, salesOrderId);
    await appendOperationLog(client, actor, {
      module: '艾诺科同步', action: '艾诺科同步订单', entityType: 'SalesOrder', entityId: salesOrderId,
      beforeData: { orderId: salesOrderId, values: { sourceDeliveryDate: before?.contractDeliveryDate ?? null,
        sourceQuantity: beforePlans.sourceQuantity, insideOrderNo: before?.insideOrderNo ?? null,
        planVersion: beforePlans.version, ownership: beforePlans.ownership,
        derivedDefault: JSON.stringify(beforePlans.plans.find(row => row.isDerivedDefault) ?? null),
        dateStatus: beforePlans.reconciliation.dateStatus, quantityStatus: beforePlans.reconciliation.quantityStatus } },
      afterData: { orderId: salesOrderId, values: { sourceDeliveryDate: after?.contractDeliveryDate ?? null,
        sourceQuantity: afterPlans.sourceQuantity, insideOrderNo: after?.insideOrderNo ?? null,
        planVersion: afterPlans.version, ownership: afterPlans.ownership,
        derivedDefault: JSON.stringify(afterPlans.plans.find(row => row.isDerivedDefault) ?? null),
        dateStatus: afterPlans.reconciliation.dateStatus, quantityStatus: afterPlans.reconciliation.quantityStatus } },
      metadata: { domain: 'DeliveryPlan', mutationSurface: 'source_refresh' },
    });
    await client.query('COMMIT');
    return { salesOrder: after, deliveryPlanSet: afterPlans };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

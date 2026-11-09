import {lockEffectiveAttribution} from './effective-attribution.js';
import {requireOrderCommandActor} from './identity-service.js';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import type { CreateAinuokeSalesOrderInput } from './service.js';
import { getFoundationSalesOrderById, replaceCurrentAinuokeColorSlice, upsertCurrentAinuokeContractMirror } from './repository.js';
import { readDeliveryPlanSet } from './delivery-plan-repository.js';
import { validDeliveryDate } from './delivery-plan-model.js';

export type AinuokeSourceRefreshInput = CreateAinuokeSalesOrderInput & { expectedSourceHash: string; expectedPlanVersion: number };
function validate(input:AinuokeSourceRefreshInput) {
  if (!Number.isSafeInteger(input.expectedPlanVersion) || input.expectedPlanVersion < 0
      || typeof input.expectedSourceHash !== 'string' || !input.expectedSourceHash
      || input.source.quantity !== null && (!Number.isFinite(input.source.quantity) || input.source.quantity < 0)
      || (input.source.contractDeliveryDate !== null && !validDeliveryDate(input.source.contractDeliveryDate))
      || (input.source.contractDate !== null && !validDeliveryDate(input.source.contractDate))
      || !Number.isFinite(Date.parse(input.source.fetchedAt))
      || input.colors.some(row => !Number.isFinite(row.quantity) || row.quantity < 0
        || (row.deliveryDate !== null && !validDeliveryDate(row.deliveryDate)))) {
    throw new HttpError(400, 'invalid_source_refresh', 'Invalid typed source refresh');
  }
}

/** Existing internal command. No HTTP route or source collection is performed. */
export async function refreshAinuokeSalesOrderSource(pool:Pool,actor:TrustedIdentity,salesOrderId:string,input:AinuokeSourceRefreshInput) {
  requirePermission(actor.permissions,'order.view');requirePermission(actor.permissions,'ainuoke.sync');validate(input);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await lockEffectiveAttribution(client);
    const currentActor=await requireOrderCommandActor(client,actor,'ainuoke.sync');
    const result=await refreshAinuokeSalesOrderSourceInTransaction(client,currentActor,salesOrderId,input);
    await client.query('COMMIT');return result;
  } catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}
  finally {client.release();}
}

/** Caller owns BEGIN, fresh grants and physical source/effective-group locks.
 * The original source owner is intentional, including historical aliases. */
export async function refreshAinuokeSalesOrderSourceInTransaction(
  client:PoolClient,currentActor:TrustedIdentity,salesOrderId:string,input:AinuokeSourceRefreshInput,
  audit?:{operationId:string;operationSequence:number},
) {
    requirePermission(currentActor.permissions,'order.view');requirePermission(currentActor.permissions,'ainuoke.sync');validate(input);
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
    const before = await getFoundationSalesOrderById(client, salesOrderId);
    // UPDATE the proved binding, never an INSERT/UPSERT. The latter attempts a
    // new binding on historical aliases before its conflict branch is reached.
    const link=await client.query(`SELECT id,inside_order_no FROM sales_order_source_links
      WHERE sales_order_id=$1 AND source_system='ainuoke' AND source_entity_type='sales_contract'
      AND external_id=$2 AND sales_contract_no=$3 FOR UPDATE`,[salesOrderId,mirror.source_id,mirror.sales_contract_no]);
    if(link.rowCount!==1)throw new HttpError(409,'source_binding_conflict','Source refresh requires the existing binding');
    const insideOrderNo=input.source.insideOrderNo.normalize('NFKC').trim()||null;
    if(link.rows[0].inside_order_no!==insideOrderNo)await client.query('UPDATE sales_order_source_links SET inside_order_no=$2 WHERE id=$1',[link.rows[0].id,insideOrderNo]);
    await upsertCurrentAinuokeContractMirror(client, salesOrderId, input.source);
    await replaceCurrentAinuokeColorSlice(client, salesOrderId, input.colors);
    const afterPlans = await readDeliveryPlanSet(client, salesOrderId);
    const after = await getFoundationSalesOrderById(client, salesOrderId);
    await appendOperationLog(client, currentActor, {
      ...audit,
      module: '艾诺科同步', action: '艾诺科同步订单', entityType: 'SalesOrder', entityId: salesOrderId,
      beforeData: { orderId: salesOrderId, values: { sourceDeliveryDate: beforePlans.sourceDeliveryDate,
        sourceQuantity: beforePlans.sourceQuantity, insideOrderNo: before?.insideOrderNo ?? null,
        planVersion: beforePlans.version, ownership: beforePlans.ownership,
        derivedDefault: JSON.stringify(beforePlans.plans.find(row => row.isDerivedDefault) ?? null),
        dateStatus: beforePlans.reconciliation.dateStatus, quantityStatus: beforePlans.reconciliation.quantityStatus } },
      afterData: { orderId: salesOrderId, values: { sourceDeliveryDate: afterPlans.sourceDeliveryDate,
        sourceQuantity: afterPlans.sourceQuantity, insideOrderNo: after?.insideOrderNo ?? null,
        planVersion: afterPlans.version, ownership: afterPlans.ownership,
        derivedDefault: JSON.stringify(afterPlans.plans.find(row => row.isDerivedDefault) ?? null),
        dateStatus: afterPlans.reconciliation.dateStatus, quantityStatus: afterPlans.reconciliation.quantityStatus } },
      metadata: { domain: 'DeliveryPlan', mutationSurface: 'source_refresh' },
    });
    return { salesOrder: after, deliveryPlanSet: afterPlans };
}

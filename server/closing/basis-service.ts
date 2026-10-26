import type { Pool } from 'pg';
import { readCurrentActor } from '../auth/current-actor.js';
import { requirePermission } from '../auth/permissions.js';
import type { TrustedIdentity } from '../auth/session.js';
import { identityUuid } from '../sales-orders/identity-model.js';
import { requireVerifiedOrderBusiness } from '../sales-orders/identity-service.js';
import { productionExecutionsAvailable, executionsForAssignments, executionFacts } from '../production-scheduling/execution-store.js';
import { assignmentsForOrder, productionPlansAvailable, readOrderPlanFacts } from '../production-scheduling/repository.js';
import { closingBasisFail, closingExecutionFingerprint, projectClosingPriceBasis,
  type ClosingCommercialBasis, type ClosingExecutionReference, type ClosingPriceLine, type ClosingBusinessType } from './basis-model.js';

/** One physical SO and one REPEATABLE READ snapshot. This endpoint writes nothing. */
export async function readClosingOrderBasis(pool: Pool, identity: TrustedIdentity, rawId: string) {
  if (!identityUuid.test(rawId)) closingBasisFail(400, 'invalid_closing_order_id');
  const id = rawId.toLowerCase(), client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actor = await readCurrentActor(client, identity);
    for (const permission of ['closing.view', 'order.view', 'schedule.view'] as const) requirePermission(actor.permissions, permission);
    await productionPlansAvailable(client); await productionExecutionsAvailable(client);
    const business = await requireVerifiedOrderBusiness(client, id), order = await readOrderPlanFacts(client, id);
    if (order.effectiveOrderId !== id) closingBasisFail(409, 'closing_physical_order_required');
    if (order.colors.length > 1000) closingBasisFail(422, 'closing_basis_projection_limit');
    type Head = { id: string; version: number; quoteId: string; revisionId: string; quoteType: 'distribution' | 'processing'; scope: 'legacy_uniform' | 'line_items';
      priceVersionId: string | null; salePrice: string | null; laborPrice: string | null; laborCurrency: 'CNY' | 'USD'; processingBatchId: string | null };
    const head = (await client.query<Head>(`SELECT v.id::text,v.version,v.quote_id AS "quoteId",v.revision_id AS "revisionId",v.quote_type AS "quoteType",
      v.pricing_scope AS scope,v.price_version_id AS "priceVersionId",v.confirmed_sale_price::text AS "salePrice",
      v.confirmed_labor_price::text AS "laborPrice",v.labor_currency AS "laborCurrency",
      (SELECT c.batch_id::text FROM processing_order_batch_consumptions c
        WHERE c.sales_order_id=v.sales_order_id AND c.commercial_version_id=v.id) AS "processingBatchId"
      FROM sales_order_commercial_heads h JOIN sales_order_commercial_versions v ON v.id=h.current_version_id AND v.sales_order_id=h.sales_order_id
      WHERE h.sales_order_id=$1`, [id])).rows[0];
    let commercial: ClosingCommercialBasis | null = null;
    if (head) {
      const lines = head.scope === 'line_items' ? (await client.query<ClosingPriceLine>(`SELECT color_id::text AS "colorId",color_name AS "colorName",price_version_id AS "priceVersionId",
        actual_sale_price::text AS "salePrice",labor_price::text AS "laborPrice",labor_currency AS "laborCurrency"
        FROM sales_order_commercial_lines WHERE sales_order_id=$1 AND commercial_version_id=$2 ORDER BY position LIMIT 1001`, [id, head.id])).rows
        : [{ colorId: null, colorName: null, priceVersionId: head.priceVersionId ?? '', salePrice: head.salePrice, laborPrice: head.laborPrice, laborCurrency: head.laborCurrency }];
      commercial = { id: head.id, version: head.version, quoteId: head.quoteId, revisionId: head.revisionId, quoteType: head.quoteType,
        scope: head.scope, processingBatchId: head.processingBatchId, lines };
    }
    const assignments = await assignmentsForOrder(client, id), executions = await executionsForAssignments(client, assignments.map(row => row.id));
    const references: ClosingExecutionReference[] = assignments.map(row => ({ assignmentId: row.id, salesOrderId: id, assignmentVersion: row.version,
      colorId: row.colorId, executionType: row.executionType, executorId: row.productionGroupId ?? row.outsourceFactoryId!,
      resourceSnapshotHash: row.resourceSnapshotHash, plannedQuantity: row.plannedQuantity, planStatus: row.status, execution: executionFacts(executions[row.id]) }));
    const result = { schemaVersion: 'server-closing-basis.v1' as const, readOnly: true,
      order: { id, orderNo: order.orderNo, version: order.version, lifecycleState: order.lifecycleState, businessType: business.businessType as ClosingBusinessType,
        quantity: order.quantity, attributionVersion: order.attributionVersion },
      commercial: head ? { id: head.id, version: head.version, quoteId: head.quoteId, revisionId: head.revisionId, scope: head.scope, processingBatchId: head.processingBatchId } : null,
      priceLines: projectClosingPriceBasis(business.businessType as ClosingBusinessType, order.colors, commercial, actor.permissions),
      executionReferences: references, executionFingerprint: closingExecutionFingerprint(references),
      executionFactsMeaning: 'cumulative_actual_not_monthly_events' as const,
      unperformed: ['period_assignment', 'tax_calculation', 'foreign_exchange', 'output_recognition', 'closing_confirmation', 'closing_lock'] as const };
    if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) closingBasisFail(422, 'closing_basis_response_too_large');
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}

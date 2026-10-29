import type { PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { canonicalDecimal } from '../quotes/decimal-projection.js';
import { readProductionResourceSnapshot } from '../production-resources/service.js';
import { assignmentsForOrder } from '../production-scheduling/repository.js';
import { executionFacts, executionsForAssignments } from '../production-scheduling/execution-store.js';
import { readClosingBasisInTransaction } from './basis-service.js';
import { closingAmount, closingChannelPermissions, closingChannels, closingFail, closingQuantity, closingTaxRate, closingUuid,
  type ClosingAllocationData, type ClosingChannels } from './contract.js';
import { compareClosingExecutionReferences, type ClosingBusinessType, type ClosingExecutionReference } from './basis-model.js';

export type ClosingSnapshot = {
  schemaVersion: 'server-closing-allocation.v1';
  order: { id: string; orderNo: string; businessType: ClosingBusinessType };
  commercial: { id: string; version: number; quoteId: string; revisionId: string; priceVersionId: string };
  colorId: string | null; colorName: string | null; assignmentId: string | null; quantity: string; channels: ClosingChannels;
  taxRatePercent: string; prices: { sale?: { price: string; currency: 'CNY' }; work?: { price: string; currency: 'USD' } };
  quantityBasis: { order: string | null; color: string | null; planned: string | null; completed: string | null };
  executor: { type: 'internal' | 'outsource'; id: string; name: string; resourceSnapshotHash: string | null; version: number | null } | null;
  productionBasis: ClosingExecutionReference[]; reviewBasis: ClosingExecutionReference[]; remark: string;
};
export function requireClosingChannels(actor: TrustedIdentity, ...values: ClosingChannels[]) {
  for (const permission of closingChannelPermissions(...values)) requirePermission(actor.permissions, permission);
}
export async function currentClosingExecutionReferences(client: PoolClient, orderId: string, ids: readonly string[]) {
  if (!ids.length) return [];
  const rows = (await assignmentsForOrder(client, orderId)).filter(row => ids.includes(row.id));
  const executions = await executionsForAssignments(client, rows.map(row => row.id));
  return rows.map(row => ({ assignmentId: row.id, salesOrderId: orderId, assignmentVersion: row.version,
    colorId: row.colorId, executionType: row.executionType, executorId: row.productionGroupId ?? row.outsourceFactoryId!,
    resourceSnapshotHash: row.resourceSnapshotHash, plannedQuantity: row.plannedQuantity, planStatus: row.status, execution: executionFacts(executions[row.id]) }));
}
export async function createClosingSnapshot(client: PoolClient, actor: TrustedIdentity, orderId: string,
  data: ClosingAllocationData, taxRatePercent: string, freeze: boolean): Promise<ClosingSnapshot> {
  requireClosingChannels(actor,data.channels);
  return createClosingSnapshotFromBasis(client,actor,await prepareClosingSnapshotBasis(client,actor,orderId),data,taxRatePercent,freeze);
}
/** One trusted bounded read per order for a multi-line financial preview. */
export async function prepareClosingSnapshotBasis(client: PoolClient, actor: TrustedIdentity, orderId: string) {
  return {basis:await readClosingBasisInTransaction(client,actor,orderId),assignments:await assignmentsForOrder(client,orderId)};
}
export async function createClosingSnapshotFromBasis(client: PoolClient, actor: TrustedIdentity,
  prepared: Awaited<ReturnType<typeof prepareClosingSnapshotBasis>>, data: ClosingAllocationData, taxRatePercent: string, freeze: boolean): Promise<ClosingSnapshot> {
  requireClosingChannels(actor, data.channels);
  const basis = prepared.basis, orderId=basis.order.id;
  if (!basis.commercial) closingFail(409, 'closing_commercial_basis_required');
  if (basis.order.businessType === 'processing' && data.channels.sales) closingFail(409, 'processing_garment_sales_not_applicable');
  const rows = basis.priceLines.filter(line => line.colorId === data.colorId);
  if (rows.length !== 1 || !['current_color', 'order_wide'].includes(rows[0].scope)) closingFail(409, 'closing_color_basis_required');
  const row = rows[0], prices: ClosingSnapshot['prices'] = {};
  if (data.channels.sales) {
    const view = row.garmentSale;
    if (view?.visibility !== 'allowed' || view.eligibility.state !== 'eligible' || view.value?.price === null || !view.value) closingFail(409, 'closing_sale_basis_required');
    prices.sale = { price: view.value.price, currency: 'CNY' };
  }
  if (data.channels.work) {
    const view = row.workPrice;
    if (view.visibility !== 'allowed' || view.eligibility.state !== 'eligible' || view.value?.price === null || !view.value || view.value.currency !== 'USD') closingFail(409, 'closing_usd_work_basis_required');
    prices.work = { price: view.value.price, currency: 'USD' };
  }
  let executor: ClosingSnapshot['executor'] = null;
  let productionBasis: ClosingExecutionReference[] = [];
  if (data.assignmentId) {
    const assignment = prepared.assignments.find(item => item.id === data.assignmentId);
    const reference = basis.executionReferences.find(item => item.assignmentId === data.assignmentId);
    if (!assignment || !reference || assignment.colorId !== null && assignment.colorId !== data.colorId) closingFail(409, 'closing_assignment_basis_mismatch');
    executor = { type: assignment.executionType, id: reference.executorId, name: assignment.resourceFacts.executionType === 'internal'
      ? assignment.resourceFacts.group.name : assignment.resourceFacts.factory.name, resourceSnapshotHash: assignment.resourceSnapshotHash, version: null };
    productionBasis = [reference];
  } else if (data.executor) {
    const resource = await readProductionResourceSnapshot(client, data.executor.type === 'internal' ? 'groups' : 'factories', data.executor.id, freeze);
    if (!resource.enabled) closingFail(409, 'closing_executor_disabled');
    executor = { ...data.executor, name: resource.name, version: resource.version, resourceSnapshotHash: null };
  }
  const snapshot: ClosingSnapshot = { schemaVersion: 'server-closing-allocation.v1', order: { id: orderId, orderNo: basis.order.orderNo, businessType: basis.order.businessType },
    commercial: { id: basis.commercial.id, version: basis.commercial.version, quoteId: basis.commercial.quoteId, revisionId: basis.commercial.revisionId, priceVersionId: row.priceVersionId! },
    colorId: data.colorId, colorName: row.colorName, assignmentId: data.assignmentId, quantity: data.quantity, channels: data.channels, taxRatePercent,
    quantityBasis: { order: basis.order.quantity, color: row.quantity, planned: productionBasis[0]?.plannedQuantity ?? null,
      completed: productionBasis[0]?.execution?.completedQuantity ?? null },
    prices, executor, productionBasis, reviewBasis: productionBasis, remark: data.remark };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 131072) closingFail(422, 'closing_snapshot_too_large');
  return snapshot;
}
export function checkedClosingSnapshot(value: unknown): ClosingSnapshot {
  const s = value as ClosingSnapshot;
  try {
    const exact = (row: object, keys: string[]) => { if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join(',') !== keys.sort().join(',')) throw Error(); };
    const decimal = (value: string) => { if (typeof value !== 'string' || value.length > 2000 || value.startsWith('-') || canonicalDecimal(value) !== value) throw Error(); };
    const integer = (value: number) => { if (!Number.isSafeInteger(value) || value < 1) throw Error(); };
    exact(s, ['schemaVersion', 'order', 'commercial', 'colorId', 'colorName', 'assignmentId', 'quantity', 'channels', 'taxRatePercent', 'prices', 'quantityBasis', 'executor', 'productionBasis', 'reviewBasis', 'remark']);
    exact(s.order, ['id', 'orderNo', 'businessType']); exact(s.commercial, ['id', 'version', 'quoteId', 'revisionId', 'priceVersionId']);
    for (const id of [s.order.id, s.commercial.id, ...(s.colorId ? [s.colorId] : []), ...(s.assignmentId ? [s.assignmentId] : [])]) if (closingUuid(id) !== id) throw Error();
    for (const label of [s.order.orderNo, s.commercial.quoteId, s.commercial.revisionId, s.commercial.priceVersionId]) if (typeof label !== 'string' || !label || label.length > 512) throw Error();
    if (s.colorName !== null && (typeof s.colorName !== 'string' || s.colorName.length > 2000)) throw Error();
    exact(s.quantityBasis, ['order', 'color', 'planned', 'completed']);
    for (const value of Object.values(s.quantityBasis)) if (value !== null) decimal(value);
    if (s.executor !== null) {
      exact(s.executor, ['type', 'id', 'name', 'resourceSnapshotHash', 'version']);
      if (!['internal', 'outsource'].includes(s.executor.type) || closingUuid(s.executor.id) !== s.executor.id
        || typeof s.executor.name !== 'string' || !s.executor.name || s.executor.name.length > 2000) throw Error();
      if (s.executor.version !== null) integer(s.executor.version);
      if (s.executor.resourceSnapshotHash !== null && !/^[a-f0-9]{64}$/u.test(s.executor.resourceSnapshotHash)) throw Error();
    }
    if (!s || typeof s !== 'object' || s.schemaVersion !== 'server-closing-allocation.v1' || !s.order || !s.commercial
      || !['processing', 'ainuoke_contract'].includes(s.order.businessType) || typeof s.order.orderNo !== 'string'
      || typeof s.commercial.id !== 'string' || !Number.isSafeInteger(s.commercial.version) || s.commercial.version < 1
      || !Array.isArray(s.productionBasis) || !Array.isArray(s.reviewBasis) || s.productionBasis.length > 1 || s.reviewBasis.length > 1
      || typeof s.remark !== 'string' || s.remark.length > 2000 || typeof s.taxRatePercent !== 'string') throw Error();
    const channels = closingChannels(s.channels); if (closingQuantity(s.quantity) !== s.quantity || closingTaxRate(s.taxRatePercent) !== s.taxRatePercent) throw Error();
    if (channels.sales !== Object.hasOwn(s.prices, 'sale') || channels.work !== Object.hasOwn(s.prices, 'work')) throw Error();
    if (s.order.businessType === 'processing' && channels.sales) throw Error();
    for (const [kind, price] of Object.entries(s.prices)) {
      exact(price, ['price', 'currency']);
      if (!['sale', 'work'].includes(kind) || price.currency !== (kind === 'sale' ? 'CNY' : 'USD') || typeof price.price !== 'string'
        || price.price.startsWith('-') || canonicalDecimal(price.price) !== price.price) throw Error();
    }
    for (const ref of [...s.productionBasis, ...s.reviewBasis]) {
      exact(ref, ['assignmentId', 'salesOrderId', 'assignmentVersion', 'colorId', 'executionType', 'executorId', 'resourceSnapshotHash', 'plannedQuantity', 'planStatus', 'execution']);
      for (const id of [ref.assignmentId, ref.salesOrderId, ref.executorId, ...(ref.colorId ? [ref.colorId] : [])]) if (closingUuid(id) !== id) throw Error();
      integer(ref.assignmentVersion); decimal(ref.plannedQuantity);
      if (!['internal', 'outsource'].includes(ref.executionType) || !['planned', 'cancelled'].includes(ref.planStatus) || !/^[a-f0-9]{64}$/u.test(ref.resourceSnapshotHash)) throw Error();
      if (ref.execution !== null) {
        exact(ref.execution, ['version', 'status', 'completedQuantity', 'actualStartDate', 'actualCompletedDate']);
        integer(ref.execution.version); decimal(ref.execution.completedQuantity);
        if (!['in_progress', 'completed'].includes(ref.execution.status)) throw Error();
        for (const date of [ref.execution.actualStartDate, ref.execution.actualCompletedDate]) if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw Error();
      }
    }
    if (s.productionBasis.some(ref => ref.salesOrderId !== s.order.id || ref.assignmentId !== s.assignmentId)
      || s.reviewBasis.some(ref => ref.salesOrderId !== s.order.id || ref.assignmentId !== s.assignmentId)
      || (s.assignmentId === null) !== (s.productionBasis.length === 0)) throw Error();
    compareClosingExecutionReferences(s.productionBasis, s.reviewBasis, 'open');
    return s;
  } catch { return closingFail(503, 'closing_snapshot_invalid'); }
}
export function closingSnapshotIdentity(snapshot: ClosingSnapshot) {
  // Immutable commercial id determines money; public hashes do not include money values.
  return { orderId: snapshot.order.id, commercialId: snapshot.commercial.id, colorId: snapshot.colorId, priceVersionId: snapshot.commercial.priceVersionId,
    assignmentId: snapshot.assignmentId, quantity: snapshot.quantity, channels: snapshot.channels, taxRatePercent: snapshot.taxRatePercent,
    quantityBasis: snapshot.quantityBasis, executor: snapshot.executor, productionBasis: snapshot.productionBasis, reviewBasis: snapshot.reviewBasis, remark: snapshot.remark };
}
export function projectClosingSnapshot(snapshot: ClosingSnapshot, actor: TrustedIdentity) {
  const saleAllowed = actor.permissions.includes('commercial.sale.view'), workAllowed = actor.permissions.includes('commercial.labor.view');
  const allAllowed = (!snapshot.channels.sales || saleAllowed) && (!snapshot.channels.work || workAllowed);
  return { schemaVersion: snapshot.schemaVersion, order: snapshot.order, commercial: snapshot.commercial, colorId: snapshot.colorId, colorName: snapshot.colorName,
    assignmentId: snapshot.assignmentId, quantity: snapshot.quantity, channels: snapshot.channels, taxRatePercent: snapshot.taxRatePercent,
    quantityBasis: snapshot.quantityBasis, executor: snapshot.executor, productionBasis: snapshot.productionBasis, reviewBasis: snapshot.reviewBasis,
    ...(allAllowed ? { remark: snapshot.remark } : {}),
    outputs: {
      ...(snapshot.channels.sales ? { garmentSale: saleAllowed ? { visibility: 'allowed', currency: 'CNY', price: snapshot.prices.sale!.price,
        amount: closingAmount(snapshot.quantity, snapshot.prices.sale!.price, snapshot.taxRatePercent) } : { visibility: 'restricted' } } : {}),
      ...(snapshot.channels.work ? { work: workAllowed ? { visibility: 'allowed', currency: 'USD', price: snapshot.prices.work!.price,
        bucket: snapshot.order.businessType === 'processing' ? 'processing_service' : 'distribution_labor',
        amount: closingAmount(snapshot.quantity, snapshot.prices.work!.price, null) } : { visibility: 'restricted' } } : {}),
    } };
}

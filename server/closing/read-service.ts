import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { readCurrentActor } from '../auth/current-actor.js';
import { requirePermission } from '../auth/permissions.js';
import { CLOSING_READ_PERMISSIONS, closingAmount, closingFail, closingUuid, sumClosingAmounts } from './contract.js';
import { closingSchemaAvailable, readClosingAllocation, readClosingAllocationHistory, readClosingAllocations, readClosingPeriod,
  type ClosingAllocationRecord, type ClosingPeriodRecord } from './repository.js';
import { currentClosingExecutionReferences, projectClosingSnapshot } from './snapshot.js';
import { compareClosingExecutionReferences, type ClosingExecutionReference } from './basis-model.js';
import { parseClosingReadQuery } from './read-contract.js';
export { parseClosingReadQuery } from './read-contract.js';

async function readTransaction<T>(pool: Pool, identity: TrustedIdentity, read: (client: PoolClient, actor: TrustedIdentity) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actor = await readCurrentActor(client, identity); for (const key of CLOSING_READ_PERMISSIONS) requirePermission(actor.permissions, key);
    await closingSchemaAvailable(client); const result = await read(client, actor);
    if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) closingFail(422, 'closing_read_too_large');
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}
function publicPeriod(period: ClosingPeriodRecord, actor: TrustedIdentity) {
  const freeText = actor.permissions.includes('commercial.sale.view') && actor.permissions.includes('commercial.labor.view');
  return { id: period.id, month: period.month, versionId: period.versionId, version: period.version, status: period.status,
    taxRatePercent: period.taxRatePercent, actorName: period.actorName, action: period.action, recordedAt: new Date(period.recordedAt).toISOString(),
    ...(freeText ? { remark: period.remark, reason: period.reason } : {}) };
}
function summary(allocations: ClosingAllocationRecord[], actor: TrustedIdentity) {
  const active = allocations.filter(row => row.status === 'active');
  const quantity = (rows: ClosingAllocationRecord[]) => sumClosingAmounts(rows.map(row => closingAmount(row.snapshot.quantity, '1', null))).decimal;
  const sales = active.filter(row => row.snapshot.channels.sales), work = active.filter(row => row.snapshot.channels.work);
  const distribution = work.filter(row => row.snapshot.order.businessType === 'ainuoke_contract'), processing = work.filter(row => row.snapshot.order.businessType === 'processing');
  return { activeCount: active.length, voidedCount: allocations.length - active.length, registeredQuantity: quantity(active),
    salesQuantity: quantity(sales), distributionWorkQuantity: quantity(distribution), processingServiceQuantity: quantity(processing),
    quantityMeaning: 'one_manual_quantity_per_record_channels_are_not_added' as const,
    garmentSalesCny: actor.permissions.includes('commercial.sale.view') ? { visibility: 'allowed', currency: 'CNY',
      amount: sumClosingAmounts(sales.map(row => closingAmount(row.snapshot.quantity, row.snapshot.prices.sale!.price, row.snapshot.taxRatePercent))) } : { visibility: 'restricted' },
    distributionLaborUsd: actor.permissions.includes('commercial.labor.view') ? { visibility: 'allowed', currency: 'USD',
      amount: sumClosingAmounts(distribution.map(row => closingAmount(row.snapshot.quantity, row.snapshot.prices.work!.price, null))) } : { visibility: 'restricted' },
    processingServiceUsd: actor.permissions.includes('commercial.labor.view') ? { visibility: 'allowed', currency: 'USD',
      amount: sumClosingAmounts(processing.map(row => closingAmount(row.snapshot.quantity, row.snapshot.prices.work!.price, null))) } : { visibility: 'restricted' } };
}
async function referenceMap(client: PoolClient, allocations: ClosingAllocationRecord[]) {
  const ids = new Map<string, Set<string>>();
  for (const row of allocations) {
    if (!ids.has(row.orderId)) ids.set(row.orderId, new Set());
    for (const ref of row.snapshot.productionBasis) ids.get(row.orderId)!.add(ref.assignmentId);
  }
  const result = new Map<string, ClosingExecutionReference[]>();
  for (const [order, assignments] of ids) result.set(order, await currentClosingExecutionReferences(client, order, [...assignments]));
  return result;
}
function publicAllocation(row: ClosingAllocationRecord, actor: TrustedIdentity, current: readonly ClosingExecutionReference[], status: ClosingPeriodRecord['status'], historical = false) {
  const fullyVisible = (!row.snapshot.channels.sales || actor.permissions.includes('commercial.sale.view')) && (!row.snapshot.channels.work || actor.permissions.includes('commercial.labor.view'));
  const review = compareClosingExecutionReferences(row.snapshot.reviewBasis, current, status);
  return { id: row.id, periodId: row.periodId, versionId: row.versionId, version: row.version, status: row.status,
    actorName: row.actorName, action: row.action, recordedAt: new Date(row.recordedAt).toISOString(), ...(fullyVisible ? { reason: row.reason } : {}),
    snapshot: projectClosingSnapshot(row.snapshot, actor), executionReview: row.status === 'voided' ? { status: 'not_evaluated_voided', requiresReview: false, changes: null } : {
      status: historical ? review.changes.length ? 'historical_snapshot_with_later_changes' : 'historical_snapshot' : review.status,
      changes: review.changes, requiresReview: !historical && review.requiresReview, lockedSnapshotPreserved: review.lockedSnapshotPreserved } };
}
export async function listClosingPeriods(pool: Pool, identity: TrustedIdentity, params = new URLSearchParams()) {
  const query = parseClosingReadQuery(params, 'list');
  return readTransaction(pool, identity, async (client, actor) => {
    const where = '($1::text IS NULL OR left(p.month,4)=$1) AND ($2::text IS NULL OR v.status=$2)';
    const args = [query.year, query.status];
    const total = (await client.query<{ total: number }>(`SELECT count(*)::int AS total FROM server_closing_periods p JOIN server_closing_period_heads h ON h.period_id=p.id
      JOIN server_closing_period_versions v ON v.id=h.current_version_id WHERE ${where}`, args)).rows[0].total;
    const rows = (await client.query<ClosingPeriodRecord>(`SELECT p.id::text,p.month,v.id::text AS "versionId",v.version,v.status,v.tax_rate_percent::text AS "taxRatePercent",
      v.remark,v.actor_name AS "actorName",v.action,v.reason,v.recorded_at::text AS "recordedAt",NULL AS "allocationManifest"
      FROM server_closing_periods p JOIN server_closing_period_heads h ON h.period_id=p.id JOIN server_closing_period_versions v ON v.id=h.current_version_id
      WHERE ${where} ORDER BY p.month DESC LIMIT $3 OFFSET $4`, [...args, query.limit, query.offset])).rows;
    return { items: rows.map(row => publicPeriod(row, actor)), total, offset: query.offset, limit: query.limit };
  });
}
export async function readClosingPeriodDetail(pool: Pool, identity: TrustedIdentity, rawId: string, params = new URLSearchParams()) {
  const id = closingUuid(rawId), query = parseClosingReadQuery(params, 'period');
  return readTransaction(pool, identity, async (client, actor) => {
    const currentPeriod = await readClosingPeriod(client, id), period = query.version === null ? currentPeriod : await readClosingPeriod(client, id, false, query.version);
    if (period.status === 'open' && period.version !== currentPeriod.version) closingFail(409, 'closing_open_period_changed');
    const allocations = await readClosingAllocations(client, id, period.allocationManifest), references = await referenceMap(client, allocations.filter(row => row.status === 'active'));
    const visible = allocations.filter(row => query.includeVoided || row.status === 'active');
    const reviews = allocations.filter(row => row.status === 'active').map(row => compareClosingExecutionReferences(row.snapshot.reviewBasis, references.get(row.orderId) ?? [], period.status));
    return { period: publicPeriod(period, actor), summary: summary(allocations, actor), total: visible.length, offset: query.offset, limit: query.limit,
      reviewRequiredCount: reviews.filter(row => row.requiresReview).length, laterCorrectionCount: reviews.filter(row => row.changes.length).length,
      items: visible.slice(query.offset, query.offset + query.limit).map(row => publicAllocation(row, actor, references.get(row.orderId) ?? [], period.status)),
      source: 'server_closing_snapshots' as const, automaticMonthAllocation: false, currentPeriodVersion: currentPeriod.version };
  });
}
export async function readClosingHistory(pool: Pool, identity: TrustedIdentity, kind: 'period' | 'allocation', rawId: string, params = new URLSearchParams()) {
  const id = closingUuid(rawId), query = parseClosingReadQuery(params, 'history');
  return readTransaction(pool, identity, async (client, actor) => {
    if (kind === 'period') {
      const current = await readClosingPeriod(client, id), anchor = query.version ?? current.version;
      if (anchor > current.version) closingFail(400, 'invalid_closing_query');
      const rows = (await client.query<ClosingPeriodRecord>(`SELECT p.id::text,p.month,v.id::text AS "versionId",v.version,v.status,v.tax_rate_percent::text AS "taxRatePercent",
        v.remark,v.actor_name AS "actorName",v.action,v.reason,v.recorded_at::text AS "recordedAt",NULL AS "allocationManifest"
        FROM server_closing_periods p JOIN server_closing_period_versions v ON v.period_id=p.id WHERE p.id=$1 AND v.version<=$2 ORDER BY v.version DESC LIMIT $3 OFFSET $4`,
      [id, anchor, query.limit + 1, query.offset])).rows;
      return { entityType: kind, entityId: id, asOfVersion: anchor, items: rows.slice(0, query.limit).map(row => publicPeriod(row, actor)), hasMore: rows.length > query.limit, offset: query.offset, limit: query.limit };
    }
    const current = await readClosingAllocation(client, id), anchor = query.version ?? current.version;
    if (anchor > current.version) closingFail(400, 'invalid_closing_query');
    const rows = await readClosingAllocationHistory(client, id, query.offset, anchor), period = await readClosingPeriod(client, current.periodId);
    const references = await referenceMap(client, rows);
    return { entityType: kind, entityId: id, asOfVersion: anchor, items: rows.slice(0, query.limit).map(row => publicAllocation(row, actor, references.get(row.orderId) ?? [], period.status, true)),
      hasMore: rows.length > query.limit, offset: query.offset, limit: query.limit };
  });
}

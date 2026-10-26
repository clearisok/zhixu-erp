import type { PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { checkedClosingSnapshot, type ClosingSnapshot } from './snapshot.js';
import { closingFail, type ClosingIntent } from './contract.js';

export type AllocationManifestItem = { allocationId: string; versionId: string; version: number };
export type ClosingPeriodRecord = {
  id: string; month: string; versionId: string; version: number; status: 'open' | 'confirmed' | 'locked';
  taxRatePercent: string; remark: string; allocationManifest: AllocationManifestItem[] | null;
  actorName: string; action: string; reason: string; recordedAt: string;
};
export type ClosingAllocationRecord = {
  id: string; periodId: string; orderId: string; versionId: string; version: number; status: 'active' | 'voided'; snapshot: ClosingSnapshot;
  actorName: string; action: string; reason: string; recordedAt: string;
};
export const CLOSING_ALLOCATION_LIMIT = 5000;
export async function closingSchemaAvailable(client: PoolClient) {
  const row = (await client.query<{ present: boolean }>("SELECT to_regclass('public.server_closing_commands') IS NOT NULL AS present")).rows[0];
  if (!row?.present) closingFail(503, 'server_closing_schema_unavailable');
}
const periodColumns = `p.id::text,p.month,v.id::text AS "versionId",v.version,v.status,v.tax_rate_percent::text AS "taxRatePercent",v.remark,
 v.allocation_manifest AS "allocationManifest",v.actor_name AS "actorName",v.action,v.reason,v.recorded_at::text AS "recordedAt"`;
const allocationColumns = `a.id::text,a.period_id::text AS "periodId",a.sales_order_id::text AS "orderId",v.id::text AS "versionId",v.version,v.status,v.snapshot,
 v.actor_name AS "actorName",v.action,v.reason,v.recorded_at::text AS "recordedAt"`;
export async function readClosingPeriod(client: PoolClient, id: string, lock = false, version: number | null = null): Promise<ClosingPeriodRecord> {
  if (lock) await client.query('SELECT id FROM server_closing_periods WHERE id=$1 FOR UPDATE', [id]);
  const row = (await client.query<ClosingPeriodRecord>(`SELECT ${periodColumns} FROM server_closing_periods p
   JOIN server_closing_period_heads h ON h.period_id=p.id JOIN server_closing_period_versions v ON v.period_id=p.id AND ${version === null ? 'v.id=h.current_version_id' : 'v.version=$2'}
   WHERE p.id=$1`, version === null ? [id] : [id, version])).rows[0];
  if (!row) closingFail(404, 'closing_period_not_found');
  return row;
}
export async function closingAllocationManifest(client: PoolClient, periodId: string): Promise<AllocationManifestItem[]> {
  const rows = (await client.query<AllocationManifestItem>(`SELECT a.id::text AS "allocationId",h.current_version_id::text AS "versionId",h.version
   FROM server_closing_allocations a JOIN server_closing_allocation_heads h ON h.allocation_id=a.id WHERE a.period_id=$1 ORDER BY a.id LIMIT 5001`, [periodId])).rows;
  if (rows.length > CLOSING_ALLOCATION_LIMIT) closingFail(422, 'closing_period_allocation_limit');
  return rows;
}
function checkedRows(rows: ClosingAllocationRecord[]) {
  if (rows.length > CLOSING_ALLOCATION_LIMIT) closingFail(422, 'closing_period_allocation_limit');
  return rows.map(row => {
    const snapshot = checkedClosingSnapshot(row.snapshot);
    if (snapshot.order.id !== row.orderId) closingFail(503, 'closing_snapshot_invalid');
    return { ...row, snapshot };
  });
}
export async function readClosingAllocations(client: PoolClient, periodId: string, manifest: AllocationManifestItem[] | null = null) {
  const rows = (await client.query<ClosingAllocationRecord>(`SELECT ${allocationColumns} FROM server_closing_allocations a
   JOIN server_closing_allocation_heads h ON h.allocation_id=a.id JOIN server_closing_allocation_versions v ON v.allocation_id=a.id
    AND ${manifest === null ? 'v.id=h.current_version_id' : 'v.id=ANY($2::uuid[])'}
   WHERE a.period_id=$1 ORDER BY a.id LIMIT 5001`, manifest === null ? [periodId] : [periodId, manifest.map(row => row.versionId)])).rows;
  if (manifest && (rows.length !== manifest.length || rows.some(row => !manifest.some(item => item.allocationId === row.id && item.versionId === row.versionId && item.version === row.version)))) closingFail(503, 'closing_manifest_invalid');
  return checkedRows(rows);
}
export async function readClosingAllocation(client: PoolClient, id: string): Promise<ClosingAllocationRecord> {
  const row = (await client.query<ClosingAllocationRecord>(`SELECT ${allocationColumns} FROM server_closing_allocations a
   JOIN server_closing_allocation_heads h ON h.allocation_id=a.id JOIN server_closing_allocation_versions v ON v.id=h.current_version_id WHERE a.id=$1`, [id])).rows[0];
  if (!row) closingFail(404, 'closing_allocation_not_found');
  return checkedRows([row])[0];
}
export async function appendClosingPeriodVersion(client: PoolClient, actor: TrustedIdentity, requestId: string, operationId: string,
  period: ClosingPeriodRecord, status: ClosingPeriodRecord['status'], action: string, reason: string) {
  const manifest = status === 'open' ? null : await closingAllocationManifest(client, period.id);
  const version = period.version + 1;
  const row = (await client.query<{ id: string }>(`INSERT INTO server_closing_period_versions(period_id,version,status,tax_rate_percent,remark,allocation_manifest,actor_id,actor_name,request_id,action,reason,operation_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id::text`,
  [period.id, version, status, period.taxRatePercent, period.remark, manifest === null ? null : JSON.stringify(manifest), actor.internalUserId, actor.userName, requestId, action, reason, operationId])).rows[0];
  const changed = await client.query('UPDATE server_closing_period_heads SET current_version_id=$2,version=$3 WHERE period_id=$1 AND version=$4', [period.id, row.id, version, period.version]);
  if (changed.rowCount !== 1) closingFail(409, 'closing_period_version_conflict');
  return { ...period, status, version, versionId: row.id, allocationManifest: manifest };
}
export async function createClosingPeriod(client: PoolClient, actor: TrustedIdentity, requestId: string, operationId: string, intent: Extract<ClosingIntent, { action: 'create_period' }>) {
  const id = (await client.query<{ id: string }>('INSERT INTO server_closing_periods(month,created_by) VALUES($1,$2) RETURNING id::text', [intent.month, actor.internalUserId])).rows[0].id;
  const versionId = (await client.query<{ id: string }>(`INSERT INTO server_closing_period_versions(period_id,version,status,tax_rate_percent,remark,actor_id,actor_name,request_id,action,reason,operation_id)
   VALUES($1,1,'open',$2,$3,$4,$5,$6,'create_period','',$7) RETURNING id::text`, [id, intent.taxRatePercent, intent.remark, actor.internalUserId, actor.userName, requestId, operationId])).rows[0].id;
  await client.query('INSERT INTO server_closing_period_heads VALUES($1,$2,1)', [id, versionId]);
  return readClosingPeriod(client, id);
}
export async function appendClosingAllocationVersion(client: PoolClient, actor: TrustedIdentity, requestId: string, operationId: string,
  id: string, periodId: string, oldVersion: number, snapshot: ClosingSnapshot, action: string, reason: string) {
  const version = oldVersion + 1, status = action === 'void_allocation' ? 'voided' : 'active';
  const original = snapshot.productionBasis[0], reviewed = snapshot.reviewBasis[0];
  const row = (await client.query<{ id: string }>(`INSERT INTO server_closing_allocation_versions(allocation_id,period_id,sales_order_id,version,status,commercial_version_id,color_id,assignment_id,
    quantity,include_sales,include_work,sale_price,work_price,tax_rate_percent,snapshot,actor_id,actor_name,request_id,action,reason,operation_id,
    assignment_version,execution_version,review_assignment_version,review_execution_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING id::text`,
  [id, periodId, snapshot.order.id, version, status, snapshot.commercial.id, snapshot.colorId, snapshot.assignmentId, snapshot.quantity, snapshot.channels.sales, snapshot.channels.work,
    snapshot.prices.sale?.price ?? null, snapshot.prices.work?.price ?? null, snapshot.taxRatePercent, snapshot, actor.internalUserId, actor.userName, requestId, action, reason, operationId,
    original?.assignmentVersion ?? null, original?.execution?.version ?? null, reviewed?.assignmentVersion ?? null, reviewed?.execution?.version ?? null])).rows[0];
  if (oldVersion === 0) await client.query('INSERT INTO server_closing_allocation_heads VALUES($1,$2,$3)', [id, row.id, version]);
  else if ((await client.query('UPDATE server_closing_allocation_heads SET current_version_id=$2,version=$3 WHERE allocation_id=$1 AND version=$4', [id, row.id, version, oldVersion])).rowCount !== 1) closingFail(409, 'closing_allocation_version_conflict');
  return { id, version, versionId: row.id, status };
}
export async function readClosingAllocationHistory(client: PoolClient, id: string, offset: number, asOfVersion: number) {
  const rows = (await client.query<ClosingAllocationRecord>(`SELECT ${allocationColumns} FROM server_closing_allocations a
   JOIN server_closing_allocation_versions v ON v.allocation_id=a.id WHERE a.id=$1 AND v.version<=$3 ORDER BY v.version DESC LIMIT 51 OFFSET $2`, [id, offset, asOfVersion])).rows;
  return checkedRows(rows);
}

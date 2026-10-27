import type { Pool, PoolClient } from 'pg';
import type { PermissionKey } from '../../features/permissions/model/permissions.js';
import type { TrustedIdentity } from '../auth/session.js';
import { readCurrentActor } from '../auth/current-actor.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import { lockEffectiveAttribution } from '../sales-orders/effective-attribution.js';
import { lockProductionResourceScope } from '../production-resources/snapshot-lock.js';
import { planHash } from '../production-scheduling/repository.js';
import { appendOperationLog, createServerOperationId, type ServerOperationLogInput } from '../operation-logs/repository.js';
import { CLOSING_READ_PERMISSIONS, closingActionPermission, closingChannelPermissions, closingFail, closingUuid, compareDecimals, parseClosingCommand, parseClosingIntent,
  type ClosingChannels, type ClosingCommand, type ClosingIntent } from './contract.js';
import { compareClosingExecutionReferences } from './basis-model.js';
import { createClosingSnapshot, closingSnapshotIdentity, currentClosingExecutionReferences, projectClosingSnapshot, requireClosingChannels,
  type ClosingSnapshot } from './snapshot.js';
import { appendClosingAllocationVersion, appendClosingPeriodVersion, closingSchemaAvailable, createClosingPeriod,
  readClosingAllocation, readClosingAllocations, readClosingPeriod, CLOSING_ALLOCATION_LIMIT, type ClosingAllocationRecord, type ClosingPeriodRecord } from './repository.js';
import {applyMonthFinancialSync,buildMonthFinancialSync,guardLegacyClosingWrite,monthFinancialSyncIdentity,projectMonthFinancialSync,validateMonthFinancialCoverage,
 type BuiltMonthSync} from './month-financial-service.js';

export type ClosingOutcome = { requestId: string; status: 'applied'; periodId: string; periodVersion: number; periodStatus: ClosingPeriodRecord['status'];
  allocationId?: string; allocationVersion?: number; operationId: string } | { requestId: string; status: 'rejected'; error: { status: number; code: string } };
type Built = { intent: ClosingIntent; period: ClosingPeriodRecord | null; old: ClosingAllocationRecord | null; snapshot: ClosingSnapshot | null;
  allocations: ClosingAllocationRecord[]; nextStatus: ClosingPeriodRecord['status']; warnings: string[]; previewHash: string; monthSync?:BuiltMonthSync };
function requirePermissions(actor: TrustedIdentity, permissions: readonly PermissionKey[]) { for (const permission of permissions) requirePermission(actor.permissions, permission); }
/** The receipt stores PostgreSQL's jsonb representation, whose escaped byte size
 * differs from compact HTTP JSON. Validate the exact representation before writes. */
async function requireCommandBudget(client: PoolClient, command: ClosingCommand) {
  const row = (await client.query<{ bytes: number }>('SELECT octet_length($1::jsonb::text)::int AS bytes', [JSON.stringify(command)])).rows[0];
  if (row.bytes > 16384) closingFail(422, 'closing_command_too_large');
}
/** Metadata-only union: a hidden old channel may not be indirectly edited or approved. */
async function commandPermissions(client: PoolClient, intent: ClosingIntent): Promise<PermissionKey[]> {
  const channels: ClosingChannels[] = [];
  if(intent.action==='sync_month_outputs')channels.push(intent.channels);
  if ('data' in intent) channels.push(intent.data.channels);
  if ('allocationId' in intent) {
    const row = (await client.query<{ sales: boolean; work: boolean }>(`SELECT v.include_sales AS sales,v.include_work AS work FROM server_closing_allocation_heads h
      JOIN server_closing_allocation_versions v ON v.id=h.current_version_id WHERE h.allocation_id=$1`, [intent.allocationId])).rows[0];
    if (row) channels.push(row);
  } else if ('periodId' in intent && !('data' in intent) && intent.action!=='sync_month_outputs') {
    const rows = (await client.query<{ sales: boolean; work: boolean }>(`SELECT DISTINCT v.include_sales AS sales,v.include_work AS work FROM server_closing_allocations a
      JOIN server_closing_allocation_heads h ON h.allocation_id=a.id JOIN server_closing_allocation_versions v ON v.id=h.current_version_id
      WHERE a.period_id=$1 AND v.status='active'`, [intent.periodId])).rows;
    channels.push(...rows);
  }
  return [...new Set<PermissionKey>([...CLOSING_READ_PERMISSIONS, closingActionPermission(intent), ...closingChannelPermissions(...channels)])];
}
async function lockPhysicalOrders(client: PoolClient, ids: string[]) {
  const unique = [...new Set(ids)].sort(); if (!unique.length) return;
  const rows = await client.query('SELECT id FROM sales_orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE', [unique]);
  if (rows.rowCount !== unique.length) closingFail(404, 'closing_order_not_found');
}
function quantityWarnings(snapshot: ClosingSnapshot) {
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(snapshot.quantityBasis)) {
    if (value !== null && compareDecimals(snapshot.quantity, value) > 0) warnings.push('exceeds_' + key + '_quantity');
  }
  if (!snapshot.executor) warnings.push('executor_unassigned');
  return warnings;
}
async function buildClosing(client: PoolClient, actor: TrustedIdentity, intent: ClosingIntent, freeze: boolean): Promise<Built> {
  if (intent.action === 'create_period') {
    if ((await client.query('SELECT id FROM server_closing_periods WHERE month=$1', [intent.month])).rowCount) closingFail(409, 'closing_period_already_exists');
    return { intent, period: null, old: null, snapshot: null, allocations: [], nextStatus: 'open', warnings: [], previewHash: planHash({ intent, period: null }) };
  }
  const period = await readClosingPeriod(client, intent.periodId, freeze);
  if (period.version !== intent.expectedPeriodVersion) closingFail(409, 'closing_period_version_conflict');
  const allocations = await readClosingAllocations(client, period.id);
  if(intent.action==='sync_month_outputs'){
    const monthSync=await buildMonthFinancialSync(client,actor,period,intent,allocations,freeze);
    return {intent,period,old:null,snapshot:null,allocations,nextStatus:'open',warnings:monthSync.warnings,monthSync,
      previewHash:planHash({intent,period:{id:period.id,version:period.version,status:period.status,taxRatePercent:period.taxRatePercent},
        monthSync:monthFinancialSyncIdentity(monthSync),manifest:allocations.map(row=>({id:row.id,versionId:row.versionId,version:row.version,status:row.status}))})};
  }
  const old = 'allocationId' in intent ? await readClosingAllocation(client, intent.allocationId) : null;
  if (old && old.periodId !== period.id) closingFail(409, 'closing_allocation_period_conflict');
  if (old && 'expectedVersion' in intent && old.version !== intent.expectedVersion) closingFail(409, 'closing_allocation_version_conflict');
  if (old?.status === 'voided') closingFail(409, 'closing_allocation_voided');
  if (freeze) await lockPhysicalOrders(client, intent.action === 'create_allocation' ? [intent.orderId] : old ? [old.orderId] : allocations.map(row => row.orderId));
  let snapshot: ClosingSnapshot | null = null, nextStatus = period.status;
  const warnings: string[] = [];
  if (intent.action === 'create_allocation' || intent.action === 'update_allocation') {
    if (period.status !== 'open') closingFail(409, 'closing_period_not_open');
    if (intent.action === 'create_allocation' && allocations.length >= CLOSING_ALLOCATION_LIMIT) closingFail(422, 'closing_period_allocation_limit');
    if (old) requireClosingChannels(actor, old.snapshot.channels, intent.data.channels);
    await guardLegacyClosingWrite(client,intent.action==='create_allocation'?intent.orderId:old!.orderId,old?.id??null,intent.action);
    snapshot = await createClosingSnapshot(client, actor, intent.action === 'create_allocation' ? intent.orderId : old!.orderId, intent.data, period.taxRatePercent, freeze);
    warnings.push(...quantityWarnings(snapshot));
  } else if (intent.action === 'void_allocation' || intent.action === 'review_allocation') {
    if (period.status !== 'open') closingFail(409, 'closing_period_not_open');
    snapshot = structuredClone(old!.snapshot); requireClosingChannels(actor, snapshot.channels);
    if(intent.action==='void_allocation')await guardLegacyClosingWrite(client,old!.orderId,old!.id,intent.action);
    if (intent.action === 'review_allocation') {
      const current = await currentClosingExecutionReferences(client, old!.orderId, snapshot.productionBasis.map(row => row.assignmentId));
      if (current.length !== snapshot.productionBasis.length) closingFail(409, 'closing_referenced_assignment_unavailable');
      snapshot.reviewBasis = current;
    }
  } else {
    const expected = { confirm_period: 'open', unconfirm_period: 'confirmed', lock_period: 'confirmed', reopen_period: 'locked' } as const;
    const next = { confirm_period: 'confirmed', unconfirm_period: 'open', lock_period: 'locked', reopen_period: 'open' } as const;
    if (period.status !== expected[intent.action]) closingFail(409, 'closing_period_state_conflict');
    nextStatus = next[intent.action];
    for (const allocation of allocations.filter(row => row.status === 'active')) requireClosingChannels(actor, allocation.snapshot.channels);
    if (intent.action === 'confirm_period' || intent.action === 'lock_period') {
      await validateMonthFinancialCoverage(client,period,allocations,freeze);
      const grouped = new Map<string, Set<string>>();
      for (const allocation of allocations.filter(row => row.status === 'active')) {
        if (!grouped.has(allocation.orderId)) grouped.set(allocation.orderId, new Set());
        for (const ref of allocation.snapshot.productionBasis) grouped.get(allocation.orderId)!.add(ref.assignmentId);
      }
      const current = new Map<string, Awaited<ReturnType<typeof currentClosingExecutionReferences>>>();
      for (const [orderId, ids] of grouped) current.set(orderId, await currentClosingExecutionReferences(client, orderId, [...ids]));
      for (const allocation of allocations.filter(row => row.status === 'active')) {
        const change = compareClosingExecutionReferences(allocation.snapshot.reviewBasis, current.get(allocation.orderId) ?? [], period.status);
        if (change.requiresReview) closingFail(409, 'closing_execution_review_required');
      }
    }
  }
  const manifest = allocations.map(row => ({ id: row.id, versionId: row.versionId, version: row.version, status: row.status }));
  const previewHash = planHash({ intent, period: { id: period.id, version: period.version, status: period.status, taxRatePercent: period.taxRatePercent },
    old: old ? { id: old.id, versionId: old.versionId, version: old.version } : null,
    after: snapshot ? closingSnapshotIdentity(snapshot) : null, manifest, nextStatus, warnings });
  return { intent, period, old, snapshot, allocations, nextStatus, warnings, previewHash };
}
function projectBuild(build: Built, actor: TrustedIdentity) {
  const result = { intent: build.intent, previewHash: build.previewHash, period: build.period ? { id: build.period.id, month: build.period.month,
    version: build.period.version, status: build.period.status, taxRatePercent: build.period.taxRatePercent } : null,
    before: build.old ? { version: build.old.version, status: build.old.status, snapshot: projectClosingSnapshot(build.old.snapshot, actor) } : null,
    after: build.snapshot ? { status: build.intent.action === 'void_allocation' ? 'voided' : 'active', snapshot: projectClosingSnapshot(build.snapshot, actor) } : null,
    nextStatus: build.nextStatus, allocationCount: build.allocations.length, warnings: build.warnings,
    quantityConfirmation: build.monthSync?'order_month_plan' as const:'manual' as const, productionAndShipments: 'reference_only' as const,
    ...(build.monthSync?{monthSync:projectMonthFinancialSync(build.monthSync,actor)}:{}) };
  if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) closingFail(422, 'closing_preview_too_large');
  return result;
}
export async function previewClosingCommand(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const intent = parseClosingIntent(raw), client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const actor = await readCurrentActor(client, identity);
    requirePermissions(actor, CLOSING_READ_PERMISSIONS); await closingSchemaAvailable(client);
    requirePermissions(actor, await commandPermissions(client, intent));
    await requireCommandBudget(client, { requestId: '00000000-0000-0000-0000-000000000000', intent, previewHash: '0'.repeat(64) });
    const result = projectBuild(await buildClosing(client, actor, intent, false), actor);
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}
async function applyClosing(client: PoolClient, actor: TrustedIdentity, command: ClosingCommand, build: Built): Promise<ClosingOutcome> {
  const operationId = createServerOperationId(), intent = command.intent;
  let period: ClosingPeriodRecord, allocation: Awaited<ReturnType<typeof appendClosingAllocationVersion>> | null = null;
  if (intent.action === 'create_period') period = await createClosingPeriod(client, actor, command.requestId, operationId, intent);
  else {
    period = build.period!;
    if (build.snapshot) {
      const id = build.old?.id ?? (await client.query<{ id: string }>('INSERT INTO server_closing_allocations(period_id,sales_order_id,created_by) VALUES($1,$2,$3) RETURNING id::text',
        [period.id, build.snapshot.order.id, actor.internalUserId])).rows[0].id;
      allocation = await appendClosingAllocationVersion(client, actor, command.requestId, operationId, id, period.id, build.old?.version ?? 0,
        build.snapshot, intent.action, 'reason' in intent ? intent.reason : '');
    }
    if(build.monthSync)await applyMonthFinancialSync(client,actor,command.requestId,operationId,period.id,
      'reason' in intent?intent.reason:'',build.monthSync);
    period = await appendClosingPeriodVersion(client, actor, command.requestId, operationId, period, build.nextStatus,
      build.snapshot||build.monthSync ? 'allocation_change' : intent.action, 'reason' in intent ? intent.reason : '');
  }
  const labels: Record<ClosingIntent['action'], ServerOperationLogInput['action']> = { create_period: '创建关账月份', create_allocation: '新增关账归属', update_allocation: '修改关账归属',
    review_allocation: '保留关账快照', void_allocation: '作废关账归属', confirm_period: '确认关账月份', unconfirm_period: '取消确认关账月份', lock_period: '锁定关账月份', reopen_period: '重新打开关账月份',
    sync_month_outputs:'采用月份关账依据' };
  await appendOperationLog(client, actor, { operationId, module: '关账中心', entityType: allocation ? 'ClosingAllocation' : 'ClosingPeriod', entityId: allocation?.id ?? period.id,
    action: labels[intent.action], afterData: { objectName: period.month + (build.snapshot ? ' · ' + build.snapshot.order.orderNo : ''),
      ...(build.snapshot ? { orderId: build.snapshot.order.id } : {}),
      values: { 月份: period.month, 状态: period.status, 版本: period.version, ...(build.snapshot ? { 数量: build.snapshot.quantity, 颜色: build.snapshot.colorName } : {}),
        ...(build.monthSync?{依据条数:build.monthSync.changes.length}:{}) } },
    context: { closingPeriodId: period.id, ...(allocation ? { closingAllocationId: allocation.id } : {}) },
    metadata: { requestId: command.requestId, action: intent.action } });
  return { requestId: command.requestId, status: 'applied', periodId: period.id, periodVersion: period.version, periodStatus: period.status,
    ...(allocation ? { allocationId: allocation.id, allocationVersion: allocation.version } : {}), operationId };
}
export async function executeClosingCommand(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const command = parseClosingCommand(raw), digest = planHash(command), client = await pool.connect(); let committing = false;
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='5s'"); await lockEffectiveAttribution(client);
    const actor = await readCurrentActor(client, identity, true); requirePermissions(actor, [...CLOSING_READ_PERMISSIONS, closingActionPermission(command.intent)]);
    await closingSchemaAvailable(client);
    await requireCommandBudget(client, command);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`server-closing:${actor.internalUserId}:${command.requestId}`]);
    const prior = (await client.query<{ payload_hash: string; result: ClosingOutcome; required_permissions: PermissionKey[] }>(
      'SELECT payload_hash,result,required_permissions FROM server_closing_commands WHERE actor_id=$1 AND request_id=$2', [actor.internalUserId, command.requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== digest) closingFail(409, 'closing_request_conflict');
      requirePermissions(actor, prior.required_permissions); committing = true; await client.query('COMMIT');
      return { ...prior.result, replayed: true };
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('production-planning-write-v1',0))");
    await lockProductionResourceScope(client, 'freeze');
    const required = await commandPermissions(client, command.intent); requirePermissions(actor, required);
    await client.query("SELECT set_config('zhixu.closing_command','on',true)"); await client.query('SAVEPOINT closing_apply');
    let result: ClosingOutcome;
    try {
      const build = await buildClosing(client, actor, command.intent, true);
      if (build.previewHash !== command.previewHash) closingFail(409, 'closing_preview_changed');
      result = await applyClosing(client, actor, command, build);
    } catch (error) {
      if (!(error instanceof HttpError) || ![404, 409, 422].includes(error.status)) throw error;
      await client.query('ROLLBACK TO SAVEPOINT closing_apply');
      result = { requestId: command.requestId, status: 'rejected', error: { status: error.status, code: error.code } };
    }
    await client.query('INSERT INTO server_closing_commands(actor_id,request_id,action,payload_hash,command,result,required_permissions) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [actor.internalUserId, command.requestId, command.intent.action, digest, command, result, required]);
    committing = true; await client.query('COMMIT'); return { ...result, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (committing) return { requestId: command.requestId, status: 'unverified' as const };
    throw error;
  } finally { client.release(); }
}
export async function readClosingCommandReceipt(pool: Pool, identity: TrustedIdentity, requestId: string) {
  requestId = closingUuid(requestId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY'); await client.query("SET LOCAL lock_timeout='5s'");
    let actor = await readCurrentActor(client, identity); requirePermissions(actor, CLOSING_READ_PERMISSIONS); await closingSchemaAvailable(client);
    await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))', [`server-closing:${actor.internalUserId}:${requestId}`]);
    actor = await readCurrentActor(client, identity); requirePermissions(actor, CLOSING_READ_PERMISSIONS);
    const row = (await client.query<{ payload_hash: string; command: unknown; result: ClosingOutcome; required_permissions: PermissionKey[] }>(
      'SELECT payload_hash,command,result,required_permissions FROM server_closing_commands WHERE actor_id=$1 AND request_id=$2', [actor.internalUserId, requestId])).rows[0];
    if (row) {
      let original: ClosingCommand;
      try { original = parseClosingCommand(row.command); } catch { return closingFail(503, 'closing_receipt_invalid'); }
      if (original.requestId !== requestId || planHash(original) !== row.payload_hash || row.result.requestId !== requestId) closingFail(503, 'closing_receipt_invalid');
    }
    let result = row?.result ?? null;
    if (result?.status === 'rejected' && row!.required_permissions.filter(key => key.startsWith('commercial.')).some(key => !actor.permissions.includes(key))) {
      result = { ...result, error: { status: result.error.status, code: 'closing_details_restricted' } };
    }
    await client.query('COMMIT'); return row ? { state: 'recorded' as const, requestId, commandHash: row.payload_hash, result: result! } : { state: 'unknown' as const, requestId };
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { closingFixture } from './closing-fixture.js';
import { readCurrentActor } from '../auth/current-actor.js';
import { createClosingSnapshot } from '../closing/snapshot.js';
import { appendClosingAllocationVersion, appendClosingPeriodVersion, readClosingPeriod } from '../closing/repository.js';
import { CLOSING_READ_PERMISSIONS, closingChannelPermissions, parseClosingCommand, type ClosingAllocationData } from '../closing/contract.js';
import { planHash } from '../production-scheduling/repository.js';
import { appendOperationLog } from '../operation-logs/repository.js';

type Fixture = Awaited<ReturnType<typeof closingFixture>>;
/** Historical storage fixture only. This does not call/enable a retired product
 * command and must never be used to claim that a new manual write succeeded. */
export async function restoreHistoricalFixtureAllocation(f: Fixture, periodId: string, orderId: string, data: ClosingAllocationData) {
  assert.match(f.postgres.containerName, /^zhixu-pg-it-[a-f0-9]{12}$/u);
  const client = await f.pool.connect();
  try {
    assert.match((await client.query<{ name: string }>('SELECT current_database() AS name')).rows[0].name, /^zhixu_it_closing_commands_[a-f0-9]{8}$/u);
    await client.query('BEGIN'); await client.query("SELECT set_config('zhixu.closing_command','on',true)");
    const actor = await readCurrentActor(client, f.editor.actor), period = await readClosingPeriod(client, periodId, true);
    assert.equal(period.status, 'open');
    const snapshot = await createClosingSnapshot(client, actor, orderId, data, period.taxRatePercent, false);
    const id = (await client.query<{ id: string }>('INSERT INTO server_closing_allocations(period_id,sales_order_id,created_by) VALUES($1,$2,$3) RETURNING id::text', [periodId, orderId, actor.internalUserId])).rows[0].id;
    const command = parseClosingCommand({ requestId: randomUUID(), intent: { action: 'create_allocation', periodId, expectedPeriodVersion: period.version, orderId, data }, previewHash: 'a'.repeat(64) });
    const operationId = 'historical-fixture-' + randomUUID();
    const allocation = await appendClosingAllocationVersion(client, actor, command.requestId, operationId, id, periodId, 0, snapshot, 'create_allocation', 'Restored synthetic historical fixture');
    const next = await appendClosingPeriodVersion(client, actor, command.requestId, operationId, period, 'open', 'allocation_change', 'Restored synthetic historical fixture');
    const result = { requestId: command.requestId, status: 'applied' as const, periodId, periodVersion: next.version, periodStatus: 'open' as const, allocationId: id, allocationVersion: allocation.version, operationId };
    await client.query('INSERT INTO server_closing_commands(actor_id,request_id,action,payload_hash,command,result,required_permissions) VALUES($1,$2,$3,$4,$5,$6,$7)', [actor.internalUserId, command.requestId, command.intent.action, planHash(command), command, result, [...CLOSING_READ_PERMISSIONS, 'closing.edit', ...closingChannelPermissions(data.channels)]]);
    await appendOperationLog(client, actor, { operationId, module: '关账中心', entityType: 'ClosingAllocation', entityId: id, action: '新增关账归属', afterData: { objectName: period.month + ' · ' + snapshot.order.orderNo }, context: { closingPeriodId: periodId, closingAllocationId: id }, metadata: { requestId: command.requestId, action: 'create_allocation' } });
    await client.query('COMMIT'); return { command, result };
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}

export async function restoreHistoricalFixturePeriodStatus(f: Fixture, periodId: string, status: 'confirmed' | 'locked') {
  assert.match(f.postgres.containerName, /^zhixu-pg-it-[a-f0-9]{12}$/u);
  const client = await f.pool.connect();
  try {
    assert.match((await client.query<{ name: string }>('SELECT current_database() AS name')).rows[0].name, /^zhixu_it_closing_commands_[a-f0-9]{8}$/u);
    await client.query('BEGIN'); await client.query("SELECT set_config('zhixu.closing_command','on',true)");
    const actor = await readCurrentActor(client, f.editor.actor); let period = await readClosingPeriod(client, periodId, true);
    const restore = async (target: 'confirmed' | 'locked') => {
      const action = target === 'locked' ? 'lock_period' : 'confirm_period', operationId = 'historical-fixture-' + randomUUID(), reason = 'Restored synthetic historical period, not a live transition';
      const command = parseClosingCommand({ requestId: randomUUID(), intent: { action, periodId, expectedPeriodVersion: period.version, reason }, previewHash: 'a'.repeat(64) });
      const next = await appendClosingPeriodVersion(client, actor, command.requestId, operationId, period, target, action, reason);
      const result = { requestId: command.requestId, status: 'applied', periodId, periodVersion: next.version, periodStatus: target, operationId };
      await client.query('INSERT INTO server_closing_commands(actor_id,request_id,action,payload_hash,command,result,required_permissions) VALUES($1,$2,$3,$4,$5,$6,$7)', [actor.internalUserId, command.requestId, action, planHash(command), command, result, [...CLOSING_READ_PERMISSIONS, target === 'locked' ? 'closing.lock' : 'closing.confirm', 'commercial.sale.view', 'commercial.labor.view']]);
      period = next;
    };
    if (status === 'locked' && period.status === 'open') await restore('confirmed');
    await restore(status);
    await client.query('COMMIT'); return period;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}

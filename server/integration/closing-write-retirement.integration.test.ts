import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { closingFixture, closingCode } from './closing-fixture.js';
import { restoreHistoricalFixtureAllocation, restoreHistoricalFixturePeriodStatus } from './closing-historical-test-fixture.js';
import { executeClosingCommand, previewClosingCommand, readClosingCommandReceipt } from '../closing/service.js';
import { readClosingHistory, readClosingPeriodDetail } from '../closing/read-service.js';
import { CLOSING_READ_PERMISSIONS } from '../closing/contract.js';
import { prepareFixtureMonthPortion } from './closing-month-test-setup.js';

test('D169 live quantity writer retires manual create/update while original history and recovery survive', { timeout: 90000 }, async t => {
  const f = await closingFixture(t), order = await f.order(), blue = order.basis.priceLines.find(row => row.colorName === 'Blue')!;
  const period = (await f.apply({ action: 'create_period', month: '2026-10', taxRatePercent: '13', taxRateConfirmed: true, remark: 'Explicit historical fixture month' })).result.periodId;
  const data = { quantity: '3.125', colorId: blue.colorId, assignmentId: null, executor: null, channels: { sales: true, work: true }, remark: 'Private original note' };
  const legacy = await restoreHistoricalFixtureAllocation(f, period, order.id, data);
  const state = () => readClosingPeriodDetail(f.pool, f.editor.actor, period, new URLSearchParams('includeVoided=true'));
  const original = await state(), counts = async () => (await f.pool.query('SELECT (SELECT count(*) FROM server_closing_allocations)::int allocations,(SELECT count(*) FROM server_closing_allocation_versions)::int versions,(SELECT count(*) FROM server_closing_period_versions)::int periods')).rows[0];
  await t.test('unlinked/linked-independent manual requests reject at preview and durable submit with no business mutation', async () => {
    const intents = [{ ...legacy.command.intent, expectedPeriodVersion: original.period.version }, { action: 'update_allocation', periodId: period, expectedPeriodVersion: original.period.version, allocationId: legacy.result.allocationId, expectedVersion: 1, reason: 'No bypass', data: { ...data, quantity: '4' } }];
    for (const intent of intents) {
      const before = await counts(); await assert.rejects(previewClosingCommand(f.pool, f.editor.actor, intent), closingCode('closing_manual_quantity_retired'));
      const command = { requestId: randomUUID(), intent, previewHash: '0'.repeat(64) }, [a, b] = await Promise.all([executeClosingCommand(f.pool, f.editor.actor, command), executeClosingCommand(f.pool, f.editor.actor, command)]);
      assert.equal(a.status, 'rejected'); if (a.status !== 'rejected') assert.fail(); assert.equal(a.error.code, 'closing_manual_quantity_retired'); assert.deepEqual(a, { ...b, replayed: a.replayed });
      const receipt = await readClosingCommandReceipt(f.pool, f.editor.actor, command.requestId); assert.equal(receipt.state, 'recorded'); assert.deepEqual(await counts(), before);
      const wire = await f.request('/preview', intent); assert.equal(wire.response.status, 409); assert.equal(wire.body.error.code, 'closing_manual_quantity_retired');
    }
  });
  await t.test('pre-existing successful original receipt replays exactly; mutation or missing permission cannot reuse it', async () => {
    const before = await counts(), result = await executeClosingCommand(f.pool, f.editor.actor, legacy.command);
    assert.deepEqual(result, { ...legacy.result, replayed: true }); assert.deepEqual(await counts(), before);
    await assert.rejects(executeClosingCommand(f.pool, f.editor.actor, { ...legacy.command, previewHash: 'b'.repeat(64) }), closingCode('closing_request_conflict'));
    const reader = await f.user('historical.closing.reader', CLOSING_READ_PERMISSIONS);
    assert.equal((await readClosingCommandReceipt(f.pool, reader.actor, legacy.command.requestId)).state, 'unknown');
    await f.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='commercial.labor.view'", [f.editor.role]);
    try { await assert.rejects(executeClosingCommand(f.pool, f.editor.actor, legacy.command), closingCode('permission_denied')); }
    finally { await f.pool.query("INSERT INTO app_role_permissions VALUES($1,'commercial.labor.view')", [f.editor.role]); }
  });
  await t.test('old locked manifest remains byte-for-byte readable after reasoned reopening and legacy void', async () => {
    await assert.rejects(previewClosingCommand(f.pool, f.editor.actor, { action: 'confirm_period', periodId: period, expectedPeriodVersion: (await state()).period.version, reason: '' }), closingCode('closing_month_legacy_allocations_require_review'));
    const confirmed = await restoreHistoricalFixturePeriodStatus(f, period, 'confirmed');
    await assert.rejects(previewClosingCommand(f.pool, f.editor.actor, { action: 'lock_period', periodId: period, expectedPeriodVersion: confirmed.version, reason: '' }), closingCode('closing_month_legacy_allocations_require_review'));
    const locked = await restoreHistoricalFixturePeriodStatus(f, period, 'locked'), frozen = await state();
    await f.apply({ action: 'reopen_period', periodId: period, expectedPeriodVersion: locked.version, reason: 'Explicit original recovery' });
    let current = await state(); await f.apply({ action: 'review_allocation', periodId: period, expectedPeriodVersion: current.period.version, allocationId: legacy.result.allocationId, expectedVersion: 1, reason: 'Review preserves original quantity and price' });
    current = await state(); await f.apply({ action: 'void_allocation', periodId: period, expectedPeriodVersion: current.period.version, allocationId: legacy.result.allocationId, expectedVersion: 2, reason: 'Historical duplicate recovery without deletion' });
    const preserved = await readClosingPeriodDetail(f.pool, f.editor.actor, period, new URLSearchParams({ version: String(locked.version) }));
    assert.deepEqual(preserved.items.map(row => row.snapshot), frozen.items.map(row => row.snapshot)); assert.equal((await state()).items[0].status, 'voided');
    const history = await readClosingHistory(f.pool, f.editor.actor, 'allocation', legacy.result.allocationId); assert.equal(history.items.length, 3);
    const first = history.items.find(row => row.version === 1); assert.ok(first && 'snapshot' in first); assert.equal(first.snapshot.quantity, '3.125');
  });
  await t.test('new formal month adoption remains the only creator and cannot accept caller quantities', async () => {
    const fresh = await f.usdOrder(), p = (await f.apply({ action: 'create_period', month: '2027-02', taxRatePercent: '13', taxRateConfirmed: true, remark: '' })).result.periodId;
    const intent = { action: 'sync_month_outputs', periodId: p, expectedPeriodVersion: 1, channels: { sales: true, work: false }, reason: 'Explicit current plan adoption' };
    const saved = await f.apply(intent); assert.equal(saved.result.status, 'applied');
    const detail = await readClosingPeriodDetail(f.pool, f.editor.actor, p); assert.ok(detail.items.some(row => row.snapshot.order.id === fresh.id));
    await assert.rejects(previewClosingCommand(f.pool, f.editor.actor, { ...intent, quantity: '999' }), closingCode('invalid_closing_command')); assert.deepEqual(f.errors, []);
  });
});

test('mixed linked and historical active rows cannot confirm or lock; voiding history restores the current path', { timeout: 90000 }, async t => {
  const f = await closingFixture(t), order = await f.order(), periodId = (await f.apply({ action: 'create_period', month: '2026-10', taxRatePercent: '0', taxRateConfirmed: true, remark: '' })).result.periodId;
  const blue = order.basis.priceLines.find(row => row.colorName === 'Blue')!, data = { quantity: '1', colorId: blue.colorId, channels: { sales: true, work: false }, assignmentId: null, executor: null, remark: '' };
  await f.apply(await prepareFixtureMonthPortion(f, periodId, order.id, data));
  const other = await f.order(), otherBlue = other.basis.priceLines.find(row => row.colorName === 'Blue')!;
  const legacy = await restoreHistoricalFixtureAllocation(f, periodId, other.id, { ...data, colorId: otherBlue.colorId });
  const state = () => readClosingPeriodDetail(f.pool, f.editor.actor, periodId);
  async function rejected(action: 'confirm_period' | 'lock_period', expectedPeriodVersion: number) {
    const intent = { action, periodId, expectedPeriodVersion, reason: '' };
    await assert.rejects(previewClosingCommand(f.pool, f.editor.actor, intent), closingCode('closing_month_legacy_allocations_require_review'));
    const command = { requestId: randomUUID(), intent, previewHash: '0'.repeat(64) }, result = await executeClosingCommand(f.pool, f.editor.actor, command);
    assert.equal(result.status, 'rejected'); if (result.status !== 'rejected') assert.fail(); assert.equal(result.error.code, 'closing_month_legacy_allocations_require_review');
    assert.equal((await readClosingCommandReceipt(f.pool, f.editor.actor, command.requestId)).state, 'recorded');
  }
  await rejected('confirm_period', (await state()).period.version);
  const confirmed = await restoreHistoricalFixturePeriodStatus(f, periodId, 'confirmed');
  await rejected('lock_period', confirmed.version);
  await f.apply({ action: 'unconfirm_period', periodId, expectedPeriodVersion: confirmed.version, reason: 'Explicit historical reconciliation' });
  await f.apply({ action: 'void_allocation', periodId, expectedPeriodVersion: (await state()).period.version, allocationId: legacy.result.allocationId, expectedVersion: 1, reason: 'Void duplicate historical quantity, not merge it' });
  await f.apply({ action: 'confirm_period', periodId, expectedPeriodVersion: (await state()).period.version, reason: '' });
  await f.apply({ action: 'lock_period', periodId, expectedPeriodVersion: (await state()).period.version, reason: '' });
  assert.equal((await state()).summary.registeredQuantity, '1'); assert.deepEqual(f.errors, []);
});

test('missing month-financial schema fails closed for new confirm/lock without blocking historical reads', { timeout: 90000 }, async t => {
  const f = await closingFixture(t, 48), periodId = (await f.apply({ action: 'create_period', month: '2026-10', taxRatePercent: '0', taxRateConfirmed: true, remark: '' })).result.periodId;
  await assert.rejects(previewClosingCommand(f.pool, f.editor.actor, { action: 'confirm_period', periodId, expectedPeriodVersion: 1, reason: '' }), closingCode('closing_month_financial_schema_unavailable'));
  const confirmed = await restoreHistoricalFixturePeriodStatus(f, periodId, 'confirmed');
  assert.equal((await readClosingPeriodDetail(f.pool, f.editor.actor, periodId)).period.status, 'confirmed');
  await assert.rejects(previewClosingCommand(f.pool, f.editor.actor, { action: 'lock_period', periodId, expectedPeriodVersion: confirmed.version, reason: '' }), closingCode('closing_month_financial_schema_unavailable'));
  assert.deepEqual(f.errors, []);
});

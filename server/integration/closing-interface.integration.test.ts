import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { closingFixture } from './closing-fixture.js';
import { prepareFixtureMonthPortion } from './closing-month-test-setup.js';
import { restoreHistoricalFixtureAllocation } from './closing-historical-test-fixture.js';
import { CLOSING_READ_PERMISSIONS, type ClosingCommand, type ClosingIntent } from '../closing/contract.js';
import { createClosingClient, closingCommandHash, type ClosingVisibility } from '../../features/closing-center/server/closing-client.js';
import { acknowledgeClosingPending, readClosingPending, saveClosingPending } from '../../features/closing-center/server/closing-pending.js';

test('closing browser contract reads exact Server snapshots and recovers original commands across real HTTP', { timeout: 180000 }, async t => {
  const x = await closingFixture(t), contract = await x.order(), processing = await x.processing('USD'), values = new Map([['zhixu.erp.local.closing-center', 'KEEP']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const scope = { userId: x.editor.actor.userId }, reads = new URLSearchParams();
  let posts = 0, loseAcknowledgement = false;
  function client(who = x.editor, visible: ClosingVisibility = { sale: true, work: true }) {
    return createClosingClient({ baseUrl: x.base, visibility: () => visible, fetchImpl: (async (url, init) => {
      const headers = new Headers(init?.headers); headers.set('Cookie', who.cookie); if (init?.body) headers.set('Origin', x.base);
      const command = String(url).endsWith('/commands');
      if (command) { posts++; if (who === x.editor) assert.deepEqual(readClosingPending(storage, scope), JSON.parse(String(init?.body))); }
      const response = await fetch(url, { ...init, headers });
      if (command && loseAcknowledgement) { assert.equal(response.status, 200); await response.text(); loseAcknowledgement = false; throw new Error('Synthetic lost COMMIT acknowledgement'); }
      return response;
    }) as typeof fetch });
  }
  const editor = client();
  async function prepare(intent: ClosingIntent): Promise<ClosingCommand> {
    const preview = await editor.preview(intent, () => true); return { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash };
  }
  async function apply(intent: ClosingIntent) {
    const command = await prepare(intent); saveClosingPending(storage, scope, command);
    const result = await editor.submit(command, () => true); assert.equal(result.status, 'applied'); if (result.status !== 'applied') assert.fail();
    const receipt = await editor.receipt(command, () => true); assert.equal(receipt.state, 'recorded'); if (receipt.state !== 'recorded') assert.fail();
    assert.equal(receipt.commandHash, await closingCommandHash(command)); acknowledgeClosingPending(storage, scope, command); return { result, command };
  }
  let periodId = '', allocationId = '', firstCommand: ClosingCommand;
  await t.test('basis keeps actual currencies, stable colors and manual-only meaning without any command side effect', async () => {
    const before = (await x.pool.query('SELECT count(*)::int n FROM server_closing_commands')).rows[0].n;
    const basis = await editor.basis(contract.id, () => true), p = await editor.basis(processing.id, () => true);
    assert.equal(basis.order.id, contract.id); assert.equal(basis.executionFactsMeaning, 'cumulative_actual_not_monthly_events');
    assert.ok(basis.priceLines.some(row => row.workPrice.visibility === 'allowed' && row.workPrice.eligibility.state === 'blocked' && row.workPrice.eligibility.reason === 'usd_labor_version_required'));
    assert.equal(Object.hasOwn(p.priceLines[0], 'garmentSale'), false); assert.equal(p.priceLines[0].colorId, null);
    assert.equal((await x.pool.query('SELECT count(*)::int n FROM server_closing_commands')).rows[0].n, before);
  });
  await t.test('explicit month/tax and adopted plan portions keep separate CNY sales and USD work/service buckets', async () => {
    const created = await apply({ action: 'create_period', month: '2026-10', taxRatePercent: '13', taxRateConfirmed: true, remark: 'PRIVATE PERIOD NOTE' });
    firstCommand = created.command; periodId = created.result.periodId;
    let detail = await editor.period(periodId, reads, () => true); assert.equal(detail.period.taxRatePercent, '13'); assert.equal(detail.total, 0);
    await apply(await prepareFixtureMonthPortion(x, periodId, contract.id,
      { quantity: '10', colorId: contract.basis.priceLines.find(row => row.colorName === 'Blue')!.colorId, channels: { sales: true, work: true }, assignmentId: null, executor: null, remark: 'PRIVATE ALLOCATION NOTE' }));
    detail = await editor.period(periodId, reads, () => true); allocationId = detail.items.find(row => row.snapshot.order.id === contract.id && row.snapshot.channels.sales)!.id;
    await apply(await prepareFixtureMonthPortion(x, periodId, processing.id,
      { quantity: '3', colorId: null, channels: { sales: false, work: true }, assignmentId: null, executor: null, remark: '' }));
    detail = await editor.period(periodId, reads, () => true); assert.equal(detail.total, 3); assert.equal(detail.summary.registeredQuantity, '13');
    assert.equal(detail.summary.garmentSalesCny.visibility, 'allowed'); assert.ok(detail.summary.garmentSalesCny.amount); assert.equal(detail.summary.garmentSalesCny.amount.decimal, '1000');
    assert.equal(detail.summary.processingServiceUsd.visibility, 'allowed'); assert.ok(detail.summary.processingServiceUsd.amount); assert.equal(detail.summary.processingServiceUsd.amount.decimal, '0');
    assert.equal(detail.automaticMonthAllocation, false);
    const first = await editor.periods(new URLSearchParams('limit=1&year=2026&status=open'), () => true); assert.equal(first.items[0].id, periodId); assert.equal(first.total, 1);
  });
  await t.test('manual updates are retired; explicit review and historical void preserve adopted facts', async () => {
    let detail = await editor.period(periodId, reads, () => true), original = detail.items.find(row => row.id === allocationId)!;
    const data = { quantity: '11', colorId: original.snapshot.colorId, channels: original.snapshot.channels, assignmentId: null, executor: { type: 'internal' as const, id: x.group.id }, remark: 'PRIVATE UPDATED NOTE' };
    const beforePosts = posts;
    await assert.rejects(editor.preview({ action: 'update_allocation', periodId, expectedPeriodVersion: detail.period.version, allocationId, expectedVersion: original.version, reason: 'Retired manual correction', data }, () => true)); assert.equal(posts, beforePosts);
    detail = await editor.period(periodId, reads, () => true); original = detail.items.find(row => row.id === allocationId)!;
    await apply({ action: 'review_allocation', periodId, expectedPeriodVersion: detail.period.version, allocationId, expectedVersion: original.version, reason: 'Explicit basis review' });
    detail = await editor.period(periodId, reads, () => true); assert.equal(detail.items.find(row => row.id === allocationId)!.snapshot.quantity, '10');
    const extra = await restoreHistoricalFixtureAllocation(x, periodId, contract.id,
      { ...data, quantity: '1', channels: { sales: false, work: true }, remark: '' });
    detail = await editor.period(periodId, reads, () => true);
    await apply({ action: 'void_allocation', periodId, expectedPeriodVersion: detail.period.version, allocationId: extra.result.allocationId!, expectedVersion: 1, reason: 'Explicit void, keep history' });
    detail = await editor.period(periodId, new URLSearchParams('includeVoided=true'), () => true); assert.equal(detail.total, 4); assert.equal(detail.summary.voidedCount, 1);
    assert.equal(detail.items.find(row => row.id === extra.result.allocationId)!.executionReview.status, 'not_evaluated_voided');
  });
  await t.test('confirmed and locked reads preserve version anchors, exact history envelopes and frozen amounts', async () => {
    let detail = await editor.period(periodId, reads, () => true);
    await apply({ action: 'confirm_period', periodId, expectedPeriodVersion: detail.period.version, reason: '' }); detail = await editor.period(periodId, reads, () => true);
    await apply({ action: 'unconfirm_period', periodId, expectedPeriodVersion: detail.period.version, reason: 'Explicit cancellation of confirmation' }); detail = await editor.period(periodId, reads, () => true);
    await apply({ action: 'confirm_period', periodId, expectedPeriodVersion: detail.period.version, reason: '' }); detail = await editor.period(periodId, reads, () => true);
    await apply({ action: 'lock_period', periodId, expectedPeriodVersion: detail.period.version, reason: '' }); detail = await editor.period(periodId, reads, () => true); assert.equal(detail.period.status, 'locked');
    const history = await editor.history('period', periodId, new URLSearchParams('limit=2'), () => true); assert.equal(history.entityId, periodId); assert.equal(history.entityType, 'period'); assert.equal(history.items.length, 2); assert.equal(history.hasMore, true);
    const rest = await editor.history('period', periodId, new URLSearchParams({ limit: '2', offset: '2', version: String(history.asOfVersion) }), () => true); assert.equal(rest.asOfVersion, history.asOfVersion);
    assert.ok(new Set([...history.items, ...rest.items].map(row => row.version)).size === 4);
    const allocationHistory = await editor.history('allocation', allocationId, reads, () => true); assert.equal(allocationHistory.entityId, allocationId);
    assert.ok(detail.items.every(row => new Date(row.recordedAt).toISOString() === row.recordedAt));
    const count = posts; await assert.rejects(() => editor.preview({ action: 'void_allocation', periodId, expectedPeriodVersion: detail.period.version, allocationId, expectedVersion: 1, reason: 'Cannot edit locked' }, () => true)); assert.equal(posts, count);
  });
  await t.test('explicit reopening keeps the original locked manifest and snapshot readable by exact version', async () => {
    const locked = await editor.period(periodId, reads, () => true); await apply({ action: 'reopen_period', periodId, expectedPeriodVersion: locked.period.version, reason: 'Explicit synthetic reopening' });
    const old = await editor.period(periodId, new URLSearchParams({ version: String(locked.period.version) }), () => true);
    assert.equal(old.period.status, 'locked'); assert.deepEqual(old.items.map(row => row.snapshot), locked.items.map(row => row.snapshot)); assert.equal((await editor.period(periodId, reads, () => true)).period.status, 'open');
  });
  await t.test('fresh independent sale/work permission projection also covers history and old actor receipt isolation', async () => {
    const user = await x.user('closing.interface.reader', [...CLOSING_READ_PERMISSIONS, 'commercial.sale.view']), reader = client(user, { sale: true, work: false });
    const detail = await reader.period(periodId, reads, () => true); assert.deepEqual(detail.summary.distributionLaborUsd, { visibility: 'restricted' });
    assert.equal(JSON.stringify(detail).includes('PRIVATE'), false); assert.equal(JSON.stringify(await reader.history('allocation', allocationId, reads, () => true)).includes('PRIVATE'), false);
    assert.equal((await reader.receipt(firstCommand, () => true)).state, 'unknown');
    await x.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='commercial.sale.view'", [user.role]);
    assert.deepEqual((await reader.period(periodId, reads, () => true)).summary.garmentSalesCny, { visibility: 'restricted' });
    const history = await reader.history('period', periodId, reads, () => true); assert.ok(!JSON.stringify(history).includes('PRIVATE'));
  });
  await t.test('a real committed command with lost acknowledgement is restored by original hash with no automatic retry', async () => {
    const command = await prepare({ action: 'create_period', month: '2027-01', taxRatePercent: '0', taxRateConfirmed: true, remark: '' });
    saveClosingPending(storage, scope, command); loseAcknowledgement = true; const before = posts;
    await assert.rejects(() => editor.submit(command, () => true)); assert.equal(posts, before + 1); assert.deepEqual(readClosingPending(storage, scope), command);
    const receipt = await editor.receipt(command, () => true); assert.equal(receipt.state, 'recorded'); if (receipt.state !== 'recorded') assert.fail(); assert.equal(receipt.commandHash, await closingCommandHash(command));
    acknowledgeClosingPending(storage, scope, command); assert.equal(readClosingPending(storage, scope), null); assert.equal(posts, before + 1);
    const periods = await editor.periods(reads, () => true); assert.equal(periods.total, 2); assert.equal(periods.items[0].month, '2027-01');
    assert.equal(values.get('zhixu.erp.local.closing-center'), 'KEEP');
  });
  assert.deepEqual(x.errors, []);
});

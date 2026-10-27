import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closingFixture } from './closing-fixture.js';
import { CLOSING_READ_PERMISSIONS } from '../closing/contract.js';
import { createClosingClient } from '../../features/closing-center/server/closing-client.js';
import { createClosingMonthController, readClosingMonthPending } from '../../features/closing-center/server/closing-month-controller.js';
import { closingMonthCommandHash } from '../../features/closing-center/server/closing-month-projection.js';
import type { ClosingMonthCommand, ClosingMonthIntent } from '../closing/month-plan-model.js';

test('owned PostgreSQL/HTTP: existing month commands, strict annual client and original-request recovery', { timeout: 180000 }, async t => {
  const f = await closingFixture(t), order = await f.order(), processing = await f.processing('USD'), storage = new Map<string, string>();
  const pending = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
  let posts = 0, lose = false;
  const makeClient = (who = f.editor, view = { sale: true, work: true }) => createClosingClient({ baseUrl: f.base, visibility: () => view, fetchImpl: (async (url, init) => {
    const headers = new Headers(init?.headers); headers.set('Cookie', who.cookie); if (init?.body) headers.set('Origin', f.base);
    const command = String(url).endsWith('/month-plans/commands'); if (command) posts++;
    const response = await fetch(url, { ...init, headers });
    if (command && lose) { assert.equal(response.status, 200); await response.text(); lose = false; throw Error('Synthetic committed but reply lost'); }
    return response;
  }) as typeof fetch });
  const client = makeClient();
  const move = async (orderId: string, targetMonth: string, selection: Extract<ClosingMonthIntent, { action: 'move_months' }>['selection'] = { mode: 'whole' }) => {
    const state = await client.monthPlan(orderId, () => true); return { action: 'move_months' as const, orderId, expectedVersion: state.plan!.version, targetMonth, selection, reason: 'Explicit synthetic month adjustment' };
  };
  let command: ClosingMonthCommand;
  await t.test('read is unpriced; partial adjustment commits once and recovers a lost HTTP acknowledgement', async () => {
    const state = await client.monthPlan(order.id, () => true); assert.equal(state.plan!.defaultMonth, '2027-02'); assert.equal(state.plan!.lines.length, 2);
    assert.equal(JSON.stringify(state).includes('salePrice'), false); assert.equal(state.sourceChanged, false);
    const owner = {}, requestId = randomUUID(), current = createClosingMonthController({ userId: f.editor.actor.userId, orderId: order.id, owner, currentOwner: () => owner,
      permissions: () => f.editor.actor.permissions, storage: () => pending, client, requestId: () => requestId });
    await current.preview(await move(order.id, '2027-03', { mode: 'partial', items: [{ lineId: state.plan!.lines[0].id, quantity: '10' }] }));
    assert.equal(current.snapshot().stage, 'preview'); command = { requestId, intent: current.snapshot().preview!.intent, previewHash: current.snapshot().preview!.previewHash };
    lose = true; await current.apply(); assert.equal(current.snapshot().stage, 'saved'); assert.equal(posts, 1); assert.equal(readClosingMonthPending(pending, { userId: f.editor.actor.userId }), null);
    const updated = await client.monthPlan(order.id, () => true); assert.equal(updated.plan!.version, 2); assert.equal(updated.plan!.lines.find(row => row.month === '2027-03')!.quantity, '10');
    const receipt = await client.monthReceipt(command, () => true); assert.equal(receipt.state, 'recorded'); if (receipt.state !== 'recorded') assert.fail(); assert.equal(receipt.commandHash, await closingMonthCommandHash(command));
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_month_commands')).rows[0].n, 1);
  });
  await t.test('two users race the same physical version; stale and frozen commands have durable rejections', async () => {
    const other = await f.user('closing.month.http.other', f.editor.actor.permissions), second = makeClient(other), intent = await move(order.id, '2027-04');
    const preview = await client.monthPreview(intent, () => true), commands = [randomUUID(), randomUUID()].map(requestId => ({ requestId, intent: preview.intent, previewHash: preview.previewHash }));
    const results = await Promise.allSettled([client.monthSubmit(commands[0], () => true), second.monthSubmit(commands[1], () => true)]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    const receipts = await Promise.all([client.monthReceipt(commands[0], () => true), second.monthReceipt(commands[1], () => true)]);
    assert.equal(receipts.filter(row => row.state === 'recorded' && row.result.status === 'applied').length, 1);
    assert.equal(receipts.filter(row => row.state === 'recorded' && row.result.status === 'rejected').length, 1);
    const applied = receipts.find(row => row.state === 'recorded' && row.result.status === 'applied')!; assert.equal(applied.state, 'recorded');
    assert.equal((await client.monthReceipt(commands[1], () => true)).state, 'unknown', 'receipts belong to their actor');
    const period = await f.apply({ action: 'create_period', month: '2027-04', taxRatePercent: '0', taxRateConfirmed: true, remark: '' });
    const adopted = await f.apply({ action: 'sync_month_outputs', periodId: period.result.periodId, expectedPeriodVersion: 1, channels: { sales: true, work: false }, reason: 'Explicit adoption' });
    await f.apply({ action: 'confirm_period', periodId: period.result.periodId, expectedPeriodVersion: adopted.result.periodVersion, reason: '' });
    const frozenMove = await move(order.id, '2027-05');
    await assert.rejects(() => client.monthPreview(frozenMove, () => true), { code: 'closing_month_period_not_open' });
  });
  await t.test('annual strict client keeps current vs frozen scope, true zero and independent permissions', async () => {
    const p = await client.monthPreview(await move(processing.id, '2027-05'), () => true);
    await client.monthSubmit({ requestId: randomUUID(), intent: p.intent, previewHash: p.previewHash }, () => true);
    const annual = await client.year(new URLSearchParams('year=2027&limit=1'), () => true); assert.equal(annual.months.length, 12); assert.equal(annual.items.length, 1); assert(annual.total > 1);
    assert.equal(annual.months[3].basis, 'frozen_financial_snapshot'); const withoutPage = await client.year(new URLSearchParams('year=2027&offset=1'), () => true); assert.deepEqual(withoutPage.totals, annual.totals);
    const user = await f.user('closing.month.http.reader', [...CLOSING_READ_PERMISSIONS, 'commercial.sale.view']), reader = makeClient(user, { sale: true, work: false });
    const limited = await reader.year(new URLSearchParams('year=2027'), () => true); assert.deepEqual(limited.totals.processingUsd, { visibility: 'restricted' });
    assert(limited.items.every(row => row.processing.visibility === 'restricted')); assert.equal((await reader.monthReceipt(command, () => true)).state, 'unknown');
    const forbiddenMove = await move(processing.id, '2027-06');
    await assert.rejects(() => reader.monthPreview(forbiddenMove, () => true), { status: 403 });
    await f.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.view'", [user.role]);
    await assert.rejects(() => reader.monthPlan(order.id, () => true), { status: 403 });
  });
  await t.test('executor matching uses the same HTTP/original protocol, warns without capping independent month quantities', async () => {
    const assignmentId = await f.assignment(processing.id, null), state = await client.monthPlan(processing.id, () => true), line = state.plan!.lines[0];
    const p = await client.monthPreview({ action: 'match_executors', orderId: processing.id, expectedVersion: state.plan!.version,
      reason: 'Explicit actual internal attribution', items: [{ lineId: line.id, parts: [{ assignmentId, quantity: line.quantity }] }] }, () => true);
    assert('matchedQuantity' in p); assert.equal(p.matchedQuantity, line.quantity);
    await client.monthSubmit({ requestId: randomUUID(), intent: p.intent, previewHash: p.previewHash }, () => true);
    const after = await client.monthPlan(processing.id, () => true); assert.equal(after.plan!.executorBasis[0].assignmentId, assignmentId);
    const internal = await client.year(new URLSearchParams('year=2027&scope=internal'), () => true);
    assert(internal.items.every(row => row.executor?.type === 'internal')); assert(internal.items.some(row => row.order.id === processing.id));
    const amount = internal.months[4].processingUsd; if (amount.visibility !== 'allowed') assert.fail(); assert.equal(amount.amount!.decimal, '0');
  });
  await t.test('strict annual client reads a locked financial snapshot with unadopted work still unknown', async () => {
    const period = (await client.periods(new URLSearchParams('year=2027'), () => true)).items.find(row => row.month === '2027-04')!;
    await f.apply({ action: 'lock_period', periodId: period.id, expectedPeriodVersion: period.version, reason: '' });
    const year = await client.year(new URLSearchParams('year=2027'), () => true), april = year.months[3];
    assert.equal(april.period!.status, 'locked'); if (april.processingUsd.visibility !== 'allowed') assert.fail(); assert.equal(april.processingUsd.amount, null);
    assert(year.items.filter(row => row.month === '2027-04').every(row => row.executionReview!.lockedSnapshotPreserved && !row.executionReview!.laterCorrection));
  });
  await t.test('HTTP boundaries reject anonymous, wrong origins, unexpected queries, oversized bodies and wrong methods', async () => {
    assert.equal((await f.request('/orders/' + order.id + '/month-plan', undefined, null)).response.status, 401);
    assert.equal((await f.request('/orders/' + order.id + '/month-plan?price=1')).response.status, 400);
    assert.equal((await f.request('/month-plans/commands/' + randomUUID() + '?extra=1')).response.status, 400);
    assert.equal((await f.request('/month-plans/preview?extra=1', command.intent)).response.status, 400);
    assert.equal((await f.request('/month-plans/preview', command.intent, f.editor.cookie, { Origin: 'http://untrusted.invalid' })).response.status, 403);
    assert.equal((await f.request('/month-plans/commands', { padding: 'x'.repeat(17000) })).response.status, 413);
    assert.equal((await f.request('/year', {})).response.status, 405);
    assert.equal((await f.request('/month-plans/commands/' + randomUUID(), {})).response.status, 405);
    assert.equal(f.errors.length, 0);
  });
});

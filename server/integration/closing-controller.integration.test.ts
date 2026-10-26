import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { closingFixture } from './closing-fixture.js';
import { PERMISSION_KEYS, type PermissionKey } from '../../features/permissions/model/permissions.js';
import { readOrderCommercialState } from '../sales-orders/commercial-version-service.js';
import type { ClosingCommand, ClosingIntent } from '../closing/contract.js';
import { createClosingClient } from '../../features/closing-center/server/closing-client.js';
import { createClosingController } from '../../features/closing-center/server/closing-controller.js';
import { readClosingPending, saveClosingPending } from '../../features/closing-center/server/closing-pending.js';

test('closing controller uses real Server commits, exact original recovery and immutable adopted prices', { timeout: 180000 }, async t => {
  const x = await closingFixture(t), order = await x.order(), processing = await x.processing('USD');
  const beforeTerms = await Promise.all([order.id, processing.id].map(id => readOrderCommercialState(x.pool, id)));
  const values = new Map([['zhixu.erp.local.closing-center', 'KEEP']]), storage = {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); },
  };
  let permissions: PermissionKey[] = [...PERMISSION_KEYS], currentOwner: object = {}, posts = 0, gets = 0, losePost = false, loseReceipt = false;
  const scope = { userId: x.editor.actor.userId }, client = createClosingClient({ baseUrl: x.base,
    visibility: () => ({ sale: permissions.includes('commercial.sale.view'), work: permissions.includes('commercial.labor.view') }),
    fetchImpl: (async (url, init) => {
      const headers = new Headers(init?.headers); headers.set('Cookie', x.editor.cookie); if (init?.body) headers.set('Origin', x.base);
      const isCommand = String(url).endsWith('/commands'), isReceipt = String(url).includes('/commands/');
      if (isCommand) { posts++; assert.deepEqual(readClosingPending(storage, scope), JSON.parse(String(init?.body)), 'durable original must precede actual HTTP POST'); }
      if (isReceipt) gets++;
      const response = await fetch(url, { ...init, headers });
      if (isCommand && losePost || isReceipt && loseReceipt) {
        assert.equal(response.status, 200); await response.text(); if (isCommand) losePost = false; else loseReceipt = false;
        throw new Error('Synthetic loss after the actual Server response');
      }
      return response;
    }) as typeof fetch });
  let controller: ReturnType<typeof createClosingController> | null = null, generatedIds = 0;
  function enter(periodId: string | null) {
    controller?.dispose(); currentOwner = {};
    controller = createClosingController({ userId: scope.userId, periodId, owner: currentOwner, currentOwner: () => currentOwner,
      permissions: () => permissions, storage: () => storage, client, requestId: () => { generatedIds++; return randomUUID(); } });
    return controller;
  }
  t.after(() => controller?.dispose());
  async function apply(intent: ClosingIntent) {
    assert.ok(controller); await controller.preview(intent); assert.equal(controller.snapshot().stage, 'preview', controller.snapshot().error);
    await controller.apply(); const state = controller.snapshot(); assert.equal(state.stage, 'saved', state.error); assert.equal(state.pending, null); assert.equal(readClosingPending(storage, scope), null);
    const result = state.terminal?.result; assert.ok(result?.status === 'applied'); return result;
  }
  const reads = new URLSearchParams(); let periodId = '', allocationId = '', assignmentId = '';
  const blue = order.basis.priceLines.find(row => row.colorName === 'Blue')!, white = order.basis.priceLines.find(row => row.colorName === 'White')!;

  await t.test('construction performs no IO and explicit month/tax creates one Server period', async () => {
    enter(null); assert.equal(posts, 0); assert.equal(gets, 0);
    const result = await apply({ action: 'create_period', month: '2026-10', taxRatePercent: '13', taxRateConfirmed: true, remark: 'Explicit synthetic period' });
    periodId = result.periodId; assert.equal(posts, 1); assert.equal(gets, 1); assert.equal((await client.period(periodId, reads, () => true)).period.taxRatePercent, '13');
  });
  await t.test('manual quantity is independent of cumulative completion and processing has only its USD service output', async () => {
    enter(periodId); assignmentId = await x.assignment(order.id, blue.colorId); await x.completion(order.id, assignmentId, '2');
    let detail = await client.period(periodId, reads, () => true);
    allocationId = (await apply({ action: 'create_allocation', periodId, expectedPeriodVersion: detail.period.version, orderId: order.id,
      data: { quantity: '10', colorId: blue.colorId, channels: { sales: true, work: true }, assignmentId, executor: null, remark: '' } })).allocationId!;
    detail = await client.period(periodId, reads, () => true);
    await apply({ action: 'create_allocation', periodId, expectedPeriodVersion: detail.period.version, orderId: processing.id,
      data: { quantity: '3', colorId: null, channels: { sales: false, work: true }, assignmentId: null, executor: null, remark: '' } });
    detail = await client.period(periodId, reads, () => true); assert.equal(detail.summary.registeredQuantity, '13');
    assert.equal(detail.items.find(row => row.id === allocationId)!.snapshot.quantity, '10'); assert.ok(detail.summary.garmentSalesCny.amount); assert.equal(detail.summary.garmentSalesCny.amount.decimal, '1000');
    assert.ok(detail.summary.processingServiceUsd.amount); assert.equal(detail.summary.processingServiceUsd.amount.decimal, '0'); assert.equal(detail.automaticMonthAllocation, false);
    const p = detail.items.find(row => row.snapshot.order.id === processing.id)!; assert.equal(Object.hasOwn(p.snapshot.outputs, 'garmentSale'), false);
  });
  await t.test('production correction blocks confirmation until explicit review; manual quantity changes only by an explicit update', async () => {
    await x.completion(order.id, assignmentId, '5', '2027-01-07', 'Synthetic actual correction'); let detail = await client.period(periodId, reads, () => true);
    assert.equal(detail.reviewRequiredCount, 1); const count = posts, ids = generatedIds;
    await controller!.preview({ action: 'confirm_period', periodId, expectedPeriodVersion: detail.period.version, reason: '' });
    assert.equal(controller!.snapshot().preview, null); assert.ok(controller!.snapshot().error); await controller!.apply(); assert.equal(posts, count); assert.equal(generatedIds, ids);
    let row = detail.items.find(row => row.id === allocationId)!;
    await apply({ action: 'review_allocation', periodId, expectedPeriodVersion: detail.period.version, allocationId, expectedVersion: row.version, reason: 'Reviewed actual correction' });
    detail = await client.period(periodId, reads, () => true); row = detail.items.find(item => item.id === allocationId)!; assert.equal(row.snapshot.quantity, '10'); assert.equal(detail.reviewRequiredCount, 0);
    await apply({ action: 'update_allocation', periodId, expectedPeriodVersion: detail.period.version, allocationId, expectedVersion: row.version, reason: 'Explicit manual quantity',
      data: { quantity: '11', colorId: blue.colorId, channels: { sales: true, work: true }, assignmentId, executor: null, remark: '' } });
    assert.equal((await client.period(periodId, reads, () => true)).items.find(item => item.id === allocationId)!.snapshot.quantity, '11');
  });
  await t.test('void, confirm, unconfirm, lock and reasoned reopen preserve original locked snapshots', async () => {
    let detail = await client.period(periodId, reads, () => true);
    const extra = await apply({ action: 'create_allocation', periodId, expectedPeriodVersion: detail.period.version, orderId: order.id,
      data: { quantity: '1', colorId: blue.colorId, channels: { sales: false, work: true }, assignmentId: null, executor: null, remark: '' } });
    detail = await client.period(periodId, reads, () => true);
    await apply({ action: 'void_allocation', periodId, expectedPeriodVersion: detail.period.version, allocationId: extra.allocationId!, expectedVersion: 1, reason: 'Explicit void' });
    for (const action of ['confirm_period', 'unconfirm_period', 'confirm_period', 'lock_period'] as const) {
      detail = await client.period(periodId, reads, () => true); await apply({ action, periodId, expectedPeriodVersion: detail.period.version, reason: 'Explicit synthetic transition' });
    }
    const locked = await client.period(periodId, reads, () => true); assert.equal(locked.period.status, 'locked');
    await apply({ action: 'reopen_period', periodId, expectedPeriodVersion: locked.period.version, reason: 'Explicit synthetic reopening' });
    const old = await client.period(periodId, new URLSearchParams({ version: String(locked.period.version) }), () => true); assert.equal(old.period.status, 'locked');
    const frozen = (items: typeof old.items) => items.map(row => ({ id: row.id, versionId: row.versionId, version: row.version, snapshot: row.snapshot }));
    assert.deepEqual(frozen(old.items), frozen(locked.items));
  });
  await t.test('actual CNY work is rejected at preview without new command or currency conversion', async () => {
    const detail = await client.period(periodId, reads, () => true), count = posts, ids = generatedIds;
    await controller!.preview({ action: 'create_allocation', periodId, expectedPeriodVersion: detail.period.version, orderId: order.id,
      data: { quantity: '1', colorId: white.colorId, channels: { sales: false, work: true }, assignmentId: null, executor: null, remark: '' } });
    assert.equal(controller!.snapshot().preview, null); await controller!.apply(); assert.equal(posts, count); assert.equal(generatedIds, ids);
  });
  await t.test('an explicitly checked unknown original retries once with the same ID, body and server receipt', async () => {
    const preview = await client.preview({ action: 'create_period', month: '2027-02', taxRatePercent: '0', taxRateConfirmed: true, remark: '' }, () => true);
    const original: ClosingCommand = { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash }; saveClosingPending(storage, scope, original);
    const c = enter(null), count = posts, ids = generatedIds; assert.equal(c.snapshot().stage, 'pending'); await c.retry(true); assert.equal(posts, count);
    await c.check(); assert.equal(c.snapshot().retryAllowed, true); await c.retry(false); assert.equal(posts, count); await c.retry(true);
    assert.equal(posts, count + 1); assert.equal(generatedIds, ids); assert.equal(c.snapshot().stage, 'saved'); assert.equal(c.snapshot().terminal?.requestId, original.requestId);
  });
  await t.test('real COMMIT with lost POST and GET acknowledgements survives refresh and later write revocation', async () => {
    const c = enter(null); await c.preview({ action: 'create_period', month: '2027-03', taxRatePercent: '0', taxRateConfirmed: true, remark: '' });
    const count = posts; losePost = true; loseReceipt = true; await c.apply(); assert.equal(posts, count + 1); assert.equal(c.snapshot().stage, 'pending');
    const original = readClosingPending(storage, scope); assert.ok(original); assert.equal(c.snapshot().retryAllowed, false);
    await x.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.edit'", [x.editor.role]); permissions = permissions.filter(key => key !== 'closing.edit');
    const restored = enter(periodId), requestCount = posts; assert.equal(restored.snapshot().pending?.requestId, original.requestId); assert.equal(posts, requestCount);
    await restored.retry(true); assert.equal(posts, requestCount); await restored.check(); assert.equal(restored.snapshot().stage, 'saved'); assert.equal(restored.snapshot().terminal?.requestId, original.requestId);
    assert.equal(readClosingPending(storage, scope), null); assert.equal(posts, requestCount); assert.equal((await client.periods(reads, () => true)).total, 3);
  });
  assert.deepEqual(await Promise.all([order.id, processing.id].map(id => readOrderCommercialState(x.pool, id))), beforeTerms);
  assert.equal(values.get('zhixu.erp.local.closing-center'), 'KEEP'); assert.deepEqual(x.errors, []);
});

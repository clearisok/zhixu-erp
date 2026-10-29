import assert from 'node:assert/strict';
import test from 'node:test';
import { closingFixture } from './closing-fixture.js';
import { readOrderCommercialState } from '../sales-orders/commercial-version-service.js';
import { LABOR_ADOPTION_PERMISSIONS } from '../sales-orders/labor-adoption-model.js';
import { createLaborAdoptionClient } from '../../features/quote-center/server/labor-adoption-client.js';
import { createLaborAdoptionController } from '../../features/quote-center/server/labor-adoption-controller.js';
import { readLaborPending } from '../../features/quote-center/server/labor-adoption-pending.js';

test('controller original-command recovery uses real HTTP, fresh permissions and one immutable commercial append', { timeout: 180000 }, async t => {
  const x = await closingFixture(t, false, true), a = await x.order(), b = await x.order(), processing = await x.processing('CNY');
  async function state(orderId: string) { const current = (await readOrderCommercialState(x.pool, orderId)).current; assert.ok(current); return current; }
  async function admin(path: string, body: unknown, method = 'POST') {
    const r = await fetch(x.base + '/api/v1/quotes/' + path, { method, headers: { Cookie: x.editor.cookie, Origin: x.base, 'X-Zhixu-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(r.status, 200, await r.text());
  }
  async function successor(orderId: string, price: string) {
    const source = await state(orderId), record = (await x.repository.getById(source.quoteId))!;
    await admin(source.quoteId + '/version-workflows', { action: 'revision.create', expectedVersion: record.version, sourceRevisionId: source.revisionId, reason: '工价调整', note: 'Controller synthetic USD' });
    let next = (await x.repository.getById(source.quoteId))!;
    const revision = next.quote.revisions.find(row => row.revisionId === next.quote.defaultRevisionId)!;
    for (const pv of revision.priceVersions) pv.pricingParameters.laborCurrency = 'USD';
    await admin(source.quoteId, { quote: next.quote, expectedVersion: next.version }, 'PUT');
    for (const pv of revision.priceVersions) {
      next = (await x.repository.getById(source.quoteId))!;
      await admin(source.quoteId + '/confirmation-workflows', { action: 'confirmation.save', expectedVersion: next.version, revisionId: revision.revisionId,
        priceVersionId: pv.id, confirmedLaborPrice: price, confirmedGarmentPrice: revision.baseInfo.quoteType === 'processing' ? null : '9999', note: 'Controller USD confirmation' });
    }
    return revision.revisionId;
  }
  const oldA = await state(a.id), oldB = await state(b.id), oldProcessing = await state(processing.id);
  const originalRows = (await x.pool.query('SELECT id::text,md5(to_jsonb(v)::text) hash FROM sales_order_commercial_versions v ORDER BY id')).rows;
  const revisionId = await successor(a.id, '4.25'), processingRevision = await successor(processing.id, '0');
  const writer = await x.user('usd.controller.writer', LABOR_ADOPTION_PERMISSIONS), scope = { userId: writer.actor.userId };
  const values = new Map([['zhixu.erp.local.quotes', 'KEEP']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let owner: object = {}, write = true, loseAcknowledgement = true, loseReceipt = true, commandPosts = 0, allRequests = 0;
  const client = createLaborAdoptionClient({ baseUrl: x.base, fetchImpl: (async (url, init) => {
    allRequests++; const headers = new Headers(init?.headers); headers.set('Cookie', writer.cookie); if (init?.body) headers.set('Origin', x.base);
    const isCommand = String(url).endsWith('/commands');
    if (isCommand) {
      commandPosts++; const stored = readLaborPending(storage, scope); assert.ok(stored); assert.deepEqual(stored.command, JSON.parse(String(init?.body)));
    }
    const r = await fetch(url, { ...init, headers });
    if (isCommand && loseAcknowledgement) { assert.equal(r.status, 200); await r.text(); throw new Error('synthetic acknowledgement lost after real COMMIT'); }
    if (!isCommand && String(url).includes('/commands/') && loseReceipt) { assert.equal(r.status, 200); await r.text(); throw new Error('synthetic first receipt lost'); }
    return r;
  }) as typeof fetch });
  const controller = (quoteId: string) => createLaborAdoptionController({ userId: scope.userId, quoteId, owner, currentOwner: () => owner,
    access: () => ({ read: true, write }), storage: () => storage, client });
  let originalRequest = '';
  await t.test('real commit followed by two lost responses retains the exact original and appends only once', async () => {
    const c = controller(oldA.quoteId); await c.preview({ orderId: a.id, expectedVersion: oldA.version, targetRevisionId: revisionId,
      colorIds: oldA.lines!.filter(row => row.laborCurrency === 'CNY').map(row => row.colorId), productUnchangedConfirmed: true, reason: 'Only explicit USD work' });
    assert.equal(c.snapshot().stage, 'preview'); await c.apply();
    assert.equal(c.snapshot().stage, 'pending'); assert.ok(c.snapshot().pending); originalRequest = c.snapshot().pending!.command.requestId;
    assert.equal(commandPosts, 1); assert.equal(c.snapshot().retryAllowed, false); assert.ok(readLaborPending(storage, scope));
    assert.equal((await state(a.id)).version, oldA.version + 1); c.dispose();
  });
  await t.test('refresh does not replay and fresh read-only permission can verify the exact committed request', async () => {
    await x.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='order.commercial.adopt'", [writer.role]);
    write = false; owner = {}; const before = allRequests, c = controller(oldA.quoteId); assert.equal(allRequests, before);
    assert.equal(c.snapshot().pending!.command.requestId, originalRequest); await c.retry(true); assert.equal(allRequests, before);
    loseReceipt = false; await c.check(); assert.equal(c.snapshot().stage, 'saved'); assert.equal(c.snapshot().pending, null);
    assert.equal(commandPosts, 1); assert.equal((await state(a.id)).version, oldA.version + 1);
  });
  await t.test('processing confirms zero USD as a whole-order line without new SO, batch or garment prices', async () => {
    await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'order.commercial.adopt')", [writer.role]);
    write = true; loseAcknowledgement = false; owner = {}; const c = controller(oldProcessing.quoteId);
    await c.preview({ orderId: processing.id, expectedVersion: oldProcessing.version, targetRevisionId: processingRevision, colorIds: [null], productUnchangedConfirmed: true, reason: 'Explicit zero USD' });
    assert.equal(c.snapshot().preview!.after[0].laborPrice, '0'); await c.apply(); assert.equal(c.snapshot().stage, 'saved'); assert.equal(commandPosts, 2);
    const current = await state(processing.id); assert.equal(current.version, oldProcessing.version + 1); assert.equal(current.lines![0].laborCurrency, 'USD'); assert.equal(current.lines![0].laborPrice, '0');
    assert.equal((await x.pool.query('SELECT count(*)::int n FROM processing_order_batches')).rows[0].n, 1);
    assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n, 3);
  });
  await t.test('original versions, other orders and Browser bytes remain intact; two commands have two immutable receipts', async () => {
    assert.deepEqual(await state(b.id), oldB); const rows = (await x.pool.query('SELECT id::text,md5(to_jsonb(v)::text) hash FROM sales_order_commercial_versions v WHERE id=ANY($1::uuid[]) ORDER BY id', [originalRows.map(row => row.id)])).rows;
    assert.deepEqual(rows, originalRows); assert.equal(values.get('zhixu.erp.local.quotes'), 'KEEP');
    assert.equal((await x.pool.query('SELECT count(*)::int n FROM order_labor_adoption_commands')).rows[0].n, 2); assert.equal(readLaborPending(storage, scope), null);
  });
  assert.deepEqual(x.errors, []);
});

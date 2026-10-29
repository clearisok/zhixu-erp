import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { closingFixture } from './closing-fixture.js';
import { readOrderCommercialState } from '../sales-orders/commercial-version-service.js';
import { productHash } from '../sales-orders/product-snapshot.js';
import { LABOR_ADOPTION_PERMISSIONS } from '../sales-orders/labor-adoption-model.js';
import { createLaborAdoptionClient } from '../../features/quote-center/server/labor-adoption-client.js';

test('USD adoption query and browser transport keep the adopted physical order, fresh grants and exact original receipt', { timeout: 180000 }, async t => {
  const x = await closingFixture(t, false, true), { pool, editor } = x;
  const a = await x.order(), b = await x.order(), process = await x.processing('CNY');
  async function http(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', cookie: string | null = editor.cookie) {
    const response = await fetch(x.base + '/api/v1/' + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { Origin: x.base, 'X-Zhixu-Request': '1', 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); return { status: response.status, text, body: JSON.parse(text) as Record<string, unknown> };
  }
  async function state(id: string) { const current = (await readOrderCommercialState(pool, id)).current; assert.ok(current); return current; }
  const current = await state(a.id), processing = await state(process.id), quoteId = current.quoteId;
  async function successor(orderId: string, price: string) {
    const source = await state(orderId), before = (await x.repository.getById(source.quoteId))!;
    let result = await http('quotes/' + source.quoteId + '/version-workflows', { action: 'revision.create', expectedVersion: before.version,
      sourceRevisionId: source.revisionId, reason: '工价调整', note: 'Explicit USD only' }); assert.equal(result.status, 200, result.text);
    let record = (await x.repository.getById(source.quoteId))!, revision = record.quote.revisions.find(row => row.revisionId === record.quote.defaultRevisionId)!;
    for (const pv of revision.priceVersions) pv.pricingParameters.laborCurrency = 'USD';
    result = await http('quotes/' + source.quoteId, { quote: record.quote, expectedVersion: record.version }, 'PUT'); assert.equal(result.status, 200, result.text);
    for (const pv of revision.priceVersions) {
      record = (await x.repository.getById(source.quoteId))!; revision = record.quote.revisions.find(row => row.revisionId === revision.revisionId)!;
      result = await http('quotes/' + source.quoteId + '/confirmation-workflows', { action: 'confirmation.save', expectedVersion: record.version,
        revisionId: revision.revisionId, priceVersionId: pv.id, confirmedLaborPrice: price, confirmedGarmentPrice: revision.baseInfo.quoteType === 'processing' ? null : '7777', note: 'USD explicitly confirmed' });
      assert.equal(result.status, 200, result.text);
    }
    return revision.revisionId;
  }
  const revisionId = await successor(a.id, '4.25'), processRevision = await successor(process.id, '0');
  const reader = await x.user('usd.query.reader', ['quote.view', 'order.view', 'commercial.labor.view']);
  const worker = await x.user('usd.query.writer', LABOR_ADOPTION_PERMISSIONS);
  const orders = (id = quoteId, suffix = '') => 'quotes/order-labor-adoptions/orders?' + new URLSearchParams({ quoteId: id }) + suffix;
  const options = (id = a.id, quote = quoteId, suffix = '') => `quotes/order-labor-adoptions/orders/${id}/options?` + new URLSearchParams({ quoteId: quote }) + suffix;
  const client = createLaborAdoptionClient({ baseUrl: x.base, fetchImpl: (async (url, init) => {
    const headers = new Headers(init?.headers); headers.set('Cookie', worker.cookie); if (init?.body) headers.set('Origin', x.base);
    return fetch(url, { ...init, headers });
  }) as typeof fetch });
  const beforeReads = await state(a.id), beforeOther = await state(b.id);
  let firstRequest = '';

  await t.test('session and actual fresh labor read grants protect both endpoints', async () => {
    assert.equal((await http(orders(), undefined, 'GET', null)).status, 401);
    const denied = await x.user('usd.query.denied', ['quote.view', 'order.view']);
    assert.equal((await http(orders(), undefined, 'GET', denied.cookie)).status, 403);
    assert.equal((await http(options(), undefined, 'GET', denied.cookie)).status, 403);
    assert.equal((await http(orders(), undefined, 'GET', reader.cookie)).status, 200);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='commercial.labor.view'", [reader.role]);
    assert.equal((await http(orders(), undefined, 'GET', reader.cookie)).status, 403);
    assert.equal((await http(options(), undefined, 'GET', reader.cookie)).status, 403);
  });
  await t.test('one exact Quote lists its orders, including processing style, and reveals only work amounts', async () => {
    const result = await client.orders(quoteId, '', 0, () => true); assert.deepEqual(new Set(result.items.map(row => row.id)), new Set([a.id, b.id]));
    assert.ok(result.items.every(row => row.businessType === 'distribution' && row.editable));
    const page = await client.orders(processing.quoteId, 'SYN-CLOSE-PROCESS', 0, () => true); assert.equal(page.items.length, 1);
    assert.equal(page.items[0].id, process.id); assert.equal(page.items[0].businessType, 'processing'); assert.equal(page.items[0].styleNo, 'SYN-CLOSE-PROCESS');
    for (const path of [orders(), options(), orders(processing.quoteId), options(process.id, processing.quoteId)]) {
      const r = await http(path, undefined, 'GET', worker.cookie); assert.equal(r.status, 200, r.text);
      for (const forbidden of ['salePrice', 'baseSalePrice', 'fabrics', 'unitPrice', 'productHash', 'product_snapshot', 'customerConfirmedPrice', '7777']) assert.ok(!r.text.includes(forbidden), forbidden);
    }
  });
  await t.test('strict query scope rejects duplicate, unknown, noncanonical, oversized and wrong-Quote requests', async () => {
    for (const path of [orders() + '&quoteId=' + quoteId, orders() + '&offset=-1', orders() + '&offset=01', orders() + '&offset=100001', orders() + '&extra=1',
      orders() + '&search=' + 'a'.repeat(201), options() + '&revisionOffset=-1', options() + '&revisionOffset=0&revisionOffset=1']) assert.equal((await http(path)).status, 400, path);
    assert.equal((await http(options(a.id, processing.quoteId))).status, 404);
    assert.equal((await client.orders(quoteId, "%_'", 0, () => true)).items.length, 0);
  });
  await t.test('options show exact CNY selection, confirmed USD zero and no fabricated legacy currency evidence', async () => {
    const result = await client.options(quoteId, a.id, 0, () => true); assert.equal(result.version, current.version);
    assert.deepEqual(result.lines.filter(line => line.laborCurrency === 'CNY').map(line => line.colorName), ['White']);
    const revision = result.revisions.find(row => row.revisionId === revisionId)!; assert.ok(revision);
    assert.ok(revision.priceVersions.some(row => row.available && row.laborPrice === '4.25'));
    assert.ok(result.revisions.find(row => row.revisionId === current.revisionId)!.priceVersions.every(row => !row.available));
    const p = await client.options(processing.quoteId, process.id, 0, () => true); assert.equal(p.lines.length, 1); assert.equal(p.lines[0].colorId, null);
    assert.ok(p.revisions.find(row => row.revisionId === processRevision)!.priceVersions.some(row => row.available && row.laborPrice === '0'));
    assert.deepEqual(await state(a.id), beforeReads); assert.deepEqual(await state(b.id), beforeOther);
    assert.equal((await pool.query('SELECT count(*)::int n FROM order_labor_adoption_commands')).rows[0].n, 0);
  });
  await t.test('an existing CCT null suppresses a valid PV amount in picker and authoritative preview', async () => {
    const pvId = current.lines!.find(line => line.laborCurrency === 'CNY')!.priceVersionId;
    const inserted = (await pool.query(`INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,confirmed_labor_price,labor_currency)
      VALUES('quote',$1,$2,$3,NULL,'USD') RETURNING id::text`, [quoteId, revisionId, pvId])).rows[0];
    const result = await client.options(quoteId, a.id, 0, () => true), option = result.revisions.find(row => row.revisionId === revisionId)!.priceVersions.find(row => row.priceVersionId === pvId)!;
    assert.equal(option.available, false); assert.ok(!('laborPrice' in option));
    const white = result.lines.find(line => line.laborCurrency === 'CNY')!.colorId;
    await assert.rejects(() => client.preview(quoteId, { orderId: a.id, expectedVersion: result.version, targetRevisionId: revisionId, colorIds: [white], productUnchangedConfirmed: true, reason: 'No fallback' }, () => true));
    await pool.query('UPDATE confirmed_commercial_terms SET confirmed_labor_price=4.25,version=version+1 WHERE id=$1', [inserted.id]);
  });
  await t.test('real browser client previews, posts once and verifies exact original receipt digest', async () => {
    const data = await client.options(quoteId, a.id, 0, () => true), color = data.lines.find(line => line.laborCurrency === 'CNY')!.colorId;
    const preview = await client.preview(quoteId, { orderId: a.id, expectedVersion: data.version, targetRevisionId: revisionId, colorIds: [color], productUnchangedConfirmed: true, reason: 'Explicit USD only' }, () => true);
    const pending = { quoteId, command: { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash } };
    firstRequest = pending.command.requestId;
    const posted = await client.submit(pending, () => true); assert.equal(posted.status, 'applied');
    const receipt = await client.receipt(pending, () => true); assert.equal(receipt.state, 'recorded');
    if (receipt.state !== 'recorded') assert.fail(); assert.equal(receipt.commandHash, productHash(pending.command)); assert.equal(receipt.orderId, a.id);
    assert.equal((await client.submit(pending, () => true)).status, 'applied'); assert.equal((await state(a.id)).version, current.version + 1);
    const history = await client.history(a.id, 0, () => true); assert.equal(history.orderId, a.id); assert.equal(history.items.length, 1);
    assert.equal(history.items[0].actorUserId, worker.actor.userId); assert.equal(history.items[0].actorName, worker.actor.username);
    assert.equal(history.items[0].before.find(line => line.colorName === 'White')!.laborCurrency, 'CNY');
    assert.equal(history.items[0].after.find(line => line.colorName === 'White')!.laborCurrency, 'USD');
    assert.deepEqual(await state(b.id), beforeOther); assert.equal((await pool.query('SELECT count(*)::int n FROM order_labor_adoption_commands')).rows[0].n, 1);
  });
  await t.test('the same request UUID from two actors remains distinct in history and actor-local receipts', async () => {
    const s = await state(a.id), colorId = s.lines!.find(line => line.laborConfirmationSource)?.colorId;
    assert.ok(colorId);
    const preview = await http('quotes/order-labor-adoptions/preview', { orderId: a.id, expectedVersion: s.version, targetRevisionId: revisionId,
      colorIds: [colorId], productUnchangedConfirmed: true, reason: 'Explicit identical no-op from another actor' }); assert.equal(preview.status, 200, preview.text);
    const posted = await http('quotes/order-labor-adoptions/commands', { requestId: firstRequest, intent: preview.body.intent, previewHash: preview.body.previewHash });
    assert.equal(posted.status, 200, posted.text); assert.equal(posted.body.status, 'unchanged');
    const history = await client.history(a.id, 0, () => true); assert.equal(history.items.length, 2);
    assert.equal(history.items.filter(row => row.requestId === firstRequest).length, 2);
    assert.equal(new Set(history.items.map(row => row.actorUserId)).size, 2);
    assert.equal(history.items.find(row => row.actorUserId === editor.actor.userId)!.actorName, null);
    const renamed = await pool.query("UPDATE app_users SET display_name='New current display name' WHERE id=$1", [worker.actor.internalUserId]); assert.equal(renamed.rowCount, 1);
    assert.equal((await client.history(a.id, 0, () => true)).items.find(row => row.actorUserId === worker.actor.userId)!.actorName, worker.actor.username);
  });
  await t.test('suggested confirmation never authorizes a product change; rejection keeps original receipt readable', async () => {
    const record = (await x.repository.getById(quoteId))!; record.quote.revisions.find(row => row.revisionId === revisionId)!.priceVersions[1].labor.description = 'Changed production condition';
    const changed = await http('quotes/' + quoteId, { quote: record.quote, expectedVersion: record.version }, 'PUT'); assert.equal(changed.status, 200, changed.text);
    const data = await client.options(quoteId, b.id, 0, () => true); assert.ok(data.revisions.find(row => row.revisionId === revisionId)!.priceVersions.some(row => row.available));
    const intent = { orderId: b.id, expectedVersion: data.version, targetRevisionId: revisionId, colorIds: data.lines.filter(line => line.laborCurrency === 'CNY').map(line => line.colorId), productUnchangedConfirmed: true as const, reason: 'Product must be checked' };
    await assert.rejects(() => client.preview(quoteId, intent, () => true), /产品条件发生变化/u);
    const pending = { quoteId, command: { requestId: randomUUID(), intent, previewHash: 'a'.repeat(64) } };
    await assert.rejects(() => client.submit(pending, () => true)); const receipt = await client.receipt(pending, () => true);
    assert.equal(receipt.state, 'recorded'); if (receipt.state !== 'recorded') assert.fail(); assert.equal(receipt.result.status, 'rejected');
    assert.deepEqual(await state(b.id), beforeOther);
  });
  await t.test('linked order pagination is deterministic, bounded and does not omit the final page', async () => {
    for (let i = 0; i < 20; i++) await x.order();
    const first = await client.orders(quoteId, '', 0, () => true), second = await client.orders(quoteId, '', 20, () => true);
    assert.equal(first.items.length, 20); assert.equal(first.hasMore, true); assert.equal(second.items.length, 2); assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 22);
  });
  assert.deepEqual(x.errors, []);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalPlanJson } from '../../../../server/production-scheduling/canonical-json';
import { createLaborAdoptionClient, laborCommand, laborCommandHash, laborIntent, parseLaborOrders, parseLaborOptions, parseLaborPreview, parseLaborReceipt,
  LABOR_RESPONSE_LIMIT, type LaborPending } from '../labor-adoption-client';
import { acknowledgeLaborPending, laborPendingKey, readLaborPending, saveLaborPending } from '../labor-adoption-pending';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pending = (): LaborPending => ({ quoteId: 'quote-usd', command: { requestId: id(1), intent: { orderId: id(2), expectedVersion: 4,
  targetRevisionId: 'r-usd', colorIds: [id(3)], productUnchangedConfirmed: true, reason: 'Explicit USD confirmation' }, previewHash: 'a'.repeat(64) } });
const scope = { userId: id(4) }, other = { userId: id(5) };
class Storage {
  values = new Map([['zhixu.erp.local.quotes', 'KEEP']]); getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); }
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const unknown = () => ({ state: 'unknown', requestId: id(1) });
async function receipt() { return { state: 'recorded', requestId: id(1), orderId: id(2), commandHash: await laborCommandHash(pending().command),
  result: { requestId: id(1), status: 'applied', commercialVersionId: id(6), version: 5, operationId: 'operation-' + id(7) } }; }

test('original intent is browser safe and its digest matches the server canonical digest without prices', async () => {
  const value = pending(); assert.equal(await laborCommandHash(value.command), createHash('sha256').update(canonicalPlanJson(value.command)).digest('hex'));
  assert.deepEqual(laborCommand(value.command), value.command);
  for (const change of [{ expectedVersion: 0 }, { colorIds: [] }, { colorIds: [id(3), id(3)] }, { productUnchangedConfirmed: false }, { reason: '\ud800' }, { laborPrice: '99' }]) {
    assert.throws(() => laborIntent({ ...value.command.intent, ...change }));
  }
  const raw = { ...value.command.intent, colorIds: [id(8), id(3)], reason: ' reason ' };
  assert.deepEqual(laborIntent(raw).colorIds, [id(3), id(8)]); assert.equal(laborIntent(raw).reason, 'reason');
});
test('pending survives mutation, refresh and quote changes; other actor and Browser records stay separate', () => {
  const storage = new Storage(), value = pending(); saveLaborPending(storage, scope, value); value.command.intent.reason = 'mutated';
  assert.deepEqual(readLaborPending(storage, scope), pending()); assert.equal(readLaborPending(storage, other), null);
  for (const input of [{ ...pending(), quoteId: 'other-quote' }, { ...pending(), command: { ...pending().command, requestId: id(8) } }]) assert.throws(() => saveLaborPending(storage, scope, input), /labor_pending_locked/u);
  assert.equal(storage.getItem('zhixu.erp.local.quotes'), 'KEEP'); const raw = storage.getItem(laborPendingKey(scope))!;
  for (const key of ['laborPrice', 'salePrice', 'product_snapshot', 'password', 'token', 'confirmation']) assert.ok(!raw.includes('"' + key + '"'));
});
test('corrupt, future, noncanonical and oversized pending bytes are never overwritten or cleared', () => {
  for (const raw of ['{broken', JSON.stringify({ schemaVersion: 2 }), JSON.stringify({ schemaVersion: 1, userId: scope.userId, savedAt: new Date().toISOString(),
    pending: { ...pending(), command: { ...pending().command, intent: { ...pending().command.intent, reason: ' noncanonical ' } } } }), 'X'.repeat(131073)]) {
    const storage = new Storage(); storage.setItem(laborPendingKey(scope), raw);
    assert.throws(() => readLaborPending(storage, scope)); assert.throws(() => saveLaborPending(storage, scope, pending()));
    assert.throws(() => acknowledgeLaborPending(storage, scope, pending())); assert.equal(storage.getItem(laborPendingKey(scope)), raw);
  }
});
test('failed storage writes or readback block posting; acknowledgement requires the exact slot', () => {
  const storage = new Storage(); storage.setItem = () => {}; assert.throws(() => saveLaborPending(storage, scope, pending()));
  const value = new Storage(); saveLaborPending(value, scope, pending()); saveLaborPending(value, other, pending());
  assert.throws(() => acknowledgeLaborPending(value, scope, { ...pending(), quoteId: 'different' }));
  acknowledgeLaborPending(value, scope, pending()); assert.equal(readLaborPending(value, scope), null); assert.ok(readLaborPending(value, other));
  assert.equal(value.getItem('zhixu.erp.local.quotes'), 'KEEP');
});
test('receipt verifies actor-local original request, physical order, exact digest and expected commercial version', async () => {
  const r = await receipt(); assert.equal((await parseLaborReceipt(r, pending())).state, 'recorded');
  for (const change of [{ requestId: id(8) }, { orderId: id(8) }, { commandHash: 'b'.repeat(64) }, { result: { ...r.result, version: 6 } },
    { result: { ...r.result, status: 'unchanged' } }, { result: { ...r.result, operationId: id(7) } }, { result: { ...r.result, status: ['applied'] } },
    { result: { ...r.result, status: [['unchanged']], version: 4 } }, { result: { requestId: id(1), status: 'rejected', error: { status: '409', code: 'labor_product_changed' } } },
    { salePrice: 'LEAK' }]) await assert.rejects(() => parseLaborReceipt({ ...r, ...change }, pending()));
  assert.deepEqual(await parseLaborReceipt(unknown(), pending()), unknown());
});
test('query projections reject wrong quotes, duplicates and unexpected hidden price or cost fields', () => {
  const page = { quoteId: 'quote-usd', items: [], offset: 0, hasMore: false }; assert.deepEqual(parseLaborOrders(page, page.quoteId), page);
  for (const value of [{ ...page, quoteId: 'other' }, { ...page, salePrice: 'LEAK' }, { ...page, offset: -1 }, { ...page, hasMore: 'false' }]) assert.throws(() => parseLaborOrders(value, page.quoteId));
});
test('protocol enum arrays cannot impersonate currency, business type or confirmation source in picker responses', () => {
  const order = { id: id(2), orderNo: 'SO-USD', lifecycle: 'draft', businessType: 'processing', contractNo: null, styleNo: 'STYLE', historical: false,
    version: 4, work: [{ price: '0', currency: 'CNY' }], editable: true };
  const page = { quoteId: 'quote-usd', items: [order], offset: 0, hasMore: false }; assert.equal(parseLaborOrders(page, page.quoteId).items.length, 1);
  for (const item of [{ ...order, businessType: ['processing'] }, { ...order, work: [{ price: '0', currency: ['USD'] }] }]) assert.throws(() => parseLaborOrders({ ...page, items: [item] }, page.quoteId));
  const pv = { priceVersionId: 'pv-1', name: 'Plain', available: true, laborPrice: '0', confirmation: { quoteId: page.quoteId, revisionId: 'r-usd', priceVersionId: 'pv-1',
    quoteVersion: 8, sourceKind: 'quote_confirmation', sourceCctId: null, sourceCctVersion: null, confirmedAt: '2026-10-27T00:00:00Z' } };
  const options = { quoteId: page.quoteId, quoteCode: 'Q-USD', orderId: id(2), orderNo: 'SO-USD', version: 4, currentVersionId: id(6), businessType: 'processing',
    lines: [{ colorId: null, colorName: null, quantity: null, priceVersionId: 'pv-1', priceVersionName: 'Plain', laborPrice: '2', laborCurrency: 'CNY' }],
    revisions: [{ revisionId: 'r-usd', label: 'R2', priceVersions: [pv] }], revisionOffset: 0, hasMoreRevisions: false };
  assert.equal(parseLaborOptions(options, page.quoteId, id(2)).lines.length, 1);
  for (const changed of [{ ...options, businessType: ['processing'] }, { ...options, revisions: [{ ...options.revisions[0], priceVersions: [{ ...pv, confirmation: { ...pv.confirmation, sourceKind: [['quote_confirmation']] } }] }] }]) {
    assert.throws(() => parseLaborOptions(changed, page.quoteId, id(2)));
  }
});
test('preview rejects substituted scope, changed reason, extra fields or an after line outside the original selection', () => {
  const value = pending(), source = { quoteId: value.quoteId, revisionId: 'r-usd', priceVersionId: 'pv-1', quoteVersion: 9,
    sourceKind: 'quote_confirmation', sourceCctId: null, sourceCctVersion: null, confirmedAt: '2026-10-27T00:00:00Z' };
  const line = { colorId: id(3), colorName: 'Blue', quantity: '5', priceVersionId: 'pv-1', priceVersionName: 'Plain', laborPrice: '8', laborCurrency: 'CNY', confirmation: null };
  const p = { intent: value.command.intent, previewHash: 'a'.repeat(64), currentVersion: 4, currentVersionId: id(6), quoteId: value.quoteId, quoteCode: 'Q-USD', targetRevisionId: 'r-usd', revisionLabel: 'R2',
    before: [line], after: [{ ...line, laborPrice: '0', laborCurrency: 'USD', confirmation: source }], unchanged: false, warnings: [],
    preserved: ['garment_sale', 'product_snapshot', 'creation_source', 'processing_batch', 'closing_history', 'unselected_colors'] };
  assert.equal(parseLaborPreview(p, value.command.intent, value.quoteId).after[0].laborPrice, '0');
  for (const change of [{ quoteId: 'other' }, { intent: { ...value.command.intent, reason: 'other' } }, { salePrice: 'LEAK' },
    { after: [{ ...p.after[0], colorId: id(8) }] }, { after: [{ ...p.after[0], laborCurrency: 'CNY' }] },
    { after: [{ ...p.after[0], confirmation: { ...source, sourceCctId: id(8) } }] }, { before: [{ ...line, laborCurrency: ['CNY'] }] },
    { after: [{ ...p.after[0], confirmation: { ...source, sourceKind: ['quote_confirmation'] } }] }]) assert.throws(() => parseLaborPreview({ ...p, ...change }, value.command.intent, value.quoteId));
});
test('transport is session-only, no-store, bounded, explicit and does not retry a lost response', async () => {
  const calls: { url: string; init?: RequestInit }[] = [], client = createLaborAdoptionClient({ fetchImpl: (async (url, init) => {
    calls.push({ url: String(url), init }); throw new Error('lost acknowledgement'); }) as typeof fetch });
  await assert.rejects(() => client.submit(pending(), () => true), /采用结果尚未确认/u); assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.credentials, 'include'); assert.equal(calls[0].init?.cache, 'no-store');
  assert.equal(calls[0].url, '/api/v1/quotes/order-labor-adoptions/commands'); assert.deepEqual(JSON.parse(String(calls[0].init?.body)), pending().command);
  const restore = createLaborAdoptionClient({ fetchImpl: (async (_url, init) => { assert.equal(init?.method, 'GET'); return response(await receipt()); }) as typeof fetch });
  assert.equal((await restore.receipt(pending(), () => true)).state, 'recorded');
});
test('owner changes before or during a response prevent an old result from being consumed', async () => {
  let live = false, calls = 0; const client = createLaborAdoptionClient({ fetchImpl: (async () => { calls++; live = false; return response(unknown()); }) as typeof fetch });
  await assert.rejects(() => client.receipt(pending(), () => live), /登录身份/u); assert.equal(calls, 0);
  live = true; await assert.rejects(() => client.receipt(pending(), () => live), /登录身份/u); assert.equal(calls, 1);
});
test('malformed, oversized and unauthorized responses cannot clear an unresolved command', async () => {
  for (const result of [new Response('{bad'), new Response(' '.repeat(LABOR_RESPONSE_LIMIT + 1)), response({ error: { code: 'secret_from_server' } }, 403)]) {
    const storage = new Storage(); saveLaborPending(storage, scope, pending());
    const client = createLaborAdoptionClient({ fetchImpl: (async () => result) as typeof fetch });
    await assert.rejects(() => client.receipt(pending(), () => true)); assert.deepEqual(readLaborPending(storage, scope), pending());
  }
});

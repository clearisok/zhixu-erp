import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeliveryPlanClient, DELIVERY_PLAN_RESPONSE_BYTES, DeliveryPlanClientError, explicitDeliveryPlanCommand, parseDeliveryPlanReceipt, parseDeliveryPlanSet, type ExplicitDeliveryPlanCommand } from '../delivery-plan-client';
import type { DeliveryPlanSetDto } from '../../../../server/sales-orders/delivery-plan-model';

const orderId = '00000000-0000-4000-8000-000000000001', otherId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003', planId = '00000000-0000-4000-8000-000000000004';
const command = (): ExplicitDeliveryPlanCommand => ({ requestId, expectedVersion: 7, upserts: [{ id: planId, deliveryDate: '2026-11-10', quantity: '9007199254740993.0001' }], voidIds: [] });
const pending = () => ({ salesOrderId: orderId, command: command() });
const data = (): DeliveryPlanSetDto => ({ salesOrderId: orderId, ownership: 'user_managed', version: 8,
  plans: [{ id: planId, deliveryDate: null, quantity: '0', isDerivedDefault: true, voidedAt: null }],
  sourceDeliveryDate: '2026-11-01', sourceQuantity: '9007199254740993.0001',
  reconciliation: { dateStatus: 'drift', planDates: [], quantityStatus: 'unplanned' } });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const receipt = () => ({ schemaVersion: 1, salesOrderId: orderId, requestId, requestMode: 'explicit', status: 'applied',
  operationId: 'operation-' + requestId, deliveryPlanSet: applied() });
const applied = (): DeliveryPlanSetDto => ({ ...data(), plans: [{ ...data().plans[0], ...command().upserts[0], id: planId }],
  reconciliation: { dateStatus: 'drift', planDates: ['2026-11-10'], quantityStatus: 'matched' } });

test('read projection keeps default null/zero, exact decimal strings and252 retained history rows', () => {
  const value = data();
  value.plans = Array.from({ length: 252 }, (_, index) => ({ ...value.plans[0],
    id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    voidedAt: index ? '2026-10-22T00:00:00+00:00' : null }));
  const parsed = parseDeliveryPlanSet(value, orderId);
  assert.equal(parsed.plans.length, 252); assert.equal(parsed.plans[0].deliveryDate, null); assert.equal(parsed.plans[0].quantity, '0');
  assert.equal(parsed.sourceQuantity, '9007199254740993.0001'); assert.notEqual(parsed, value);
});
test('DTO whitelist refuses prices, wrong ownership types, duplicate rows and foreign orders', () => {
  for (const patch of [{ salesOrderId: otherId }, { price: 'PRIVATE' }, { ownership: ['user_managed'] }, { version: 1.5 }, { sourceQuantity: 10 },
    { plans: [data().plans[0], data().plans[0]] }, { reconciliation: { ...data().reconciliation, dateStatus: ['drift'] } }]) {
    assert.throws(() => parseDeliveryPlanSet({ ...data(), ...patch }, orderId));
  }
  assert.throws(() => parseDeliveryPlanSet({ ...data(), plans: [{ ...data().plans[0], price: 'PRIVATE' }] }, orderId));
});
test('write validator reuses positive/date/100-change rules and copies explicit request before await', async () => {
  for (const patch of [{ requestId: undefined }, { actorId: 'forged' }, { upserts: [{ ...command().upserts[0], quantity: '0' }] },
    { upserts: [{ ...command().upserts[0], deliveryDate: '0000-01-01' }] }, { upserts: [{ ...command().upserts[0], quantity: '1'.repeat(65) }] }]) {
    assert.throws(() => explicitDeliveryPlanCommand({ ...command(), ...patch }));
  }
  const original = pending(); let captured = '';
  const client = createDeliveryPlanClient({ fetchImpl: (async (_url, init) => { captured = String(init?.body); await Promise.resolve(); return response({ deliveryPlanSet: applied() }); }) as typeof fetch });
  const result = client.save(original, () => true); original.command.upserts[0].quantity = '1'; original.command.requestId = otherId;
  await result; assert.equal(JSON.parse(captured).upserts[0].quantity, '9007199254740993.0001'); assert.equal(JSON.parse(captured).requestId, requestId);
});
test('PATCH and receipt use the same original body, no-store, credentials and mutation header', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createDeliveryPlanClient({ fetchImpl: (async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return response(init?.method === 'POST' ? { receipt: receipt() } : { deliveryPlanSet: applied() });
  }) as typeof fetch });
  await client.save(pending(), () => true); await client.receipt(pending(), () => true);
  assert.deepEqual(calls.map(call => call.init.method), ['PATCH', 'POST']);
  assert.equal(calls[0].init.body, calls[1].init.body); assert.ok(calls[1].url.endsWith('/delivery-plans/receipt'));
  for (const call of calls) { assert.equal(call.init.credentials, 'include'); assert.equal(call.init.cache, 'no-store'); assert.equal((call.init.headers as Record<string, string>)['X-Zhixu-Request'], '1'); }
});
test('unknown is not a rejection and cannot trigger an automatic PATCH', async () => {
  let calls = 0;
  const client = createDeliveryPlanClient({ fetchImpl: (async (_url, init) => { calls++; assert.equal(init?.method, 'POST');
    return response({ receipt: { schemaVersion: 1, salesOrderId: orderId, requestId, requestMode: 'explicit', status: 'unknown' } }); }) as typeof fetch });
  assert.equal((await client.receipt(pending(), () => true)).status, 'unknown'); assert.equal(calls, 1);
});
test('receipt is bound to explicit UUID, original order and expected next version; error text is localized', () => {
  for (const patch of [{ requestId: otherId }, { requestMode: 'legacy' }, { salesOrderId: otherId }, { extra: true },
    { deliveryPlanSet: { ...data(), version: 9 } }]) assert.throws(() => parseDeliveryPlanReceipt({ ...receipt(), ...patch }, pending()));
  const rejected = parseDeliveryPlanReceipt({ schemaVersion: 1, salesOrderId: orderId, requestId, requestMode: 'explicit', status: 'rejected',
    error: { status: 409, code: 'delivery_plan_version_conflict', message: '<img>PRIVATE' } }, pending());
  assert.equal(rejected.status, 'rejected'); assert.ok(!JSON.stringify(rejected).includes('PRIVATE'));
});
test('old actor A to B to A cannot consume a late200 or late401', async () => {
  for (const status of [200, 401]) {
    const a = {}, b = {}; let owner: object = a, release!: () => void;
    const wait = new Promise<void>(accept => { release = accept; });
    const client = createDeliveryPlanClient({ fetchImpl: (async () => { await wait; return status === 200 ? response({ deliveryPlanSet: data() }) : response({ error: { code: 'authentication_required' } }, 401); }) as typeof fetch });
    const call = client.read(orderId, () => owner === a); owner = b; owner = {}; release();
    await assert.rejects(call, (error: unknown) => error instanceof DeliveryPlanClientError && error.code === 'delivery_plan_owner_changed' && error.status === 0);
  }
});
test('lease is checked after body read as well as fetch and cancels an obsolete stream', async () => {
  let current = true, cancelled = false, release!: () => void;
  const wait = new Promise<void>(accept => { release = accept; });
  const stream = new ReadableStream<Uint8Array>({ async pull(controller) { await wait; current = false; controller.enqueue(new TextEncoder().encode('{}')); }, cancel() { cancelled = true; } });
  const client = createDeliveryPlanClient({ fetchImpl: (async () => new Response(stream)) as typeof fetch });
  const call = client.read(orderId, () => current);
  for (let index = 0; index < 10 && !stream.locked; index++) await Promise.resolve();
  assert.ok(stream.locked); release();
  await assert.rejects(call, { code: 'delivery_plan_owner_changed' }); assert.ok(cancelled);
});
test('response capacity refuses oversized headers or streams without truncation', async () => {
  for (const header of [true, false]) {
    let cancelled = false, sent = false;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (!sent) { sent = true; controller.enqueue(new Uint8Array(DELIVERY_PLAN_RESPONSE_BYTES + 1)); } }, cancel() { cancelled = true; } });
    const client = createDeliveryPlanClient({ fetchImpl: (async () => new Response(stream, header ? { headers: { 'Content-Length': String(DELIVERY_PLAN_RESPONSE_BYTES + 1) } } : {})) as typeof fetch });
    await assert.rejects(client.read(orderId, () => true), { code: 'delivery_plan_response_too_large' }); assert.ok(cancelled);
  }
});
test('valid receipt JSON near16MiB is read completely, without a smaller client-only cap', async () => {
  const json = JSON.stringify({ receipt: receipt() });
  const body = json + ' '.repeat(16 * 1024 * 1024 - new TextEncoder().encode(json).byteLength);
  const client = createDeliveryPlanClient({ fetchImpl: (async () => new Response(body)) as typeof fetch });
  assert.equal((await client.receipt(pending(), () => true)).status, 'applied');
});
test('PATCH and applied receipts reject a same-version result that missed original edits or voids', async () => {
  for (const method of ['save', 'receipt'] as const) {
    const bad = data(), requested = pending();
    const client = createDeliveryPlanClient({ fetchImpl: (async () => response(method === 'save'
      ? { deliveryPlanSet: bad } : { receipt: { ...receipt(), deliveryPlanSet: bad } })) as typeof fetch });
    await assert.rejects(client[method](requested, () => true), { code: 'delivery_plan_receipt_mismatch' });
    requested.command.upserts = []; requested.command.voidIds = [planId];
    await assert.rejects(client[method](requested, () => true), { code: 'delivery_plan_receipt_mismatch' });
  }
});
test('applied additions require distinct active rows and cannot borrow edited or voided rows', () => {
  const requested = pending(); requested.command.upserts = [{ ...command().upserts[0], id: null }, { ...command().upserts[0], id: null }];
  assert.throws(() => parseDeliveryPlanReceipt(receipt(), requested), { code: 'delivery_plan_receipt_mismatch' });
  const twoRows = applied(); twoRows.plans[0].isDerivedDefault = false; twoRows.plans.push({ ...twoRows.plans[0], id: otherId });
  assert.equal(parseDeliveryPlanReceipt({ ...receipt(), deliveryPlanSet: twoRows }, requested).status, 'applied');
  twoRows.plans[1].voidedAt = '2026-10-22T00:00:00Z';
  assert.throws(() => parseDeliveryPlanReceipt({ ...receipt(), deliveryPlanSet: twoRows }, requested));
  requested.command.upserts = [command().upserts[0], { ...command().upserts[0], id: null }];
  assert.throws(() => parseDeliveryPlanReceipt(receipt(), requested));
  requested.command.upserts = [{ ...command().upserts[0], id: null }];
  assert.throws(() => parseDeliveryPlanReceipt(receipt(), requested), { code: 'delivery_plan_receipt_mismatch' });
});
test('applied default edits keep their historical marker and exact numeric scale is immaterial', () => {
  const set = applied(); set.plans[0].quantity += '00';
  assert.equal(parseDeliveryPlanReceipt({ ...receipt(), deliveryPlanSet: set }, pending()).status, 'applied');
  const requested = pending(); requested.command.upserts = []; requested.command.voidIds = [planId];
  set.plans[0].voidedAt = '2026-10-22T00:00:00Z';
  assert.equal(parseDeliveryPlanReceipt({ ...receipt(), deliveryPlanSet: set }, requested).status, 'applied');
});
test('network failures make one call and retain unknown outcome; current401 remains401', async () => {
  let calls = 0;
  const broken = createDeliveryPlanClient({ fetchImpl: (async () => { calls++; throw new Error('PRIVATE'); }) as typeof fetch });
  await assert.rejects(broken.save(pending(), () => true), { code: 'delivery_plan_outcome_unknown' }); assert.equal(calls, 1);
  const denied = createDeliveryPlanClient({ fetchImpl: (async () => response({ error: { code: 'authentication_required', message: 'PRIVATE' } }, 401)) as typeof fetch });
  await assert.rejects(denied.read(orderId, () => true), (error: unknown) => error instanceof DeliveryPlanClientError && error.status === 401 && !error.message.includes('PRIVATE'));
});

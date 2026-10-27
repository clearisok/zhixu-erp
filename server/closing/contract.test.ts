import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { closingAmount, closingChannelPermissions, closingQuantity, closingTaxRate, parseClosingCommand, parseClosingIntent, sumClosingAmounts } from './contract.js';
import { checkedClosingSnapshot, projectClosingSnapshot, type ClosingSnapshot } from './snapshot.js';
import type { TrustedIdentity } from '../auth/session.js';

const period = () => ({ action: 'create_period', month: '2026-10', taxRatePercent: '13', taxRateConfirmed: true, remark: '' });
const data = () => ({ quantity: '10.125', colorId: randomUUID(), assignmentId: null, executor: null, channels: { sales: true, work: true }, remark: '' });
const create = () => ({ action: 'create_allocation', periodId: randomUUID(), expectedPeriodVersion: 1, orderId: randomUUID(), data: data() });
const invalid = { code: 'invalid_closing_command' };
function snapshot(): ClosingSnapshot {
  return { schemaVersion: 'server-closing-allocation.v1', order: { id: randomUUID(), orderNo: 'SO-SYN', businessType: 'ainuoke_contract' },
    commercial: { id: randomUUID(), version: 1, quoteId: 'quote', revisionId: 'revision', priceVersionId: 'price' }, colorId: randomUUID(), colorName: '蓝', assignmentId: null,
    quantity: '3', channels: { sales: true, work: true }, taxRatePercent: '20', prices: { sale: { price: '1', currency: 'CNY' }, work: { price: '0', currency: 'USD' } },
    quantityBasis: { order: '100', color: '40', planned: null, completed: null }, executor: null, productionBasis: [], reviewBasis: [], remark: 'PRIVATE-MONEY-NOTE' };
}
const actor = (permissions: TrustedIdentity['permissions']): TrustedIdentity => ({ internalUserId: '1', userId: randomUUID(), username: 'synthetic', userName: 'Synthetic', permissions });

test('period tax is explicit percent text and confirmed; no default, ratio guessing or floating numbers', () => {
  assert.deepEqual(parseClosingIntent(period()), period());
  for (const patch of [{ taxRatePercent: undefined }, { taxRatePercent: 13 }, { taxRateConfirmed: false }, { taxRatePercent: '-1' }, { taxRatePercent: '100.000001' }, { taxRatePercent: '13e0' }]) assert.throws(() => parseClosingIntent({ ...period(), ...patch }), invalid);
  assert.equal(closingTaxRate('0.000000'), '0'); assert.equal(closingTaxRate('100'), '100');
});
test('manual quantities stay independent and exact, with no exponent, negative, truncation or float input', () => {
  assert.equal(closingQuantity('000010.125000'), '10.125');
  for (const value of ['0', '-1', '1.1234567', '1000000000000', 1, null, 'NaN', '1e2']) assert.throws(() => closingQuantity(value), invalid);
});
test('strict commands do not accept client price, currency, reassigned SO/period, actor or status', () => {
  const intent = create();
  for (const key of ['price', 'currency', 'orderId', 'periodId', 'actorId', 'status']) assert.throws(() => parseClosingIntent({ ...intent, data: { ...intent.data, [key]: 'spoof' } }), invalid);
  assert.throws(() => parseClosingIntent({ ...intent, actorId: 'spoof' }), invalid);
  assert.throws(() => parseClosingIntent({ ...intent, data: { ...intent.data, channels: { sales: false, work: false } } }), invalid);
});

test('month financial adoption accepts only period, selected channels and an explicit reason',()=>{
  const intent={action:'sync_month_outputs',periodId:randomUUID(),expectedPeriodVersion:1,channels:{sales:true,work:false},reason:'采用月份依据'};
  assert.deepEqual(parseClosingIntent(intent),intent);
  for(const key of ['orderId','quantity','colorId','price','currency','exchangeRate','allocations'])
    assert.throws(()=>parseClosingIntent({...intent,[key]:'spoof'}),invalid);
  for(const patch of [{reason:''},{channels:{sales:false,work:false}},{expectedPeriodVersion:0}])
    assert.throws(()=>parseClosingIntent({...intent,...patch}),invalid);
});
test('assignment attribution cannot be overridden by a simultaneous manual executor', () => {
  const intent = create();
  assert.throws(() => parseClosingIntent({ ...intent, data: { ...intent.data, assignmentId: randomUUID(), executor: { type: 'internal', id: randomUUID() } } }), invalid);
});
test('UUID and decimal normalization are stable before idempotency hashing', () => {
  const intent = create(), result = parseClosingIntent({ ...intent, periodId: intent.periodId.toUpperCase(), data: { ...intent.data, quantity: '010.1250' } });
  assert.deepEqual(result, intent);
  const command = parseClosingCommand({ requestId: randomUUID().toUpperCase(), intent, previewHash: 'a'.repeat(64) });
  assert.equal(command.requestId, command.requestId.toLowerCase());
  assert.throws(() => parseClosingCommand({ ...command, previewHash: 'A'.repeat(64) }), invalid);
});
test('review and recovery need reasons and cannot carry a replacement business snapshot', () => {
  const intent = { action: 'review_allocation', periodId: randomUUID(), expectedPeriodVersion: 1, allocationId: randomUUID(), expectedVersion: 1, reason: '人工复核' };
  assert.deepEqual(parseClosingIntent(intent), intent);
  assert.throws(() => parseClosingIntent({ ...intent, reason: '' }), invalid);
  assert.throws(() => parseClosingIntent({ ...intent, data: data() }), invalid);
  assert.throws(() => parseClosingIntent({ action: 'reopen_period', periodId: intent.periodId, expectedPeriodVersion: 1, reason: '' }), invalid);
});
test('old and new channel permission requirements are combined, never just the newly visible channel', () => {
  assert.deepEqual(closingChannelPermissions({ sales: false, work: true }, { sales: true, work: false }), ['commercial.sale.view', 'commercial.labor.view']);
});
test('CNY sales divide by one plus explicit percent, while USD work never applies a tax or exchange rate', () => {
  assert.equal(closingAmount('113', '1', '13').decimal, '100');
  assert.equal(closingAmount('3', '2.125', null).decimal, '6.375');
  assert.equal(closingAmount('1', '1', '0').decimal, '1');
  assert.equal(closingAmount('1', '0', null).decimal, '0');
});
test('recurring tax results retain an exact rational; six-place half-up is display only', () => {
  assert.deepEqual(closingAmount('1', '1', '13'), { numerator: '100', denominator: '113', decimal: '0.884956', scale: 6, rounding: 'half_up' });
  assert.equal(closingAmount('1', '0.0000005', null).decimal, '0.000001');
  assert.equal(closingAmount('1', '0.00000049', null).decimal, '0');
});
test('totals sum exact values before rounding, not already rounded lines', () => {
  const line = closingAmount('1', '1', '20'); assert.equal(line.decimal, '0.833333');
  assert.deepEqual(sumClosingAmounts([line, line, line]), { numerator: '5', denominator: '2', decimal: '2.5', scale: 6, rounding: 'half_up' });
  assert.equal(sumClosingAmounts([]).decimal, '0');
});
test('large decimals retain all digits and serialize without BigInt or Number conversion', () => {
  const value = closingAmount('999999999999.999999', '9007199254740993.000000000001', null);
  assert.equal(value.denominator, '1000000000000000000');
  assert.equal(value.numerator, '9007199254740992990992800746259006999999999999');
  assert.doesNotThrow(() => JSON.stringify(value));
});
test('immutable snapshots retain null versus confirmed zero and enforce business type/currency', () => {
  const value = snapshot(); assert.deepEqual(checkedClosingSnapshot(value), value);
  for (const patch of [ { prices: { ...value.prices, work: { price: '0', currency: 'CNY' } } }, { order: { ...value.order, businessType: 'processing' } },
    { prices: { ...value.prices, work: { price: null, currency: 'USD' } } }, { quantity: '3.000' } ]) assert.throws(() => checkedClosingSnapshot({ ...value, ...patch }), { code: 'closing_snapshot_invalid' });
});
test('snapshot projection never leaks hidden amounts or free text and keeps sales/work independent', () => {
  const value = snapshot(), hidden = projectClosingSnapshot(value, actor([]));
  assert.deepEqual(hidden.outputs.garmentSale, { visibility: 'restricted' }); assert.deepEqual(hidden.outputs.work, { visibility: 'restricted' });
  assert.equal(Object.hasOwn(hidden, 'remark'), false); assert.equal(JSON.stringify(hidden).includes('PRIVATE-MONEY-NOTE'), false);
  const sale = projectClosingSnapshot(value, actor(['commercial.sale.view'])); assert.equal(sale.outputs.garmentSale?.visibility, 'allowed'); assert.deepEqual(sale.outputs.work, { visibility: 'restricted' });
  const work = projectClosingSnapshot(value, actor(['commercial.labor.view'])); assert.deepEqual(work.outputs.garmentSale, { visibility: 'restricted' }); assert.equal(work.outputs.work?.visibility, 'allowed');
});
test('processing projection has no garment sale output and no duplicate USD total', () => {
  const value = snapshot(); value.order.businessType = 'processing'; value.channels.sales = false; delete value.prices.sale;
  const output = projectClosingSnapshot(checkedClosingSnapshot(value), actor(['commercial.labor.view']));
  assert.equal(Object.hasOwn(output.outputs, 'garmentSale'), false); assert.equal(output.outputs.work?.bucket, 'processing_service');
  assert.equal(Object.hasOwn(output.outputs, 'total'), false);
});
test('unknown fields in stored snapshots and nested prices cannot turn into public data', () => {
  const value = snapshot();
  for (const patch of [{ ...value, secretCost: '999' }, { ...value, order: { ...value.order, secretCost: '999' } },
    { ...value, prices: { ...value.prices, sale: { ...value.prices.sale, secretCost: '999' } } }]) assert.throws(() => checkedClosingSnapshot(patch), { code: 'closing_snapshot_invalid' });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { assertFinancialRecoveryReceipt, seedPersistentFinancialRecovery, snapshotPersistentFinancialRecovery } from './persistent-financial-recovery-fixture.mjs';

const requestId = '69560c7a-3289-4b0b-a33d-28ee1c79ba66', periodId = '01eca190-09a1-4dd4-a7c3-114cfd8f32fd';
// Literal canonical bytes independently fix the expected command digest.
const command = { requestId, intent: { action: 'lock_period', periodId, expectedPeriodVersion: 3, reason: 'Synthetic' }, previewHash: 'a'.repeat(64) };
const canonical = `{"intent":{"action":"lock_period","expectedPeriodVersion":3,"periodId":"${periodId}","reason":"Synthetic"},"previewHash":"${'a'.repeat(64)}","requestId":"${requestId}"}`;
const digest = createHash('sha256').update(canonical).digest('hex');
const result = { requestId, status: 'applied', periodId, periodVersion: 4, periodStatus: 'locked', operationId: 'original-operation' };
const closing = { kind: 'closing', command, result };
const reply = { state: 'recorded', requestId, commandHash: digest, result };
test('financial receipt binds literal canonical original bytes and the original result', () => assert.doesNotThrow(() => assertFinancialRecoveryReceipt(closing, reply)));
test('unknown, rejected or null receipts never prove recovery', () => {
  for (const patch of [{ state: 'unknown' }, { state: 'pending' }, { result: null }, { result: { ...result, status: 'rejected' } }])
    assert.throws(() => assertFinancialRecoveryReceipt(closing, { ...reply, ...patch }), { name: 'AssertionError' });
});
test('wrong request, hash, period, version or operation is rejected', () => {
  for (const patch of [{ requestId: 'other' }, { commandHash: 'b'.repeat(64) },
    ...[{ periodId: 'other' }, { periodVersion: 3 }, { operationId: 'other' }].map(patch => ({ result: { ...result, ...patch } }))])
    assert.throws(() => assertFinancialRecoveryReceipt(closing, { ...reply, ...patch }), { name: 'AssertionError' });
  assert.throws(() => assertFinancialRecoveryReceipt({ ...closing, command: { ...command, intent: { ...command.intent, reason: 'replacement' } } }, reply), { name: 'AssertionError' });
});
test('labor receipt also requires the declared original order identity', () => {
  const orderId = '053d19a5-e856-4788-9418-f2500780e08c', laborCommand = { ...command, intent: { orderId,
    expectedVersion: 1, targetRevisionId: 'r2', colorIds: [null], productUnchangedConfirmed: true, reason: 'Synthetic' } };
  const hash = createHash('sha256').update(`{"intent":{"colorIds":[null],"expectedVersion":1,"orderId":"${orderId}","productUnchangedConfirmed":true,"reason":"Synthetic","targetRevisionId":"r2"},"previewHash":"${'a'.repeat(64)}","requestId":"${requestId}"}`).digest('hex');
  const expected = { kind: 'labor', command: laborCommand, result: { requestId, status: 'applied', version: 2, commercialVersionId: 'original' } };
  const value = { state: 'recorded', requestId, orderId, commandHash: hash, result: expected.result };
  assert.doesNotThrow(() => assertFinancialRecoveryReceipt(expected, value));
  for (const patch of [{ orderId: 'other' }, { result: { ...expected.result, version: 3 } }])
    assert.throws(() => assertFinancialRecoveryReceipt(expected, { ...value, ...patch }), { name: 'AssertionError' });
});
test('month recovery binds the original order, version and exact command', () => {
  const orderId = '053d19a5-e856-4788-9418-f2500780e08c', monthCommand = { ...command, intent: { action: 'move_months', orderId, expectedVersion: 2, targetMonth: '2027-02', selection: { mode: 'whole' }, reason: 'Synthetic' } };
  const monthResult = { requestId, status: 'applied', orderId, version: 3, versionId: 'original-month-version', operationId: 'original-month-operation' };
  const canonical = `{"intent":{"action":"move_months","expectedVersion":2,"orderId":"${orderId}","reason":"Synthetic","selection":{"mode":"whole"},"targetMonth":"2027-02"},"previewHash":"${'a'.repeat(64)}","requestId":"${requestId}"}`;
  const expected = { kind: 'month', command: monthCommand, result: monthResult }, reply = { state: 'recorded', requestId, commandHash: createHash('sha256').update(canonical).digest('hex'), result: monthResult };
  assert.doesNotThrow(() => assertFinancialRecoveryReceipt(expected, reply));
  for (const patch of [{ orderId: 'other' }, { version: 2 }, { versionId: 'replacement' }]) assert.throws(() => assertFinancialRecoveryReceipt(expected, { ...reply, result: { ...monthResult, ...patch } }), { name: 'AssertionError' });
});
test('financial fixture and reads refuse unprepared or unrelated projects before any IO', async () => {
  const unexpected = () => assert.fail('must not perform IO');
  for (const state of [{ prepared: false, project: 'zhixu-quote-trial-it-0123456789' }, { prepared: true, project: 'existing-user-target' }]) {
    state.request = unexpected; state.sql = unexpected; state.compose = unexpected;
    await assert.rejects(seedPersistentFinancialRecovery(state, 'synthetic', {}, unexpected), { name: 'AssertionError' });
    await assert.rejects(snapshotPersistentFinancialRecovery(state, 'synthetic', {}), { name: 'AssertionError' });
  }
});
test('empty financial tables cannot satisfy recovery even if every HTTP read would be 200', async () => {
  let reads = 0;
  const state = { prepared: true, project: 'zhixu-quote-trial-it-0123456789', sql: async () => '0', request: async () => { reads++; assert.fail('empty table must stop before HTTP'); } };
  await assert.rejects(snapshotPersistentFinancialRecovery(state, 'synthetic', { readPaths: [], receipts: [] }), /nonempty_financial_recovery_required/);
  assert.equal(reads, 0);
});
test('owned financial seed reaches the synthetic host generator before any container IO', async () => {
  const stop = new Error('synthetic generator boundary reached'), calls = [];
  const state = { prepared: true, project: 'zhixu-quote-trial-it-0123456789', compose: () => assert.fail('generator failure must stop before container IO') };
  const run = async (binary, args) => { calls.push({ binary, args }); throw stop; };
  await assert.rejects(seedPersistentFinancialRecovery(state, 'synthetic', { orderId: 'synthetic', assignments: ['one', 'two'] }, run), error => error === stop);
  assert.equal(calls.length, 1); assert.equal(calls[0].binary, process.execPath);
  assert.deepEqual(calls[0].args.slice(0, 4), ['--import', 'tsx', '--input-type=module', '-e']);
});

test('nonempty rows and successful reads cannot prove recovery without the frozen-month trigger', async () => {
  let catalogReads = 0;
  const state = { prepared: true, project: 'zhixu-quote-trial-recovery-0123456789', sql: async query => {
    if (query.includes('pg_trigger')) { catalogReads++; return '[]'; }
    return '1';
  } };
  await assert.rejects(snapshotPersistentFinancialRecovery(state, 'synthetic', { readPaths: [], receipts: [] }), /frozen_closing_trigger_required/);
  assert.equal(catalogReads, 1);
});

test('a disabled frozen-month trigger cannot prove financial recovery', async () => {
  const state = { prepared: true, project: 'zhixu-quote-trial-recovery-0123456789', sql: async query =>
    query.includes('pg_trigger') ? JSON.stringify([{ enabled: 'D' }]) : '1' };
  await assert.rejects(snapshotPersistentFinancialRecovery(state, 'synthetic', { readPaths: [], receipts: [] }), /frozen_closing_trigger_enabled/);
});

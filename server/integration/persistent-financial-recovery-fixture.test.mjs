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

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { buildPaymentContractSnapshot } from '../ainuoke-source/payment-request-snapshot.js';
import { paymentContractSnapshotInputs } from '../ainuoke-source/payment-request-contract-probe.js';
import { planPaymentCollection, collectAndPublishPaymentContracts } from '../ainuoke-source/payment-request-collection.js';
import { collectionConfig, collectionSelection, collectionEvidence } from './payment-collection-fixture.js';
import type { PaymentDecimal } from '../ainuoke-source/payment-request-observations.js';

const now = Date.now(), selection = collectionSelection();
const matches = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
const raw = (field: PaymentDecimal) => { if (field.state !== 'known') assert.fail('expected a known source decimal'); return field.raw; };
test('validated raw pages become two exact, complete snapshot inputs without financial inference', () => {
  const inputs = paymentContractSnapshotInputs(collectionEvidence(selection, now - 1000), collectionConfig, selection, now);
  assert.equal(inputs.length, 2);
  for (const [index, capture] of inputs.entries()) {
    assert.equal(capture.alias, 'S' + (index + 1));
    const snapshot = buildPaymentContractSnapshot(capture.input, capture.scope, now);
    assert.equal(snapshot.rows.length, 127); assert.equal(snapshot.trace.length, 4);
    assert.equal(snapshot.rows[100].trace.page, 2); assert.equal(snapshot.rows[100].trace.rowIndex, 0);
    assert.equal(raw(snapshot.rows[0].amounts.Price), '9007199254740993.000000000001');
    assert.equal(raw(snapshot.rows[0].quantities.Num), '115.50');
    assert.equal(raw(snapshot.rows[0].quantities.OutStoreNum), '118');
    assert.equal(raw(snapshot.rows[0].amounts.tzamount), '-80.00');
    assert.equal(raw(snapshot.rows[3].amounts.GoodsAmount), '0');
    assert.equal(snapshot.rows[2].sourceUnits.purchase.state, 'unknown');
    assert.equal(snapshot.rows[0].amountCurrencies.GoodsAmount.state, 'unknown');
    assert.equal(snapshot.rows[0].allocatedShipmentUnit.state, 'unknown');
    assert.equal(snapshot.rows[0].bankPaymentStatus, 'not_inferred');
    assert.deepEqual(snapshot.rows[0].sourceFields, snapshot.rows[1].sourceFields);
    assert.notEqual(snapshot.rows[0].observationId, snapshot.rows[1].observationId);
  }
});
test('adapter rejects unvalidated raw data, mixed identity, missing passes, stale pages and reflected secrets', async t => {
  const cases: Array<[string, (evidence: ReturnType<typeof collectionEvidence>) => void]> = [
    ['failed worker', e => { Object.assign(e, { result: 'failed', code: 'network_unavailable', workerStage: 'report' }); }],
    ['missing pass', e => { e.pages.splice(4); e.reportRequests = 4; e.httpAttempts = 5; }],
    ['wrong scope hash', e => { e.selectionHash = '0'.repeat(64); }],
    ['raw hash mismatch', e => { e.pages[0].rawResponseSha256 = '0'.repeat(64); }],
    ['mixed contract', e => {
      const p = e.pages[0]; p.rawReportResponse = p.rawReportResponse.replaceAll(selection.targets[0].salesContractNo, 'OTHER-SYN-SC');
      p.rawResponseSha256 = createHash('sha256').update(p.rawReportResponse).digest('hex');
    }],
    ['secret reflection', e => {
      const p = e.pages[0]; p.rawReportResponse = p.rawReportResponse.replaceAll('合成货款物料', collectionConfig.password);
      p.rawResponseSha256 = createHash('sha256').update(p.rawReportResponse).digest('hex');
    }],
    ['old capture', e => { e.pages[0].capturedAt = new Date(now - 180001).toISOString(); }],
  ];
  for (const [label, mutate] of cases) await t.test(label, () => {
    const e = collectionEvidence(selection, now - 1000); mutate(e);
    assert.throws(() => paymentContractSnapshotInputs(e, collectionConfig, selection, now));
  });
});
test('scope and target shape fail before any database or worker access', async () => {
  const pool = { query() { assert.fail('must not query'); }, connect() { assert.fail('must not connect'); } } as unknown as Pool;
  const actor = { internalUserId: '1', userId: randomUUID() }, request = {
    config: collectionConfig, selection, targets: [{ alias: 'S1', salesOrderId: randomUUID() }, { alias: 'S2', salesOrderId: randomUUID() }],
  };
  await assert.rejects(() => collectAndPublishPaymentContracts(pool, actor, request, ''), matches('payment_collection_explicit_scope_required'));
  for (const targets of [[], [request.targets[0], request.targets[0]], [request.targets[1], request.targets[0]],
    [{ ...request.targets[0], salesOrderId: 'SYN-SC-1' }, request.targets[1]]]){
    await assert.rejects(() => planPaymentCollection(pool, actor, { ...request, targets }), matches('payment_collection_invalid_targets'));
    await assert.rejects(() => collectAndPublishPaymentContracts(pool, actor, { ...request, targets },'a'.repeat(64)), matches('payment_collection_invalid_targets'));
  }
  await assert.rejects(() => planPaymentCollection(pool, actor, { ...request, config: { ...collectionConfig, username: 'another-synthetic' } }), matches('payment_contract_account_mismatch'));
});

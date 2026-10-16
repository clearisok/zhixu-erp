import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parsePaymentOperatorPermit, assertPaymentOperatorPermitFresh } from '../ainuoke-source/payment-operator-command-store.js';
import { verifyPaymentTargetEvidence, assertPaymentTargetVerification } from '../ainuoke-source/payment-target-verification.js';
import { validateContractEvidence } from '../ainuoke-source/payment-request-contract-probe.js';
import { collectionConfig, collectionEvidence, collectionSelection } from './payment-collection-fixture.js';
import { hash } from '../ainuoke-source/contract.js';
const matches = (code: string) => (e: unknown) => (e as {code?: string}).code === code;

test('operator permit is exact, bounded and cannot carry reflected fields', () => {
  const now = Date.now(), value = { requestId: randomUUID(), scopeHash: hash('test'), expiresAt: new Date(now + 60000).toISOString() };
  assert.deepEqual(parsePaymentOperatorPermit(value), value); assertPaymentOperatorPermitFresh(value, now);
  for (const changed of [{...value,extra:'secret'}, {...value,requestId:'invalid'}, {...value,scopeHash:'a'},
    {...value,expiresAt:'2026-10-16'}, {...value,expiresAt:'2026-02-31T01:01:01.000Z'}])
    assert.throws(() => parsePaymentOperatorPermit(changed), matches('payment_operator_invalid_permit'));
  for (const clock of [now+60000, now-600000, NaN])
    assert.throws(() => assertPaymentOperatorPermitFresh(value, clock), matches('payment_operator_permit_expired'));
});

test('target verification rebuilds complete historical evidence instead of trusting presence of fields or accepted label', () => {
  const now = Date.now(), selection = collectionSelection(), evidence = collectionEvidence(selection, now - 60000, 12);
  const request = {config:{...collectionConfig},selection,targets:selection.targets.map(row=>({alias:row.alias,salesOrderId:randomUUID()}))};
  const report = {...validateContractEvidence(evidence, request.config, selection, now).privateReport, toolingCommit:'a'.repeat(40)};
  const valid = verifyPaymentTargetEvidence(report,hash(report),request,now);
  assertPaymentTargetVerification(valid); assert.equal(valid.contracts[0].rowCount,12); assert.ok(Object.isFrozen(valid));
  assert.throws(() => assertPaymentTargetVerification({...valid}), matches('payment_operator_verification_required'));
  for (const change of [
    (r: Record<string,unknown>) => { r.sourceActivation='activated'; },
    (r: Record<string,unknown>) => { r.selectionHash='0'.repeat(64); },
    (r: Record<string,unknown>) => { r.contracts=[]; },
    (r: Record<string,unknown>) => { (r.evidence as typeof evidence).pages.pop(); },
    (r: Record<string,unknown>) => { (r.evidence as typeof evidence).pages[0].capturedAt=new Date(now+1).toISOString(); },
  ]) {
    const altered=structuredClone(report) as Record<string,unknown>; change(altered);
    assert.throws(()=>verifyPaymentTargetEvidence(altered,hash(altered),request,now));
  }
  assert.throws(()=>verifyPaymentTargetEvidence(report,hash(report),{...request,selection:collectionSelection('other')},now));
});

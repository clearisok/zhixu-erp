import assert from 'node:assert/strict';
import test from 'node:test';
import { assessNormalizationPair, type NormalizationOrderEvidence } from './normalization-assessment.js';
const order = (id: string, extra: Partial<NormalizationOrderEvidence> = {}): NormalizationOrderEvidence => ({id, trustedContract:false, processingBatchId:null, lifecycle:'draft', sourceSnapshots:0, deliveryPlans:0, commercialVersions:0, execution:{coverage:'verified',count:0}, financialLocks:{coverage:'verified',count:0}, unknownReferences:[], ...extra});
test('missing execution or lock coverage never becomes zero or a safe candidate', () => {
  for (const field of ['execution','financialLocks'] as const) {
    const result=assessNormalizationPair(order('a',{trustedContract:true}),order('b',{[field]:{coverage:'unavailable',count:null}}));
    assert.equal(result.disposition,'coverage_incomplete'); assert.equal(result.candidateOrderId,null); assert.equal(result.executionAuthorized,false);
  }
});
test('source snapshots, delivery plans and commercial versions are not execution', () => {
  const result=assessNormalizationPair(order('a',{trustedContract:true}),order('b',{sourceSnapshots:99,deliveryPlans:9,commercialVersions:4}));
  assert.equal(result.candidateOrderId,'a'); assert.equal(result.executionAuthorized,false);
});
test('single executed order is preferred without moving any references', () => {
  const a=order('a',{trustedContract:true}); const b=order('b',{execution:{coverage:'verified',count:2}});
  const before=JSON.stringify([a,b]); assert.equal(assessNormalizationPair(a,b).candidateOrderId,'b'); assert.equal(JSON.stringify([a,b]),before);
});
test('dual execution cannot be combined or automatically choose a winner', () => {
  const result=assessNormalizationPair(order('a',{execution:{coverage:'verified',count:1}}),order('b',{execution:{coverage:'verified',count:2}}));
  assert.equal(result.disposition,'dual_execution_review'); assert.equal(result.candidateOrderId,null);
});
test('frozen or completed history requires separate financial review', () => {
  for(const extra of [{financialLocks:{coverage:'verified' as const,count:1}},{lifecycle:'completed' as const}]) assert.equal(assessNormalizationPair(order('a',extra),order('b')).disposition,'financial_review');
});
test('processing batches and cancelled orders are never inferred duplicates', () => {
  for(const extra of [{processingBatchId:'batch-1'},{lifecycle:'cancelled' as const}]) assert.equal(assessNormalizationPair(order('a',{trustedContract:true}),order('b',extra)).disposition,'business_identity_review');
});
test('unknown references block candidate selection and ambiguous trusted contracts need review', () => {
  assert.equal(assessNormalizationPair(order('a',{trustedContract:true}),order('b',{unknownReferences:['external_plan']})).disposition,'coverage_incomplete');
  for(const trustedContract of [true,false]) assert.equal(assessNormalizationPair(order('a',{trustedContract}),order('b',{trustedContract})).candidateOrderId,null);
});
test('invalid counts and duplicate identities fail closed', () => {
  assert.throws(()=>assessNormalizationPair(order('A'),order('a')));
  for(const count of [-1,0.5,NaN,Infinity]) assert.throws(()=>assessNormalizationPair(order('a',{execution:{coverage:'verified',count}}),order('b')));
  assert.throws(()=>assessNormalizationPair(order('a',{execution:{coverage:'unavailable',count:0}}),order('b')));
});

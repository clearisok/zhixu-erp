import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSourceOrder, quantityObservation } from '../scripts/analyze-source-anomalies.mjs';

test('unknown, zero, signed and missing-document quantities stay distinct', () => {
  for (const value of [null, undefined, '', '  ']) {
    assert.equal(quantityObservation(value, ''), 'blank-no-event-unverified');
    assert.equal(quantityObservation(value, 'DOC'), 'blank-with-document');
  }
  assert.equal(quantityObservation(0, ''), 'explicit-zero');
  assert.equal(quantityObservation(-2, 'DOC'), 'negative-business-meaning-unverified');
  for (const value of [true, [], {}, 'bad', Infinity]) assert.equal(quantityObservation(value, 'DOC'), 'invalid');
  assert.equal(quantityObservation('1,234', ''), 'positive-without-document');
});
const make = () => ({label:'S1',current:{salesContractNo:'SYNTHETIC'},materialRawPages:[{rows:[
  {sourceRowIdentity:'a',values:{ExpContractNo:'SYNTHETIC',GoodsNo:'LABEL',CnName:'Label',TotalNum:42,QtyUnit:'unit-a',cgdh:'PO-A',cgnum:41}},
  {sourceRowIdentity:'b',values:{ExpContractNo:'SYNTHETIC',GoodsNo:'LABEL',CnName:'Label',TotalNum:42,QtyUnit:'unit-b',cgdh:'PO-B',cgnum:41}},
]}],conflictDemands:[{demand:{id:'d',materialCode:'LABEL',materialName:'Label'},sourceRows:[{sourceRowIdentity:'a'},{sourceRowIdentity:'b'}]}]});
test('same identity on different documents is evidenced but never merged or unit-converted', () => {
  const input=make(), before=structuredClone(input), result=analyzeSourceOrder(input);
  assert.equal(result.units[0].sameDemandFields,true);
  assert.equal(result.units[0].sameQuantityDifferentPurchaseDocuments,true);
  assert.deepEqual(result.units[0].rows.map(r=>r.unit),['unit-a','unit-b']);
  assert.deepEqual(input,before);
});
test('different material code/spec and unresolved source reference cannot masquerade as proven same identity', () => {
  for(const key of ['GoodsNo','CnComposition','TotalNum']) {
    const input=make(); input.materialRawPages[0].rows[1].values[key]='changed';
    assert.equal(analyzeSourceOrder(input).units[0].sameDemandFields,false);
  }
  const input=make(); input.conflictDemands[0].sourceRows.push({sourceRowIdentity:'missing'});
  assert.equal(analyzeSourceOrder(input).units[0].allReferencesResolved,false);
});
test('empty color candidates, explicit size zero and positive missing-color facts remain separate', () => {
  const input={colorRawPages:[{rows:[{sourceRowIdentity:'a',values:{CnColor:'red'}},
    {sourceRowIdentity:'b',values:{CnColor:''}}, {sourceRowIdentity:'c',values:{CnColor:'',Size1:0}},
    {sourceRowIdentity:'d',values:{CnColor:'',SizeNum:3,Size1:3}}]}]};
  const rows=analyzeSourceOrder(input).colors;
  assert.deepEqual(rows.map(r=>r.classification),['named-empty-color-retained','approved-empty-placeholder','missing-color-identity','missing-color-identity']);
  assert.ok(rows.every(r=>r.mayDiscard===false));
  assert.deepEqual(rows.map(r=>r.excludeFromColorProjection),[false,true,false,false]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {assertSourceLedgerReceipt} from './persistent-source-ledger-recovery-fixture.mjs';

const requestId='936f9974-6976-46ac-9c84-688a569e2eb8',salesOrderId='7b3beb28-94c5-4fe7-aae6-6bb0f61cc441';
const expected=[
  {kind:'bound_refresh',requestId,salesOrderId,result:{requestId,salesOrderId,afterSourceHash:'original'}},
  {kind:'garment_target',requestId,salesOrderId,result:{action:'enable',version:1,enabled:true}},
  {kind:'garment_collection',requestId,salesOrderId,result:{outcome:'published',publicationId:'original-publication',generation:2}},
  {kind:'delivery',salesOrderId,command:{requestId,expectedVersion:1},result:{operationId:'original-operation',deliveryPlanSet:{salesOrderId,version:2,plans:[{quantity:'90.125'}]}}},
];
function reply(e){
  if(e.kind==='delivery')return {status:'applied',requestMode:'explicit',requestId,salesOrderId,...e.result};
  return {sourceReadThisInvocation:'none',automaticRetry:false,requestId,result:e.result,
    ...(e.kind==='bound_refresh'?{state:'completed'}:{receiptState:'completed'})};
}
test('each source ledger protocol accepts its exact original completed result',()=>{
  for(const e of expected)assert.doesNotThrow(()=>assertSourceLedgerReceipt(e,reply(e)));
});
test('unknown, started, rejected and null results are not nonempty recovery proof',()=>{
  for(const e of expected){
    for(const patch of [{state:'unknown',receiptState:'unknown',status:'unknown'},{state:'started',receiptState:'unverified_started',status:'rejected'},{result:null,deliveryPlanSet:null}])
      assert.throws(()=>assertSourceLedgerReceipt(e,{...reply(e),...patch}),{name:'AssertionError'});
  }
});
test('different request identities and changed original results are refused',()=>{
  for(const e of expected){
    const original=reply(e);
    const changed=e.kind==='delivery'?{...original,deliveryPlanSet:{...original.deliveryPlanSet,version:3}}:{...original,result:{...original.result,changed:true}};
    assert.throws(()=>assertSourceLedgerReceipt(e,changed),{name:'AssertionError'});
    const wrong=e.kind==='bound_refresh'?{...original,result:{...original.result,requestId:'wrong'}}:{...original,requestId:'wrong'};
    assert.throws(()=>assertSourceLedgerReceipt(e,wrong),{name:'AssertionError'});
  }
});
test('querying an original receipt must not silently perform Source IO',()=>{
  for(const e of expected.filter(e=>e.kind!=='delivery'))assert.throws(()=>assertSourceLedgerReceipt(e,{...reply(e),sourceReadThisInvocation:'see_result'}),{name:'AssertionError'});
});

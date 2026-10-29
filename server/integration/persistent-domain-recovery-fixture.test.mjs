import assert from 'node:assert/strict';
import test from 'node:test';
import { readPersistentDomainReceipts } from './persistent-domain-recovery-fixture.mjs';

const requestId='6c72e2bf-4910-4ad1-967a-fbd6c920a73e';
const path='/api/v1/production-scheduling/commands/'+requestId;
const result={requestId,status:'applied',operationId:'original-operation',execution:{version:2,completedQuantity:'20.25'}};
const receipts=[{path,requestId,result}];
const state=reply=>({request:async()=>({status:200,bytes:Buffer.from(JSON.stringify(reply)),json:()=>reply})});
test('domain recovery accepts only the original applied receipt',async()=>{
  const reply={state:'known',requestId,result:{...result,payloadHash:'a'.repeat(64)}};
  assert.deepEqual(await readPersistentDomainReceipts(state(reply),'synthetic',receipts),{[path]:reply});
});
test('HTTP 200 unknown/pending is not recovery evidence',async()=>{
  for(const value of ['unknown','pending'])await assert.rejects(readPersistentDomainReceipts(state({state:value,requestId,result:null}),'synthetic',receipts),{name:'AssertionError'});
});
test('a known receipt for a different request or rejected operation is refused',async()=>{
  for(const reply of [{state:'known',requestId:'other-request',result},{state:'known',requestId,result:{requestId,status:'rejected'}}])
    await assert.rejects(readPersistentDomainReceipts(state(reply),'synthetic',receipts),{name:'AssertionError'});
});
test('a known applied receipt with changed identity/version/quantity is refused',async()=>{
  for(const patch of [{operationId:'different-operation'},{execution:{version:1,completedQuantity:'20.25'}},{execution:{version:2,completedQuantity:'10.125'}}])
    await assert.rejects(readPersistentDomainReceipts(state({state:'known',requestId,result:{...result,...patch}}),'synthetic',receipts),{name:'AssertionError'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPages,auditRecordSet} from './sync-audit.js';
import {selectedWorkerFixture,selectedConfig} from '../integration/selected-source-fixture.js';
import {validateSelectedSourceOnce} from './selected-source-once.js';
import {retryableCapture,validateRequestDiagnostics} from './sync-diagnostics.js';
type Raw={bundle:{discoveryBefore:{rows:{values:Record<string,unknown>}[]}[];discoveryAfter:{rows:{values:Record<string,unknown>}[]}[]}};

test('observed hsid-only drift is rejected for fresh recapture, not ignored or accepted',async()=>{
 const raw=selectedWorkerFixture('catalog-discovery','',[]) as Raw;
 raw.bundle.discoveryBefore[0].rows[0].values.hsid='old';raw.bundle.discoveryAfter[0].rows[0].values.hsid='new';
 await assert.rejects(validateSelectedSourceOnce(raw,selectedConfig,{mode:'catalog-discovery',contracts:[]}),e=>{
  assert.ok(e instanceof Error);assert.equal(e.message,'catalog_non_identity_content_changed');assert.equal(retryableCapture(e.message,null),true);return true;
 });
 raw.bundle.discoveryBefore[0].rows[0].values.hsid='new';
 assert.equal((await validateSelectedSourceOnce(raw,selectedConfig,{mode:'catalog-discovery',contracts:[]})).result,'complete');
});
test('permission, source identity, schema, and arbitrary envelope changes remain unsafe',async()=>{
 for(const field of ['id','BillNo','InsideOrderNo','PermissionScope','TenantId','AccountID']){
  const raw=selectedWorkerFixture('catalog-discovery','',[]) as Raw;
  raw.bundle.discoveryBefore[0].rows[0].values[field]='before';raw.bundle.discoveryAfter[0].rows[0].values[field]='after';
  await assert.rejects(validateSelectedSourceOnce(raw,selectedConfig,{mode:'catalog-discovery',contracts:[]}),e=>{assert.ok(e instanceof Error);assert.equal(retryableCapture(e.message,null),false);return true;});
 }
});
test('source identities count changes; GoodsID alone, join collisions and unknown IDs never invent metrics',()=>{
 const page=(values:Record<string,unknown>[])=>auditPages([{reportId:'6087051',fetchedAt:new Date().toISOString(),page:1,total:values.length,queryContext:{salesContractNo:'SYN'},rows:values.map(values=>({values}))}]);
 const set=auditRecordSet(page([{id:'1',GoodsID:'SAME',cgmxid:'10',rkmxid:'20'},{id:'1',GoodsID:'SAME',cgmxid:'10',rkmxid:'21'},{id:'1',GoodsID:'SAME',cgmxid:'10',rkmxid:'21'}]));
 assert.equal(set.records.size,2);assert.equal(set.duplicates,1);assert.equal(set.ambiguous,false);
 assert.equal(auditRecordSet(page([{GoodsID:'SAME',Num:3}])).ambiguous,true);
 assert.equal(auditRecordSet(page([{id:'1',cgmxid:'10',Num:1},{id:'1',cgmxid:'10',Num:2}])).ambiguous,true);
 assert.equal(auditRecordSet(page([])).records.size,0);
});
test('HTTP success with business rejection and impossible chronology cannot be successful diagnostics',()=>{
 const base={kind:'report',reportId:6087051,page:1,elapsedMs:1,httpStatus:200,outcome:'complete',responseIsOk:false};
 assert.throws(()=>validateRequestDiagnostics([base]),/sync_diagnostics_invalid/);
 assert.throws(()=>validateRequestDiagnostics([{...base,responseIsOk:true,startedAt:'2026-11-12T00:00:02Z',finishedAt:'2026-11-12T00:00:01Z'}]),/sync_diagnostics_invalid/);
 assert.throws(()=>validateRequestDiagnostics([{...base,responseIsOk:true,receivedRows:-1}]),/sync_diagnostics_invalid/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedConfig, selectedWorkerFixture } from '../integration/selected-source-fixture.js';
import { validateSelectedSourceOnce } from './selected-source-once.js';
import { validateCatalogDiagnostic, retryableCapture } from './sync-diagnostics.js';
import type { AdditionDiscoveryBundle } from './additions.js';

const request={mode:'catalog-discovery' as const,contracts:[] as []};
const original=selectedWorkerFixture('catalog-discovery','',[]) as {bundle:AdditionDiscoveryBundle;metrics:{httpAttempts:number};sourceFingerprint:string};
test('only explicit business fields qualify; stable captures remain publishable',async()=>{
 const result=await validateSelectedSourceOnce(original,selectedConfig,request);
 assert.equal(result.result,'complete');
 for(const [key,value] of Object.entries({DeliveryDate:'2027-02-03',ContractDate:'2026-10-02',Num:123,Status:'updated',GoodsDesc:'NEW-STYLE',Brand:'new brand',CustomerName:'new name'})){
  const raw=structuredClone(original);raw.bundle.discoveryAfter[0].rows[0].values[key]=value;
  raw.bundle.discoveryAfter[0].rows[0].sourceRowIdentity='6086103:new-business-fingerprint';
  raw.bundle.discoveryAfter[0].snapshotHash='changed-page-content-hash';
  await assert.rejects(validateSelectedSourceOnce(raw,selectedConfig,request),{message:'catalog_business_content_changed'});
 }
 assert.equal(retryableCapture('catalog_business_content_changed',null),true);
});
test('identity, visibility, unknown metadata and mixed changes never qualify',async()=>{
 for(const [key,value] of Object.entries({id:'other-id',BillNo:'OTHER-CONTRACT',InsideOrderNo:'OTHER-FACTORY-STYLE',UnknownField:'new',PermissionScope:'other'})){
  const raw=structuredClone(original);Object.assign(raw.bundle.discoveryAfter[0].rows[0].values,{Num:123,[key]:value});
  await assert.rejects(validateSelectedSourceOnce(raw,selectedConfig,request),error=>{
   assert.ok(error instanceof Error);assert.notEqual(error.message,'catalog_business_content_changed');
   assert.equal(retryableCapture(error.message,null),false);return true;
  });
 }
 const identityOnly=structuredClone(original);identityOnly.bundle.discoveryAfter[0].rows[0].sourceRowIdentity='different-only';
 await assert.rejects(validateSelectedSourceOnce(identityOnly,selectedConfig,request),/catalog_changed_or_over_limit/);
 const missing=structuredClone(original);missing.bundle.discoveryAfter[0].rows.pop();
 await assert.rejects(validateSelectedSourceOnce(missing,selectedConfig,request),/selected_source_paging_invalid/);
 const account=structuredClone(original);account.sourceFingerprint='0'.repeat(64);
 await assert.rejects(validateSelectedSourceOnce(account,selectedConfig,request),/selected_source_scope_mismatch/);
});
test('contradictory or incomplete transport evidence cannot authorize a content retry',async()=>{
 const raw=structuredClone(original);raw.bundle.discoveryAfter[0].rows[0].values.Status='updated';
 const requests=Array.from({length:raw.metrics.httpAttempts},(_,i)=>i===0
  ? {kind:'login',reportId:null,page:null,elapsedMs:1,outcome:'complete',httpStatus:200}
  : {kind:'report',reportId:6086103,page:1,elapsedMs:2,outcome:'complete',httpStatus:200});
 for(const trace of [requests.slice(1),requests.map((r,i)=>i===1?{...r,outcome:'auth_error'}:r)]){
  await assert.rejects(validateCatalogDiagnostic({schemaVersion:'ainuoke-request-diagnostics.v1',capture:raw,requests:trace},selectedConfig,request,Date.now()),/sync_diagnostics_invalid/);
 }
});

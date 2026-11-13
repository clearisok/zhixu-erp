import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedConfig, selectedWorkerFixture } from '../integration/selected-source-fixture.js';
import { validateSelectedSourceOnce } from './selected-source-once.js';
import { validateCatalogDiagnostic, retryableCapture, validateRequestDiagnostics } from './sync-diagnostics.js';
import type { AdditionDiscoveryBundle } from './additions.js';

const request={mode:'catalog-discovery' as const,contracts:[] as []};
const original=selectedWorkerFixture('catalog-discovery','',[]) as {bundle:AdditionDiscoveryBundle;metrics:{httpAttempts:number};sourceFingerprint:string};

test('complete directory growth is rejected for bounded recapture with a safe difference receipt',async()=>{
 const extra=selectedWorkerFixture('catalog-discovery','',[],4) as typeof original;
 const growth=structuredClone(original);growth.bundle.discoveryAfter=extra.bundle.discoveryAfter;
 await assert.rejects(validateSelectedSourceOnce(growth,selectedConfig,request),{message:'catalog_additions_observed'});
 assert.equal(retryableCapture('catalog_additions_observed',null),true);
 const requests=Array.from({length:growth.metrics.httpAttempts},(_,i)=>i===0
  ?{kind:'login',reportId:null,page:null,elapsedMs:1,outcome:'complete',httpStatus:200}
  :{kind:'report',reportId:6086103,page:1,elapsedMs:1,outcome:'complete',httpStatus:200});
 await assert.rejects(validateCatalogDiagnostic({schemaVersion:'ainuoke-request-diagnostics.v1',capture:growth,requests},selectedConfig,request,Date.now()),error=>{
  assert.equal((error as Error).message,'catalog_additions_observed');
  assert.deepEqual((error as {catalogChange:unknown}).catalogChange,{beforeRows:3,afterRows:4,added:1,removed:0,identityChanges:0,changedFields:[],scopeChanged:false});return true;
 });
 for(const [field,value] of Object.entries({BillNo:'REUSED-IDENTITY',InsideOrderNo:'CHANGED',UnknownField:'changed'})){
  const unsafe=structuredClone(growth);unsafe.bundle.discoveryAfter[0].rows[0].values[field]=value;
  await assert.rejects(validateSelectedSourceOnce(unsafe,selectedConfig,request),error=>{assert.ok(error instanceof Error);assert.notEqual(error.message,'catalog_additions_observed');assert.equal(retryableCapture(error.message,null),false);return true;});
 }
 const missing=structuredClone(extra);missing.bundle.discoveryAfter=original.bundle.discoveryAfter;
 await assert.rejects(validateSelectedSourceOnce(missing,selectedConfig,request),error=>{assert.ok(error instanceof Error);assert.equal(retryableCapture(error.message,null),false);return true;});
 const metadata=structuredClone(growth);
 Object.assign(metadata.bundle.discoveryAfter[0].rows.at(-1)!,{unrecognizedMetadata:'changed'});
 await assert.rejects(validateSelectedSourceOnce(metadata,selectedConfig,request),{message:'catalog_identity_or_scope_changed'});
 const contradiction=requests.map((r,i)=>i===1?{...r,outcome:'auth_error'}:r);
 await assert.rejects(validateCatalogDiagnostic({schemaVersion:'ainuoke-request-diagnostics.v1',capture:growth,requests:contradiction},selectedConfig,request,Date.now()),{message:'sync_diagnostics_invalid'});
});
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
 await assert.rejects(validateSelectedSourceOnce(identityOnly,selectedConfig,request),/catalog_identity_or_scope_changed/);
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


test('directory supports 1400 while details and diagnostic limits remain bounded',async()=>{
 const raw=selectedWorkerFixture('catalog-discovery','',[],1400);
 const result=await validateSelectedSourceOnce(raw,selectedConfig,request);
 assert.equal(result.result,'complete');
 if(result.result==='complete'&&result.mode==='catalog-discovery')assert.equal(result.preview.rows.length,1400);
 const detail=selectedWorkerFixture('catalog-contracts','',['SYN-SALES-1'],1400);
 assert.equal((await validateSelectedSourceOnce(detail,selectedConfig,{mode:'catalog-contracts',contracts:['SYN-SALES-1']})).result,'complete');
 const diagnostic={kind:'report',reportId:6086103,page:28,elapsedMs:1,outcome:'complete',httpStatus:200};
 assert.equal(validateRequestDiagnostics([diagnostic]).length,1);
 assert.throws(()=>validateRequestDiagnostics([{...diagnostic,page:29}]),/sync_diagnostics_invalid/);
 assert.throws(()=>validateRequestDiagnostics([{...diagnostic,reportId:6087050,page:21}]),/sync_diagnostics_invalid/);
});

test('upstream image changes disappear before evidence creation without hiding identity changes',async()=>{
 const mutation=`if report == 6086103:
        change.pass_number=getattr(change,'pass_number',0)+1
        mutate_rows(payload, lambda rows: rows[0].update(ImageFile='first.png' if change.pass_number==1 else 'second.png'))`;
 const raw=selectedWorkerFixture('catalog-discovery',mutation,[]) as typeof original;
 assert.equal((await validateSelectedSourceOnce(raw,selectedConfig,request)).result,'complete');
 assert.equal('ImageFile' in raw.bundle.discoveryBefore[0].rows[0].values,false);
 const changed=structuredClone(raw);changed.bundle.discoveryAfter[0].rows[0].values.InsideOrderNo='CHANGED-FACTORY';
 await assert.rejects(validateSelectedSourceOnce(changed,selectedConfig,request),/catalog_identity_or_scope_changed/);
 const unknown=structuredClone(raw);unknown.bundle.discoveryAfter[0].rows[0].values.UnknownField='changed';
 await assert.rejects(validateSelectedSourceOnce(unknown,selectedConfig,request),/catalog_identity_or_scope_changed/);
});

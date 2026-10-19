import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startContinuousFixture} from './ainuoke-continuous-fixture.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createAinuokeSalesOrder} from '../sales-orders/service.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';

test('seven trusted roles preserve commercial adoption and read boundaries',{timeout:180000},async t=>{
 const x=await startContinuousFixture(resolve('dist/client'));t.after(()=>x.close());
 const q=createSyntheticQuoteFixture('seven-role-commercial');for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
 const r=q.revisions.find(r=>r.revisionId===q.defaultRevisionId)!,pv=r.priceVersions[0];pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:12345.67,confirmedLaborPrice:765.43,note:'synthetic',confirmedAt:'2026-10-14T00:00:00Z'};
 await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(q));const source={kind:'quote',quoteId:q.id,revisionId:r.revisionId,priceVersionId:pv.id};
 const call=async(user:string,path:string,body?:object,method=body?'POST':'GET')=>{const response=await fetch(x.base+path,{method,headers:{Cookie:await x.login(user),Origin:x.base,'X-Zhixu-Request':'1','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const path='/api/v1/sales-orders/'+x.orderId+'/business-source';
 // Orders have no owner prerequisite; fresh role permissions authorize source maintenance.
 const preview=await call('demo.merchandising',path+'/preview',source);assert.equal(preview.status,200);
 const cmd={selection:source,requestId:randomUUID(),expectedVersion:0,fingerprint:preview.body.fingerprint,reason:'sale 12345.67 labor 765.43'};
 assert.equal((await call('demo.merchandising',path,cmd)).status,200);
 const actor=await loadExistingBootstrapActor(x.pool,'demo.admin');let freshOrderNumber=0;
 const freshOrder=async()=>{const i=++freshOrderNumber;return(await createAinuokeSalesOrder(x.pool,actor,{source:{sourceId:'ROLE-SOURCE-'+i,sourceRowIdentity:'ROLE-ROW-'+i,salesContractNo:'SYN-ROLE-'+i,insideOrderNo:'IN-ROLE-'+i,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYN-ROLE',companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:100,sourceHash:'ROLE-HASH-'+i,fetchedAt:'2026-10-17T00:00:00Z'},colors:[]})).salesOrder.id;};
 const expectations=[['demo.admin',true,true,true,true],['demo.manager',true,true,false,true],['demo.quote',true,true,true,false],['demo.material',false,false,false,false],['demo.production',false,true,false,false],['demo.finance',true,true,false,true],['demo.merchandising',true,true,true,false]] as const;
 for(const [user,sale,labor,adopt,audit] of expectations)await t.test(user,async()=>{
  const read=await call(user,path);assert.equal(read.status,200);assert.equal(read.body.commercial.current.sale.visibility,sale?'allowed':'restricted');assert.equal(read.body.commercial.current.labor.visibility,labor?'allowed':'restricted');
  const serialized=JSON.stringify(read.body);if(!sale)assert.equal(serialized.includes('12345.67'),false);if(!labor)assert.equal(serialized.includes('765.43'),false);
  // Existing terms are read-only here, including for users who may adopt a new order.
  const existingPreview=await call(user,path+'/preview',source);assert.equal(existingPreview.status,adopt?409:403);if(adopt)assert.equal(existingPreview.body.error.code,'source_change_requires_quote_center');
  const next={...cmd,requestId:randomUUID(),expectedVersion:0},existingWrite=await call(user,path,next);assert.equal(existingWrite.status,adopt?409:403);if(adopt)assert.equal(existingWrite.body.error.code,'source_change_requires_quote_center');
  assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions WHERE sales_order_id=$1',[x.orderId])).rows[0].n,1);
  // Exercise each role's legitimate first-adoption command against a fresh trusted contract.
  const freshId=await freshOrder(),freshPath='/api/v1/sales-orders/'+freshId+'/business-source',freshPreview=await call('demo.admin',freshPath+'/preview',source);assert.equal(freshPreview.status,200);
  assert.equal((await call(user,freshPath+'/preview',source)).status,adopt?200:403);
  const first={selection:source,requestId:randomUUID(),expectedVersion:0,fingerprint:freshPreview.body.fingerprint,reason:'Synthetic seven-role first adoption'};assert.equal((await call(user,freshPath,first)).status,adopt?200:403);
  assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions WHERE sales_order_id=$1',[freshId])).rows[0].n,adopt?1:0);
  assert.equal((await call(user,'/api/v1/order-commercial-cutover-preview',{salesOrderIds:[x.orderId]})).status,audit?200:403);
  const old=await call(user,'/api/v1/sales-orders/'+x.orderId+'/confirmed-commercial-terms',{expectedVersion:0,customerConfirmedPrice:'999'},'PATCH');assert.ok([403,409].includes(old.status));
 });
 assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions')).rows[0].n,4);
 assert.deepEqual(x.errors,[]);
});

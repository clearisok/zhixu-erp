import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startContinuousFixture} from './ainuoke-continuous-fixture.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';

test('seven trusted roles preserve commercial adoption and read boundaries',{timeout:180000},async t=>{
 const x=await startContinuousFixture(resolve('dist/client'));t.after(()=>x.close());
 const q=createSyntheticQuoteFixture('seven-role-commercial');for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
 const r=q.revisions.find(r=>r.revisionId===q.defaultRevisionId)!,pv=r.priceVersions[0];pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:12345.67,confirmedLaborPrice:765.43,note:'synthetic',confirmedAt:'2026-10-14T00:00:00Z'};
 await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(q));const source={quoteId:q.id,revisionId:r.revisionId,priceVersionId:pv.id};
 const call=async(user:string,path:string,body?:object,method=body?'POST':'GET')=>{const response=await fetch(x.base+path,{method,headers:{Cookie:await x.login(user),Origin:x.base,'X-Zhixu-Request':'1','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const path='/api/v1/sales-orders/'+x.orderId+'/commercial-versions';
 assert.equal((await call('demo.merchandising','/api/v1/sales-orders/'+x.orderId+'/identity',{action:'claim',expectedVersion:0},'PATCH')).status,200);
 const preview=await call('demo.merchandising',path+'/preview',source);assert.equal(preview.status,200);
 const cmd={...source,requestId:randomUUID(),expectedVersion:0,sourceFingerprint:preview.body.candidate.fingerprint,reason:'sale 12345.67 labor 765.43'};
 assert.equal((await call('demo.merchandising',path,cmd)).status,200);
 const expectations=[['demo.admin',true,true,true,true],['demo.manager',true,true,false,true],['demo.quote',true,true,false,false],['demo.material',false,false,false,false],['demo.production',false,true,false,false],['demo.finance',true,true,false,true],['demo.merchandising',true,true,true,false]] as const;
 for(const [user,sale,labor,adopt,audit] of expectations)await t.test(user,async()=>{
  const read=await call(user,path);assert.equal(read.status,200);assert.equal(read.body.current.sale.visibility,sale?'allowed':'restricted');assert.equal(read.body.current.labor.visibility,labor?'allowed':'restricted');
  const serialized=JSON.stringify(read.body);if(!sale)assert.equal(serialized.includes('12345.67'),false);if(!labor)assert.equal(serialized.includes('765.43'),false);
  assert.equal((await call(user,path+'/preview',source)).status,adopt?200:403);
  const next={...cmd,requestId:randomUUID(),expectedVersion:read.body.version};assert.equal((await call(user,path,next)).status,adopt?200:403);
  assert.equal((await call(user,'/api/v1/order-commercial-cutover-preview',{salesOrderIds:[x.orderId]})).status,audit?200:403);
  const old=await call(user,'/api/v1/sales-orders/'+x.orderId+'/confirmed-commercial-terms',{expectedVersion:0,customerConfirmedPrice:'999'},'PATCH');assert.ok([403,409].includes(old.status));
 });
 assert.equal((await x.pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions')).rows[0].n,3);
 assert.deepEqual(x.errors,[]);
});

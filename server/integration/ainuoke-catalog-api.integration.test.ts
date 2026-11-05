import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';

test('catalogue HTTP authentication, source permissions, CSRF and replay boundaries',{timeout:180000},async t=>{
 const x=await startCatalogFixture();try{
  const admin=await x.login(x.admin),reader=await x.login(x.reader),path='/api/v1/ainuoke/catalog';
  const request=(url:string,cookie=admin,body?:unknown,origin=x.base)=>fetch(x.base+url,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-Zhixu-Request':'1',Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
  await t.test('read-only requests do not collect and never return raw evidence or prices',async()=>{
   assert.equal((await request(path,'')).status,401);const calls=x.captures();
   const response=await request(path,reader);assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,3);
   assert.equal((await request(path+'?search=SYN%20SALES',reader)).status,200);
   assert.equal((await request(path+'?search=nope&search=again',reader)).status,400);
   assert.equal((await request(path+'?limit=10000',reader)).status,400);
   const detail=await request(path+'/detail?'+new URLSearchParams({sourceKey:x.sourceKey,sourceId:data.rows[0].sourceId}),reader);
   assert.equal(detail.status,200);assert.doesNotMatch(await detail.text(),/unitPrice|sourcePricing|"evidence"|password|jwtToken/);assert.equal(x.captures(),calls);
  });
  await t.test('manual POST is current-contract only, CSRF protected and idempotent before upstream work',async()=>{
   const row=(await(await request(path)).json()).rows[0],input={sourceKey:x.sourceKey,sourceId:row.sourceId,requestId:randomUUID()},calls=x.captures();
   assert.equal((await request(path+'/sync',reader,input)).status,403);
   assert.equal((await request(path+'/sync',admin,input,'https://evil.invalid')).status,403);
   assert.equal((await request(path+'/sync',admin,{...input,reportId:6086941})).status,400);
   const first=await request(path+'/sync',admin,input);assert.equal(first.status,202);const accepted=await first.json();
   const replay=await(await request(path+'/sync',admin,input)).json();assert.equal(replay.jobId,accepted.jobId);assert.equal(replay.replayed,true);assert.equal(x.captures(),calls);
   const hidden=await(await request(path+'/sync/'+input.requestId,reader)).json();assert.equal(hidden.status,'not_found');
   const tick=await x.tick();assert.equal(tick.jobs.length,1);assert.equal(tick.jobs[0].status,'complete');
   const done=await(await request(path+'/sync/'+input.requestId)).json();assert.equal(done.status,'complete');assert.equal(x.captures(),calls+1);
   assert.equal((await request(path+'/sync-order',reader,{orderId:x.orderIds[0],requestId:randomUUID()})).status,403);
  });
  await t.test('malformed receipt and intake identifiers are client errors without writes',async()=>{
   const row=(await(await request(path)).json()).rows[0],calls=x.captures();
   const before=(await x.pool.query('SELECT count(*) n FROM ainuoke_catalog_intake_receipts')).rows[0].n;
   for(const id of ['-'.repeat(36),'f'.repeat(36)]){
    for(const kind of ['intake','receipts','sync'])assert.equal((await request(path+'/'+kind+'/'+id)).status,400);
    const input={sourceKey:x.sourceKey,sourceId:row.sourceId,requestId:randomUUID(),observationId:randomUUID(),expectedPreview:'0'.repeat(64)};
    assert.equal((await request(path+'/intake',admin,{...input,requestId:id})).status,400);
    assert.equal((await request(path+'/intake',admin,{...input,observationId:id})).status,400);
   }
   assert.equal((await x.pool.query('SELECT count(*) n FROM ainuoke_catalog_intake_receipts')).rows[0].n,before);
   assert.equal(x.captures(),calls);
  });
  assert.deepEqual(x.errors,[]);
 }finally{await x.close();}
});

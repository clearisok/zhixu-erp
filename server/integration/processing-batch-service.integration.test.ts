import {mutateOrderIdentity,readOrderIdentity} from '../sales-orders/identity-service.js';
import {createServer} from 'node:http';
import {createApp} from '../app.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import type {TrustedIdentity} from '../auth/session.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {listProcessingBatches,parseProcessingBatchQuery,createProcessingBatch,previewProcessingBatch,confirmProcessingBatch,cancelProcessingBatch,consumeProcessingBatches} from '../sales-orders/processing-batch-service.js';

test('processing service atomic synthetic lifecycle',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('processing_service')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
 await pool.query("INSERT INTO app_roles(id,name) VALUES('batch-test','Synthetic')");await pool.query("INSERT INTO app_role_permissions SELECT 'batch-test',key FROM app_permissions");
 const user=async(name:string)=>{
  const u=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic',gen_salt('bf',4)),'Synthetic','viewer') RETURNING id::text,public_id::text",[name])).rows[0];await pool.query("INSERT INTO app_user_roles VALUES($1,'batch-test')",[u.id]);return {internalUserId:u.id,userId:u.public_id,username:name,userName:'Synthetic',permissions:[]} as TrustedIdentity;
 };
 const actor=await user('batch-actor'),other=await user('batch-other');
 const q=createSyntheticQuoteFixture('batch-synthetic','processing');for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
 const r=q.revisions.find(x=>x.revisionId===q.defaultRevisionId)!,pv=r.priceVersions[0];pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:99,quotedLaborPrice:99,confirmedGarmentPrice:null,confirmedLaborPrice:0,note:'synthetic',confirmedAt:'2026-10-14T00:00:00Z'};
 await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(q));
 const draft=()=>({requestId:randomUUID(),quoteId:q.id,revisionId:r.revisionId,priceVersionId:pv.id,customerName:'Synthetic',businessStyleNo:'SYN',quantity:'10',orderDate:'2026-10-14',deliveryDate:null,customerReference:'same-po',deliveryRequirements:'',referenceOrderId:null});
 const confirmed=async()=>{const b=await createProcessingBatch(pool,actor,draft());const p=await previewProcessingBatch(pool,actor,b.batchId);return confirmProcessingBatch(pool,actor,b.batchId,{requestId:randomUUID(),expectedVersion:b.version,sourceFingerprint:p.candidate.fingerprint});};
 const count=async()=>(await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n as number;
 const consume=(batchId:string,expectedVersion:number,a=actor,requestId=randomUUID())=>consumeProcessingBatches(pool,a,{requestId,items:[{batchId,expectedVersion}]});
 await t.test('create retry returns original batch, while another real order using same quote is distinct',async()=>{
  const command=draft(),a=await createProcessingBatch(pool,actor,command),b=await createProcessingBatch(pool,actor,command);assert.deepEqual(a,b);assert.equal(await count(),0);
  await assert.rejects(()=>createProcessingBatch(pool,actor,{...command,quantity:'20'}));assert.notEqual((await createProcessingBatch(pool,actor,draft())).batchId,a.batchId);
 });
 await t.test('two users racing consumption produce one SO and one immutable zero labor snapshot',async()=>{
  const b=await confirmed(),before=await count();const results=await Promise.all([consume(b.batchId,b.version!,actor),consume(b.batchId,b.version!,other)]);
  assert.equal(await count(),before+1);const ids=results.map(x=>('salesOrderId' in x.results[0])?x.results[0].salesOrderId:null);assert.ok(ids[0]);assert.equal(ids[0],ids[1]);
  const commercial=(await pool.query('SELECT confirmed_labor_price::text,confirmed_sale_price FROM sales_order_commercial_versions WHERE sales_order_id=$1',[ids[0]])).rows[0];assert.equal(commercial.confirmed_labor_price,'0');assert.equal(commercial.confirmed_sale_price,null);
 });
 await t.test('two real batches on same quote create two different SO, batch retry returns same response',async()=>{
  const a=await confirmed(),b=await confirmed(),requestId=randomUUID(),before=await count();const command={requestId,items:[{batchId:a.batchId,expectedVersion:a.version},{batchId:b.batchId,expectedVersion:b.version}]};const first=await consumeProcessingBatches(pool,actor,command);assert.deepEqual(await consumeProcessingBatches(pool,actor,command),first);assert.equal(await count(),before+2);assert.notEqual((first.results[0] as {salesOrderId:string}).salesOrderId,(first.results[1] as {salesOrderId:string}).salesOrderId);
 });
 await t.test('cancelled item fails but another confirmed batch succeeds',async()=>{
  const a=await confirmed(),b=await confirmed();await cancelProcessingBatch(pool,actor,a.batchId,{requestId:randomUUID(),expectedVersion:a.version,reason:'Synthetic cancellation'});
  const result=await consumeProcessingBatches(pool,actor,{requestId:randomUUID(),items:[{batchId:a.batchId,expectedVersion:a.version},{batchId:b.batchId,expectedVersion:b.version}]});assert.equal(result.results[0].status,'failed');assert.equal(result.results[1].status,'created');
 });
 await t.test('failed late audit rolls back SO, profile, commercial version and consumption',async()=>{
  const b=await confirmed(),before=await count();
  await pool.query("CREATE FUNCTION fail_processing_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='创建加工订单' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$");
  await pool.query('CREATE TRIGGER synthetic_fail_processing_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION fail_processing_audit()');
  try{const result=await consume(b.batchId,b.version!);assert.deepEqual(result.results[0],{batchId:b.batchId,status:'failed',code:'processing_item_failed'});}finally{await pool.query('DROP TRIGGER synthetic_fail_processing_audit ON operation_logs');}
  assert.equal(await count(),before);assert.equal((await pool.query('SELECT state FROM processing_order_batches WHERE id=$1',[b.batchId])).rows[0].state,'confirmed');assert.equal((await pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions WHERE batch_id=$1',[b.batchId])).rows[0].n,0);
  assert.equal((await consume(b.batchId,b.version!)).results[0].status,'created');
 });
 await t.test('confirmation source change blocks consumption until explicitly reconfirmed',async()=>{
  const b=await confirmed();await pool.query('UPDATE quote_center_quotes SET version=version+1 WHERE id=$1',[q.id]);assert.equal((await consume(b.batchId,b.version!)).results[0].status,'failed');
  const p=await previewProcessingBatch(pool,actor,b.batchId);const next=await confirmProcessingBatch(pool,actor,b.batchId,{requestId:randomUUID(),expectedVersion:b.version,sourceFingerprint:p.candidate.fingerprint});assert.equal((await consume(b.batchId,next.version!)).results[0].status,'created');
 });
 await t.test('candidate search defaults to eligible unprocessed batches and can show history',async()=>{
  const a=await confirmed(),b=await confirmed();await consume(b.batchId,b.version!);
  const query=parseProcessingBatchQuery(new URLSearchParams({search:a.batchId}));const available=await listProcessingBatches(pool,actor,query);assert.equal(available.items.length,1);assert.equal(available.items[0].eligible,true);
  assert.equal((await listProcessingBatches(pool,actor,parseProcessingBatchQuery(new URLSearchParams({search:b.batchId})))).items.length,0);
  const processed=await listProcessingBatches(pool,actor,parseProcessingBatchQuery(new URLSearchParams({search:b.batchId,includeProcessed:'true'})));assert.equal(processed.items[0].batch.state,'consumed');assert.ok(processed.items[0].salesOrderId);
  for(const value of ['offset=-1','offset=100001','search=x&search=y','salePrice=2','includeProcessed=yes'])assert.throws(()=>parseProcessingBatchQuery(new URLSearchParams(value)));
 });
 await t.test('HTTP session and mutation boundary protect both batch entrypoints',async()=>{
  const origin='http://processing-test.invalid',server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port,path='/api/v1/processing-order-batches';
  try{
   const headers={Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'};
   assert.equal((await fetch(base+path)).status,401);
   const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username:'batch-actor',password:'synthetic'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
   const req=(url:string,method='GET',body?:object,extra:Record<string,string>={})=>fetch(base+url,{method,headers:{...headers,Cookie:cookie,...extra},...(body?{body:JSON.stringify(body)}:{})});
   assert.equal((await req(path+'?ownerId=forged')).status,400);
   assert.equal((await req(path,'POST',draft(),{Origin:'http://evil.invalid'})).status,403);
   assert.equal((await req(path,'POST',{...draft(),salePrice:'99'})).status,400);
   const created=await req(path,'POST',draft());assert.equal(created.status,200);assert.equal(created.headers.get('cache-control'),'no-store');const b=await created.json();
   const preview=await req(path+'/'+b.batchId+'/preview','POST',{});assert.equal(preview.status,200);const candidate=(await preview.json()).candidate;assert.equal(candidate.salePrice,null);assert.equal(candidate.laborPrice,'0');assert.equal(candidate.fabrics,undefined);
   assert.equal((await req(path+'/'+b.batchId+'/preview','POST',{quantity:'99'})).status,400);
   const confirmedResponse=await req(path+'/'+b.batchId+'/confirm','POST',{requestId:randomUUID(),expectedVersion:b.version,sourceFingerprint:candidate.fingerprint});assert.equal(confirmedResponse.status,200);const ready=await confirmedResponse.json();
   const consumed=await req(path+'/consume','POST',{requestId:randomUUID(),items:[{batchId:b.batchId,expectedVersion:ready.version}]});assert.equal(consumed.status,200);assert.equal((await consumed.json()).results[0].status,'created');
   await pool.query("DELETE FROM app_role_permissions WHERE role_id='batch-test' AND permission_key='commercial.labor.view'");
   try{assert.equal((await req(path)).status,403);assert.equal((await req(path+'/'+b.batchId+'/preview','POST',{})).status,403);}finally{await pool.query("INSERT INTO app_role_permissions VALUES('batch-test','commercial.labor.view')");}
  }finally{await new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()));}
 });
 await t.test('processing SO can be claimed through verified consumption without inventing Ainuoke source',async()=>{
  const b=await confirmed(),result=await consume(b.batchId,b.version!),row=result.results[0];assert.ok('salesOrderId' in row&&row.salesOrderId);
  const id=row.salesOrderId,initial=await readOrderIdentity(pool,id);assert.equal(initial.ownerId,null);assert.equal(initial.businessType,'processing');
  const claimed=await mutateOrderIdentity(pool,actor,id,{action:'claim',expectedVersion:initial.version});assert.equal(claimed.ownerId,actor.userId);assert.equal(claimed.businessType,'processing');
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_source_links WHERE sales_order_id=$1',[id])).rows[0].n,0);
 });
 await t.test('fresh database revocation cannot be bypassed through replay',async()=>{
  const b=await confirmed(),requestId=randomUUID();await consume(b.batchId,b.version!,actor,requestId);await pool.query("DELETE FROM app_role_permissions WHERE role_id='batch-test' AND permission_key='order.processing.consume'");assert.equal((await consume(b.batchId,b.version!,actor,requestId)).results[0].status,'failed');
 });
});

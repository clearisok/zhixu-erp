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
import {createProcessingBatch,previewProcessingBatch,confirmProcessingBatch,cancelProcessingBatch,consumeProcessingBatches} from '../sales-orders/processing-batch-service.js';

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
 await t.test('fresh database revocation cannot be bypassed through replay',async()=>{
  const b=await confirmed(),requestId=randomUUID();await consume(b.batchId,b.version!,actor,requestId);await pool.query("DELETE FROM app_role_permissions WHERE role_id='batch-test' AND permission_key='order.processing.consume'");assert.equal((await consume(b.batchId,b.version!,actor,requestId)).results[0].status,'failed');
 });
});

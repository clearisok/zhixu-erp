import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import pg from 'pg';
import type {PoolClient} from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {createSalesOrder,getSalesOrderById,listSalesOrders,getSalesOrderBySourceIdentity,getSalesOrderBySalesContractNo,updateSalesOrderLifecycle,upsertCurrentAinuokeContractMirror} from '../sales-orders/repository.js';
import {createAinuokeSalesOrder,type CreateAinuokeSalesOrderInput} from '../sales-orders/service.js';
import {readOrderIdentity,mutateOrderIdentity} from '../sales-orders/identity-service.js';
import {readDeliveryPlanSet} from '../sales-orders/delivery-plan-repository.js';
import {updateDeliveryPlans} from '../sales-orders/delivery-plan-service.js';
import {writeAttributionHeadInTransaction,resolveEffectiveOrder} from '../sales-orders/effective-attribution.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {previewOrderCommercial,adoptOrderCommercial,readOrderCommercialState} from '../sales-orders/commercial-version-service.js';
import {createApp} from '../app.js';

const errorCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;

test('effective identities are consistent across current reads and original history',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('attribution_consumers')});
 t.after(async()=>{await pool.end();await db.stop();});
 await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
 await bootstrapAdmin(pool,{username:'synthetic-effective-admin',displayName:'Synthetic',password:'Synthetic-2026'});
 const actor=await loadExistingBootstrapActor(pool,'synthetic-effective-admin');
 const input:CreateAinuokeSalesOrderInput={source:{sourceId:'synthetic-current-contract',sourceRowIdentity:'synthetic-source-row',salesContractNo:'SYN-CONTRACT-ONLY',insideOrderNo:'SYN-FACTORY-ONLY',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYN-BUSINESS-ONLY',companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:100,sourceHash:'synthetic-hash',fetchedAt:'2026-10-15T00:00:00Z'},colors:[{sourceLineIdentity:'synthetic-blue',colorName:'Synthetic blue',quantity:100,deliveryDate:'2026-12-01',sourceHash:'synthetic-color'}]};
 const original=(await createAinuokeSalesOrder(pool,actor,input)).salesOrder.id;
 const quote=createSyntheticQuoteFixture('synthetic-effective-quote','distribution');
 for(const revision of quote.revisions){revision.imageAttachmentIds=[];revision.fileAttachmentIds=[];revision.styleImageAttachmentId=null;}
 const revision=quote.revisions.find(row=>row.revisionId===quote.defaultRevisionId)!;const price=revision.priceVersions[0];
 price.pricingParameters.laborCurrency='CNY';price.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:120,confirmedLaborPrice:10,note:'synthetic',confirmedAt:'2026-10-15T00:00:00Z'};
 await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(quote));
 const provenance={quoteId:quote.id,revisionId:revision.revisionId,priceVersionId:price.id};
 const primary=(await createSalesOrder(pool,{creationSource:'quote',sourceQuoteId:quote.id,sourceRevisionId:revision.revisionId,sourcePriceVersionId:price.id})).id;
 await mutateOrderIdentity(pool,actor,original,{action:'claim',expectedVersion:0});
 const preview=await previewOrderCommercial(pool,actor,original,provenance);
 const oldCommand={...provenance,requestId:randomUUID(),expectedVersion:0,sourceFingerprint:preview.candidate.fingerprint,reason:'synthetic original adoption'};
 const oldAdoption=await adoptOrderCommercial(pool,actor,original,oldCommand);
 await updateDeliveryPlans(pool,actor,primary,{expectedVersion:0,upserts:[{id:null,deliveryDate:'2026-12-10',quantity:'80'}],voidIds:[]});
 const beforeOrders=(await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows;
 const beforeLinks=(await pool.query('SELECT row_to_json(l) AS row FROM sales_order_source_links l ORDER BY id')).rows;
 const oldPlans=(await pool.query('SELECT row_to_json(p) AS row FROM sales_order_delivery_plans p WHERE sales_order_id=$1 ORDER BY id',[original])).rows;
 const pair=[original,primary].sort();
 const caseId=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor.internalUserId,randomUUID(),'a'.repeat(64)])).rows[0].id;
 await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic consumer fixture','{}')",[caseId,actor.internalUserId,randomUUID(),'b'.repeat(64)]);
 // Internal synthetic fixture only. This deliberately is not a public authorized execution service.
 const map=async(target:string|null,transaction?:PoolClient)=>{
  const client=transaction??await pool.connect();try{
   if(!transaction)await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
   const existing=Boolean((await client.query('SELECT 1 FROM sales_order_attribution_heads LIMIT 1')).rowCount);
   const change=(await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,$2,$3,$4,$5,$5,'{}','synthetic fixture only') RETURNING id",[caseId,existing?'correct':'normalize',actor.internalUserId,randomUUID(),'c'.repeat(64)])).rows[0].id;
   for(const id of pair){const prior=(await client.query('SELECT current_change_id,version FROM sales_order_attribution_heads WHERE sales_order_id=$1',[id])).rows[0];await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,$4,$5)',[change,id,target??id,prior?.current_change_id??null,prior?.version??0]);}
   for(const id of pair)await writeAttributionHeadInTransaction(client,change,id);
   if(!transaction)await client.query('COMMIT');return change as string;
  }catch(error){if(!transaction)await client.query('ROLLBACK');throw error;}finally{if(!transaction)client.release();}
 };
 const change=await map(primary);
 await t.test('ordinary list counts only active roots; history preserves both original identities',async()=>{
  const current=await listSalesOrders(pool,{limit:20,offset:0});assert.equal(current.total,1);assert.equal(current.items[0].id,primary);
  assert.equal(current.items[0].creationSource,'quote');assert.equal(current.items[0].businessType,'ainuoke_contract');assert.equal(current.items[0].quantity,100);
  assert.equal(current.items[0].sourceOwnerOrderId,original);assert.equal(current.items[0].attribution?.attributionChangeId,change);
  const history=await listSalesOrders(pool,{limit:20,offset:0,includeHistorical:true});assert.equal(history.total,2);assert.equal(history.items.find(o=>o.id===original)?.attribution?.historicalDuplicate,true);
  const search=await listSalesOrders(pool,{limit:20,offset:0,search:input.source.insideOrderNo});assert.equal(search.total,1);assert.equal(search.items[0].id,primary);
 });
 await t.test('detail projects trusted contract on effective root but original detail never redirects UUID',async()=>{
  const current=await getSalesOrderById(pool,primary),history=await getSalesOrderById(pool,original);
  assert.equal(current?.salesContractNo,input.source.salesContractNo);assert.equal(current?.insideOrderNo,input.source.insideOrderNo);assert.deepEqual(current?.colors,history?.colors);
  assert.equal(history?.id,original);assert.equal(history?.creationSource,'ainuoke');assert.equal(history?.attribution?.effectiveOrderId,primary);assert.equal(history?.quantity,100);
  assert.deepEqual((await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,beforeOrders);
  assert.deepEqual((await pool.query('SELECT row_to_json(l) AS row FROM sales_order_source_links l ORDER BY id')).rows,beforeLinks);
 });
 await t.test('contract lookup and repeated intake return current effective SO without rebinding',async()=>{
  assert.equal((await getSalesOrderBySourceIdentity(pool,'ainuoke','sales_contract',input.source.sourceId))?.id,primary);
  assert.equal((await getSalesOrderBySalesContractNo(pool,input.source.salesContractNo))?.id,primary);
  const retry=await createAinuokeSalesOrder(pool,actor,input);assert.equal(retry.created,false);assert.equal(retry.salesOrder.id,primary);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM sales_orders')).rows[0].n,2);
 });
 await t.test('current identity derives contract through reviewed attribution; claims preserve creation history',async()=>{
  assert.equal((await readOrderIdentity(pool,primary)).businessType,'ainuoke_contract');
  await mutateOrderIdentity(pool,actor,primary,{action:'claim',expectedVersion:0});
  assert.equal((await readOrderIdentity(pool,primary)).ownerId,actor.userId);
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,original,{action:'transfer',expectedVersion:2,ownerId:actor.userId,reason:'synthetic'}),errorCode('historical_duplicate_order_read_only'));
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,primary,{action:'lineage',expectedVersion:2,lineage:'reorder',referenceOrderId:original,specificationChanges:''}),errorCode('lineage_cycle'));
  assert.deepEqual((await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,beforeOrders);
 });
 await t.test('commercial history is never inherited or summed; alias blocks new adoption but exact old retry is historical',async()=>{
  assert.equal((await readOrderCommercialState(pool,primary)).current,null);
  assert.equal((await readOrderCommercialState(pool,original)).current?.id,oldAdoption.adopted.id);
  assert.equal((await adoptOrderCommercial(pool,actor,original,oldCommand)).adopted.id,oldAdoption.adopted.id);
  await assert.rejects(()=>previewOrderCommercial(pool,actor,original,provenance),errorCode('historical_duplicate_order_read_only'));
  await assert.rejects(()=>adoptOrderCommercial(pool,actor,original,{...oldCommand,requestId:randomUUID()}),errorCode('historical_duplicate_order_read_only'));
  const p=await previewOrderCommercial(pool,actor,primary,provenance);
  const result=await adoptOrderCommercial(pool,actor,primary,{...provenance,requestId:randomUUID(),expectedVersion:0,sourceFingerprint:p.candidate.fingerprint,reason:'explicit new root adoption'});
  assert.notEqual(result.adopted.id,oldAdoption.adopted.id);assert.equal(result.adopted.salePrice,'120');
  assert.equal((await readOrderCommercialState(pool,original)).version,1);
 });
 await t.test('delivery plans remain owned by original SO; current source comparison uses trusted contract only',async()=>{
  const current=await readDeliveryPlanSet(pool,primary);assert.equal(current.sourceQuantity,'100');assert.equal(current.plans.length,1);assert.equal(current.plans[0].quantity,'80');assert.equal(current.reconciliation.quantityStatus,'short');
  await assert.rejects(()=>updateDeliveryPlans(pool,actor,original,{expectedVersion:1,upserts:[{id:null,deliveryDate:'2026-12-20',quantity:'50'}],voidIds:[]}),errorCode('historical_duplicate_order_read_only'));
  await assert.rejects(()=>updateSalesOrderLifecycle(pool,{id:original,expectedVersion:1,lifecycleState:'active'}),errorCode('historical_duplicate_order_read_only'));
  await upsertCurrentAinuokeContractMirror(pool,original,{...input.source,quantity:200,contractDeliveryDate:'2027-01-01',sourceHash:'synthetic-new-source'});
  assert.deepEqual((await pool.query('SELECT row_to_json(p) AS row FROM sales_order_delivery_plans p WHERE sales_order_id=$1 ORDER BY id',[original])).rows,oldPlans);
  assert.equal((await readDeliveryPlanSet(pool,primary)).sourceQuantity,'200');assert.equal((await readDeliveryPlanSet(pool,primary)).plans[0].quantity,'80');
 });
 await t.test('fresh delivery grants override stale cached permissions without writing',async()=>{
  const before=await readDeliveryPlanSet(pool,primary);
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='order.edit'");
  try{await assert.rejects(()=>updateDeliveryPlans(pool,actor,primary,{expectedVersion:before.version,upserts:[{id:null,deliveryDate:'2027-01-01',quantity:'1'}],voidIds:[]}));assert.deepEqual(await readDeliveryPlanSet(pool,primary),before);}
  finally{await pool.query("INSERT INTO app_role_permissions VALUES('role-server-admin','order.edit')");}
 });
 await t.test('HTTP defaults to effective list, provides original history, and rejects bypass flags',async()=>{
  const origin='http://effective-consumer.invalid';const server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
  try{
   const headers={Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'};
   const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username:'synthetic-effective-admin',password:'Synthetic-2026'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
   const request=(path:string,body?:object)=>fetch(base+path,{headers:{...headers,Cookie:cookie},method:body?'PATCH':'GET',...(body?{body:JSON.stringify(body)}:{})});
   const list=await request('/api/v1/sales-orders');assert.equal(list.status,200);assert.equal((await list.json()).page.total,1);
   const history=await request('/api/v1/sales-orders?includeHistorical=true');assert.equal((await history.json()).page.total,2);
   const detail=await request('/api/v1/sales-orders/'+original);assert.equal((await detail.json()).salesOrder.attribution.effectiveOrderId,primary);
   for(const query of ['includeHistorical=1','includeHistorical=true&includeHistorical=false','effectiveOrderId='+original])assert.equal((await request('/api/v1/sales-orders?'+query)).status,400);
   assert.equal((await request('/api/v1/sales-orders/'+original+'/delivery-plans',{expectedVersion:1,upserts:[{id:null,deliveryDate:'2027-01-01',quantity:'1'}],voidIds:[]})).status,409);
  }finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
 });
 await t.test('writer waits before row locks and rechecks changed effective identity after release',async()=>{
  const owner=await pool.connect();let pending:Promise<{ok:boolean;error?:unknown}>|null=null;
  try{
   await owner.query('BEGIN');await owner.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
   const state=await readDeliveryPlanSet(pool,primary);
   pending=updateDeliveryPlans(pool,actor,primary,{expectedVersion:state.version,upserts:[{id:null,deliveryDate:'2027-01-01',quantity:'1'}],voidIds:[]}).then(()=>({ok:true}),error=>({ok:false,error}));
   const deadline=Date.now()+5000;let blocked=false;
   while(Date.now()<deadline){blocked=Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock_shared%'")).rowCount);if(blocked)break;await new Promise(done=>setTimeout(done,25));}assert.equal(blocked,true);
   await owner.query('SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE NOWAIT',[primary]);
   await map(original,owner);await owner.query('COMMIT');
   const result=await pending;assert.equal(result.ok,false);assert.ok(errorCode('historical_duplicate_order_read_only')(result.error));assert.equal((await readDeliveryPlanSet(pool,primary)).plans.length,1);
  }finally{await owner.query('ROLLBACK');owner.release();await pending;}
 });
 await t.test('correction splits group; stale current contract type disappears without deleting old profile or prices',async()=>{
  await map(null);
  assert.equal((await resolveEffectiveOrder(pool,primary)).historicalDuplicate,false);
  assert.equal((await getSalesOrderById(pool,primary))?.salesContractNo,null);
  assert.equal((await getSalesOrderById(pool,primary))?.businessType,'unclassified');
  assert.equal((await readOrderIdentity(pool,primary)).businessType,'unclassified');
  assert.equal((await readOrderCommercialState(pool,primary)).current?.salePrice,'120');
  assert.equal((await pool.query('SELECT business_type FROM sales_order_identity_profiles WHERE sales_order_id=$1',[primary])).rows[0].business_type,'ainuoke_contract');
  assert.equal((await listSalesOrders(pool)).total,2);assert.deepEqual((await pool.query('SELECT row_to_json(l) AS row FROM sales_order_source_links l ORDER BY id')).rows,beforeLinks);
 });
});

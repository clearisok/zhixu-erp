import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {createSalesOrder,listSalesOrders} from '../sales-orders/repository.js';
import {createAinuokeSalesOrder} from '../sales-orders/service.js';
import {mutateOrderIdentity} from '../sales-orders/identity-service.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {previewOrderCommercial,adoptOrderCommercial,readOrderCommercialState} from '../sales-orders/commercial-version-service.js';
import {createProcessingBatch,previewProcessingBatch,confirmProcessingBatch,consumeProcessingBatches,listProcessingBatches,parseProcessingBatchQuery} from '../sales-orders/processing-batch-service.js';
import {readOrderCommandState} from '../sales-orders/command-control.js';
import {createApp} from '../app.js';
import {bindingBundle,freshMaterialBundle,additionBundle} from './ainuoke-binding-fixture.js';
import {bindOrders,previewBindings} from '../ainuoke-source/binding.js';
import {previewAdditions,readBoundIdentities,addOrders} from '../ainuoke-source/additions.js';
import {captureSource} from '../ainuoke-source/service.js';
import {syntheticOrder} from './ainuoke-source-fixture.js';

const code=(value:string)=>(error:unknown)=>(error as {code?:string}).code===value;

test('operator pause drains new commands without destroying synthetic orders or history',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('command_control')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:'synthetic-pause-admin',displayName:'Synthetic',password:'Synthetic-2026'});
 const actor=await loadExistingBootstrapActor(pool,'synthetic-pause-admin');
 const pause=async(mode:'enabled'|'frozen',reason:string)=>pool.query('UPDATE sales_order_command_control SET mode=$1,reason=$2,version=version+1 WHERE singleton',[mode,reason]);
 const q=createSyntheticQuoteFixture('synthetic-paused-distribution','distribution');
 for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
 const revision=q.revisions.find(r=>r.revisionId===q.defaultRevisionId)!,pv=revision.priceVersions[0];
 pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:120,confirmedLaborPrice:10,note:'synthetic',confirmedAt:'2026-10-15T00:00:00Z'};
 await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(q));const provenance={quoteId:q.id,revisionId:revision.revisionId,priceVersionId:pv.id};
 const input={source:{sourceId:'synthetic-pause-contract',sourceRowIdentity:'synthetic-pause-row',salesContractNo:'SYN-PAUSE',insideOrderNo:'SYN-FACTORY',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYN-STYLE',companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:100,sourceHash:'synthetic',fetchedAt:'2026-10-15T00:00:00Z'},colors:[]};
 const order=(await createAinuokeSalesOrder(pool,actor,input)).salesOrder.id;
 await mutateOrderIdentity(pool,actor,order,{action:'claim',expectedVersion:0});
 const preview=await previewOrderCommercial(pool,actor,order,provenance);
 const adoption={...provenance,requestId:randomUUID(),expectedVersion:0,sourceFingerprint:preview.candidate.fingerprint,reason:'Synthetic initial adopted terms'};
 const adopted=await adoptOrderCommercial(pool,actor,order,adoption);
 const unpricedOrder=(await createAinuokeSalesOrder(pool,actor,{...input,source:{...input.source,sourceId:'synthetic-unpriced-pause-contract',sourceRowIdentity:'synthetic-unpriced-pause-row',salesContractNo:'SYN-UNPRICED-PAUSE'}})).salesOrder.id;
 const oldTerms=(await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,customer_confirmed_price) VALUES('sales_order',120) RETURNING id")).rows[0].id;
 await pool.query('INSERT INTO confirmed_commercial_terms_sales_orders(sales_order_id,confirmed_commercial_terms_id) VALUES($1,$2)',[order,oldTerms]);
 const caseOrder=(await createSalesOrder(pool,{creationSource:'manual'})).id;const pair=[order,caseOrder].sort();
 const caseId=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor.internalUserId,randomUUID(),'a'.repeat(64)])).rows[0].id;
 await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','Synthetic pause case','{}')",[caseId,actor.internalUserId,randomUUID(),'b'.repeat(64)]);
 const business=async()=>Promise.all(['sales_orders','sales_order_source_links','ainuoke_sales_order_contract_mirrors','sales_order_delivery_plans','sales_order_commercial_versions','sales_order_commercial_heads','confirmed_commercial_terms'].map(async table=>(await pool.query('SELECT to_jsonb(x) row FROM '+table+' x ORDER BY to_jsonb(x)::text')).rows));
 let before:unknown;
 await t.test('pause records an immutable operator transition without changing any business row',async()=>{
  before=await business();await pause('frozen','Synthetic explicit operator pause');assert.deepEqual(await business(),before);
  const events=(await pool.query('SELECT version,previous_mode,mode,database_actor FROM sales_order_command_control_events ORDER BY version')).rows;
  assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.mode),['enabled','frozen']);assert.equal(events[1].previous_mode,'enabled');assert.equal(events[1].database_actor,'postgres');
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_command_control_events'),code('23514'));
  await assert.rejects(()=>pool.query("INSERT INTO sales_order_command_control_events(version,mode,reason,database_actor) VALUES(999,'enabled','forged','forged-admin')"),code('23514'));
  await assert.rejects(()=>pool.query("UPDATE sales_order_command_control SET mode='enabled' WHERE singleton"),code('23514'));
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_command_control'),code('23514'));
 });
 await t.test('late operator-history failure rolls back the mode and exact version together',async()=>{
  const prior=(await pool.query('SELECT to_jsonb(x) row FROM sales_order_command_control x')).rows;
  await pool.query("CREATE FUNCTION synthetic_control_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic late control history failure'; END $$; CREATE TRIGGER synthetic_control_event_failure BEFORE INSERT ON sales_order_command_control_events FOR EACH ROW EXECUTE FUNCTION synthetic_control_event_failure()");
  try{await assert.rejects(()=>pause('enabled','Synthetic failed reopen'),/synthetic late control history failure/);assert.deepEqual((await pool.query('SELECT to_jsonb(x) row FROM sales_order_command_control x')).rows,prior);}
  finally{await pool.query('DROP TRIGGER synthetic_control_event_failure ON sales_order_command_control_events; DROP FUNCTION synthetic_control_event_failure()');}
 });
 await t.test('raw old create, adopted price, association and normalization DML are blocked while frozen',async()=>{
  await assert.rejects(()=>createSalesOrder(pool,{creationSource:'manual'}),code('55000'));
  await assert.rejects(()=>pool.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic')",[caseId,actor.internalUserId,randomUUID(),'c'.repeat(64)]),code('55000'));
  await assert.rejects(()=>pool.query("UPDATE confirmed_commercial_terms SET customer_confirmed_price=999,version=version+1 WHERE id=$1",[oldTerms]),code('55000'));
  await assert.rejects(()=>pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope) VALUES('sales_order')"),code('55000'));
  await assert.rejects(()=>pool.query('UPDATE confirmed_commercial_terms_sales_orders SET confirmed_commercial_terms_id=confirmed_commercial_terms_id WHERE sales_order_id=$1',[order]),code('55000'));
  await assert.rejects(()=>adoptOrderCommercial(pool,actor,order,{...adoption,requestId:randomUUID(),expectedVersion:1,reason:'Synthetic paused replacement'}),code('order_commands_frozen'));
  assert.deepEqual(await business(),before);assert.equal((await readOrderCommercialState(pool,order)).current?.id,adopted.adopted.id);
 });
 await t.test('existing contract and adoption receipts can be read without silently adopting or creating again',async()=>{
  assert.equal((await createAinuokeSalesOrder(pool,actor,input)).created,false);
  assert.equal((await adoptOrderCommercial(pool,actor,order,adoption)).replayed,true);
  assert.equal((await listSalesOrders(pool,{limit:20,offset:0})).total,3);
  assert.equal((await previewOrderCommercial(pool,actor,order,provenance)).candidate.salePrice,'120');
  assert.deepEqual(await business(),before);
 });
 await t.test('read state is fresh, contains no operator reason/credential and process enabled cannot reopen DB frozen',async()=>{
  const state=await readOrderCommandState(pool,actor,'enabled');assert.equal(state.mode,'frozen');assert.equal(state.databaseMode,'frozen');
  assert.equal(JSON.stringify(state).includes('Synthetic explicit operator pause'),false);
  await pool.query("DELETE FROM app_role_permissions WHERE permission_key='order.view' AND role_id IN (SELECT role_id FROM app_user_roles WHERE user_id=$1)",[actor.internalUserId]);
  const staleActor={...actor,permissions:['order.view']};await assert.rejects(()=>readOrderCommandState(pool,staleActor,'enabled'),code('permission_denied'));
  await pool.query("INSERT INTO app_role_permissions SELECT role_id,'order.view' FROM app_user_roles WHERE user_id=$1",[actor.internalUserId]);
 });
 await t.test('unrelated quote CCT confirmation remains available while legacy order CCT setters are paused',async()=>{
  const quoteTerms=(await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,customer_confirmed_price) VALUES('quote','synthetic-unrelated-q','r','p',120) RETURNING id")).rows[0].id;
  await pool.query('UPDATE confirmed_commercial_terms SET customer_confirmed_price=121,version=version+1 WHERE id=$1',[quoteTerms]);
  assert.equal((await pool.query('SELECT customer_confirmed_price::text FROM confirmed_commercial_terms WHERE id=$1',[quoteTerms])).rows[0].customer_confirmed_price,'121');
 });
 await t.test('HTTP cannot reopen either pause layer; new commands close while reads and previews remain',async()=>{
  const server=createServer(createApp({pool,orderCommandMode:'frozen',allowedOrigins:['http://127.0.0.1'],security:{secureCookies:false,sessionTtlSeconds:3600}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
  try{
   const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Origin:'http://127.0.0.1','Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({username:actor.username,password:'Synthetic-2026'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
   const call=(path:string,method='GET',body?:unknown)=>fetch(base+path,{method,headers:{Cookie:cookie,Origin:'http://127.0.0.1','Content-Type':'application/json','X-Zhixu-Request':'1','X-Order-Command-Mode':'enabled'},body:body===undefined?undefined:JSON.stringify(body)});
   assert.equal((await fetch(base+'/api/v1/order-command-state')).status,401);
   assert.equal((await call('/api/v1/order-command-state','POST',{mode:'enabled'})).status,405);
   assert.equal((await call('/api/v1/order-command-state?mode=enabled')).status,400);
   const state=await call('/api/v1/order-command-state');assert.equal(state.status,200);assert.equal((await state.json()).mode,'frozen');assert.equal(state.headers.get('cache-control'),'no-store');
   for(const path of ['/api/v1/sales-orders','/api/v1/sales-orders/'+order,'/api/v1/sales-orders/'+order+'/commercial-versions'])assert.equal((await call(path)).status,200);
   const selection={kind:'quote',...provenance};
   const existingPreview=await call('/api/v1/sales-orders/'+order+'/business-source/preview','POST',selection);assert.equal(existingPreview.status,409);assert.equal((await existingPreview.json()).error.code,'source_change_requires_quote_center');
   const firstPreview=await call('/api/v1/sales-orders/'+unpricedOrder+'/business-source/preview','POST',selection);assert.equal(firstPreview.status,200);
   const firstPreviewBody=await firstPreview.json();
   const firstWrite=await call('/api/v1/sales-orders/'+unpricedOrder+'/business-source','POST',{selection,requestId:randomUUID(),expectedVersion:0,fingerprint:firstPreviewBody.fingerprint,reason:'Synthetic paused first adoption'});assert.equal(firstWrite.status,503);assert.equal((await firstWrite.json()).error.code,'order_commands_frozen');
   assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions WHERE sales_order_id=$1',[unpricedOrder])).rows[0].n,0);
   for(const [path,body] of [['/api/v1/sales-orders/'+order+'/business-source',{selection:{kind:'quote',...provenance}}],['/api/v1/processing-order-batches/consume',{requestId:randomUUID(),items:[{batchId:randomUUID(),expectedVersion:1}]}]] as const){const result=await call(path,'POST',body);assert.equal(result.status,503);assert.equal((await result.json()).error.code,'order_commands_frozen');}
   await pause('enabled','Synthetic operator reopens after verification');assert.equal((await readOrderCommandState(pool,actor,'frozen')).mode,'frozen');
   const result=await call('/api/v1/sales-orders/'+order+'/business-source','POST',{...adoption,requestId:randomUUID(),expectedVersion:1});assert.equal(result.status,503);assert.equal((await result.json()).error.code,'order_commands_frozen');
  }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
 });
 await t.test('a pause waits for a specific in-flight transaction then prevents new writers',async()=>{
  const writer=await pool.connect(),operator=await pool.connect();let pending:Promise<unknown>|undefined;
  try{
   await writer.query('BEGIN');await createSalesOrder(writer,{creationSource:'manual'});
   await operator.query("SET application_name='synthetic-order-pause-operator'");pending=operator.query("UPDATE sales_order_command_control SET mode='frozen',reason='Synthetic drain pause',version=version+1 WHERE singleton");
   let waiting=false;const deadline=Date.now()+5000;
   while(Date.now()<deadline){waiting=Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='synthetic-order-pause-operator' AND wait_event_type='Lock'")).rowCount);if(waiting)break;await new Promise(done=>setTimeout(done,25));}
   assert.equal(waiting,true);assert.equal((await pool.query('SELECT mode FROM sales_order_command_control')).rows[0].mode,'enabled');
   await writer.query('COMMIT');await pending;await assert.rejects(()=>createSalesOrder(pool,{creationSource:'manual'}),code('55000'));
  }finally{await writer.query('ROLLBACK');writer.release();operator.release();await pending?.catch(()=>undefined);}
 });
 await t.test('an old RR snapshot cannot reopen a control pause by reading its stale enabled row',async()=>{
  await pause('enabled','Synthetic prepare RR check');const client=await pool.connect();
  try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await client.query('SELECT mode FROM sales_order_command_control');await pause('frozen','Synthetic RR pause');await assert.rejects(()=>createSalesOrder(client,{creationSource:'manual'}),code('40001'));}
  finally{await client.query('ROLLBACK');client.release();}
 });
 await t.test('partial control schema fails closed for new HTTP commands rather than default enabling them',async()=>{
  await pool.query('ALTER TABLE sales_order_command_control_events RENAME TO synthetic_missing_control_events');
  try{await assert.rejects(()=>readOrderCommandState(pool,actor,'enabled'),code('order_command_control_unavailable'));}
  finally{await pool.query('ALTER TABLE synthetic_missing_control_events RENAME TO sales_order_command_control_events');}
 });
 await t.test('processing preparation can continue; consumption is atomic and reports the typed DB pause',async()=>{
  const quote=createSyntheticQuoteFixture('synthetic-paused-processing','processing');for(const revision of quote.revisions){revision.imageAttachmentIds=[];revision.fileAttachmentIds=[];revision.styleImageAttachmentId=null;}
  const r=quote.revisions.find(x=>x.revisionId===quote.defaultRevisionId)!,p=r.priceVersions[0];p.pricingParameters.laborCurrency='CNY';p.confirmation={quotedGarmentPrice:99,quotedLaborPrice:99,confirmedGarmentPrice:null,confirmedLaborPrice:0,note:'synthetic',confirmedAt:'2026-10-15T00:00:00Z'};
  await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(quote));
  const batch=await createProcessingBatch(pool,actor,{requestId:randomUUID(),quoteId:quote.id,revisionId:r.revisionId,priceVersionId:p.id,customerName:'Synthetic',businessStyleNo:'SYN-PROCESS',quantity:'10',orderDate:'2026-10-15',deliveryDate:null,customerReference:'SYN-PO',deliveryRequirements:'',referenceOrderId:null});
  const candidate=await previewProcessingBatch(pool,actor,batch.batchId);const confirmed=await confirmProcessingBatch(pool,actor,batch.batchId,{requestId:randomUUID(),expectedVersion:1,sourceFingerprint:candidate.candidate.fingerprint});
  const before=(await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n;
  const result=await consumeProcessingBatches(pool,actor,{requestId:randomUUID(),items:[{batchId:batch.batchId,expectedVersion:confirmed.version}]});assert.equal(result.results[0].status,'failed');const failed=result.results[0];assert.ok('code' in failed);assert.equal(failed.code,'order_commands_frozen');
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,before);assert.equal((await pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions')).rows[0].n,0);
  assert.equal((await listProcessingBatches(pool,actor,parseProcessingBatchQuery(new URLSearchParams()))).items[0].batch.id,batch.batchId);
  await pause('enabled','Synthetic resume verified processing');assert.equal((await consumeProcessingBatches(pool,actor,{requestId:randomUUID(),items:[{batchId:batch.batchId,expectedVersion:confirmed.version}]})).results[0].status,'created');
 });
});

test('DB pause covers first binding and intake while existing Source refresh stays available',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('source_command_pause')});t.after(async()=>{await pool.end();await db.stop();});
 await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:'synthetic-source-pause',displayName:'Synthetic',password:'Synthetic-2026'});const actor=await loadExistingBootstrapActor(pool,'synthetic-source-pause');
 const clock=Date.now(),source=bindingBundle(clock),preview=await previewBindings(source),options={sourceKey:'pause-source',accountFingerprint:'a'.repeat(64),expectedPreview:preview.reviewHash,collect:async()=>source};
 await pool.query("UPDATE sales_order_command_control SET mode='frozen',reason='Synthetic first bind paused',version=version+1 WHERE singleton");
 await assert.rejects(()=>bindOrders(pool,actor,options),code('order_commands_frozen'));assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,0);
 await pool.query("UPDATE sales_order_command_control SET mode='enabled',reason='Synthetic bind permitted',version=version+1 WHERE singleton");const first=await bindOrders(pool,actor,options);
 await pool.query("UPDATE sales_order_command_control SET mode='frozen',reason='Synthetic existing Source only',version=version+1 WHERE singleton");
 assert.equal((await bindOrders(pool,actor,options)).replayed,true);
 const material=freshMaterialBundle(clock);const capture={sourceKey:options.sourceKey,accountFingerprint:options.accountFingerprint,maxAgeMs:1000,now:()=>clock,collect:async()=>material};
 const refreshed=await captureSource(pool,actor,capture);assert.ok(refreshed.runId);assert.equal(refreshed.orders,1);
 const selected=[syntheticOrder.salesContractNo+'-1'],addition=additionBundle(clock);const proposed=await previewAdditions(addition,selected,await readBoundIdentities(pool));
 await assert.rejects(()=>addOrders(pool,actor,{sourceKey:options.sourceKey,accountFingerprint:options.accountFingerprint,selected,expectedPreview:proposed.reviewHash,collect:async()=>addition}),code('order_commands_frozen'));
 assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,1);assert.equal((await pool.query('SELECT id::text FROM sales_orders')).rows[0].id,first.orderIds[0]);assert.equal((await pool.query('SELECT mode FROM sales_order_command_control')).rows[0].mode,'frozen');
});

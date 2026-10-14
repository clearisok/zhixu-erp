import {createTrustedQuoteService} from '../quotes/service.js';
import {readConfirmedCommercialTermsByQuote,updateConfirmedCommercialTermsByQuote} from '../confirmed-commercial-terms/service.js';
import {permissionsForUser} from '../auth/permissions.js';
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
import {createAinuokeSalesOrder} from '../sales-orders/service.js';
import {mutateOrderIdentity} from '../sales-orders/identity-service.js';
import {adoptOrderCommercial,previewOrderCommercial,readOrderCommercialState,parseAdoptCommercial} from '../sales-orders/commercial-version-service.js';
import {projectOperationLogResponse} from '../operation-logs/query.js';
import type {ServerOperationLog} from '../operation-logs/repository.js';

const code=(expected:string)=>(e:unknown)=>(e as {code:string}).code===expected;
test('adoption rejects extra authority and incomplete payloads',()=>{
 assert.throws(()=>parseAdoptCommercial({salePrice:'999'}));
});
test('order commercial adoption isolated transactions',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('commercial_adoption')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
 await pool.query("INSERT INTO app_roles(id,name) VALUES('adoption-test','Synthetic')");
 await pool.query("INSERT INTO app_role_permissions SELECT 'adoption-test',key FROM app_permissions");
 const u=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('adopter',crypt('synthetic',gen_salt('bf',4)),'Synthetic','viewer') RETURNING id::text,public_id::text")).rows[0];
 await pool.query("INSERT INTO app_user_roles VALUES($1,'adoption-test')",[u.id]);
 const actor:TrustedIdentity={internalUserId:u.id,userId:u.public_id,username:'adopter',userName:'Synthetic',permissions:['order.view','ainuoke.sync']};
 const q=createSyntheticQuoteFixture('commercial-adoption-synthetic','distribution');
 for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
 const revision=q.revisions.find(r=>r.revisionId===q.defaultRevisionId)!,pv=revision.priceVersions[0];
 revision.baseInfo.quoteStyleNo='SYNTHETIC';revision.baseInfo.styleName='Synthetic';
 pv.quantity=100;pv.trims.forEach(line=>line.usage=0);
 pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:120,confirmedLaborPrice:10,note:'synthetic',confirmedAt:'2026-10-14T00:00:00Z'};
 await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(q));const source={quoteId:q.id,revisionId:revision.revisionId,priceVersionId:pv.id};
 let sequence=0;const order=async(claim=true)=>{
  const n=++sequence;const result=await createAinuokeSalesOrder(pool,actor,{source:{sourceId:'AD-'+n,sourceRowIdentity:'ROW-'+n,salesContractNo:'SYNTHETIC-'+n,insideOrderNo:'IN-'+n,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'TEST',companyNameSnapshot:'TEST',customerNameSnapshot:'TEST',brandNameSnapshot:'TEST',quantity:100,sourceHash:'HASH-'+n,fetchedAt:'2026-10-14T00:00:00Z'},colors:[]});
  if(claim)await mutateOrderIdentity(pool,actor,result.salesOrder.id,{action:'claim',expectedVersion:0});return result.salesOrder.id;
 };
 const command=async(id:string)=>{const p=await previewOrderCommercial(pool,actor,id,source);return {...source,requestId:randomUUID(),expectedVersion:p.current.version,sourceFingerprint:p.candidate.fingerprint,reason:'confirmed synthetic 120'};};
 const a=await order(),b=await order();const original=await command(a);
 await t.test('same request concurrency returns one immutable adoption',async()=>{
  const results=await Promise.all([adoptOrderCommercial(pool,actor,a,original),adoptOrderCommercial(pool,actor,a,original)]);
  assert.equal(results[0].adopted.id,results[1].adopted.id);assert.equal(results.filter(r=>r.replayed).length,1);assert.equal((await readOrderCommercialState(pool,a)).version,1);
  await assert.rejects(()=>adoptOrderCommercial(pool,actor,a,{...original,reason:'changed'}),code('commercial_adoption_retry_mismatch'));
 });
 await t.test('two orders share a quote without sharing adopted prices',async()=>{
  await adoptOrderCommercial(pool,actor,b,await command(b));
  const lookup=await readConfirmedCommercialTermsByQuote(pool,source);assert.equal(lookup.linkage,'linked');assert.deepEqual([...lookup.associatedSalesOrderIds].sort(),[a,b].sort());
  const quoteActor={...actor,permissions:await permissionsForUser(pool,actor.internalUserId)};
  const changed=await updateConfirmedCommercialTermsByQuote(pool,quoteActor,source,{expectedVersion:0,expectedQuoteVersion:1,customerConfirmedPrice:'130'});
  assert.equal(changed.current?.confirmedLaborPrice,'10');
  assert.equal((await pool.query('SELECT count(*)::int n FROM confirmed_commercial_terms_sales_orders')).rows[0].n,0);
  assert.equal((await readOrderCommercialState(pool,a)).current?.salePrice,'120');assert.equal((await readOrderCommercialState(pool,b)).current?.salePrice,'120');
  assert.equal((await adoptOrderCommercial(pool,actor,a,original)).adopted.salePrice,'120');
  await adoptOrderCommercial(pool,actor,a,await command(a));assert.equal((await readOrderCommercialState(pool,a)).current?.salePrice,'130');assert.equal((await readOrderCommercialState(pool,b)).current?.salePrice,'120');
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions WHERE sales_order_id=$1',[a])).rows[0].n,2);
 });
 await t.test('adoption and existing CCT both prevent divergent PV confirmation writes',async()=>{
  const fullActor={...actor,permissions:await permissionsForUser(pool,actor.internalUserId)};
  const workflow={action:'confirmation.save' as const,expectedVersion:1,revisionId:source.revisionId,priceVersionId:source.priceVersionId,confirmedLaborPrice:'99',confirmedGarmentPrice:'999',note:'must reject'};
  await assert.rejects(()=>createTrustedQuoteService(pool).confirmationWorkflow(fullActor,q.id,workflow),code('quote_confirmation_linked_read_only'));
  const orphan=structuredClone(q);orphan.id='synthetic-cct-no-order';orphan.quoteCode='QT-SYNTHETIC-CCT-NO-ORDER';orphan.activeEstimateCost=null;orphan.estimateCostHistory=[];await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(orphan));
  const p={...source,quoteId:orphan.id};await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,customer_confirmed_price,confirmed_labor_price,labor_currency) VALUES('quote',$1,$2,$3,150,15,'CNY')",[p.quoteId,p.revisionId,p.priceVersionId]);
  const lookup=await readConfirmedCommercialTermsByQuote(pool,p);assert.equal(lookup.linkage,'linked');assert.deepEqual(lookup.associatedSalesOrderIds,[]);assert.equal(lookup.current?.customerConfirmedPrice,'150');
  await assert.rejects(()=>createTrustedQuoteService(pool).confirmationWorkflow(fullActor,orphan.id,workflow),code('quote_confirmation_linked_read_only'));
  const changed=await updateConfirmedCommercialTermsByQuote(pool,fullActor,p,{expectedVersion:1,expectedQuoteVersion:1,customerConfirmedPrice:'151'});assert.equal(changed.current?.customerConfirmedPrice,'151');assert.equal(changed.current?.confirmedLaborPrice,'15');
 });
 await t.test('different requests race with expected-version compare-and-swap',async()=>{
  const c=await order(),cmd=await command(c);const results=await Promise.allSettled([adoptOrderCommercial(pool,actor,c,cmd),adoptOrderCommercial(pool,actor,c,{...cmd,requestId:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await readOrderCommercialState(pool,c)).version,1);
 });
 await t.test('source changes after preview require a new preview',async()=>{
  const cmd=await command(b);await pool.query('UPDATE confirmed_commercial_terms SET customer_confirmed_price=140,version=version+1 WHERE quote_id=$1',[q.id]);
  await assert.rejects(()=>adoptOrderCommercial(pool,actor,b,cmd),code('commercial_source_changed'));assert.equal((await readOrderCommercialState(pool,b)).version,1);
 });
 await t.test('revoked grants block even an exact replay',async()=>{
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='adoption-test' AND permission_key='order.commercial.adopt'");await assert.rejects(()=>adoptOrderCommercial(pool,actor,a,original));
  await pool.query("INSERT INTO app_role_permissions VALUES('adoption-test','order.commercial.adopt')");
 });
 await t.test('unclaimed and completed orders fail closed',async()=>{
  const c=await order(false);await assert.rejects(()=>previewOrderCommercial(pool,actor,c,source),code('order_claim_required'));
  const d=await order(),cmd=await command(d);await pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1",[d]);
  await assert.rejects(()=>adoptOrderCommercial(pool,actor,d,cmd),code('order_commercial_frozen'));assert.equal((await readOrderCommercialState(pool,d)).version,0);
 });
 await t.test('audit failure rolls back version and current pointer',async()=>{
  const c=await order(),cmd=await command(c);
  await pool.query("CREATE FUNCTION reject_adoption_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='OrderCommercialVersion' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER reject_adoption_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_adoption_audit()');
  try{await assert.rejects(()=>adoptOrderCommercial(pool,actor,c,cmd));assert.equal((await readOrderCommercialState(pool,c)).version,0);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions WHERE sales_order_id=$1',[c])).rows[0].n,0);}finally{await pool.query('DROP TRIGGER reject_adoption_audit ON operation_logs');}
 });
 await t.test('audit field projection also hides free-form monetary reason',async()=>{
  const log:ServerOperationLog={id:'1',operationId:'1',operationSequence:0,actorUserId:actor.userId,actorName:'test',module:'订单中心',action:'采用订单商业版本',entityType:'OrderCommercialVersion',entityId:'1',quoteId:q.id,context:{},beforeData:null,afterData:{values:{customerConfirmedPrice:'140',confirmedLaborPrice:'12'}},changes:[],metadata:{reason:'sale 140 labor 12'},createdAt:'2026-10-14T00:00:00Z'};
  const restricted=projectOperationLogResponse({...actor,permissions:['order.view']},log);assert.deepEqual(restricted.afterData?.values,{});assert.equal(restricted.metadata.reason,undefined);assert.equal(log.metadata.reason,'sale 140 labor 12');
 });
 await t.test('HTTP session, mutation boundary and monetary projection',async()=>{
  const origin='http://commercial-test.invalid';const server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
  try{
   const headers={Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'};
   const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username:'adopter',password:'synthetic'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
   const id=await order(),path='/api/v1/sales-orders/'+id+'/commercial-versions';
   const req=(url:string,method='GET',body?:object,extra:Record<string,string>={})=>fetch(base+url,{method,headers:{...headers,Cookie:cookie,...extra},...(body?{body:JSON.stringify(body)}:{})});
   assert.equal((await fetch(base+path)).status,401);
   assert.equal((await req(path+'?salePrice=999')).status,400);
   assert.equal((await req(path+'/preview','POST',source,{Origin:'http://evil.invalid'})).status,403);
   assert.equal((await req(path+'/preview','POST',{...source,salePrice:'999'})).status,400);
   const preview=await req(path+'/preview','POST',source);assert.equal(preview.status,200);const data=await preview.json();assert.equal(data.candidate.sale.value.price,'140');assert.equal(data.candidate.salePrice,undefined);
   const cmd={...source,requestId:randomUUID(),expectedVersion:0,sourceFingerprint:data.candidate.fingerprint,reason:'adopt 140'};
   const adopted=await req(path,'POST',cmd);assert.equal(adopted.status,200);assert.equal((await adopted.json()).adopted.sale.value.price,'140');
   assert.equal((await req(path,'POST',cmd)).status,200);
   const legacy='/api/v1/sales-orders/'+id+'/confirmed-commercial-terms';
   const legacyRead=await req(legacy);assert.equal(legacyRead.status,200);const legacyBody=await legacyRead.json();assert.equal(legacyBody.confirmedCommercialTerms.scope,'sales_order');assert.equal(legacyBody.confirmedCommercialTerms.current.sale.value.price,'140');
   const oldWrite=await req(legacy,'PATCH',{expectedVersion:1,customerConfirmedPrice:'999'});assert.equal(oldWrite.status,409);assert.equal((await oldWrite.json()).error.code,'order_commercial_adoption_required');
   const pending=await order();const pendingRead=await req('/api/v1/sales-orders/'+pending+'/confirmed-commercial-terms');assert.equal((await pendingRead.json()).confirmedCommercialTerms.current,null);

   await pool.query("DELETE FROM app_role_permissions WHERE role_id='adoption-test' AND permission_key IN ('commercial.sale.view','commercial.labor.view')");
   try{
    const restricted=await req(path);assert.equal(restricted.status,200);assert.equal(restricted.headers.get('cache-control'),'no-store');const body=await restricted.json();assert.equal(body.current.sale.visibility,'restricted');assert.equal(body.current.labor.visibility,'restricted');assert.equal(body.current.reason,undefined);assert.equal(body.current.salePrice,undefined);assert.equal(body.current.laborPrice,undefined);
    assert.equal((await req(path+'/preview','POST',source)).status,403);assert.equal((await req(path,'POST',cmd)).status,403);
   }finally{await pool.query("INSERT INTO app_role_permissions VALUES('adoption-test','commercial.sale.view'),('adoption-test','commercial.labor.view')");}
  }finally{await new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()));}
 });
 await t.test('removing quote source cannot destroy adopted snapshots',async()=>{
  for(const table of ['quote_center_fabric_lines','quote_center_trim_lines','quote_center_other_cost_lines'])await pool.query(`DELETE FROM ${table} WHERE snapshot_id IN (SELECT id FROM quote_center_cost_snapshots WHERE quote_id=$1 AND price_version_id=$2)`,[q.id,pv.id]);
  await pool.query('DELETE FROM quote_center_cost_snapshots WHERE quote_id=$1 AND price_version_id=$2',[q.id,pv.id]);
  await pool.query('DELETE FROM quote_center_price_versions WHERE quote_id=$1 AND id=$2',[q.id,pv.id]);
  await assert.rejects(()=>previewOrderCommercial(pool,actor,a,source));
  assert.equal((await readOrderCommercialState(pool,a)).current?.salePrice,'130');assert.equal((await readOrderCommercialState(pool,b)).current?.salePrice,'120');
 });
});

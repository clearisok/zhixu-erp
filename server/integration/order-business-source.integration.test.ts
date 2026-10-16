import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog,permissionsForUser} from '../auth/permissions.js';
import type {TrustedIdentity} from '../auth/session.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {createAinuokeSalesOrder} from '../sales-orders/service.js';
import {previewOrderBusinessSource,adoptOrderBusinessSource,readOrderBusinessSource,parseBusinessSourceSelection} from '../sales-orders/business-source-service.js';
import {readOrderCommercialState} from '../sales-orders/commercial-version-service.js';
import {productHash} from '../sales-orders/product-snapshot.js';
import {createApp} from '../app.js';

const code=(expected:string)=>(e:unknown)=>(e as {code:string}).code===expected;
test('business source requires an explicit unchanged reorder and rejects supplied prices',()=>{
 for(const raw of [{kind:'reorder',referenceOrderId:randomUUID(),unchanged:false},{kind:'reorder',referenceOrderId:randomUUID(),unchanged:true,price:20},{kind:'quote',quoteId:'q',revisionId:'r',priceVersionId:'p',salePrice:100}])assert.throws(()=>parseBusinessSourceSelection(raw));
 assert.equal(productHash({b:2,a:1}),productHash({a:1,b:2}));
});

test('business source uses isolated synthetic orders, immutable conditions and no owners',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('business_source')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
 await pool.query("INSERT INTO app_roles(id,name) VALUES('source-test','Synthetic'); INSERT INTO app_role_permissions SELECT 'source-test',key FROM app_permissions");
 const u=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('source-test',crypt('synthetic',gen_salt('bf',4)),'Synthetic','viewer') RETURNING id::text,public_id::text")).rows[0];
 await pool.query("INSERT INTO app_user_roles VALUES($1,'source-test')",[u.id]);
 const actor:TrustedIdentity={internalUserId:u.id,userId:u.public_id,username:'source-test',userName:'Synthetic',permissions:await permissionsForUser(pool,u.id)};
 const q=createSyntheticQuoteFixture('business-source-synthetic','distribution');
 for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
 const revision=q.revisions.find(r=>r.revisionId===q.defaultRevisionId)!,pv=revision.priceVersions[0];
 pv.quantity=100;pv.trims.forEach(l=>l.usage=0);pv.pricingParameters.laborCurrency='CNY';
 pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:120,confirmedLaborPrice:10,note:'synthetic',confirmedAt:'2026-10-17T00:00:00Z'};
 await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(q));
 const quote={kind:'quote',quoteId:q.id,revisionId:revision.revisionId,priceVersionId:pv.id};
 let n=0;const order=async()=>{const i=++n;return(await createAinuokeSalesOrder(pool,actor,{source:{sourceId:'BS-'+i,sourceRowIdentity:'ROW-'+i,salesContractNo:'SYNTHETIC-'+i,insideOrderNo:'IN-'+i,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYNTHETIC',companyNameSnapshot:'SYNTHETIC',customerNameSnapshot:'SYNTHETIC',brandNameSnapshot:'SYNTHETIC',quantity:100,sourceHash:'HASH-'+i,fetchedAt:'2026-10-17T00:00:00Z'},colors:[]})).salesOrder.id;};
 const command=async(id:string,selection:Record<string,unknown>=quote)=>{const p=await previewOrderBusinessSource(pool,actor,id,selection);return{selection,requestId:randomUUID(),expectedVersion:p.current.commercial.version,fingerprint:p.fingerprint,reason:'synthetic confirmed conditions'};};
 const a=await order(),b=await order(),first=await command(a);
 await t.test('quote adoption needs no owner and leaves order/source/execution identity untouched',async()=>{
  const tables=['sales_orders','sales_order_source_links','ainuoke_sales_order_contract_mirrors','sales_order_delivery_plans'];
  const read=()=>Promise.all(tables.map(table=>pool.query(`SELECT row_to_json(t) AS doc FROM ${table} t ORDER BY 1::text`).then(r=>r.rows)));
  const before=await read();await adoptOrderBusinessSource(pool,actor,a,first);assert.deepEqual(await read(),before);
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_identity_profiles WHERE owner_id IS NOT NULL')).rows[0].n,0);
  const state=await readOrderBusinessSource(pool,actor,a);assert.equal(state.source?.kind,'quote');assert.equal(state.commercial.current?.sale.visibility,'allowed');
  assert.equal(JSON.stringify(state).includes('product_snapshot'),false);assert.equal(JSON.stringify(state).includes('fabrics'),false);
 });
 await t.test('same request replays; changed payload and concurrent different requests cannot create duplicates',async()=>{
  const replay=await adoptOrderBusinessSource(pool,actor,a,first);assert.equal(replay.replayed,true);
  await assert.rejects(()=>adoptOrderBusinessSource(pool,actor,a,{...first,reason:'different'}),code('business_source_retry_mismatch'));
  const id=await order(),cmd=await command(id);const results=await Promise.allSettled([adoptOrderBusinessSource(pool,actor,id,cmd),adoptOrderBusinessSource(pool,actor,id,{...cmd,requestId:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await readOrderCommercialState(pool,id)).version,1);
 });
 await t.test('reorder copies original prices and product even after shared quotation changes',async()=>{
  await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,customer_confirmed_price,confirmed_labor_price,labor_currency) VALUES('quote',$1,$2,$3,130,15,'CNY')",[q.id,revision.revisionId,pv.id]);
  const reorder={kind:'reorder',referenceOrderId:a,unchanged:true};await adoptOrderBusinessSource(pool,actor,b,await command(b,reorder));
  assert.equal((await readOrderCommercialState(pool,b)).current?.salePrice,'120');assert.equal((await readOrderCommercialState(pool,b)).current?.laborPrice,'10');
  const rows=(await pool.query('SELECT product_snapshot,product_hash FROM sales_order_business_source_snapshots WHERE sales_order_id=ANY($1::uuid[])',[ [a,b] ])).rows;assert.deepEqual(rows[0],rows[1]);
  assert.equal((await readOrderBusinessSource(pool,actor,b)).source?.referenceOrderId,a);
 });
 await t.test('source conditions changing after preview require explicit fresh preview',async()=>{
  const id=await order(),stale=await command(id);await pool.query('UPDATE confirmed_commercial_terms SET customer_confirmed_price=140,version=version+1 WHERE quote_id=$1',[q.id]);
  await assert.rejects(()=>adoptOrderBusinessSource(pool,actor,id,stale),code('business_source_changed'));
  const reorder={kind:'reorder',referenceOrderId:a,unchanged:true},pending=await command(id,reorder);
  await adoptOrderBusinessSource(pool,actor,a,await command(a));
  await assert.rejects(()=>adoptOrderBusinessSource(pool,actor,id,pending),code('business_source_changed'));
  assert.equal((await readOrderCommercialState(pool,b)).current?.salePrice,'120');
 });
 await t.test('self references and indirect cycles cannot be saved',async()=>{
  await assert.rejects(()=>command(a,{kind:'reorder',referenceOrderId:a,unchanged:true}));
  await assert.rejects(()=>command(a,{kind:'reorder',referenceOrderId:b,unchanged:true}),code('lineage_cycle'));
 });
 await t.test('missing original conditions and frozen targets fail without guessing',async()=>{
  const empty=await order(),id=await order();await assert.rejects(()=>command(id,{kind:'reorder',referenceOrderId:empty,unchanged:true}),code('reference_commercial_snapshot_required'));
  await pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1",[id]);await assert.rejects(()=>command(id),code('order_commercial_frozen'));
 });
 await t.test('snapshots cannot be rewritten or deleted',async()=>{
  await assert.rejects(()=>pool.query("UPDATE sales_order_business_source_snapshots SET product_hash=repeat('a',64) WHERE sales_order_id=$1",[a]));
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_business_source_snapshots WHERE sales_order_id=$1',[a]));
 });
 await t.test('revocation blocks replay and restricted read contains no prices or costs',async()=>{
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='source-test' AND permission_key='order.lineage.edit'");
  await assert.rejects(()=>adoptOrderBusinessSource(pool,actor,a,first));await pool.query("INSERT INTO app_role_permissions VALUES('source-test','order.lineage.edit')");
  const restricted=await readOrderBusinessSource(pool,{...actor,permissions:['order.view']},a);assert.equal(restricted.commercial.current?.sale.visibility,'restricted');assert.equal(restricted.commercial.current?.labor.visibility,'restricted');assert.equal(JSON.stringify(restricted).includes('confirmedLaborPrice'),false);
 });
 await t.test('audit failure rolls back commercial pointer and product snapshot together',async()=>{
  const id=await order(),cmd=await command(id);await pool.query("CREATE FUNCTION reject_business_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='OrderCommercialVersion' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_business_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_business_audit()");
  try{await assert.rejects(()=>adoptOrderBusinessSource(pool,actor,id,cmd));assert.equal((await readOrderCommercialState(pool,id)).version,0);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_business_source_snapshots WHERE sales_order_id=$1',[id])).rows[0].n,0);}finally{await pool.query('DROP TRIGGER reject_business_audit ON operation_logs');}
 });
 await t.test('HTTP retires ownership/preparation/normalization and preserves mutation protection',async()=>{
  const origin='http://source-test.invalid',server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
  try{
   const headers={Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'},login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username:'source-test',password:'synthetic'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
   const req=(path:string,body?:object,extra={})=>fetch(base+path,{method:body?'POST':'GET',headers:{...headers,Cookie:cookie,...extra},...(body?{body:JSON.stringify(body)}:{})});
   const id=await order(),path='/api/v1/sales-orders/'+id+'/business-source';assert.equal((await fetch(base+path)).status,401);
   assert.equal((await req(path+'/preview',quote,{Origin:'http://evil.invalid'})).status,403);
   assert.equal((await req(path+'?actor=spoof')).status,400);
   const preview=await req(path+'/preview',quote);assert.equal(preview.status,200);const p=await preview.json();assert.equal(p.candidate.sale.value.price,'140');
   const saved=await req(path,{selection:quote,requestId:randomUUID(),expectedVersion:p.current.commercial.version,fingerprint:p.fingerprint,reason:'synthetic HTTP'});assert.equal(saved.status,200);
   for(const old of ['/api/v1/sales-orders/'+id+'/identity','/api/v1/sales-orders/'+id+'/preparation-adoptions','/api/v1/order-preparations','/api/v1/order-normalization-cases','/api/v1/order-normalization-workspace/proposals','/api/v1/sales-orders/'+id+'/commercial-versions','/api/v1/sales-orders/'+id+'/commercial-versions/preview']){const result=await req(old,{});assert.equal(result.status,410,old);assert.equal((await result.json()).error.code,'order_workflow_retired');}
   assert.equal((await req('/api/v1/order-claimants')).status,410);
  }finally{await new Promise<void>(done=>server.close(()=>done()));}
 });
 await t.test('reorder can use frozen evidence after the shared price version disappears',async()=>{
  for(const table of ['quote_center_fabric_lines','quote_center_trim_lines','quote_center_other_cost_lines'])await pool.query(`DELETE FROM ${table} WHERE snapshot_id IN (SELECT id FROM quote_center_cost_snapshots WHERE quote_id=$1 AND price_version_id=$2)`,[q.id,pv.id]);
  await pool.query('DELETE FROM quote_center_cost_snapshots WHERE quote_id=$1 AND price_version_id=$2',[q.id,pv.id]);await pool.query('DELETE FROM quote_center_price_versions WHERE quote_id=$1 AND id=$2',[q.id,pv.id]);
  const id=await order(),selection={kind:'reorder',referenceOrderId:b,unchanged:true};await adoptOrderBusinessSource(pool,actor,id,await command(id,selection));assert.equal((await readOrderCommercialState(pool,id)).current?.salePrice,'120');
 });
});

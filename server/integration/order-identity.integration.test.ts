import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createApp } from '../app.js';
import { randomUUID } from 'node:crypto';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createSalesOrder } from '../sales-orders/repository.js';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations, discoverMigrations } from '../db/migration-runner.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { createAinuokeSalesOrder, type CreateAinuokeSalesOrderInput } from '../sales-orders/service.js';
import { readOrderIdentity, mutateOrderIdentity, createOrderPreparation, listOrderPreparations, listClaimants } from '../sales-orders/identity-service.js';
import { parseIdentityCommand, parsePreparation } from '../sales-orders/identity-model.js';
import type { TrustedIdentity } from '../auth/session.js';

test('identity command rejects forged fields and invalid references',()=>{
 assert.throws(()=>parseIdentityCommand({action:'claim',expectedVersion:0,ownerId:randomUUID()}));
 assert.throws(()=>parseIdentityCommand({action:'lineage',expectedVersion:0,lineage:'first',referenceOrderId:randomUUID(),specificationChanges:''}));
 assert.throws(()=>parsePreparation({requestId:randomUUID(),referenceOrderId:randomUUID(),quantity:'1',deliveryDate:'2026-02-30',specificationChanges:''}));
});
test('order identity isolated domain', {timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('order_identity')});
 t.after(async()=>{await pool.end();await db.stop();});
 await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
 await pool.query("INSERT INTO app_roles(id,name) VALUES('identity-test','Identity test')");
 await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) SELECT 'identity-test',key FROM app_permissions");
 const users=[] as TrustedIdentity[];
 for(let i=0;i<2;i++){
  const u=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic',gen_salt('bf',4)),$1,'admin') RETURNING id::text,public_id::text",[`identity-${i}`])).rows[0];
  await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'identity-test')",[u.id]);
  users.push({internalUserId:u.id,userId:u.public_id,username:`identity-${i}`,userName:`Identity ${i}`,permissions:['order.view','ainuoke.sync']});
 }
 const actor=users[0];let n=0;
 const inputs:CreateAinuokeSalesOrderInput[]=[];
 const create=async()=>{const x=++n;const input:CreateAinuokeSalesOrderInput={source:{sourceId:`I-${x}`,sourceRowIdentity:`R-${x}`,salesContractNo:`SC-${x}`,insideOrderNo:`IN-${x}`,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYNTHETIC',companyNameSnapshot:'TEST',customerNameSnapshot:'TEST',brandNameSnapshot:'TEST',quantity:100,sourceHash:`H-${x}`,fetchedAt:'2026-10-14T00:00:00Z'},colors:[]};inputs.push(input);return(await createAinuokeSalesOrder(pool,actor,input)).salesOrder.id;};
 const a=await create();const b=await create();
 await t.test('contract creation replays once and detects source identity changes',async()=>{
  const input=inputs[0];const results=await Promise.all([createAinuokeSalesOrder(pool,actor,input),createAinuokeSalesOrder(pool,actor,input)]);assert.ok(results.every(r=>r.salesOrder.id===a&&!r.created));
  for(const source of [{...input.source,salesContractNo:'SC-CHANGED'},{...input.source,sourceId:'NEW-ID',sourceRowIdentity:'NEW-ROW'}])await assert.rejects(()=>createAinuokeSalesOrder(pool,actor,{...input,source}),(e:unknown)=>(e as {code:string}).code==='source_contract_identity_conflict');
  const fresh={...input,source:{...input.source,sourceId:'CONCURRENT',sourceRowIdentity:'CONCURRENT',salesContractNo:'SC-CONCURRENT'}};
  const concurrent=await Promise.all([createAinuokeSalesOrder(pool,actor,fresh),createAinuokeSalesOrder(pool,actor,fresh)]);assert.equal(concurrent[0].salesOrder.id,concurrent[1].salesOrder.id);assert.equal(concurrent.filter(r=>r.created).length,1);
 });
 await t.test('public API enforces session, mutation boundary and creation policy',async()=>{
  const origin='http://identity-test.invalid';const server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
  try{
   const headers={Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'};
   const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username:'identity-0',password:'synthetic'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
   const id=await create();const path='/api/v1/sales-orders/'+id+'/identity';
   const req=(url:string,method='GET',body?:object,extra:Record<string,string>={})=>fetch(base+url,{method,headers:{...headers,Cookie:cookie,...extra},...(body?{body:JSON.stringify(body)}:{})});
   assert.equal((await fetch(base+path)).status,401);
   assert.equal((await req(path+'?actor=spoof')).status,400);
   assert.equal((await req(path,'PATCH',{action:'claim',expectedVersion:0},{Origin:'http://evil.invalid'})).status,403);
   assert.equal((await req(path,'PATCH',{action:'claim',expectedVersion:0},{'X-Zhixu-Request':'0'})).status,403);
   assert.equal((await req(path,'PATCH',{action:'claim',expectedVersion:0,creationSource:'ainuoke'})).status,400);
   assert.equal((await req(path,'PATCH',{action:'claim',expectedVersion:0})).status,200);
   assert.equal((await req(path,'PATCH',{action:'claim',expectedVersion:0})).status,409);
   assert.equal((await req('/api/v1/sales-orders','POST',{creationSource:'quote'})).status,404);
   assert.equal((await req('/api/v1/quotes/fake/sales-orders','POST',{creationSource:'ainuoke'})).status,404);
   assert.equal((await req('/api/v1/order-preparations?referenceOrderId='+id+'&offset=NaN')).status,400);
   assert.equal((await req('/api/v1/order-preparations?referenceOrderId='+id+'&offset=0&offset=20')).status,400);
   assert.equal((await req('/api/v1/order-claimants')).status,200);
   const preparation={requestId:randomUUID(),referenceOrderId:id,quantity:'42',deliveryDate:null,specificationChanges:'synthetic'};
   assert.equal((await req('/api/v1/order-preparations','POST',preparation)).status,200);
   const list=await req('/api/v1/order-preparations?referenceOrderId='+id);assert.equal(list.headers.get('cache-control'),'no-store');assert.equal((await list.json()).items[0].quantity,'42');
   await pool.query("DELETE FROM app_role_permissions WHERE role_id='identity-test' AND permission_key='order.transfer'");
   assert.equal((await req('/api/v1/order-claimants')).status,403);
   await pool.query("INSERT INTO app_role_permissions VALUES('identity-test','order.transfer')");
  }finally{await new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()));}
 });
 await t.test('read derives trusted type without backfill',async()=>{assert.equal((await readOrderIdentity(pool,a)).businessType,'ainuoke_contract');assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_identity_profiles WHERE sales_order_id=$1',[a])).rows[0].n,0);});
 await t.test('competing claims produce one winner',async()=>{const results=await Promise.allSettled(users.map(u=>mutateOrderIdentity(pool,u,a,{action:'claim',expectedVersion:0})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await readOrderIdentity(pool,a)).version,2);});
 await t.test('transfer and lineage preserve aggregate, source and delivery plans',async()=>{
  const before=(await pool.query('SELECT row_to_json(o) doc FROM sales_orders o WHERE id=$1',[a])).rows[0];
  const plans=(await pool.query('SELECT row_to_json(p) doc FROM sales_order_delivery_plans p WHERE sales_order_id=$1 ORDER BY id',[a])).rows;
  await mutateOrderIdentity(pool,actor,a,{action:'transfer',expectedVersion:2,ownerId:actor.userId,reason:'synthetic transfer'});
  await mutateOrderIdentity(pool,actor,a,{action:'lineage',expectedVersion:3,lineage:'reorder',referenceOrderId:b,specificationChanges:'changed size'});
  assert.deepEqual((await pool.query('SELECT row_to_json(o) doc FROM sales_orders o WHERE id=$1',[a])).rows[0],before);
  assert.deepEqual((await pool.query('SELECT row_to_json(p) doc FROM sales_order_delivery_plans p WHERE sales_order_id=$1 ORDER BY id',[a])).rows,plans);
 });
 await t.test('self and indirect lineage cycles roll back',async()=>{
  await mutateOrderIdentity(pool,actor,b,{action:'claim',expectedVersion:0});
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,b,{action:'lineage',expectedVersion:2,lineage:'reorder',referenceOrderId:a,specificationChanges:''}));
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,a,{action:'lineage',expectedVersion:4,lineage:'reorder',referenceOrderId:a,specificationChanges:''}));
  assert.equal((await readOrderIdentity(pool,b)).lineage,'pending');
 });
 await t.test('preparation is idempotent and never allocates SO',async()=>{
  const count=(await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n;
  const cmd={requestId:randomUUID(),referenceOrderId:a,quantity:'100',deliveryDate:'2026-12-01',specificationChanges:'test'};
  const results=await Promise.all([createOrderPreparation(pool,actor,cmd),createOrderPreparation(pool,actor,cmd)]);
  assert.equal((await listOrderPreparations(pool,a,0)).items[0].quantity,'100');assert.equal((await listClaimants(pool)).users.length,2);
  assert.equal(results[0].id,results[1].id);assert.equal(results.filter(r=>r.replayed).length,1);
  await assert.rejects(()=>createOrderPreparation(pool,actor,{...cmd,quantity:'101'}));
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,count);
 });
 await t.test('audit failure rolls back a successful profile update',async()=>{
  await pool.query("CREATE FUNCTION reject_identity_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='SalesOrderIdentity' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER reject_identity_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_identity_audit()');
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,a,{action:'lineage',expectedVersion:4,lineage:'first',referenceOrderId:null,specificationChanges:''}));
  assert.equal((await readOrderIdentity(pool,a)).version,4);
  await pool.query('DROP TRIGGER reject_identity_audit ON operation_logs');
 });
 await t.test('concurrent opposing lineage changes cannot create a cycle',async()=>{
  const c=await create(),d=await create();for(const id of [c,d])await mutateOrderIdentity(pool,actor,id,{action:'claim',expectedVersion:0});
  const result=await Promise.allSettled([[c,d],[d,c]].map(([id,ref])=>mutateOrderIdentity(pool,actor,id,{action:'lineage',expectedVersion:2,lineage:'reorder',referenceOrderId:ref,specificationChanges:''})));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
 });
 await t.test('unclassified legacy orders, inactive targets and non-owner edits are rejected',async()=>{
  const legacy=await createSalesOrder(pool,{creationSource:'manual'});
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,legacy.id,{action:'claim',expectedVersion:0}),(e:unknown)=>(e as {code:string}).code==='trusted_contract_required');
  await pool.query('UPDATE app_users SET active=false WHERE id=$1',[users[1].internalUserId]);
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,a,{action:'transfer',expectedVersion:4,ownerId:users[1].userId,reason:'test'}),(e:unknown)=>(e as {code:string}).code==='claim_target_unavailable');
  await pool.query('UPDATE app_users SET active=true WHERE id=$1',[users[1].internalUserId]);
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='identity-test' AND permission_key='order.transfer'");
  await assert.rejects(()=>mutateOrderIdentity(pool,users[1],a,{action:'lineage',expectedVersion:4,lineage:'first',referenceOrderId:null,specificationChanges:''}),(e:unknown)=>(e as {code:string}).code==='order_owner_required');
  await pool.query("INSERT INTO app_role_permissions VALUES('identity-test','order.transfer')");
  assert.equal((await readOrderIdentity(pool,a)).version,4);
 });
 await t.test('database protects identity and preparation history from replacement',async()=>{
  await assert.rejects(()=>pool.query("UPDATE sales_order_identity_profiles SET business_type='processing',version=version+1 WHERE sales_order_id=$1",[a]));
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_identity_profiles WHERE sales_order_id=$1',[a]));
  await assert.rejects(()=>pool.query('UPDATE sales_order_identity_profiles SET owner_id=NULL WHERE sales_order_id=$1',[a]));
  await assert.rejects(()=>pool.query('UPDATE sales_order_preparations SET quantity=0 WHERE reference_order_id=$1',[a]));
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_preparations WHERE reference_order_id=$1',[a]));
 });
 await t.test('permissions re-read; revoked grant leaves profile unchanged',async()=>{
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='identity-test' AND permission_key='order.lineage.edit'");
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,a,{action:'lineage',expectedVersion:4,lineage:'first',referenceOrderId:null,specificationChanges:''}));
  assert.equal((await readOrderIdentity(pool,a)).version,4);
 });
});

test('0014–0023 isolated upgrade preserves legacy identity, permissions and schema history',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('identity_upgrade')});const temp=await mkdtemp(join(tmpdir(),'zhixu-identity-upgrade-'));
 t.after(async()=>{await pool.end();await db.stop();const distance=relative(resolve(tmpdir()),resolve(temp));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));await rm(temp,{recursive:true,force:true});});
 for(const m of await discoverMigrations(resolve('database/migrations')))if(Number(m.version)<14)await writeFile(join(temp,m.filename),m.sql);
 await runMigrations(pool,temp);await synchronizePermissionCatalog(pool);
 const legacy=await createSalesOrder(pool,{creationSource:'manual'});
 const before=(await pool.query('SELECT row_to_json(o) doc FROM sales_orders o ORDER BY id')).rows;
 const grants=(await pool.query('SELECT row_to_json(r) doc FROM app_role_permissions r ORDER BY role_id,permission_key')).rows;
 assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,['0014_order_identity.sql','0015_order_commercial_versions.sql','0016_processing_order_batches.sql','0017_order_normalization_cases.sql','0018_order_effective_attribution.sql','0019_order_normalization_reviews.sql','0020_order_attribution_write_guards.sql','0021_order_command_control.sql','0022_source_history_context.sql','0023_order_preparation_adoption.sql']);
 assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,[]);
 assert.deepEqual((await pool.query('SELECT row_to_json(o) doc FROM sales_orders o ORDER BY id')).rows,before);
 assert.deepEqual((await pool.query('SELECT row_to_json(r) doc FROM app_role_permissions r ORDER BY role_id,permission_key')).rows,grants);
 assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions')).rows[0].n,0);
 assert.equal((await readOrderIdentity(pool,legacy.id)).businessType,'unclassified');
 assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_identity_profiles')).rows[0].n,0);
});

import { createServer } from 'node:http';
import { createApp } from '../app.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { createSalesOrder } from '../sales-orders/repository.js';
import { previewOrderNormalization } from '../sales-orders/normalization-preview.js';
import type { TrustedIdentity } from '../auth/session.js';

test('normalization preview reads only synthetic disposable database', {timeout:180000}, async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('normalization')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));
 const user=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('synthetic-preview',crypt('synthetic',gen_salt('bf',4)),'Synthetic','admin') RETURNING id::text,public_id::text")).rows[0];
 const actor:TrustedIdentity={internalUserId:user.id,userId:user.public_id,username:'synthetic-preview',userName:'Synthetic',permissions:['order.view']};
 const a=await createSalesOrder(pool,{creationSource:'manual'}),b=await createSalesOrder(pool,{creationSource:'manual'});
 await t.test('legacy role and cached grants do not authorize preview',async()=>{await assert.rejects(()=>previewOrderNormalization(pool,actor,[a.id,b.id]),/Administrator required/);});
 await pool.query("INSERT INTO app_roles(id,name,description) VALUES('role-server-admin','Synthetic admin','synthetic') ON CONFLICT DO NOTHING");
 await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'role-server-admin')",[user.id]);
 await pool.query("INSERT INTO app_permissions(key,module,label,description) VALUES('order.view','order','view','synthetic') ON CONFLICT DO NOTHING");
 await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-server-admin','order.view') ON CONFLICT DO NOTHING");
 await t.test('empty server references remain unknown for external execution, and no writes occur',async()=>{
  const before=(await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows;
  const result=await previewOrderNormalization(pool,actor,[a.id,b.id]);
  assert.equal(result.assessment.disposition,'coverage_incomplete');assert.equal(result.assessment.executionAuthorized,false);
  assert.deepEqual(result.unknownReferences,[]);assert.equal(result.orders[0].evidence.execution.count,null);
  assert.deepEqual((await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,before);
  assert.equal(result.reviewHash,(await previewOrderNormalization(pool,actor,[a.id,b.id])).reviewHash);
 });
 await t.test('new unclassified FK is surfaced without pretending an empty table is safe',async()=>{
  await pool.query('CREATE TABLE synthetic_external_execution(id uuid PRIMARY KEY, owner uuid REFERENCES sales_orders(id))');
  const result=await previewOrderNormalization(pool,actor,[a.id,b.id]);
  assert.deepEqual(result.unknownReferences,['public.synthetic_external_execution.owner']);assert.equal(result.assessment.candidateOrderId,null);
 });
 await t.test('source-order reference has stable identity and changes review fingerprint',async()=>{
  const first=await previewOrderNormalization(pool,actor,[a.id,b.id]);
  const child=await createSalesOrder(pool,{creationSource:'reorder',sourceOrderId:a.id});
  const second=await previewOrderNormalization(pool,actor,[a.id,b.id]);
  assert.notEqual(first.reviewHash,second.reviewHash);assert.deepEqual(second.orders[0].inventory.find(r=>r.relation==='sales_orders')?.sampleIds,[child.id]);
 });
 await t.test('invalid pair and missing orders fail without partial preview',async()=>{
  await assert.rejects(()=>previewOrderNormalization(pool,actor,[a.id,a.id]));
  await assert.rejects(()=>previewOrderNormalization(pool,actor,[a.id,'00000000-0000-4000-8000-000000000001']),/Sales order not found/);
 });
 await t.test('HTTP session preview rejects untrusted requests and cannot execute normalization',async()=>{
  const origin='http://normalization-test.invalid';
  const server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
  const path='/api/v1/order-normalization-preview';const headers={'Content-Type':'application/json',Origin:origin,'X-Zhixu-Request':'1'};
  try {
   assert.equal((await fetch(base+path,{method:'POST',headers,body:JSON.stringify({orderIds:[a.id,b.id]})})).status,401);
   const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username:'synthetic-preview',password:'synthetic'})});assert.equal(login.status,200);
   const Cookie=login.headers.get('set-cookie')!.split(';')[0];
   const request=(body:unknown,url=path,extra:Record<string,string>={})=>fetch(base+url,{method:'POST',headers:{...headers,Cookie,...extra},body:JSON.stringify(body)});
   const valid=await request({orderIds:[a.id,b.id]});assert.equal(valid.status,200);assert.equal(valid.headers.get('cache-control'),'no-store');
   const json=await valid.json();assert.equal(json.assessment.executionAuthorized,false);assert.equal(json.assessment.disposition,'coverage_incomplete');
   for(const body of [{orderIds:[a.id,b.id],execute:true},{orderIds:[a.id,a.id]},{orderIds:[a.id]},{orderIds:[a.id,2]},{orderIds:[a.id,b.id],execution:{count:0,coverage:'verified'}}]) assert.equal((await request(body)).status,400);
   assert.equal((await request({orderIds:[a.id,b.id]},path+'?execute=true')).status,400);
   assert.equal((await request({orderIds:[a.id,b.id]},path,{Origin:'http://untrusted.invalid'})).status,403);
   assert.equal((await fetch(base+path,{headers:{Cookie}})).status,405);
   assert.equal((await request({orderIds:[a.id,b.id],padding:'x'.repeat(3000)})).status,413);
   await pool.query("DELETE FROM app_user_roles WHERE user_id=$1 AND role_id='role-server-admin'",[user.id]);
   assert.equal((await request({orderIds:[a.id,b.id]})).status,403);
   await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'role-server-admin')",[user.id]);
  } finally {await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
 });
 await t.test('fresh permission revocation overrides actor grants',async()=>{
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='order.view'");
  await assert.rejects(()=>previewOrderNormalization(pool,actor,[a.id,b.id]));
 });
});

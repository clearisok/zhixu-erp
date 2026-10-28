import { createServer } from 'node:http';
import { createApp } from '../app.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { createSalesOrder } from '../sales-orders/repository.js';
import { normalizationReferences, previewOrderNormalization } from '../sales-orders/normalization-preview.js';
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
 await t.test('month ownership references cannot omit a partial schema cohort',async()=>{
  const client=await pool.connect();try{
   await client.query('BEGIN');await client.query('ALTER TABLE server_closing_month_commands RENAME TO synthetic_hidden_month_commands');
   await assert.rejects(()=>normalizationReferences(client),(error:unknown)=>(error as {code:string}).code==='closing_month_reference_schema_incomplete');
   for(const table of ['server_closing_month_plans','server_closing_month_plan_versions','server_closing_month_plan_heads'])await client.query('ALTER TABLE '+table+' RENAME TO synthetic_hidden_'+table);
   // A pre-0047 cohort cannot retain the dependent 0049 financial link table.
   await assert.rejects(()=>normalizationReferences(client),(error:unknown)=>(error as {code:string}).code==='closing_month_financial_schema_incomplete');
   await client.query('ALTER TABLE server_closing_month_financial_links RENAME TO synthetic_hidden_month_financial_links');
   assert.equal((await normalizationReferences(client)).some(([table])=>table.startsWith('server_closing_month_')),false);
  }finally{await client.query('ROLLBACK');client.release();}
 });
 await t.test('color reference schema is optional before upgrade, but a partial upgrade fails closed',async()=>{
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('ALTER TABLE sales_order_commercial_lines RENAME TO synthetic_hidden_commercial_lines');
   await assert.rejects(()=>normalizationReferences(client),(error:unknown)=>(error as {code:string}).code==='color_reference_schema_incomplete');
   await client.query('ALTER TABLE sales_order_color_identities RENAME TO synthetic_hidden_color_identities');
   // A pre-0028 rehearsal cannot retain the dependent 0046 receipt table.
   await client.query('ALTER TABLE order_labor_adoption_commands RENAME TO synthetic_hidden_labor_commands');
   const references=await normalizationReferences(client);
   assert.equal(references.some(([table])=>table==='sales_order_color_identities'||table==='sales_order_commercial_lines'),false);
  }finally{await client.query('ROLLBACK');client.release();}
 });
 await t.test('labor evidence column and receipt table must be upgraded together',async()=>{
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('ALTER TABLE order_labor_adoption_commands RENAME TO synthetic_hidden_labor_commands');
   await assert.rejects(()=>normalizationReferences(client),(error:unknown)=>(error as {code:string}).code==='labor_adoption_reference_schema_incomplete');
   await client.query('ALTER TABLE sales_order_commercial_lines RENAME COLUMN labor_confirmation_source TO synthetic_hidden_labor_source');
   assert.equal((await normalizationReferences(client)).some(([table])=>table==='order_labor_adoption_commands'),false);
  }finally{await client.query('ROLLBACK');client.release();}
 });
 await t.test('sale adjustment reference schema cannot silently omit a partial upgrade',async()=>{
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('ALTER TABLE order_sale_adjustment_operations RENAME TO synthetic_hidden_adjustment_operations');
   await assert.rejects(()=>normalizationReferences(client),(error:unknown)=>(error as {code:string}).code==='adjustment_reference_schema_incomplete');
   await client.query('ALTER TABLE order_sale_adjustment_receipts RENAME TO synthetic_hidden_adjustment_receipts');
   assert.equal((await normalizationReferences(client)).some(([table])=>table==='order_sale_adjustment_receipts'),false);
  }finally{await client.query('ROLLBACK');client.release();}
 });
 await t.test('creation references are optional before their forward migration',async()=>{
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   assert.equal((await normalizationReferences(client)).some(([table])=>table==='quote_creation_order_contexts'),true);
   await client.query('ALTER TABLE quote_creation_order_contexts RENAME TO synthetic_hidden_creation_contexts');
   assert.equal((await normalizationReferences(client)).some(([table])=>table==='quote_creation_order_contexts'),false);
  }finally{await client.query('ROLLBACK');client.release();}
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
 await t.test('contract comparison preserves exact source facts and omits raw metadata or commercial amounts',async()=>{
  const contract=await createSalesOrder(pool,{creationSource:'ainuoke'});
  await pool.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no,inside_order_no) VALUES($1,'ainuoke','sales_contract','synthetic-source-id','SYN-CONTRACT-01','SYN-FACTORY-01')",[contract.id]);
  await pool.query(`INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,style_no,customer_name_snapshot,quantity,source_hash,fetched_at,source_metadata) VALUES($1,'synthetic-source-id','synthetic-source-row','SYN-CONTRACT-01','SYN-FACTORY-01','SYN-BUSINESS-01','Synthetic Customer',10.25,'synthetic-hash',now(),$2)`,[contract.id,JSON.stringify({protectedInternalPrice:'do-not-expose-synthetic-value'})]);
  const preview=await previewOrderNormalization(pool,actor,[contract.id,b.id]);
  assert.equal(preview.orders[0].contractFacts.sales_contract_no,'SYN-CONTRACT-01');assert.equal(preview.orders[0].contractFacts.style_no,'SYN-BUSINESS-01');assert.equal(preview.orders[0].contractFacts.inside_order_no,'SYN-FACTORY-01');assert.equal(preview.orders[0].contractFacts.quantity,'10.25');assert.equal(preview.orders[0].evidence.trustedContract,true);
  assert.equal(JSON.stringify(preview).includes('do-not-expose-synthetic-value'),false);
  const previous=preview.reviewHash;await pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET style_no='SYN-BUSINESS-02' WHERE sales_order_id=$1",[contract.id]);assert.notEqual((await previewOrderNormalization(pool,actor,[contract.id,b.id])).reviewHash,previous);
 });
 await t.test('fresh permission revocation overrides actor grants',async()=>{
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='order.view'");
  await assert.rejects(()=>previewOrderNormalization(pool,actor,[a.id,b.id]));
 });
});

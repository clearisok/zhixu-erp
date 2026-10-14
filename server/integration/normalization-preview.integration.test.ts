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
 const user=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('synthetic-preview','unused','Synthetic','admin') RETURNING id::text,public_id::text")).rows[0];
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
 await t.test('fresh permission revocation overrides actor grants',async()=>{
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='order.view'");
  await assert.rejects(()=>previewOrderNormalization(pool,actor,[a.id,b.id]));
 });
});

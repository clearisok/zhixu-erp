import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';
import { readOrderIdentity, mutateOrderIdentity, createOrderPreparation } from '../sales-orders/identity-service.js';
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
 const create=async()=>{const x=++n;return(await createAinuokeSalesOrder(pool,actor,{source:{sourceId:`I-${x}`,sourceRowIdentity:`R-${x}`,salesContractNo:`SC-${x}`,insideOrderNo:`IN-${x}`,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYNTHETIC',companyNameSnapshot:'TEST',customerNameSnapshot:'TEST',brandNameSnapshot:'TEST',quantity:100,sourceHash:`H-${x}`,fetchedAt:'2026-10-14T00:00:00Z'},colors:[]})).salesOrder.id;};
 const a=await create();const b=await create();
 await t.test('read derives trusted type without backfill',async()=>{assert.equal((await readOrderIdentity(pool,a)).businessType,'ainuoke_contract');assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_identity_profiles')).rows[0].n,0);});
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
 await t.test('permissions re-read; revoked grant leaves profile unchanged',async()=>{
  await pool.query("DELETE FROM app_role_permissions WHERE role_id='identity-test' AND permission_key='order.lineage.edit'");
  await assert.rejects(()=>mutateOrderIdentity(pool,actor,a,{action:'lineage',expectedVersion:4,lineage:'first',referenceOrderId:null,specificationChanges:''}));
  assert.equal((await readOrderIdentity(pool,a)).version,4);
 });
});

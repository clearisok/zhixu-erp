import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import pg from 'pg';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { runMigrations, verifyMigrationsCurrent } from '../db/migration-runner.js';
import { startDisposablePostgres } from './postgres-container.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import type { TrustedIdentity } from '../auth/session.js';
import { createAinuokeSalesOrder, type CreateAinuokeSalesOrderInput } from '../sales-orders/service.js';
import { readDeliveryPlanSet } from '../sales-orders/delivery-plan-repository.js';
import { updateDeliveryPlans } from '../sales-orders/delivery-plan-service.js';
import { refreshAinuokeSalesOrderSource } from '../sales-orders/delivery-plan-source-refresh.js';
import { parseDeliveryPlanCommand } from '../sales-orders/delivery-plan-model.js';

test('C4.3 DeliveryPlan isolated PostgreSQL domain', { timeout: 180_000 }, async t => {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase('delivery_plans') });
  t.after(async () => { try { await pool.end(); } finally { await postgres.stop(); } });
  await runMigrations(pool, resolve('database/migrations'));
  await synchronizePermissionCatalog(pool);
  const user = (await pool.query<{id:string;public_id:string}>(`INSERT INTO app_users(username,password_hash,display_name,role)
    VALUES ('plan-test',crypt('synthetic-password',gen_salt('bf',4)),'Plan actor','admin') RETURNING id::text,public_id::text`)).rows[0];
  const actor: TrustedIdentity = { internalUserId:user.id, userId:user.public_id, username:'plan-test',userName:'Plan actor',permissions:['order.view','order.edit','ainuoke.sync'] };
  let serial = 0;
  function fixture(date: string | null = '2026-11-01', quantity = 100): CreateAinuokeSalesOrderInput {
    const n = ++serial;
    return { source: {sourceId:`source-${n}`,sourceRowIdentity:`row-${n}`,salesContractNo:`SC-PLAN-${n}`,insideOrderNo:`IN-${n}`,
      lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:date,styleNo:'SYNTHETIC',companyNameSnapshot:'TEST',
      customerNameSnapshot:'TEST',brandNameSnapshot:'TEST',quantity,sourceHash:`hash-${n}`,fetchedAt:'2026-10-09T00:00:00Z'}, colors:[] };
  }
  const create = async (input = fixture()) => ({input, id:(await createAinuokeSalesOrder(pool,actor,input)).salesOrder.id});
  const read = (id:string) => readDeliveryPlanSet(pool,id);
  const change = async (order:Awaited<ReturnType<typeof create>>,date:string|null,quantity=order.input.source.quantity) => {
    const plans=await read(order.id);
    const input={...order.input,source:{...order.input.source,contractDeliveryDate:date,quantity,sourceHash:order.input.source.sourceHash+'x'}};
    const result=await refreshAinuokeSalesOrderSource(pool,actor,order.id,{...input,expectedSourceHash:order.input.source.sourceHash,expectedPlanVersion:plans.version});
    order.input=input;
    return result.deliveryPlanSet;
  };
  await t.test('migration is idempotent, schema-only and startup verify-only',async()=>{
    assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,[]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM sales_order_delivery_plan_sets')).rows[0].n,0);
    const other=new pg.Pool({connectionString:await postgres.createDatabase('plan_pending')});
    try { await assert.rejects(()=>verifyMigrationsCurrent(other,resolve('database/migrations'))); assert.equal((await other.query("SELECT to_regclass('sales_order_delivery_plan_sets') AS t")).rows[0].t,null); } finally {await other.end();}
  });
  await t.test('first create initializes one stable default, replay changes nothing',async()=>{
    const order=await create();const before=await read(order.id);
    assert.equal(before.ownership,'source_derived');assert.equal(before.version,1);assert.equal(before.plans.length,1);
    assert.equal(before.plans[0].quantity,'100');assert.equal(before.reconciliation.dateStatus,'matched');
    const logs=(await pool.query('SELECT count(*)::int AS n FROM operation_logs')).rows[0].n;
    assert.equal((await createAinuokeSalesOrder(pool,actor,order.input)).salesOrder.id,order.id);
    assert.deepEqual(await read(order.id),before);assert.equal((await pool.query('SELECT count(*)::int AS n FROM operation_logs')).rows[0].n,logs);
    for(let repeat=0;repeat<2;repeat++) {
      await refreshAinuokeSalesOrderSource(pool,actor,order.id,{...order.input,expectedSourceHash:order.input.source.sourceHash,expectedPlanVersion:before.version});
      assert.deepEqual(await read(order.id),before);
    }
  });
  await t.test('no date has no row, later date does not fabricate a default; zero remains zero',async()=>{
    const order=await create(fixture(null,0));assert.equal((await read(order.id)).plans.length,0);
    const later=await change(order,'2026-12-01');assert.equal(later.plans.length,0);assert.equal(later.reconciliation.dateStatus,'drift');
    const zero=await create(fixture('2026-12-01',0));assert.equal((await read(zero.id)).plans[0].quantity,'0');
  });
  await t.test('untouched date follows, null suspends, restoration preserves ID and quantity snapshot',async()=>{
    const order=await create();const id=(await read(order.id)).plans[0].id;
    assert.equal((await change(order,'2026-12-01',120)).plans[0].id,id);
    let plans=await change(order,null,120);assert.equal(plans.plans[0].deliveryDate,null);assert.equal(plans.plans[0].id,id);
    plans=await change(order,'2026-12-15',120);assert.equal(plans.plans[0].id,id);assert.equal(plans.plans[0].quantity,'100');
    assert.equal(plans.reconciliation.quantityStatus,'short');
  });
  await t.test('multi-row edit permanently claims whole collection, drift and restoration are explicit',async()=>{
    const order=await create();const before=await read(order.id);const id=before.plans[0].id;
    let plans=await updateDeliveryPlans(pool,actor,order.id,{expectedVersion:before.version,
      upserts:[{id,deliveryDate:'2026-11-01',quantity:'40'},{id:null,deliveryDate:'2026-11-15',quantity:'60'}],voidIds:[]});
    assert.equal(plans.ownership,'user_managed');assert.equal(plans.plans.length,2);assert.equal(plans.reconciliation.quantityStatus,'matched');
    const rows=plans.plans;plans=await change(order,'2026-12-01');assert.deepEqual(plans.plans,rows);assert.equal(plans.reconciliation.dateStatus,'drift');
    plans=await updateDeliveryPlans(pool,actor,order.id,{expectedVersion:plans.version,upserts:rows.map(row=>({id:row.id,deliveryDate:'2026-12-01',quantity:row.quantity})),voidIds:[]});
    assert.equal(plans.reconciliation.dateStatus,'matched');await change(order,null);assert.equal((await read(order.id)).reconciliation.dateStatus,'drift');
    await assert.rejects(()=>pool.query("UPDATE sales_order_delivery_plan_sets SET ownership='source_derived',version=version+1 WHERE sales_order_id=$1",[order.id]),(e:unknown)=>(e as {code:string}).code==='23514');
    await assert.rejects(()=>pool.query('DELETE FROM sales_order_delivery_plan_sets WHERE sales_order_id=$1',[order.id]));
  });
  await t.test('even same-value edit is intervention; void retains ID and blocks further mutation',async()=>{
    const order=await create();const before=await read(order.id);const row=before.plans[0];
    let plans=await updateDeliveryPlans(pool,actor,order.id,{expectedVersion:1,upserts:[{id:row.id,deliveryDate:row.deliveryDate,quantity:row.quantity}],voidIds:[]});
    assert.equal(plans.ownership,'user_managed');await change(order,'2027-01-01');assert.equal((await read(order.id)).plans[0].deliveryDate,row.deliveryDate);
    plans=await read(order.id);plans=await updateDeliveryPlans(pool,actor,order.id,{expectedVersion:plans.version,upserts:[],voidIds:[row.id]});
    assert.ok(plans.plans[0].voidedAt);assert.equal(plans.plans[0].id,row.id);
    await assert.rejects(()=>updateDeliveryPlans(pool,actor,order.id,{expectedVersion:plans.version,upserts:[],voidIds:[row.id]}));
    await assert.rejects(()=>pool.query('DELETE FROM sales_order_delivery_plans WHERE id=$1',[row.id]));
  });
  await t.test('CAS and concurrent writers yield one commit; no lost updates',async()=>{
    const order=await create();const row=(await read(order.id)).plans[0];
    const command={expectedVersion:1,upserts:[{id:row.id,deliveryDate:'2026-12-01',quantity:'100'}],voidIds:[]};
    const results=await Promise.allSettled([updateDeliveryPlans(pool,actor,order.id,command),updateDeliveryPlans(pool,actor,order.id,command)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failure=results.find(r=>r.status==='rejected');
    assert.equal(failure?.status==='rejected' ? failure.reason.status : null,409);
    assert.equal((await read(order.id)).version,2);
  });
  await t.test('source/user competition uses root lock and CAS; source and owned state are never mixed',async()=>{
    const order=await create();const row=(await read(order.id)).plans[0];
    const results=await Promise.allSettled([
      updateDeliveryPlans(pool,actor,order.id,{expectedVersion:1,upserts:[{id:row.id,deliveryDate:'2026-12-01',quantity:'100'}],voidIds:[]}),
      refreshAinuokeSalesOrderSource(pool,actor,order.id,{...order.input,source:{...order.input.source,contractDeliveryDate:'2027-01-01',sourceHash:'compete'},expectedSourceHash:order.input.source.sourceHash,expectedPlanVersion:1}),
    ]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const plans=await read(order.id);assert.equal(plans.version,2);
    if(plans.ownership==='source_derived') {
      assert.equal(plans.sourceDeliveryDate,'2027-01-01');assert.equal(plans.plans[0].deliveryDate,'2027-01-01');
    } else {
      assert.equal(plans.sourceDeliveryDate,'2026-11-01');assert.equal(plans.plans[0].deliveryDate,'2026-12-01');
    }
  });
  await t.test('audit failure rolls back ownership, rows, source mirrors and versions',async()=>{
    const order=await create();const before=await read(order.id);const badActor={...actor,internalUserId:'999999999'};
    await assert.rejects(()=>updateDeliveryPlans(pool,badActor,order.id,{expectedVersion:1,upserts:[{id:null,deliveryDate:'2026-12-01',quantity:'100'}],voidIds:[]}));
    assert.deepEqual(await read(order.id),before);
    await assert.rejects(()=>refreshAinuokeSalesOrderSource(pool,badActor,order.id,{...order.input,source:{...order.input.source,contractDeliveryDate:'2027-01-01',sourceHash:'rollback'},expectedSourceHash:order.input.source.sourceHash,expectedPlanVersion:1}));
    assert.deepEqual(await read(order.id),before);
  });
  await t.test('no permission, forged ownership/actor/date/null, foreign ID and stale source fail closed',async()=>{
    const order=await create();const row=(await read(order.id)).plans[0];const cmd={expectedVersion:1,upserts:[{id:row.id,deliveryDate:'2026-12-01',quantity:'100'}],voidIds:[]};
    await assert.rejects(()=>updateDeliveryPlans(pool,{...actor,permissions:['order.view']},order.id,cmd),(e:unknown)=>(e as {status:number}).status===403);
    for(const extra of [{ownership:'source_derived'},{actorUserId:'fake'},{sourceDeliveryDate:'2027-01-01'}]) assert.throws(()=>parseDeliveryPlanCommand({...cmd,...extra}));
    for(const deliveryDate of ['2026-02-30','2026-99-99',null]) assert.throws(()=>parseDeliveryPlanCommand({...cmd,upserts:[{...cmd.upserts[0],deliveryDate}]}));
    for(const quantity of [null,'0','0.0','-1','1e3',100]) assert.throws(()=>parseDeliveryPlanCommand({...cmd,upserts:[{...cmd.upserts[0],quantity}]}));
    const other=await create();await assert.rejects(()=>updateDeliveryPlans(pool,actor,other.id,cmd));
    await assert.rejects(()=>refreshAinuokeSalesOrderSource(pool,actor,order.id,{...order.input,expectedSourceHash:'stale',expectedPlanVersion:1}));
    assert.equal((await read(order.id)).ownership,'source_derived');
  });
  await t.test('upgrade preserves unknown ownership, manual command claims legacy collection',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'zhixu-plan-upgrade-'));
    const old=new pg.Pool({connectionString:await postgres.createDatabase('plan_upgrade')});
    try {
      for(const name of ['0001_trusted_auth_rbac_operation_logs.sql','0002_sales_order_foundation.sql','0003_sales_order_number_sequence.sql']) await writeFile(join(directory,name),await readFile(resolve('database/migrations',name)));
      await runMigrations(old,directory);
      const u=(await old.query<{id:string;public_id:string}>("INSERT INTO app_users(username,password_hash,display_name,role) VALUES ('legacy-fixture','synthetic','Legacy','admin') RETURNING id::text,public_id::text")).rows[0];
      const legacyActor={...actor,internalUserId:u.id,userId:u.public_id};const input=fixture();
      const id=(await createAinuokeSalesOrder(old,legacyActor,input)).salesOrder.id;
      const name='0009_sales_order_delivery_plans.sql';await writeFile(join(directory,name),await readFile(resolve('database/migrations',name)));
      await runMigrations(old,directory);assert.equal((await readDeliveryPlanSet(old,id)).ownership,'uninitialized');
      await refreshAinuokeSalesOrderSource(old,legacyActor,id,{...input,source:{...input.source,sourceHash:'legacy-new',contractDeliveryDate:'2027-01-01'},expectedSourceHash:input.source.sourceHash,expectedPlanVersion:0});
      assert.equal((await readDeliveryPlanSet(old,id)).plans.length,0);
      const plans=await updateDeliveryPlans(old,legacyActor,id,{expectedVersion:0,upserts:[{id:null,deliveryDate:'2027-02-01',quantity:'100'}],voidIds:[]});
      assert.equal(plans.ownership,'user_managed');assert.equal(plans.version,1);
    } finally {await old.end();await rm(directory,{recursive:true,force:true});}
  });
  await t.test('session API, RBAC, boundaries, spoof rejection, decimals and conflicts',async()=>{
    await pool.query("INSERT INTO app_roles(id,name,description) VALUES ('plan-api-role','Plan API','fixture')");
    for(const key of actor.permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES ('plan-api-role',$1)",[key]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES ($1,'plan-api-role')",[actor.internalUserId]);
    const viewer=(await pool.query<{id:string}>("INSERT INTO app_users(username,password_hash,display_name,role) VALUES ('plan-viewer',crypt('viewer-password',gen_salt('bf',4)),'Viewer','viewer') RETURNING id::text")).rows[0];
    await pool.query("INSERT INTO app_roles(id,name,description) VALUES ('plan-view-role','View API','fixture')");
    await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES ('plan-view-role','order.view')");
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES ($1,'plan-view-role')",[viewer.id]);
    const origin='http://delivery-plan-test.invalid';
    const server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
    await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');
    const base=`http://127.0.0.1:${address.port}`;const order=await create();const path=`/api/v1/sales-orders/${order.id}/delivery-plans`;
    const login=async(username:string,password:string)=>{
      const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({username,password})});
      assert.equal(response.status,200);return response.headers.get('set-cookie')!.split(';')[0];
    };
    const request=(url:string,cookie:string,body?:Record<string,unknown>,headers:Record<string,string>={})=>fetch(base+url,{method:body?'PATCH':'GET',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1',...headers},...(body?{body:JSON.stringify(body)}:{})});
    try {
      assert.equal((await fetch(base+path)).status,401);
      const cookie=await login('plan-test','synthetic-password');const viewCookie=await login('plan-viewer','viewer-password');
      assert.equal((await request(path,viewCookie)).status,200);
      const row=(await read(order.id)).plans[0];const cmd={expectedVersion:1,upserts:[{id:row.id,deliveryDate:'2026-11-01',quantity:'0.000000000000000001'}],voidIds:[]};
      assert.equal((await request(path,viewCookie,cmd)).status,403);
      assert.equal((await request(path,cookie,cmd,{Origin:'http://evil.invalid'})).status,403);
      assert.equal((await request(path,cookie,cmd,{'X-Zhixu-Request':'0'})).status,403);
      for(const extra of [{actor:{userId:'spoof'}},{ownership:'source_derived'},{isDerivedDefault:true},{sourceDeliveryDate:'2027-01-01'}]) assert.equal((await request(path,cookie,{...cmd,...extra})).status,400);
      assert.equal((await request('/api/v1/sales-orders/not-uuid/delivery-plans',cookie)).status,400);
      assert.equal((await request(`/api/v1/sales-orders/${randomUUID()}/delivery-plans`,cookie)).status,404);
      let response=await request(path,cookie,cmd);assert.equal(response.status,200);
      const saved=(await response.json()).deliveryPlanSet;assert.equal(saved.plans[0].quantity,'0.000000000000000001');assert.equal(saved.ownership,'user_managed');
      assert.equal((await request(path,cookie,cmd)).status,409);
      response=await request(path,cookie);assert.equal((await response.json()).deliveryPlanSet.plans[0].id,row.id);
      assert.equal((await request(`/api/v1/sales-orders/${order.id}`,cookie,{expectedVersion:1,lifecycleState:'active'})).status,404);
      assert.equal((await request(`/api/v1/sales-orders/${order.id}/source-refresh`,cookie,{})).status,404);
      const log=(await pool.query("SELECT actor_public_id::text,actor_name FROM operation_logs WHERE entity_id=$1 AND action='修改交期'",[order.id])).rows[0];
      assert.equal(log.actor_public_id,actor.userId);assert.equal(log.actor_name,actor.userName);
    } finally {await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
  });
  await t.test('trusted bounded append-only audit; aggregate and terms remain untouched',async()=>{
    const order=await create();const before=(await pool.query('SELECT * FROM sales_orders WHERE id=$1',[order.id])).rows[0];
    await updateDeliveryPlans(pool,actor,order.id,{expectedVersion:1,upserts:[{id:null,deliveryDate:'2026-12-01',quantity:'1.000000000000000001'}],voidIds:[]});
    assert.deepEqual((await pool.query('SELECT * FROM sales_orders WHERE id=$1',[order.id])).rows[0],before);
    const log=(await pool.query("SELECT * FROM operation_logs WHERE entity_id=$1 AND action='修改交期'",[order.id])).rows[0];
    assert.equal(log.actor_user_id.toString(),actor.internalUserId);assert.equal(log.actor_name,actor.userName);
    assert.equal(log.before_data.values.ownership,'source_derived');assert.equal(log.after_data.values.ownership,'user_managed');
    assert.ok(JSON.stringify(log.after_data).includes('1.000000000000000001'));
    await assert.rejects(()=>pool.query('DELETE FROM operation_logs WHERE id=$1',[log.id]));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM confirmed_commercial_terms')).rows[0].n,0);
  });
});

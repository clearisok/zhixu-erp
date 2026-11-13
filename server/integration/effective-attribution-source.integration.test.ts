import {readBoundIdentities} from '../ainuoke-source/additions.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {mkdtemp,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {historicalSourceFixture} from './historical-source-fixture.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders,previewBindings} from '../ainuoke-source/binding.js';
import {bindingBundle,freshMaterialBundle} from './ainuoke-binding-fixture.js';
import {createSalesOrder} from '../sales-orders/repository.js';
import {createAinuokeSalesOrder} from '../sales-orders/service.js';
import {captureSource,boundOrders} from '../ainuoke-source/service.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {writeAttributionHeadInTransaction} from '../sales-orders/effective-attribution.js';
import {syntheticOrder,syntheticFetchedAt} from './ainuoke-source-fixture.js';

test('Source target attribution and snapshot generations stay consistent on synthetic PG',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('attribution_source')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:'synthetic-source-attr',displayName:'Synthetic',password:'Synthetic-2026'});
 const actor=await loadExistingBootstrapActor(pool,'synthetic-source-attr');const clock=Date.now();
 const input=bindingBundle(clock);const preview=await previewBindings(input);
 const original=(await bindOrders(pool,actor,{sourceKey:'attr-test',accountFingerprint:'a'.repeat(64),expectedPreview:preview.reviewHash,collect:async()=>input})).orderIds[0];
 const primary=(await createSalesOrder(pool,{creationSource:'manual'})).id;
 const before=(await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows;
 const linksBefore=(await pool.query('SELECT row_to_json(l) AS row FROM sales_order_source_links l ORDER BY id')).rows;
 const pair=[original,primary].sort();const caseId=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor.internalUserId,randomUUID(),'a'.repeat(64)])).rows[0].id;
 await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic source test','{}')",[caseId,actor.internalUserId,randomUUID(),'b'.repeat(64)]);
 const map=async(target:string|null)=>{
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
   const type=(await client.query('SELECT 1 FROM sales_order_attribution_heads LIMIT 1')).rowCount?'correct':'normalize';
   const change=(await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,$2,$3,$4,$5,$5,'{}','synthetic metadata only') RETURNING id",[caseId,type,actor.internalUserId,randomUUID(),'c'.repeat(64)])).rows[0].id;
   for(const id of [original,primary]){const previous=(await client.query('SELECT current_change_id,version FROM sales_order_attribution_heads WHERE sales_order_id=$1',[id])).rows[0];await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,$4,$5)',[change,id,target??id,previous?.current_change_id??null,previous?.version??0]);}
   for(const id of [original,primary])await writeAttributionHeadInTransaction(client,change,id);
   await client.query('COMMIT');return change as string;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 };
 const data=freshMaterialBundle(clock);
 const capture=(collect=async()=>structuredClone(data))=>captureSource(pool,actor,{sourceKey:'attr-test',accountFingerprint:'a'.repeat(64),maxAgeMs:1000,now:()=>clock,collect});
 const read=createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey:'attr-test',maxAgeMs:1000},()=>clock));
 const latest=async()=>(await pool.query("SELECT latest_run_id::text FROM ainuoke_source_profiles WHERE source_key='attr-test'")).rows[0].latest_run_id as string;
 let firstRun='',sameRootRun='',otherRootRun='';
 await t.test('unchanged effective scope replays the same accepted generation',async()=>{
  const first=await capture();firstRun=first.runId;assert.equal((await capture()).runId,firstRun);assert.equal((await capture()).replayed,true);
  const result=await read(actor,{salesOrderId:original});assert.equal(result.status,200);if(result.status===200)assert.equal(result.body.progress.sourceStatus,'ready');
 });
 await t.test('same target ID with new attribution rejects old epoch and creates a new generation',async()=>{
  const change=await map(original);const stale=await read(actor,{salesOrderId:original});assert.equal(stale.status,200);if(stale.status===200)assert.equal(stale.body.progress.sourceStatus,'identity_mismatch');
  const next=await capture();sameRootRun=next.runId;assert.equal(next.replayed,false);assert.notEqual(next.runId,firstRun);
  const stored=(await pool.query('SELECT attribution_change_id::text FROM ainuoke_material_source_snapshots WHERE run_id=$1',[next.runId])).rows[0];assert.equal(stored.attribution_change_id,change);
  assert.equal((await capture()).runId,next.runId);
 });
 await t.test('changing effective target uses new SO without editing historical binding or snapshots',async()=>{
  const change=await map(primary);const targets=await boundOrders(pool);assert.equal(targets[0].id,primary);assert.equal(targets[0].sourceOwnerOrderId,original);assert.equal(targets[0].attributionChangeId,change);
  assert.equal((await read(actor,{salesOrderId:original})).status,404);
  const unconnected=await read(actor,{salesOrderId:primary});assert.equal(unconnected.status,200);if(unconnected.status===200)assert.equal(unconnected.body.provenance,'not_connected');
  const retry=await bindOrders(pool,actor,{sourceKey:'attr-test',accountFingerprint:'a'.repeat(64),expectedPreview:preview.reviewHash,collect:async()=>input});assert.equal(retry.replayed,true);assert.deepEqual(retry.orderIds,[primary]);
  assert.equal((await readBoundIdentities(pool))[0].id,original); // Discovery identity stays on immutable source owner.
  const next=await capture();otherRootRun=next.runId;assert.equal(next.replayed,false);assert.notEqual(next.runId,sameRootRun);
  assert.equal((await pool.query('SELECT sales_order_id::text FROM ainuoke_material_source_snapshots WHERE run_id=$1',[next.runId])).rows[0].sales_order_id,primary);
  assert.equal((await pool.query('SELECT sales_order_id::text FROM ainuoke_material_source_snapshots WHERE run_id=$1',[firstRun])).rows[0].sales_order_id,original);
  const result=await read(actor,{salesOrderId:primary});assert.equal(result.status,200);if(result.status===200){assert.equal(result.body.progress.sourceStatus,'ready');assert.equal(JSON.stringify(result).includes('protected-commercial-sentinel'),false);}
  assert.deepEqual((await pool.query('SELECT row_to_json(l) AS row FROM sales_order_source_links l ORDER BY id')).rows,linksBefore);
  assert.deepEqual((await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,before);
 });
 await t.test('attribution change during external collection aborts the entire publication',async()=>{
  const snapshotsBefore=(await pool.query('SELECT count(*)::int AS count FROM ainuoke_material_source_snapshots')).rows[0].count;
  // Per-order follow-up scope detects the changed effective target before the
  // older order comparison; neither guard may publish the collected payload.
  await assert.rejects(()=>capture(async()=>{await map(null);return structuredClone(data);}),/source_group_changed/);
  assert.equal(await latest(),otherRootRun);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM ainuoke_material_source_snapshots')).rows[0].count,snapshotsBefore);
  const next=await capture();assert.equal(next.replayed,false);assert.equal((await pool.query('SELECT sales_order_id::text FROM ainuoke_material_source_snapshots WHERE run_id=$1',[next.runId])).rows[0].sales_order_id,original);
 });
 await t.test('capture acquires attribution lock before profile lock, avoiding normalization lock inversion',async()=>{
  const owner=await pool.connect();let collecting:ReturnType<typeof capture>|null=null;
  try{
   await owner.query('BEGIN');await owner.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
   collecting=capture();let blocked=false;const deadline=Date.now()+5000;
   while(Date.now()<deadline){blocked=Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock_shared%'")).rowCount);if(blocked)break;await new Promise(done=>setTimeout(done,25));}
   assert.equal(blocked,true);
   await owner.query("SELECT source_key FROM ainuoke_source_profiles WHERE source_key='attr-test' FOR UPDATE NOWAIT");
   await owner.query('COMMIT');await collecting;
  }finally{await owner.query('ROLLBACK');owner.release();await collecting?.catch(()=>undefined);}
 });
 await t.test('missing contract rows still bind scope hash; unchanged payload cannot replay a previous scope',async()=>{
  const empty=structuredClone(data);for(const pages of [empty.discoveryBefore,empty.discoveryAfter])for(const page of pages){page.total=0;page.rows=[];}empty.materials={};
  const first=await capture(async()=>empty);assert.equal(first.orders,0);
  await map(primary);const next=await capture(async()=>empty);assert.equal(next.orders,0);assert.equal(next.replayed,false);assert.notEqual(next.runId,first.runId);
  assert.equal((await capture(async()=>empty)).replayed,true);
 });
 await t.test('partial attribution schema fails closed rather than silently using legacy targets',async()=>{
  await pool.query('ALTER TABLE ainuoke_source_runs RENAME COLUMN order_scope_hash TO synthetic_missing_scope_hash');
  try{await assert.rejects(()=>boundOrders(pool),/source_attribution_schema_incomplete/);await assert.rejects(()=>capture(),/source_attribution_schema_incomplete/);}finally{await pool.query('ALTER TABLE ainuoke_source_runs RENAME COLUMN synthetic_missing_scope_hash TO order_scope_hash');}
 });
 await t.test('frozen prefix-12 Source remains usable without identity/attribution side tables',async()=>{
  const old=new pg.Pool({connectionString:await db.createDatabase('source_prefix12')});const directory=await mkdtemp(join(tmpdir(),'zhixu-attr-prefix12-'));
  try{
   for(const file of await readdir('database/migrations'))if(Number(file.slice(0,4))<=12)await copyFile(join('database/migrations',file),join(directory,file));
   await runMigrations(old,directory);await synchronizePermissionCatalog(old);await bootstrapAdmin(old,{username:'synthetic-prefix-admin',displayName:'Synthetic',password:'Synthetic-2026'});const admin=await loadExistingBootstrapActor(old,'synthetic-prefix-admin');
   const order=(await createAinuokeSalesOrder(old,admin,{source:{sourceId:'synthetic-1',sourceRowIdentity:'synthetic-order',salesContractNo:syntheticOrder.salesContractNo,insideOrderNo:syntheticOrder.insideOrderNo,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-11-01',styleNo:syntheticOrder.styleNo,companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:100,sourceHash:'synthetic',fetchedAt:syntheticFetchedAt},colors:[]})).salesOrder;
   const historical=await historicalSourceFixture();
   const options={sourceKey:'prefix-test',accountFingerprint:'b'.repeat(64),collect:async()=>data,maxAgeMs:1000,now:()=>clock};
   try{
    const first=await historical.captureSource(old,admin,options);assert.equal((await historical.captureSource(old,admin,options)).runId,first.runId);
    let requests=0;await assert.rejects(captureSource(old,admin,{...options,collect:async()=>{requests++;return data;}}),/sync_audit_migration_required/);assert.equal(requests,0);
   }finally{await historical.close();}
   const reader=createOrderMaterialReader(createPersistedMaterialPorts(old,{sourceKey:'prefix-test',maxAgeMs:1000},()=>clock));assert.equal((await reader(admin,{salesOrderId:order.id})).status,200);
  }finally{await old.end();const distance=relative(resolve(tmpdir()),resolve(directory));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));await rm(directory,{recursive:true,force:true});}
 });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,relative,isAbsolute} from 'node:path';
import pg from 'pg';
import type {PoolClient} from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {supportsMaterialCaptureContext,boundOrders} from '../ainuoke-source/service.js';
import {hash} from '../ainuoke-source/contract.js';
import {runMigrations} from '../db/migration-runner.js';
import {createSalesOrder} from '../sales-orders/repository.js';
import {writeAttributionHeadInTransaction,resolveEffectiveOrder} from '../sales-orders/effective-attribution.js';

const sqlCode=(code:string)=>(error:unknown)=>(error as {code?:string}).code===code;

test('SQL fences preserve historical facts and reject unaware writers on synthetic PG',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('attribution_write_guards')});
 t.after(async()=>{await pool.end();await db.stop();});
 const prefix=await mkdtemp(join(tmpdir(),'zhixu-guard-prefix19-'));
 try{
  for(const file of await readdir('database/migrations'))if(file.endsWith('.sql')&&Number(file.slice(0,4))<=19)await copyFile(join('database/migrations',file),join(prefix,file));
  await runMigrations(pool,prefix);
 }finally{const distance=relative(resolve(tmpdir()),resolve(prefix));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));await rm(prefix,{recursive:true,force:true});}
 const actor=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('sql-guard-synthetic','unused','Synthetic','viewer') RETURNING id")).rows[0].id;
 const a=(await createSalesOrder(pool,{creationSource:'ainuoke'})).id;
 const b=(await createSalesOrder(pool,{creationSource:'manual'})).id;
 const c=(await createSalesOrder(pool,{creationSource:'manual'})).id;
 await pool.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no,inside_order_no) VALUES($1,'ainuoke','sales_contract','synthetic-guard-source','SYN-GUARD','SYN-FACTORY')",[a]);
 await pool.query("INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,quantity,contract_delivery_date,source_hash,fetched_at) VALUES($1,'synthetic-guard-source','synthetic-row','SYN-GUARD','SYN-FACTORY',100,'2026-12-01','synthetic',now())",[a]);
 await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'ainuoke_contract')",[a]);
 const commercial=async(orderId:string,version:number)=> (await pool.query("INSERT INTO sales_order_commercial_versions(sales_order_id,version,actor_id,request_id,payload_hash,quote_id,revision_id,price_version_id,source_quote_version,source_kind,source_confirmed_at,source_fingerprint,quote_type,confirmed_labor_price,labor_currency,reason) VALUES($1,$2,$3,$4,$5,'synthetic-q','synthetic-r','synthetic-p',1,'quote_confirmation',now(),$5,'processing',0,'CNY','synthetic SQL guard') RETURNING id",[orderId,version,actor,randomUUID(),'a'.repeat(64)])).rows[0].id as string;
 const oldCommercial=await commercial(a,1);
 await pool.query('INSERT INTO sales_order_commercial_heads(sales_order_id,current_version_id,version) VALUES($1,$2,1)',[a,oldCommercial]);
 const terms=(await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope) VALUES('sales_order') RETURNING id")).rows[0].id;
 await pool.query('INSERT INTO confirmed_commercial_terms_sales_orders(sales_order_id,confirmed_commercial_terms_id) VALUES($1,$2)',[a,terms]);
 await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES('sql-guard',$1)",['a'.repeat(64)]);
 const run=async(scope:string|null)=>{const id=randomUUID(),context=await supportsMaterialCaptureContext(pool),targets=context?await boundOrders(pool):null;await pool.query(`INSERT INTO ainuoke_source_runs(id,source_key,actor_user_id,captured_at,discovery,discovery_hash,content_hash,order_scope_hash${context?',order_scope':''}) VALUES($1,'sql-guard',$2,now(),'[]',$3,$3,$4${context?',$5::jsonb':''})`,[id,actor,'a'.repeat(64),scope===null?null:targets?hash(targets):scope,...(context?[JSON.stringify(targets)]:[])]);return id;};
 const snapshot=async(runId:string,orderId:string,epoch:string|null,contract='SYN-GUARD')=>{const context=await supportsMaterialCaptureContext(pool),link=context?(await pool.query('SELECT id::text FROM sales_order_source_links WHERE sales_contract_no=$1',[contract])).rows[0]?.id:null,version=context?(await pool.query('SELECT version FROM sales_orders WHERE id=$1',[orderId])).rows[0]?.version:null;return pool.query(`INSERT INTO ainuoke_material_source_snapshots(run_id,sales_order_id,sales_contract_no,snapshots,content_hash,attribution_change_id${context?',source_link_id,captured_order_version':''}) VALUES($1,$2,$3,'[]',$4,$5${context?',$6,$7':''})`,[runId,orderId,contract,'a'.repeat(64),epoch,...(context?[link??null,version??null]:[])]);};
 const legacyRun=await run(null),otherLegacy=await run(null);await snapshot(legacyRun,a,null);
 await pool.query("UPDATE ainuoke_source_profiles SET latest_run_id=$1 WHERE source_key='sql-guard'",[legacyRun]);
 const historyTables=['sales_orders','sales_order_source_links','sales_order_delivery_plan_sets','sales_order_delivery_plans','sales_order_identity_profiles','sales_order_commercial_versions','sales_order_commercial_heads','confirmed_commercial_terms_sales_orders','ainuoke_source_runs','ainuoke_material_source_snapshots'];
 const historical=async()=>Promise.all(historyTables.map(async table=>(await pool.query("SELECT (to_jsonb(x)-ARRAY['order_scope','source_link_id','captured_order_version','preparation_id']) AS row FROM "+table+' x ORDER BY to_jsonb(x)::text')).rows));
 const before=await historical();
 await t.test('forward upgrade preserves all existing rows including nullable old Source history',async()=>{
  assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,['0020_order_attribution_write_guards.sql','0021_order_command_control.sql','0022_source_history_context.sql','0023_order_preparation_adoption.sql','0024_material_progress_settings.sql']);
  assert.deepEqual(await historical(),before);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_identity_profiles WHERE preparation_id IS NOT NULL')).rows[0].n,0);assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,[]);
 });
 const makeCase=async(ids:string[])=>{const pair=[...ids].sort();const existing=(await pool.query('SELECT id FROM sales_order_normalization_cases WHERE first_order_id=$1 AND second_order_id=$2',pair)).rows[0];if(existing)return existing.id as string;
  const id=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor,randomUUID(),'b'.repeat(64)])).rows[0].id;
  await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic guard review','{}')",[id,actor,randomUUID(),'c'.repeat(64)]);return id as string;};
 const caseId=await makeCase([a,b]);
 const apply=async(mapping:Record<string,string>,reviewCase=caseId,transaction?:PoolClient)=>{
  const client=transaction??await pool.connect();try{
   if(!transaction)await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
   const type=(await client.query('SELECT 1 FROM sales_order_attribution_heads LIMIT 1')).rowCount?'correct':'normalize';
   const change=(await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,$2,$3,$4,$5,$5,'{}','synthetic guard metadata only') RETURNING id",[reviewCase,type,actor,randomUUID(),'d'.repeat(64)])).rows[0].id;
   for(const [original,effective] of Object.entries(mapping)){const previous=(await client.query('SELECT current_change_id,version FROM sales_order_attribution_heads WHERE sales_order_id=$1',[original])).rows[0];await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,$4,$5)',[change,original,effective,previous?.current_change_id??null,previous?.version??0]);}
   for(const original of Object.keys(mapping))await writeAttributionHeadInTransaction(client,change,original);
   if(!transaction)await client.query('COMMIT');return change as string;
  }catch(error){if(!transaction)await client.query('ROLLBACK');throw error;}finally{if(!transaction)client.release();}
 };
 let epoch=await apply({[a]:b,[b]:b});
 await t.test('raw lifecycle, plan, profile and adopted-price writes cannot target a historical duplicate',async()=>{
  await assert.rejects(()=>pool.query("UPDATE sales_orders SET lifecycle_state='active',version=version+1 WHERE id=$1",[a]),sqlCode('23514'));
  await assert.rejects(()=>pool.query('UPDATE sales_order_delivery_plan_sets SET version=version+1 WHERE sales_order_id=$1',[a]),sqlCode('23514'));
  await assert.rejects(()=>pool.query("UPDATE sales_order_delivery_plans SET quantity=999 WHERE sales_order_id=$1",[a]),sqlCode('23514'));
  await assert.rejects(()=>pool.query("INSERT INTO sales_order_delivery_plans(sales_order_id,quantity,delivery_date) VALUES($1,10,'2026-12-02')",[a]),sqlCode('23514'));
  await assert.rejects(()=>pool.query('UPDATE sales_order_identity_profiles SET owner_id=$2,version=version+1 WHERE sales_order_id=$1',[a,actor]),sqlCode('23514'));
  await assert.rejects(()=>commercial(a,2),sqlCode('23514'));
  await assert.rejects(()=>pool.query('INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,$2)',[a,'ainuoke_contract']),sqlCode('23514'));
  await assert.rejects(()=>pool.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id) VALUES($1,'synthetic','synthetic','new-alias-link')",[a]),sqlCode('23514'));
  await assert.rejects(()=>pool.query('UPDATE confirmed_commercial_terms_sales_orders SET confirmed_commercial_terms_id=confirmed_commercial_terms_id WHERE sales_order_id=$1',[a]),sqlCode('23514'));
  await assert.rejects(()=>pool.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id) VALUES($1,'synthetic','synthetic','missing-owner')",[randomUUID()]),sqlCode('23503'));
 });
 await t.test('current root writes still work and no original identity, plan or commercial data was moved',async()=>{
  await pool.query("INSERT INTO sales_order_delivery_plan_sets(sales_order_id,ownership) VALUES($1,'user_managed')",[b]);
  await pool.query("INSERT INTO sales_order_delivery_plans(sales_order_id,quantity,delivery_date) VALUES($1,10,'2026-12-02')",[b]);
  await commercial(b,1);
  assert.equal((await pool.query('SELECT quantity::text FROM sales_order_delivery_plans WHERE sales_order_id=$1',[a])).rows[0].quantity,'100');
  assert.equal((await pool.query('SELECT current_version_id::text FROM sales_order_commercial_heads WHERE sales_order_id=$1',[a])).rows[0].current_version_id,oldCommercial);
  assert.equal((await pool.query('SELECT sales_order_id::text FROM sales_order_source_links')).rows[0].sales_order_id,a);
 });
 await t.test('historical source owner observations remain legal without rewriting its plans',async()=>{
  const plans=(await pool.query('SELECT to_jsonb(p) AS row FROM sales_order_delivery_plans p WHERE sales_order_id=$1',[a])).rows;
  await pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=101,fetched_at=now() WHERE sales_order_id=$1',[a]);
  assert.deepEqual((await pool.query('SELECT to_jsonb(p) AS row FROM sales_order_delivery_plans p WHERE sales_order_id=$1',[a])).rows,plans);
 });
 await t.test('legacy publisher without order scope and incorrect snapshot identities fail closed',async()=>{
  await assert.rejects(()=>run(null),sqlCode('23514'));const id=await run('e'.repeat(64));
  await assert.rejects(()=>snapshot(id,a,epoch),sqlCode('23514'));
  await assert.rejects(()=>snapshot(id,b,null),sqlCode('23514'));
  await assert.rejects(()=>snapshot(id,b,randomUUID()),sqlCode('23514'));
  await assert.rejects(()=>snapshot(id,c,null),sqlCode('23514'));
  await assert.rejects(()=>snapshot(id,b,epoch,'SYN-WRONG-CONTRACT'),sqlCode('23514'));
  await snapshot(id,b,epoch);await pool.query("UPDATE ainuoke_source_profiles SET latest_run_id=$1 WHERE source_key='sql-guard'",[id]);
 });
 await t.test('all Source run/snapshot content and identities are immutable, including old nullable evidence',async()=>{
  for(const id of [legacyRun,(await pool.query("SELECT latest_run_id::text FROM ainuoke_source_profiles WHERE source_key='sql-guard'")).rows[0].latest_run_id]){
   await assert.rejects(()=>pool.query("UPDATE ainuoke_source_runs SET discovery='[]' WHERE id=$1",[id]),sqlCode('23514'));
   await assert.rejects(()=>pool.query('DELETE FROM ainuoke_source_runs WHERE id=$1',[id]),sqlCode('23514'));
   await assert.rejects(()=>pool.query("UPDATE ainuoke_material_source_snapshots SET content_hash=$2 WHERE run_id=$1",[id,'f'.repeat(64)]),sqlCode('23514'));
   await assert.rejects(()=>pool.query('DELETE FROM ainuoke_material_source_snapshots WHERE run_id=$1',[id]),sqlCode('23514'));
  }
  await assert.rejects(()=>snapshot(legacyRun,b,epoch),sqlCode('23514'));
 });
 await t.test('old runs cannot be newly published; unchanged old-pointer metadata is preserved',async()=>{
  await assert.rejects(()=>pool.query("UPDATE ainuoke_source_profiles SET latest_run_id=$1 WHERE source_key='sql-guard'",[otherLegacy]),sqlCode('23514'));
  await pool.query("UPDATE ainuoke_source_profiles SET last_error_code='synthetic-read-failure' WHERE source_key='sql-guard'");
  assert.equal((await pool.query('SELECT order_scope_hash FROM ainuoke_source_runs WHERE id=$1',[legacyRun])).rows[0].order_scope_hash,null);
 });
 await t.test('a blocked READ COMMITTED SQL writer checks the new root after normalization commits',async()=>{
  const normalizer=await pool.connect();const writer=await pool.connect();let pending:Promise<unknown>|undefined;
  try{
   await normalizer.query('BEGIN');await apply({[a]:a,[b]:a},caseId,normalizer);
   await writer.query("SET application_name='synthetic-unaware-writer'");
   pending=writer.query("INSERT INTO sales_order_delivery_plans(sales_order_id,quantity,delivery_date) VALUES($1,1,'2026-12-03')",[b]);
   const rejected=assert.rejects(pending,sqlCode('23514'));
   let waiting=false;const deadline=Date.now()+5000;
   while(Date.now()<deadline){waiting=Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='synthetic-unaware-writer' AND wait_event='advisory'")).rowCount);if(waiting)break;await new Promise(done=>setTimeout(done,25));}
   assert.equal(waiting,true);await normalizer.query('COMMIT');await rejected;
  }finally{await normalizer.query('ROLLBACK');normalizer.release();writer.release();await pending?.catch(()=>undefined);}
  assert.equal((await resolveEffectiveOrder(pool,b)).historicalDuplicate,true);
 });
 await t.test('a stale REPEATABLE READ writer aborts instead of trusting an old identity snapshot',async()=>{
  const writer=await pool.connect();try{
   await writer.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await writer.query('SELECT * FROM sales_order_attribution_write_epoch');
   epoch=await apply({[a]:b,[b]:b});
   await assert.rejects(()=>writer.query("INSERT INTO sales_order_delivery_plans(sales_order_id,quantity,delivery_date) VALUES($1,1,'2026-12-03')",[a]),sqlCode('40001'));
  }finally{await writer.query('ROLLBACK');writer.release();}
 });
 await t.test('an old accepted run cannot be re-pointed to as current after attribution changes',async()=>{
  const oldCurrent=(await pool.query("SELECT latest_run_id::text FROM ainuoke_source_profiles WHERE source_key='sql-guard'")).rows[0].latest_run_id;
  await pool.query("UPDATE ainuoke_source_profiles SET latest_run_id=NULL WHERE source_key='sql-guard'");
  await assert.rejects(()=>pool.query("UPDATE ainuoke_source_profiles SET latest_run_id=$1 WHERE source_key='sql-guard'",[oldCurrent]),sqlCode('23514'));
  const fresh=await run('1'.repeat(64));await snapshot(fresh,b,epoch);await pool.query("UPDATE ainuoke_source_profiles SET latest_run_id=$1 WHERE source_key='sql-guard'",[fresh]);
 });
 await t.test('processing identities cannot be merged into a contract or used as its effective root through raw metadata',async()=>{
  const processing=(await createSalesOrder(pool,{creationSource:'quote',sourceQuoteId:'synthetic-process',sourceRevisionId:'r',sourcePriceVersionId:'p'})).id;
  await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'processing')",[processing]);
  const review=await makeCase([a,processing]);
  for(const root of [b,processing])await assert.rejects(()=>apply({[a]:root,[b]:root,[processing]:root},review),sqlCode('23514'));
  await assert.rejects(()=>pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'processing')",[b]),sqlCode('23514'));
  assert.equal((await resolveEffectiveOrder(pool,processing)).historicalDuplicate,false);
  assert.equal((await resolveEffectiveOrder(pool,b)).effectiveOrderId,b);
 });
 await t.test('a later trusted binding cannot add another contract to an existing effective group',async()=>{
  // A root without a plan collection reaches the intended identity guard;
  // an existing collection would reject earlier on an unrelated primary key.
  const source=(await createSalesOrder(pool,{creationSource:'ainuoke'})).id;
  const root=(await createSalesOrder(pool,{creationSource:'manual'})).id;
  await pool.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no,inside_order_no) VALUES($1,'ainuoke','sales_contract','synthetic-first-contract','SYN-FIRST','SYN-FACTORY-1')",[source]);
  await pool.query("INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,quantity,source_hash,fetched_at) VALUES($1,'synthetic-first-contract','synthetic-row-1','SYN-FIRST','SYN-FACTORY-1',100,'synthetic',now())",[source]);
  await apply({[source]:root,[root]:root},await makeCase([source,root]));
  const client=await pool.connect();try{
   await client.query('BEGIN');
   await client.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no,inside_order_no) VALUES($1,'ainuoke','sales_contract','synthetic-second-contract','SYN-SECOND','SYN-FACTORY-2')",[root]);
   await client.query("INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,quantity,source_hash,fetched_at) VALUES($1,'synthetic-second-contract','synthetic-row-2','SYN-SECOND','SYN-FACTORY-2',100,'synthetic',now())",[root]);
   await assert.rejects(()=>client.query('COMMIT'),sqlCode('23514'));
  }finally{await client.query('ROLLBACK');client.release();}
  assert.equal((await pool.query("SELECT count(*)::int n FROM sales_order_source_links WHERE external_id='synthetic-second-contract'")).rows[0].n,0);
 });
 await t.test('a standalone processing identity cannot become a source contract through a later raw binding',async()=>{
  const processing=(await createSalesOrder(pool,{creationSource:'quote',sourceQuoteId:'synthetic-process-2',sourceRevisionId:'r',sourcePriceVersionId:'p'})).id;
  await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'processing')",[processing]);
  const client=await pool.connect();try{
   await client.query('BEGIN');
   await client.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no,inside_order_no) VALUES($1,'ainuoke','sales_contract','synthetic-processing-contract','SYN-PROCESS','SYN-PROCESS-FACTORY')",[processing]);
   await client.query("INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,quantity,source_hash,fetched_at) VALUES($1,'synthetic-processing-contract','synthetic-row-p','SYN-PROCESS','SYN-PROCESS-FACTORY',100,'synthetic',now())",[processing]);
   await assert.rejects(()=>client.query('COMMIT'),sqlCode('23514'));
  }finally{await client.query('ROLLBACK');client.release();}
  assert.equal((await resolveEffectiveOrder(pool,processing)).historicalDuplicate,false);
 });
 await t.test('reference-only preparations may still point to a historical SO without creating new execution',async()=>{
  await pool.query("INSERT INTO sales_order_preparations(actor_id,request_id,payload_hash,reference_order_id,quantity,specification_changes) VALUES($1,$2,$3,$4,10,'synthetic reference only')",[actor,randomUUID(),'2'.repeat(64),a]);
  assert.equal((await pool.query('SELECT reference_order_id::text FROM sales_order_preparations')).rows[0].reference_order_id,a);
 });
});

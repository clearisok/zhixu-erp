import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { createSalesOrder } from '../sales-orders/repository.js';
import { resolveEffectiveOrder, readEffectiveOrderGroup, requireEffectiveOrderForWrite, writeAttributionHeadInTransaction } from '../sales-orders/effective-attribution.js';

test('effective identity ledger validates complete direct groups on disposable synthetic PG',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('effective_identity')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));
 const actor=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('attribution-synthetic','unused','Synthetic','viewer') RETURNING id")).rows[0].id;
 const orders=await Promise.all(Array.from({length:3},()=>createSalesOrder(pool,{creationSource:'manual'})));const [a,b,c]=orders.map(o=>o.id);
 const before=(await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows;
 const makeCase=async(ids:string[])=>{const pair=[...ids].sort();const row=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor,randomUUID(),'a'.repeat(64)])).rows[0];await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic review','{}')",[row.id,actor,randomUUID(),'b'.repeat(64)]);return row.id as string;};
 const pairCase=await makeCase([a,b]);
 const apply=async(caseId:string,map:Record<string,string>,type='normalize',badPrevious=false)=>{
  const client=await pool.connect();try{
   await client.query('BEGIN');await client.query("SET LOCAL application_name='synthetic-effective-attribution'");await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
   const id=(await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,$2,$3,$4,$5,$5,'{}','synthetic schema test only') RETURNING id",[caseId,type,actor,randomUUID(),'c'.repeat(64)])).rows[0].id;
   for(const [original,effective] of Object.entries(map)){
    const previous=(await client.query('SELECT current_change_id,version FROM sales_order_attribution_heads WHERE sales_order_id=$1',[original])).rows[0];
    await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,$4,$5)',[id,original,effective,previous?.current_change_id??null,badPrevious?99:previous?.version??0]);
   }
   for(const original of Object.keys(map))await writeAttributionHeadInTransaction(client,id,original);
   await client.query('COMMIT');return id as string;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 };
 await t.test('unattributed SO is its own effective identity, without inferred history',async()=>{
  assert.deepEqual(await resolveEffectiveOrder(pool,a),{originalOrderId:a,effectiveOrderId:a,attributionChangeId:null,attributionVersion:0,historicalDuplicate:false});
  assert.equal((await readEffectiveOrderGroup(pool,a)).members.length,1);
 });
 await t.test('no root, cycles, wrong case and no-op mappings are rejected at commit',async()=>{
  for(const map of [{[a]:b,[b]:a},{[a]:c,[b]:c},{[a]:a,[c]:a},{[a]:a,[b]:b}])await assert.rejects(()=>apply(pairCase,map));
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_attribution_changes')).rows[0].n,0);
 });
 let firstChange='';
 await t.test('normalization retains both UUIDs and old SO facts; alias writes are refused',async()=>{
  firstChange=await apply(pairCase,{[a]:a,[b]:a});
  assert.equal((await resolveEffectiveOrder(pool,b)).effectiveOrderId,a);assert.equal((await resolveEffectiveOrder(pool,b)).historicalDuplicate,true);
  assert.deepEqual((await readEffectiveOrderGroup(pool,b)).members.map(o=>o.originalOrderId).sort(),[a,b].sort());
  const client=await pool.connect();try{await client.query('BEGIN');await requireEffectiveOrderForWrite(client,a);await assert.rejects(()=>requireEffectiveOrderForWrite(client,b),/Historical duplicate/);await client.query('ROLLBACK');}finally{client.release();}
  assert.deepEqual((await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,before);
 });
 await t.test('ledger/members/head cannot be deleted or historical mappings edited',async()=>{
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_attribution_changes WHERE id=$1',[firstChange]));await assert.rejects(()=>pool.query('DELETE FROM sales_order_attribution_members WHERE change_id=$1',[firstChange]));
  await assert.rejects(()=>pool.query('UPDATE sales_order_attribution_members SET effective_order_id=sales_order_id WHERE change_id=$1',[firstChange]));await assert.rejects(()=>pool.query('DELETE FROM sales_order_attribution_heads WHERE sales_order_id=$1',[b]));
 });
 await t.test('partial prior group and forged version cannot silently detach members',async()=>{
  const bc=await makeCase([b,c]);await assert.rejects(()=>apply(bc,{[b]:c,[c]:c}));await assert.rejects(()=>apply(pairCase,{[a]:b,[b]:b},'correct',true));
  assert.equal((await resolveEffectiveOrder(pool,b)).effectiveOrderId,a);
 });
 let correction='';let lastChange='';
 await t.test('explicit correction can split a whole group without erasing old normalization',async()=>{
  correction=await apply(pairCase,{[a]:a,[b]:b},'correct');lastChange=correction;
  assert.equal((await resolveEffectiveOrder(pool,b)).effectiveOrderId,b);assert.equal((await resolveEffectiveOrder(pool,b)).attributionVersion,2);
  assert.equal((await pool.query('SELECT effective_order_id::text FROM sales_order_attribution_members WHERE change_id=$1 AND sales_order_id=$2',[firstChange,b])).rows[0].effective_order_id,a);
  assert.equal((await pool.query('SELECT previous_change_id::text FROM sales_order_attribution_members WHERE change_id=$1 AND sales_order_id=$2',[correction,b])).rows[0].previous_change_id,firstChange);
  assert.deepEqual((await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,before);
 });
 await t.test('two distinct trusted contracts cannot be merged even when other fields match',async()=>{
  const pair=await Promise.all([createSalesOrder(pool,{creationSource:'ainuoke'}),createSalesOrder(pool,{creationSource:'ainuoke'})]);
  for(let i=0;i<2;i++){
   const source='synthetic-attribution-source-'+i,contract='SYN-ATTR-'+i;
   await pool.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no,inside_order_no) VALUES($1,'ainuoke','sales_contract',$2,$3,'SYN-SAME-FACTORY')",[pair[i].id,source,contract]);
   await pool.query("INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,quantity,source_hash,fetched_at) VALUES($1,$2,$2,$3,'SYN-SAME-FACTORY',100,'synthetic',now())",[pair[i].id,source,contract]);
  }
  const review=await makeCase(pair.map(o=>o.id));await assert.rejects(()=>apply(review,{[pair[0].id]:pair[0].id,[pair[1].id]:pair[0].id}),/distinct trusted contracts/);
  assert.equal((await resolveEffectiveOrder(pool,pair[1].id)).historicalDuplicate,false);
 });
 await t.test('transactional write guard and attribution change cannot interleave their ownership decision',async()=>{
  const writer=await pool.connect();let change:Promise<string>|null=null;
  try{
   await writer.query('BEGIN');await requireEffectiveOrderForWrite(writer,b);
   change=apply(pairCase,{[a]:a,[b]:a});
   const deadline=Date.now()+5000;let waiting=false;
   while(Date.now()<deadline){waiting=Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='synthetic-effective-attribution' AND wait_event='advisory'")).rowCount);if(waiting)break;await new Promise(done=>setTimeout(done,25));}
   assert.equal(waiting,true);assert.equal((await resolveEffectiveOrder(writer,b)).historicalDuplicate,false);
   await writer.query('COMMIT');lastChange=await change;
   assert.equal((await resolveEffectiveOrder(pool,b)).historicalDuplicate,true);
  }finally{await writer.query('ROLLBACK');writer.release();await change?.catch(()=>undefined);}
 });
 await t.test('withdrawn case cannot acquire a new effective mapping',async()=>{
  await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,2,$2,$3,$4,'withdrawn','synthetic withdrawal','{}')",[pairCase,actor,randomUUID(),'d'.repeat(64)]);
  await assert.rejects(()=>apply(pairCase,{[a]:a,[b]:a}));assert.equal((await resolveEffectiveOrder(pool,b)).attributionChangeId,lastChange);
 });
});

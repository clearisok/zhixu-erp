import test from 'node:test';
import assert from 'node:assert/strict';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {hydrateContractEvidence} from '../ainuoke-source/catalog-evidence.js';
import {previewSelectedBindings} from '../ainuoke-source/binding.js';
import {createAinuokeSalesOrderInTransaction} from '../sales-orders/service.js';
import {requestContractSync} from '../ainuoke-source/sync-queue.js';
import {randomUUID} from 'node:crypto';
import {requestMaterialRecovery} from '../ainuoke-source/material-recovery.js';
import {parseSourceArguments,parseSyncSourceIds} from '../ainuoke-source/cli.js';

test('recovery CLI requires an explicit target, immutable request and selected IDs',()=>{
 const args=['--material-recover=first-team','--config=private.json','--expected-target='+'a'.repeat(64),'--request-id='+randomUUID(),'--source-ids=1,2'];
 assert.equal(parseSourceArguments(args).action,'material-recover');
 for(const key of ['--expected-target=','--request-id=','--source-ids='])assert.throws(()=>parseSourceArguments(args.filter(a=>!a.startsWith(key))));
});

test('material recovery replays receipts without recapturing completed orders and rejects unbound scope',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const sourceId=(await f.pool.query('SELECT external_id FROM sales_order_source_links WHERE sales_order_id=$1',[f.orderIds[0]])).rows[0].external_id;
  const input={sourceKey:f.sourceKey,sourceIds:[sourceId],recoveryId:randomUUID()};
  const first=await requestMaterialRecovery(f.pool,f.actor,input);
  await f.tick();const captures=f.captures();
  const second=await requestMaterialRecovery(f.pool,f.actor,input);
  assert.equal(second[0].jobId,first[0].jobId);
  assert.equal((await f.pool.query('SELECT status FROM ainuoke_sync_jobs WHERE id=$1',[first[0].jobId])).rows[0].status,'complete');
  await f.tick();assert.equal(f.captures(),captures);
  await assert.rejects(requestMaterialRecovery(f.pool,f.actor,{...input,sourceIds:['not-bound']}),/material_recovery_binding_missing/);
 }finally{await f.close();}
});

test('observed-before-binding is queued once, publishes through worker, and survives stale/failed refresh via HTTP',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const row=(await f.pool.query(`SELECT o.*,p.account_fingerprint,e.sales_contract_no FROM ainuoke_contract_observations o
   JOIN ainuoke_source_profiles p USING(source_key) JOIN ainuoke_catalog_entries e USING(source_key,source_id)
   WHERE NOT EXISTS(SELECT 1 FROM sales_order_source_links l WHERE l.external_id=o.source_id AND l.source_system='ainuoke') LIMIT 1`)).rows[0];
  assert.ok(row);
  const evidence=await hydrateContractEvidence(f.pool,row);
  const preview=await previewSelectedBindings(evidence.addition,[row.sales_contract_no]);
  const c=await f.pool.connect();let id:string;
  try{await c.query('BEGIN');const first=await createAinuokeSalesOrderInTransaction(c,f.actor,preview.preview.candidates[0]);
   id=first.salesOrder.id;assert.equal(first.created,true);
   const repeat=await createAinuokeSalesOrderInTransaction(c,f.actor,preview.preview.candidates[0]);assert.equal(repeat.created,false);assert.equal(repeat.salesOrder.id,id);
   await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE source_id=$1 AND status='queued'",[row.source_id])).rows[0].n,1);
  const tick=await f.tick();assert.equal(tick.status,'processed');
  const cookie=await f.login(f.admin);
  const read=async()=>{const r=await fetch(f.base+'/api/v1/sales-orders/'+id+'/material-progress',{headers:{Cookie:cookie}});assert.equal(r.status,200);return (await r.json()).progress;};
  const fresh=await read();assert.equal(fresh.sourceStatus,'ready');assert.ok(fresh.rows.length);
  const head=(await f.pool.query('SELECT run_id FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[id])).rows[0].run_id;
  f.setMaterialOffset(31*60000);const stale=await read();assert.equal(stale.sourceStatus,'stale');assert.equal(stale.rows.length,fresh.rows.length);assert.equal(stale.fetchedAt,fresh.fetchedAt);
  f.setMaterialOffset(0);f.failNextCapture();
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:row.source_id,requestId:randomUUID()});await f.tick();
  assert.equal((await f.pool.query('SELECT run_id FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[id])).rows[0].run_id,head);
  const failed=await read();assert.equal(failed.sourceStatus,'source_failed');assert.equal(failed.rows.length,fresh.rows.length);assert.equal(failed.fetchedAt,fresh.fetchedAt);
 }finally{await f.close();}
});

test('persistent sync can consume only the existing fixed scope without widening it',()=>{
 const args=['--sync-run=first-team','--config=private.json','--expected-target='+'a'.repeat(64),'--source-ids=6651,6919','--batch-size=1'];
 assert.equal(parseSourceArguments(args).values.get('source-ids'),'6651,6919');
 assert.deepEqual(parseSyncSourceIds('6651,6919'),['6651','6919']);
 for(const value of ['',',1','1,','1,1','1, 2',Array.from({length:1401},(_,i)=>String(i)).join(',')])assert.throws(()=>parseSyncSourceIds(value),/sync_scope_invalid/);
 assert.throws(()=>parseSourceArguments(args.map(a=>a.startsWith('--source-ids=')?'--source-ids=':a)));
});

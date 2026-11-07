import test from 'node:test';
import assert from 'node:assert/strict';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {hydrateContractEvidence} from '../ainuoke-source/catalog-evidence.js';
import {previewSelectedBindings} from '../ainuoke-source/binding.js';
import {createAinuokeSalesOrderInTransaction} from '../sales-orders/service.js';
import {publishHistoricalMaterialObservation} from '../ainuoke-source/historical-material-publication.js';
import {parseSourceArguments} from '../ainuoke-source/cli.js';

test('historical CLI requires explicit observation, order, evidence hash and target',()=>{
 const args=['--material-history-publish=synthetic','--config=private.json','--source-id=123','--order-id=00000000-0000-4000-8000-000000000001','--observation-id=00000000-0000-4000-8000-000000000002','--evidence-hash='+'a'.repeat(64),'--expected-target='+'b'.repeat(64)];
 assert.equal(parseSourceArguments(args).action,'material-history-publish');
 for(const prefix of ['--source-id=','--order-id=','--observation-id=','--evidence-hash=','--expected-target='])assert.throws(()=>parseSourceArguments(args.filter(x=>!x.startsWith(prefix))));
});

test('historical publication validates immutable source, preserves queue and dates, and replays without replacing head',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const row=(await f.pool.query(`SELECT o.*,p.account_fingerprint,e.sales_contract_no FROM ainuoke_contract_observations o
   JOIN ainuoke_source_profiles p USING(source_key) JOIN ainuoke_catalog_entries e USING(source_key,source_id)
   WHERE NOT EXISTS(SELECT 1 FROM sales_order_source_links l WHERE l.external_id=o.source_id AND l.source_system='ainuoke') LIMIT 1`)).rows[0];
  const evidence=await hydrateContractEvidence(f.pool,row);
  const preview=await previewSelectedBindings(evidence.addition,[row.sales_contract_no]);
  const c=await f.pool.connect();let orderId:string;
  try{await c.query('BEGIN');orderId=(await createAinuokeSalesOrderInTransaction(c,f.actor,preview.preview.candidates[0])).salesOrder.id;await c.query('COMMIT');}finally{c.release();}
  const input={sourceKey:f.sourceKey,sourceId:row.source_id,orderId,observationId:row.id,expectedHash:row.content_hash};
  const queueBefore=(await f.pool.query('SELECT id,status FROM ainuoke_sync_jobs ORDER BY id')).rows;
  const captures=f.captures();
  await assert.rejects(publishHistoricalMaterialObservation(f.pool,{internalUserId:'00000000-0000-4000-8000-000000000000',userId:'missing'},input));
  await assert.rejects(publishHistoricalMaterialObservation(f.pool,f.actor,{...input,sourceId:'wrong-contract'}),/source_scope_mismatch/);
  await assert.rejects(f.pool.query("UPDATE ainuoke_sync_jobs SET status='failed' WHERE id=$1",[row.job_id]),/receipts are immutable/);
  await assert.rejects(publishHistoricalMaterialObservation(f.pool,f.actor,{...input,observationId:'00000000-0000-4000-8000-000000000001'}),/historical_material_evidence_invalid/);
  await assert.rejects(publishHistoricalMaterialObservation(f.pool,f.actor,{...input,expectedHash:'0'.repeat(64)}),/historical_material_evidence_invalid/);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[orderId])).rows[0].n,0);
  const first=await publishHistoricalMaterialObservation(f.pool,f.actor,input);
  assert.equal(first.status,'historical_published');
  const repeat=await publishHistoricalMaterialObservation(f.pool,f.actor,input);
  assert.equal(repeat.status,'existing_head_preserved');assert.equal(repeat.runId,first.runId);
  assert.deepEqual((await f.pool.query('SELECT id,status FROM ainuoke_sync_jobs ORDER BY id')).rows,queueBefore);
  assert.equal(f.captures(),captures);
  assert.equal(new Date((await f.pool.query('SELECT captured_at FROM ainuoke_source_runs WHERE id=$1',[first.runId])).rows[0].captured_at).toISOString(),new Date(row.captured_at).toISOString());
  const cookie=await f.login(f.admin);f.setMaterialOffset(31*60000);
  const response=await fetch(f.base+'/api/v1/sales-orders/'+orderId+'/material-progress',{headers:{Cookie:cookie}});
  assert.equal(response.status,200);const progress=(await response.json()).progress;
  assert.equal(progress.sourceStatus,'stale');assert.ok(progress.rows.length);
  assert.equal(progress.fetchedAt,evidence.materials.at(-1)!.fetchedAt);
  await f.pool.query("UPDATE ainuoke_material_order_heads SET last_error_code='source_unavailable' WHERE sales_order_id=$1",[orderId]);
  const preserved=await publishHistoricalMaterialObservation(f.pool,f.actor,input);
  assert.equal(preserved.runId,first.runId);
  assert.equal((await f.pool.query('SELECT last_error_code FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[orderId])).rows[0].last_error_code,'source_unavailable');
  const failedRefresh=await fetch(f.base+'/api/v1/sales-orders/'+orderId+'/material-progress',{headers:{Cookie:cookie}});
  assert.equal(failedRefresh.status,200);const retained=(await failedRefresh.json()).progress;
  assert.ok(retained.rows.length);assert.equal(retained.fetchedAt,progress.fetchedAt);
 }finally{await f.close();}
});

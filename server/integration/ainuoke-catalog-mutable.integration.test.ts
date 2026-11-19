import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';
import {requestContractSync} from '../ainuoke-source/sync-queue.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {resumeTransientCatalogBackoff} from '../ainuoke-source/sync-recovery.js';
import type {CatalogCollectionOptions} from '../ainuoke-source/catalog-checkpoints.js';
import type {SelectedSourceRequest} from '../ainuoke-source/selected-source-once.js';
import type {RequestDiagnostic} from '../ainuoke-source/sync-diagnostics.js';
import {hash} from '../ainuoke-source/contract.js';

const moving=`if report == 6086103:
        if page == 1: change.pass_number=getattr(change,'pass_number',0)+1
        if getattr(change,'pass_number',0) >= 2:
            mutate_rows(payload, lambda rows: [row.update(Price='12.000') for row in rows if row['id']=='601'])`;
const stable=`if report == 6086103:
        mutate_rows(payload, lambda rows: [row.update(Price='12.000') for row in rows if row['id']=='601'])`;
// Real SDK + bounded transport + real envelope validation, synthetic source only.
function collector(mutation:string,seen:number[][]=[]){
 return async(_cfg:unknown,r:SelectedSourceRequest,options?:CatalogCollectionOptions)=>{
  assert.ok(r.mode==='catalog-discovery'||r.mode==='catalog-contracts');
  const pages=options?.recapturePages??[];seen.push([...pages]);
  const raw=selectedWorkerFixture(r.mode,mutation,r.contracts,630,undefined,pages) as {
   capture:{recapture?:unknown[]};requests:RequestDiagnostic[]};
  for(const d of raw.requests){await options?.onRequest?.('started',d);await options?.onRequest?.('finished',d);}
  for(const p of raw.capture.recapture??[])await options?.onRecapturePage?.(p);
  return raw;
 };
}
async function heads(f:Awaited<ReturnType<typeof startCatalogFixture>>){
 return (await f.pool.query(`SELECT sales_order_id,run_id FROM ainuoke_material_order_heads ORDER BY sales_order_id`)).rows;
}
async function request(f:Awaited<ReturnType<typeof startCatalogFixture>>,id='1'){
 return requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:id,requestId:randomUUID()});
}
test('Price absence drift retains old data; independent fresh capture succeeds; durable targeted retry publishes a full stable snapshot',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const initial=await heads(f),first=await request(f),start=Date.now()+30000,seen:number[][]=[];
  const one=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,batchSize:1,now:()=>start,collect:collector(moving,seen)});
  assert.equal(one.status,'failed');if(one.status==='failed')assert.equal(one.retryScheduled,true,JSON.stringify(one));
  assert.deepEqual(await heads(f),initial); // no partial material publication
  const failed=(await f.pool.query('SELECT * FROM ainuoke_sync_jobs WHERE id=$1',[first.jobId])).rows[0];
  assert.equal(failed.result.code,'catalog_business_content_changed');assert.deepEqual(failed.result.recapturePages,[13]);
  assert.equal(failed.result.diagnosticsPersisted,true);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0].paused_reason,null);
  const delta=(await f.pool.query("SELECT * FROM ainuoke_catalog_diagnostics WHERE kind='difference'")).rows;
  assert.equal(delta.length,1);assert.equal(delta[0].sales_contract_no,'SYN-SALES-601');assert.equal(delta[0].page,13);
  assert.equal(delta[0].evidence.before_exists,false);assert.equal(delta[0].evidence.after_value,'12.000');
  assert.ok(delta[0].evidence.request_started_at);assert.ok(delta[0].evidence.request_finished_at);
  assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start+59000,collect:collector(stable,seen)})).status,'idle');
  await request(f,'2');
  const independent=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,batchSize:1,now:()=>start+1000,sourceIds:['2'],collect:collector(stable,seen)});
  assert.equal(independent.status,'processed'); // requires a new full 6086103 pair, not stale data
  const recovered=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,batchSize:1,now:()=>start+60000,sourceIds:['1'],collect:collector(stable,seen)});
  assert.equal(recovered.status,'processed');if(recovered.status==='processed')assert.equal(recovered.jobs[0].status,'complete');
  assert.deepEqual(seen,[[],[],[13]]);
  assert.equal((await f.pool.query('SELECT status FROM ainuoke_sync_jobs WHERE id=$1',[first.jobId])).rows[0].status,'failed');
  const proof=(await f.pool.query("SELECT * FROM ainuoke_catalog_diagnostics WHERE kind='recapture_page'")).rows;
  assert.equal(proof.length,1);assert.equal(proof[0].retry_count,1);assert.equal(proof[0].evidence.rows[0].values.Price,'12.000');
  assert.equal('CustomerName' in proof[0].evidence.rows[0].values,false);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_catalog_diagnostics WHERE final_decision='full_stable_capture_validated'")).rows[0].n,1);
  assert.notDeepEqual(await heads(f),initial);
  await assert.rejects(f.pool.query('DELETE FROM ainuoke_catalog_diagnostics'),/cannot be deleted/);
  await assert.rejects(f.pool.query("UPDATE ainuoke_catalog_diagnostics SET final_decision='fake'"),/cannot be deleted/);
 }finally{await f.close();}
});
test('three inconsistent captures exhaust finite retry, report mutable_field_unstable and preserve every old success',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const initial=hash(await heads(f));await request(f);const start=Date.now()+30000,seen:number[][]=[];
  for(const [i,offset] of [0,60000,360000].entries()){
   const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,batchSize:1,now:()=>start+offset,collect:collector(moving,seen)});
   assert.equal(result.status,'failed');if(result.status==='failed')assert.equal(result.retryScheduled,i<2,JSON.stringify(result));
   assert.equal(hash(await heads(f)),initial);
  }
  assert.deepEqual(seen,[[],[13],[13]]);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0].paused_reason,null);
  assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect:collector(stable,seen)})).status,'idle');
  assert.equal(seen.length,3);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE status IN ('queued','running','unknown')")).rows[0].n,0);
  const rows=(await f.pool.query("SELECT retry_count,final_decision FROM ainuoke_catalog_diagnostics WHERE kind='difference' ORDER BY retry_count")).rows;
  assert.deepEqual(rows.map(r=>r.retry_count),[0,1,2]);assert.equal(rows[2].final_decision,'mutable_field_unstable');
 }finally{await f.close();}
});
test('periodic directory captures also retain rejected states and use targeted NEW full passes',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const before=(await f.pool.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows[0].catalog_run_id,seen:number[][]=[];
  await assert.rejects(captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),collector(moving,seen)),{code:'catalog_business_content_changed'});
  assert.equal((await f.pool.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows[0].catalog_run_id,before);
  const result=await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),collector(stable,seen));assert.equal(result.status,'complete');
  assert.deepEqual(seen,[[],[13]]);
  assert.notEqual((await f.pool.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows[0].catalog_run_id,before);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_catalog_requests WHERE status='failed'")).rows[0].n,1);
 }finally{await f.close();}
});
test('diagnostic storage failure does not replace primary error or permit retry/publication',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const initial=await heads(f),job=await request(f);
  await f.pool.query(`CREATE FUNCTION reject_catalog_diagnostic_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic diagnostic unavailable'; END $$;
   CREATE TRIGGER reject_catalog_diagnostic_test BEFORE INSERT ON ainuoke_catalog_diagnostics FOR EACH ROW EXECUTE FUNCTION reject_catalog_diagnostic_test()`);
  const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,batchSize:1,collect:collector(moving)});
  assert.equal(result.status,'failed');if(result.status==='failed')assert.equal(result.retryScheduled,false);
  const receipt=(await f.pool.query('SELECT result FROM ainuoke_sync_jobs WHERE id=$1',[job.jobId])).rows[0].result;
  assert.equal(receipt.code,'catalog_business_content_changed');assert.equal(receipt.diagnosticsPersisted,false);
  assert.deepEqual(await heads(f),initial);
 }finally{await f.close();}
});
test('unstable periodic directory waits its full cycle, then only authorizes new complete evidence',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const initial=(await f.pool.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows[0].catalog_run_id;
  const start=Date.now()+31*60000,seen:number[][]=[];
  for(const [i,offset] of [0,60000,360000].entries()){
   const result=await runSyncTick(f.pool,f.actor,selectedConfig,{now:()=>start+offset,collect:collector(moving,seen)});
   assert.equal(result.status,i<2?'catalog_retry_wait':'paused');
  }
  const ctl=(await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0];
  assert.equal(ctl.paused_reason,'catalog_retries_exhausted');assert.deepEqual(seen,[[],[13],[13]]);
  assert.equal((await f.pool.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows[0].catalog_run_id,initial);
  const last=(await f.pool.query("SELECT finished_at,result_code FROM ainuoke_sync_capture_attempts WHERE mode='catalog-discovery' ORDER BY started_at DESC LIMIT 1")).rows[0];
  assert.equal(last.result_code,'mutable_field_unstable');
  const end=new Date(last.finished_at).getTime();
  assert.equal((await resumeTransientCatalogBackoff(f.pool,f.actor,f.sourceKey,end+29*60000))?.resumed,false);
  assert.equal((await resumeTransientCatalogBackoff(f.pool,f.actor,f.sourceKey,end+30*60000))?.resumed,true);
  assert.equal((await f.pool.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows[0].catalog_run_id,initial);
  const result=await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),collector(stable,seen));
  assert.equal(result.status,'complete');assert.deepEqual(seen,[[],[13],[13],[13]]);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_catalog_requests WHERE status='failed'")).rows[0].n,3);
 }finally{await f.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';
import {enqueueAutomaticSync,requestContractSync} from '../ainuoke-source/sync-queue.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {resumeTransientCatalogBackoff} from '../ainuoke-source/sync-recovery.js';
import type {CatalogCollectionOptions} from '../ainuoke-source/catalog-checkpoints.js';
import type {SelectedSourceRequest} from '../ainuoke-source/selected-source-once.js';
import type {RequestDiagnostic} from '../ainuoke-source/sync-diagnostics.js';
import {loadRecapturePages,diagnosticValue} from '../ainuoke-source/catalog-diagnostics.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {hash} from '../ainuoke-source/contract.js';

const moving=`if report == 6086103:
        if page == 1: change.pass_number=getattr(change,'pass_number',0)+1
        if getattr(change,'pass_number',0) >= 2:
            mutate_rows(payload, lambda rows: [row.update(Price='12.000') for row in rows if row['id']=='601'])`;
const stable=`if report == 6086103:
        mutate_rows(payload, lambda rows: [row.update(Price='12.000') for row in rows if row['id']=='601'])`;
const movingNumbers=`if report == 6086103:
        if page == 1: change.pass_number=getattr(change,'pass_number',0)+1
        mutate_rows(payload, lambda rows: [row.update(Price=getattr(change,'pass_number',0)) for row in rows if row['id']=='601'])`;
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
   const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,batchSize:1,now:()=>start+offset,collect:collector(movingNumbers,seen)});
   assert.equal(result.status,'failed');if(result.status==='failed')assert.equal(result.retryScheduled,i<2,JSON.stringify(result));
   assert.equal(hash(await heads(f)),initial);
  }
  assert.deepEqual(seen,[[],[13],[13]]);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0].paused_reason,null);
  assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect:collector(stable,seen)})).status,'idle');
  assert.equal(seen.length,3);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE status IN ('queued','running','unknown')")).rows[0].n,0);
  const rows=(await f.pool.query("SELECT retry_count,final_decision,evidence FROM ainuoke_catalog_diagnostics WHERE kind='difference' ORDER BY retry_count")).rows;
  assert.deepEqual(rows.map(r=>r.retry_count),[0,1,2]);assert.equal(rows[2].final_decision,'mutable_field_unstable');
  assert.ok(rows.every(r=>r.evidence.before_exists&&r.evidence.after_exists&&r.evidence.before_type==='number'&&r.evidence.after_type==='number'));
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


test('stable retry decision diagnostic failure is known not published, finishes jobs and never becomes unknown',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const initial=await heads(f),first=await request(f),start=Date.now()+30000;
  await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start,collect:collector(moving)});
  await f.pool.query(`CREATE FUNCTION reject_catalog_decision_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF NEW.kind='decision' THEN RAISE EXCEPTION 'synthetic decision unavailable'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER reject_catalog_decision_test BEFORE INSERT ON ainuoke_catalog_diagnostics FOR EACH ROW EXECUTE FUNCTION reject_catalog_decision_test()`);
  const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start+60000,collect:collector(stable)});
  assert.equal(result.status,'failed');
  const child=(await f.pool.query('SELECT status,result FROM ainuoke_sync_jobs WHERE retry_of=$1',[first.jobId])).rows[0];
  assert.equal(child.status,'failed');assert.equal(child.result.code,'catalog_diagnostic_write_failed');
  assert.equal(child.result.diagnosticsPersisted,false);assert.deepEqual(await heads(f),initial);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE status IN ('running','queued','unknown')")).rows[0].n,0);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_capture_attempts WHERE status='running'")).rows[0].n,0);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0].paused_reason,'catalog_diagnostic_write_failed');
 }finally{await f.close();}
});

test('recapture plans cannot cross source, account, report or capture membership',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const first=await request(f);
  await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect:collector(moving)});
  const fp=accountFingerprint(selectedConfig);
  assert.deepEqual(await loadRecapturePages(f.pool,f.sourceKey,fp,[first.jobId]),[13]);
  assert.deepEqual(await loadRecapturePages(f.pool,'another-source',fp,[first.jobId]),[]);
  assert.deepEqual(await loadRecapturePages(f.pool,f.sourceKey,'a'.repeat(64),[first.jobId]),[]);
  const id=(await f.pool.query('SELECT capture_attempt_id FROM ainuoke_sync_jobs WHERE id=$1',[first.jobId])).rows[0].capture_attempt_id;
  const other=randomUUID(),otherJob=randomUUID();
  await f.pool.query("INSERT INTO ainuoke_sync_audit_batches(id,source_key,sync_type,job_ids) VALUES($1,$2,'manual',$3::uuid[])",[other,f.sourceKey,[otherJob]]);
  await f.pool.query(`INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name) VALUES($1,'6087105','synthetic other report')`,[other]);
  await f.pool.query(`INSERT INTO ainuoke_sync_capture_attempts(id,source_key,account_fingerprint,actor_id,mode,job_ids,status,started_at)
   SELECT $1,source_key,account_fingerprint,actor_id,mode,$3::uuid[],status,started_at FROM ainuoke_sync_capture_attempts WHERE id=$2`,[other,id,[otherJob]]);
  await f.pool.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by,capture_attempt_id,result)
   VALUES($1,$2,'3','SYN-SALES-3','manual','failed',$3,$4,'{"recapturePages":[13]}'::jsonb)`,[otherJob,f.sourceKey,f.actor.internalUserId,other]);
  assert.deepEqual(await loadRecapturePages(f.pool,f.sourceKey,fp,[otherJob]),[]);
  // Correct report without this job's membership still cannot authorize reuse.
  await f.pool.query(`INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name) VALUES($1,'6086103','synthetic directory')`,[other]);
  const unrelated=randomUUID();
  await f.pool.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by,capture_attempt_id,result)
   VALUES($1,$2,'3','SYN-SALES-3','manual','failed',$3,$4,'{"recapturePages":[13]}'::jsonb)`,[unrelated,f.sourceKey,f.actor.internalUserId,other]);
  assert.deepEqual(await loadRecapturePages(f.pool,f.sourceKey,fp,[unrelated]),[]);
 }finally{await f.close();}
});

test('default five automatic contracts reject the shared drifting pair; four finish on their own fresh proof without repeated retry or duplicate publication',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[],5));
  const start=Date.now()+30000;
  await f.pool.query("UPDATE ainuoke_contract_sync_state SET last_success_at=now()-interval '31 minutes',last_automatic_attempt_at=now()-interval '31 minutes'");
  await enqueueAutomaticSync(f.pool,f.actor,f.sourceKey,start);
  const initial=await heads(f),seen:number[][]=[];
  const drift5=moving.replaceAll("'601'","'5'");
  const failed=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start,collect:collector(drift5,seen)});
  assert.equal(failed.status,'failed');assert.equal(failed.jobs.length,5);assert.deepEqual(await heads(f),initial);
  const parents=(await f.pool.query("SELECT id,source_id FROM ainuoke_sync_jobs WHERE status='failed' AND result->>'code'='catalog_business_content_changed'")).rows;
  assert.equal(parents.length,5);
  // A changing shared directory authorizes nobody. The other four must obtain
  // fresh complete stable pairs, never publish their details from the rejected pair.
  for(const id of ['1','2','3','4']){
   const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,sourceIds:[id],now:()=>start+60000,collect:collector(stable,seen)});
   assert.equal(result.status,'processed');assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].status,'complete');
  }
  for(const offset of [60000,360000])await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,sourceIds:['5'],now:()=>start+offset,collect:collector(drift5,seen)});
  const receipts=(await f.pool.query(`SELECT j.id,j.source_id,j.status,j.attempt_number,j.result FROM ainuoke_sync_jobs j
   WHERE j.root_job_id=ANY($1::uuid[]) ORDER BY source_id,attempt_number`,[parents.map(p=>p.id)])).rows;
  assert.equal(receipts.filter(r=>r.source_id!=='5').length,4);
  assert.ok(receipts.filter(r=>r.source_id!=='5').every(r=>r.status==='complete'&&r.attempt_number===2));
  assert.equal(receipts.at(-1).status,'failed');assert.equal(receipts.at(-1).result.code,'mutable_field_unstable');
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_contract_observations WHERE job_id=ANY($1::uuid[])",[[...parents.filter(r=>r.source_id==='5'),...receipts.filter(r=>r.source_id==='5')].map(r=>r.id)])).rows[0].n,0);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE status IN ('running','queued','unknown')")).rows[0].n,0);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0].paused_reason,null);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM (SELECT job_id FROM ainuoke_contract_observations GROUP BY job_id HAVING count(*)>1) x')).rows[0].n,0);
 }finally{await f.close();}
});

test('diagnostic complex Price values retain only safe type, size and hash',()=>{
 assert.equal(diagnosticValue(null),null);assert.equal(diagnosticValue('12.00'),'12.00');assert.equal(diagnosticValue(12),12);
 for(const value of [{password:'never-persist',nested:{token:'never-persist'}},['never-persist'],true]){
  const result=diagnosticValue(value) as Record<string,unknown>;
  assert.equal(result.redacted,true);assert.equal(result.hash,hash(value));assert.ok(!JSON.stringify(result).includes('never-persist'));
 }
});

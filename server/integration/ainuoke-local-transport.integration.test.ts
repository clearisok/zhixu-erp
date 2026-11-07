import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';
import {SourceError} from '../ainuoke-source/contract.js';
import {accountFingerprint,type CollectorConfig} from '../ainuoke-source/collector.js';
import type {SelectedSourceRequest} from '../ainuoke-source/selected-source-once.js';
import {requestContractSync} from '../ainuoke-source/sync-queue.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';
import {runAutomaticSync} from '../ainuoke-source/sync-runner.js';
import {resumeTransientCatalogBackoff} from '../ainuoke-source/sync-recovery.js';

test('exhausted order timeouts preserve success and allow unrelated due work to continue',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  const now=Date.now()+1000;
  const entries=(await f.pool.query('SELECT source_id,sales_contract_no FROM ainuoke_catalog_entries ORDER BY sales_contract_no')).rows;
  const first=entries[0],second=entries[1];
  const success=(await f.pool.query('SELECT last_success_at FROM ainuoke_contract_sync_state WHERE source_key=$1 AND source_id=$2',[f.sourceKey,first.source_id])).rows[0].last_success_at;
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:first.source_id,requestId:randomUUID()});
  const timeout=async()=>{throw new SourceError('source_timeout');};
  await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>now,collect:timeout});
  await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>now+60001,collect:timeout});
  await f.pool.query('UPDATE ainuoke_contract_sync_state SET last_success_at=$3,last_automatic_attempt_at=NULL WHERE source_key=$1 AND source_id=$2',[f.sourceKey,second.source_id,new Date(now-31*60000)]);
  const abort=new AbortController();let calls=0,owners=0,closed=0;
  await runAutomaticSync(f.pool,f.actor,selectedConfig,{signal:abort.signal,adoptNewOrders:false,now:()=>now+360002,
   createCollector:()=>{owners++;return {available:()=>true,close:()=>{closed++;},collect:async(_c:CollectorConfig,request:SelectedSourceRequest)=>{
    calls++;if(calls===1)throw new SourceError('source_timeout');
    assert.equal(request.mode,'catalog-contracts');assert.deepEqual(request.contracts,[second.sales_contract_no]);
    return selectedWorkerFixture('catalog-contracts','',request.contracts);
   }};},onTick:async r=>{if(r.status==='processed')abort.abort();}});
  assert.equal(calls,2);assert.equal(owners,1);assert.equal(closed,1);
  const final=(await f.pool.query('SELECT source_id,last_success_at FROM ainuoke_contract_sync_state WHERE source_key=$1',[f.sourceKey])).rows;
  assert.equal(final.find(x=>x.source_id===first.source_id).last_success_at.toISOString(),success.toISOString());
  assert.equal(final.find(x=>x.source_id===second.source_id).last_success_at.getTime(),now+360002);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls WHERE source_key=$1',[f.sourceKey])).rows[0].paused_reason,null);
 }finally{await f.close();}
});

test('only evidenced transport exhaustion may resume after a full catalogue interval',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  // The fixture already has a successful catalogue attempt. Put the simulated
  // outage after it, then advance only this isolated clock by a full interval.
  const now=Date.now()+31*60000,lastFinished=now-30*60000+1000,id=randomUUID();
  await f.pool.query(`INSERT INTO ainuoke_sync_capture_attempts(id,source_key,account_fingerprint,actor_id,mode,job_ids,status,started_at,finished_at,result_code)
   VALUES($1,$2,$3,$4,'catalog-discovery','{}','failed',$5,$6,'source_timeout')`,[id,f.sourceKey,accountFingerprint(selectedConfig),f.actor.internalUserId,new Date(lastFinished-1000),new Date(lastFinished)]);
  await f.pool.query("UPDATE ainuoke_sync_controls SET paused_reason='catalog_retries_exhausted',catalog_failure_count=3 WHERE source_key=$1",[f.sourceKey]);
  assert.deepEqual(await resumeTransientCatalogBackoff(f.pool,f.actor,f.sourceKey,now),{resumed:false,retryAt:new Date(now+1000).toISOString()});
  assert.equal((await resumeTransientCatalogBackoff(f.pool,f.actor,f.sourceKey,now+1001))?.resumed,true);
  for(const reason of ['invalid_credential','auth_expired','source_account_mismatch','sync_result_unknown']){
   await f.pool.query('UPDATE ainuoke_sync_controls SET paused_reason=$2 WHERE source_key=$1',[f.sourceKey,reason]);
   assert.equal(await resumeTransientCatalogBackoff(f.pool,f.actor,f.sourceKey,now+1001),null);
   assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls WHERE source_key=$1',[f.sourceKey])).rows[0].paused_reason,reason);
  }
  await f.pool.query("UPDATE ainuoke_sync_controls SET paused_reason='catalog_retries_exhausted' WHERE source_key=$1",[f.sourceKey]);
  await f.pool.query(`INSERT INTO ainuoke_sync_capture_attempts(id,source_key,account_fingerprint,actor_id,mode,job_ids,status,started_at,finished_at,result_code)
   VALUES($1,$2,$3,$4,'catalog-discovery','{}','failed',$5,$6,'catalog_business_content_changed')`,
   [randomUUID(),f.sourceKey,accountFingerprint(selectedConfig),f.actor.internalUserId,new Date(lastFinished+1),new Date(lastFinished+2)]);
  assert.equal(await resumeTransientCatalogBackoff(f.pool,f.actor,f.sourceKey,now+1001),null);
 }finally{await f.close();}
});

test('authentication refusal stops the persistent runner without another source request',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  await f.pool.query('UPDATE ainuoke_contract_sync_state SET last_success_at=$1,last_automatic_attempt_at=NULL',[new Date(Date.now()-31*60000)]);
  let calls=0,closed=0;
  await runAutomaticSync(f.pool,f.actor,selectedConfig,{signal:new AbortController().signal,adoptNewOrders:false,
   createCollector:()=>({available:()=>true,close:()=>{closed++;},collect:async()=>{calls++;throw new SourceError('invalid_credential');}})});
  assert.equal(calls,1);assert.equal(closed,1);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls WHERE source_key=$1',[f.sourceKey])).rows[0].paused_reason,'invalid_credential');
 }finally{await f.close();}
});

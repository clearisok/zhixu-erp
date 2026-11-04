import test from 'node:test';
import assert from 'node:assert/strict';
import { startCatalogFixture } from './ainuoke-catalog-fixture.js';
import { hydrateContractEvidence, loadCatalogEvidence, saveCatalogEvidence } from '../ainuoke-source/catalog-evidence.js';
import { hash } from '../ainuoke-source/contract.js';
import { accountFingerprint } from '../ainuoke-source/collector.js';
import { selectedConfig } from './selected-source-fixture.js';
import { readCatalogDetail } from '../ainuoke-source/catalog-detail.js';
import { requestContractSync, readSyncRequest } from '../ainuoke-source/sync-queue.js';
import { runSyncTick } from '../ainuoke-source/sync-worker.js';
import { selectedWorkerFixture } from './selected-source-fixture.js';
import { randomUUID } from 'node:crypto';
import { readCatalog } from '../ainuoke-source/catalog.js';

test('shared catalogue evidence keeps exact captures and old readers without rewriting history',{timeout:180000},async t=>{
 const f=await startCatalogFixture();
 try {
  const observations=(await f.pool.query(`SELECT o.*,p.account_fingerprint FROM ainuoke_contract_observations o JOIN ainuoke_source_profiles p USING(source_key) ORDER BY source_id`)).rows;
  await t.test('one group shares a capture and original immutable rows reconstruct exactly',async()=>{
   assert.equal(observations.length,3);
   assert.equal(new Set(observations.map(o=>o.capture_evidence_id)).size,1);
   for(const row of observations){
    assert.equal(row.evidence.schemaVersion,'ainuoke-contract-observation.v2');
    assert.equal(row.evidence.addition,undefined);
    const hydrated=await hydrateContractEvidence(f.pool,row);
    assert.ok(hydrated.addition.discoveryAfter[0].rows.length>0);
    const legacy={...row,capture_evidence_id:null,evidence:hydrated,content_hash:hash(hydrated)};
    assert.deepEqual(await hydrateContractEvidence(f.pool,legacy),hydrated);
    assert.equal((await readCatalogDetail(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:row.source_id})).status,'observed');
   }
  });
  await t.test('changed capture times reuse row content but preserve both exact timestamped proofs',async()=>{
   const fp=accountFingerprint(selectedConfig),id=observations[0].capture_evidence_id;
   const original=await loadCatalogEvidence(f.pool,f.sourceKey,id,fp);
   const before=Number((await f.pool.query('SELECT count(*) n FROM ainuoke_catalog_evidence_chunks')).rows[0].n);
   const next=structuredClone(original);
   for(const page of [...next.discoveryBefore,...next.discoveryAfter])page.fetchedAt=new Date(Date.parse(page.fetchedAt)+1000).toISOString();
   const nextId=await saveCatalogEvidence(f.pool,f.sourceKey,fp,next);
   assert.notEqual(nextId,id);
   assert.equal(await saveCatalogEvidence(f.pool,f.sourceKey,fp,next),nextId);
   assert.equal(Number((await f.pool.query('SELECT count(*) n FROM ainuoke_catalog_evidence_chunks')).rows[0].n),before);
   assert.deepEqual(await loadCatalogEvidence(f.pool,f.sourceKey,nextId,fp),next);
   assert.deepEqual(await loadCatalogEvidence(f.pool,f.sourceKey,id,fp),original);
   await assert.rejects(loadCatalogEvidence(f.pool,f.sourceKey,id,'0'.repeat(64)),/catalog_evidence_invalid/);
   await assert.rejects(f.pool.query('UPDATE ainuoke_catalog_evidence_chunks SET rows=rows'),/immutable/);
   await assert.rejects(f.pool.query('DELETE FROM ainuoke_catalog_capture_evidence'),/immutable/);
  });
 }finally{await f.close();}
});

test('periodic directory timeouts back off durably and pause at three captures',{timeout:180000},async()=>{
 const f=await startCatalogFixture();
 try{
  const baseline=(await f.pool.query('SELECT source_id,last_success_at FROM ainuoke_contract_sync_state ORDER BY source_id')).rows;
  const start=Date.now()+31*60000;let calls=0;
  const collect=async(_cfg:unknown,request:{mode:string})=>{
   assert.equal(request.mode,'catalog-discovery');calls++;
   const raw=selectedWorkerFixture('catalog-discovery','',[]);
   return {schemaVersion:'ainuoke-request-diagnostics.v1',capture:{...(raw as Record<string,unknown>),result:'failed',bundle:null,code:'source_unavailable',metrics:{logins:1,reportRequests:1,httpAttempts:2,networkRetries:0,authRenewals:0}},requests:[
    {kind:'login',reportId:null,page:null,elapsedMs:10,outcome:'complete',httpStatus:null},
    {kind:'report',reportId:6086103,page:13,elapsedMs:45015,outcome:'timeout',httpStatus:null}]};
  };
  assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{now:()=>start,collect})).status,'catalog_retry_wait');
  assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{now:()=>start+59000,collect})).status,'catalog_retry_wait');assert.equal(calls,1);
  assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{now:()=>start+60000,collect})).status,'catalog_retry_wait');
  assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{now:()=>start+360000,collect})).status,'paused');assert.equal(calls,3);
  assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{now:()=>start+720000,collect})).status,'paused');assert.equal(calls,3);
  const control=(await f.pool.query('SELECT paused_reason,catalog_failure_count FROM ainuoke_sync_controls')).rows[0];
  assert.equal(control.paused_reason,'catalog_retries_exhausted');assert.equal(control.catalog_failure_count,3);
  assert.deepEqual((await f.pool.query('SELECT source_id,last_success_at FROM ainuoke_contract_sync_state ORDER BY source_id')).rows,baseline);
 }finally{await f.close();}
});

test('transient failures preserve success and create finite durable retry jobs',{timeout:180000},async t=>{
 const f=await startCatalogFixture();
 try{
  const entry=(await readCatalog(f.pool,f.actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0];
  const input={sourceKey:f.sourceKey,sourceId:entry.sourceId,requestId:randomUUID()};
  const original=await requestContractSync(f.pool,f.actor,input),start=Date.now();let calls=0;
  const collect=async()=>{
   calls++;
   const raw=selectedWorkerFixture('catalog-contracts','',[entry.salesContractNo]);
   const capture={...(raw as Record<string,unknown>),result:'failed',bundle:null,code:'source_unavailable',metrics:{logins:1,reportRequests:1,httpAttempts:2,networkRetries:0,authRenewals:0}};
   return {schemaVersion:'ainuoke-request-diagnostics.v1',capture,requests:[
    {kind:'login',reportId:null,page:null,elapsedMs:10,outcome:'complete',httpStatus:null},
    {kind:'report',reportId:6087105,page:1,elapsedMs:45015,outcome:'timeout',httpStatus:null}]};
  };
  await t.test('first failure is retained; deferred retry and diagnostic survive receipt reload',async()=>{
   const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start,collect});
   assert.equal(result.status,'failed');if(result.status==='failed')assert.equal(result.retryScheduled,true);
   const receipt=await readSyncRequest(f.pool,f.actor,input.requestId);
   assert.equal(receipt.status,'queued');assert.equal(receipt.attemptNumber,2);assert.equal(receipt.originalStatus,'failed');
   assert.equal(new Date(receipt.retryAt).getTime(),start+60000);
   assert.equal((await f.pool.query('SELECT status FROM ainuoke_sync_jobs WHERE id=$1',[original.jobId])).rows[0].status,'failed');
   assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start+59000,collect})).status,'idle');assert.equal(calls,1);
   const after=(await readCatalog(f.pool,f.actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50}));
   assert.deepEqual(after.rows[0].lastSuccessAt,entry.lastSuccessAt);assert.equal(after.rows[0].lastDiagnostic.reportId,6087105);assert.equal(after.syncSummary.retrying,1);
  });
  await t.test('manual acceleration coalesces a deferred job without resetting its attempt budget',async()=>{
   const first=await readSyncRequest(f.pool,f.actor,input.requestId);
   const requested=await Promise.all([requestContractSync(f.pool,f.actor,{...input,requestId:randomUUID()}),requestContractSync(f.pool,f.actor,{...input,requestId:randomUUID()})]);
   assert.ok(requested.every(r=>r.jobId===first.jobId));
   const row=(await f.pool.query('SELECT available_at,attempt_number FROM ainuoke_sync_jobs WHERE id=$1',[first.jobId])).rows[0];
   assert.ok(new Date(row.available_at).getTime()<=Date.now());assert.equal(row.attempt_number,2);assert.equal(calls,1);
  });
  await t.test('second retry waits five minutes, then stops at three attempts without rewriting receipts',async()=>{
   await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start+60000,collect});
   let receipt=await readSyncRequest(f.pool,f.actor,input.requestId);assert.equal(receipt.attemptNumber,3);assert.equal(new Date(receipt.retryAt).getTime(),start+360000);
   assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start+359999,collect})).status,'idle');
   const final=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,now:()=>start+360000,collect});
   assert.equal(final.status,'failed');if(final.status==='failed')assert.equal(final.retryScheduled,false);
   receipt=await readSyncRequest(f.pool,f.actor,input.requestId);assert.equal(receipt.status,'failed');assert.equal(receipt.attemptNumber,3);assert.equal(calls,3);
   assert.equal(Number((await f.pool.query('SELECT count(*) n FROM ainuoke_sync_jobs WHERE retry_of IS NOT NULL')).rows[0].n),2);
   await assert.rejects(f.pool.query("UPDATE ainuoke_sync_jobs SET status='queued' WHERE id=$1",[original.jobId]),/immutable/);
   assert.equal(Number((await f.pool.query("SELECT count(*) n FROM ainuoke_sync_capture_attempts WHERE status='failed'")).rows[0].n),3);
   await assert.rejects(f.pool.query("UPDATE ainuoke_sync_capture_attempts SET requests='[]' WHERE status='failed'"),/immutable/);
  });
  await t.test('a new explicit manual request is independent and cannot refresh another contract',async()=>{
   await requestContractSync(f.pool,f.actor,{...input,requestId:randomUUID()});
   const done=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect:async(_cfg,request)=>{
    assert.equal(request.mode,'catalog-contracts');if(request.mode!=='catalog-contracts')throw Error();assert.deepEqual(request.contracts,[entry.salesContractNo]);
    return selectedWorkerFixture('catalog-contracts','',request.contracts);
   }});
   assert.equal(done.status,'processed');assert.equal(done.jobs.length,1);assert.equal(done.jobs[0].status,'complete');
  });
 }finally{await f.close();}
});

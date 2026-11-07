import test from 'node:test';
import assert from 'node:assert/strict';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {pauseSyncForHandoff,configureSync} from '../ainuoke-source/sync-queue.js';
import {recoverSync} from '../ainuoke-source/sync-recovery.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';
import {selectedConfig} from './selected-source-fixture.js';

test('controlled handoff waits for the worker, preserves readers/jobs and needs explicit recovery', {timeout:180000}, async()=>{
 const f=await startCatalogFixture(),lease=await f.pool.connect();
 try{
  const control=(await f.pool.query('SELECT version,policy FROM ainuoke_sync_controls WHERE source_key=$1',[f.sourceKey])).rows[0];
  const input={sourceKey:f.sourceKey,expectedVersion:control.version,policy:control.policy};
  const before=(await f.pool.query('SELECT id,status,result FROM ainuoke_sync_jobs ORDER BY id')).rows;
  await lease.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['ainuoke-sync-worker:'+f.sourceKey]);
  await assert.rejects(pauseSyncForHandoff(f.pool,f.actor,input),/sync_worker_busy/);
  await lease.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ainuoke-sync-worker:'+f.sourceKey]);
  const paused=await pauseSyncForHandoff(f.pool,f.actor,input);assert.equal(paused.enabled,false);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls WHERE source_key=$1',[f.sourceKey])).rows[0].paused_reason,'staging_handoff');
  assert.equal((await f.pool.query('SELECT enabled FROM ainuoke_source_profiles WHERE source_key=$1',[f.sourceKey])).rows[0].enabled,true);
  let requests=0;assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{collect:async()=>{requests++;throw Error('must not read');}})).status,'paused');assert.equal(requests,0);
  await assert.rejects(configureSync(f.pool,f.actor,{...input,enabled:true,expectedVersion:paused.version}),/sync_worker_paused/);
  assert.deepEqual((await f.pool.query('SELECT id,status,result FROM ainuoke_sync_jobs ORDER BY id')).rows,before);
  const review=await recoverSync(f.pool,f.actor,f.sourceKey);
  await recoverSync(f.pool,f.actor,f.sourceKey,{expectedHash:review.reviewHash,reason:'Synthetic rollback after remote worker stopped'});
  const current=(await f.pool.query('SELECT enabled,version,paused_reason FROM ainuoke_sync_controls WHERE source_key=$1',[f.sourceKey])).rows[0];
  assert.equal(current.enabled,false);assert.equal(current.paused_reason,null);
  await configureSync(f.pool,f.actor,{...input,enabled:true,expectedVersion:current.version});
 }finally{lease.release();await f.close();}
});

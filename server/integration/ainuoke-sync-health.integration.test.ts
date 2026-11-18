import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {requestContractSync,claimSyncJobs} from '../ainuoke-source/sync-queue.js';
import {readSyncHealth} from '../ainuoke-source/sync-health.js';

test('recovery health read detects pause and in-flight work without changing either', {timeout:180000}, async()=>{
 const f=await startCatalogFixture();
 try{
  const source=(await f.pool.query('SELECT source_id FROM ainuoke_catalog_entries ORDER BY source_id LIMIT 1')).rows[0].source_id;
  const healthy=await readSyncHealth(f.pool,f.sourceKey,['0058_ainuoke_sync_audit.sql']);
  assert.equal(healthy.databaseHealthy,true);
  assert.equal(healthy.migrationsCurrent,true);
  assert.equal(healthy.adminNotPaused,true);
  assert.equal(healthy.noUnknownResult,true);
  assert.equal((await readSyncHealth(f.pool,f.sourceKey,[])).migrationsCurrent,false);
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:source,requestId:randomUUID()});
  const jobs=await claimSyncJobs(f.pool,f.actor,f.sourceKey,1,Date.now()+1000);
  assert.equal(jobs.length,1);
  await f.pool.query("UPDATE ainuoke_sync_controls SET paused_reason='invalid_credential' WHERE source_key=$1",[f.sourceKey]);
  const blocked=await readSyncHealth(f.pool,f.sourceKey,['0058_ainuoke_sync_audit.sql']);
  assert.equal(blocked.adminNotPaused,false);
  assert.equal(blocked.noUnknownResult,false);
  assert.equal((await f.pool.query('SELECT status FROM ainuoke_sync_jobs WHERE id=$1',[jobs[0].id])).rows[0].status,'running');
 }finally{await f.close();}
});

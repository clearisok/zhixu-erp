import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {runMigrations} from '../../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../../auth/permissions.js';
import {bootstrapAdmin} from '../../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../../sales-orders/bootstrap-runner.js';
import {bindOrders} from '../../ainuoke-source/binding.js';
import {validateSelectedSourceOnce} from '../../ainuoke-source/selected-source-once.js';
import {accountFingerprint} from '../../ainuoke-source/collector.js';
import {captureCatalogOnce} from '../../ainuoke-source/catalog-capture.js';
import {configureSync,enqueueAutomaticSync,requestContractSync,claimSyncJobs} from '../../ainuoke-source/sync-queue.js';
import {DEFAULT_SYNC_POLICY} from '../../ainuoke-source/sync-schedule.js';
import {runSyncTick} from '../../ainuoke-source/sync-worker.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from '../selected-source-fixture.js';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const source=selectedConfig.sourceKey,action=process.argv[2];
try{
 if(action==='bootstrap'){
  await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'Synthetic recovery',password:'Synthetic-Recovery-Only'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername);
  const selected=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  if(selected.result!=='complete'||selected.mode!=='selected-bindings')throw Error('fixture_invalid');
  await bindOrders(pool,actor,{sourceKey:source,accountFingerprint:accountFingerprint(selectedConfig),selected:selectedContracts,
   expectedPreview:selected.preview.reviewHash,collect:async()=>selected.bundle});
  await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[]));
  await configureSync(pool,actor,{sourceKey:source,enabled:true,expectedVersion:0,policy:{...DEFAULT_SYNC_POLICY}});
  await enqueueAutomaticSync(pool,actor,source);
  await runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async(_cfg,r)=>{
   if(!('contracts' in r))throw Error('unexpected_test_capture');return selectedWorkerFixture('catalog-contracts','',r.contracts);}});
  process.stdout.write(JSON.stringify({sourceKey:source,collector:selectedConfig}));
 }else if(action==='pause'||action==='unpause'){
  await pool.query('UPDATE ainuoke_sync_controls SET enabled=$2 WHERE source_key=$1',[source,action==='unpause']);
 }else if(action==='due'){
  // Test clock boundary: existing successful observations become 31 minutes
  // old in this disposable DB, without waiting for a real half hour.
  await pool.query("UPDATE ainuoke_contract_sync_state SET last_success_at=now()-interval '31 minutes',last_automatic_attempt_at=now()-interval '31 minutes' WHERE source_key=$1",[source]);
 }else if(action==='unknown'){
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername);
  const entry=(await pool.query('SELECT source_id FROM ainuoke_catalog_entries ORDER BY source_id LIMIT 1')).rows[0];
  await requestContractSync(pool,actor,{sourceKey:source,sourceId:entry.source_id,requestId:randomUUID()});
  const jobs=await claimSyncJobs(pool,actor,source,1,Date.now()+1000);
  await pool.query("UPDATE ainuoke_sync_jobs SET status='unknown',finished_at=now(),result=$2 WHERE id=$1",[jobs[0].id,{code:'synthetic_unknown'}]);
 }else if(action==='bad-migration'||action==='restore-migration'){
  const {discoverMigrations}=await import('../../db/migration-runner.js');
  const migration=(await discoverMigrations(resolve('database/migrations'))).find(m=>m.version==='58')!;
  await pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=58',[action==='bad-migration'?'invalid-test-checksum':migration.checksum]);
 }else if(action==='status'){
  const row=(await pool.query(`SELECT count(*)::int total,count(*) FILTER(WHERE status='complete')::int complete,
   count(*) FILTER(WHERE status IN ('running','queued','unknown'))::int active FROM ainuoke_sync_jobs WHERE source_key=$1`,[source])).rows[0];
  const duplicates=(await pool.query("SELECT count(*)::int n FROM (SELECT source_id FROM ainuoke_sync_jobs WHERE status IN('queued','running','unknown') GROUP BY source_id HAVING count(*)>1) d")).rows[0];
  process.stdout.write(JSON.stringify({...row,duplicates:duplicates.n}));
 }else throw Error('test_action_invalid');
}finally{await pool.end();}

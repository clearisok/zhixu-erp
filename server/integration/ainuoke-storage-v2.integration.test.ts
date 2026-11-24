import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {refreshFollowupGroup} from '../ainuoke-source/group-refresh.js';
import {planFollowupGroups} from '../ainuoke-source/followup.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {hydrateSharedPages} from '../ainuoke-source/shared-content.js';
import {hash} from '../ainuoke-source/contract.js';
import {maintainSourceStorage} from '../ainuoke-source/storage-maintenance.js';
import {configureSync,enqueueAutomaticSync,requestContractSync} from '../ainuoke-source/sync-queue.js';
import {DEFAULT_SYNC_POLICY} from '../ainuoke-source/sync-schedule.js';
import {previewCatalog,publishCatalog} from '../ainuoke-source/catalog.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';

test('storage v2 retains A-B-A events, shares bodies, confirms unchanged generations and rejects damaged/scoped evidence',{timeout:180000},async()=>{
 const db=await startDisposablePostgres(),connectionString=await db.createDatabase('storage_v2'),pool=new pg.Pool({connectionString,max:4});
 try{
  await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'Storage test',password:'synthetic-storage-test'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername),sourceKey=selectedConfig.sourceKey;
  await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint,source_history_started_at) VALUES($1,$2,now()-interval '60 days')",[sourceKey,accountFingerprint(selectedConfig)]);
  const selected=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  assert.ok(selected.result==='complete'&&selected.mode==='selected-bindings');
  await bindOrders(pool,actor,{sourceKey,accountFingerprint:accountFingerprint(selectedConfig),selected:selectedContracts,expectedPreview:selected.preview.reviewHash,collect:async()=>selected.bundle});
  const group=(await planFollowupGroups(pool,actor,sourceKey,1)).groups[0];
  const capture=async(mutation='')=>refreshFollowupGroup(pool,actor,selectedConfig,{contracts:group.contracts as string[],expectedScopeHash:group.scopeHash,requestId:randomUUID()},
   async()=>selectedWorkerFixture('bound-materials',mutation,group.contracts as string[]));
  const counts=async()=> (await pool.query(`SELECT (SELECT count(*)::int FROM ainuoke_source_runs) runs,(SELECT count(*)::int FROM ainuoke_contract_contents WHERE kind='materials') bodies`)).rows[0];
  await capture();const first=await counts();assert.deepEqual(first,{runs:1,bodies:1});
  const initial=(await pool.query('SELECT * FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[group.orderIds[0]])).rows[0];
  await capture();assert.deepEqual(await counts(),first);
  const unchanged=(await pool.query('SELECT * FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[group.orderIds[0]])).rows[0];
  assert.equal(unchanged.run_id,initial.run_id);assert.ok(unchanged.last_verified_at>=initial.last_verified_at);
  const progress=await createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey,maxAgeMs:600000}))(actor,{salesOrderId:group.orderIds[0]});
  assert.equal(progress.status,200);if(progress.status===200)assert.equal(progress.body.progress.sourceStatus,'ready');
  await capture("if report == 6087050: mutate_rows(payload, lambda rows: rows[0].update({'TotalNum': '116.50'}))");
  assert.deepEqual(await counts(),{runs:2,bodies:2});
  await capture();assert.deepEqual(await counts(),{runs:3,bodies:2});
  const snapshots=(await pool.query(`SELECT s.*,r.source_key FROM ainuoke_material_source_snapshots s JOIN ainuoke_source_runs r ON r.id=s.run_id ORDER BY r.created_at`)).rows;
  assert.equal(snapshots[0].material_content_id,snapshots[2].material_content_id);
  assert.notEqual(snapshots[0].run_id,snapshots[2].run_id);
  for(const snapshot of snapshots)assert.equal(hash(await hydrateSharedPages(pool,sourceKey,snapshot.snapshots,{kind:'materials',contract:snapshot.sales_contract_no})),snapshot.content_hash);
  const damaged=structuredClone(snapshots[0].snapshots);damaged[0].manifest[0].ordinals[0]=999999;
  await assert.rejects(hydrateSharedPages(pool,sourceKey,damaged),/content_manifest_invalid/);
  await assert.rejects(hydrateSharedPages(pool,sourceKey,snapshots[0].snapshots,{contract:'OTHER-CONTRACT'}),/content_integrity_failure/);
  await assert.rejects(pool.query('UPDATE ainuoke_contract_contents SET body=body WHERE id=$1',[snapshots[0].material_content_id]),/immutable/);
  const allTables=(await pool.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n;
  assert.equal(allTables,147);
  await configureSync(pool,actor,{sourceKey,enabled:false,expectedVersion:0,policy:{...DEFAULT_SYNC_POLICY}});
  const directory={schemaVersion:'ainuoke-order-addition-discovery.v1' as const,discoveryBefore:selected.bundle.discoveryBefore,discoveryAfter:selected.bundle.discoveryAfter};
  const directoryPreview=await previewCatalog(directory);
  await publishCatalog(pool,actor,{sourceKey,accountFingerprint:accountFingerprint(selectedConfig),requestId:randomUUID(),input:directory,expectedHash:directoryPreview.contentHash});
  const entries=(await pool.query('SELECT source_id,sales_contract_no FROM ainuoke_catalog_entries ORDER BY source_id')).rows;
  const jobs=[randomUUID(),randomUUID(),randomUUID()];
  for(let i=0;i<3;i++)await pool.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by,requested_at,started_at,finished_at,result)
   VALUES($1,$2,$3,$4,$5,$6,$7,now()-($8::int*interval '1 day'),now()-($8::int*interval '1 day'),now()-($8::int*interval '1 day')+interval '2 seconds',$9::jsonb)`,
   [jobs[i],sourceKey,entries[i].source_id,entries[i].sales_contract_no,i===1?'manual':'automatic',['complete','unknown','failed'][i],actor.internalUserId,i===2?40:8,JSON.stringify({code:i===0?'complete':'synthetic_failure',businessChanged:false})]);
  const preview=(await pool.query('SELECT ainuoke_storage_prune($1,false,10) result',[sourceKey])).rows[0].result;
  assert.equal(preview.apply,false);assert.equal(preview.cleanupEnabled,false);
  await assert.rejects(pool.query('SELECT ainuoke_storage_prune($1,true,10)',[sourceKey]),/cleanup is disabled/);
  assert.equal((await maintainSourceStorage(pool,sourceKey)).status,'complete');
  const totals=async()=> (await pool.query('SELECT sum(attempts)::int attempts,sum(successes)::int successes,sum(failures)::int failures,sum(unknown_results)::int unknown_results FROM ainuoke_sync_daily_rollups')).rows[0];
  assert.deepEqual(await totals(),{attempts:3,successes:1,failures:1,unknown_results:1});
  await pool.query('SELECT ainuoke_storage_rollup($1,100)',[sourceKey]);assert.equal((await totals()).attempts,3);
  await assert.rejects(pool.query('SELECT ainuoke_storage_resolve_failure($1,$2,$3)',[sourceKey,'job',jobs[1]]),/unknown/);
  await pool.query("UPDATE ainuoke_sync_jobs SET status='failed',result='{}' WHERE id=$1",[jobs[1]]);
  await pool.query('SELECT ainuoke_storage_rollup($1,100)',[sourceKey]);
  assert.deepEqual(await totals(),{attempts:3,successes:1,failures:2,unknown_results:0});
  const review=(await pool.query('SELECT ainuoke_storage_resolve_failure($1,$2,$3) AS review',[sourceKey,'job',jobs[2]])).rows[0].review;
  await assert.rejects(pool.query('SELECT ainuoke_storage_resolve_failure($1,$2,$3,true,$4,$5::jsonb)',[sourceKey,'job',jobs[2],'bad-review',JSON.stringify({reason:'synthetic reviewed resolution',reviewReference:'test-case'})]),/review changed/);
  await pool.query('SELECT ainuoke_storage_resolve_failure($1,$2,$3,true,$4,$5::jsonb)',[sourceKey,'job',jobs[2],review.previewHash,JSON.stringify({reason:'synthetic reviewed resolution',reviewReference:'test-case'})]);
  const resolved=(await pool.query('SELECT resolved_at>now()-interval \'1 minute\' AS recent FROM ainuoke_sync_jobs WHERE id=$1',[jobs[2]])).rows[0];assert.equal(resolved.recent,true);
  const ordinary='storage_app_'+randomUUID().replaceAll('-','');
  await pool.query(`CREATE ROLE ${ordinary} LOGIN PASSWORD 'synthetic-storage-role-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${ordinary}`);
  await pool.query(`GRANT SELECT,UPDATE,DELETE ON ainuoke_contract_contents TO ${ordinary}`);
  await pool.query(`GRANT EXECUTE ON FUNCTION ainuoke_storage_rollup(text,integer),ainuoke_storage_prune(text,boolean,integer) TO ${ordinary}`);
  const restrictedUrl=new URL(connectionString);restrictedUrl.username=ordinary;restrictedUrl.password='synthetic-storage-role-only';
  const restrictedPool=new pg.Pool({connectionString:restrictedUrl.toString(),max:1}),restricted=await restrictedPool.connect();
  try{
   const actual=(await restricted.query('SELECT current_user,session_user')).rows[0];assert.equal(actual.current_user,ordinary);assert.equal(actual.session_user,ordinary);
   await restricted.query('CREATE TEMP TABLE ainuoke_sync_jobs(fake text)');
   await restricted.query('SELECT public.ainuoke_storage_rollup($1,10)',[sourceKey]);
   await restricted.query('SELECT public.ainuoke_storage_prune($1,false,10)',[sourceKey]);
   await assert.rejects(restricted.query('DELETE FROM public.ainuoke_contract_contents'),/immutable/);
   await assert.rejects(restricted.query('ALTER TABLE public.ainuoke_contract_contents DISABLE TRIGGER ALL'),/owner/);
   await assert.rejects(restricted.query("SET session_replication_role='replica'"),/permission/);
   await assert.rejects(restricted.query('SET ROLE ainuoke_storage_maintenance'),/permission/);
   await assert.rejects(restricted.query('SELECT public.ainuoke_storage_resolve_failure($1,$2,$3)',[sourceKey,'job',jobs[2]]),/permission/);
  }finally{restricted.release();await restrictedPool.end();}
  await pool.query('UPDATE ainuoke_sync_controls SET storage_cleanup_enabled=true WHERE source_key=$1',[sourceKey]);
  const applied=(await pool.query('SELECT ainuoke_storage_prune($1,true,10) result',[sourceKey])).rows[0].result;
  assert.equal(applied.apply,true);assert.deepEqual(await counts(),{runs:3,bodies:2});
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE id=$1',[jobs[0]])).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE id=ANY($1::uuid[])',[[jobs[1],jobs[2]]])).rows[0].n,2,'unresolved/manual and newly resolved failures survive old request timestamps');
  assert.equal((await totals()).attempts,3,'expired detail deletion does not erase the daily total');
  const failingPool={connect:async()=>{throw new Error('ordinary auxiliary connection outage');}} as unknown as pg.Pool;
  assert.equal((await maintainSourceStorage(failingPool,sourceKey,1000000)).status,'failed');
  assert.equal((await maintainSourceStorage(failingPool,sourceKey,1000001)).status,'backoff');
 }finally{await pool.end();await db.stop();}
});

test('unchanged automatic captures keep stable colors and business generations; manual intent remains audited',{timeout:180000},async()=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('storage_automatic'),max:4});
 try{
  await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'Automatic storage test',password:'synthetic-auto-storage'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername),sourceKey=selectedConfig.sourceKey,fp=accountFingerprint(selectedConfig);
  const contracts=selectedContracts,selected=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings','',contracts),selectedConfig,{mode:'selected-bindings',contracts});
  assert.ok(selected.result==='complete'&&selected.mode==='selected-bindings');
  await bindOrders(pool,actor,{sourceKey,accountFingerprint:fp,selected:contracts,expectedPreview:selected.preview.reviewHash,collect:async()=>selected.bundle});
  const directory={schemaVersion:'ainuoke-order-addition-discovery.v1' as const,discoveryBefore:selected.bundle.discoveryBefore,discoveryAfter:selected.bundle.discoveryAfter},checked=await previewCatalog(directory);
  await publishCatalog(pool,actor,{sourceKey,accountFingerprint:fp,requestId:randomUUID(),input:directory,expectedHash:checked.contentHash});
  await configureSync(pool,actor,{sourceKey,enabled:true,expectedVersion:0,policy:{...DEFAULT_SYNC_POLICY}});
  const entry=(await pool.query('SELECT source_id FROM ainuoke_catalog_entries WHERE sales_contract_no=$1',[contracts[0]])).rows[0];
  const tick=()=>runSyncTick(pool,actor,selectedConfig,{automatic:false,sourceIds:[entry.source_id],collect:async(_config,request)=>{
   assert.equal(request.mode,'catalog-contracts');if(request.mode!=='catalog-contracts')throw new Error('wrong test scope');return selectedWorkerFixture('catalog-contracts','',request.contracts);
  }});
  const due=async()=>{
   await pool.query("UPDATE ainuoke_contract_sync_state SET last_success_at=now()-interval '10 days',last_automatic_attempt_at=now()-interval '10 days' WHERE source_key=$1 AND source_id=$2",[sourceKey,entry.source_id]);
   await enqueueAutomaticSync(pool,actor,sourceKey);
  };
  await due();const first=await tick();assert.ok(first.jobs.length===1&&first.jobs[0].status==='complete',JSON.stringify(first));
  const colors=(await pool.query('SELECT to_jsonb(c)::text AS value FROM ainuoke_sales_order_color_mirrors c ORDER BY id')).rows;
  const formalLogs=async()=>Number((await pool.query("SELECT count(*) n FROM operation_logs WHERE entity_type='SalesOrder' AND metadata->>'mutationSurface'='source_refresh'")).rows[0].n);
  const before=await formalLogs();
  await due();const second=await tick();assert.ok(second.jobs.length===1&&second.jobs[0].status==='complete',JSON.stringify(second));
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_source_runs')).rows[0].n,1);
  assert.deepEqual((await pool.query('SELECT to_jsonb(c)::text AS value FROM ainuoke_sales_order_color_mirrors c ORDER BY id')).rows,colors);
  assert.equal(await formalLogs(),before);
  assert.deepEqual((await pool.query('SELECT record_kind FROM ainuoke_contract_observations ORDER BY captured_at,id')).rows.map(r=>r.record_kind),['change','confirmation']);
  await requestContractSync(pool,actor,{sourceKey,sourceId:entry.source_id,requestId:randomUUID()});
  const manual=await tick();assert.ok(manual.jobs.length===1&&manual.jobs[0].status==='complete',JSON.stringify(manual));
  assert.equal(await formalLogs(),before+1,'employee-triggered unchanged sync intent remains in the formal audit');
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_source_runs')).rows[0].n,1);
 }finally{await pool.end();await db.stop();}
});

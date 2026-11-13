import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {previewCatalog,publishCatalog,readCatalog} from '../ainuoke-source/catalog.js';
import {setFollowup,planFollowupGroups} from '../ainuoke-source/followup.js';
import {boundOrders} from '../ainuoke-source/service.js';
import { SourceError } from '../ainuoke-source/contract.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {refreshFollowupGroup} from '../ainuoke-source/group-refresh.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import { configureSync, enqueueAutomaticSync, requestContractSync, readSyncRequest } from '../ainuoke-source/sync-queue.js';
import { DEFAULT_SYNC_POLICY } from '../ainuoke-source/sync-schedule.js';
import { runSyncTick } from '../ainuoke-source/sync-worker.js';
import { readCatalogDetail,previewCatalogIntake,adoptCatalogContract } from '../ainuoke-source/catalog-detail.js';
import { recoverSync } from '../ainuoke-source/sync-recovery.js';
import { parseSourceArguments } from '../ainuoke-source/cli.js';
import { captureCatalogOnce } from '../ainuoke-source/catalog-capture.js';

test('catalogue is not a business ledger; active groups publish and fail independently',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('catalog_followup'),max:4});
 try{
  await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'Synthetic catalogue admin',password:'synthetic-catalogue'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername),sourceKey=selectedConfig.sourceKey,fp=accountFingerprint(selectedConfig);
  const selected=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  assert.ok(selected.result==='complete'&&selected.mode==='selected-bindings');
  await bindOrders(pool,actor,{sourceKey,accountFingerprint:fp,selected:selectedContracts,expectedPreview:selected.preview.reviewHash,collect:async()=>selected.bundle});
  const count=async(table:string)=>Number((await pool.query('SELECT count(*) n FROM '+table)).rows[0].n);
  const baseCounts=await Promise.all(['sales_orders','quote_center_quotes','server_closing_month_plans','production_schedule_assignments'].map(count));
  const catalog={schemaVersion:'ainuoke-order-addition-discovery.v1' as const,discoveryBefore:selected.bundle.discoveryBefore,discoveryAfter:selected.bundle.discoveryAfter};
  const checked=await previewCatalog(catalog),requestId=randomUUID(),publication={sourceKey,accountFingerprint:fp,requestId,input:catalog,expectedHash:checked.contentHash};
  await t.test('directory publication is atomic, replayable and never creates orders or closing plans',async()=>{
   assert.equal((await publishCatalog(pool,actor,publication)).replayed,false);
   assert.equal((await publishCatalog(pool,actor,publication)).replayed,true);
   assert.equal(await count('ainuoke_catalog_runs'),1);
   assert.deepEqual(await Promise.all(['sales_orders','quote_center_quotes','server_closing_month_plans','production_schedule_assignments'].map(count)),baseCounts);
   const all=await readCatalog(pool,actor,{search:'SYN SALES',scope:'all',offset:0,limit:1});assert.equal(all.total,3);assert.equal(all.rows.length,1);
   assert.equal((await readCatalog(pool,actor,{search:'definitely-missing',scope:'all',offset:0,limit:50})).total,0);
  });
  await t.test('incomplete, changed and identity-reused directories preserve accepted catalogue',async()=>{
   const broken=structuredClone(catalog);broken.discoveryAfter[0].rows.pop();await assert.rejects(previewCatalog(broken));
   const changed=structuredClone(catalog);changed.discoveryBefore[0].rows[0].values.BillNo='NEW-CONTRACT';changed.discoveryAfter=structuredClone(changed.discoveryBefore);
   const preview=await previewCatalog(changed);await assert.rejects(publishCatalog(pool,actor,{...publication,requestId:randomUUID(),input:changed,expectedHash:preview.contentHash}),/catalog_identity_changed/);
   assert.equal(await count('ainuoke_catalog_runs'),1);
  });
  const targets=await boundOrders(pool),plan=await planFollowupGroups(pool,actor,sourceKey,1);
  let calls=0;
  const perform=async(index:number,request=randomUUID(),mutation='')=>{const g=plan.groups[index];return refreshFollowupGroup(pool,actor,selectedConfig,{contracts:g.contracts as string[],requestId:request,expectedScopeHash:g.scopeHash},async()=>{calls++;return selectedWorkerFixture('bound-materials',mutation,g.contracts as string[]);});};
  await t.test('groups retain separate successful pointers; lost receipt replay sends no new request',async()=>{
   const id=randomUUID();assert.equal((await perform(0,id)).status,'complete');const before=calls;
   assert.equal((await perform(0,id)).replayed,true);assert.equal(calls,before);
   assert.equal((await perform(1)).status,'complete');assert.equal(await count('ainuoke_material_order_heads'),2);
   const rows=(await pool.query('SELECT DISTINCT run_id FROM ainuoke_material_order_heads')).rows;assert.equal(rows.length,2);
  });
  await t.test('one group failure does not suppress another order; current reads use each own generation',async()=>{
   const g=plan.groups[0];await assert.rejects(refreshFollowupGroup(pool,actor,selectedConfig,{contracts:g.contracts as string[],requestId:randomUUID(),expectedScopeHash:g.scopeHash},async()=>{throw new Error('synthetic failure');}));
   const heads=(await pool.query('SELECT sales_order_id::text,last_error_code,run_id FROM ainuoke_material_order_heads')).rows;
   assert.ok(heads.find(r=>r.sales_order_id===g.orderIds[0]).last_error_code);assert.equal(heads.find(r=>r.sales_order_id===plan.groups[1].orderIds[0]).last_error_code,null);
   const ports=createPersistedMaterialPorts(pool,{sourceKey,maxAgeMs:600000});
   const prepared=await ports.prepareBatch!(actor,targets.map(o=>o.id));
   const good=targets.find(o=>o.id===plan.groups[1].orderIds[0])!;
   const reader=createOrderMaterialReader(prepared);const view=await reader(actor,{salesOrderId:good.id});assert.equal(view.status,200);if(view.status===200)assert.equal(view.body.progress.sourceStatus,'ready');
  });
  await t.test('history selection is CAS/audited/replay-safe, leaves financial facts and preserves historical sync',async()=>{
   const id=targets[0].id,input={orderId:id,mode:'history' as const,expectedVersion:0,requestId:randomUUID()};
   assert.equal((await setFollowup(pool,actor,input)).version,1);assert.equal((await setFollowup(pool,actor,input)).replayed,true);
   await assert.rejects(setFollowup(pool,actor,{...input,requestId:randomUUID()}),/followup_version_conflict/);
   assert.equal((await planFollowupGroups(pool,actor,sourceKey)).boundOrders,2);
   assert.equal((await readCatalog(pool,actor,{search:'',scope:'history',offset:0,limit:50})).total,2);
   assert.deepEqual(await Promise.all(['sales_orders','quote_center_quotes','server_closing_month_plans','production_schedule_assignments'].map(count)),baseCounts);
   const old=plan.groups.find(g=>g.orderIds.includes(id))!;let requests=0;
   await assert.rejects(refreshFollowupGroup(pool,actor,selectedConfig,{contracts:old.contracts as string[],requestId:randomUUID(),expectedScopeHash:old.scopeHash},async()=>{requests++;return null;}),/source_group_changed/);assert.equal(requests,0);
  });
  await t.test('all tiers can request manual sync; receipt/coalescing and manual priority are durable',async()=>{
   const entry=(await readCatalog(pool,actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0];
   const request={sourceKey,sourceId:entry.sourceId,requestId:randomUUID()};
   await assert.rejects(requestContractSync(pool,actor,request),/sync_worker_not_enabled/);
   await configureSync(pool,actor,{sourceKey,enabled:true,expectedVersion:0,policy:{...DEFAULT_SYNC_POLICY}});
   assert.equal((await enqueueAutomaticSync(pool,actor,sourceKey)).queued,3);
   const first=await requestContractSync(pool,actor,request);
   assert.equal((await requestContractSync(pool,actor,request)).replayed,true);
   const concurrent=await Promise.all([requestContractSync(pool,actor,{...request,requestId:randomUUID()}),requestContractSync(pool,actor,{...request,requestId:randomUUID()})]);
   assert.ok(concurrent.every(r=>r.jobId===first.jobId));
   let received:string[]=[];
   const tick=await runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async(_c,r)=>{
    assert.equal(r.mode,'catalog-contracts');if(r.mode!=='catalog-contracts')throw new Error('wrong mode');received=r.contracts;
    return selectedWorkerFixture('catalog-contracts','',r.contracts);
   }});
   assert.deepEqual(received,['SYN-SALES-3']);
   assert.equal(tick.jobs.length,1);assert.equal(tick.jobs[0].status,'complete',JSON.stringify(tick));
   assert.equal((await readSyncRequest(pool,actor,request.requestId)).status,'complete');
   assert.equal(await count('ainuoke_contract_observations'),1);
   assert.deepEqual(await Promise.all(['sales_orders','quote_center_quotes','server_closing_month_plans','production_schedule_assignments'].map(count)),baseCounts);
  });
  await t.test('automatic group refreshes trusted SOs and historical hidden SO; no second business ledger',async()=>{
   const tick=await runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async(_c,r)=>{
    assert.equal(r.mode,'catalog-contracts');if(r.mode!=='catalog-contracts')throw new Error('wrong mode');
    assert.equal(r.contracts.length,2);return selectedWorkerFixture('catalog-contracts','',r.contracts);
   }});
   assert.equal(tick.jobs.length,2);assert.ok(tick.jobs.every(j=>j.status==='complete'),JSON.stringify(tick));
   assert.equal(await count('ainuoke_contract_observations'),3);
   assert.deepEqual(await Promise.all(['sales_orders','quote_center_quotes','server_closing_month_plans','production_schedule_assignments'].map(count)),baseCounts);
   for(const target of targets){const view=await createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey,maxAgeMs:600000}))(actor,{salesOrderId:target.id});assert.equal(view.status,200);if(view.status===200)assert.equal(view.body.progress.sourceStatus,'ready');}
   assert.equal((await enqueueAutomaticSync(pool,actor,sourceKey)).queued,0);
  });
  await t.test('unclassified capture failure retains success and requires reviewed recovery before a new manual attempt',async()=>{
   const entry=(await readCatalog(pool,actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0],success=entry.lastSuccessAt;
   const input={sourceKey,sourceId:entry.sourceId,requestId:randomUUID()};await requestContractSync(pool,actor,input);
   const result=await runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async()=>{throw new Error('synthetic failure');}});
   assert.equal(result.status,'failed');assert.equal((await readSyncRequest(pool,actor,input.requestId)).status,'failed');
   const after=(await readCatalog(pool,actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0];
   assert.deepEqual(after.lastSuccessAt,success);assert.equal(after.lastErrorCode,'source_capture_failed');
   await assert.rejects(requestContractSync(pool,actor,{...input,requestId:randomUUID()}),/sync_worker_paused/);
   const review=await recoverSync(pool,actor,sourceKey);
   await recoverSync(pool,actor,sourceKey,{expectedHash:review.reviewHash,reason:'合成未知采集错误已核对'});
   assert.equal((await requestContractSync(pool,actor,{...input,requestId:randomUUID()})).replayed,false);
  });
  await t.test('catalogue request replay never reuses its upstream allowance, including a failed attempt',async()=>{
   const id=randomUUID();let upstream=0;
   await assert.rejects(captureCatalogOnce(pool,actor,selectedConfig,id,async()=>{upstream++;throw new SourceError('source_unavailable');}));
   assert.equal((await captureCatalogOnce(pool,actor,selectedConfig,id,async()=>{upstream++;return null;})).replayed,true);assert.equal(upstream,1);
   const review=await recoverSync(pool,actor,sourceKey);
   await recoverSync(pool,actor,sourceKey,{expectedHash:review.reviewHash,reason:'合成目录错误已核对；不复用旧请求'});
   const success=await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[]));assert.equal(success.status,'complete');
   await assert.rejects(pool.query("UPDATE ainuoke_catalog_requests SET result='{}' WHERE source_key=$1 AND request_id=$2",[sourceKey,id]),/immutable/);
  });
  await t.test('read-only detail has no raw or commercial amounts; explicit adoption uses original SO service and atomic receipt',async()=>{
   await runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async(_c,r)=>{if(r.mode!=='catalog-contracts')throw new Error('scope');return selectedWorkerFixture('catalog-contracts','',r.contracts);}});
   const entry=(await readCatalog(pool,actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0],scope={sourceKey,sourceId:entry.sourceId};
   const detail=await readCatalogDetail(pool,actor,scope);assert.ok(detail.colors.length);assert.ok(detail.materials.length);
   assert.doesNotMatch(JSON.stringify(detail),/unitPrice|sourcePricing|"amount"|"evidence"|"password"/);
   const preview=await previewCatalogIntake(pool,actor,scope);
   assert.equal(await count('sales_orders'),baseCounts[0]);
   const command={...scope,observationId:preview.observationId,expectedPreview:preview.expectedPreview,requestId:randomUUID()};
   const added=await adoptCatalogContract(pool,actor,command);assert.equal(added.created,1);
   assert.equal((await adoptCatalogContract(pool,actor,command)).replayed,true);
   assert.equal(await count('sales_orders'),baseCounts[0]+1);assert.equal(await count('ainuoke_catalog_intake_receipts'),1);
   assert.equal(await count('quote_center_quotes'),baseCounts[1]);assert.equal(await count('production_schedule_assignments'),baseCounts[3]);
   // Adoption now queues the ordinary missing-material publication. Complete
   // that manual-priority job before the next independent automatic-group case.
   const publication=await runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async(_c,r)=>{
    if(r.mode!=='catalog-contracts')throw new Error('scope');return selectedWorkerFixture('catalog-contracts','',r.contracts);
   }});
   assert.equal(publication.jobs.length,1);assert.equal(publication.jobs[0].status,'complete');
   const adopted=(await boundOrders(pool)).find(o=>o.salesContractNo==='SYN-SALES-3')!;
   const material=await createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey,maxAgeMs:600000}))(actor,{salesOrderId:adopted.id});
   assert.equal(material.status,200);if(material.status===200){assert.equal(material.body.progress.sourceStatus,'ready');assert.ok(material.body.progress.rows.length);}
  });
  await t.test('invalid batch cannot spend a source request; active worker excludes recovery and another worker',async()=>{
   let requests=0;
   await assert.rejects(runSyncTick(pool,actor,selectedConfig,{batchSize:0,collect:async()=>{requests++;return null;}}),/sync_batch_invalid/);
   assert.equal(requests,0);
   assert.throws(()=>parseSourceArguments(['--sync-once='+sourceKey,'--config=synthetic','--expected-target='+'a'.repeat(64),'--batch-size=0']),/sync_batch_invalid/);
   const lock=await pool.connect();try{
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['ainuoke-sync-worker:'+sourceKey]);
    assert.equal((await runSyncTick(pool,actor,selectedConfig,{collect:async()=>{requests++;return null;}})).status,'busy');
    await assert.rejects(recoverSync(pool,actor,sourceKey),/sync_worker_busy/);assert.equal(requests,0);
    await assert.rejects(captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>{requests++;return null;}),/sync_worker_busy/);assert.equal(requests,0);
    assert.equal((await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[]),lock)).status,'complete');
    await assert.rejects(recoverSync(pool,actor,sourceKey),/sync_worker_busy/);
   }finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ainuoke-sync-worker:'+sourceKey]);lock.release();}
  });
  await t.test('historical detail retains its captured identity after a directory-only style change',async()=>{
   const scope={sourceKey,sourceId:'3'},before=await readCatalogDetail(pool,actor,scope);
   await pool.query("UPDATE ainuoke_catalog_entries SET style_no='RENAMED-SYNTHETIC',inside_order_no='RENAMED-IN' WHERE source_key=$1 AND source_id='3'",[sourceKey]);
   const after=await readCatalogDetail(pool,actor,scope);assert.deepEqual(after.colors,before.colors);assert.deepEqual(after.materials,before.materials);assert.ok(after.materials.length);
  });
  await t.test('invalid historical date fails only that contract while valid contracts from the same capture publish',async()=>{
   await pool.query("UPDATE ainuoke_contract_sync_state SET last_success_at=now()-interval '1 hour',last_automatic_attempt_at=now()-interval '1 hour' WHERE source_key=$1",[sourceKey]);
   const before=(await readCatalog(pool,actor,{search:'SYN-SALES-1',scope:'all',offset:0,limit:50})).rows[0];
   await enqueueAutomaticSync(pool,actor,sourceKey);let calls=0;
   const result=await runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async(_c,r)=>{
    calls++;if(r.mode!=='catalog-contracts')throw Error('wrong scope');
    return selectedWorkerFixture('catalog-contracts',"if report == 6086103: mutate_rows(payload, lambda rows: rows[0].update(DeliveryDate='2026-02-30'))",r.contracts);
   }});
   assert.equal(calls,1);assert.equal(result.status,'processed');
   assert.equal(result.jobs.filter(j=>j.status==='failed').length,1);assert.equal(result.jobs.filter(j=>j.status==='complete').length,2);
   const after=(await readCatalog(pool,actor,{search:'SYN-SALES-1',scope:'all',offset:0,limit:50})).rows[0];
   assert.deepEqual(after.lastSuccessAt,before.lastSuccessAt);assert.equal(after.lastErrorCode,'binding_date_invalid');
   assert.equal((await pool.query('SELECT paused_reason FROM ainuoke_sync_controls WHERE source_key=$1',[sourceKey])).rows[0].paused_reason,null);
   const capture=(await pool.query('SELECT capture_attempt_id FROM ainuoke_sync_jobs WHERE id=$1',[result.jobs[0].id])).rows[0].capture_attempt_id;
   assert.equal((await pool.query('SELECT status FROM ainuoke_sync_audit_batches WHERE id=$1',[capture])).rows[0].status,'partial');
   const failed=(await pool.query("SELECT report_id,status,fetched_count,error_code FROM ainuoke_sync_audit_tables WHERE batch_id=$1 AND contract_no='SYN-SALES-1'",[capture])).rows;
   assert.ok(failed.length>=3);assert.ok(failed.every(r=>r.status==='failed'&&r.error_code==='binding_date_invalid'));
   assert.ok(failed.some(r=>r.fetched_count===null),'validation failure has no invented row count');
   const directory=(await pool.query("SELECT * FROM ainuoke_sync_audit_tables WHERE batch_id=$1 AND report_id='6086103' AND contract_no=''",[capture])).rows[0];
   assert.equal(directory.status,'partial');assert.equal(directory.error_code,'contract_publication_partial');
   assert.ok(directory.write_completed_at);assert.ok(directory.transaction_id);
   assert.equal(directory.publication_ids.length,4,'both successful source and catalogue commits remain traceable');
   assert.equal(directory.fetched_count,6,'shared double-pass capture is not multiplied by contracts');
   assert.equal(directory.inserted_count+directory.updated_count+directory.unchanged_count,3);
   assert.ok(directory.target_tables.includes('ainuoke_catalog_runs'));
   const published=(await pool.query('SELECT id::text FROM ainuoke_catalog_runs WHERE id=ANY($1::uuid[])',[directory.publication_ids])).rows;
   assert.equal(published.length,2);
   assert.equal((await pool.query('SELECT id FROM ainuoke_source_runs WHERE id=ANY($1::uuid[])',[directory.publication_ids])).rowCount,2);
  });
  await t.test('crashed worker pauses, preserves success and requires exact reviewed recovery without upstream requests',async()=>{
   const entry=(await readCatalog(pool,actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0];
   const req={sourceKey,sourceId:entry.sourceId,requestId:randomUUID()};const {jobId}=await requestContractSync(pool,actor,req);
   await pool.query("UPDATE ainuoke_sync_jobs SET status='running',started_at=now() WHERE id=$1",[jobId]);
   let calls=0;assert.equal((await runSyncTick(pool,actor,selectedConfig,{collect:async()=>{calls++;return null;}})).status,'paused');assert.equal(calls,0);
   assert.equal((await readSyncRequest(pool,actor,req.requestId)).status,'unknown');
   assert.deepEqual((await readCatalog(pool,actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0].lastSuccessAt,entry.lastSuccessAt);
   const review=await recoverSync(pool,actor,sourceKey);assert.ok('jobs' in review&&review.jobs.length===1);
   await assert.rejects(recoverSync(pool,actor,sourceKey,{expectedHash:'a'.repeat(64),reason:'合成恢复核对'}),/sync_recovery_preview_changed/);
   const result=await recoverSync(pool,actor,sourceKey,{expectedHash:review.reviewHash,reason:'合成恢复核对，未重新采集'});assert.equal(result.sourceRequests,0);
   assert.equal((await readSyncRequest(pool,actor,req.requestId)).status,'failed');
   assert.equal((await pool.query('SELECT paused_reason FROM ainuoke_sync_controls WHERE source_key=$1',[sourceKey])).rows[0].paused_reason,null);
  });
  await t.test('1400 directory entries enqueue without SO creation; 1401 fails without partial queue changes',async()=>{
   const ordersBefore=(await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n;
   await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[],1400));
   const queued=await enqueueAutomaticSync(pool,actor,sourceKey);
   assert.equal(queued.catalogCount,1400);
   assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,ordersBefore);
   await pool.query(`INSERT INTO ainuoke_catalog_entries(source_key,source_id,sales_contract_no,inside_order_no,style_no,lifecycle_status_raw,observed_run_id)
    SELECT source_key,'1401','SYN-SALES-1401','SYN-IN-1401','SYN-STYLE-1401',lifecycle_status_raw,observed_run_id FROM ainuoke_catalog_entries WHERE source_key=$1 LIMIT 1`,[sourceKey]);
   const before=(await pool.query('SELECT count(*)::int n FROM ainuoke_sync_jobs')).rows[0].n;
   await assert.rejects(enqueueAutomaticSync(pool,actor,sourceKey),/sync_catalog_capacity_exceeded/);
   assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_sync_jobs')).rows[0].n,before);
  });
 }finally{await pool.end();await db.stop();}
});

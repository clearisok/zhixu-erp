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
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {refreshFollowupGroup} from '../ainuoke-source/group-refresh.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import { configureSync, enqueueAutomaticSync, requestContractSync, readSyncRequest } from '../ainuoke-source/sync-queue.js';
import { DEFAULT_SYNC_POLICY } from '../ainuoke-source/sync-schedule.js';
import { runSyncTick } from '../ainuoke-source/sync-worker.js';

test('catalogue is not a business ledger; active groups publish and fail independently',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('catalog_followup')});
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
  await t.test('failed request retains last success and next manual attempt bypasses automatic interval',async()=>{
   const entry=(await readCatalog(pool,actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0],success=entry.lastSuccessAt;
   const input={sourceKey,sourceId:entry.sourceId,requestId:randomUUID()};await requestContractSync(pool,actor,input);
   const result=await runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async()=>{throw new Error('synthetic failure');}});
   assert.equal(result.status,'failed');assert.equal((await readSyncRequest(pool,actor,input.requestId)).status,'failed');
   const after=(await readCatalog(pool,actor,{search:'SYN-SALES-3',scope:'all',offset:0,limit:50})).rows[0];
   assert.deepEqual(after.lastSuccessAt,success);assert.equal(after.lastErrorCode,'source_capture_failed');
   assert.equal((await requestContractSync(pool,actor,{...input,requestId:randomUUID()})).replayed,false);
  });
 }finally{await pool.end();await db.stop();}
});

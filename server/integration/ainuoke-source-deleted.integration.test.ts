import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {claimSyncJobs,enqueueAutomaticSync,requestContractSync} from '../ainuoke-source/sync-queue.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';
import {hash} from '../ainuoke-source/contract.js';
import {listSalesOrders,createSalesOrder,createOrUpdateSourceLink} from '../sales-orders/repository.js';
import {createQuoteDraft} from '../../features/quote-center/model/quote-view-model.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createQuoteService} from '../quotes/service.js';
import {parseProductionResourceCommand,type ProductionResourceType} from '../production-resources/contract.js';
import {executeProductionResourceCommand} from '../production-resources/service.js';
import {previewProductionPlan,executeProductionPlan,readOrderProductionPlans,readProductionAssignment} from '../production-scheduling/service.js';
import {previewProductionExecution,executeProductionExecution} from '../production-scheduling/execution-service.js';

const removeFirst=`if report == 6086103:
        mutate_rows(payload, lambda rows: rows.__setitem__(slice(None), [r for r in rows if r['id']!='1']))
        payload['dataCount']=2`;
const events=async(f:Awaited<ReturnType<typeof startCatalogFixture>>)=>(await f.pool.query('SELECT * FROM ainuoke_contract_lifecycle_events ORDER BY recorded_at,id')).rows;
const read=async(f:Awaited<ReturnType<typeof startCatalogFixture>>)=>{
 const response=await fetch(f.base+'/api/v1/sales-orders',{headers:{cookie:await f.login(f.admin)}});
 assert.equal(response.status,200);return (await response.json()).salesOrders as Array<{salesContractNo:string;alerts:Array<{code:string}>;sourceLifecycle:{state:string}}>;
};
async function retained(f:Awaited<ReturnType<typeof startCatalogFixture>>){
 const tables=(await f.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename as string)
  .filter(name=>!name.startsWith('ainuoke_catalog_')&&!name.startsWith('ainuoke_sync_')
    &&!['ainuoke_source_profiles','ainuoke_contract_lifecycle_events','operation_logs'].includes(name));
 return Promise.all(tables.map(async table=>[table,hash((await f.pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows)]));
}
async function seedHistory(f:Awaited<ReturnType<typeof startCatalogFixture>>){
 const quote=createQuoteDraft('synthetic-retained-cost','QT-SYN-RETAINED','2026-11-01');
 quote.revisions[0].priceVersions[0].labor.value=12.5;
 await createQuoteService(f.pool).createAggregate(quoteSnapshotFromBrowser(quote));
 const resource=async(kind:ProductionResourceType,data:unknown)=>{
  const r=await executeProductionResourceCommand(f.pool,f.actor,parseProductionResourceCommand({requestId:randomUUID(),action:'create',kind,resourceId:null,expectedVersion:0,data}));
  assert.equal(r.status,'applied');if(r.status!=='applied')assert.fail();return r.resource.id;
 };
 const calendar=await resource('calendars',{name:'合成历史日历',enabled:true,remark:'',workingWeekdays:[1,2,3,4,5],exceptions:[]});
 const site=await resource('sites',{name:'合成历史地点',enabled:true,remark:'',countryCode:null,productionCalendarId:calendar,preProductionSampleLeadDays:0});
 const group=await resource('groups',{name:'合成历史组',enabled:true,remark:'',shortName:'历史',productionSiteId:site,sortOrder:1});
 const orderId=f.orderIds[0],current=await readOrderProductionPlans(f.pool,f.actor,orderId);
 const plan=await previewProductionPlan(f.pool,f.actor,{action:'create',orderId,assignmentId:null,expectedVersion:0,expectedPlanVersion:current.order.planVersion,
  data:{executionType:'internal',executorId:group,colorId:null,plannedQuantity:'30',duration:{mode:'workdays',workdays:2},dates:{mode:'auto_queue',startDate:'2026-11-23'},remark:'合成历史生产'}});
 const saved=await executeProductionPlan(f.pool,f.actor,{requestId:randomUUID(),intent:plan.intent,previewHash:plan.previewHash});
 assert.equal(saved.status,'applied');
 const assignment=await readProductionAssignment(f.pool,f.actor,saved.assignments[0].id),after=await readOrderProductionPlans(f.pool,f.actor,orderId);
 const execution=await previewProductionExecution(f.pool,f.actor,{action:'record_execution',orderId,assignmentId:assignment.assignment.id,
  expectedAssignmentVersion:assignment.assignment.version,expectedExecutionVersion:0,expectedPlanVersion:after.order.planVersion,
  data:{status:'in_progress',completedQuantity:'10.125',actualStartDate:'2026-11-23',actualCompletedDate:null},reason:'合成历史产量',replan:null});
 await executeProductionExecution(f.pool,f.actor,{requestId:randomUUID(),intent:execution.intent,previewHash:execution.previewHash});
 assert.equal((await f.pool.query('SELECT completed_quantity::text quantity FROM production_schedule_executions')).rows[0].quantity,'10.125');
}
test('complete authenticated pair confirms deletion, keeps business history, isolates queue and restores without duplicate orders/events',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  await seedHistory(f);
  const before=await retained(f),id=randomUUID();
  const result=await captureCatalogOnce(f.pool,f.actor,selectedConfig,id,async()=>selectedWorkerFixture('catalog-discovery',removeFirst,[]));
  assert.equal(result.status,'complete');assert.equal((await events(f)).length,1);
  const event=(await events(f))[0];assert.equal(event.event_type,'source_deleted');assert.equal(event.sales_contract_no,'SYN-SALES-1');
  assert.notEqual(event.previous_seen_run_id,event.confirmed_run_id);assert.equal(event.evidence.presentInBothPasses,false);
  assert.deepEqual(await retained(f),before);
  const rows=await read(f),deleted=rows.find(r=>r.salesContractNo==='SYN-SALES-1')!,normal=rows.find(r=>r.salesContractNo==='SYN-SALES-2')!;
  assert.deepEqual(deleted.alerts.map(a=>a.code),['order_source_deleted']);assert.equal(deleted.sourceLifecycle.state,'source_deleted');
  assert.equal(normal.alerts.some(a=>a.code==='order_source_deleted'),false);
  assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0].paused_reason,null);
  await assert.rejects(requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:'1',requestId:randomUUID()}),{code:'source_contract_deleted'});
  await enqueueAutomaticSync(f.pool,f.actor,f.sourceKey,Date.now()+3600000);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE source_id='1' AND status='queued'")).rows[0].n,0);
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:'2',requestId:randomUUID()});
  const normalTick=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect:async(_c,r)=>selectedWorkerFixture('catalog-contracts',removeFirst,(r.mode==='catalog-contracts'?r.contracts:assert.fail('unexpected mode')))});
  assert.equal(normalTick.status,'processed');
  // Same request and a new identical complete pair cannot duplicate deletion.
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,id,async()=>{throw Error('replay must not read');});
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery',removeFirst,[]));
  assert.equal((await events(f)).length,1);
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[]));
  assert.deepEqual((await events(f)).map(e=>e.event_type),['source_deleted','source_restored']);
  const restored=await read(f);assert.equal(restored.find(r=>r.salesContractNo==='SYN-SALES-1')!.sourceLifecycle.state,'present');
  assert.equal(restored.find(r=>r.salesContractNo==='SYN-SALES-1')!.alerts.some(a=>a.code==='order_source_deleted'),false);
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[]));
  assert.equal((await events(f)).length,2);
  await enqueueAutomaticSync(f.pool,f.actor,f.sourceKey,Date.now()+7200000);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE source_id='1' AND status='queued'")).rows[0].n,1);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,2);
  await assert.rejects(f.pool.query('DELETE FROM ainuoke_contract_lifecycle_events'),{code:'23514'});
  await assert.rejects(f.pool.query("UPDATE ainuoke_catalog_entries SET source_lifecycle_state='source_deleted' WHERE source_id='2'"),{code:'23514'});
 }finally{await f.close();}
});

for(const [name,mutation] of [
 ['one pass missing',`if report == 6086103:
        change.n=getattr(change,'n',0)+1
        if change.n==2:
            mutate_rows(payload, lambda rows: rows.__setitem__(slice(None), [r for r in rows if r['id']!='1']))
            payload['dataCount']=2`],
 ['missing page',`if report == 6086103: payload['dataCount']=51`],
 ['authentication rejection',`if report == 0: payload['data']['isOk']=False`],
 ['HTTP 200 business rejection',`if report == 6086103: payload['reObj']['isOk']=False`],
] as const)test(name+' cannot confirm deletion',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  const before=await retained(f),head=(await f.pool.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows;
  await assert.rejects(captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery',mutation,[])));
  assert.deepEqual(await events(f),[]);assert.deepEqual(await retained(f),before);
  assert.deepEqual((await f.pool.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows,head);
 }finally{await f.close();}
});

test('scope/account mismatch, partial query and duplicate pages never classify an order as deleted',{timeout:180000},async()=>{
 type Raw={sourceFingerprint:string;bundle:{discoveryBefore:Array<{queryContext:Record<string,unknown>;reportId:string}>;discoveryAfter:Array<{queryContext:Record<string,unknown>;reportId:string}>}};
 const f=await startCatalogFixture();try{
  for(const alter of [
   (v:Raw)=>{v.sourceFingerprint='0'.repeat(64);},
   (v:Raw)=>{v.bundle.discoveryBefore[0].queryContext={salesContractNo:'SYN-SALES-2'};},
   (v:Raw)=>{v.bundle.discoveryAfter.push(v.bundle.discoveryAfter[0]);},
   (v:Raw)=>{v.bundle.discoveryAfter[0].reportId='6087051';},
  ]){
   const v=selectedWorkerFixture('catalog-discovery',removeFirst,[]) as Raw;alter(v);
   await assert.rejects(captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>v));
   assert.deepEqual(await events(f),[]);
  }
 }finally{await f.close();}
});

test('missing material rows never delete; stale and independent missing-unit alerts retain their original meaning',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:'1',requestId:randomUUID()});
  const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect:async(_c,r)=>selectedWorkerFixture('catalog-contracts',`if report == 6087050:
        mutate_rows(payload, lambda rows: rows.clear())
        payload['dataCount']=0`,(r.mode==='catalog-contracts'?r.contracts:assert.fail('unexpected mode')))});
  assert.equal(result.status,'processed');assert.deepEqual(await events(f),[]);
  f.setMaterialOffset(1800001);assert.ok((await read(f)).every(r=>r.alerts.some(a=>a.code==='material_source_stale')));
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery',removeFirst,[]));
  const rows=await read(f);assert.deepEqual(rows.find(r=>r.salesContractNo==='SYN-SALES-1')!.alerts.map(a=>a.code),['order_source_deleted']);
  assert.ok(rows.find(r=>r.salesContractNo==='SYN-SALES-2')!.alerts.some(a=>a.code==='material_source_stale'));
 }finally{await f.close();}
});

test('a previously queued deleted contract is rejected before claim; unknown results remain protected',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:'1',requestId:randomUUID()});
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery',removeFirst,[]));
  assert.deepEqual(await claimSyncJobs(f.pool,f.actor,f.sourceKey),[]);
  assert.equal((await f.pool.query("SELECT result->>'code' code FROM ainuoke_sync_jobs WHERE source_id='1' ORDER BY requested_at DESC LIMIT 1")).rows[0].code,'source_contract_deleted');
  // Test-only unknown receipt; no actual remote IO or automatic resolution.
  await f.pool.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by)
   VALUES($1,$2,'1','SYN-SALES-1','automatic','unknown',$3)`,[randomUUID(),f.sourceKey,f.actor.internalUserId]);
  await assert.rejects(requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:'1',requestId:randomUUID()}),{code:'sync_result_unknown'});
  await enqueueAutomaticSync(f.pool,f.actor,f.sourceKey,Date.now()+3600000);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE source_id='1' AND status='unknown'")).rows[0].n,1);
  assert.equal((await listSalesOrders(f.pool)).total,2);
 }finally{await f.close();}
});

test('never-observed local order and unbound catalogue row cannot become deleted; independent alerts survive',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  const newOrder=await createSalesOrder(f.pool,{creationSource:'ainuoke'});
  await createOrUpdateSourceLink(f.pool,{salesOrderId:newOrder.id,sourceSystem:'ainuoke',sourceEntityType:'sales_contract',externalId:'9999',salesContractNo:'SYN-NOT-YET-IN-DIRECTORY'});
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:'1',requestId:randomUUID()});
  await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect:async(_c,r)=>selectedWorkerFixture('catalog-contracts',`if report == 6087050:
        mutate_rows(payload, lambda rows: [row.update(QtyUnit='') for row in rows])`,(r.mode==='catalog-contracts'?r.contracts:assert.fail('unexpected mode')))});
  assert.ok((await read(f)).find(r=>r.salesContractNo==='SYN-SALES-1')!.alerts.some(a=>a.code==='material_unit_missing'));
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery',`if report == 6086103:
        mutate_rows(payload, lambda rows: rows.__setitem__(slice(None), [r for r in rows if r['id']=='2']))
        payload['dataCount']=1`,[]));
  assert.deepEqual((await events(f)).map(e=>e.sales_contract_no),['SYN-SALES-1']); // row3 has no local order
  const deleted=(await read(f)).find(r=>r.salesContractNo==='SYN-SALES-1')!;
  assert.deepEqual(deleted.alerts.map(a=>a.code),['order_source_deleted','material_unit_missing']);
  assert.equal((await read(f)).find(r=>r.salesContractNo==='SYN-NOT-YET-IN-DIRECTORY')!.alerts.some(a=>a.code==='order_source_deleted'),false);
 }finally{await f.close();}
});

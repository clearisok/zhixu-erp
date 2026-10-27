import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import type pg from 'pg';
import {closingFixture,closingCode} from './closing-fixture.js';
import {runMigrations} from '../db/migration-runner.js';
import {CLOSING_READ_PERMISSIONS,type ClosingChannels,type ClosingIntent} from '../closing/contract.js';
import {executeClosingCommand,previewClosingCommand,readClosingCommandReceipt} from '../closing/service.js';
import {readClosingPeriodDetail,readClosingHistory} from '../closing/read-service.js';
import {readOrderClosingMonthPlan,previewClosingMonthMove,executeClosingMonthMove} from '../closing/month-plan-service.js';
import type {ClosingMonthIntent} from '../closing/month-plan-model.js';
import {createClosingClient,closingCommandHash} from '../../features/closing-center/server/closing-client.js';
import {parseClosingDetail,parseClosingPreview} from '../../features/closing-center/server/closing-projection.js';
import {parseClosingReadQuery} from '../closing/read-contract.js';
import {previewSaleAdjustment,commitSaleAdjustment} from '../sales-orders/sale-adjustment-service.js';
import {readOrderProductionPlans,previewProductionPlan,executeProductionPlan} from '../production-scheduling/service.js';
import {buildMonthFinancialSync} from '../closing/month-financial-service.js';
import {appendClosingAllocationVersion,readClosingAllocation,readClosingAllocations,readClosingPeriod} from '../closing/repository.js';
import {collectNormalizationEvidenceInTransaction,normalizationReferences} from '../sales-orders/normalization-preview.js';

test('owned PostgreSQL/HTTP: month portions explicitly adopt existing immutable financial snapshots',{timeout:180000},async t=>{
 const f=await closingFixture(t),o=await f.order(),month='2027-02';
 const plan=async(id=o.id)=>(await readOrderClosingMonthPlan(f.pool,f.editor.actor,id)).plan!;
 const move=async(intent:ClosingMonthIntent)=>{const p=await previewClosingMonthMove(f.pool,f.editor.actor,intent);
  const result=await executeClosingMonthMove(f.pool,f.editor.actor,{requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash});assert.equal(result.status,'applied');};
 const created=await f.apply({action:'create_period',month,taxRatePercent:'13',taxRateConfirmed:true,remark:''}),periodId=created.result.periodId;
 const detail=()=>readClosingPeriodDetail(f.pool,f.editor.actor,periodId,new URLSearchParams('includeVoided=true'));
 const sync=async(channels:ClosingChannels={sales:true,work:true},reason='Explicit month adoption')=>f.apply({action:'sync_month_outputs',periodId,
  expectedPeriodVersion:(await detail()).period.version,channels,reason});
 const transition=async(action:'confirm_period'|'lock_period'|'reopen_period')=>f.apply({action,periodId,expectedPeriodVersion:(await detail()).period.version,reason:'Explicit transition'});
 const blue=o.basis.priceLines.find(row=>row.colorName==='Blue')!,white=o.basis.priceLines.find(row=>row.colorName==='White')!;
 const legacy={action:'create_allocation',periodId,expectedPeriodVersion:1,orderId:o.id,
  data:{quantity:'100',colorId:blue.colorId,assignmentId:null,executor:null,channels:{sales:true,work:false},remark:''}};
 const staleLegacy=await f.prepared(legacy);let firstCommand:Awaited<ReturnType<typeof sync>>['command'];
 await t.test('real HTTP/client adopts all current sales portions, confirmed CNY work does not block sale-only',async()=>{
  const client=createClosingClient({baseUrl:f.base,visibility:()=>({sale:true,work:true}),fetchImpl:(async(url,init)=>{
   const headers=new Headers(init?.headers);headers.set('Cookie',f.editor.cookie);if(init?.body)headers.set('Origin',f.base);return fetch(url,{...init,headers});}) as typeof fetch});
  const intent:ClosingIntent={action:'sync_month_outputs',periodId,expectedPeriodVersion:1,channels:{sales:true,work:false},reason:'Explicit sales only'};
  const p=await client.preview(intent,()=>true);assert.equal(p.quantityConfirmation,'order_month_plan');assert.equal(p.monthSync!.counts.created,2);
  firstCommand={requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash};
  const result=await client.submit(firstCommand,()=>true);assert.equal(result.status,'applied');
  const receipt=await client.receipt(firstCommand,()=>true);assert.equal(receipt.state,'recorded');if(receipt.state==='recorded')assert.equal(receipt.commandHash,await closingCommandHash(firstCommand));
  const d=await client.period(periodId,new URLSearchParams(),()=>true);assert.equal(d.summary.registeredQuantity,'100');
  assert.equal(d.summary.garmentSalesCny.visibility,'allowed');assert(d.summary.garmentSalesCny.amount);assert.equal(d.summary.garmentSalesCny.amount.decimal,'15000');
  assert.equal(d.monthFinancial!.adoptedChannels.sales,true);assert.equal(d.monthFinancial!.adoptedChannels.work,false);
  await assert.rejects(sync({sales:false,work:true}),closingCode('closing_usd_work_basis_required'));
  assert.equal((await detail()).period.version,2);assert.equal((await detail()).summary.activeCount,2);
 });
 await t.test('retry/lost response is the same request; old create/update/void cannot duplicate linked quantities',async()=>{
  const replay=await executeClosingCommand(f.pool,f.editor.actor,firstCommand);assert('replayed' in replay&&replay.replayed);
  await assert.rejects(executeClosingCommand(f.pool,f.editor.actor,{...firstCommand,intent:{...firstCommand.intent,reason:'Changed'}}),closingCode('closing_request_conflict'));
  const stale=await executeClosingCommand(f.pool,f.editor.actor,staleLegacy);assert.equal(stale.status,'rejected');
  assert.equal((await readClosingCommandReceipt(f.pool,f.editor.actor,staleLegacy.requestId)).state,'recorded');
  const d=await detail(),a=d.items.find(row=>row.status==='active')!;
  for(const intent of [{...legacy,expectedPeriodVersion:d.period.version},
   {action:'update_allocation',periodId,expectedPeriodVersion:d.period.version,allocationId:a.id,expectedVersion:a.version,reason:'Bypass',data:legacy.data},
   {action:'void_allocation',periodId,expectedPeriodVersion:d.period.version,allocationId:a.id,expectedVersion:a.version,reason:'Bypass'}]){
   await assert.rejects(previewClosingCommand(f.pool,f.editor.actor,intent),closingCode('closing_month_financial_command_required'));
   const result=await executeClosingCommand(f.pool,f.editor.actor,{requestId:randomUUID(),intent,previewHash:'0'.repeat(64)});
   assert.equal(result.status,'rejected');if(result.status==='rejected')assert.equal(result.error.code,'closing_month_financial_command_required');
  }
  const before=(await f.pool.query('SELECT count(*)::int n FROM server_closing_allocation_versions')).rows[0].n;
  await sync({sales:true,work:false});assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_allocation_versions')).rows[0].n,before);
 });
 await t.test('moving a portion preserves old finance until explicit resync; no CNY/USD conversion',async()=>{
  const p=await plan(),line=p.lines.find(row=>row.colorId===white.colorId)!;
  const old=(await detail()).items.filter(row=>row.status==='active').map(row=>row.snapshot);
  await move({action:'move_months',orderId:o.id,expectedVersion:p.version,targetMonth:'2027-03',reason:'Move white',selection:{mode:'partial',items:[{lineId:line.id,quantity:'50'}]}});
  assert.deepEqual((await detail()).items.filter(row=>row.status==='active').map(row=>row.snapshot),old);
  await assert.rejects(transition('confirm_period'),closingCode('closing_month_financial_sync_required'));
  await sync({sales:true,work:true},'Sales CNY 113 and work USD 2.5');
  const d=await detail();assert.equal(d.summary.registeredQuantity,'50');assert.equal(d.summary.activeCount,2);assert.equal(d.summary.voidedCount,1);
  assert.deepEqual(d.items.filter(row=>row.status==='active').map(row=>row.snapshot.channels).sort((a,b)=>Number(a.work)-Number(b.work)),[{sales:true,work:false},{sales:false,work:true}]);
 });
 let assignmentId='';
 await t.test('full executor matching replaces line identity; syncing work alone cannot double count physical quantity',async()=>{
  assignmentId=await f.assignment(o.id,blue.colorId);const p=await plan(),line=p.lines.find(row=>row.colorId===blue.colorId)!;
  await move({action:'match_executors',orderId:o.id,expectedVersion:p.version,reason:'Explicit executor',items:[{lineId:line.id,parts:[{assignmentId,quantity:'50'}]}]});
  await sync({sales:false,work:true});const d=await detail();assert.equal(d.summary.registeredQuantity,null);assert.equal(d.summary.quantityMeaning,'inconsistent_financial_portions_requires_sync');
  await assert.rejects(transition('confirm_period'),closingCode('closing_month_financial_sync_required'));
  await sync({sales:true,work:false});const fixed=await detail();assert.equal(fixed.summary.registeredQuantity,'50');
  for(const row of fixed.items.filter(row=>row.status==='active')){assert.equal(row.snapshot.assignmentId,assignmentId);assert.equal(row.snapshot.executor!.type,'internal');
   assert.equal(row.snapshot.executor!.resourceSnapshotHash,(await plan()).executorBasis[0].resourceSnapshotHash);}
 });
 await t.test('processing contributes only independent work; free text and hidden amounts stay protected in detail/history',async()=>{
  const processing=await f.processing('USD'),p=await plan(processing.id);
  await move({action:'move_months',orderId:processing.id,expectedVersion:p.version,targetMonth:month,reason:'Processing month',selection:{mode:'whole'}});
  await sync({sales:true,work:true},'PRIVATE CNY 113 / USD 2.5');
  const d=await detail();assert.equal(d.summary.registeredQuantity,'60');assert.equal(d.summary.activeCount,3);
  const processingRows=d.items.filter(row=>row.status==='active'&&row.snapshot.order.id===processing.id);assert.equal(processingRows.length,1);
  assert.deepEqual(processingRows[0].snapshot.channels,{sales:false,work:true});assert.equal(processingRows[0].snapshot.outputs.work!.price,'0');
  for(const dimension of ['sale','labor'] as const){const who=await f.user('month.'+dimension,[...CLOSING_READ_PERMISSIONS,'closing.edit',`commercial.${dimension}.view`]);
   const response=await f.request('/periods/'+periodId,undefined,who.cookie);assert.equal(response.response.status,200);assert(!response.text.includes('PRIVATE'));
   const view={sale:dimension==='sale',work:dimension==='labor'};parseClosingDetail(response.body,periodId,parseClosingReadQuery(new URLSearchParams(),'period'),view);
   for(const row of d.items){const history=await readClosingHistory(f.pool,who.actor,'allocation',row.id);assert(!JSON.stringify(history).includes('PRIVATE'));}
   if(dimension==='sale'){
    const before=(await detail()).items.filter(row=>row.status==='active'&&row.snapshot.channels.work).map(row=>({id:row.id,version:row.version,snapshot:row.snapshot}));
    await f.apply({action:'sync_month_outputs',periodId,expectedPeriodVersion:(await detail()).period.version,channels:{sales:true,work:false},reason:'Sale only'},who);
    assert.deepEqual((await detail()).items.filter(row=>row.status==='active'&&row.snapshot.channels.work).map(row=>({id:row.id,version:row.version,snapshot:row.snapshot})),before);
   }
  }
 });
 await t.test('unchanged basis concurrency applies once; preview tampering and hidden fields are rejected by the shared client parser',async()=>{
  const intent:ClosingIntent={action:'sync_month_outputs',periodId,expectedPeriodVersion:(await detail()).period.version,channels:{sales:true,work:true},reason:'Concurrent adoption'};
  const p=await previewClosingCommand(f.pool,f.editor.actor,intent),a={requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash},b={...a,requestId:randomUUID()};
  const results=await Promise.all([executeClosingCommand(f.pool,f.editor.actor,a),executeClosingCommand(f.pool,f.editor.actor,b)]);assert.deepEqual(results.map(row=>row.status).sort(),['applied','rejected']);
  const bad=structuredClone(p);bad.monthSync!.items.push(bad.monthSync!.items[0]);
  assert.throws(()=>parseClosingPreview(bad,intent,{sale:true,work:true}));
  assert.throws(()=>parseClosingPreview(p,intent,{sale:true,work:false}));
 });
 await t.test('new SOs after adoption cannot be omitted at confirm; moving them out requires a new preview',async()=>{
  const prepared=await f.prepared({action:'confirm_period',periodId,expectedPeriodVersion:(await detail()).period.version,reason:''});
  const fresh=await f.order();const rejected=await executeClosingCommand(f.pool,f.editor.actor,prepared);assert.equal(rejected.status,'rejected');
  if(rejected.status==='rejected')assert.equal(rejected.error.code,'closing_month_financial_sync_required');
  await move({action:'move_months',orderId:fresh.id,expectedVersion:1,targetMonth:'2027-04',reason:'Another month',selection:{mode:'whole'}});
 });
 await t.test('production correction requires explicit review; locked adopted values survive later Quote Center negotiation',async()=>{
  await f.completion(o.id,assignmentId,'20');
  await assert.rejects(transition('confirm_period'),closingCode('closing_execution_review_required'));
  for(const row of (await detail()).items.filter(row=>row.status==='active'&&row.snapshot.assignmentId===assignmentId))
   await f.apply({action:'review_allocation',periodId,expectedPeriodVersion:(await detail()).period.version,allocationId:row.id,expectedVersion:row.version,reason:'Keep adopted values'});
  await transition('confirm_period');await transition('lock_period');const frozen=await detail();
  const rule={kind:'amount',value:'1'},p=await previewSaleAdjustment(f.pool,f.editor.actor,{rule,items:[{salesOrderId:o.id}]}),row=p.items[0];assert.equal(row.status,'ready');if(row.status!=='ready')assert.fail();
  assert.equal((await commitSaleAdjustment(f.pool,f.editor.actor,{requestId:randomUUID(),reason:'Later negotiation',rule,items:[{salesOrderId:o.id,expectedVersion:row.expectedVersion,fingerprint:row.fingerprint}]})).items[0].status,'updated');
  assert.deepEqual((await detail()).items.map(row=>row.snapshot),frozen.items.map(row=>row.snapshot));
  await assert.rejects(sync(),closingCode('closing_period_not_open'));
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,{action:'move_months',orderId:o.id,expectedVersion:(await plan()).version,targetMonth:'2027-05',reason:'Locked',selection:{mode:'whole'}}),closingCode('closing_month_period_not_open'));
 });
 await t.test('allocation budget is enforced before building thousands of new snapshots',async()=>{
  await transition('reopen_period');const connection=await f.pool.connect();let snapshotReads=0;
  try{await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const period=await readClosingPeriod(connection,periodId),rows=await readClosingAllocations(connection,periodId);
   // A real persisted current period/plan, with an already-full ledger inventory.
   // A read-only builder fixture isolates the bound without 5000 throwaway writes.
   const inventory=Array.from({length:5000},()=>({...rows[0],id:randomUUID(),status:'voided' as const}));
   const counted=new Proxy(connection,{get(target,key){if(key!=='query'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
    return async(sql:string,...values:unknown[])=>{if(sql.includes('sales_order_commercial_versions'))snapshotReads++;return Reflect.apply(target.query,target,[sql,...values]);};}}) as pg.PoolClient;
   await assert.rejects(buildMonthFinancialSync(counted,f.editor.actor,period,
    {action:'sync_month_outputs',periodId,expectedPeriodVersion:period.version,channels:{sales:true,work:true},reason:'Bounded'},inventory,false),closingCode('closing_period_allocation_limit'));
   assert(snapshotReads<10);
  }finally{await connection.query('ROLLBACK');connection.release();}
 });
 assert.deepEqual(f.errors,[]);
});

test('0048 nonempty upgrade preserves histories; financial links, rollback and receipt loss use existing ledger',{timeout:180000},async t=>{
 const f=await closingFixture(t,48),o=await f.order(),other=await f.order(false),p=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,o.id)).plan!;
 const before=(await f.pool.query('SELECT to_jsonb(v) value FROM server_closing_month_plan_versions v ORDER BY id')).rows;
 await runMigrations(f.pool,resolve('database/migrations'));await runMigrations(f.pool,resolve('database/migrations'));
 assert.deepEqual((await f.pool.query('SELECT to_jsonb(v) value FROM server_closing_month_plan_versions v ORDER BY id')).rows,before);
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_month_financial_links')).rows[0].n,0);
 const periodId=(await f.apply({action:'create_period',month:'2027-02',taxRatePercent:'0',taxRateConfirmed:true,remark:''})).result.periodId;
 const intent:ClosingIntent={action:'sync_month_outputs',periodId,expectedPeriodVersion:1,channels:{sales:true,work:false},reason:'Atomic adoption'};
 // The other SO has no commercial basis: an all-month command cannot silently omit it.
 await assert.rejects(previewClosingCommand(f.pool,f.editor.actor,intent),closingCode('closing_commercial_basis_required'));
 const moved=await previewClosingMonthMove(f.pool,f.editor.actor,{action:'move_months',orderId:other.id,expectedVersion:1,targetMonth:'2027-03',reason:'Separate month',selection:{mode:'whole'}});
 assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,{requestId:randomUUID(),intent:moved.intent,previewHash:moved.previewHash})).status,'applied');
 const command=await f.prepared(intent);let fail=true;
 const controlled=(mode:'audit'|'commit')=>new Proxy(f.pool,{get(target,key){if(key!=='connect'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
  return async()=>{const connection=await target.connect();return new Proxy(connection,{get(target,key){if(key!=='query'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
   return async(sql:string,...values:unknown[])=>{if(mode==='audit'&&sql.startsWith('INSERT INTO operation_logs'))throw Error('Synthetic audit failure');
    const result=await Reflect.apply(target.query,target,[sql,...values]);if(mode==='commit'&&sql==='COMMIT'&&fail){fail=false;throw Error('Synthetic acknowledgement loss');}return result;};}});};}}) as pg.Pool;
 await assert.rejects(executeClosingCommand(controlled('audit'),f.editor.actor,command),/Synthetic audit failure/u);
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_allocations')).rows[0].n,0);
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_month_financial_links')).rows[0].n,0);
 assert.equal((await readClosingCommandReceipt(f.pool,f.editor.actor,command.requestId)).state,'unknown');
 const lost=await executeClosingCommand(controlled('commit'),f.editor.actor,command);assert.equal(lost.status,'unverified');
 const receipt=await readClosingCommandReceipt(f.pool,f.editor.actor,command.requestId);assert.equal(receipt.state,'recorded');
 const replay=await executeClosingCommand(f.pool,f.editor.actor,command);assert('replayed' in replay&&replay.replayed);
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_month_financial_links')).rows[0].n,2);
 const client=await f.pool.connect();
 try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const evidence=await collectNormalizationEvidenceInTransaction(client,[o.id,other.id]);
  assert.equal(evidence.orders.find(row=>row.order.id===o.id)!.inventory.find(row=>row.relation==='server_closing_month_financial_links')!.count,'2');
  const refs=await normalizationReferences(client);assert(refs.some(row=>row[0]==='server_closing_month_financial_links'));
 }finally{await client.query('ROLLBACK');client.release();}
 const link=(await f.pool.query('SELECT * FROM server_closing_month_financial_links LIMIT 1')).rows[0];
 await assert.rejects(f.pool.query('UPDATE server_closing_month_financial_links SET line_id=$1 WHERE allocation_id=$2',[randomUUID(),link.allocation_id]),error=>(error as {code:string}).code==='23514');
 const writer=await f.pool.connect();
 try{for(const mode of ['wrong_line','duplicate_active','quantity_change','legacy_void'] as const){
  await writer.query('BEGIN');await writer.query("SELECT set_config('zhixu.closing_command','on',true)");
  if(mode!=='legacy_void')await writer.query("SELECT set_config('zhixu.closing_month_financial_command','on',true)");
  const row=await readClosingAllocation(writer,link.allocation_id);
  await assert.rejects(async()=>{
   if(mode==='quantity_change'||mode==='legacy_void'){
    await appendClosingAllocationVersion(writer,f.editor.actor,command.requestId,'synthetic-invalid-link',row.id,periodId,row.version,
     {...row.snapshot,quantity:mode==='quantity_change'?'1':row.snapshot.quantity},mode==='legacy_void'?'void_allocation':'update_allocation','Invalid linked mutation');
   }else{
    const id=(await writer.query('INSERT INTO server_closing_allocations(period_id,sales_order_id,created_by) VALUES($1,$2,$3) RETURNING id',[periodId,o.id,f.editor.actor.internalUserId])).rows[0].id;
    await appendClosingAllocationVersion(writer,f.editor.actor,command.requestId,'synthetic-invalid-link',id,periodId,0,row.snapshot,'create_allocation','Duplicate');
    await writer.query(`INSERT INTO server_closing_month_financial_links(allocation_id,period_id,sales_order_id,month_plan_version_id,month_plan_version,line_id,channel)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,periodId,o.id,link.month_plan_version_id,link.month_plan_version,mode==='wrong_line'?randomUUID():link.line_id,link.channel]);
    await writer.query('SET CONSTRAINTS ALL IMMEDIATE');
   }
  },error=>(error as {code:string}).code==='23514');await writer.query('ROLLBACK');
 }}finally{await writer.query('ROLLBACK').catch(()=>undefined);writer.release();}
 assert.equal((await readOrderClosingMonthPlan(f.pool,f.editor.actor,o.id)).plan!.version,p.version);
 assert.deepEqual(f.errors,[]);
});

test('sales-only month adoption excludes processing attribution drift before validation',{timeout:120000},async t=>{
 const f=await closingFixture(t),o=await f.order(),processing=await f.processing('USD');
 const p=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,processing.id)).plan!;
 const applyMonth=async(intent:ClosingMonthIntent)=>{const p=await previewClosingMonthMove(f.pool,f.editor.actor,intent);assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,{requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash})).status,'applied');};
 const contractPlan=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,o.id)).plan!;
 await applyMonth({action:'move_months',orderId:o.id,expectedVersion:contractPlan.version,targetMonth:'2027-03',reason:'CNY work stays outside test month',
  selection:{mode:'partial',items:[{lineId:contractPlan.lines.find(line=>line.colorId===o.basis.priceLines.find(row=>row.colorName==='White')!.colorId)!.id,quantity:'50'}]}});
 await applyMonth({action:'move_months',orderId:processing.id,expectedVersion:p.version,targetMonth:'2027-02',reason:'Processing month',selection:{mode:'whole'}});
 const factory=await f.resource('factories',{name:'Synthetic processing supplier',enabled:true,remark:'',shortName:'SYN',contactPerson:'',phone:''});
 const state=await readOrderProductionPlans(f.pool,f.editor.actor,processing.id);
 const planned=await previewProductionPlan(f.pool,f.editor.actor,{action:'create',orderId:processing.id,assignmentId:null,expectedVersion:0,expectedPlanVersion:state.order.planVersion,
  data:{executionType:'internal',executorId:f.group.id,colorId:null,plannedQuantity:'10',duration:{mode:'workdays',workdays:2},dates:{mode:'auto_queue',startDate:'2027-01-04'},remark:''}});
 const result=await executeProductionPlan(f.pool,f.editor.actor,{requestId:randomUUID(),intent:planned.intent,previewHash:planned.previewHash});assert.equal(result.status,'applied');if(result.status!=='applied')assert.fail();
 const assignmentId=result.assignments[0].id,matched=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,processing.id)).plan!;
 await applyMonth({action:'match_executors',orderId:processing.id,expectedVersion:matched.version,reason:'Before drift',items:[{lineId:matched.lines[0].id,parts:[{assignmentId,quantity:'10'}]}]});
 const current=await readOrderProductionPlans(f.pool,f.editor.actor,processing.id),assignment=current.assignments.find(row=>row.id===assignmentId)!;
 const change=await previewProductionPlan(f.pool,f.editor.actor,{action:'update',orderId:processing.id,assignmentId,expectedVersion:assignment.version,expectedPlanVersion:current.order.planVersion,reason:'Legal unstarted executor change',
  data:{executionType:'outsource',executorId:factory.id,colorId:null,plannedQuantity:'10',duration:{mode:'workdays',workdays:2},dates:{mode:'manual_fixed',startDate:'2027-01-04',endDate:'2027-01-05'},remark:''}});
 assert.equal((await executeProductionPlan(f.pool,f.editor.actor,{requestId:randomUUID(),intent:change.intent,previewHash:change.previewHash})).status,'applied');
 const created=await f.apply({action:'create_period',month:'2027-02',taxRatePercent:'0',taxRateConfirmed:true,remark:''}),periodId=created.result.periodId;
 const synced=await f.apply({action:'sync_month_outputs',periodId,expectedPeriodVersion:1,channels:{sales:true,work:false},reason:'Contract sales'});
 const detail=await readClosingPeriodDetail(f.pool,f.editor.actor,periodId);assert.equal(detail.summary.registeredQuantity,'50');assert(detail.items.every(row=>row.snapshot.order.id===o.id));
 await assert.rejects(previewClosingCommand(f.pool,f.editor.actor,{action:'sync_month_outputs',periodId,expectedPeriodVersion:synced.result.periodVersion,channels:{sales:false,work:true},reason:'Work'}),closingCode('closing_month_executor_review_required'));
 await f.apply({action:'confirm_period',periodId,expectedPeriodVersion:synced.result.periodVersion,reason:''});assert.deepEqual(f.errors,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {closingFixture} from './closing-fixture.js';
import {readClosingYear} from '../closing/annual-service.js';
import {readClosingPeriodDetail} from '../closing/read-service.js';
import {CLOSING_READ_PERMISSIONS} from '../closing/contract.js';
import {readOrderClosingMonthPlan,previewClosingMonthMove,executeClosingMonthMove} from '../closing/month-plan-service.js';
import type {ClosingMonthIntent} from '../closing/month-plan-model.js';
import {readOrderProductionPlans,previewProductionPlan,executeProductionPlan} from '../production-scheduling/service.js';
import {previewSaleAdjustment,commitSaleAdjustment} from '../sales-orders/sale-adjustment-service.js';
import {createAinuokeSalesOrder} from '../sales-orders/service.js';

test('owned PostgreSQL/HTTP: annual two-output view has one scope, live references and exact frozen history',{timeout:180000},async t=>{
 const f=await closingFixture(t),order=await f.order(),processing=await f.processing('USD');
 const year=async(extra='',who=f.editor,selected='2027')=>readClosingYear(f.pool,who.actor,new URLSearchParams('year='+selected+extra));
 const feb=(value:Awaited<ReturnType<typeof year>>)=>value.months[1];
 const move=async(intent:ClosingMonthIntent)=>{const p=await previewClosingMonthMove(f.pool,f.editor.actor,intent);
  assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,{requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash})).status,'applied');};
 const plan=async(id=order.id)=>(await readOrderClosingMonthPlan(f.pool,f.editor.actor,id)).plan!;
 const blue=order.basis.priceLines.find(row=>row.colorName==='Blue')!,white=order.basis.priceLines.find(row=>row.colorName==='White')!;
 await t.test('all twelve months are explicit; missing tax/CNY work are incomplete rather than fabricated zero',async()=>{
  const d=await year();assert.equal(d.months.length,12);assert.deepEqual(d.months.map(row=>row.month),Array.from({length:12},(_,i)=>'2027-'+String(i+1).padStart(2,'0')));
  const sales=feb(d).garmentSalesCny,work=feb(d).processingUsd;assert.equal(sales.visibility,'allowed');if(sales.visibility!=='allowed'||work.visibility!=='allowed')assert.fail();
  assert.equal(sales.amount,null);assert(sales.blockers.some(b=>b.reason==='period_tax_required'));
  assert.equal(work.amount,null);assert.equal(work.knownSubtotal.decimal,'125');assert(work.blockers.some(b=>b.reason==='usd_labor_version_required'));
  assert.equal(d.pendingPortions,1);assert.equal(d.pendingNotAssignedToYear,true);assert(d.items.every(row=>row.order.productionStatus==='not_started'));
 });
 const internal=await f.assignment(order.id,blue.colorId),factory=await f.resource('factories',{name:'Synthetic annual outsource',enabled:true,remark:'',shortName:'SYN',contactPerson:'',phone:''});
 const plans=await readOrderProductionPlans(f.pool,f.editor.actor,order.id),preview=await previewProductionPlan(f.pool,f.editor.actor,{action:'create',orderId:order.id,assignmentId:null,expectedVersion:0,expectedPlanVersion:plans.order.planVersion,
  data:{executionType:'outsource',executorId:factory.id,colorId:blue.colorId,plannedQuantity:'20',duration:{mode:'workdays',workdays:2},dates:{mode:'manual_fixed',startDate:'2027-01-04',endDate:'2027-01-05'},remark:''}});
 const saved=await executeProductionPlan(f.pool,f.editor.actor,{requestId:randomUUID(),intent:preview.intent,previewHash:preview.previewHash});assert.equal(saved.status,'applied');if(saved.status!=='applied')assert.fail();
 const outsourced=saved.assignments[0].id,p=await plan();
 await move({action:'match_executors',orderId:order.id,expectedVersion:p.version,reason:'Annual scope',items:[{lineId:p.lines.find(row=>row.colorId===blue.colorId)!.id,
  parts:[{assignmentId:internal,quantity:'15'},{assignmentId:outsourced,quantity:'10'},{assignmentId:null,quantity:'25'}]}]});
 const created=await f.apply({action:'create_period',month:'2027-02',taxRatePercent:'13',taxRateConfirmed:true,remark:''}),periodId=created.result.periodId;
 await t.test('scope filters the same portions in monthly sums and paged detail; unassigned is never internal',async()=>{
  for(const [scope,amount,count] of [['internal','1500',1],['outsource','1000',1],['unassigned','12500',3]] as const){
   const d=await year('&scope='+scope),sales=feb(d).garmentSalesCny;if(sales.visibility!=='allowed')assert.fail();assert.equal(sales.amount!.decimal,amount);assert.equal(d.total,count);
   assert(d.items.every(row=>scope==='unassigned'?row.executor===null:row.executor!.type===scope));
  }
  const all=await year('&limit=1'),sales=feb(all).garmentSalesCny;if(sales.visibility!=='allowed')assert.fail();assert.equal(sales.amount!.decimal,'15000');assert.equal(all.items.length,1);assert.equal(all.total,5);
  const filtered=await year('&search='+encodeURIComponent('SYN-CLOSE-PROCESS Missing'));assert.equal(filtered.total,0);
 });
 await t.test('pending processing has no sales price; explicit month uses confirmed zero USD work',async()=>{
  const p=await plan(processing.id);await move({action:'move_months',orderId:processing.id,expectedVersion:p.version,targetMonth:'2027-02',reason:'Processing month',selection:{mode:'whole'}});
  const d=await year(),row=d.items.find(row=>row.order.id===processing.id)!;
  assert.deepEqual(row.garmentSale,{visibility:'allowed',currency:'CNY',state:'not_applicable'});
  assert.equal(row.processing.visibility,'allowed');if(row.processing.visibility!=='allowed'||row.processing.state!=='known')assert.fail();assert.equal(row.processing.price,'0');assert.equal(row.processing.amount.decimal,'0');
 });
 await t.test('actual production status only filters reference views and never distributes monthly quantity',async()=>{
  await f.completion(order.id,internal,'15');const d=await year('&production=in_progress'),sales=feb(d).garmentSalesCny;
  assert(d.items.every(row=>row.order.id===order.id));assert(d.items.every(row=>row.order.productionStatus==='in_progress'));
  if(sales.visibility!=='allowed')assert.fail();assert.equal(sales.amount!.decimal,'15000');assert.equal((await year('&production=completed')).total,0);
 });
 await t.test('frozen months use exact financial versions, open months stay a distinct current-adopted reference',async()=>{
  const p=await plan();await move({action:'move_months',orderId:order.id,expectedVersion:p.version,targetMonth:'2027-03',reason:'White outside USD month',
   selection:{mode:'partial',items:[{lineId:p.lines.find(row=>row.colorId===white.colorId)!.id,quantity:'50'}]}});
  const synced=await f.apply({action:'sync_month_outputs',periodId,expectedPeriodVersion:1,channels:{sales:true,work:true},reason:'Explicit frozen month'});
  const confirmed=await f.apply({action:'confirm_period',periodId,expectedPeriodVersion:synced.result.periodVersion,reason:''});
  await f.completion(order.id,internal,'14','2027-01-06','Correct current completion');
  const corrected=await f.request('/year?year=2027');assert.equal(corrected.response.status,200);
  assert(corrected.body.items.some((row:{executionReview:{requiresReview:boolean}|null})=>row.executionReview?.requiresReview));
  await f.apply({action:'unconfirm_period',periodId,expectedPeriodVersion:confirmed.result.periodVersion,reason:'Review current production'});
  for(const row of (await readClosingPeriodDetail(f.pool,f.editor.actor,periodId)).items.filter(row=>row.status==='active'&&row.snapshot.assignmentId===internal))
   await f.apply({action:'review_allocation',periodId,expectedPeriodVersion:(await readClosingPeriodDetail(f.pool,f.editor.actor,periodId)).period.version,allocationId:row.id,expectedVersion:row.version,reason:'Preserve adopted finance'});
  const rechecked=await f.apply({action:'confirm_period',periodId,expectedPeriodVersion:(await readClosingPeriodDetail(f.pool,f.editor.actor,periodId)).period.version,reason:''});
  await f.apply({action:'lock_period',periodId,expectedPeriodVersion:rechecked.result.periodVersion,reason:''});
  const d=await year(),sales=feb(d).garmentSalesCny,work=feb(d).processingUsd;if(sales.visibility!=='allowed'||work.visibility!=='allowed')assert.fail();
  assert.equal(sales.amount!.decimal,'5000');assert.equal(work.amount!.decimal,'125');assert.equal(feb(d).basis,'frozen_financial_snapshot');
  assert(d.items.filter(row=>row.month==='2027-02').every(row=>row.executionReview?.laterCorrection===false&&!row.issues.includes('locked_snapshot_with_later_correction')));
  const refs=d.items.filter(row=>row.month==='2027-02').map(row=>row.basis);assert(refs.every(row=>row.financialVersions.length>=1));
  await f.completion(order.id,internal,'13','2027-01-06','Later locked correction');
  const locked=await f.request('/year?year=2027');assert.equal(locked.response.status,200);
  assert(locked.body.items.some((row:{issues:string[];executionReview:{lockedSnapshotPreserved:boolean;requiresReview:boolean;laterCorrection:boolean}|null})=>
   row.executionReview?.lockedSnapshotPreserved&&!row.executionReview.requiresReview&&row.executionReview.laterCorrection&&row.issues.includes('locked_snapshot_with_later_correction')));
  const rule={kind:'amount',value:'1'},negotiation=await previewSaleAdjustment(f.pool,f.editor.actor,{rule,items:[{salesOrderId:order.id}]}),row=negotiation.items[0];if(row.status!=='ready')assert.fail();
  assert.equal((await commitSaleAdjustment(f.pool,f.editor.actor,{requestId:randomUUID(),reason:'Later quote-center negotiation',rule,items:[{salesOrderId:order.id,expectedVersion:row.expectedVersion,fingerprint:row.fingerprint}]})).items[0].status,'updated');
  const after=await year();assert.deepEqual(feb(after),feb(d));assert.deepEqual(after.items.filter(row=>row.month==='2027-02').map(row=>row.basis),refs);
  assert(after.items.filter(row=>row.month==='2027-03').every(row=>row.basis.kind==='current_adopted_order_reference'));
 });
 await t.test('frozen-only owners do not depend on current source quantity or commercial qualification',async()=>{
  const fresh=await f.order(),p=await plan(fresh.id);await move({action:'move_months',orderId:fresh.id,expectedVersion:p.version,targetMonth:'2028-01',reason:'Separate frozen year',selection:{mode:'whole'}});
  const created=await f.apply({action:'create_period',month:'2028-01',taxRatePercent:'0',taxRateConfirmed:true,remark:''}),id=created.result.periodId;
  const adopted=await f.apply({action:'sync_month_outputs',periodId:id,expectedPeriodVersion:1,channels:{sales:true,work:false},reason:'Explicit historical sale'});
  const confirmed=await f.apply({action:'confirm_period',periodId:id,expectedPeriodVersion:adopted.result.periodVersion,reason:''});
  await f.apply({action:'lock_period',periodId:id,expectedPeriodVersion:confirmed.result.periodVersion,reason:''});
  const before=await year('',f.editor,'2028');
  await f.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=101 WHERE sales_order_id=$1',[fresh.id]);
  const after=await year('',f.editor,'2028');assert.deepEqual(after.months,before.months);
  const sale=after.months[0].garmentSalesCny,work=after.months[0].processingUsd;if(sale.visibility!=='allowed'||work.visibility!=='allowed')assert.fail();
  assert.equal(sale.amount!.decimal,'16950');assert.equal(work.amount,null);assert(work.blockers.some(row=>row.reason==='financial_channel_not_adopted'));
  const unsupported=(await createAinuokeSalesOrder(f.pool,f.editor.actor,{source:{sourceId:'SYN-ANNUAL-TINY',sourceRowIdentity:'annual-tiny',salesContractNo:'SYN-ANNUAL-TINY',
   insideOrderNo:'SYN-ANNUAL-TINY',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2028-01-01',styleNo:'SYN-ANNUAL-TINY',
   companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:0.0000001,sourceHash:'annual-tiny',fetchedAt:'2026-10-27T00:00:00Z'},colors:[]})).salesOrder.id;
  const pending=await year('',f.editor,'2028'),item=pending.items.find(row=>row.order.id===unsupported)!;
  assert.equal(item.month,null);assert.equal(item.quantity,null);assert(item.issues.includes('quantity_unsupported'));assert.equal(pending.pendingPortions,1);
  assert.deepEqual(pending.months,after.months);
 });
 await t.test('fresh amount grants apply to annual totals and every row; HTTP is read-only and strict',async()=>{
  const viewer=await f.user('year.viewer',CLOSING_READ_PERMISSIONS),saleOnly=await f.user('year.sale',[...CLOSING_READ_PERMISSIONS,'commercial.sale.view']);
  for(const who of [viewer,saleOnly]){const response=await f.request('/year?year=2027',undefined,who.cookie);assert.equal(response.response.status,200);
   assert.deepEqual(response.body.totals.processingUsd,{visibility:'restricted'});assert(response.body.items.every((row:{processing:unknown})=>JSON.stringify(row.processing)==='{"visibility":"restricted"}'));
   if(who===viewer)assert.deepEqual(response.body.totals.garmentSalesCny,{visibility:'restricted'});
  }
  const before=(await f.pool.query('SELECT count(*)::int n FROM operation_logs')).rows[0].n;
  assert.equal((await f.request('/year?year=2027')).response.status,200);assert.equal((await f.request('/year?year=2027',undefined,null)).response.status,401);
  assert.equal((await f.request('/year?year=2027&price=1')).response.status,400);assert.equal((await f.request('/year?year=2027',{})).response.status,405);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM operation_logs')).rows[0].n,before);
 });
 assert.deepEqual(f.errors,[]);
});

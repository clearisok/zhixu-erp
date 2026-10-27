import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closingFixture, closingCode } from './closing-fixture.js';
import { readOrderClosingMonthPlan, previewClosingMonthMove, executeClosingMonthMove, readClosingMonthReceipt } from '../closing/month-plan-service.js';
import { sumMonthQuantities, type ClosingMonthIntent } from '../closing/month-plan-model.js';
import { previewProductionPlan, executeProductionPlan, readOrderProductionPlans } from '../production-scheduling/service.js';
import { CLOSING_READ_PERMISSIONS } from '../closing/contract.js';
import type pg from 'pg';
import { runMigrations } from '../db/migration-runner.js';
import { resolve } from 'node:path';

test('owned PostgreSQL: explicit month/executor matching and immutable production attribution', {timeout:120000}, async t=>{
 const f=await closingFixture(t),order=await f.order(false),other=await f.order(false);
 const read=async()=>(await readOrderClosingMonthPlan(f.pool,f.editor.actor,order.id)).plan!;
 const initial=await read(),blue=initial.lines.find(line=>order.basis.priceLines.find(row=>row.colorId===line.colorId)?.colorName==='Blue')!;
 const white=initial.lines.find(line=>line.id!==blue.id)!;
 const internal=await f.assignment(order.id,blue.colorId),foreign=await f.assignment(other.id,null);
 const factory=await f.resource('factories',{name:'Synthetic outsourced matching',enabled:true,remark:'',shortName:'SYN',contactPerson:'',phone:''});
 const state=await readOrderProductionPlans(f.pool,f.editor.actor,order.id);
 const preview=await previewProductionPlan(f.pool,f.editor.actor,{action:'create',orderId:order.id,assignmentId:null,expectedVersion:0,expectedPlanVersion:state.order.planVersion,
  data:{executionType:'outsource',executorId:factory.id,colorId:blue.colorId,plannedQuantity:'20',duration:{mode:'workdays',workdays:2},
   dates:{mode:'manual_fixed',startDate:'2027-01-04',endDate:'2027-01-05'},remark:''}});
 const saved=await executeProductionPlan(f.pool,f.editor.actor,{requestId:randomUUID(),intent:preview.intent,previewHash:preview.previewHash});
 assert.equal(saved.status,'applied');if(saved.status!=='applied')assert.fail();const outsourced=saved.assignments[0].id;
 const match=async(parts:{assignmentId:string|null;quantity:string}[],lineId=blue.id):Promise<ClosingMonthIntent>=>({action:'match_executors',orderId:order.id,expectedVersion:(await read()).version,reason:'Synthetic executor match',items:[{lineId,parts}]});
 const make=async(intent:ClosingMonthIntent)=>{const p=await previewClosingMonthMove(f.pool,f.editor.actor,intent);return {requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash};};
 let original:Awaited<ReturnType<typeof make>>;
 await t.test('matching blocks foreign owners/wrong colors; reference quantities warn without capping independent closing quantities',async()=>{
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await match([{assignmentId:foreign,quantity:'50'}])),closingCode('closing_month_executor_unavailable'));
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await match([{assignmentId:internal,quantity:'50'}],white.id)),closingCode('closing_month_executor_color_mismatch'));
  const beyond=await previewClosingMonthMove(f.pool,f.editor.actor,await match([{assignmentId:internal,quantity:'31'},{assignmentId:null,quantity:'19'}]));
  assert.deepEqual(beyond.warnings,[{assignmentId:internal,code:'executor_quantity_exceeds_reference',quantity:'31',referenceQuantity:'30'}]);
 });
 await t.test('one selected color is split into internal/outsource/unassigned without moving months or production',async()=>{
  const before=await f.pool.query('SELECT id,version,planned_quantity::text,resource_snapshot_hash FROM production_schedule_assignments ORDER BY id');
  original=await make(await match([{assignmentId:internal,quantity:'25'},{assignmentId:outsourced,quantity:'15'},{assignmentId:null,quantity:'10'}]));
  const result=await executeClosingMonthMove(f.pool,f.editor.actor,original);assert.equal(result.status,'applied');
  const p=await read();assert.equal(p.version,2);assert.equal(sumMonthQuantities(p.lines),'100');assert(p.lines.every(line=>line.month==='2027-02'));
  assert.deepEqual(p.lines.find(line=>line.id===white.id),white);assert.equal(p.executorBasis.length,2);
  assert.deepEqual(p.executorBasis.map(ref=>ref.executionType).sort(),['internal','outsource']);
  assert.deepEqual((await f.pool.query('SELECT id,version,planned_quantity::text,resource_snapshot_hash FROM production_schedule_assignments ORDER BY id')).rows,before.rows);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_allocations')).rows[0].n,0);
  const replay=await executeClosingMonthMove(f.pool,f.editor.actor,original);assert('replayed' in replay&&replay.replayed);assert.equal((await read()).version,2);
  assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,original.requestId)).state,'recorded');
 });
 await t.test('later matching warns across all portions of an assignment and cannot rewrite its prior evidence',async()=>{
  const p=await read(),rest=p.lines.find(line=>line.colorId===blue.colorId&&line.assignmentId===null)!;
  const beyond=await previewClosingMonthMove(f.pool,f.editor.actor,await match([{assignmentId:internal,quantity:'6'},{assignmentId:null,quantity:'4'}],rest.id));
  assert.deepEqual(beyond.warnings,[{assignmentId:internal,code:'executor_quantity_exceeds_reference',quantity:'31',referenceQuantity:'30'}]);
  const command=await make(await match([{assignmentId:internal,quantity:'5'},{assignmentId:null,quantity:'5'}],rest.id));
  assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,command)).status,'applied');
  assert.deepEqual((await read()).executorBasis,p.executorBasis);
  const assigned=(await read()).lines.find(line=>line.assignmentId===internal)!;
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await match([{assignmentId:outsourced,quantity:assigned.quantity}],assigned.id)),closingCode('closing_month_executor_already_matched'));
 });
 await t.test('month moves preserve matched attribution and quantity; stale production previews durably reject',async()=>{
  const p=await read(),intent:ClosingMonthIntent={action:'move_months',orderId:order.id,expectedVersion:p.version,targetMonth:'2027-03',reason:'Move the whole order',selection:{mode:'whole'}};
  const command=await make(intent);await f.completion(order.id,internal,'30');
  const rejected=await executeClosingMonthMove(f.pool,f.editor.actor,command);assert.equal(rejected.status,'rejected');
  if(rejected.status==='rejected')assert.equal(rejected.error.code,'closing_month_preview_changed');
  const fresh=await make(intent);assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,fresh)).status,'applied');
  assert.deepEqual((await read()).executorBasis,p.executorBasis);assert((await read()).lines.every(line=>line.month==='2027-03'));
 });
 await t.test('concurrent matching consumes one version; cancellation exposes real completed reference without capping closing quantity',async()=>{
  const fresh=await f.order(false),p=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,fresh.id)).plan!,line=p.lines[0],assignment=await f.assignment(fresh.id,line.colorId);
  const intent:ClosingMonthIntent={action:'match_executors',orderId:fresh.id,expectedVersion:p.version,reason:'Concurrent match',
   items:[{lineId:line.id,parts:[{assignmentId:assignment,quantity:'10'},{assignmentId:null,quantity:'40'}]}]};
  const first=await make(intent),second=await make({...intent,reason:'Other operator'});
  const results=await Promise.all([executeClosingMonthMove(f.pool,f.editor.actor,first),executeClosingMonthMove(f.pool,f.editor.actor,second)]);
  assert.equal(results.filter(x=>x.status==='applied').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
  await f.completion(fresh.id,assignment,'12');
  const state=await readOrderProductionPlans(f.pool,f.editor.actor,fresh.id),assigned=state.assignments.find(x=>x.id===assignment)!;
  const cancellation=await previewProductionPlan(f.pool,f.editor.actor,{action:'cancel',orderId:fresh.id,assignmentId:assignment,
   expectedVersion:assigned.version,expectedPlanVersion:state.order.planVersion,reason:'Cancel only remaining task'});
  assert.equal((await executeProductionPlan(f.pool,f.editor.actor,{requestId:randomUUID(),intent:cancellation.intent,previewHash:cancellation.previewHash})).status,'applied');
  const next=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,fresh.id)).plan!,rest=next.lines.find(x=>x.id===line.id)!;
  const more:ClosingMonthIntent={...intent,expectedVersion:next.version,items:[{lineId:rest.id,parts:[{assignmentId:assignment,quantity:'3'},{assignmentId:null,quantity:'37'}]}]};
  const beyond=await previewClosingMonthMove(f.pool,f.editor.actor,more);
  assert(beyond.warnings.some(warning=>warning.code==='executor_plan_cancelled'));
  assert(beyond.warnings.some(warning=>warning.code==='executor_quantity_exceeds_reference'&&warning.referenceQuantity==='12'&&warning.quantity==='13'));
  const accepted=await make({...more,items:[{lineId:rest.id,parts:[{assignmentId:assignment,quantity:'2'},{assignmentId:null,quantity:'38'}]}]});
  assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,accepted)).status,'applied');
  const after=await readOrderClosingMonthPlan(f.pool,f.editor.actor,fresh.id);assert.deepEqual(after.executorChanges,[]);
  assert.equal(sumMonthQuantities(after.plan!.lines.filter(x=>x.assignmentId===assignment)),'12');
  assert.equal(after.plan!.executorBasis[0].planStatus,'cancelled');assert.equal(after.plan!.executorBasis[0].execution?.completedQuantity,'12');
  assert.equal((await f.pool.query('SELECT executor_basis FROM server_closing_month_plan_versions WHERE sales_order_id=$1 AND version=2',[fresh.id])).rows[0].executor_basis[0].execution,null);
 });
 await t.test('legal production recoloring becomes an explicit preview conflict and durable rejection, not a raw SQL 500',async()=>{
  const fresh=await f.order(false),p=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,fresh.id)).plan!,line=p.lines[0],newColor=p.lines[1].colorId;
  const assignment=await f.assignment(fresh.id,line.colorId);
  const matched=await make({action:'match_executors',orderId:fresh.id,expectedVersion:1,reason:'Retain initial color attribution',
   items:[{lineId:line.id,parts:[{assignmentId:assignment,quantity:'10'},{assignmentId:null,quantity:'40'}]}]});
  assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,matched)).status,'applied');
  const move:ClosingMonthIntent={action:'move_months',orderId:fresh.id,expectedVersion:2,targetMonth:'2027-04',reason:'Preview before recoloring',selection:{mode:'whole'}};
  const command=await make(move),state=await readOrderProductionPlans(f.pool,f.editor.actor,fresh.id),assigned=state.assignments.find(x=>x.id===assignment)!;
  const update=await previewProductionPlan(f.pool,f.editor.actor,{action:'update',orderId:fresh.id,assignmentId:assignment,expectedVersion:assigned.version,
   expectedPlanVersion:state.order.planVersion,reason:'Legal unstarted recoloring',data:{executionType:'internal',executorId:f.group.id,colorId:newColor,plannedQuantity:'30',
    duration:{mode:'workdays',workdays:2},dates:{mode:'auto_queue',startDate:'2027-01-04'},remark:''}});
  assert.equal((await executeProductionPlan(f.pool,f.editor.actor,{requestId:randomUUID(),intent:update.intent,previewHash:update.previewHash})).status,'applied');
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,move),closingCode('closing_month_executor_review_required'));
  const result=await executeClosingMonthMove(f.pool,f.editor.actor,command);assert.equal(result.status,'rejected');
  if(result.status==='rejected')assert.equal(result.error.code,'closing_month_executor_review_required');
  assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,command.requestId)).state,'recorded');
  const after=await readOrderClosingMonthPlan(f.pool,f.editor.actor,fresh.id);assert.equal(after.plan!.version,2);
  assert.deepEqual(after.executorChanges,[{assignmentId:assignment,reason:'attribution_changed'}]);
  assert.equal(after.plan!.executorBasis[0].colorId,line.colorId);
 });
 await t.test('lost matching COMMIT acknowledgement recovers its original command without a second version',async()=>{
  const fresh=await f.order(false),p=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,fresh.id)).plan!,line=p.lines[0],assignment=await f.assignment(fresh.id,line.colorId);
  const command=await make({action:'match_executors',orderId:fresh.id,expectedVersion:p.version,reason:'Receipt recovery',
   items:[{lineId:line.id,parts:[{assignmentId:assignment,quantity:'10'},{assignmentId:null,quantity:'40'}]}]});
  let armed=true;
  const controlled=new Proxy(f.pool,{get(target,key){if(key!=='connect'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
   return async()=>{const connection=await target.connect();return new Proxy(connection,{get(target,key){if(key!=='query'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
    return async(sql:string,...values:unknown[])=>{const result=await Reflect.apply(target.query,target,[sql,...values]);if(sql==='COMMIT'&&armed){armed=false;throw Error('Synthetic lost match acknowledgement');}return result;};}});};}}) as pg.Pool;
  assert.equal((await executeClosingMonthMove(controlled,f.editor.actor,command)).status,'unverified');
  const receipt=await readClosingMonthReceipt(f.pool,f.editor.actor,command.requestId);assert.equal(receipt.state,'recorded');
  if(receipt.state==='recorded')assert.equal(receipt.result.status,'applied');
  const replay=await executeClosingMonthMove(f.pool,f.editor.actor,command);assert('replayed' in replay&&replay.replayed);
  assert.equal((await readOrderClosingMonthPlan(f.pool,f.editor.actor,fresh.id)).plan!.version,2);
 });
 await t.test('confirmed months block executor matching, fresh RBAC cannot be forged, receipts survive removed edit',async()=>{
  await f.adopt(order.id);
  const created=await f.apply({action:'create_period',month:'2027-03',taxRatePercent:'0',taxRateConfirmed:true,remark:''});
  const adopted=await f.apply({action:'sync_month_outputs',periodId:created.result.periodId,expectedPeriodVersion:created.result.periodVersion,channels:{sales:true,work:false},reason:'Explicit sales basis before freeze'});
  await f.apply({action:'confirm_period',periodId:created.result.periodId,expectedPeriodVersion:adopted.result.periodVersion,reason:''});
  const rest=(await read()).lines.find(line=>line.colorId===blue.colorId&&line.assignmentId===null)!;
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await match([{assignmentId:outsourced,quantity:'5'}],rest.id)),closingCode('closing_month_period_not_open'));
  const viewer=await f.user('matching.viewer',CLOSING_READ_PERMISSIONS);
  await assert.rejects(previewClosingMonthMove(f.pool,viewer.actor,await match([{assignmentId:outsourced,quantity:'5'}],rest.id)),closingCode('permission_denied'));
  await f.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.edit'",[f.editor.role]);
  assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,original.requestId)).state,'recorded');
  await assert.rejects(executeClosingMonthMove(f.pool,f.editor.actor,original),closingCode('permission_denied'));
 });
 await t.test('database refuses recoloring, month changes, evidence changes and moving an already assigned portion',async()=>{
  const p=await read(),client=await f.pool.connect();
  const variants=[{lines:p.lines.map((line,i)=>i===0?{...line,month:'2027-04'}:line),executorBasis:p.executorBasis},
   {lines:p.lines.map(line=>line.assignmentId===internal?{...line,assignmentId:outsourced}:line),executorBasis:p.executorBasis},
   {lines:p.lines,executorBasis:p.executorBasis.map(ref=>({...ref,executorId:factory.id}))},
   {lines:p.lines,executorBasis:p.executorBasis.map(ref=>({...ref,assignmentVersion:ref.assignmentVersion+1}))}];
  try{for(const variant of variants){await client.query('BEGIN');await client.query("SELECT set_config('zhixu.closing_month_command','on',true)");
   await assert.rejects(client.query(`INSERT INTO server_closing_month_plan_versions(sales_order_id,version,source_quantity,quantity_state,source_fingerprint,lines,action,reason,actor_id,request_id,operation_id,executor_basis)
    VALUES($1,$2,$3,'ready',$4,$5,'match_executors','',$6,$7,'synthetic-invalid-match',$8)`,[order.id,p.version+1,p.sourceQuantity,p.sourceFingerprint,JSON.stringify(variant.lines),f.editor.actor.internalUserId,randomUUID(),JSON.stringify(variant.executorBasis)]),error=>(error as {code:string}).code==='23514');
   await client.query('ROLLBACK');}}
  finally{await client.query('ROLLBACK').catch(()=>undefined);client.release();}
 });
 assert.deepEqual(f.errors,[]);
});

test('0047 nonempty month histories upgrade additively without guessing executor attribution',{timeout:120000},async t=>{
 const f=await closingFixture(t,47),order=await f.order(false);
 const rows=await f.pool.query('SELECT to_jsonb(v) value FROM server_closing_month_plan_versions v ORDER BY id');
 assert.equal(rows.rows.length,1);
 await runMigrations(f.pool,resolve('database/migrations'));
 assert.deepEqual((await f.pool.query("SELECT to_jsonb(v)-'executor_basis' value FROM server_closing_month_plan_versions v ORDER BY id")).rows,rows.rows);
 const p=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,order.id)).plan!;assert.deepEqual(p.executorBasis,[]);
 assert(p.lines.every(line=>line.assignmentId===null));assert.equal(p.version,1);
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_allocations')).rows[0].n,0);
});

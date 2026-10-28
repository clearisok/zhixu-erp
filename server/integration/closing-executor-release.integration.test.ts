import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closingFixture, closingCode } from './closing-fixture.js';
import { executeClosingMonthMove, previewClosingMonthMove, readOrderClosingMonthPlan, readClosingMonthReceipt } from '../closing/month-plan-service.js';
import { closingExecutionFingerprint } from '../closing/basis-model.js';
import { executeProductionPlan, previewProductionPlan, readOrderProductionPlans } from '../production-scheduling/service.js';
import type { ClosingMonthIntent } from '../closing/month-plan-model.js';
import { createClosingClient } from '../../features/closing-center/server/closing-client.js';
test('owned PostgreSQL: zero-output executor recovery is explicit, exact and replayable', {timeout:180000}, async t=>{
 const f=await closingFixture(t);
 const prepare=async(intent:ClosingMonthIntent)=>{const p=await previewClosingMonthMove(f.pool,f.editor.actor,intent);return {requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash};};
 const read=(id:string)=>readOrderClosingMonthPlan(f.pool,f.editor.actor,id);
 const drift=async(beforeChange?: (id:string)=>Promise<void>)=>{
  const order=await f.order(false),p=(await read(order.id)).plan!,line=p.lines[0],assignmentId=await f.assignment(order.id,line.colorId);
  const matched=await prepare({action:'match_executors',orderId:order.id,expectedVersion:1,reason:'Original attribution',items:[{lineId:line.id,parts:[{assignmentId,quantity:'10'},{assignmentId:null,quantity:'40'}]}]});
  assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,matched)).status,'applied');
  if (beforeChange) await beforeChange(order.id);
  const state=await readOrderProductionPlans(f.pool,f.editor.actor,order.id),row=state.assignments.find(x=>x.id===assignmentId)!;
  const preview=await previewProductionPlan(f.pool,f.editor.actor,{action:'update',orderId:order.id,assignmentId,expectedVersion:row.version,expectedPlanVersion:state.order.planVersion,
   reason:'Legal unstarted recoloring',data:{executionType:'internal',executorId:f.group.id,colorId:p.lines[1].colorId,plannedQuantity:'30',duration:{mode:'workdays',workdays:2},dates:{mode:'auto_queue',startDate:'2027-01-04'},remark:''}});
  assert.equal((await executeProductionPlan(f.pool,f.editor.actor,{requestId:randomUUID(),intent:preview.intent,previewHash:preview.previewHash})).status,'applied');
  const current=await read(order.id);return {order,assignmentId,current,intent:{action:'release_executors',orderId:order.id,expectedVersion:current.plan!.version,
   assignmentIds:[assignmentId],observedExecutorFingerprint:closingExecutionFingerprint(current.executorCandidates),reason:'Explicit zero-output recovery'} as const};
 };
 const client=createClosingClient({baseUrl:f.base,visibility:()=>({sale:true,work:true}),fetchImpl:(async(url,init)=>{const headers=new Headers(init?.headers);headers.set('Cookie',f.editor.cookie);if(init?.body)headers.set('Origin',f.base);return fetch(url,{...init,headers});}) as typeof fetch});
 await t.test('strict HTTP client releases exact portions while retaining changed Source for subsequent explicit review',async()=>{
  const d=await drift(),old=d.current.plan!;
  await f.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=110 WHERE sales_order_id=$1',[d.order.id]);
  await f.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=60 WHERE sales_order_id=$1 AND color_name='Blue'",[d.order.id]);
  const production=(await f.pool.query('SELECT to_jsonb(a) value FROM production_schedule_assignments a ORDER BY id')).rows;
  const preview=await client.monthPreview({...d.intent,assignmentIds:[...d.intent.assignmentIds]},()=>true);assert('releasedQuantity' in preview);assert.equal(preview.releasedQuantity,'10');
  const command={requestId:randomUUID(),intent:preview.intent,previewHash:preview.previewHash};await client.monthSubmit(command,()=>true);
  const current=await read(d.order.id);assert.equal(current.sourceChanged,true);assert.equal(current.plan!.sourceQuantity,'100');assert.deepEqual(current.executorChanges,[]);
  assert.deepEqual(current.plan!.lines,old.lines.map(x=>x.assignmentId===d.assignmentId?{...x,assignmentId:null}:x));assert.deepEqual(current.plan!.executorBasis,[]);
  assert.deepEqual((await f.pool.query('SELECT to_jsonb(a) value FROM production_schedule_assignments a ORDER BY id')).rows,production);
  assert.deepEqual((await f.pool.query('SELECT lines FROM server_closing_month_plan_versions WHERE id=$1',[old.versionId])).rows[0].lines,old.lines);
  assert.equal((await client.monthReceipt(command,()=>true)).state,'recorded');assert('replayed' in await executeClosingMonthMove(f.pool,f.editor.actor,command));assert.equal((await read(d.order.id)).plan!.version,3);
 });
 await t.test('stale observation, partial or foreign scope and concurrent changes never silently release',async()=>{
  const d=await drift();
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,{...d.intent,observedExecutorFingerprint:'0'.repeat(64)}),closingCode('closing_month_preview_changed'));
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,{...d.intent,assignmentIds:[randomUUID()]}),closingCode('closing_month_preview_changed'));
  const a=await prepare({...d.intent,assignmentIds:[...d.intent.assignmentIds]}),b=await prepare({...d.intent,assignmentIds:[...d.intent.assignmentIds],reason:'Other operator'});
  const results=await Promise.all([executeClosingMonthMove(f.pool,f.editor.actor,a),executeClosingMonthMove(f.pool,f.editor.actor,b)]);
  assert.equal(results.filter(x=>x.status==='applied').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
 });
 await t.test('any positive output history remains protected even after correction back to zero',async()=>{
  const d=await drift();await f.completion(d.order.id,d.assignmentId,'5');await f.completion(d.order.id,d.assignmentId,'0','2027-01-06','Correct quantity with retained history');
  const state=await read(d.order.id),intent={...d.intent,assignmentIds:[...d.intent.assignmentIds],observedExecutorFingerprint:closingExecutionFingerprint(state.executorCandidates)};
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,intent),closingCode('closing_month_executor_has_output'));assert.equal(state.plan!.version,2);
 });
 await t.test('database defers exact original-command validation and rejects a forged recovery scope',async()=>{
  const d=await drift(),p=d.current.plan!,connection=await f.pool.connect();
  try {await connection.query('BEGIN');await connection.query("SELECT set_config('zhixu.closing_month_command','on',true)");
   const requestId=randomUUID(),saved=await connection.query(`INSERT INTO server_closing_month_plan_versions(sales_order_id,version,source_quantity,quantity_state,source_fingerprint,lines,action,reason,actor_id,request_id,operation_id,executor_basis)
    VALUES($1,$2,$3,'ready',$4,$5,'release_executors',$6,$7,$8,'synthetic-release','[]') RETURNING id::text`,[d.order.id,p.version+1,p.sourceQuantity,p.sourceFingerprint,JSON.stringify(p.lines.map(x=>x.assignmentId===d.assignmentId?{...x,assignmentId:null}:x)),d.intent.reason,f.editor.actor.internalUserId,requestId]);
   await connection.query('INSERT INTO server_closing_month_commands(actor_id,request_id,payload_hash,command,result) VALUES($1,$2,$3,$4,$5)',[f.editor.actor.internalUserId,requestId,'0'.repeat(64),JSON.stringify({requestId,intent:{...d.intent,assignmentIds:[randomUUID()]},previewHash:'0'.repeat(64)}),JSON.stringify({requestId,status:'applied',orderId:d.order.id,version:3,versionId:saved.rows[0].id,operationId:'synthetic-release'})]);
   await assert.rejects(connection.query('COMMIT'),error=>(error as {code:string}).code==='23514');
  } finally {await connection.query('ROLLBACK').catch(()=>undefined);connection.release();}
  assert.equal((await read(d.order.id)).plan!.version,2);
 });
 await t.test('frozen months and fresh permissions block recovery; original rejected receipt persists',async()=>{
  const d=await drift(async id=>{
   await f.adopt(id);await executeClosingMonthMove(f.pool,f.editor.actor,await prepare({action:'move_months',orderId:id,expectedVersion:2,targetMonth:'2027-09',selection:{mode:'whole'},reason:'Dedicated frozen recovery scope'}));
   const period=await f.apply({action:'create_period',month:'2027-09',taxRatePercent:'0',taxRateConfirmed:true,remark:''});
   const synced=await f.apply({action:'sync_month_outputs',periodId:period.result.periodId,expectedPeriodVersion:period.result.periodVersion,channels:{sales:true,work:false},reason:'Explicit period review'});
   await f.apply({action:'confirm_period',periodId:period.result.periodId,expectedPeriodVersion:synced.result.periodVersion,reason:''});
  });
  const prepared={requestId:randomUUID(),intent:{...d.intent,assignmentIds:[...d.intent.assignmentIds]},previewHash:'0'.repeat(64)};
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,{...d.intent,assignmentIds:[...d.intent.assignmentIds]}),closingCode('closing_month_period_not_open'));
  const result=await executeClosingMonthMove(f.pool,f.editor.actor,prepared);assert.equal(result.status,'rejected');assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,prepared.requestId)).state,'recorded');
  await f.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.edit'",[f.editor.role]);
  await assert.rejects(executeClosingMonthMove(f.pool,f.editor.actor,prepared),closingCode('permission_denied'));
 });
 assert.deepEqual(f.errors,[]);
});

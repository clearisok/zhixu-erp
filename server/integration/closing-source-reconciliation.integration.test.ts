import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { closingFixture, closingCode } from './closing-fixture.js';
import { readOrderClosingMonthPlan, previewClosingMonthMove, executeClosingMonthMove, readClosingMonthReceipt } from '../closing/month-plan-service.js';
import { type ClosingMonthCommand, type ClosingMonthIntent, type ClosingSourceReconciliation } from '../closing/month-plan-model.js';
import { createClosingClient } from '../../features/closing-center/server/closing-client.js';
import { CLOSING_READ_PERMISSIONS } from '../closing/contract.js';
import { runMigrations } from '../db/migration-runner.js';
import { resolve } from 'node:path';

test('owned PostgreSQL/HTTP: explicit changed-Source reconciliation preserves history, execution and frozen months', {timeout:180000}, async t=>{
  const f=await closingFixture(t), order=await f.order(false);
  const read=(id=order.id)=>readOrderClosingMonthPlan(f.pool,f.editor.actor,id);
  const prepare=async(intent:ClosingMonthIntent)=>{const p=await previewClosingMonthMove(f.pool,f.editor.actor,intent);return {requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash};};
  // Only the disposable synthetic fixture's source facts are changed here. The
  // persistent recovery fixture separately exercises the real Source refresh.
  async function observed(id:string,blue:string,white='50'){
    await f.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=$2::numeric+$3::numeric WHERE sales_order_id=$1',[id,blue,white]);
    await f.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=CASE color_name WHEN 'Blue' THEN $2::numeric ELSE $3::numeric END WHERE sales_order_id=$1",[id,blue,white]);
    return read(id);
  }
  const sourceIntent=async(id:string,patch:Partial<ClosingSourceReconciliation>={}):Promise<ClosingSourceReconciliation>=>{
    const state=await read(id);return {action:'reconcile_source',orderId:id,expectedVersion:state.plan!.version,observedSourceFingerprint:state.observedSource.fingerprint,
      reason:'Explicit synthetic current Source review',adjustments:[],additions:[],...patch};
  };
  const client=createClosingClient({baseUrl:f.base,visibility:()=>({sale:true,work:true}),fetchImpl:(async(url,init)=>{
    const headers=new Headers(init?.headers);headers.set('Cookie',f.editor.cookie);if(init?.body)headers.set('Origin',f.base);return fetch(url,{...init,headers});
  }) as typeof fetch});
  let original:ClosingMonthCommand;
  await t.test('the strict existing client adopts increased Source only into pending/unassigned quantities',async()=>{
    const initial=(await read()).plan!,blue=(await f.pool.query("SELECT id::text FROM sales_order_color_identities WHERE sales_order_id=$1 AND color_name='Blue'",[order.id])).rows[0].id;
    const before=await f.pool.query('SELECT id,version,planned_quantity::text FROM production_schedule_assignments ORDER BY id');
    await observed(order.id,'70');
    const state=await client.monthPlan(order.id,()=>true);assert.equal(state.sourceChanged,true);assert.equal(state.observedSource.quantity,'120');
    await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,{action:'move_months',orderId:order.id,expectedVersion:1,targetMonth:'2027-03',selection:{mode:'whole'},reason:'No bypass'}),closingCode('closing_month_source_changed'));
    const intent=await sourceIntent(order.id,{additions:[{colorId:blue,quantity:'20'}]}),p=await client.monthPreview(intent,()=>true);
    assert('sourceReconciliation' in p);assert.equal(p.sourceReconciliation?.quantityDelta,'20');
    original={requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash};await client.monthSubmit(original,()=>true);
    const next=(await client.monthPlan(order.id,()=>true)).plan!;assert.equal(next.version,2);assert.equal(next.sourceQuantity,'120');assert.equal(next.defaultMonth,initial.defaultMonth);
    for(const line of initial.lines)assert.deepEqual(next.lines.find(value=>value.id===line.id),line);
    assert.deepEqual(next.lines.filter(line=>!initial.lines.some(old=>old.id===line.id)).map(({month,assignmentId,quantity})=>({month,assignmentId,quantity})),[{month:null,assignmentId:null,quantity:'20'}]);
    assert.deepEqual((await f.pool.query('SELECT id,version,planned_quantity::text FROM production_schedule_assignments ORDER BY id')).rows,before.rows);
    const stored=(await f.pool.query('SELECT source_observation,lines FROM server_closing_month_plan_versions WHERE sales_order_id=$1 AND version=2',[order.id])).rows[0];assert.deepEqual(stored.source_observation,state.observedSource);
    assert.deepEqual((await f.pool.query('SELECT lines FROM server_closing_month_plan_versions WHERE id=$1',[initial.versionId])).rows[0].lines,initial.lines);
    assert.equal((await client.monthReceipt(original,()=>true)).state,'recorded');
    const replay=await executeClosingMonthMove(f.pool,f.editor.actor,original);assert('replayed' in replay&&replay.replayed);assert.equal((await read()).plan!.version,2);
    assert.equal((await f.pool.query("SELECT count(*)::int n FROM server_closing_allocations")).rows[0].n,0);
  });
  await t.test('deleting the last matched line removes only the new version unused evidence, retaining completion history',async()=>{
    const fresh=await f.order(false),initial=(await read(fresh.id)).plan!,blue=initial.lines[0],assignment=await f.assignment(fresh.id,blue.colorId);
    const match=await prepare({action:'match_executors',orderId:fresh.id,expectedVersion:1,reason:'Original actual attribution',items:[{lineId:blue.id,parts:[{assignmentId:assignment,quantity:'50'}]}]});
    assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,match)).status,'applied');await f.completion(fresh.id,assignment,'30');
    const prior=(await read(fresh.id)).plan!,assigned=prior.lines.find(line=>line.assignmentId===assignment)!;
    const blueName=(await f.pool.query('SELECT color_name FROM sales_order_color_identities WHERE id=$1',[blue.colorId])).rows[0].color_name;
    await observed(fresh.id,blueName==='Blue'?'0':'50',blueName==='Blue'?'50':'0');
    const before=(await f.pool.query('SELECT * FROM production_schedule_executions WHERE assignment_id=$1',[assignment])).rows;
    const intent=await sourceIntent(fresh.id,{adjustments:[{lineId:assigned.id,quantity:'0'}]}),saved=await executeClosingMonthMove(f.pool,f.editor.actor,await prepare(intent));assert.equal(saved.status,'applied');
    const next=(await read(fresh.id)).plan!;assert.deepEqual(next.executorBasis,[]);assert.equal(next.lines.length,1);
    assert.deepEqual((await f.pool.query('SELECT executor_basis FROM server_closing_month_plan_versions WHERE id=$1',[prior.versionId])).rows[0].executor_basis,prior.executorBasis);
    assert.deepEqual((await f.pool.query('SELECT * FROM production_schedule_executions WHERE assignment_id=$1',[assignment])).rows,before);
  });
  await t.test('same-color replacement, wrong color and same evidence are blocked without silent scope changes',async()=>{
    const fresh=await f.order(false),prior=(await read(fresh.id)).plan!,line=prior.lines[0],other=prior.lines[1];
    await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await sourceIntent(fresh.id)),closingCode('closing_month_no_change'));
    await observed(fresh.id,'70');
    const blue=(await read(fresh.id)).observedSource.colors.find(color=>color.quantity==='70')!;
    const old=prior.lines.find(value=>value.colorId===blue.id)!;
    await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await sourceIntent(fresh.id,{adjustments:[{lineId:old.id,quantity:'0'}],additions:[{colorId:blue.id,quantity:'70'}]})),closingCode('closing_month_source_scope_replacement_forbidden'));
    await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await sourceIntent(fresh.id,{additions:[{colorId:prior.lines.find(value=>value.colorId!==blue.id)!.colorId,quantity:'20'}]})),closingCode('closing_month_source_color_quantity_mismatch'));
    assert.notEqual(line.id,other.id);assert.equal((await read(fresh.id)).plan!.version,1);
  });
  await t.test('Source changed after preview durably rejects; two operators can consume only one version',async()=>{
    const fresh=await f.order(false);let state=await observed(fresh.id,'70');const blue=state.observedSource.colors.find(color=>color.quantity==='70')!.id;
    const stale=await prepare(await sourceIntent(fresh.id,{additions:[{colorId:blue,quantity:'20'}]}));await observed(fresh.id,'80');
    const rejected=await executeClosingMonthMove(f.pool,f.editor.actor,stale);assert.equal(rejected.status,'rejected');if(rejected.status==='rejected')assert.equal(rejected.error.code,'closing_month_source_preview_changed');
    const who=await f.user('closing.source.other',f.editor.actor.permissions),input=await sourceIntent(fresh.id,{additions:[{colorId:blue,quantity:'30'}]});
    const a=await prepare(input),b=await prepare({...input,reason:'Other explicit review'});
    const results=await Promise.all([executeClosingMonthMove(f.pool,f.editor.actor,a),executeClosingMonthMove(f.pool,who.actor,b)]);
    assert.equal(results.filter(row=>row.status==='applied').length,1);assert.equal(results.filter(row=>row.status==='rejected').length,1);state=await read(fresh.id);assert.equal(state.plan!.version,2);
    assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,stale.requestId)).state,'recorded');
  });
  await t.test('confirmed contributions remain exact; additions stay pending and reductions below frozen colors cannot pass',async()=>{
    const fresh=await f.order(true),period=await f.apply({action:'create_period',month:'2027-02',taxRatePercent:'0',taxRateConfirmed:true,remark:''});
    // All earlier test orders share this month; move them elsewhere before this
    // explicit financial adoption so their intentionally incomplete prices do not apply.
    const all=(await f.pool.query('SELECT sales_order_id::text id FROM server_closing_month_plan_heads WHERE sales_order_id<>$1',[fresh.id])).rows;
    for(const row of all){const state=await read(row.id);if(state.sourceChanged)continue;await executeClosingMonthMove(f.pool,f.editor.actor,await prepare({action:'move_months',orderId:row.id,expectedVersion:state.plan!.version,targetMonth:'2028-02',selection:{mode:'whole'},reason:'Separate synthetic freeze scope'}));}
    // Use a dedicated empty month, then freeze only the adopted order.
    await executeClosingMonthMove(f.pool,f.editor.actor,await prepare({action:'move_months',orderId:fresh.id,expectedVersion:1,targetMonth:'2027-09',selection:{mode:'whole'},reason:'Dedicated frozen Source test'}));
    const dedicated=await f.apply({action:'create_period',month:'2027-09',taxRatePercent:'0',taxRateConfirmed:true,remark:''});
    const synced=await f.apply({action:'sync_month_outputs',periodId:dedicated.result.periodId,expectedPeriodVersion:1,channels:{sales:true,work:false},reason:'Explicit source snapshot'});
    const confirmed=await f.apply({action:'confirm_period',periodId:dedicated.result.periodId,expectedPeriodVersion:synced.result.periodVersion,reason:''});
    await f.apply({action:'lock_period',periodId:dedicated.result.periodId,expectedPeriodVersion:confirmed.result.periodVersion,reason:''});
    const prior=(await read(fresh.id)).plan!,frozen=(await f.pool.query('SELECT * FROM server_closing_period_versions WHERE period_id=$1 ORDER BY version',[dedicated.result.periodId])).rows;
    let state=await observed(fresh.id,'70');const blue=state.observedSource.colors.find(color=>color.quantity==='70')!.id;
    const added=await executeClosingMonthMove(f.pool,f.editor.actor,await prepare(await sourceIntent(fresh.id,{additions:[{colorId:blue,quantity:'20'}]})));assert.equal(added.status,'applied');
    for(const old of prior.lines)assert.deepEqual((await read(fresh.id)).plan!.lines.find(row=>row.id===old.id),old);
    state=await observed(fresh.id,'40');const now=state.plan!,pending=now.lines.find(line=>line.month===null)!;
    await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await sourceIntent(fresh.id,{adjustments:[{lineId:pending.id,quantity:'0'},{lineId:prior.lines.find(line=>line.colorId===blue)!.id,quantity:'40'}]})),closingCode('closing_month_period_not_open'));
    assert.deepEqual((await f.pool.query('SELECT * FROM server_closing_period_versions WHERE period_id=$1 ORDER BY version',[dedicated.result.periodId])).rows,frozen);assert.equal(period.result.periodStatus,'open');
  });
  await t.test('auditing failure rolls back Source/version/head/receipt; unknown COMMIT recovers original result',async()=>{
    const fresh=await f.order(false);let state=await observed(fresh.id,'70');const blue=state.observedSource.colors.find(color=>color.quantity==='70')!.id;
    const command=await prepare(await sourceIntent(fresh.id,{additions:[{colorId:blue,quantity:'20'}]}));
    function controlled(mode:'audit'|'commit') {let armed=true;return new Proxy(f.pool,{get(target,key){if(key!=='connect'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
      return async()=>{const connection=await target.connect();return new Proxy(connection,{get(target,key){if(key!=='query'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
        return async(sql:string,...values:unknown[])=>{if(mode==='audit'&&sql.includes('INSERT INTO operation_logs'))throw Error('Synthetic Source audit failure');
          const result=await Reflect.apply(target.query,target,[sql,...values]);if(mode==='commit'&&sql==='COMMIT'&&armed){armed=false;throw Error('Synthetic Source acknowledgement loss');}return result;};}});};}}) as pg.Pool;}
    await assert.rejects(executeClosingMonthMove(controlled('audit'),f.editor.actor,command),/Synthetic Source audit failure/);
    assert.equal((await read(fresh.id)).plan!.version,1);assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,command.requestId)).state,'unknown');
    assert.equal((await executeClosingMonthMove(controlled('commit'),f.editor.actor,command)).status,'unverified');
    const receipt=await readClosingMonthReceipt(f.pool,f.editor.actor,command.requestId);assert.equal(receipt.state,'recorded');if(receipt.state==='recorded')assert.equal(receipt.result.status,'applied');
    const replay=await executeClosingMonthMove(f.pool,f.editor.actor,command);assert('replayed'in replay&&replay.replayed);state=await read(fresh.id);assert.equal(state.plan!.version,2);
  });
  await t.test('SQL rejects inferred month/executor, increased old lines, replaced identities and non-deterministic original commands',async()=>{
    const fresh=await f.order(false),state=await observed(fresh.id,'70'),blue=state.observedSource.colors.find(color=>color.quantity==='70')!.id;
    const input=await sourceIntent(fresh.id,{additions:[{colorId:blue,quantity:'20'}]}),p=await previewClosingMonthMove(f.pool,f.editor.actor,input),prior=state.plan!,added=p.after.find(line=>!prior.lines.some(old=>old.id===line.id))!;
    const variants=[
      {lines:p.after.map(line=>line.id===added.id?{...line,month:'2027-10'}:line)},
      {lines:p.after.map(line=>line.id===added.id?{...line,assignmentId:randomUUID()}:line)},
      {lines:p.after.filter(line=>line.id!==added.id).map(line=>line.colorId===blue?{...line,quantity:'70'}:line)},
      {lines:p.after.map(line=>line.id===added.id?{...line,id:randomUUID()}:line)},
      {lines:p.after,sourceObservation:null},
      {lines:p.after.filter(line=>line.colorId!==blue).concat({...added,quantity:'70'}),intent:{...input,adjustments:[{lineId:prior.lines.find(line=>line.colorId===blue)!.id,quantity:'0'}],additions:[{colorId:blue,quantity:'70'}]}},
    ];
    const connection=await f.pool.connect();
    try{for(const variant of variants){await connection.query('BEGIN');await connection.query("SELECT set_config('zhixu.closing_month_command','on',true)");
      await assert.rejects(async()=>{
        const requestId=randomUUID(),operationId='closing-month:'+f.editor.actor.userId+':'+requestId;
        const row=(await connection.query(`INSERT INTO server_closing_month_plan_versions(sales_order_id,version,source_quantity,quantity_state,source_fingerprint,lines,action,reason,actor_id,request_id,operation_id,executor_basis,source_observation)
          VALUES($1,$2,$3,'ready',$4,$5,'reconcile_source',$6,$7,$8,$9,'[]',$10) RETURNING id::text`,[fresh.id,prior.version+1,state.observedSource.quantity,state.observedSource.fingerprint,JSON.stringify(variant.lines),input.reason,f.editor.actor.internalUserId,requestId,operationId,
            JSON.stringify('sourceObservation'in variant?variant.sourceObservation:state.observedSource)])).rows[0];
        await connection.query('UPDATE server_closing_month_plan_heads SET current_version_id=$2,version=version+1 WHERE sales_order_id=$1',[fresh.id,row.id]);
        const command={requestId,intent:'intent'in variant?variant.intent:input,previewHash:p.previewHash},result={requestId,status:'applied',orderId:fresh.id,version:prior.version+1,versionId:row.id,operationId};
        await connection.query('INSERT INTO server_closing_month_commands(actor_id,request_id,payload_hash,command,result) VALUES($1,$2,$3,$4,$5)',[f.editor.actor.internalUserId,requestId,'0'.repeat(64),JSON.stringify(command),JSON.stringify(result)]);
        await connection.query('SET CONSTRAINTS ALL IMMEDIATE');
      },error=>['23514','23503'].includes((error as {code:string}).code));await connection.query('ROLLBACK');
    }}finally{await connection.query('ROLLBACK').catch(()=>undefined);connection.release();}
    assert.equal((await read(fresh.id)).plan!.version,1);
  });
  await t.test('fresh RBAC protects Source writes but original receipt remains readable after edit removal',async()=>{
    const viewer=await f.user('closing.source.viewer',CLOSING_READ_PERMISSIONS),state=await read();
    await assert.rejects(previewClosingMonthMove(f.pool,viewer.actor,await sourceIntent(order.id)),closingCode('permission_denied'));
    await f.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.edit'",[f.editor.role]);
    assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,original.requestId)).state,'recorded');
    await assert.rejects(executeClosingMonthMove(f.pool,f.editor.actor,original),closingCode('permission_denied'));
    assert.equal(state.plan!.sourceQuantity,'120');
  });
  assert.deepEqual(f.errors,[]);
});

test('owned 0049 upgrade: old month versions and original receipts retain bytes while Source review waits for 0050', {timeout:120000},async t=>{
  const f=await closingFixture(t,49),order=await f.order(false),read=()=>readOrderClosingMonthPlan(f.pool,f.editor.actor,order.id);
  const initial=(await read()).plan!,intent:ClosingMonthIntent={action:'move_months',orderId:order.id,expectedVersion:1,targetMonth:'2027-05',selection:{mode:'whole'},reason:'Original pre-0050 month ownership'};
  const p=await previewClosingMonthMove(f.pool,f.editor.actor,intent),command={requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash};
  assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,command)).status,'applied');
  const old=(await f.pool.query('SELECT to_jsonb(v) AS row FROM server_closing_month_plan_versions v WHERE sales_order_id=$1 ORDER BY version',[order.id])).rows;
  await f.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=120 WHERE sales_order_id=$1',[order.id]);
  await f.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=70 WHERE sales_order_id=$1 AND color_name='Blue'",[order.id]);
  const state=await read(),blue=state.observedSource.colors.find(color=>color.quantity==='70')!.id,reconcile:ClosingSourceReconciliation={action:'reconcile_source',orderId:order.id,expectedVersion:2,
    observedSourceFingerprint:state.observedSource.fingerprint,reason:'Explicit forward upgrade review',adjustments:[],additions:[{colorId:blue,quantity:'20'}]};
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,reconcile),closingCode('closing_source_reconciliation_schema_unavailable'));
  await runMigrations(f.pool,resolve('database/migrations'));
  assert.deepEqual((await f.pool.query("SELECT to_jsonb(v)-'source_observation' AS row FROM server_closing_month_plan_versions v WHERE sales_order_id=$1 ORDER BY version",[order.id])).rows,old);
  assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,command.requestId)).state,'recorded');
  const next=await previewClosingMonthMove(f.pool,f.editor.actor,reconcile);assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,{requestId:randomUUID(),intent:next.intent,previewHash:next.previewHash})).status,'applied');
  const final=(await read()).plan!;assert.equal(final.defaultMonth,initial.defaultMonth);assert.equal(final.sourceQuantity,'120');assert.equal(final.version,3);
});

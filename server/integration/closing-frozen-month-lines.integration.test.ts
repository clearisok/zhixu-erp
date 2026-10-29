import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closingFixture } from './closing-fixture.js';
import { readOrderClosingMonthPlan, previewClosingMonthMove, executeClosingMonthMove } from '../closing/month-plan-service.js';
import { readClosingPeriodDetail } from '../closing/read-service.js';
import type { ClosingMonthIntent } from '../closing/month-plan-model.js';
import { resolve } from 'node:path';
import { runMigrations } from '../db/migration-runner.js';

test('owned PostgreSQL: moving another month preserves repeated matched lines in confirmed and locked months', { timeout: 180000 }, async t => {
  const f=await closingFixture(t,50),order=await f.order(),read=async()=>(await readOrderClosingMonthPlan(f.pool,f.editor.actor,order.id)).plan!;
  const blue=order.basis.priceLines.find(row=>row.colorName==='Blue')!.colorId,white=order.basis.priceLines.find(row=>row.colorName==='White')!.colorId;
  const move=async(intent:ClosingMonthIntent)=>{const preview=await previewClosingMonthMove(f.pool,f.editor.actor,intent);
    assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,{requestId:randomUUID(),intent:preview.intent,previewHash:preview.previewHash})).status,'applied');};
  // Move white first: a later move must not normalize the duplicate blue pieces
  // that are legitimately created by two separate executor-matching commands.
  let p=await read();
  await move({action:'move_months',orderId:order.id,expectedVersion:p.version,targetMonth:'2027-03',reason:'Synthetic white month',
    selection:{mode:'partial',items:[{lineId:p.lines.find(row=>row.colorId===white)!.id,quantity:'50'}]}});
  const assignment=await f.assignment(order.id,blue);
  for(const [amount,remainder] of [['25','25'],['5','20']]){
    p=await read();const line=p.lines.find(row=>row.colorId===blue&&row.assignmentId===null)!;
    await move({action:'match_executors',orderId:order.id,expectedVersion:p.version,reason:'Synthetic repeated match',
      items:[{lineId:line.id,parts:[{assignmentId:assignment,quantity:amount},{assignmentId:null,quantity:remainder}]}]});
  }
  const original=await read(),frozen=original.lines.filter(row=>row.month==='2027-02');
  assert.equal(frozen.filter(row=>row.assignmentId===assignment).length,2);
  const period=await f.apply({action:'create_period',month:'2027-02',taxRatePercent:'0',taxRateConfirmed:true,remark:''}),periodId=period.result.periodId;
  const adopted=await f.apply({action:'sync_month_outputs',periodId,expectedPeriodVersion:1,channels:{sales:true,work:false},reason:'Synthetic frozen evidence'});
  await f.apply({action:'confirm_period',periodId,expectedPeriodVersion:adopted.result.periodVersion,reason:''});
  const retainedTables=['server_closing_month_plans','server_closing_month_plan_versions','server_closing_month_plan_heads','server_closing_month_commands',
    'server_closing_periods','server_closing_period_heads','server_closing_period_versions','server_closing_allocations','server_closing_allocation_heads',
    'server_closing_allocation_versions','server_closing_month_financial_links'];
  const history=async()=>Promise.all(retainedTables.map(async table=>(await f.pool.query(`SELECT to_jsonb(r) AS row FROM ${table} r ORDER BY to_jsonb(r)::text`)).rows));
  const beforeUpgrade=await history(),oldMigrations=(await f.pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n;
  await runMigrations(f.pool,resolve('database/migrations'));
  assert.deepEqual(await history(),beforeUpgrade);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,oldMigrations+1);
  assert.equal((await f.pool.query('SELECT filename FROM schema_migrations WHERE version=51')).rows[0].filename,'0051_closing_frozen_month_lines.sql');
  const rejectFrozenSql=async(versionId:string,lines:unknown)=>{
    const owned=await f.pool.connect();
    try{
      await owned.query('BEGIN');await owned.query("SELECT set_config('zhixu.closing_month_command','on',true)");
      await assert.rejects(owned.query(`INSERT INTO server_closing_month_plan_versions(sales_order_id,version,source_quantity,quantity_state,source_fingerprint,lines,action,reason,actor_id,request_id,operation_id,executor_basis)
        SELECT sales_order_id,version+1,source_quantity,quantity_state,source_fingerprint,$2,'move_months','Synthetic bypass',$3,$4,$5,executor_basis
        FROM server_closing_month_plan_versions WHERE id=$1`,[versionId,JSON.stringify(lines),f.editor.actor.internalUserId,randomUUID(),'synthetic-frozen-bypass:'+randomUUID()]),
        {code:'23514',message:'Frozen closing month lines must remain exact'});
    }finally{await owned.query('ROLLBACK');owned.release();}
  };
  for(const [status,from,to] of [['confirmed','2027-03','2027-04'],['locked','2027-04','2027-05']] as const){
    const beforePeriod=await readClosingPeriodDetail(f.pool,f.editor.actor,periodId),beforeVersions=(await f.pool.query('SELECT * FROM server_closing_allocation_versions ORDER BY id')).rows;
    assert.equal(beforePeriod.period.status,status);p=await read();
    await rejectFrozenSql(p.versionId,p.lines.map(row=>row.id===frozen[0].id?{...row,id:randomUUID()}:row));
    await move({action:'move_months',orderId:order.id,expectedVersion:p.version,targetMonth:to,reason:'Synthetic unrelated month move',
      selection:{mode:'partial',items:[{lineId:p.lines.find(row=>row.colorId===white&&row.month===from)!.id,quantity:'50'}]}});
    assert.deepEqual((await read()).lines.filter(row=>row.month==='2027-02'),frozen);
    assert.deepEqual(await readClosingPeriodDetail(f.pool,f.editor.actor,periodId),beforePeriod);
    assert.deepEqual((await f.pool.query('SELECT * FROM server_closing_allocation_versions ORDER BY id')).rows,beforeVersions);
    if(status==='confirmed')await f.apply({action:'lock_period',periodId,expectedPeriodVersion:beforePeriod.period.version,reason:''});
  }
  p=await read();const matched=p.lines.filter(row=>row.month==='2027-02'&&row.assignmentId===assignment),open=p.lines.find(row=>row.colorId===white)!;
  const attempts=[
    p.lines.map(row=>row.id===matched[0].id?{...row,id:randomUUID()}:row),
    p.lines.filter(row=>row.id!==matched[1].id).map(row=>row.id===matched[0].id?{...row,quantity:'30'}:row),
    [...p.lines.map(row=>row.id===open.id?{...row,quantity:'49'}:row),{...open,id:randomUUID(),month:'2027-02',quantity:'1'}],
  ];
  for(const lines of attempts)await rejectFrozenSql(p.versionId,lines);
  assert.equal((await read()).version,p.version);
  const locked=await readClosingPeriodDetail(f.pool,f.editor.actor,periodId);
  const originalManifest=(await f.pool.query('SELECT allocation_manifest FROM server_closing_period_versions WHERE period_id=$1 AND version=$2',[periodId,locked.period.version])).rows[0].allocation_manifest;
  await f.apply({action:'reopen_period',periodId,expectedPeriodVersion:locked.period.version,reason:'Synthetic explicit reopening'});
  await move({action:'move_months',orderId:order.id,expectedVersion:p.version,targetMonth:'2027-06',reason:'Synthetic allowed after reopening',
    selection:{mode:'partial',items:[{lineId:matched[0].id,quantity:'1'}]}});
  assert((await read()).lines.some(row=>row.month==='2027-06'&&row.quantity==='1'));
  const preserved=(await f.pool.query('SELECT allocation_manifest FROM server_closing_period_versions WHERE period_id=$1 AND version=$2',[periodId,locked.period.version])).rows[0].allocation_manifest;
  assert.deepEqual(preserved,originalManifest);
  assert.deepEqual(f.errors,[]);
});

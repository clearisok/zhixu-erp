import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { closingFixture } from './closing-fixture.js';
import { planHash } from '../production-scheduling/repository.js';
import { readClosingYear } from '../closing/annual-service.js';
import { readOrderClosingMonthPlan, previewClosingMonthMove, executeClosingMonthMove } from '../closing/month-plan-service.js';
import { CLOSING_READ_PERMISSIONS } from '../closing/contract.js';

test('owned PostgreSQL: annual resource budget is global, weighted, permission-safe and before complete facts', { timeout: 180000 }, async t => {
  const f=await closingFixture(t),a=await f.order(false),b=await f.order(false),original=await f.assignment(a.id,null);
  const facts=(await f.pool.query(`SELECT s.facts FROM production_schedule_assignments a JOIN production_schedule_resource_snapshots s
    ON s.hash=a.resource_snapshot_hash WHERE a.id=$1`,[original])).rows[0].facts;
  const large={...facts,syntheticBudgetEvidence:'x'.repeat(900000)},hash=planHash(large);
  await f.pool.query('INSERT INTO production_schedule_resource_snapshots(hash,facts) VALUES($1,$2)',[hash,JSON.stringify(large)]);
  const bytes=(await f.pool.query('SELECT octet_length(facts::text)::int AS bytes FROM production_schedule_resource_snapshots WHERE hash=$1',[hash])).rows[0].bytes;
  assert(bytes<1048576);assert(bytes*9<8*1024*1024);assert(bytes*12>8*1024*1024);
  async function copies(orderId:string,count:number){
    const owned=await f.pool.connect();
    try{
      await owned.query('BEGIN');
      await owned.query(`WITH inserted AS (INSERT INTO production_schedule_assignments
        SELECT copied.* FROM production_schedule_assignments a CROSS JOIN unnest($3::uuid[]) n(id)
        CROSS JOIN LATERAL jsonb_populate_record(NULL::production_schedule_assignments,
          to_jsonb(a)||jsonb_build_object('id',n.id,'resource_snapshot_hash',$2::text,'sales_order_id',$4::uuid)) copied WHERE a.id=$1 RETURNING *)
        INSERT INTO production_schedule_plan_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
        SELECT id,sales_order_id,version,production_plan_row_snapshot(inserted),created_by,gen_random_uuid(),'synthetic-year-budget:'||id::text,'' FROM inserted`,
        [original,hash,Array.from({length:count},()=>randomUUID()),orderId]);
      await owned.query('COMMIT');
    }catch(error){await owned.query('ROLLBACK');throw error;}finally{owned.release();}
  }
  await copies(a.id,3);await copies(b.id,1);
  const queries:string[]=[],traced={connect:async()=>{
    const owned=await f.pool.connect();return new Proxy(owned,{get(target,key,receiver){
      if(key==='query')return async(...args:unknown[])=>{if(typeof args[0]==='string')queries.push(args[0]);return Reflect.apply(target.query,target,args);};
      const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;
    }});
  }} as unknown as Pool;
  const query=(search='')=>new URLSearchParams({year:'2027',...(search?{search}:{})});
  const single=await readClosingYear(traced,f.editor.actor,query(a.basis.order.orderNo));
  assert(single.items.every(row=>row.order.id===a.id));assert.equal(queries.filter(sql=>sql.includes('s.facts AS "resourceFacts"')).length,3);
  queries.length=0;
  await assert.rejects(readClosingYear(traced,f.editor.actor,query()),{status:422,code:'closing_year_resource_limit'});
  assert(queries.some(sql=>sql.includes('sum(octet_length(s.facts::text))')));
  assert.equal(queries.some(sql=>sql.includes('s.facts AS "resourceFacts"')),false);assert.equal(queries.at(-1),'ROLLBACK');
  const reader=await f.user('year.budget.reader',CLOSING_READ_PERMISSIONS);
  const rejected=await f.request('/year?year=2027',undefined,reader.cookie);assert.equal(rejected.response.status,422);
  assert.equal(rejected.body.error.code,'closing_year_resource_limit');assert.equal(JSON.stringify(rejected.body).includes('snapshot'),false);
  const frozen=await f.order(),p=(await readOrderClosingMonthPlan(f.pool,f.editor.actor,frozen.id)).plan!;
  const move=await previewClosingMonthMove(f.pool,f.editor.actor,{action:'move_months',orderId:frozen.id,expectedVersion:p.version,
    targetMonth:'2027-12',reason:'Synthetic frozen-only year budget',selection:{mode:'whole'}});
  assert.equal((await executeClosingMonthMove(f.pool,f.editor.actor,{requestId:randomUUID(),intent:move.intent,previewHash:move.previewHash})).status,'applied');
  const period=await f.apply({action:'create_period',month:'2027-12',taxRatePercent:'0',taxRateConfirmed:true,remark:''}),periodId=period.result.periodId;
  const sync=await f.apply({action:'sync_month_outputs',periodId,expectedPeriodVersion:1,channels:{sales:true,work:false},reason:'Synthetic freeze'});
  const confirmed=await f.apply({action:'confirm_period',periodId,expectedPeriodVersion:sync.result.periodVersion,reason:''});
  await f.apply({action:'lock_period',periodId,expectedPeriodVersion:confirmed.result.periodVersion,reason:''});await copies(frozen.id,4);
  queries.length=0;const preserved=await readClosingYear(traced,f.editor.actor,query(frozen.basis.order.orderNo));
  assert(preserved.items.every(row=>row.basis.kind==='frozen_financial_snapshot'));assert.equal(queries.filter(sql=>sql.includes('s.facts AS "resourceFacts"')).length,2);
  assert.equal(preserved.months[11].garmentSalesCny.visibility,'allowed');
  await f.pool.query('DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key=$2',[reader.role,CLOSING_READ_PERMISSIONS[0]]);
  queries.length=0;await assert.rejects(readClosingYear(traced,reader.actor,query()),{status:403});
  assert.equal(queries.some(sql=>sql.includes('sum(octet_length(s.facts::text))')),false);
  assert.deepEqual(f.errors,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type pg from 'pg';
import { closingFixture, closingCode } from './closing-fixture.js';
import { runMigrations } from '../db/migration-runner.js';
import { planHash } from '../production-scheduling/repository.js';
import { readOrderClosingMonthPlan, previewClosingMonthMove, executeClosingMonthMove, readClosingMonthReceipt } from '../closing/month-plan-service.js';
import { sumMonthQuantities, type ClosingMonthMove } from '../closing/month-plan-model.js';
import { CLOSING_READ_PERMISSIONS } from '../closing/contract.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';

test('owned PostgreSQL: new SO month ownership and atomic moves', {timeout:120000}, async t=>{
 const f=await closingFixture(t),order=await f.order(false);
 const read=async(id=order.id)=>(await readOrderClosingMonthPlan(f.pool,f.editor.actor,id)).plan!;
 const make=async(intent:ClosingMonthMove)=>{const p=await previewClosingMonthMove(f.pool,f.editor.actor,intent);return {requestId:randomUUID(),intent:p.intent,previewHash:p.previewHash};};
 const whole=async(targetMonth:string,id=order.id):Promise<ClosingMonthMove>=>({action:'move_months',orderId:id,expectedVersion:(await read(id)).version,targetMonth,reason:'Synthetic month adjustment',selection:{mode:'whole'}});
 const baseline=(await f.pool.query('SELECT source_hash,quantity::text FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1',[order.id])).rows[0];
 await t.test('new contract initializes all colored quantity without price or tax',async()=>{
  const p=await read();assert.equal(p.defaultMonth,'2027-02');assert.equal(p.sourceQuantity,'100');assert.equal(p.lines.length,2);
  assert(p.lines.every(line=>line.month==='2027-02'&&line.colorId!==null&&line.assignmentId===null));
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM sales_order_commercial_versions WHERE sales_order_id=$1',[order.id])).rows[0].n,0);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM server_closing_periods')).rows[0].n,0);
 });
 let firstCommand:Awaited<ReturnType<typeof make>>;
 await t.test('partial move, replay and lost-result receipt conserve quantity',async()=>{
  const p=await read(),line=p.lines[0];
  firstCommand=await make({action:'move_months',orderId:order.id,expectedVersion:p.version,targetMonth:'2026-11',reason:'Move ten pieces',selection:{mode:'partial',items:[{lineId:line.id,quantity:'10'}]}});
  const result=await executeClosingMonthMove(f.pool,f.editor.actor,firstCommand);assert.equal(result.status,'applied');
  const replay=await executeClosingMonthMove(f.pool,f.editor.actor,firstCommand);assert('replayed' in replay&&replay.replayed);
  const receipt=await readClosingMonthReceipt(f.pool,f.editor.actor,firstCommand.requestId);assert.equal(receipt.state,'recorded');
  if(receipt.state==='recorded')assert.equal(receipt.commandHash,planHash(firstCommand));
  const next=await read();assert.equal(next.version,2);assert.equal(sumMonthQuantities(next.lines),'100');assert.equal(next.defaultMonth,'2027-02');
  assert.equal(sumMonthQuantities(next.lines.filter(line=>line.month==='2026-11')),'10');
  await assert.rejects(executeClosingMonthMove(f.pool,f.editor.actor,{...firstCommand,intent:{...firstCommand.intent,reason:'Changed retry'}}),closingCode('closing_month_request_conflict'));
 });
 await t.test('two same-version concurrent moves apply once and durably reject the loser',async()=>{
  const intent=await whole('2026-12'),a=await make(intent),b=await make({...intent,reason:'Another operator'});
  const result=await Promise.all([executeClosingMonthMove(f.pool,f.editor.actor,a),executeClosingMonthMove(f.pool,f.editor.actor,b)]);
  assert.equal(result.filter(x=>x.status==='applied').length,1);assert.equal(result.filter(x=>x.status==='rejected').length,1);
  const p=await read();assert.equal(p.version,3);assert.equal(p.lines.length,2);assert(p.lines.every(x=>x.month==='2026-12'));
 });
 await t.test('a period created after preview invalidates it without consuming quantity',async()=>{
  const command=await make(await whole('2026-10'));
  await f.apply({action:'create_period',month:'2026-10',taxRatePercent:'0',taxRateConfirmed:true,remark:''});
  const result=await executeClosingMonthMove(f.pool,f.editor.actor,command);assert.equal(result.status,'rejected');
  if(result.status==='rejected')assert.equal(result.error.code,'closing_month_preview_changed');
  assert.equal((await read()).version,3);
  const replay=await executeClosingMonthMove(f.pool,f.editor.actor,command);assert('replayed' in replay&&replay.replayed);
 });
 await t.test('confirmed/locked sources and targets block moves; new SO still initializes pending',async()=>{
  await f.adopt(order.id);
  const source=await f.apply({action:'create_period',month:'2026-12',taxRatePercent:'0',taxRateConfirmed:true,remark:''});
  const adopted=await f.apply({action:'sync_month_outputs',periodId:source.result.periodId,expectedPeriodVersion:source.result.periodVersion,channels:{sales:true,work:false},reason:'Explicit sales basis before freeze'});
  const frozen=await f.apply({action:'confirm_period',periodId:source.result.periodId,expectedPeriodVersion:adopted.result.periodVersion,reason:''});
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await whole('2027-03')),closingCode('closing_month_period_not_open'));
  await f.apply({action:'unconfirm_period',periodId:source.result.periodId,expectedPeriodVersion:frozen.result.periodVersion,reason:'Synthetic correction'});
  const created=await f.apply({action:'create_period',month:'2027-02',taxRatePercent:'13',taxRateConfirmed:true,remark:''});
  const confirmed=await f.apply({action:'confirm_period',periodId:created.result.periodId,expectedPeriodVersion:created.result.periodVersion,reason:''});
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await whole('2027-02')),closingCode('closing_month_period_not_open'));
  await f.apply({action:'lock_period',periodId:confirmed.result.periodId,expectedPeriodVersion:confirmed.result.periodVersion,reason:''});
  const fresh=await f.order(false),p=await read(fresh.id);assert.equal(p.defaultMonth,'2027-02');assert(p.lines.every(x=>x.month===null));
  const moved=await executeClosingMonthMove(f.pool,f.editor.actor,await make(await whole('2027-03',fresh.id)));assert.equal(moved.status,'applied');
 });
 await t.test('a lost COMMIT acknowledgement is recovered from the original receipt without another version',async()=>{
  const command=await make(await whole('2026-09'));let armed=true;
  const controlled=new Proxy(f.pool,{get(target,key){if(key!=='connect'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
   return async()=>{const connection=await target.connect();return new Proxy(connection,{get(target,key){if(key!=='query'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
    return async(sql:string,...values:unknown[])=>{const result=await Reflect.apply(target.query,target,[sql,...values]);if(sql==='COMMIT'&&armed){armed=false;throw Error('Synthetic lost month acknowledgement');}return result;};}});};}}) as pg.Pool;
  const prior=(await read()).version,result=await executeClosingMonthMove(controlled,f.editor.actor,command);assert.equal(result.status,'unverified');
  const receipt=await readClosingMonthReceipt(f.pool,f.editor.actor,command.requestId);assert.equal(receipt.state,'recorded');
  if(receipt.state==='recorded')assert.equal(receipt.result.status,'applied');
  assert.equal((await read()).version,prior+1);const replay=await executeClosingMonthMove(f.pool,f.editor.actor,command);assert('replayed' in replay&&replay.replayed);
  assert.equal((await read()).version,prior+1);
 });
 await t.test('new SO initialization uses the same database fence as period transitions',async()=>{
  const holder=await f.pool.connect();let pending:ReturnType<typeof f.order>|null=null;
  try{
   await holder.query('BEGIN');await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('production-planning-write-v1',0))");
   const pid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;pending=f.order(false);
   const deadline=Date.now()+3000;let waiting=false;
   while(Date.now()<deadline){waiting=(await f.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='synthetic-closing-commands' AND wait_event_type='Lock' AND $1::int=ANY(pg_blocking_pids(pid))) waiting",[pid])).rows[0].waiting;
    if(waiting)break;await new Promise(done=>setTimeout(done,20));}
   assert.equal(waiting,true,'Observe a real blocked writer, not a timing assumption');
  }finally{await holder.query('ROLLBACK');holder.release();}
  assert(pending);const fresh=await pending;assert.equal((await read(fresh.id)).version,1);
 });
 await t.test('the complete persisted JSON budget rejects a growing split with a durable 422 receipt',async()=>{
  const sample={id:randomUUID(),colorId:randomUUID(),assignmentId:null,month:'2028-01',quantity:'2'};
  const size=(await f.pool.query('SELECT octet_length($1::jsonb::text)::int n',[JSON.stringify(sample)])).rows[0].n;
  const count=Math.floor(262144/(size+2))-1;assert(count>100&&count<2000);
  const id=(await createAinuokeSalesOrder(f.pool,f.editor.actor,{source:{sourceId:'SYN-MONTH-BUDGET',sourceRowIdentity:'budget',salesContractNo:'SYN-MONTH-BUDGET',
   insideOrderNo:'SYN-MONTH-BUDGET',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2028-01-01',styleNo:'SYN-BUDGET',
   companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:count*2,sourceHash:'budget',fetchedAt:'2026-10-26T00:00:00Z'},
   colors:Array.from({length:count},(_,i)=>({sourceLineIdentity:'budget-'+i,colorName:'Budget '+i,quantity:2,deliveryDate:null,sourceHash:'budget-'+i}))})).salesOrder.id;
  const p=await read(id);assert.equal(p.lines.length,count);
  const intent:ClosingMonthMove={action:'move_months',orderId:id,expectedVersion:1,targetMonth:'2028-02',reason:'Synthetic capacity boundary',
   selection:{mode:'partial',items:p.lines.slice(0,100).map(line=>({lineId:line.id,quantity:'1'}))}};
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,intent),closingCode('closing_month_plan_too_large'));
  const command={requestId:randomUUID(),intent,previewHash:'0'.repeat(64)},result=await executeClosingMonthMove(f.pool,f.editor.actor,command);
  assert.equal(result.status,'rejected');if(result.status==='rejected')assert.deepEqual(result.error,{status:422,code:'closing_month_plan_too_large'});
  assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,command.requestId)).state,'recorded');assert.equal((await read(id)).version,1);
 });
 await t.test('processing batch with no delivery has unpriced pending month, not fake current month',async()=>{
  const processing=await f.processing('USD'),p=await read(processing.id);
  assert.equal(p.defaultMonth,null);assert.equal(p.sourceQuantity,'10');assert.equal(p.lines.length,1);assert.equal(p.lines[0].colorId,null);assert.equal(p.lines[0].month,null);
 });
 await t.test('previously valid Source precision and range never become SO creation restrictions',async()=>{
  for(const [name,quantity,colors] of [
   ['tiny',0.0000001,[]],['large',1000000000000,[]],
   ['colors',100,[{sourceLineIdentity:'fine',colorName:'Fine',quantity:0.0000001,deliveryDate:null,sourceHash:'fine'},{sourceLineIdentity:'rest',colorName:'Rest',quantity:99.9999999,deliveryDate:null,sourceHash:'rest'}]]
  ] as const){
   const id=(await createAinuokeSalesOrder(f.pool,f.editor.actor,{source:{sourceId:'SYN-PRECISION-'+name,sourceRowIdentity:name,salesContractNo:'SYN-PRECISION-'+name,
    insideOrderNo:'SYN-PRECISION',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2028-01-01',styleNo:'SYN-PRECISION',
    companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity,sourceHash:name,fetchedAt:'2026-10-26T00:00:00Z'},colors})).salesOrder.id;
   const p=await read(id);assert.equal(p.sourceQuantity,(await f.pool.query('SELECT quantity::text n FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1',[id])).rows[0].n);
   if(name==='colors'){
    assert.equal(p.quantityState,'ready');assert.equal(p.lines.length,1);assert.equal(p.lines[0].colorId,null);assert.equal(p.lines[0].quantity,'100');
    assert.deepEqual((await f.pool.query('SELECT quantity::text n FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 ORDER BY quantity',[id])).rows.map(x=>x.n),['0.0000001','99.9999999']);
   }else{assert.equal(p.quantityState,'unsupported');assert.deepEqual(p.lines,[]);
    await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,{action:'move_months',orderId:id,expectedVersion:1,targetMonth:'2028-02',reason:'No rounding',selection:{mode:'whole'}}),closingCode('closing_month_quantity_unrepresentable'));}
  }
 });
 await t.test('fresh permission checks reject forged grants; write removal keeps receipt readable',async()=>{
  const viewer=await f.user('month.viewer',CLOSING_READ_PERMISSIONS);
  assert((await readOrderClosingMonthPlan(f.pool,viewer.actor,order.id)).plan);
  await assert.rejects(previewClosingMonthMove(f.pool,viewer.actor,await whole('2027-03')),closingCode('permission_denied'));
  await f.pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='closing.edit'",[f.editor.role]);
  assert.equal((await readClosingMonthReceipt(f.pool,f.editor.actor,firstCommand.requestId)).state,'recorded');
  await assert.rejects(executeClosingMonthMove(f.pool,f.editor.actor,firstCommand),closingCode('permission_denied'));
  await f.pool.query("INSERT INTO app_role_permissions VALUES($1,'closing.edit')",[f.editor.role]);
 });
 await t.test('SQL enforces conservation, scope identity and immutable history',async()=>{
  const p=await read(),client=await f.pool.connect();
  try{
   for(const lines of [p.lines.map((x,i)=>i?x:{...x,quantity:'51'}),p.lines.map(x=>({...x,colorId:p.lines[0].colorId}))]){
    await client.query('BEGIN');await client.query("SELECT set_config('zhixu.closing_month_command','on',true)");
    await assert.rejects(client.query(`INSERT INTO server_closing_month_plan_versions(sales_order_id,version,source_quantity,quantity_state,source_fingerprint,lines,action,reason,actor_id,request_id,operation_id)
     VALUES($1,$2,$3,'ready',$4,$5,'move_months','',$6,$7,'synthetic-corruption')`,[order.id,p.version+1,p.sourceQuantity,p.sourceFingerprint,JSON.stringify(lines),f.editor.actor.internalUserId,randomUUID()]),error=>(error as {code:string}).code==='23514');
    await client.query('ROLLBACK');
   }
   await assert.rejects(client.query('UPDATE server_closing_month_plan_versions SET reason=$1 WHERE id=$2',['bad',p.versionId]),error=>(error as {code:string}).code==='23514');
  }finally{await client.query('ROLLBACK').catch(()=>undefined);client.release();}
 });
 await t.test('source quantity change becomes explicit conflict, not silently redistributed',async()=>{
  assert.deepEqual((await f.pool.query('SELECT source_hash,quantity::text FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1',[order.id])).rows[0],baseline);
  await f.pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=101 WHERE sales_order_id=$1',[order.id]);
  assert.equal((await readOrderClosingMonthPlan(f.pool,f.editor.actor,order.id)).sourceChanged,true);
  await assert.rejects(previewClosingMonthMove(f.pool,f.editor.actor,await whole('2027-03')),closingCode('closing_month_source_changed'));
  assert.equal(sumMonthQuantities((await read()).lines),'100');
 });
 assert.deepEqual(f.errors,[]);
});

test('0045 nonempty upgrade preserves SO and does not backfill month plans',{timeout:120000},async t=>{
 const f=await closingFixture(t,45),old=await f.order(false);
 const before=(await f.pool.query('SELECT * FROM sales_orders WHERE id=$1',[old.id])).rows[0];
 await runMigrations(f.pool,resolve('database/migrations'));
 assert.deepEqual((await f.pool.query('SELECT * FROM sales_orders WHERE id=$1',[old.id])).rows[0],before);
 assert.equal((await readOrderClosingMonthPlan(f.pool,f.editor.actor,old.id)).plan,null);
 const fresh=await f.order(false);assert.equal((await readOrderClosingMonthPlan(f.pool,f.editor.actor,fresh.id)).plan?.version,1);
});

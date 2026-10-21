import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {readFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {migrationFilesAfter} from './current-migration-ledger-fixture.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders,previewBindings} from '../ainuoke-source/binding.js';
import {bindingBundle} from './ainuoke-binding-fixture.js';
import {previewBoundOrderRefresh,applyBoundOrderRefresh,readBoundOrderRefreshReceipt} from '../ainuoke-source/bound-order-refresh.js';
import {readDeliveryPlanSet} from '../sales-orders/delivery-plan-repository.js';
import {updateDeliveryPlans} from '../sales-orders/delivery-plan-service.js';
import {readStableOrderColors} from '../sales-orders/color-identities.js';
import {createSalesOrder,getSalesOrderById} from '../sales-orders/repository.js';
import {boundOrders} from '../ainuoke-source/service.js';
import {writeAttributionHeadInTransaction} from '../sales-orders/effective-attribution.js';
import {normalizationReferences} from '../sales-orders/normalization-preview.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {adoptOrderBusinessSource,previewOrderBusinessSource} from '../sales-orders/business-source-service.js';
import {executeProductionResourceCommand} from '../production-resources/service.js';
import {parseProductionResourceCommand} from '../production-resources/contract.js';
import {previewProductionPlan,executeProductionPlan,readOrderProductionPlans,readProductionAssignment} from '../production-scheduling/service.js';
import {previewProductionExecution,executeProductionExecution} from '../production-scheduling/execution-service.js';
import {paymentPrivateFixture} from './payment-operator-private-fixture.js';
import {parseBoundRefreshArguments,runBoundRefreshOperator} from '../ainuoke-source/bound-order-refresh-cli.js';

const code=(value:string)=>(error:unknown)=>(error as {code:string}).code===value;
test('controlled offline bound-source refresh on owned disposable PG',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('bound_refresh'),max:8});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
 await bootstrapAdmin(pool,{username:'synthetic.refresh',displayName:'Synthetic refresh',password:'synthetic-refresh'});
 const actor=await loadExistingBootstrapActor(pool,'synthetic.refresh'),clock=Date.now();
 const options={sourceKey:'refresh-test',accountFingerprint:'a'.repeat(64)};
 const initial=bindingBundle(clock);const bound=await bindOrders(pool,actor,{...options,expectedPreview:(await previewBindings(initial,clock)).reviewHash,collect:async()=>initial,now:()=>clock});
 const orderId=bound.orderIds[0],scope={...options,salesOrderId:orderId},bill=initial.discoveryBefore[0].rows[0].values.BillNo as string;
 function evidence(quantity=120,date='2026-12-01'){
  const b=bindingBundle(clock+1000);for(const page of b.discoveryBefore){page.rows[0].values.Num=quantity;page.rows[0].values.DeliveryDate=date;}
  b.discoveryAfter=structuredClone(b.discoveryBefore);b.colors[bill][0].rows[0].values.SizeNum=quantity;
  return {...b,schemaVersion:'ainuoke-order-addition.v1'};
 }
 const preview=(b= evidence(),s=scope)=>previewBoundOrderRefresh(pool,actor,s,b,clock+2000);
 const command=async(b=evidence())=>({requestId:randomUUID(),expectedPreview:(await preview(b)).previewHash});
 const apply=(b:unknown,c:{requestId:string;expectedPreview:string},now=clock+2000)=>applyBoundOrderRefresh(pool,actor,scope,b,c,now);
 const rows=async(table:string)=>(await pool.query(`SELECT row_to_json(x) AS data FROM ${table} x ORDER BY row_to_json(x)::text`)).rows;
 const mirrors=()=>rows('ainuoke_sales_order_contract_mirrors');
 const receipts=async()=>(await pool.query('SELECT count(*)::int n FROM ainuoke_order_source_refresh_receipts')).rows[0].n;
 await t.test('preview is read-only and includes concrete changes, not prices or raw payload',async()=>{
  const before=await rows('operation_logs'),p=await preview();assert.equal(p.current.quantity,'100');assert.equal(p.incoming.quantity,'120');
  assert.equal(p.incoming.deliveryDate,'2026-12-01');assert.equal(p.incoming.colorLines[0].colorName,'蓝色');
  assert.equal(await receipts(),0);assert.deepEqual(await rows('operation_logs'),before);assert.equal(JSON.stringify(p).includes('sourceMetadata'),false);
 });
 const b=evidence(),first=await command(b);let result:Awaited<ReturnType<typeof apply>>;
 await t.test('same request races once, then lost response returns historical receipt without touching current state',async()=>{
  const roots=await rows('sales_orders'),colors=await readStableOrderColors(pool,orderId),a=await Promise.all([apply(b,first),apply(b,first)]);
  assert.equal(a.filter(v=>v.replayed).length,1);assert.deepEqual(a[0].result,a[1].result);result=a[0];assert.equal(await receipts(),1);
  assert.deepEqual(await rows('sales_orders'),roots);assert.deepEqual((await readStableOrderColors(pool,orderId)).map(c=>c.id),colors.map(c=>c.id));
  const current=await mirrors();assert.equal((await apply(b,first,clock+99999999)).replayed,true);assert.deepEqual(await mirrors(),current);
  const logs=(await pool.query('SELECT operation_id,operation_sequence,before_data,after_data FROM operation_logs WHERE operation_id=$1 ORDER BY operation_sequence',['bound-order-refresh:'+actor.internalUserId+':'+first.requestId])).rows;
  assert.deepEqual(logs.map(v=>v.operation_sequence),[0,1]);assert.equal(logs[0].before_data.values.sourceQuantity,'100');assert.equal(logs[0].after_data.values.sourceQuantity,'120');
  assert.equal(logs[0].before_data.values.sourceDeliveryDate,'2026-11-01');assert.equal(logs[0].after_data.values.sourceDeliveryDate,'2026-12-01');
  assert.deepEqual((await readBoundOrderRefreshReceipt(pool,actor,first.requestId)).result,result.result);
  await assert.rejects(()=>apply({...b,extra:'changed'},first),code('bound_refresh_request_conflict'));
 });
 await t.test('manual collection intervenes after preview: stale CAS rejects and fresh refresh never reallocates user rows',async()=>{
  const next=evidence(135,'2026-12-15'),c=await command(next),plans=await readDeliveryPlanSet(pool,orderId);
  await updateDeliveryPlans(pool,actor,orderId,{expectedVersion:plans.version,upserts:[{id:plans.plans[0].id,deliveryDate:'2027-01-01',quantity:'90'}],voidIds:[]});
  const human=await rows('sales_order_delivery_plans');await assert.rejects(()=>apply(next,c),code('bound_refresh_preview_changed'));
  const r=await apply(next,await command(next));assert.equal(r.replayed,false);assert.deepEqual(await rows('sales_order_delivery_plans'),human);
  const after=await readDeliveryPlanSet(pool,orderId);assert.equal(after.ownership,'user_managed');assert.equal(after.sourceQuantity,'135');assert.equal(after.reconciliation.quantityStatus,'short');
 });
 await t.test('malformed, missing, identity-swapped, regressed or nonfinite evidence cannot erase accepted colors',async()=>{
  const before=await mirrors(),colors=await rows('ainuoke_sales_order_color_mirrors');
  for(const mutate of [(v:ReturnType<typeof evidence>)=>{v.colors[bill][0].rows[0].values.CnColor='';},
   (v:ReturnType<typeof evidence>)=>{v.colors[bill][0].total=0;v.colors[bill][0].rows=[];},
   (v:ReturnType<typeof evidence>)=>{v.discoveryBefore[0].rows[0].values.id='other';v.discoveryAfter=structuredClone(v.discoveryBefore);},
   (v:ReturnType<typeof evidence>)=>{v.discoveryBefore[0].fetchedAt=new Date(clock-1).toISOString();v.discoveryAfter=structuredClone(v.discoveryBefore);v.colors[bill][0].fetchedAt=new Date(clock-1).toISOString();},
   (v:ReturnType<typeof evidence>)=>{v.discoveryBefore[0].rows[0].values.Num=NaN;v.discoveryAfter=structuredClone(v.discoveryBefore);},
   (v:ReturnType<typeof evidence>)=>{v.discoveryBefore[0].rows[0].values.Num='';v.discoveryAfter=structuredClone(v.discoveryBefore);}]){
   const bad=evidence();mutate(bad);await assert.rejects(()=>preview(bad));
  }
  await assert.rejects(()=>preview({...evidence(),password:'reflected'} as never));assert.deepEqual(await mirrors(),before);assert.deepEqual(await rows('ainuoke_sales_order_color_mirrors'),colors);
  assert.equal((await preview(evidence(0))).incoming.quantity,'0');
 });
 await t.test('unbound or wrong profile cannot turn refresh into creation; no generic source DTO is accepted',async()=>{
  const old=await rows('sales_orders');await assert.rejects(()=>preview(evidence(),{...scope,salesOrderId:randomUUID()}));
  await assert.rejects(()=>preview(evidence(),{...scope,accountFingerprint:'b'.repeat(64)}));
  await assert.rejects(()=>preview({source:{sourceId:'forged'},colors:[]} as never));assert.deepEqual(await rows('sales_orders'),old);
 });
 await t.test('audit failure rolls back mirrors, plans and receipt together',async()=>{
  const next=evidence(150),c=await command(next),before=await mirrors(),colors=await rows('ainuoke_sales_order_color_mirrors'),count=await receipts();
  await pool.query("CREATE FUNCTION reject_refresh_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.metadata->>'mutationSurface'='bound_source_refresh' THEN RAISE EXCEPTION 'synthetic audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_refresh_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_refresh_audit()");
  try{await assert.rejects(()=>apply(next,c));}finally{await pool.query('DROP TRIGGER reject_refresh_audit ON operation_logs;DROP FUNCTION reject_refresh_audit()');}
  assert.deepEqual(await mirrors(),before);assert.deepEqual(await rows('ainuoke_sales_order_color_mirrors'),colors);assert.equal(await receipts(),count);
  assert.equal((await readBoundOrderRefreshReceipt(pool,actor,c.requestId)).state,'unknown');
 });
 await t.test('revoked permission blocks new command, replay and original receipt',async()=>{
  const next=evidence(150),c=await command(next);await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='ainuoke.sync'");
  try{await assert.rejects(()=>apply(next,c));await assert.rejects(()=>apply(b,first));await assert.rejects(()=>readBoundOrderRefreshReceipt(pool,actor,first.requestId));}
  finally{await pool.query("INSERT INTO app_role_permissions VALUES('role-server-admin','ainuoke.sync')");}
 });
 await t.test('role deletion while command waits is observed before profile/order locks or publication',async()=>{
  const next=evidence(155),c=await command(next),owner=await pool.connect(),name='refresh-role-'+randomUUID();
  const other=new pg.Pool({...pool.options,application_name:name,max:1});let pending:ReturnType<typeof apply>|undefined;
  try{
   await owner.query('BEGIN');await owner.query("SELECT id FROM app_roles WHERE id='role-server-admin' FOR UPDATE");
   pending=applyBoundOrderRefresh(other,actor,scope,next,c,clock+2000);void pending.catch(()=>undefined);
   let blocked=false;for(let n=0;n<120;n++){blocked=Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[name])).rowCount);if(blocked)break;await new Promise(done=>setTimeout(done,25));}
   assert.equal(blocked,true);await owner.query("SELECT source_key FROM ainuoke_source_profiles WHERE source_key='refresh-test' FOR UPDATE NOWAIT");
   await owner.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='ainuoke.sync'");await owner.query('COMMIT');
   await assert.rejects(pending,code('permission_denied'));assert.equal((await readDeliveryPlanSet(pool,orderId)).sourceQuantity,'135');
  }finally{await owner.query('ROLLBACK');owner.release();await pending?.catch(()=>undefined);await other.end();await pool.query("INSERT INTO app_role_permissions VALUES('role-server-admin','ainuoke.sync') ON CONFLICT DO NOTHING");}
 });
 await t.test('preview is bound to connection destination even when database internal facts are identical',async()=>{
  const next=evidence(158),p=await preview(next),uri=new URL(pool.options.connectionString!);uri.hostname='different-target.invalid';
  const redirected={connect:()=>pool.connect(),options:{...pool.options,connectionString:uri.toString()}} as unknown as pg.Pool;
  await assert.rejects(()=>applyBoundOrderRefresh(redirected,actor,scope,next,{requestId:randomUUID(),expectedPreview:p.previewHash},clock+2000),code('bound_refresh_preview_changed'));
  assert.equal((await readDeliveryPlanSet(pool,orderId)).sourceQuantity,'135');
 });
 await t.test('independent concurrent previews commit once and immutable receipts are inventoried for both identities',async()=>{
  const next=evidence(160),p=await preview(next),commands=[1,2].map(()=>({requestId:randomUUID(),expectedPreview:p.previewHash}));
  const outcomes=await Promise.allSettled(commands.map(c=>apply(next,c)));assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);
  await assert.rejects(()=>pool.query("UPDATE ainuoke_order_source_refresh_receipts SET result='{}'"));await assert.rejects(()=>pool.query('DELETE FROM ainuoke_order_source_refresh_receipts'));
  const client=await pool.connect();try{const refs=await normalizationReferences(client);for(const column of ['sales_order_id','source_owner_order_id'])assert.ok(refs.some(([table,c])=>table==='ainuoke_order_source_refresh_receipts'&&c===column));}finally{client.release();}
 });
 await t.test('same request UUID from another actor has a separate receipt and correlated audit group',async()=>{
  const user=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('synthetic.refresh.second','unused','Synthetic second','viewer') RETURNING id::text")).rows[0];
  await pool.query("INSERT INTO app_user_roles VALUES($1,'role-server-admin')",[user.id]);
  const second=await loadExistingBootstrapActor(pool,'synthetic.refresh.second'),next=evidence(161),p=await previewBoundOrderRefresh(pool,second,scope,next,clock+2000);
  const saved=await applyBoundOrderRefresh(pool,second,scope,next,{requestId:first.requestId,expectedPreview:p.previewHash},clock+2000);
  assert.equal(saved.replayed,false);assert.equal((await readBoundOrderRefreshReceipt(pool,actor,first.requestId)).result?.afterSourceHash,result.result.afterSourceHash);
  const events=(await pool.query("SELECT operation_id,count(*)::int n FROM operation_logs WHERE operation_id IN ($1,$2) GROUP BY operation_id",['bound-order-refresh:'+actor.internalUserId+':'+first.requestId,'bound-order-refresh:'+second.internalUserId+':'+first.requestId])).rows;
  assert.equal(events.length,2);assert.ok(events.every(row=>row.n===2));
 });
 await t.test('existing commercial version and actual production history survive quantity and color evidence changes byte-for-byte',async()=>{
  const q=createSyntheticQuoteFixture('synthetic-bound-refresh','distribution');for(const revision of q.revisions){revision.imageAttachmentIds=[];revision.fileAttachmentIds=[];revision.styleImageAttachmentId=null;}
  const revision=q.revisions.find(r=>r.revisionId===q.defaultRevisionId)!;const pv=revision.priceVersions[0];
  pv.confirmation={quotedGarmentPrice:120,quotedLaborPrice:10,confirmedGarmentPrice:120,confirmedLaborPrice:10,note:'synthetic',confirmedAt:new Date(clock).toISOString()};
  await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(q));
  const selection={kind:'quote',quoteId:q.id,revisionId:revision.revisionId,priceVersionId:pv.id},p=await previewOrderBusinessSource(pool,actor,orderId,selection);
  await adoptOrderBusinessSource(pool,actor,orderId,{selection,requestId:randomUUID(),expectedVersion:p.version,fingerprint:p.fingerprint,reason:'synthetic immutable adoption'});
  const resource=await executeProductionResourceCommand(pool,actor,parseProductionResourceCommand({requestId:randomUUID(),action:'create',kind:'factories',resourceId:null,expectedVersion:0,
   data:{name:'Synthetic refresh factory',enabled:true,remark:'',shortName:'Synthetic',contactPerson:'',phone:''}}));
  assert.equal(resource.status,'applied');if(resource.status!=='applied')assert.fail();
  const order=await readOrderProductionPlans(pool,actor,orderId);
  const intent={action:'create',orderId,assignmentId:null,expectedVersion:0,expectedPlanVersion:order.order.planVersion,
   data:{executionType:'outsource',executorId:resource.resource.id,colorId:(await readStableOrderColors(pool,orderId))[0].id,plannedQuantity:'20',duration:{mode:'workdays',workdays:2},dates:{mode:'manual_fixed',startDate:'2026-11-02',endDate:'2026-11-03'},remark:''}};
  const plan=await previewProductionPlan(pool,actor,intent);const made=await executeProductionPlan(pool,actor,{requestId:randomUUID(),intent:plan.intent,previewHash:plan.previewHash});
  assert.equal(made.status,'applied');if(made.status!=='applied')assert.fail();const id=made.assignments[0].id;
  const assignment=await readProductionAssignment(pool,actor,id),currentOrder=await readOrderProductionPlans(pool,actor,orderId);
  const execution=await previewProductionExecution(pool,actor,{action:'record_execution',orderId,assignmentId:id,expectedAssignmentVersion:assignment.assignment.version,
   expectedExecutionVersion:0,expectedPlanVersion:currentOrder.order.planVersion,data:{status:'in_progress',completedQuantity:'10',actualStartDate:'2026-11-02',actualCompletedDate:null},reason:'',replan:null});
  await executeProductionExecution(pool,actor,{requestId:randomUUID(),intent:execution.intent,previewHash:execution.previewHash});
  const tables=['sales_order_commercial_versions','sales_order_commercial_lines','sales_order_commercial_heads','production_schedule_assignments','production_schedule_plan_versions','production_schedule_executions','production_schedule_execution_versions'];
  const before=await Promise.all(tables.map(rows)),next=evidence(175);next.colors[bill][0].rows[0].values.CnColor='青色';
  await apply(next,await command(next));assert.deepEqual(await Promise.all(tables.map(rows)),before);assert.equal((await readStableOrderColors(pool,orderId))[0].colorName,'青色');
 });
 await t.test('private offline operator previews/applies exact evidence and reads a receipt without reopening evidence',async()=>{
  const privateFiles=paymentPrivateFixture();try{
   const next=evidence(178),proof=privateFiles.write('evidence.json',JSON.stringify(next));
   const job=privateFiles.write('job.json',JSON.stringify({schemaVersion:'ainuoke-bound-order-refresh-job.v1',databaseUrl:pool.options.connectionString,
    operatorUsername:actor.username,...scope,evidence:proof}));
   const common=['--job='+job.path,'--job-sha256='+job.sha256,'--private-output='+privateFiles.directory];
   const planned=await runBoundRefreshOperator(parseBoundRefreshArguments(['--action=plan',...common]),'1'.repeat(40));
   assert.equal(planned.result,'READ_ONLY_PREVIEW_RECORDED');assert.ok('privateReportPath' in planned);
   const report=JSON.parse(readFileSync(planned.privateReportPath,'utf8'));const requestId=randomUUID();
   const applied=await runBoundRefreshOperator(parseBoundRefreshArguments(['--action=apply',...common,'--request-id='+requestId,
    '--expected-preview='+report.result.previewHash,'--execute=I_CONFIRM_EXACT_SCOPE']),'1'.repeat(40),()=>{throw new Error('synthetic report disk unavailable after commit');});
   assert.equal(applied.result,'PRIVATE_REPORT_UNAVAILABLE');assert.equal(applied.automaticRetry,false);unlinkSync(proof.path);
   const receipt=await runBoundRefreshOperator(parseBoundRefreshArguments(['--action=receipt',...common,'--request-id='+requestId]),'1'.repeat(40));
   assert.ok('privateReportPath' in receipt);const saved=JSON.parse(readFileSync(receipt.privateReportPath,'utf8'));
   assert.equal(saved.result.state,'completed');assert.equal(saved.result.result.requestId,requestId);assert.equal(receipt.sourceReadThisInvocation,'none');
  }finally{privateFiles.close();}
 });
 await t.test('historical owner refresh preserves immutable binding, alias plans and effective-root plans',async()=>{
  const primary=(await createSalesOrder(pool,{creationSource:'manual'})).id,pair=[orderId,primary].sort();
  const caseId=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor.internalUserId,randomUUID(),'a'.repeat(64)])).rows[0].id;
  await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic','{}')",[caseId,actor.internalUserId,randomUUID(),'b'.repeat(64)]);
  const beforePreview=await preview(evidence(180)),client=await pool.connect();
  try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
   const change=(await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic') RETURNING id",[caseId,actor.internalUserId,randomUUID(),'c'.repeat(64)])).rows[0].id;
   for(const id of pair)await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_version) VALUES($1,$2,$3,0)',[change,id,primary]);
   for(const id of pair)await writeAttributionHeadInTransaction(client,change,id);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  await assert.rejects(()=>apply(evidence(180),{requestId:randomUUID(),expectedPreview:beforePreview.previewHash}));
  const plans=await rows('sales_order_delivery_plans'),sets=await rows('sales_order_delivery_plan_sets'),links=await rows('sales_order_source_links'),newScope={...scope,salesOrderId:primary},next=evidence(180);
  next.discoveryBefore[0].rows[0].values.InsideOrderNo='SYNTHETIC-IN-NEW';next.discoveryAfter=structuredClone(next.discoveryBefore);
  next.colors[bill][0].rows[0].values.insideorderno='SYNTHETIC-IN-NEW';
  const p=await preview(next,newScope);assert.equal(p.historicalOwner,true);
  const result=await applyBoundOrderRefresh(pool,actor,newScope,next,{requestId:randomUUID(),expectedPreview:p.previewHash},clock+2000);
  assert.equal(result.result.sourceOwnerOrderId,orderId);assert.equal(result.result.salesOrderId,primary);
  assert.deepEqual(await rows('sales_order_delivery_plans'),plans);assert.deepEqual(await rows('sales_order_delivery_plan_sets'),sets);
  const updated=await rows('sales_order_source_links');assert.equal(updated[0].data.inside_order_no,'SYNTHETIC-IN-NEW');
  for(const key of ['id','sales_order_id','external_id','source_system','source_entity_type','sales_contract_no','created_at'])assert.equal(updated[0].data[key],links[0].data[key]);
  assert.equal((await getSalesOrderById(pool,primary))?.insideOrderNo,'SYNTHETIC-IN-NEW');assert.equal((await getSalesOrderById(pool,orderId))?.insideOrderNo,'SYNTHETIC-IN-NEW');
  assert.equal((await boundOrders(pool))[0].insideOrderNo,'SYNTHETIC-IN-NEW');
 });
 await t.test('0040 populated prefix upgrades only the new empty receipt relation and preserves old rows',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'zhixu-refresh-prefix-')),old=new pg.Pool({connectionString:await db.createDatabase('bound_refresh_upgrade')});
  try{
   for(const file of await readdir('database/migrations'))if(/^\d{4}_.+\.sql$/u.test(file)&&Number(file.slice(0,4))<=40)await copyFile(join('database/migrations',file),join(directory,file));
   await runMigrations(old,directory);await synchronizePermissionCatalog(old);await bootstrapAdmin(old,{username:'synthetic.upgrade',displayName:'Synthetic upgrade',password:'synthetic-upgrade'});
   const a=await loadExistingBootstrapActor(old,'synthetic.upgrade'),b=bindingBundle(Date.now());
   await bindOrders(old,a,{...options,expectedPreview:(await previewBindings(b)).reviewHash,collect:async()=>b});
   const tables=['app_users','app_roles','app_role_permissions','sales_orders','sales_order_source_links','ainuoke_sales_order_contract_mirrors','ainuoke_sales_order_color_mirrors','sales_order_delivery_plan_sets','sales_order_delivery_plans','operation_logs'];
   const snapshot=async()=>Promise.all(tables.map(async table=>(await old.query(`SELECT row_to_json(x) data FROM ${table} x ORDER BY row_to_json(x)::text`)).rows));
   const before=await snapshot();assert.deepEqual((await runMigrations(old,resolve('database/migrations'))).applied,migrationFilesAfter(40));
   assert.deepEqual(await snapshot(),before);assert.equal((await old.query('SELECT count(*)::int n FROM ainuoke_order_source_refresh_receipts')).rows[0].n,0);
   assert.deepEqual((await runMigrations(old,resolve('database/migrations'))).applied,[]);
  }finally{await old.end();const child=relative(resolve(tmpdir()),resolve(directory));assert.ok(child&&!child.startsWith('..')&&!isAbsolute(child));await rm(directory,{recursive:true,force:true});}
 });
});

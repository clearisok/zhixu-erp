// Opt-in synthetic input for the existing persistent-image rehearsal. This is
// test-only: production backup/restore, schema and services are not replaced.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const production='/api/v1/production-scheduling';
const arrival='/api/v1/material-arrivals';
const technical=new Set(['schema_migrations','app_users','app_roles','app_permissions','app_user_roles','app_role_permissions','app_sessions','login_attempts']);
const requiredNonempty=[
  'sales_orders','sales_order_source_links','ainuoke_sales_order_contract_mirrors','ainuoke_sales_order_color_mirrors',
  'sales_order_color_identities','sales_order_delivery_plans','ainuoke_source_profiles','ainuoke_source_runs','ainuoke_material_source_snapshots',
  'production_calendars','production_calendar_exceptions','production_sites','production_groups','production_outsource_factories',
  'production_resource_commands','production_schedule_resource_snapshots','production_order_plan_heads','production_group_plan_heads',
  'production_schedule_assignments','production_schedule_plan_versions','production_schedule_commands','production_schedule_command_orders',
  'production_schedule_execution_epochs','production_schedule_executions','production_schedule_execution_versions',
  'production_supply_hubs','production_order_execution_trackings','production_order_execution_tracking_versions',
  'material_arrival_demands','material_arrival_plans','material_arrival_plan_versions','material_arrival_commands','material_arrival_command_orders','operation_logs',
];

async function json(state,cookie,path,body){
  const r=await state.request(path,{cookie,...(body===undefined?{}:{method:'POST',body})});
  assert.equal(r.status,200,`synthetic_domain_http:${path}:${r.status}:${r.bytes.toString().slice(0,200)}`);
  return r.json();
}
function storedResult(result){
  const copy={...result};delete copy.replayed;delete copy.payloadHash;return copy;
}

export async function readPersistentDomainReceipts(state,cookie,receipts){
  const responses={};
  for(const expected of receipts){
    const reply=await json(state,cookie,expected.path);
    assert.equal(reply.state,'known','original request must be known, never unknown/pending');
    assert.equal(reply.requestId,expected.requestId);
    assert.equal(reply.result?.status,'applied');
    assert.deepEqual(storedResult(reply.result),expected.result,'receipt must describe the same originally applied result');
    responses[expected.path]=reply;
  }
  return responses;
}

export async function seedPersistentDomainRecovery(state,cookie,run){
  assert.equal(state.prepared,true,'domain fixture requires successful owned preparation');
  assert.match(state.project,/^zhixu-quote-trial-it-[0-9a-f]{10}$/);
  // Reuse the existing generated order/material fixtures. The host TS loader
  // only serializes synthetic facts; it has no database or Source credentials.
  const fixtureUrl=new URL('./ainuoke-binding-fixture.ts',import.meta.url).href;
  const input=await run(process.execPath,['--import','tsx','--input-type=module','-e',
    `import {bindingBundle,freshMaterialBundle} from ${JSON.stringify(fixtureUrl)};process.stdout.write(JSON.stringify({binding:bindingBundle(),materials:freshMaterialBundle()}));`]);
  const sourceScript=`
    import assert from 'node:assert/strict';
    import pg from 'pg';
    import {loadServerConfig} from './dist/server/server/config.js';
    import {loadExistingBootstrapActor} from './dist/server/server/sales-orders/bootstrap-runner.js';
    import {previewBindings,bindOrders} from './dist/server/server/ainuoke-source/binding.js';
    import {captureSource} from './dist/server/server/ainuoke-source/service.js';
    const input=${input};
    const pool=new pg.Pool({connectionString:loadServerConfig().databaseUrl});
    try{
      assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,0);
      const actor=await loadExistingBootstrapActor(pool,'local.admin');
      const source={sourceKey:'local-empty',accountFingerprint:'a'.repeat(64)};
      const preview=await previewBindings(input.binding);
      const bound=await bindOrders(pool,actor,{...source,expectedPreview:preview.reviewHash,collect:async()=>input.binding});
      assert.equal(bound.orderIds.length,1);
      await captureSource(pool,actor,{...source,maxAgeMs:600000,collect:async()=>input.materials});
      process.stdout.write(JSON.stringify({orderId:bound.orderIds[0]}));
    }finally{await pool.end();}
  `;
  // state.compose is already bound to the successfully prepared owned project.
  const made=JSON.parse(await state.compose(['exec','-T','app','node','--input-type=module'],sourceScript));
  assert.match(made.orderId,/^[0-9a-f-]{36}$/);
  const fixture={orderId:made.orderId,receipts:[]};
  async function resource(kind,data){
    const command={requestId:randomUUID(),action:'create',kind,resourceId:null,expectedVersion:0,data};
    const result=await json(state,cookie,'/api/v1/production-resources/commands',command);
    assert.equal(result.status,'applied');
    fixture.receipts.push({path:'/api/v1/production-resources/commands/'+command.requestId,requestId:command.requestId,result:storedResult(result)});
    return result.resource;
  }
  async function save(prefix,intent){
    const preview=await json(state,cookie,prefix+'/preview',intent);
    const command={requestId:randomUUID(),intent:preview.intent,previewHash:preview.previewHash};
    const result=await json(state,cookie,prefix+'/commands',command);
    assert.equal(result.status,'applied');
    fixture.receipts.push({path:(prefix===arrival?arrival:production)+'/commands/'+command.requestId,requestId:command.requestId,result:storedResult(result)});
    return result;
  }
  const calendar=await resource('calendars',{name:'恢复合成日历',enabled:true,remark:'仅隔离验收',workingWeekdays:[1,2,3,4,5],exceptions:[{date:'2027-01-05',type:'non_working',name:'合成例外'}]});
  const site=await resource('sites',{name:'恢复合成地点',enabled:true,remark:'',countryCode:null,productionCalendarId:calendar.id,preProductionSampleLeadDays:2});
  const group=await resource('groups',{name:'恢复合成生产组',enabled:true,remark:'',shortName:'恢复',productionSiteId:site.id,sortOrder:1});
  const factory=await resource('factories',{name:'恢复合成外发厂',enabled:true,remark:'',shortName:'恢复',contactPerson:'',phone:''});
  const hub=await resource('hubs',{name:'恢复合成集货仓',enabled:true,remark:'仅隔离验收'});
  fixture.assignments=[];
  for(const [executionType,executorId,quantity] of [['internal',group.id,'30.125'],['outsource',factory.id,'69.875']]){
    const current=await json(state,cookie,production+'/orders/'+fixture.orderId);
    const saved=await save(production,{action:'create',orderId:fixture.orderId,assignmentId:null,expectedVersion:0,expectedPlanVersion:current.order.planVersion,
      data:{executionType,executorId,colorId:current.order.colors[0].id,plannedQuantity:quantity,duration:{mode:'workdays',workdays:2},dates:executionType==='internal'?{mode:'auto_queue',startDate:'2027-01-04'}:{mode:'manual_fixed',startDate:'2027-01-04',endDate:'2027-01-06'},remark:'恢复合成排单'}});
    fixture.assignments.push(saved.assignments[0].id);
  }
  for(const [index,quantity] of ['10.125','20.25'].entries()){
    const id=fixture.assignments[0],row=await json(state,cookie,production+'/assignments/'+id),current=await json(state,cookie,production+'/orders/'+fixture.orderId);
    await save(production+'/execution',{action:'record_execution',orderId:fixture.orderId,assignmentId:id,expectedAssignmentVersion:row.assignment.version,expectedExecutionVersion:row.execution?.version??0,
      expectedPlanVersion:current.order.planVersion,data:{status:'in_progress',completedQuantity:quantity,actualStartDate:'2027-01-04',actualCompletedDate:null},reason:index?'合成产量追加':'',replan:null});
  }
  for(const remark of ['恢复合成备注第一版','恢复合成备注第二版']){
    const current=await json(state,cookie,production+'/order-tracking/orders/'+fixture.orderId);
    await save(production+'/order-tracking',{action:'set_order_tracking',orderId:fixture.orderId,expectedVersion:current.tracking?.version??0,data:{supplyHubId:hub.id,remark}});
  }
  const before=await json(state,cookie,arrival+'/orders/'+fixture.orderId);
  assert.equal(before.source.status,'ready');
  const demand=before.source.demands.find(row=>row.materialCode==='SYNTHETIC-MAT-ready');assert.ok(demand);assert.equal(demand.requiredQuantity,'100');
  fixture.canonicalKey=demand.canonicalKey;
  const batchId=randomUUID();
  for(const [index,quantity] of ['40.125','60.25'].entries())await save(arrival,{action:'replace_arrival_plan',orderId:fixture.orderId,canonicalKey:demand.canonicalKey,expectedVersion:index,
    batches:[{id:batchId,expectedArrivalAtHubDate:'2027-01-11',allocations:[{materialDemandId:demand.id,quantity}]}]});
  fixture.readPaths=[production+'/orders/'+fixture.orderId,production+'/order-tracking/history/'+fixture.orderId,
    ...fixture.assignments.flatMap(id=>[production+'/assignments/'+id,production+'/executions/'+id]),
    arrival+'/orders/'+fixture.orderId+'/materials/'+encodeURIComponent(fixture.canonicalKey)+'/history'];
  const current=await json(state,cookie,production+'/orders/'+fixture.orderId);
  assert.equal(current.summary.plannedQuantity,'100');assert.equal(current.summary.completedQuantity,'20.25');
  return fixture;
}

export async function snapshotPersistentDomainDatabase(state,includeTechnical=false){
  assert.equal(state.prepared,true,'domain snapshot requires successful owned preparation');
  assert.match(state.project,/^zhixu-quote-trial-(?:it|recovery)-[0-9a-f]{10}$/);
  const tables=(await state.sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).split('\n').filter(name=>includeTechnical||!technical.has(name));
  const database={};
  for(const name of tables){
    assert.match(name,/^[a-z_]+$/);
    const raw=await state.sql(`SELECT json_build_object('count',count(*),'sha256',encode(digest(COALESCE(jsonb_agg(payload ORDER BY payload::text),'[]'::jsonb)::text,'sha256'),'hex'))::text FROM (SELECT to_jsonb(t) AS payload FROM ${name} t) owned_rows`);
    database[name]=JSON.parse(raw);
  }
  for(const name of requiredNonempty)assert.ok(database[name]?.count>0,'nonempty_recovery_fixture_required:'+name);
  if(includeTechnical)database.sequences=JSON.parse(await state.sql("SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY sequencename),'[]'::jsonb)::text FROM pg_sequences s WHERE schemaname='public'"));
  return database;
}

export async function snapshotPersistentDomains(state,cookie,fixture){
  const database=await snapshotPersistentDomainDatabase(state);
  const responses={};
  for(const path of fixture.readPaths)responses[path]=await json(state,cookie,path);
  Object.assign(responses,await readPersistentDomainReceipts(state,cookie,fixture.receipts));
  return {database,responses};
}

export function assertPersistentDomainRecovery(before,after){
  assert.deepEqual(after,before,'domain rows, original IDs, decimals, immutable versions, audits and exact-request receipts must survive');
}

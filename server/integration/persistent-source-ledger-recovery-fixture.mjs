// Synthetic inputs and read-only assertions for the existing owned recovery drill.
// No Source worker, second restore implementation or production entry point.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export const sourceLedgerTables=[
  'ainuoke_garment_shipment_targets','ainuoke_garment_shipment_snapshots',
  'ainuoke_garment_shipment_color_matches','ainuoke_garment_shipment_heads',
  'ainuoke_order_source_refresh_receipts','sales_order_delivery_plan_requests',
  'ainuoke_garment_collection_commands','ainuoke_garment_target_commands',
];
function owned(state){
  assert.equal(state.prepared,true);
  assert.match(state.project,/^zhixu-quote-trial-(?:it|recovery)-[0-9a-f]{10}$/);
}
async function json(state,cookie,path,method='GET',body){
  const r=await state.request(path,{cookie,method,...(body===undefined?{}:{body})});
  assert.equal(r.status,200,`source_ledger_http:${path}:${r.status}:${r.bytes.toString().slice(0,200)}`);
  return r.json();
}

// These are different existing protocols. HTTP 200/unknown/null are never proof.
export function assertSourceLedgerReceipt(expected,reply){
  assert.ok(reply&&typeof reply==='object');
  if(expected.kind==='delivery'){
    assert.equal(reply.status,'applied');assert.equal(reply.requestMode,'explicit');
    assert.equal(reply.requestId,expected.command.requestId);assert.equal(reply.salesOrderId,expected.salesOrderId);
    assert.equal(reply.operationId,expected.result.operationId);
    assert.deepEqual(reply.deliveryPlanSet,expected.result.deliveryPlanSet);
  }else{
    assert.equal(reply.sourceReadThisInvocation,'none');
    if(expected.kind==='bound_refresh'){
      assert.equal(reply.state,'completed');assert.equal(reply.result?.requestId,expected.requestId);
      assert.equal(reply.result?.salesOrderId,expected.salesOrderId);
    }else{
      assert.ok(['garment_target','garment_collection'].includes(expected.kind));
      assert.equal(reply.receiptState,'completed');assert.equal(reply.requestId,expected.requestId);
      assert.equal(reply.automaticRetry,false);
    }
    assert.ok(reply.result);assert.deepEqual(reply.result,expected.result);
  }
}

export async function seedPersistentSourceLedgers(state,cookie,fixture,run){
  owned(state);assert.match(state.project,/^zhixu-quote-trial-it-[0-9a-f]{10}$/);
  const path='/api/v1/sales-orders/'+fixture.orderId+'/delivery-plans';
  const before=(await json(state,cookie,path)).deliveryPlanSet;
  assert.equal(before.ownership,'source_derived');assert.ok(before.plans[0]);
  const command={requestId:randomUUID(),expectedVersion:before.version,
    upserts:[{id:before.plans[0].id,deliveryDate:'2027-02-01',quantity:'90.125'}],voidIds:[]};
  const adopted=await json(state,cookie,path,'PATCH',command);
  assert.equal(adopted.deliveryPlanSet.ownership,'user_managed');
  assert.equal(adopted.deliveryPlanSet.plans[0].quantity,'90.125');
  const deliveryReply=(await json(state,cookie,path+'/receipt','POST',command)).receipt;
  const delivery={kind:'delivery',salesOrderId:fixture.orderId,path:path+'/receipt',command,
    result:{operationId:deliveryReply.operationId,deliveryPlanSet:adopted.deliveryPlanSet}};
  assertSourceLedgerReceipt(delivery,deliveryReply);

  // Only serialize existing generated fixtures on the host. Nothing here reads
  // a credential file or runs the real worker. Frames/counts are synthetic.
  const bindingUrl=new URL('./ainuoke-binding-fixture.ts',import.meta.url).href;
  const garmentUrl=new URL('./garment-collection-fixture.ts',import.meta.url).href;
  const input=await run(process.execPath,['--import','tsx','--input-type=module','-e',`
    import {bindingBundle} from ${JSON.stringify(bindingUrl)};
    import {collectionRequest,workerFrame,sourceRow} from ${JSON.stringify(garmentUrl)};
    const clock=Date.now(),contract='SYN-RECOVERY-GARMENT',request=collectionRequest('00000000-0000-4000-8000-000000000001',contract,clock,'local.admin');
    const b=bindingBundle(clock),bill=b.discoveryBefore[0].rows[0].values.BillNo;
    b.discoveryBefore[0].rows[0].values.Num=120;b.discoveryBefore[0].rows[0].values.DeliveryDate='2026-12-15';
    b.discoveryAfter=structuredClone(b.discoveryBefore);b.colors[bill][0].rows[0].values.SizeNum=120;
    const quantities=['9007199254740993.000000000001','9007199254740994.000000000002'];
    const scope={sourceFingerprint:request.verification.selection.sourceFingerprint,salesContractNo:contract};
    process.stdout.write(JSON.stringify({clock,contract,request,evidence:{...b,schemaVersion:'ainuoke-order-addition.v1'},quantities,
      frames:quantities.map((Num,i)=>workerFrame(scope,clock+100*(i+1),[sourceRow(contract,{Num})]))}));
  `]);
  const script=`
    import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import pg from 'pg';
    import {loadServerConfig} from './dist/server/server/config.js';
    import {loadExistingBootstrapActor} from './dist/server/server/sales-orders/bootstrap-runner.js';
    import {createAinuokeSalesOrder} from './dist/server/server/sales-orders/service.js';
    import {hash} from './dist/server/server/ainuoke-source/contract.js';
    import {accountFingerprint} from './dist/server/server/ainuoke-source/collector.js';
    import {previewBoundOrderRefresh,applyBoundOrderRefresh} from './dist/server/server/ainuoke-source/bound-order-refresh.js';
    import {planGarmentTarget,applyGarmentTarget} from './dist/server/server/ainuoke-source/garment-target-control.js';
    import {planGarmentCollection,collectGarmentOnce} from './dist/server/server/ainuoke-source/garment-collection-control.js';
    const input=${input},primaryOrderId=${JSON.stringify(fixture.orderId)};
    const pool=new pg.Pool({connectionString:loadServerConfig().databaseUrl});
    try{
      const actor=await loadExistingBootstrapActor(pool,'local.admin');let clock=input.clock;
      const rows=async table=>(await pool.query('SELECT to_jsonb(t) payload FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;
      const protectedTables=['sales_order_delivery_plans','production_schedule_assignments','production_schedule_executions',
        'production_schedule_execution_versions','material_arrival_plans','material_arrival_plan_versions'];
      const protectedBefore=await Promise.all(protectedTables.map(rows));
      const primaryProfile=await pool.query("SELECT to_jsonb(p) payload FROM ainuoke_source_profiles p WHERE source_key='local-empty'");
      const refreshScope={sourceKey:'local-empty',accountFingerprint:'a'.repeat(64),salesOrderId:primaryOrderId};
      const preview=await previewBoundOrderRefresh(pool,actor,refreshScope,input.evidence,clock);
      assert.equal(preview.current.ownership,'user_managed');assert.equal(preview.incoming.quantity,'120');
      const refreshId=randomUUID();
      const refresh=await applyBoundOrderRefresh(pool,actor,refreshScope,input.evidence,{requestId:refreshId,expectedPreview:preview.previewHash},clock);
      assert.equal(refresh.replayed,false);assert.equal(refresh.result.salesOrderId,primaryOrderId);
      assert.deepEqual(await Promise.all(protectedTables.map(rows)),protectedBefore,'source refresh must preserve explicit delivery, production and arrival rows');
      const request=input.request,sourceKey=request.config.sourceKey;
      assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_source_profiles WHERE source_key=$1',[sourceKey])).rows[0].n,0);
      await pool.query('INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)',[sourceKey,accountFingerprint(request.config)]);
      const order=(await createAinuokeSalesOrder(pool,actor,{source:{sourceId:input.contract,sourceRowIdentity:input.contract,salesContractNo:input.contract,
        insideOrderNo:'SYN-RECOVERY-FACTORY',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-11-01',
        styleNo:'SYN-RECOVERY-STYLE',companyNameSnapshot:'合成公司',customerNameSnapshot:'合成客户',brandNameSnapshot:'合成品牌',quantity:100,
        sourceHash:hash(input.contract),fetchedAt:new Date(clock).toISOString()},
        colors:[{sourceLineIdentity:'SYN-RECOVERY-BLUE',colorName:'合成蓝',quantity:100,deliveryDate:'2026-11-01',sourceHash:hash([input.contract,'blue'])}]})).salesOrder;
      request.salesOrderId=order.id;
      const enable={action:'enable',request,freshnessMs:60000},targetInput={requestId:randomUUID(),expiresAt:new Date(clock+540000).toISOString()};
      const targetPlan=await planGarmentTarget(pool,actor,enable,targetInput,()=>clock);
      const target=await applyGarmentTarget(pool,actor,enable,{...targetInput,scopeHash:targetPlan.scopeHash},()=>clock);
      assert.equal(target.receiptState,'completed');assert.equal(target.result?.enabled,true);
      const receipts=[{kind:'bound_refresh',requestId:refreshId,salesOrderId:primaryOrderId,result:refresh.result},
        {kind:'garment_target',requestId:targetInput.requestId,sourceKey,salesOrderId:order.id,result:target.result}];
      let calls=0;const publications=[];
      // This explicit callback is mandatory: omitting it would select live IO.
      const fakeCollect=async(config,scope)=>{
        assert.deepEqual(config,request.config);assert.equal(scope.salesContractNo,input.contract);
        assert.equal(scope.sourceFingerprint,request.verification.selection.sourceFingerprint);
        calls++;assert.ok(calls<=2);clock+=100;return input.frames[calls-1];
      };
      for(let i=0;i<2;i++){
        const p={requestId:randomUUID(),expiresAt:new Date(clock+60000).toISOString()};
        const plan=await planGarmentCollection(pool,actor,request,p,clock);
        const result=await collectGarmentOnce(pool,actor,request,{...p,scopeHash:plan.scopeHash},{now:()=>clock,collect:fakeCollect});
        assert.equal(result.receiptState,'completed');assert.equal(result.result?.outcome,'published');assert.equal(result.result.generation,i+1);
        publications.push(result.result.publicationId);
        receipts.push({kind:'garment_collection',requestId:p.requestId,sourceKey,salesOrderId:order.id,result:result.result});
      }
      assert.equal(calls,2);assert.notEqual(publications[0],publications[1]);
      assert.deepEqual((await pool.query("SELECT to_jsonb(p) payload FROM ainuoke_source_profiles p WHERE source_key='local-empty'")).rows,primaryProfile.rows);
      process.stdout.write(JSON.stringify({sourceKey,orderId:order.id,publications,quantities:input.quantities,evaluatedAt:clock+1000,
        fakeWorkerCalls:calls,syntheticRequestCounts:true,receipts}));
    }finally{await pool.end();}
  `;
  const made=JSON.parse(await state.compose(['exec','-T','app','node','--input-type=module'],script));
  assert.equal(made.fakeWorkerCalls,2);assert.equal(made.receipts.length,4);
  return {...made,delivery};
}

export async function snapshotPersistentSourceLedgers(state,cookie,fixture){
  owned(state);
  for(const table of sourceLedgerTables){
    assert.match(table,/^[a-z_]+$/);assert.ok(Number(await state.sql('SELECT count(*) FROM '+table))>0,'source_ledger_must_be_nonempty:'+table);
  }
  const d=fixture.delivery;
  const delivery=(await json(state,cookie,d.path,'POST',d.command)).receipt;assertSourceLedgerReceipt(d,delivery);
  const script=`
    import assert from 'node:assert/strict';import pg from 'pg';
    import {loadServerConfig} from './dist/server/server/config.js';
    import {loadExistingBootstrapActor} from './dist/server/server/sales-orders/bootstrap-runner.js';
    import {readBoundOrderRefreshReceipt} from './dist/server/server/ainuoke-source/bound-order-refresh.js';
    import {readGarmentTargetReceipt} from './dist/server/server/ainuoke-source/garment-target-control.js';
    import {readGarmentCollectionReceipt} from './dist/server/server/ainuoke-source/garment-collection-control.js';
    import {createGarmentShipmentReader} from './dist/server/server/ainuoke-source/garment-shipment-store.js';
    const fixture=${JSON.stringify(fixture)},assertReceipt=${assertSourceLedgerReceipt.toString()};
    const pool=new pg.Pool({connectionString:loadServerConfig().databaseUrl});
    try{
      const actor=await loadExistingBootstrapActor(pool,'local.admin'),receipts=[];
      for(const expected of fixture.receipts){
        const request={sourceKey:expected.sourceKey,salesOrderId:expected.salesOrderId,requestId:expected.requestId};
        const reply=expected.kind==='bound_refresh'?await readBoundOrderRefreshReceipt(pool,actor,expected.requestId):
          expected.kind==='garment_target'?await readGarmentTargetReceipt(pool,actor,request):await readGarmentCollectionReceipt(pool,actor,request);
        assertReceipt(expected,reply);receipts.push(reply);
      }
      // Fixed evaluation clock tests persisted observations, not elapsed freshness.
      const reader=createGarmentShipmentReader(pool,{sourceKey:fixture.sourceKey},()=>fixture.evaluatedAt);
      const current=await reader.read(actor,fixture.orderId),history=await reader.history(actor,fixture.orderId);
      assert.equal(current.sourceStatus,'observed');assert.equal(current.generation,2);assert.equal(current.publicationId,fixture.publications[1]);
      assert.deepEqual(history.records.map(r=>r.generation),[2,1]);
      const versions=[];
      for(const [i,id] of fixture.publications.entries()){
        const view=await reader.read(actor,fixture.orderId,id);assert.equal(view.publicationId,id);assert.equal(view.generation,i+1);
        assert.equal(view.rows.length,1);assert.equal(view.rows[0].quantity.state,'known');assert.equal(view.rows[0].quantity.value,fixture.quantities[i]);
        assert.equal(view.rows[0].colorMatch.state,'matched');versions.push(view);
      }
      const matches=(await pool.query('SELECT snapshot_id::text,source_record_id,match_state,order_color_id::text FROM ainuoke_garment_shipment_color_matches WHERE sales_order_id=$1 ORDER BY snapshot_id',
        [fixture.orderId])).rows;
      assert.deepEqual(matches,versions.map(v=>({snapshot_id:v.publicationId,source_record_id:v.rows[0].sourceRecordId,
        match_state:'matched',order_color_id:v.rows[0].colorMatch.orderColorId})).sort((a,b)=>a.snapshot_id.localeCompare(b.snapshot_id)));
      assert.deepEqual((await pool.query('SELECT snapshot_id::text,generation FROM ainuoke_garment_shipment_heads WHERE source_key=$1 AND sales_order_id=$2',
        [fixture.sourceKey,fixture.orderId])).rows,[{snapshot_id:fixture.publications[1],generation:2}]);
      process.stdout.write(JSON.stringify({current,history,versions,receipts}));
    }finally{await pool.end();}
  `;
  const internal=JSON.parse(await state.compose(['exec','-T','app','node','--input-type=module'],script));
  internal.receipts.forEach((reply,i)=>assertSourceLedgerReceipt(fixture.receipts[i],reply));
  assert.equal(internal.versions.length,2);
  return {delivery,...internal};
}

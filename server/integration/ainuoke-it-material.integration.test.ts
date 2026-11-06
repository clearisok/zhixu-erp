import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {selectedConfig} from './selected-source-fixture.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {requestContractSync,readSyncRequest} from '../ainuoke-source/sync-queue.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';
import {readCatalogDetail} from '../ainuoke-source/catalog-detail.js';
import {captureItMaterialFixture as capture} from './it-material-fixture.js';

test('actual SDK IT capture validates in Node; legacy config cannot silently switch reports',async()=>{
  const raw=capture(),request={mode:'catalog-contracts' as const,contracts:['SYN-SALES-1']};
  const result=await validateSelectedSourceOnce(raw,{...selectedConfig,materialReport:'6087051'},request);
  assert.equal(result.result,'complete');
  if(result.result!=='complete'||result.mode!=='catalog-contracts')throw Error('invalid synthetic result');
  assert.ok('materials' in result.contracts['SYN-SALES-1']);
  await assert.rejects(validateSelectedSourceOnce(raw,selectedConfig,request),/selected_source_query_refused/);
});

test('IT detail survives atomic publication, catalog and formal-order HTTP reads',{timeout:180000},async()=>{
  const f=await startCatalogFixture();
  try{
    const before=(await f.pool.query('SELECT id::text,order_no FROM sales_orders ORDER BY id')).rows;
    const request={sourceKey:f.sourceKey,sourceId:'1',requestId:randomUUID()};
    await requestContractSync(f.pool,f.actor,request);
    let captures=0;
    const result=await runSyncTick(f.pool,f.actor,{...selectedConfig,materialReport:'6087051'},
      {automatic:false,collect:async(_config,r)=>{assert.deepEqual(r,{mode:'catalog-contracts',contracts:['SYN-SALES-1']});captures++;return capture();}});
    assert.equal(result.status,'processed');assert.equal(captures,1);
    const saved=(await f.pool.query("SELECT result FROM ainuoke_sync_jobs WHERE source_id='1' AND status='complete' ORDER BY finished_at DESC LIMIT 1")).rows[0];
    assert.equal(saved.result.materialRows,3); // Unit lookup rows are not material demand rows.
    assert.equal((await readSyncRequest(f.pool,f.actor,request.requestId)).status,'complete');
    const detail=await readCatalogDetail(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:'1'});
    assert.equal(detail.materialStatus,'ready');assert.equal(detail.materials.length,1);
    const material=detail.materials[0];
    assert.equal(material.movements.filter(e=>e.kind==='采购').length,1);
    assert.equal(material.movements.filter(e=>e.kind==='入库').reduce((n,e)=>n+e.quantity,0),981);
    assert.equal(material.movements.find(e=>e.kind==='采购')?.unit,'千克');
    assert.equal(material.purchased,null);assert.equal(JSON.stringify(detail).includes('sourcePricing'),false);
    const cookie=await f.login(f.admin),order=(await f.pool.query("SELECT sales_order_id::text AS id FROM sales_order_source_links WHERE sales_contract_no='SYN-SALES-1'")).rows[0];
    const response=await fetch(f.base+'/api/v1/sales-orders/'+order.id+'/material-progress',{headers:{cookie}});
    assert.equal(response.status,200);const model=await response.json();
    assert.equal(model.progress.sourceStatus,'ready');assert.equal(model.progress.rows[0].purchases[0].unit,'千克');
    assert.equal(model.progress.rows[0].status,null);
    assert.deepEqual((await f.pool.query('SELECT id::text,order_no FROM sales_orders ORDER BY id')).rows,before);
    await requestContractSync(f.pool,f.actor,request);assert.equal(captures,1);
  }finally{await f.close();}
});

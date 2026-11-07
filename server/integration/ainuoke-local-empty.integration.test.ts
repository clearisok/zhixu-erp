import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';
import {requestContractSync,enqueueAutomaticSync} from '../ainuoke-source/sync-queue.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';

test('a complete empty publication is successful, readable and scheduled again when due',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
  const contract='SYN-SALES-1',sourceId=(await f.pool.query('SELECT source_id FROM ainuoke_catalog_entries WHERE sales_contract_no=$1',[contract])).rows[0].source_id;
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId,requestId:randomUUID()});
  const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect:async(_c,request)=>{
   if(request.mode!=='catalog-contracts')throw Error('unexpected synthetic source scope');
   return selectedWorkerFixture('catalog-contracts',
   `if report not in (0, 6086103, 6087105):
        payload['dataList'] = '{"rows": []}'
        payload['dataCount'] = 0`,request.contracts);}});
  assert.equal(result.status,'processed');
  const job=(await f.pool.query("SELECT result,status FROM ainuoke_sync_jobs WHERE source_key=$1 AND source_id=$2 ORDER BY requested_at DESC LIMIT 1",[f.sourceKey,sourceId])).rows[0];
  assert.equal(job.status,'complete');assert.equal(job.result.publicationStatus,'published');assert.equal(job.result.materialRows,0);
  const cookie=await f.login(f.reader),response=await fetch(f.base+'/api/v1/sales-orders/'+job.result.orderId+'/material-progress',{headers:{Cookie:cookie}});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.provenance,'server_snapshot');assert.equal(body.progress.sourceStatus,'ready');assert.equal(body.progress.rows.length,0);assert.equal(body.progress.order.salesContractNo,contract);
  await enqueueAutomaticSync(f.pool,f.actor,f.sourceKey,Date.now()+31*60000);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE source_key=$1 AND source_id=$2 AND status='queued'",[f.sourceKey,sourceId])).rows[0].n,1);
  assert.equal((await enqueueAutomaticSync(f.pool,f.actor,f.sourceKey,Date.now()+31*60000)).queued,0);
 }finally{await f.close();}
});

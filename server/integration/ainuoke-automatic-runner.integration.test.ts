import test from 'node:test';
import assert from 'node:assert/strict';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';
import {requestContractSync} from '../ainuoke-source/sync-queue.js';
import {runAutomaticSync} from '../ainuoke-source/sync-runner.js';
import {randomUUID} from 'node:crypto';

test('formal automatic runner retains one owner across orders and stops without losing receipts', {timeout:180000}, async () => {
  const f=await startCatalogFixture(); const stop=new AbortController();
  let owners=0,closed=0,captures=0,completed=0;
  try {
    const rows=(await f.pool.query('SELECT source_id FROM ainuoke_catalog_entries ORDER BY source_id LIMIT 2')).rows;
    for(const row of rows) await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:row.source_id,requestId:randomUUID()});
    await runAutomaticSync(f.pool,f.actor,selectedConfig,{signal:stop.signal,adoptNewOrders:true,batchSize:1,
      readConfig:()=>selectedConfig,
      createCollector:()=>{owners++;return {available:()=>true,close:()=>{closed++;},collect:async(_cfg,request)=>{
        assert.equal(request.mode,'catalog-contracts'); captures++;
        return selectedWorkerFixture('catalog-contracts','',request.contracts);
      }};},
      onTick:async result=>{if(result.status==='processed'&&++completed===2)stop.abort();},
    });
    assert.equal(owners,1);assert.equal(closed,1);assert.equal(captures,2);assert.equal(completed,2);
    const receipts=(await f.pool.query("SELECT status FROM ainuoke_sync_jobs WHERE kind='manual' ORDER BY requested_at")).rows;
    assert.deepEqual(receipts.map(r=>r.status),['complete','complete']);
  } finally {stop.abort();await f.close();}
});

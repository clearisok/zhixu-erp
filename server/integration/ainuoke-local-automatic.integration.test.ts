import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';
import {enqueueAutomaticSync,claimSyncJobs,requestContractSync} from '../ainuoke-source/sync-queue.js';
import {resumeInterruptedReads} from '../ainuoke-source/sync-recovery.js';import {readAutomaticSyncStatus} from '../ainuoke-source/sync-status.js';

test('automatic directory admits a contract without material prerequisites and keeps identity on replay',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
 const before=(await f.pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n;
 const collect=async()=>selectedWorkerFixture('catalog-discovery','',[]);
 const r=await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),collect,undefined,true);assert.equal(r.status,'complete');
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,before+1);
 const row=(await f.pool.query("SELECT source_metadata->'colorDetail' color FROM ainuoke_sales_order_contract_mirrors WHERE sales_contract_no='SYN-SALES-3'")).rows[0];
 assert.equal(row.color.queried,false);assert.equal(row.color.reason,'not_fetched');
 await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),collect,undefined,true);
 assert.equal((await f.pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,before+1);
 }finally{await f.close();}
});
test('due-only queue merges manual priority, honours effective plans and resumes bounded interrupted reads',{timeout:180000},async()=>{
 const f=await startCatalogFixture();try{
 const now=Date.now()+60_000;
 await f.pool.query("UPDATE ainuoke_catalog_entries SET contract_date='2026-01-01',delivery_date='2026-10-01'");
 await f.pool.query('UPDATE ainuoke_contract_sync_state SET last_success_at=$1,last_automatic_attempt_at=NULL',[new Date(now-31*60000)]);
 const q=await enqueueAutomaticSync(f.pool,f.actor,f.sourceKey,now);assert.equal(q.queued,3);assert.equal((await enqueueAutomaticSync(f.pool,f.actor,f.sourceKey,now)).queued,0);
 const id=(await f.pool.query("SELECT source_id FROM ainuoke_catalog_entries WHERE sales_contract_no='SYN-SALES-2'")).rows[0].source_id;
 await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:id,requestId:randomUUID()});
 const first=await claimSyncJobs(f.pool,f.actor,f.sourceKey,5,now+1000);assert.equal(first.length,1);assert.equal(first[0].source_id,id);assert.equal(first[0].kind,'manual');
 const recovered=await resumeInterruptedReads(f.pool,f.actor,f.sourceKey);assert.equal(recovered.resumed,1);
 const inflight=(await f.pool.query("SELECT status,count(*)::int n FROM ainuoke_sync_jobs WHERE source_id=$1 AND status IN('queued','running','unknown') GROUP BY status",[id])).rows;assert.deepEqual(inflight,[{status:'queued',n:1}]);
 const order=(await f.pool.query("SELECT sales_order_id FROM sales_order_source_links WHERE sales_contract_no='SYN-SALES-1'")).rows[0].sales_order_id;
 await f.pool.query("UPDATE sales_order_delivery_plan_sets SET ownership='user_managed',version=version+1 WHERE sales_order_id=$1",[order]);
 await f.pool.query("UPDATE sales_order_delivery_plans SET delivery_date='2027-01-01' WHERE sales_order_id=$1",[order]);
 const state=await readAutomaticSyncStatus(f.pool,f.actor,f.sourceKey,now);const changed=state.orders.find(x=>x.sales_contract_no==='SYN-SALES-1');assert.equal(changed.delivery_date,'2027-01-01');assert.equal(changed.schedule.tier,'frequent');
 await f.pool.query("UPDATE ainuoke_sync_controls SET paused_reason='invalid_credential' WHERE source_key=$1",[f.sourceKey]);
 assert.equal((await resumeInterruptedReads(f.pool,f.actor,f.sourceKey)).paused,'invalid_credential');
 }finally{await f.close();}
});



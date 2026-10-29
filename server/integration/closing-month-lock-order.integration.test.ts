import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {closingFixture} from './closing-fixture.js';
import {createProcessingBatch,previewProcessingBatch,confirmProcessingBatch,consumeProcessingBatches} from '../sales-orders/processing-batch-service.js';
import {previewProcessingQuotePush,pushProcessingQuotes} from '../sales-orders/processing-quote-push.js';
import {readOrderClosingMonthPlan} from '../closing/month-plan-service.js';

test('both processing creation entrances acquire the production fence before CCT/SO locks',{timeout:120000},async t=>{
 const f=await closingFixture(t),existing=await f.processing('USD');
 const source=(await f.pool.query('SELECT quote_id,revision_id,price_version_id FROM processing_order_batches WHERE id=$1',[existing.batchId])).rows[0];
 for(const entrance of ['batch','quote_push'] as const)await t.test(entrance,async()=>{
  const draft={requestId:randomUUID(),quoteId:source.quote_id,revisionId:source.revision_id,priceVersionId:source.price_version_id,
   customerName:'Synthetic',businessStyleNo:'SYN-LOCK-'+entrance,quantity:'10',orderDate:'2026-10-27',deliveryDate:null,
   customerReference:'',deliveryRequirements:'',referenceOrderId:null};
  const batch=await createProcessingBatch(f.pool,f.editor.actor,draft),preview=await previewProcessingBatch(f.pool,f.editor.actor,batch.batchId);
  const confirmed=await confirmProcessingBatch(f.pool,f.editor.actor,batch.batchId,{requestId:randomUUID(),expectedVersion:batch.version,sourceFingerprint:preview.candidate.fingerprint});
  const quoteVersion=(await f.pool.query('SELECT version FROM quote_center_quotes WHERE id=$1',[source.quote_id])).rows[0].version;
  const pushPreview=(await previewProcessingQuotePush(f.pool,f.editor.actor,{items:[{quoteId:source.quote_id,expectedVersion:quoteVersion}]})).items[0];
  assert.equal(pushPreview.status,'ready');if(pushPreview.status!=='ready')assert.fail();
  const price=pushPreview.versions.find(row=>row.id===source.price_version_id)!;
  const execute=async()=>{
   if(entrance==='batch'){
    const result=(await consumeProcessingBatches(f.pool,f.editor.actor,{requestId:randomUUID(),items:[{batchId:batch.batchId,expectedVersion:confirmed.version}]})).results[0];
    assert.equal(result.status,'created');return 'salesOrderId' in result?result.salesOrderId!:assert.fail();
   }
   const result=(await pushProcessingQuotes(f.pool,f.editor.actor,{requestId:randomUUID(),items:[{quoteId:source.quote_id,expectedVersion:quoteVersion,
    fingerprint:pushPreview.fingerprint,revisionId:source.revision_id,businessStyleNo:draft.businessStyleNo,customerName:draft.customerName,
    deliveryDate:null,orderDate:draft.orderDate,customerReference:'',versions:[{priceVersionId:source.price_version_id,quantity:'10',
     confirmedLabor:price.confirmedLabor,batchId:batch.batchId,newOrder:false}]}]})).results[0];
   assert.equal(result.status,'processed');if(result.status!=='processed')assert.fail();assert.equal(result.items[0].status,'created');return result.items[0].salesOrderId!;
  };
  // B represents production: G -> existing SO. C represents commercial adoption:
  // existing SO -> the same CCT. A is the actual new-order command above.
  const production=await f.pool.connect(),commercial=await f.pool.connect();let pending:Promise<string>|null=null;
  try{
   await production.query('BEGIN');await production.query("SET LOCAL lock_timeout='2s'");
   await production.query("SELECT pg_advisory_xact_lock(hashtextextended('production-planning-write-v1',0))");
   const pid=(await production.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   await commercial.query('BEGIN');await commercial.query('SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE',[existing.id]);
   pending=execute();const deadline=Date.now()+2000;let waiting=false;
   while(Date.now()<deadline){waiting=(await f.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='synthetic-closing-commands' AND wait_event_type='Lock' AND $1::int=ANY(pg_blocking_pids(pid))) waiting",[pid])).rows[0].waiting;
    if(waiting)break;await new Promise(done=>setTimeout(done,20));}
   assert.equal(waiting,true,'A must be observed waiting on B in PostgreSQL');
   const key='commercial-terms:quote:'+source.quote_id+':'+source.revision_id+':'+source.price_version_id;
   const free=(await commercial.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) acquired',[key])).rows[0].acquired;
   assert.equal(free,true,'A must not hold CCT while waiting on G; the old order creates the three-way cycle');
   await commercial.query('ROLLBACK');
   await production.query('SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE',[existing.id]);
  }finally{await commercial.query('ROLLBACK');commercial.release();await production.query('ROLLBACK');production.release();}
  assert(pending);const id=await pending;assert.equal((await readOrderClosingMonthPlan(f.pool,f.editor.actor,id)).plan?.version,1);
 });
 assert.deepEqual(f.errors,[]);
});

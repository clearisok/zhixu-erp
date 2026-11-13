import {get as httpGet} from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {AsyncResource} from 'node:async_hooks';
import {backfillExistingSyncAudit} from '../ainuoke-source/audit-backfill.js';
import ExcelJS from 'exceljs';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {withSyncAudit,auditAcquired,auditPublished,commitWithSyncAudit,auditCaptureFailure,auditRecordSet,auditRequestHandler,reconcileInterruptedAudit} from '../ainuoke-source/sync-audit.js';
import {validateRequestDiagnostics} from '../ainuoke-source/sync-diagnostics.js';
import {parseAuditQuery,querySyncAudit} from '../ainuoke-source/audit-query.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {loadCatalogEvidence} from '../ainuoke-source/catalog-evidence.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';

test('persistent report ledger follows real queue publication, confirmed commits, rollback, retries, HTTP permissions and Excel',async t=>{
 const f=await startCatalogFixture();
 try{
  await t.test('normal scheduler uses the ledger for directory and every published report',async()=>{
   const result=await f.tick();assert.equal(result.status,'idle');
   const batches=(await f.pool.query('SELECT * FROM ainuoke_sync_audit_batches ORDER BY started_at DESC')).rows;assert.ok(batches.length>=2);
   const rows=(await f.pool.query("SELECT * FROM ainuoke_sync_audit_tables WHERE status='success'")).rows;
   assert.ok(rows.some(r=>r.report_id==='6086103'));assert.ok(rows.some(r=>r.report_id==='6087050'));assert.ok(rows.some(r=>r.report_id==='6087105'));
   assert.ok(rows.every(r=>r.write_completed_at&&r.read_completed_at&&r.write_completed_at>=r.read_completed_at));
   assert.ok(batches.some(b=>b.sync_type==='frequent'));
   const binding=rows.find(r=>r.report_id==='6086103'&&r.cursor_info.countBasis==='selected_order_mirrors');assert.ok(binding);assert.equal(binding.inserted_count,2);assert.equal(binding.publication_ids.length,2);
   const unboundColor=rows.find(r=>r.report_id==='6087105'&&r.contract_no==='SYN-SALES-3');assert.deepEqual(unboundColor.target_tables,['ainuoke_contract_observations']);
  });
  await t.test('stable settlement ID changes update current source evidence and audit while retaining old linkage and order identity',async()=>{
   const orders=(await f.pool.query('SELECT id::text,order_no FROM sales_orders ORDER BY id')).rows;
   for(const field of ['hsid','hsId','HSID']){
    const captures=[];
    for(const value of [10101,20202]){
     const requestId=randomUUID();
     await captureCatalogOnce(f.pool,f.actor,selectedConfig,requestId,async()=>selectedWorkerFixture('catalog-discovery',`if report == 6086103: mutate_rows(payload, lambda rows: rows[0].update(${field}=${value}))`,[]));
     const run=(await f.pool.query('SELECT id::text,capture_evidence_id FROM ainuoke_catalog_runs WHERE source_key=$1 AND request_id=$2',[f.sourceKey,requestId])).rows[0];
     const evidence=await loadCatalogEvidence(f.pool,f.sourceKey,run.capture_evidence_id,accountFingerprint(selectedConfig));
     const source=evidence.discoveryAfter.flatMap(p=>p.rows).find(r=>String(r.values.id)==='1')!;
     assert.equal(source.values[field],value);assert.equal(source.values.BillNo,'SYN-SALES-1');
     const current=(await f.pool.query("SELECT observed_run_id::text FROM ainuoke_catalog_entries WHERE source_key=$1 AND source_id='1'",[f.sourceKey])).rows[0];
     assert.equal(current.observed_run_id,run.id);
     const audit=(await f.pool.query("SELECT * FROM ainuoke_sync_audit_tables WHERE batch_id=$1 AND report_id='6086103' AND contract_no=''",[requestId])).rows[0];
     assert.equal(audit.status,'success');assert.ok(audit.write_completed_at);assert.ok(audit.publication_ids.includes(run.id));
     if(value===20202){assert.equal(audit.updated_count,1);assert.equal(audit.inserted_count,0);assert.equal(audit.unchanged_count,2);}
     captures.push(run);
    }
    const previous=await loadCatalogEvidence(f.pool,f.sourceKey,captures[0].capture_evidence_id,accountFingerprint(selectedConfig));
    assert.equal(previous.discoveryAfter[0].rows[0].values[field],10101);
    assert.notEqual(captures[0].capture_evidence_id,captures[1].capture_evidence_id);
   }
   assert.deepEqual((await f.pool.query('SELECT id::text,order_no FROM sales_orders ORDER BY id')).rows,orders);
  });
  const page=(id:string,amount:number)=>({reportId:'6087051',fetchedAt:new Date().toISOString(),page:1,pageSize:50,total:1,queryContext:{salesContractNo:'SYN-AUDIT'},rows:[{values:{id,Num:amount}}]});
  const publish=async(type:string,amount:number,rollback=false)=>withSyncAudit(f.pool,{sourceKey:f.sourceKey,type,contracts:['SYN-AUDIT']},async()=>{
   const p=page('AUDIT-DETAIL-1',amount);await auditAcquired(f.pool,[p]);const c=await f.pool.connect();
   try{await c.query('BEGIN');await auditPublished(c,f.sourceKey,'SYN-PUBLICATION',[p]);
    if(rollback){await c.query('ROLLBACK');throw Object.assign(Error('private response must not be stored'),{code:'source_timeout'});}
    await commitWithSyncAudit(c);
   }finally{c.release();}
  });
  await t.test('insert/update/unchanged counts are stable identities and rolled-back writes are not success',async()=>{
   await publish('manual',1);await publish('manual',1);await publish('manual',2);await assert.rejects(publish('retry',3,true),/private response/);
   const rows=(await f.pool.query("SELECT t.* FROM ainuoke_sync_audit_tables t JOIN ainuoke_sync_audit_batches b ON b.id=t.batch_id WHERE b.contracts=ARRAY['SYN-AUDIT'] ORDER BY b.started_at,t.id")).rows;
   assert.deepEqual(rows.slice(0,3).map(r=>[r.inserted_count,r.updated_count,r.unchanged_count]),[[1,0,0],[0,0,1],[0,1,0]]);
   assert.equal(rows[3].status,'failed');assert.equal(rows[3].write_completed_at,null);
   assert.equal((await f.pool.query("SELECT content_hash FROM ainuoke_sync_audit_record_state WHERE source_key=$1 AND report_id='6087051'",[f.sourceKey])).rows[0].content_hash,[...auditRecordSet([page('AUDIT-DETAIL-1',2)]).records.values()][0]);
  });
  await t.test('HTTP 200 business rejection never counts as acquired or committed',async()=>{
   const d=validateRequestDiagnostics([{kind:'report',reportId:6087051,page:1,elapsedMs:1,httpStatus:200,outcome:'schema_error',responseIsOk:false,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()}]);
   await withSyncAudit(f.pool,{sourceKey:f.sourceKey,type:'retry'},async()=>{await auditCaptureFailure(f.pool,'source_unavailable',d);});
   const row=(await f.pool.query("SELECT * FROM ainuoke_sync_audit_tables ORDER BY id DESC")).rows.find(r=>r.error_code==='source_unavailable');assert.ok(row);assert.equal(row.status,'failed');assert.equal(row.write_completed_at,null);
  });
  await t.test('untouched receipt replay is explicit, makes no Source read and does not inflate sync success or failure',async()=>{
   const before=await querySyncAudit(f.pool,new URLSearchParams()),calls=f.captures();
   for(const reports of [[],['6086941'],['6086979']]){
    const id=randomUUID();await withSyncAudit(f.pool,{id,sourceKey:f.sourceKey,type:'manual',reports},async()=>({replayed:true}));
    const b=(await f.pool.query('SELECT status,api_requests,login_requests FROM ainuoke_sync_audit_batches WHERE id=$1',[id])).rows[0];
    assert.deepEqual(b,{status:'replayed',api_requests:0,login_requests:0});
    const rows=(await f.pool.query('SELECT * FROM ainuoke_sync_audit_tables WHERE batch_id=$1',[id])).rows;
    assert.equal(rows.length,reports.length);assert.ok(rows.every(r=>r.status==='replayed'&&r.write_completed_at===null&&r.read_completed_at===null&&r.fetched_count===0&&r.cursor_info.sourceReadThisInvocation==='none'));
   }
   const after=await querySyncAudit(f.pool,new URLSearchParams());
   for(const key of ['lastAttemptAt','todayBatches','todaySuccessTables','todayFailedTables'] as const)assert.deepEqual(after.overview[key],before.overview[key]);
   assert.equal(f.captures(),calls);assert.equal((await querySyncAudit(f.pool,new URLSearchParams('status=replayed'))).total,3);
  });
  await t.test('real manual HTTP queue, timeout and retry produce independent durable attempts',async()=>{
   const cookie=await f.login(f.admin),headers={Cookie:cookie,Origin:f.base,'Content-Type':'application/json','X-Zhixu-Request':'1'};
   const requestId=randomUUID(),input={sourceKey:f.sourceKey,sourceId:'1',requestId};
   let r=await fetch(f.base+'/api/v1/ainuoke/catalog/sync',{method:'POST',headers,body:JSON.stringify(input)});assert.equal(r.status,202);
   const initial=await r.json();f.failNextCapture();assert.equal((await f.tick()).status,'failed');
   r=await fetch(f.base+'/api/v1/ainuoke/catalog/sync',{method:'POST',headers,body:JSON.stringify({...input,requestId:randomUUID()})});assert.equal(r.status,202);
   const tick=await f.tick();assert.equal(tick.status,'processed');
   const attempts=(await f.pool.query('SELECT b.* FROM ainuoke_sync_audit_batches b JOIN ainuoke_sync_jobs j ON j.id=ANY(b.job_ids) WHERE j.id=$1 OR j.retry_of=$1 ORDER BY b.started_at',[initial.jobId])).rows;
   assert.equal(attempts.length,2);assert.equal(attempts[0].status,'failed');assert.equal(attempts[0].sync_type,'manual');assert.equal(attempts[1].status,'success');assert.equal(attempts[1].sync_type,'retry');
   assert.ok((await f.pool.query("SELECT id FROM ainuoke_sync_audit_events WHERE event_type='retry'")).rowCount);
  });
  await t.test('reused child async resource binds streamed metadata to the current batch',async()=>{
   const resource=new AsyncResource('synthetic-reused-collector'),first=randomUUID(),second=randomUUID();
   for(const id of [first,second])await withSyncAudit(f.pool,{id,sourceKey:f.sourceKey,type:'manual'},async()=>{
    const callback=auditRequestHandler(f.pool),d={kind:'report' as const,reportId:6087051 as const,page:1,elapsedMs:1,httpStatus:200,outcome:'complete' as const,receivedRows:0};
    await resource.runInAsyncScope(()=>callback('started',d));await resource.runInAsyncScope(()=>callback('finished',d));
   });
   const rows=(await f.pool.query('SELECT id,api_requests,jsonb_array_length(requests) AS receipts FROM ainuoke_sync_audit_batches WHERE id=ANY($1::uuid[])',[[first,second]])).rows;
   assert.equal(rows.length,2);assert.ok(rows.every(r=>r.api_requests===1&&r.receipts===1));resource.emitDestroy();
  });
  await t.test('metadata backfill preserves original times and never rewrites business or invokes source',async()=>{
   const id=randomUUID();await f.pool.query(`INSERT INTO ainuoke_sync_capture_attempts(id,source_key,account_fingerprint,actor_id,mode,job_ids,status,started_at,finished_at,result_code,requests,metrics)
    SELECT $1,source_key,account_fingerprint,actor_id,mode,job_ids,status,started_at,finished_at,result_code,requests,metrics FROM ainuoke_sync_capture_attempts WHERE mode='catalog-contracts' AND status='complete' ORDER BY started_at LIMIT 1`,[id]);
   const before=(await f.pool.query('SELECT (SELECT count(*) FROM sales_orders)::int AS orders,(SELECT count(*) FROM ainuoke_material_source_snapshots)::int AS snapshots,(SELECT count(*) FROM ainuoke_material_order_heads)::int AS heads')).rows[0];
   const captures=f.captures(),preview=await backfillExistingSyncAudit(f.pool,f.actor,f.sourceKey);assert.equal(preview.records,1);
   const receipt=await backfillExistingSyncAudit(f.pool,f.actor,f.sourceKey,{execute:true});assert.equal(receipt.inserted,1);
   assert.equal((await backfillExistingSyncAudit(f.pool,f.actor,f.sourceKey,{execute:true})).inserted,0);assert.equal(f.captures(),captures);
   const batch=(await f.pool.query('SELECT * FROM ainuoke_sync_audit_batches WHERE id=$1',[id])).rows[0];assert.equal(batch.origin,'historical_record');
   const table=(await f.pool.query('SELECT * FROM ainuoke_sync_audit_tables WHERE batch_id=$1',[id])).rows[0];assert.equal(table.status,'historical_published');assert.equal(table.write_completed_at,null);assert.equal(table.inserted_count,null);
   assert.deepEqual((await f.pool.query('SELECT (SELECT count(*) FROM sales_orders)::int AS orders,(SELECT count(*) FROM ainuoke_material_source_snapshots)::int AS snapshots,(SELECT count(*) FROM ainuoke_material_order_heads)::int AS heads')).rows[0],before);
  });
  await t.test('restart reconciliation keeps acknowledged rows and marks uncertain commits honestly',async()=>{
   const id=randomUUID();await f.pool.query("INSERT INTO ainuoke_sync_audit_batches(id,source_key,sync_type,job_ids) VALUES($1,$2,'frequent',$3)",[id,f.sourceKey,[randomUUID()]]);
   await f.pool.query("INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name,status) VALUES($1,'6087051','合成来源','write_pending')",[id]);
   await reconcileInterruptedAudit(f.pool,f.sourceKey);
   const row=(await f.pool.query('SELECT b.status,t.status AS table_status,t.write_completed_at,t.error_code FROM ainuoke_sync_audit_batches b JOIN ainuoke_sync_audit_tables t ON t.batch_id=b.id WHERE b.id=$1',[id])).rows[0];
   assert.equal(row.status,'interrupted');assert.equal(row.table_status,'partial');assert.equal(row.error_code,'commit_acknowledgement_missing');assert.equal(row.write_completed_at,null);
  });
  await t.test('normal HTTP query/export and immutable read-only boundary',async()=>{
   const cookie=await f.login(f.admin),reader=await f.login(f.reader);
   let r=await fetch(f.base+'/api/v1/ainuoke-sync-audit?limit=1',{headers:{Cookie:cookie}});assert.equal(r.status,200);const body=await r.json();assert.equal(body.rows.length,1);assert.ok(body.total>1);assert.ok(body.overview.lastSuccessAt);
   const second=await fetch(f.base+'/api/v1/ainuoke-sync-audit?limit=1&offset=1',{headers:{Cookie:cookie}});const next=await second.json();assert.equal(next.rows.length,1);assert.notEqual(next.rows[0].id,body.rows[0].id);
   assert.equal((await fetch(f.base+'/api/v1/ainuoke-sync-audit',{method:'POST',headers:{Cookie:cookie}})).status,405);
   r=await fetch(f.base+'/api/v1/ainuoke-sync-audit?contract=SYN-AUDIT&status=success',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.ok((await r.json()).rows.length>=3);
   assert.equal((await fetch(f.base+'/api/v1/ainuoke-sync-audit')).status,401);
   assert.equal((await fetch(f.base+'/api/v1/ainuoke-sync-audit',{headers:{Cookie:reader}})).status,403);
   r=await fetch(f.base+'/api/v1/ainuoke-sync-audit/export?contract=SYN-AUDIT',{headers:{Cookie:cookie}});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);assert.ok(book.worksheets[0].rowCount>3);
   await assert.rejects(f.pool.query('DELETE FROM ainuoke_sync_audit_batches'),/cannot be deleted/);
   const captured=f.captures();await f.restartHttp();
   // A fresh TCP client avoids reusing the deliberately closed fetch keepalive.
   const afterRestart=await new Promise<{status:number|undefined;total:number}>((resolve,reject)=>{
    httpGet(f.base+'/api/v1/ainuoke-sync-audit?limit=1',{agent:false,headers:{Cookie:cookie}},response=>{let text='';response.on('data',chunk=>{text+=chunk;});response.on('error',reject);response.on('end',()=>{try{resolve({status:response.statusCode,total:JSON.parse(text).total});}catch(e){reject(e);}});}).on('error',reject);
   });assert.equal(afterRestart.status,200);assert.equal(afterRestart.total,body.total);assert.equal(f.captures(),captured);
   const c=await f.pool.connect();try{assert.ok(Number((await c.query('SELECT count(*) FROM ainuoke_sync_audit_batches')).rows[0].count)>3);}finally{c.release();}
   assert.throws(()=>parseAuditQuery(new URLSearchParams('start=2026-02-30')),/日期/);
  });
 }finally{await f.close();}
});

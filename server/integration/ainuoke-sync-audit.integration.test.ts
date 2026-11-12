import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {withSyncAudit,auditAcquired,auditPublished,commitWithSyncAudit,auditCaptureFailure,auditRecordSet} from '../ainuoke-source/sync-audit.js';
import {validateRequestDiagnostics} from '../ainuoke-source/sync-diagnostics.js';
import {parseAuditQuery} from '../ainuoke-source/audit-query.js';

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
  await t.test('normal HTTP query/export and immutable read-only boundary',async()=>{
   const cookie=await f.login(f.admin),reader=await f.login(f.reader);
   let r=await fetch(f.base+'/api/v1/ainuoke-sync-audit?limit=1',{headers:{Cookie:cookie}});assert.equal(r.status,200);const body=await r.json();assert.equal(body.rows.length,1);assert.ok(body.total>1);assert.ok(body.overview.lastSuccessAt);
   r=await fetch(f.base+'/api/v1/ainuoke-sync-audit?contract=SYN-AUDIT&status=success',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.ok((await r.json()).rows.length>=3);
   assert.equal((await fetch(f.base+'/api/v1/ainuoke-sync-audit')).status,401);
   assert.equal((await fetch(f.base+'/api/v1/ainuoke-sync-audit',{headers:{Cookie:reader}})).status,403);
   r=await fetch(f.base+'/api/v1/ainuoke-sync-audit/export?contract=SYN-AUDIT',{headers:{Cookie:cookie}});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);assert.ok(book.worksheets[0].rowCount>3);
   await assert.rejects(f.pool.query('DELETE FROM ainuoke_sync_audit_batches'),/cannot be deleted/);
   const c=await f.pool.connect();try{assert.ok(Number((await c.query('SELECT count(*) FROM ainuoke_sync_audit_batches')).rows[0].count)>3);}finally{c.release();}
   assert.throws(()=>parseAuditQuery(new URLSearchParams('start=2026-02-30')),/日期/);
  });
 }finally{await f.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {historicalSourceFixture} from './historical-source-fixture.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {reconcileInitialCatalogAudit} from '../ainuoke-source/audit-catalog-reconciliation.js';
import {catalogAuditRecordSet} from '../ainuoke-source/sync-audit.js';

test('first ledger compares packed legacy catalogue and reconciles only proven metadata',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('packed_audit')});
 const historical=await historicalSourceFixture();
 try{
  await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'Synthetic audit admin',password:'Synthetic-Audit-2026'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername),sourceKey=selectedConfig.sourceKey;
  const bound=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  assert.ok(bound.result==='complete'&&bound.mode==='selected-bindings');
  await historical.bindOrders(pool,actor,{sourceKey,accountFingerprint:accountFingerprint(selectedConfig),selected:selectedContracts,expectedPreview:bound.preview.reviewHash,collect:async()=>bound.bundle});
  const old=await validateSelectedSourceOnce(selectedWorkerFixture('catalog-discovery',"if report == 6086103: mutate_rows(payload, lambda rows: rows[0].update(hsid=100))",[]),selectedConfig,{mode:'catalog-discovery',contracts:[]});
  assert.ok(old.result==='complete'&&old.mode==='catalog-discovery');
  await historical.publishCatalog(pool,actor,{sourceKey,accountFingerprint:accountFingerprint(selectedConfig),requestId:randomUUID(),input:old.bundle,expectedHash:old.preview.contentHash});
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_sync_audit_batches')).rows[0].n,0);
  const batchId=randomUUID();
  await t.test('packed baseline counts only new and changed source identities',async()=>{
   await captureCatalogOnce(pool,actor,selectedConfig,batchId,async()=>selectedWorkerFixture('catalog-discovery',"if report == 6086103: mutate_rows(payload, lambda rows: rows[0].update(hsid=200))",[],4));
   const row=(await pool.query("SELECT * FROM ainuoke_sync_audit_tables WHERE batch_id=$1 AND report_id='6086103'",[batchId])).rows[0];
   assert.deepEqual([row.inserted_count,row.updated_count,row.unchanged_count],[1,1,2]);assert.equal(row.status,'success');assert.ok(row.write_completed_at);
  });
  await t.test('unavailable prior evidence is not an all-new baseline',async()=>{
   await assert.rejects(catalogAuditRecordSet(pool,sourceKey,{capture_evidence_id:null,account_fingerprint:accountFingerprint(selectedConfig),discovery:[]}),/catalog_audit_baseline_unavailable/);
   await assert.rejects(catalogAuditRecordSet(pool,sourceKey,{capture_evidence_id:randomUUID(),account_fingerprint:accountFingerprint(selectedConfig),discovery:[]}),/catalog_evidence_invalid/);
  });
  // Reproduce the deployed pre-fix metadata without changing any business row.
  await pool.query("UPDATE ainuoke_sync_audit_tables SET inserted_count=4,updated_count=0,unchanged_count=0 WHERE batch_id=$1 AND report_id='6086103'",[batchId]);
  const before=(await pool.query('SELECT * FROM ainuoke_sync_audit_tables WHERE batch_id=$1',[batchId])).rows[0];
  const facts=async()=>{
   const result=[];for(const table of ['sales_orders','sales_order_source_links','ainuoke_catalog_entries','ainuoke_catalog_runs','ainuoke_catalog_capture_evidence','ainuoke_catalog_evidence_chunks','ainuoke_sync_audit_record_state'])
    result.push((await pool.query(`SELECT count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text) hash FROM ${table} t`)).rows[0]);
   return result;
  };
  const baseline=await facts(),logs=Number((await pool.query('SELECT count(*) FROM operation_logs')).rows[0].count);
  let reviewHash='';
  await t.test('preview is readonly and execute requires the exact review',async()=>{
   const preview=await reconcileInitialCatalogAudit(pool,actor,sourceKey,batchId);assert.equal(preview.state,'audit_catalog_reconciliation_preview');
   assert.deepEqual(preview.counts,{inserted:1,updated:1,unchanged:2});reviewHash=preview.reviewHash;
   assert.deepEqual((await pool.query('SELECT * FROM ainuoke_sync_audit_tables WHERE batch_id=$1',[batchId])).rows[0],before);
   await assert.rejects(reconcileInitialCatalogAudit(pool,actor,sourceKey,batchId,{execute:true,expectedHash:'0'.repeat(64)}),/preview_changed/);
   await assert.rejects(reconcileInitialCatalogAudit(pool,{...actor,userId:randomUUID()},sourceKey,batchId,{execute:true,expectedHash:reviewHash}));
  });
  await t.test('correction retains original evidence, times, status and business state; replay is idempotent',async()=>{
   const result=await reconcileInitialCatalogAudit(pool,actor,sourceKey,batchId,{execute:true,expectedHash:reviewHash});assert.equal(result.state,'audit_catalog_reconciliation_complete');
   const after=(await pool.query('SELECT * FROM ainuoke_sync_audit_tables WHERE batch_id=$1',[batchId])).rows[0];
   for(const key of ['status','write_completed_at','read_started_at','read_completed_at','publication_ids','transaction_id','fetched_count','duplicate_count'])assert.deepEqual(after[key],before[key]);
   assert.deepEqual(after.cursor_info.baselineCorrection.originalCounts,{inserted:4,updated:0,unchanged:0});assert.deepEqual(after.cursor_info.baselineCorrection.correctedCounts,{inserted:1,updated:1,unchanged:2});
   assert.ok(after.cursor_info.baselineCorrection.recordedAt);assert.equal(after.cursor_info.baselineCorrection.reviewHash,reviewHash);
   assert.equal((await reconcileInitialCatalogAudit(pool,actor,sourceKey,batchId,{execute:true,expectedHash:reviewHash})).state,'audit_catalog_reconciliation_replayed');
   assert.deepEqual(await facts(),baseline);assert.equal(Number((await pool.query('SELECT count(*) FROM operation_logs')).rows[0].count),logs+1);
  });
 }finally{await historical.close();await pool.end();await db.stop();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {hydrateContractEvidence} from '../ainuoke-source/catalog-evidence.js';
import {importVerifiedMaterialArchive,type MaterialArchiveRecord} from '../ainuoke-source/material-archive.js';
import {hash} from '../ainuoke-source/contract.js';
import {requestContractSync} from '../ainuoke-source/sync-queue.js';
import {randomUUID} from 'node:crypto';

test('verified archive uses target identities, publishes atomically and preserves refresh/history on replay', {timeout:180000}, async () => {
 const f=await startCatalogFixture();
 try {
  const observation=(await f.pool.query(`SELECT o.*,p.account_fingerprint,e.sales_contract_no FROM ainuoke_contract_observations o
   JOIN ainuoke_source_profiles p USING(source_key) JOIN ainuoke_catalog_entries e USING(source_key,source_id)
   WHERE e.sales_contract_no='SYN-SALES-3'`)).rows[0];
  const evidence=await hydrateContractEvidence(f.pool,observation);
  const record:MaterialArchiveRecord={sourceId:observation.source_id,salesContractNo:observation.sales_contract_no,
   observationId:observation.id,capturedAt:new Date(observation.captured_at).toISOString(),evidence,evidenceHash:hash(evidence)};
  const scope={sourceKey:f.sourceKey,accountFingerprint:observation.account_fingerprint};
  const before=Number((await f.pool.query('SELECT count(*) n FROM sales_orders')).rows[0].n);
  const captures=(await f.pool.query('SELECT count(*)::int n FROM ainuoke_sync_capture_attempts')).rows[0].n;
  const result=await importVerifiedMaterialArchive(f.pool,f.actor,scope,record);
  assert.equal(result.status,'historical_published');
  assert.equal(Number((await f.pool.query('SELECT count(*) n FROM sales_orders')).rows[0].n),before+1);
  const pointer=(await f.pool.query(`SELECT h.run_id::text,r.captured_at,s.sales_contract_no FROM ainuoke_material_order_heads h
   JOIN ainuoke_source_runs r ON r.id=h.run_id JOIN ainuoke_material_source_snapshots s ON s.run_id=h.run_id AND s.sales_order_id=h.sales_order_id
   WHERE h.sales_order_id=$1`,[result.orderId])).rows[0];
  assert.equal(pointer.run_id,result.runId);assert.equal(pointer.sales_contract_no,record.salesContractNo);
  assert.equal(new Date(pointer.captured_at).toISOString(),record.capturedAt);
  const manual=await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:record.sourceId,requestId:randomUUID()});
  assert.equal((await importVerifiedMaterialArchive(f.pool,f.actor,scope,record)).status,'existing_head_preserved');
  assert.equal((await f.pool.query('SELECT status FROM ainuoke_sync_jobs WHERE id=$1',[manual.jobId])).rows[0].status,'queued');
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM ainuoke_sync_capture_attempts')).rows[0].n,captures);
  await assert.rejects(importVerifiedMaterialArchive(f.pool,f.actor,{...scope,accountFingerprint:'0'.repeat(64)},record),/source_account_mismatch/);
  await assert.rejects(importVerifiedMaterialArchive(f.pool,f.actor,scope,{...record,evidenceHash:'0'.repeat(64)}),/historical_material_evidence_invalid/);
  await assert.rejects(importVerifiedMaterialArchive(f.pool,f.actor,scope,{...record,sourceId:'wrong-source'}),/source_scope_mismatch/);
  const failed=structuredClone(record);failed.evidence.materials[0].rows.push(failed.evidence.materials[0].rows[0]);failed.evidenceHash=hash(failed.evidence);
  await assert.rejects(importVerifiedMaterialArchive(f.pool,f.actor,scope,{...failed,salesContractNo:'wrong-contract'}));
  assert.equal((await f.pool.query('SELECT run_id::text FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[result.orderId])).rows[0].run_id,result.runId);
 }finally{await f.close();}
});

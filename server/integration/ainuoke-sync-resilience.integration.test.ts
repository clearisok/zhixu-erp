import test from 'node:test';
import assert from 'node:assert/strict';
import { startCatalogFixture } from './ainuoke-catalog-fixture.js';
import { hydrateContractEvidence, loadCatalogEvidence, saveCatalogEvidence } from '../ainuoke-source/catalog-evidence.js';
import { hash } from '../ainuoke-source/contract.js';
import { accountFingerprint } from '../ainuoke-source/collector.js';
import { selectedConfig } from './selected-source-fixture.js';
import { readCatalogDetail } from '../ainuoke-source/catalog-detail.js';

test('shared catalogue evidence keeps exact captures and old readers without rewriting history',{timeout:180000},async t=>{
 const f=await startCatalogFixture();
 try {
  const observations=(await f.pool.query(`SELECT o.*,p.account_fingerprint FROM ainuoke_contract_observations o JOIN ainuoke_source_profiles p USING(source_key) ORDER BY source_id`)).rows;
  await t.test('one group shares a capture and original immutable rows reconstruct exactly',async()=>{
   assert.equal(observations.length,3);
   assert.equal(new Set(observations.map(o=>o.capture_evidence_id)).size,1);
   for(const row of observations){
    assert.equal(row.evidence.schemaVersion,'ainuoke-contract-observation.v2');
    assert.equal(row.evidence.addition,undefined);
    const hydrated=await hydrateContractEvidence(f.pool,row);
    assert.ok(hydrated.addition.discoveryAfter[0].rows.length>0);
    const legacy={...row,capture_evidence_id:null,evidence:hydrated,content_hash:hash(hydrated)};
    assert.deepEqual(await hydrateContractEvidence(f.pool,legacy),hydrated);
    assert.equal((await readCatalogDetail(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:row.source_id})).status,'observed');
   }
  });
  await t.test('changed capture times reuse row content but preserve both exact timestamped proofs',async()=>{
   const fp=accountFingerprint(selectedConfig),id=observations[0].capture_evidence_id;
   const original=await loadCatalogEvidence(f.pool,f.sourceKey,id,fp);
   const before=Number((await f.pool.query('SELECT count(*) n FROM ainuoke_catalog_evidence_chunks')).rows[0].n);
   const next=structuredClone(original);
   for(const page of [...next.discoveryBefore,...next.discoveryAfter])page.fetchedAt=new Date(Date.parse(page.fetchedAt)+1000).toISOString();
   const nextId=await saveCatalogEvidence(f.pool,f.sourceKey,fp,next);
   assert.notEqual(nextId,id);
   assert.equal(await saveCatalogEvidence(f.pool,f.sourceKey,fp,next),nextId);
   assert.equal(Number((await f.pool.query('SELECT count(*) n FROM ainuoke_catalog_evidence_chunks')).rows[0].n),before);
   assert.deepEqual(await loadCatalogEvidence(f.pool,f.sourceKey,nextId,fp),next);
   assert.deepEqual(await loadCatalogEvidence(f.pool,f.sourceKey,id,fp),original);
   await assert.rejects(loadCatalogEvidence(f.pool,f.sourceKey,id,'0'.repeat(64)),/catalog_evidence_invalid/);
   await assert.rejects(f.pool.query('UPDATE ainuoke_catalog_evidence_chunks SET rows=rows'),/immutable/);
   await assert.rejects(f.pool.query('DELETE FROM ainuoke_catalog_capture_evidence'),/immutable/);
  });
 }finally{await f.close();}
});

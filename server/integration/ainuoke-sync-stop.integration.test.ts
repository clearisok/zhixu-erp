import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startCatalogFixture } from './ainuoke-catalog-fixture.js';
import { selectedConfig, selectedWorkerFixture } from './selected-source-fixture.js';
import { runSyncTick } from '../ainuoke-source/sync-worker.js';
import { requestContractSync } from '../ainuoke-source/sync-queue.js';
import { recoverSync } from '../ainuoke-source/sync-recovery.js';
import type { RequestDiagnostic } from '../ainuoke-source/sync-diagnostics.js';
import { captureCatalogOnce } from '../ainuoke-source/catalog-capture.js';

// Future scheduler ticks are part of the no-retry boundary, not just child jobs.
for (const mode of ['catalog-discovery', 'catalog-contracts'] as const) {
 test(`${mode}: unsafe capture failures pause later ticks and retain successful facts`, { timeout: 180000 }, async t => {
  const f = await startCatalogFixture();
  try {
   const before = (await f.pool.query('SELECT source_id,observation_id,last_success_at FROM ainuoke_contract_sync_state ORDER BY source_id')).rows;
   const entry = (await f.pool.query('SELECT source_id,sales_contract_no FROM ainuoke_catalog_entries ORDER BY source_id LIMIT 1')).rows[0];
   const cases = [
    { name: 'certificate failure', code: 'source_unavailable', outcome: 'tls_error', httpStatus: null },
    { name: 'upstream permission refusal', code: 'source_unavailable', outcome: 'http_error', httpStatus: 403 },
    { name: 'pagination bound exceeded', code: 'selected_source_page_limit', outcome: 'schema_error', httpStatus: null },
    { name: 'invalid business payload', code: 'selected_source_invalid', outcome: 'schema_error', httpStatus: null },
   ];
   for (const [index, fault] of cases.entries()) await t.test(fault.name, async () => {
    const preview = await recoverSync(f.pool, f.actor, f.sourceKey);
    if ('control' in preview && preview.control.paused_reason) await recoverSync(f.pool, f.actor, f.sourceKey, { expectedHash: preview.reviewHash, reason: 'Synthetic fault case resolved' });
    if (mode === 'catalog-contracts') await requestContractSync(f.pool, f.actor, { sourceKey: f.sourceKey, sourceId: entry.source_id, requestId: randomUUID() });
    const now = Date.now() + (index + 1) * 3600000;
    let calls = 0;
    const collect = async () => {
     calls++;
     const raw = selectedWorkerFixture(mode, '', mode === 'catalog-contracts' ? [entry.sales_contract_no] : []);
     return { schemaVersion: 'ainuoke-request-diagnostics.v1', capture: {
      ...(raw as Record<string, unknown>), result: 'failed', bundle: null, code: fault.code,
      metrics: { logins: 1, reportRequests: 1, httpAttempts: 2, networkRetries: 0, authRenewals: 0 },
     }, requests: [
      { kind: 'login', reportId: null, page: null, elapsedMs: 10, outcome: 'complete', httpStatus: null },
      { kind: 'report', reportId: mode === 'catalog-discovery' ? 6086103 : 6087105, page: 1, elapsedMs: 20, outcome: fault.outcome, httpStatus: fault.httpStatus },
     ] };
    };
    if (mode === 'catalog-discovery') await assert.rejects(runSyncTick(f.pool, f.actor, selectedConfig, { now: () => now, collect }), { message: fault.code });
    else assert.equal((await runSyncTick(f.pool, f.actor, selectedConfig, { automatic: false, now: () => now, collect })).status, 'failed');
    assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0].paused_reason, fault.code);
    // Even a fresh scheduling slot cannot cause another collector invocation.
    assert.equal((await runSyncTick(f.pool, f.actor, selectedConfig, { now: () => now + 86400000, collect })).status, 'paused');
    assert.equal(calls, 1);
    assert.deepEqual((await f.pool.query('SELECT source_id,observation_id,last_success_at FROM ainuoke_contract_sync_state ORDER BY source_id')).rows, before);
    assert.equal(Number((await f.pool.query("SELECT count(*) n FROM ainuoke_sync_jobs WHERE status='queued' AND retry_of IS NOT NULL")).rows[0].n), 0);
   });
  } finally { await f.close(); }
 });
}

for (const mode of ['catalog-discovery', 'catalog-contracts'] as const) {
 test(`${mode}: domain validation failure retains safe request evidence without publishing or retrying`, { timeout: 180000 }, async () => {
  const f = await startCatalogFixture();
  try {
   const before = (await f.pool.query('SELECT source_id,observation_id,last_success_at FROM ainuoke_contract_sync_state ORDER BY source_id')).rows;
   const entry = (await f.pool.query('SELECT source_id,sales_contract_no FROM ainuoke_catalog_entries ORDER BY source_id LIMIT 1')).rows[0];
   if (mode === 'catalog-contracts') await requestContractSync(f.pool, f.actor, { sourceKey: f.sourceKey, sourceId: entry.source_id, requestId: randomUUID() });
   const now = Date.now();
   let calls = 0;
   let requests:RequestDiagnostic[] = [];
   const collect = async () => {
    calls++;
    const raw = selectedWorkerFixture(mode, '', mode === 'catalog-contracts' ? [entry.sales_contract_no] : []) as {
     bundle:{ discoveryAfter:Array<{ rows:Array<{values:Record<string,unknown>}> }> };
     metrics:{httpAttempts:number};
    };
    // Transport succeeded, but the before/after directory is no longer stable.
    raw.bundle.discoveryAfter[0].rows[0].values.UnknownField = 'changed during capture';
    requests = Array.from({length:raw.metrics.httpAttempts},(_,i) => i===0
     ? {kind:'login',reportId:null,page:null,elapsedMs:11,outcome:'complete',httpStatus:200}
     : {kind:'report',reportId:6086103,page:1,elapsedMs:37+i,outcome:'complete',httpStatus:200});
    return {schemaVersion:'ainuoke-request-diagnostics.v1',capture:raw,requests};
   };
   if (mode === 'catalog-discovery') await assert.rejects(captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),collect),/catalog_identity_or_scope_changed/);
   else assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,collect})).status,'failed');
   const attempt=(await f.pool.query('SELECT status,result_code,requests,metrics FROM ainuoke_sync_capture_attempts ORDER BY started_at DESC LIMIT 1')).rows[0];
   assert.equal(attempt.status,'failed');assert.equal(attempt.result_code,'catalog_identity_or_scope_changed');
   assert.deepEqual(attempt.requests,requests);
   assert.equal(attempt.metrics,null); // Rejected payload metrics are not trusted.
   assert.equal((await f.pool.query('SELECT paused_reason FROM ainuoke_sync_controls')).rows[0].paused_reason,'catalog_identity_or_scope_changed');
   assert.equal((await runSyncTick(f.pool,f.actor,selectedConfig,{now:()=>now+86400000,collect})).status,'paused');
   assert.equal(calls,1);
   assert.deepEqual((await f.pool.query('SELECT source_id,observation_id,last_success_at FROM ainuoke_contract_sync_state ORDER BY source_id')).rows,before);
   assert.equal(Number((await f.pool.query("SELECT count(*) n FROM ainuoke_sync_jobs WHERE retry_of IS NOT NULL AND status='queued'")).rows[0].n),0);
  } finally { await f.close(); }
 });
}

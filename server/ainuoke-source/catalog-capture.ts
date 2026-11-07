import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { sourceActor } from './service.js';
import { requireAdditionProfile } from './additions.js';
import { accountFingerprint, parseCollectorConfig, type CollectorConfig } from './collector.js';
import { validateSelectedSourceOnce, type SelectedSourceRequest } from './selected-source-once.js';
import { publishCatalog } from './catalog.js';
import { SourceError } from './contract.js';
import { randomUUID } from 'node:crypto';
import { CatalogDiagnosticValidationError, collectCatalogDiagnostic, validateCatalogDiagnostic, finishCaptureAttempt, retryableCapture, type RequestDiagnostic } from './sync-diagnostics.js';
type Identity=Pick<TrustedIdentity,'internalUserId'|'userId'>;
export async function readCatalogCaptureReceipt(pool:Pool,identity:Identity,sourceKey:string,requestId:string){
 const actor=await sourceActor(pool,identity,true);
 const row=(await pool.query(`SELECT status,result FROM ainuoke_catalog_requests WHERE source_key=$1 AND request_id=$2 AND actor_id=$3`,[sourceKey,requestId,actor.internalUserId])).rows[0];
 const committed=(await pool.query(`SELECT r.id::text AS "runId",jsonb_array_length(CASE WHEN r.capture_evidence_id IS NULL THEN r.discovery ELSE e.directory->'discoveryAfter' END) AS pages
  FROM ainuoke_catalog_runs r LEFT JOIN ainuoke_catalog_capture_evidence e ON e.source_key=r.source_key AND e.id=r.capture_evidence_id
  WHERE r.source_key=$1 AND r.request_id=$2 AND r.actor_user_id=$3`,[sourceKey,requestId,actor.internalUserId])).rows[0];
 return committed?{status:'complete',result:committed}:row??null;
}
/** Persist the attempt before any HTTP, so a lost receipt cannot spend it twice. */
export async function captureCatalogOnce(pool:Pool,identity:Identity,raw:CollectorConfig,requestId:string,
 collect?:(config:CollectorConfig,request:SelectedSourceRequest)=>Promise<unknown>,workerLease?:PoolClient,adoptNewOrders=false) {
 const config=parseCollectorConfig(raw),lease=workerLease??await pool.connect();let locked=false;
 try {
  // Reentrant on the worker's session; standalone captures and recovery must
  // share this lease so recovery cannot race an upstream call still in flight.
  locked=(await lease.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',['ainuoke-sync-worker:'+config.sourceKey])).rows[0].locked;
  if(!locked)throw new SourceError('sync_worker_busy');
  return await captureUnderLease(pool,identity,config,requestId,collect,adoptNewOrders);
 }finally{
  if(locked)await lease.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ainuoke-sync-worker:'+config.sourceKey]).catch(()=>undefined);
  if(!workerLease)lease.release();
 }
}
async function captureUnderLease(pool:Pool,identity:Identity,raw:CollectorConfig,requestId:string,
 collect?:(config:CollectorConfig,request:SelectedSourceRequest)=>Promise<unknown>,adoptNewOrders=false) {
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))throw new SourceError('catalog_request_invalid');
 const config=parseCollectorConfig(raw),actor=await sourceActor(pool,identity,true);requirePermission(actor.permissions,'ainuoke.bind');
 const fingerprint=accountFingerprint(config);await requireAdditionProfile(pool,config.sourceKey,fingerprint);
 const prior=await readCatalogCaptureReceipt(pool,identity,config.sourceKey,requestId);
 if(prior)return {...prior,replayed:true};
 const started=await pool.query(`INSERT INTO ainuoke_catalog_requests(source_key,request_id,actor_id,account_fingerprint,status) VALUES($1,$2,$3,$4,'running') ON CONFLICT DO NOTHING RETURNING request_id`,[config.sourceKey,requestId,actor.internalUserId,fingerprint]);
 if(!started.rowCount)throw new SourceError('catalog_request_in_progress');
 let diagnosticId:string|null=null,diagnostics:RequestDiagnostic[]|null=null,metrics:unknown=null;
 try {
  const request:SelectedSourceRequest={mode:'catalog-discovery',contracts:[]};
  diagnosticId=randomUUID();
  await pool.query(`INSERT INTO ainuoke_sync_capture_attempts(id,source_key,account_fingerprint,actor_id,mode,job_ids,status,started_at)
   VALUES($1,$2,$3,$4,'catalog-discovery','{}'::uuid[],'running',now())`,[diagnosticId,config.sourceKey,fingerprint,actor.internalUserId]);
  let captured;
  if(collect){
   const raw=await collect(config,request);
   if(raw&&typeof raw==='object'&&'schemaVersion' in raw&&['ainuoke-request-diagnostics.v1','ainuoke-session-diagnostics.v1'].includes(String(raw.schemaVersion))){
    const checked=await validateCatalogDiagnostic(raw,config,request,Date.now());captured=checked.capture;diagnostics=checked.diagnostics;
   }else captured=await validateSelectedSourceOnce(raw,config,request);
  }else{const checked=await collectCatalogDiagnostic(config,request);captured=checked.capture;diagnostics=checked.diagnostics;}
  metrics=captured.metrics;
  if(captured.result!=='complete')throw new SourceError(captured.code);
  if(captured.mode!=='catalog-discovery')throw new SourceError('catalog_invalid');
  await finishCaptureAttempt(pool,diagnosticId,null,diagnostics,metrics,Date.now());
  const result=await publishCatalog(pool,identity,{sourceKey:config.sourceKey,accountFingerprint:fingerprint,requestId,input:captured.bundle,expectedHash:captured.preview.contentHash,adoptNewOrders});
  await pool.query("UPDATE ainuoke_catalog_requests SET status='complete',result=$3::jsonb,finished_at=now() WHERE source_key=$1 AND request_id=$2",[config.sourceKey,requestId,JSON.stringify({...result,metrics:captured.metrics})]);
  return {status:'complete',result,replayed:false};
 }catch(e){
  if(e instanceof CatalogDiagnosticValidationError)diagnostics=e.diagnostics;
  const committed=(await pool.query('SELECT id::text FROM ainuoke_catalog_runs WHERE source_key=$1 AND request_id=$2',[config.sourceKey,requestId]).catch(()=>({rows:[]}))).rows[0];
  if(committed){await pool.query("UPDATE ainuoke_catalog_requests SET status='complete',result=$3::jsonb,finished_at=now() WHERE source_key=$1 AND request_id=$2",[config.sourceKey,requestId,JSON.stringify({runId:committed.id})]);return {status:'complete',result:{runId:committed.id},replayed:true};}
  const code=e instanceof SourceError?e.code:'catalog_result_unknown';
  if(diagnosticId)await finishCaptureAttempt(pool,diagnosticId,code,diagnostics,metrics,Date.now());
  await pool.query('UPDATE ainuoke_catalog_requests SET status=$3,result=$4::jsonb,finished_at=now() WHERE source_key=$1 AND request_id=$2',[config.sourceKey,requestId,e instanceof SourceError?'failed':'unknown',JSON.stringify({code})]).catch(()=>undefined);
  // Only proven transient failures can be scheduled again. Certificate, scope,
  // permission, pagination and unknown failures must also stop future ticks.
  if(!retryableCapture(code,diagnostics))await pool.query('UPDATE ainuoke_sync_controls SET paused_reason=$2 WHERE source_key=$1',[config.sourceKey,code]).catch(()=>undefined);
  throw e;
 }
}

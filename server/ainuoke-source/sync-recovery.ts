import type {Pool, PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {sourceActor} from './service.js';
import {hash, SourceError, sourceKeyValid} from './contract.js';
import {retryableCapture,type RequestDiagnostic} from './sync-diagnostics.js';
import {reconcileInterruptedAudit} from './sync-audit.js';

type Identity=Pick<TrustedIdentity,'internalUserId'|'userId'>;

/** A known transport outage exhausts its short retry burst, then waits a full
 * catalogue interval. Authentication/identity/business/unknown pauses never
 * enter this path. No Source request or success timestamp is changed here. */
export async function resumeTransientCatalogBackoff(pool:Pool,identity:Identity,sourceKey:string,now=Date.now()){
 const c=await pool.connect();let locked=false;
 try{
  locked=(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',['ainuoke-sync-worker:'+sourceKey])).rows[0].locked;
  if(!locked)return null;
  await c.query('BEGIN');const actor=await sourceActor(c,identity,true);
  const control=(await c.query('SELECT enabled,paused_reason,policy FROM ainuoke_sync_controls WHERE source_key=$1 FOR UPDATE',[sourceKey])).rows[0];
  if(!control?.enabled){await c.query('COMMIT');return null;}
  if(control.paused_reason==='catalog_changed_or_over_limit'){
   // Narrow migration of the independently observed old composite error.
   // The unchanged contract identities/scope and hsid-only delta authorize a
   // NEW complete capture, not acceptance or modification of failed evidence.
   const old=(await c.query(`WITH latest AS (SELECT * FROM ainuoke_sync_capture_attempts WHERE source_key=$1 ORDER BY started_at DESC,id DESC LIMIT 1)
    SELECT a.finished_at,a.requests,j.result->'catalogChange' AS change FROM latest a
    JOIN ainuoke_sync_jobs j ON j.capture_attempt_id=a.id WHERE a.status='failed'
    AND a.result_code='catalog_changed_or_over_limit' ORDER BY j.id LIMIT 1`,[sourceKey])).rows[0];
   const d=old?.change;
   if(!d||d.beforeRows!==d.afterRows||d.beforeRows>1400||d.added!==0||d.removed!==0||d.identityChanges!==0||d.scopeChanged!==false
    ||JSON.stringify(d.changedFields)!=='["hsid"]'||!Array.isArray(old.requests)||old.requests.length===0
    ||old.requests.some((r:RequestDiagnostic)=>r.outcome!=='complete')){await c.query('COMMIT');return null;}
   const at=new Date(old.finished_at).getTime()+control.policy.catalogMinutes*60000;
   if(now<at){await c.query('COMMIT');return {resumed:false,retryAt:new Date(at).toISOString()};}
   await c.query(`UPDATE ainuoke_sync_controls SET paused_reason=NULL,catalog_failure_count=0,catalog_retry_at=NULL,
    version=version+1,updated_at=now() WHERE source_key=$1`,[sourceKey]);
   await c.query('COMMIT');return {resumed:true,retryAt:new Date(at).toISOString()};
  }
  if(control.paused_reason!=='catalog_retries_exhausted'){await c.query('COMMIT');return null;}
  const attempt=(await c.query(`SELECT result_code,requests,finished_at FROM ainuoke_sync_capture_attempts
   WHERE source_key=$1 AND mode='catalog-discovery' ORDER BY started_at DESC,id DESC LIMIT 1`,[sourceKey])).rows[0];
  if(!attempt?.finished_at||!['source_timeout','selected_source_timeout','source_unavailable','catalog_non_identity_content_changed','catalog_business_content_changed','catalog_additions_observed'].includes(attempt.result_code)
   ||!retryableCapture(attempt.result_code,attempt.requests as RequestDiagnostic[]|null)){await c.query('COMMIT');return null;}
  const retryAt=new Date(attempt.finished_at).getTime()+control.policy.catalogMinutes*60000;
  if(now<retryAt){await c.query('COMMIT');return {resumed:false,retryAt:new Date(retryAt).toISOString()};}
  await c.query(`UPDATE ainuoke_sync_controls SET paused_reason=NULL,catalog_failure_count=0,catalog_retry_at=NULL,
   version=version+1,updated_at=now() WHERE source_key=$1`,[sourceKey]);
  await appendOperationLog(c,actor,{module:'艾诺科同步',action:'设置自动同步',entityType:'AinuokeSyncPolicy',entityId:sourceKey,
   metadata:{sourceRequests:0,reason:'明确网络故障的有限重试已耗尽；等待一个目录周期后重新评估'},afterData:{values:{result:'网络退避结束，保留原成功数据与待处理任务'}}});
  await c.query('COMMIT');return {resumed:true,retryAt:new Date(retryAt).toISOString()};
 }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{
  if(locked)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ainuoke-sync-worker:'+sourceKey]).catch(()=>undefined);c.release();
 }
}
async function snapshot(c:PoolClient,sourceKey:string){
 const control=(await c.query('SELECT enabled,version,paused_reason,operator_id::text,catalog_failure_count,catalog_retry_at FROM ainuoke_sync_controls WHERE source_key=$1',[sourceKey])).rows[0];
 if(!control)throw new SourceError('sync_configuration_invalid');
 const jobs=(await c.query("SELECT id::text,status,result FROM ainuoke_sync_jobs WHERE source_key=$1 AND status IN ('running','unknown') ORDER BY id",[sourceKey])).rows;
 const captures=(await c.query(`SELECT r.request_id::text,r.status,r.result,run.id::text AS committed_run
  FROM ainuoke_catalog_requests r LEFT JOIN ainuoke_catalog_runs run ON run.source_key=r.source_key AND run.request_id=r.request_id
  WHERE r.source_key=$1 AND r.status IN ('running','unknown') ORDER BY r.request_id`,[sourceKey])).rows;
 return {sourceKey,control,jobs,captures};
}
/** Explicit operator recovery. Obtains the same worker lease; never reads upstream,
 * claims success without an immutable publication, or enables a disabled worker. */
export async function recoverSync(pool:Pool,identity:Identity,sourceKey:string,approval?:{expectedHash:string;reason:string}){
 if(!sourceKeyValid(sourceKey)||approval&&(!/^[a-f0-9]{64}$/.test(approval.expectedHash)||typeof approval.reason!=='string'||approval.reason.trim().length<3||approval.reason.length>300))throw new SourceError('sync_recovery_invalid');
 const c=await pool.connect();let locked=false;
 try{
  locked=(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',['ainuoke-sync-worker:'+sourceKey])).rows[0].locked;
  if(!locked)throw new SourceError('sync_worker_busy');
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ainuoke-sync-queue:'+sourceKey]);
  const actor=await sourceActor(c,identity,true);requirePermission(actor.permissions,'ainuoke.bind');
  await c.query('SELECT source_key FROM ainuoke_sync_controls WHERE source_key=$1 FOR UPDATE',[sourceKey]);
  const before=await snapshot(c,sourceKey),reviewHash=hash(before);
  if(!approval){await c.query('COMMIT');return {...before,reviewHash,sourceRequests:0};}
  if(approval.expectedHash!==reviewHash)throw new SourceError('sync_recovery_preview_changed');
  for(const job of before.jobs)await c.query("UPDATE ainuoke_sync_jobs SET status='failed',finished_at=now(),result=$2::jsonb WHERE id=$1",[job.id,JSON.stringify({code:'operator_reconciled_unknown',previousResult:job.result,reason:approval.reason})]);
  for(const capture of before.captures)await c.query('UPDATE ainuoke_catalog_requests SET status=$3,finished_at=now(),result=$4::jsonb WHERE source_key=$1 AND request_id=$2',
   [sourceKey,capture.request_id,capture.committed_run?'complete':'failed',JSON.stringify(capture.committed_run?{runId:capture.committed_run}:{code:'operator_reconciled_unknown',previousResult:capture.result,reason:approval.reason})]);
  await c.query('UPDATE ainuoke_sync_controls SET paused_reason=NULL,catalog_failure_count=0,catalog_retry_at=NULL,version=version+1,updated_at=now() WHERE source_key=$1',[sourceKey]);
  await appendOperationLog(c,actor,{module:'艾诺科同步',action:'设置自动同步',entityType:'AinuokeSyncPolicy',entityId:sourceKey,
   metadata:{reason:approval.reason,reviewHash,jobIds:before.jobs.map(j=>j.id),catalogRequests:before.captures.map(r=>r.request_id),sourceRequests:0},afterData:{values:{result:'核对暂停记录；未重新采集'}}});
  await c.query('COMMIT');return {sourceKey,reviewHash,resolvedJobs:before.jobs.length,resolvedCatalogRequests:before.captures.length,sourceRequests:0};
 }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{
  if(locked)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ainuoke-sync-worker:'+sourceKey]).catch(()=>undefined);c.release();
 }
}

/** An explicitly enabled local service may resume reads interrupted by its own
 * process/host restart. The worker lease proves no old IO owner is alive. Job
 * completion and publication are atomic; only still-running reads get a bounded
 * retry. Authentication, identity, certificate and other pauses are untouched. */
export async function resumeInterruptedReads(pool:Pool,identity:Identity,sourceKey:string){
 const c=await pool.connect();let locked=false;
 try{
  locked=(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',['ainuoke-sync-worker:'+sourceKey])).rows[0].locked;
  if(!locked)throw new SourceError('sync_worker_busy');
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ainuoke-sync-queue:'+sourceKey]);
  const actor=await sourceActor(c,identity,true);requirePermission(actor.permissions,'ainuoke.bind');
  const ctl=(await c.query('SELECT paused_reason FROM ainuoke_sync_controls WHERE source_key=$1 FOR UPDATE',[sourceKey])).rows[0];
  if(ctl?.paused_reason){await c.query('COMMIT');return {resumed:0,paused:ctl.paused_reason};}
  await reconcileInterruptedAudit(c,sourceKey);
  const jobs=(await c.query("SELECT * FROM ainuoke_sync_jobs WHERE source_key=$1 AND status='running' FOR UPDATE",[sourceKey])).rows;
  let resumed=0;
  for(const job of jobs){
   await c.query("UPDATE ainuoke_sync_jobs SET status='failed',finished_at=now(),result=$2::jsonb WHERE id=$1",[job.id,JSON.stringify({code:'restart_read_interrupted'})]);
   if(job.attempt_number<3){
    await c.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by,retry_of,root_job_id,attempt_number,available_at)
     VALUES(gen_random_uuid(),$1,$2,$3,$4,'queued',$5,$6,$7,$8,now())`,[sourceKey,job.source_id,job.sales_contract_no,job.kind,job.requested_by,job.id,job.root_job_id??job.id,job.attempt_number+1]);resumed++;
   }
  }
  const catalogs=(await c.query(`SELECT r.request_id,run.id AS run_id FROM ainuoke_catalog_requests r
   LEFT JOIN ainuoke_catalog_runs run ON run.source_key=r.source_key AND run.request_id=r.request_id
   WHERE r.source_key=$1 AND r.status='running' FOR UPDATE OF r`,[sourceKey])).rows;
  for(const item of catalogs)await c.query('UPDATE ainuoke_catalog_requests SET status=$3,finished_at=now(),result=$4::jsonb WHERE source_key=$1 AND request_id=$2',
   [sourceKey,item.request_id,item.run_id?'complete':'failed',JSON.stringify(item.run_id?{runId:item.run_id}:{code:'restart_read_interrupted'})]);
  await c.query("UPDATE ainuoke_sync_capture_attempts SET status='failed',finished_at=now(),result_code='restart_read_interrupted' WHERE source_key=$1 AND status='running'",[sourceKey]);
  if(jobs.length||catalogs.length)await appendOperationLog(c,actor,{module:'艾诺科同步',action:'设置自动同步',entityType:'AinuokeSyncPolicy',entityId:sourceKey,metadata:{reason:'本机后台重启；核对原事务后有限补采只读来源',jobIds:jobs.map(j=>j.id),catalogRequests:catalogs.map(x=>x.request_id),sourceRequests:0},afterData:{values:{result:'保留旧成功快照，合并恢复中断读取'}}});
  await c.query('COMMIT');return {resumed,catalogs:catalogs.length,paused:null};
 }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{if(locked)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ainuoke-sync-worker:'+sourceKey]);c.release();}
}

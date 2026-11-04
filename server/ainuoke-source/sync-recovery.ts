import type {Pool, PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {sourceActor} from './service.js';
import {hash, SourceError, sourceKeyValid} from './contract.js';

type Identity=Pick<TrustedIdentity,'internalUserId'|'userId'>;
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

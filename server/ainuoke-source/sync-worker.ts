import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { accountFingerprint, parseCollectorConfig, type CollectorConfig } from './collector.js';
import { hash, SourceError, validateBundle } from './contract.js';
import { boundOrders, sourceActor, publishMaterialSnapshotsInTransaction } from './service.js';
import { requireAdditionProfile } from './additions.js';
import { refreshCollectedBoundOrderInTransaction } from './bound-order-refresh.js';
import { claimSyncJobs, enqueueAutomaticSync, type SyncJob } from './sync-queue.js';
import { collectSelectedSourceOnce, validateSelectedSourceOnce, type SelectedSourceRequest } from './selected-source-once.js';
import { captureCatalogOnce } from './catalog-capture.js';
import { HttpError } from '../http/errors.js';

type Identity = Pick<TrustedIdentity,'internalUserId'|'userId'>;
type Captured = Extract<Awaited<ReturnType<typeof validateSelectedSourceOnce>>, {mode:'catalog-contracts'}>;
type ContractCapture=Exclude<Captured['contracts'][string],{code:string}>;

async function publishContract(pool:Pool,identity:Identity,config:CollectorConfig,job:SyncJob,captured:ContractCapture&{directory:Captured['directory']},now:number) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='30s'");
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ainuoke-source:'+config.sourceKey]);
    const actor=await sourceActor(c,identity,true);
    await requireAdditionProfile(c,config.sourceKey,accountFingerprint(config),true);
    const settings=(await c.query('SELECT enabled,paused_reason,operator_id::text FROM ainuoke_sync_controls WHERE source_key=$1 FOR SHARE',[config.sourceKey])).rows[0];
    if(!settings?.enabled||settings.paused_reason||settings.operator_id!==actor.internalUserId)throw new SourceError('sync_worker_paused');
    const current=(await c.query('SELECT status,source_id,sales_contract_no,requested_by::text FROM ainuoke_sync_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];
    if(current?.status!=='running'||current.source_id!==job.source_id||current.sales_contract_no!==job.sales_contract_no)throw new SourceError('sync_job_changed');
    const requester=(await c.query('SELECT public_id::text FROM app_users WHERE id=$1',[current.requested_by])).rows[0];
    await sourceActor(c,{internalUserId:current.requested_by,userId:requester?.public_id??''},true);
    const observed=captured.directory.rows.find(r=>r.sourceId===job.source_id&&r.salesContractNo===job.sales_contract_no);
    if(!observed)throw new SourceError('source_visibility_changed');
    const saved=(await c.query('SELECT sales_contract_no FROM ainuoke_catalog_entries WHERE source_key=$1 AND source_id=$2 FOR UPDATE',[config.sourceKey,job.source_id])).rows[0];
    if(saved?.sales_contract_no!==job.sales_contract_no)throw new SourceError('catalog_identity_changed');
    const target=(await boundOrders(c)).find(o=>o.salesContractNo===job.sales_contract_no);
    const singleAddition={...captured.addition,colors:{[job.sales_contract_no]:captured.addition.colors[job.sales_contract_no]}};
    let orderId:string|null=null;
    if(target) {
      // Only an existing trusted binding can update business Source mirrors.
      const result=await refreshCollectedBoundOrderInTransaction(pool,c,actor,
        {sourceKey:config.sourceKey,accountFingerprint:accountFingerprint(config),salesOrderId:target.id},singleAddition,job.id,now);
      orderId=result.orderId;
      const refreshed=await boundOrders(c,true,[target.id]);
      const materialBundle={...captured.materials.bundle,materials:{[job.sales_contract_no]:captured.materials.bundle.materials[job.sales_contract_no]}};
      const materials=await validateBundle(materialBundle,refreshed,now,600000);
      await publishMaterialSnapshotsInTransaction(c,actor,config.sourceKey,materials,refreshed);
    }
    const observationId=randomUUID(),directoryId=randomUUID();
    const evidence={addition:singleAddition,materials:captured.materials.bundle.materials[job.sales_contract_no]};
    await c.query(`INSERT INTO ainuoke_catalog_runs(id,source_key,account_fingerprint,request_id,actor_user_id,captured_at,discovery,content_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,[directoryId,config.sourceKey,accountFingerprint(config),job.id,actor.internalUserId,captured.directory.capturedAt,
      JSON.stringify(captured.directory.bundle.discoveryAfter),captured.directory.contentHash]);
    // Only this contract's current catalogue row is refreshed. The full directory
    // capture is retained as identity evidence, not silently published for others.
    await c.query(`UPDATE ainuoke_catalog_entries SET inside_order_no=$3,style_no=$4,customer_name=$5,brand_name=$6,quantity=$7,
      contract_date=$8,delivery_date=$9,lifecycle_status_raw=$10,visible=true,observed_run_id=$11 WHERE source_key=$1 AND source_id=$2`,
      [config.sourceKey,job.source_id,observed.insideOrderNo,observed.styleNo,observed.customerName,observed.brandName,observed.quantity,observed.contractDate,observed.deliveryDate,observed.lifecycleStatusRaw,directoryId]);
    await c.query(`INSERT INTO ainuoke_contract_observations(id,source_key,source_id,job_id,captured_at,evidence,content_hash) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [observationId,config.sourceKey,job.source_id,job.id,new Date(now),JSON.stringify(evidence),hash(evidence)]);
    await c.query(`INSERT INTO ainuoke_contract_sync_state(source_key,source_id,observation_id,last_success_at,last_error_code) VALUES($1,$2,$3,$4,NULL)
      ON CONFLICT(source_key,source_id) DO UPDATE SET observation_id=excluded.observation_id,last_success_at=excluded.last_success_at,last_error_code=NULL`,[config.sourceKey,job.source_id,observationId,new Date(now)]);
    const result={code:'complete',orderId,observedAt:new Date(now).toISOString(),contract:job.sales_contract_no,
      colorLines:captured.candidates.candidates.find(c=>c.source.salesContractNo===job.sales_contract_no)?.colors.length??0,
      materialRows:captured.materials.bundle.materials[job.sales_contract_no].reduce((n,p)=>n+p.rows.length,0)};
    await c.query("UPDATE ainuoke_sync_jobs SET status='complete',finished_at=$2,result=$3::jsonb WHERE id=$1",[job.id,new Date(now),JSON.stringify(result)]);
    await appendOperationLog(c,actor,{module:'艾诺科同步',action:'采集艾诺科来源',entityType:'AinuokeCatalogRun',entityId:directoryId,
      metadata:{sourceOnly:true,jobId:job.id,requestedBy:current.requested_by},afterData:{objectName:job.sales_contract_no,values:{result:'同步成功'}}});
    await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{c.release();}
}
async function failJob(pool:Pool,job:SyncJob,code:string,unknown=false) {
  const c=await pool.connect();try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ainuoke-source:'+job.source_key]);
    // A lost COMMIT response is checked before recording failure; a completed
    // job and its business publications share one transaction.
    const state=(await c.query('SELECT status,result FROM ainuoke_sync_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];
    if(state?.status==='complete'){await c.query('COMMIT');return state;}
    await c.query("UPDATE ainuoke_sync_jobs SET status=$2,finished_at=now(),result=$3::jsonb WHERE id=$1 AND status='running'",[job.id,unknown?'unknown':'failed',JSON.stringify({code})]);
    await c.query(`INSERT INTO ainuoke_contract_sync_state(source_key,source_id,last_error_code) VALUES($1,$2,$3)
      ON CONFLICT(source_key,source_id) DO UPDATE SET last_error_code=excluded.last_error_code`,[job.source_key,job.source_id,code]);
    const targets=(await boundOrders(c)).filter(o=>o.salesContractNo===job.sales_contract_no);
    for(const target of targets)await c.query(`INSERT INTO ainuoke_material_order_heads(source_key,sales_order_id,last_error_code) VALUES($1,$2,$3)
      ON CONFLICT(source_key,sales_order_id) DO UPDATE SET last_error_code=excluded.last_error_code,last_attempt_at=now()`,[job.source_key,target.id,code]);
    if(unknown||['invalid_credential','auth_expired','source_account_mismatch'].includes(code))await c.query('UPDATE ainuoke_sync_controls SET paused_reason=$2 WHERE source_key=$1',[job.source_key,code]);
    await c.query('COMMIT');return {status:unknown?'unknown':'failed',result:{code}};
  }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{c.release();}
}
/** One wake handles a bounded group. Caller decides when to wake, backs up or
 * stops. No implicit activation, retries, credential changes or infinite loops. */
export async function runSyncTick(pool:Pool,identity:Identity,raw:CollectorConfig,options:{
  automatic?:boolean;batchSize?:number;now?:()=>number;
  collect?:(config:CollectorConfig,request:SelectedSourceRequest)=>Promise<unknown>;
}={}) {
  const batchSize=options.batchSize??5;
  if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>25)throw new SourceError('sync_batch_invalid');
  const config=parseCollectorConfig(raw),now=options.now??Date.now,lease=await pool.connect();let locked=false;
  try {
    locked=(await lease.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',['ainuoke-sync-worker:'+config.sourceKey])).rows[0].locked;
    if(!locked)return {status:'busy' as const,jobs:[]};
    await sourceActor(pool,identity,true);await requireAdditionProfile(pool,config.sourceKey,accountFingerprint(config));
    // A previous worker died while an upstream call was in flight. Never repeat
    // that call automatically or pretend no response means no side effect.
    const orphaned=(await pool.query("SELECT * FROM ainuoke_sync_jobs WHERE source_key=$1 AND status='running'",[config.sourceKey])).rows as SyncJob[];
    for(const job of orphaned)await failJob(pool,job,'sync_result_unknown',true);
    if(orphaned.length)return {status:'paused' as const,jobs:orphaned.map(j=>({id:j.id,status:'unknown'}))};
    await pool.query('UPDATE ainuoke_sync_controls SET heartbeat_at=$2 WHERE source_key=$1',[config.sourceKey,new Date(now())]);
    if(options.automatic!==false){
      const settings=(await pool.query('SELECT enabled,paused_reason,policy FROM ainuoke_sync_controls WHERE source_key=$1',[config.sourceKey])).rows[0];
      if(!settings?.enabled||settings.paused_reason)throw new SourceError('sync_worker_paused');
      const manual=(await pool.query("SELECT 1 FROM ainuoke_sync_jobs WHERE source_key=$1 AND kind='manual' AND status='queued' LIMIT 1",[config.sourceKey])).rowCount;
      const latest=(await pool.query('SELECT status,created_at FROM ainuoke_catalog_requests WHERE source_key=$1 ORDER BY created_at DESC LIMIT 1',[config.sourceKey])).rows[0];
      if(latest?.status==='unknown'||latest?.status==='running'&&now()-new Date(latest.created_at).getTime()>300000){
        await pool.query("UPDATE ainuoke_sync_controls SET paused_reason='catalog_result_unknown' WHERE source_key=$1",[config.sourceKey]);throw new SourceError('catalog_result_unknown');
      }
      if(!manual&&latest?.status!=='running'&&(!latest||now()-new Date(latest.created_at).getTime()>=settings.policy.catalogMinutes*60000)){
        await captureCatalogOnce(pool,identity,config,randomUUID(),options.collect,lease);
      }
      await enqueueAutomaticSync(pool,identity,config.sourceKey,now());
    }
    const jobs=await claimSyncJobs(pool,identity,config.sourceKey,batchSize,now());
    if(!jobs.length)return {status:'idle' as const,jobs:[]};
    const request:SelectedSourceRequest={mode:'catalog-contracts',contracts:jobs.map(j=>j.sales_contract_no).sort()};
    let captured:Captured;
    try {
      const response=options.collect?await validateSelectedSourceOnce(await options.collect(config,request),config,request,now()):await collectSelectedSourceOnce(config,request,{now});
      if(response.result!=='complete')throw new SourceError(response.code);
      if(response.mode!=='catalog-contracts')throw new SourceError('selected_source_invalid');captured=response;
    }catch(e){const code=e instanceof SourceError?e.code:'source_capture_failed';for(const job of jobs)await failJob(pool,job,code);return {status:'failed' as const,jobs:jobs.map(j=>({id:j.id,status:'failed',code}))};}
    const results=[];
    for(const job of jobs) {
      const single=captured.contracts[job.sales_contract_no];
      if(!single||'code' in single){results.push({id:job.id,...await failJob(pool,job,single?.code??'source_contract_missing')});continue;}
      try{results.push({id:job.id,status:'complete',result:await publishContract(pool,identity,config,job,{...single,directory:captured.directory},now())});}
      catch(e){const code=e instanceof SourceError||e instanceof HttpError?e.code:'sync_publish_failed';const result=await failJob(pool,job,code,!(e instanceof SourceError)&&!(e instanceof HttpError));results.push({id:job.id,...result});}
    }
    return {status:'processed' as const,jobs:results};
  }finally{if(locked)await lease.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ainuoke-sync-worker:'+config.sourceKey]).catch(()=>undefined);lease.release();}
}

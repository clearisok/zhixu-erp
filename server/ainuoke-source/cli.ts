import { readFileSync, statSync } from 'node:fs';
import { requestMaterialRecovery } from './material-recovery.js';
import { publishHistoricalMaterialObservation } from './historical-material-publication.js';
import { recoverSync } from './sync-recovery.js';
import { setTimeout as delay } from 'node:timers/promises';
import { captureCatalogOnce, readCatalogCaptureReceipt } from './catalog-capture.js';
import { configureSync } from './sync-queue.js';
import { DEFAULT_SYNC_POLICY } from './sync-schedule.js';
import { runSyncTick } from './sync-worker.js';
import { createSessionCollector } from './session-collector.js';
import { planFollowupGroups } from './followup.js';
import { refreshFollowupGroup } from './group-refresh.js';
import { pathToFileURL } from "node:url";
import { loadServerConfig } from "../config.js";
import { createDatabasePool } from "../db/pool.js";
import { verifyMigrationsCurrent } from "../db/migration-runner.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { SourceError, hash } from "./contract.js";
import { readPrivateCollectorConfig, accountFingerprint, collectWithPython } from "./collector.js";
import { boundOrders, captureSource, sourceActor } from "./service.js";
import { previewBindings, previewSelectedBindings, bindOrders } from "./binding.js";
import { addOrders, discoverAdditions, previewAdditions, readBoundIdentities, requireAdditionProfile, selectContracts } from "./additions.js";
import { runSchedule, schedulePolicy } from "./scheduler.js";
import { requirePermission } from "../auth/permissions.js";
import { refreshBoundMaterialsOnce } from './bounded-material-refresh.js';

export function parseSourceArguments(args: string[]) {
  const values = new Map<string,string>();
  for(const argument of args) {
    const match = /^--([a-z-]+)(?:=(.+))?$/u.exec(argument);
    if(!match || values.has(match[1])) throw new SourceError("explicit_source_action_required");
    values.set(match[1],match[2]??"");
  }
  const actions=["check","preview-bind","bind","preview-bind-selected","bind-selected","discover-add","preview-add","add","execute","execute-bounded","catalog","catalog-receipt","plan-followup","execute-group","group-receipt","sync-configure","sync-once","sync-run","sync-status","material-recover","material-history-publish","sync-recovery-preview","sync-recover","schedule"].filter(key=>values.has(key));
  if(actions.length!==1 || !values.get("config")) throw new SourceError("explicit_source_action_required");
  const action=actions[0];
  if(action==='material-history-publish'&&(!values.get('source-id')||!['order-id','observation-id'].every(k=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values.get(k)??''))||!/^[a-f0-9]{64}$/.test(values.get('evidence-hash')??'')))throw new SourceError('historical_material_scope_invalid');
  const allowed=["config",action,...(action==="material-history-publish"?["source-id","order-id","observation-id","evidence-hash"]:[]),...(action==="material-recover"?["source-ids","request-id"]:[]),...(action==="check"?[]:["expected-target"]),...(["bind","bind-selected","add"].includes(action)?["expected-preview"]:[]),
    ...(["preview-add","add","preview-bind-selected","bind-selected","execute-bounded","execute-group"].includes(action)?["contracts"]:[]),...(action==="schedule"?["interval-ms","max-backoff-ms"]:[]),...(["catalog","catalog-receipt","execute-group","group-receipt"].includes(action)?["request-id"]:[]),...(action==="execute-group"?["expected-scope"]:[]),...(["plan-followup","sync-once","sync-run"].includes(action)?["batch-size"]:[]),...(action==="sync-configure"?["enabled","expected-version","policy-file"]:[]),...(action==="sync-recover"?["expected-preview","reason"]:[])];
  if([...values.keys()].some(k=>!allowed.includes(k)) || action==="check"&&values.get(action)!==""
    || action!=="check"&&(!/^[a-z][a-z0-9_-]{2,63}$/u.test(values.get(action)!)||!/^[a-f0-9]{64}$/u.test(values.get("expected-target")??""))
    || ["bind","bind-selected","add"].includes(action)&&!/^[a-f0-9]{64}$/u.test(values.get("expected-preview")??"")
    || ["preview-add","add","preview-bind-selected","bind-selected","execute-bounded","execute-group"].includes(action)&&!values.get("contracts")) throw new SourceError("explicit_source_action_required");
  if(["preview-add","add","preview-bind-selected","bind-selected","execute-bounded","execute-group"].includes(action)) selectContracts(values.get("contracts")!);
  if(["catalog","catalog-receipt","execute-group","group-receipt"].includes(action)&&!/^[a-f0-9-]{36}$/i.test(values.get('request-id')??''))throw new SourceError('source_request_required');
  if(action==='execute-group'&&!/^[a-f0-9]{64}$/.test(values.get('expected-scope')??''))throw new SourceError('source_group_scope_required');
  if(values.has('batch-size')&&(!/^\d+$/.test(values.get('batch-size')!)||Number(values.get('batch-size'))<1||Number(values.get('batch-size'))>25))throw new SourceError('sync_batch_invalid');
  if(action==='sync-recover'&&(!/^[a-f0-9]{64}$/.test(values.get('expected-preview')??'')||(values.get('reason')??'').trim().length<3||(values.get('reason')??'').length>300))throw new SourceError('sync_recovery_invalid');
  if(action==='material-recover'&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values.get('request-id')??'')||!values.get('source-ids')))throw new SourceError('material_recovery_scope_invalid');
  return {action,values};
}
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if(args.length===0 || args.length===1&&args[0]==="--help") {
    process.stdout.write("material-recover: --material-recover=<source key> --source-ids=<exact IDs separated by commas> --request-id=<stable recovery UUID> --expected-target=<fingerprint> --config=<private file>. Enqueues ordinary jobs only; replay the same UUID after interruption.\n");
    process.stdout.write("sync-configure: --sync-configure=<source key> --enabled=true|false --expected-version=<version> [--policy-file=<bounded JSON>] --expected-target=<fingerprint> --config=<private file>\nsync-run / sync-once: --sync-run=<source key> [--batch-size=5] --expected-target=<fingerprint> --config=<private file>. No automatic retry after unknown outcomes.\nsync-status / sync-recovery-preview: database only. Recovery uses --sync-recover=<source key> --expected-preview=<reviewHash> --reason=<reviewed reason> with the same config/target. Never makes upstream requests.\n");
    process.stdout.write("catalog: --catalog=<source key> --request-id=<UUID> --expected-target=<fingerprint> --config=<private file>; bounded 1 login/40 reports/180s, no retry. Replay first checks receipt.\nplan-followup: --plan-followup=<source key> [--batch-size=5] --expected-target=<fingerprint> --config=<file>; DB only.\nexecute-group: --execute-group=<source key> --contracts=<selected BillNos> --expected-scope=<plan hash> --request-id=<UUID> --expected-target=<fingerprint> --config=<file>; at most one group, never repeats request.\nReceipts: --catalog-receipt or --group-receipt=<source key> --request-id=<UUID> --expected-target=<fingerprint> --config=<file>.\ncheck: --check --config=<absolute private file>\nread-only source preview: --preview-bind=<source key> --expected-target=<check fingerprint> --config=<file>\nbind: --bind=<source key> --expected-target=<fingerprint> --expected-preview=<reviewHash> --config=<file>\nselected first binding: --preview-bind-selected=<source key> --contracts=<BillNo,...> --expected-target=<fingerprint> --config=<file>\nconfirm first selection: --bind-selected=<source key> --contracts=<BillNo,...> --expected-preview=<reviewHash> --expected-target=<fingerprint> --config=<file>\nnew contracts: --discover-add=<source key> --expected-target=<fingerprint> --config=<file>\npreview selected: --preview-add=<source key> --contracts=<BillNo,...> --expected-target=<fingerprint> --config=<file>\nconfirm selected: --add=<source key> --contracts=<BillNo,...> --expected-preview=<reviewHash> --expected-target=<fingerprint> --config=<file>\ncapture: --execute=<source key> --expected-target=<fingerprint> --config=<file>\nbounded material capture: --execute-bounded=<source key> --contracts=<exact bound BillNos> --expected-target=<fingerprint> --config=<file>\nscheduler: --schedule=<source key> --expected-target=<fingerprint> --config=<file> [--interval-ms=300000] [--max-backoff-ms=1800000]\nNo migration, account bootstrap or deployment is performed. Scheduling does not bind orders.\n"); return;
  }
  const {action,values}=parseSourceArguments(args);
  const path=values.get("config")!;
  const cfg=readPrivateCollectorConfig(path);
  if(action!=="check"&&values.get(action)!==cfg.sourceKey) throw new SourceError("source_confirmation_mismatch");
  const policy=action==="schedule"?schedulePolicy(Number(values.get("interval-ms")??300000),Number(values.get("max-backoff-ms")??1800000)):null;
  const server=loadServerConfig();
  if(server.identityMode!=="session")throw new SourceError("source_session_required");
  const pool=createDatabasePool({connectionString:server.databaseUrl,max:4});
  try {
    await verifyMigrationsCurrent(pool,server.migrationsDirectory);
    const actor=await loadExistingBootstrapActor(pool,cfg.operatorUsername);
    await sourceActor(pool,actor,true);
    const db=(await pool.query("SELECT current_database() AS database,current_user AS db_user,inet_server_addr()::text AS address,inet_server_port() AS port")).rows[0];
    const uri=new URL(server.databaseUrl);
    const fingerprint=hash({sourceKey:cfg.sourceKey,account:accountFingerprint(cfg),host:uri.hostname,port:uri.port,database:db});
    if(action==="check") {
      process.stdout.write(JSON.stringify({result:"CHECKED_NO_SOURCE_READ",targetFingerprint:fingerprint,sourceKey:cfg.sourceKey,boundOrders:(await boundOrders(pool)).length})+"\n");return;
    }
    if(values.get("expected-target")!==fingerprint)throw new SourceError("source_target_mismatch");
    if(action==='material-history-publish'){
      const result=await publishHistoricalMaterialObservation(pool,actor,{sourceKey:cfg.sourceKey,sourceId:values.get('source-id')??'',orderId:values.get('order-id')??'',observationId:values.get('observation-id')??'',expectedHash:values.get('evidence-hash')??''});
      process.stdout.write(JSON.stringify({event:'MATERIAL_HISTORY_PUBLICATION',...result})+'\n');return;
    }
    if(action==='material-recover'){
      const receipts=await requestMaterialRecovery(pool,actor,{sourceKey:cfg.sourceKey,sourceIds:values.get('source-ids')!.split(',').map(id=>id.trim()),recoveryId:values.get('request-id')!});
      process.stdout.write(JSON.stringify({event:'MATERIAL_RECOVERY_QUEUED',receipts,sourceRequests:0})+'\n');return;
    }
    if(action==='catalog'||action==='catalog-receipt'){
      const result=action==='catalog-receipt'?await readCatalogCaptureReceipt(pool,actor,cfg.sourceKey,values.get('request-id')!):await captureCatalogOnce(pool,actor,cfg,values.get('request-id')!);
      process.stdout.write(JSON.stringify({event:'CATALOG_RECEIPT',receipt:result})+'\n');return;
    }
    if(action==='sync-recovery-preview'||action==='sync-recover'){
      const result=await recoverSync(pool,actor,cfg.sourceKey,action==='sync-recover'?{expectedHash:values.get('expected-preview')!,reason:values.get('reason')!}:undefined);
      process.stdout.write(JSON.stringify({event:'SYNC_RECOVERY',...result})+'\n');return;
    }
    if(action==='sync-configure'){
      if(!['true','false'].includes(values.get('enabled')??'')||!/^\d+$/.test(values.get('expected-version')??''))throw new SourceError('sync_configuration_invalid');
      if(values.get('policy-file')&&statSync(values.get('policy-file')!).size>16384)throw new SourceError('sync_configuration_invalid');
      const rawPolicy=values.get('policy-file')?readFileSync(values.get('policy-file')!,'utf8'):null;
      if(rawPolicy&&Buffer.byteLength(rawPolicy)>16384)throw new SourceError('sync_configuration_invalid');
      const result=await configureSync(pool,actor,{sourceKey:cfg.sourceKey,enabled:values.get('enabled')==='true',expectedVersion:Number(values.get('expected-version')),policy:rawPolicy?JSON.parse(rawPolicy):{...DEFAULT_SYNC_POLICY}});
      process.stdout.write(JSON.stringify({event:'SYNC_CONFIGURED',...result})+'\n');return;
    }
    if(action==='sync-status'){
      const control=(await pool.query('SELECT enabled,version,policy,paused_reason,heartbeat_at,catalog_failure_count,catalog_retry_at FROM ainuoke_sync_controls WHERE source_key=$1',[cfg.sourceKey])).rows[0]??null;
      const queue=(await pool.query('SELECT status,kind,count(*)::int AS count,min(requested_at) AS oldest FROM ainuoke_sync_jobs WHERE source_key=$1 GROUP BY status,kind',[cfg.sourceKey])).rows;
      process.stdout.write(JSON.stringify({event:'SYNC_STATUS',control,queue,sourceRequests:0})+'\n');return;
    }
    if(action==='sync-once'||action==='sync-run'){
      const batchSize=Number(values.get('batch-size')??5);
      const controller=new AbortController(),stop=()=>controller.abort();
      process.once('SIGINT',stop);process.once('SIGTERM',stop);
      // PostgreSQL notification wakes manual requests immediately. The one-second
      // fallback also catches notifications missed while processing another job.
      const listener=await pool.connect();let wake:(()=>void)|null=null;
      listener.on('notification',message=>{if(message.channel==='ainuoke_sync_requested'&&message.payload===cfg.sourceKey)wake?.();});
      await listener.query('LISTEN ainuoke_sync_requested');
      let automaticAt=0;
      const sessionCollector=createSessionCollector();
      try{do{
        const current=readPrivateCollectorConfig(path);
        if(accountFingerprint(current)!==accountFingerprint(cfg)||current.sourceKey!==cfg.sourceKey||current.operatorUsername!==cfg.operatorUsername)throw new SourceError('source_account_mismatch');
        await verifyMigrationsCurrent(pool,server.migrationsDirectory);
        const automatic=Date.now()>=automaticAt;
        const result=await runSyncTick(pool,actor,current,{batchSize,automatic,collect:sessionCollector.collect});
        if(automatic)automaticAt=Date.now()+60000;
        if(result.status!=='idle')process.stdout.write(JSON.stringify({event:'SYNC_TICK',...result})+'\n');
        if(action==='sync-once'||result.status==='paused'||result.status==='failed'&&!result.retryScheduled)break;
        if(result.status==='processed')continue;
        await Promise.race([delay(1000,undefined,{signal:controller.signal}).catch(()=>undefined),new Promise<void>(resolve=>{wake=resolve;})]);wake=null;
      }while(!controller.signal.aborted);}finally{sessionCollector.close();await listener.query('UNLISTEN ainuoke_sync_requested').catch(()=>undefined);listener.release();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
      return;
    }
    if(action==='plan-followup'){
      await requireAdditionProfile(pool,cfg.sourceKey,accountFingerprint(cfg));
      process.stdout.write(JSON.stringify({result:'FOLLOWUP_PLAN_NO_SOURCE_READ',...await planFollowupGroups(pool,actor,cfg.sourceKey,Number(values.get('batch-size')??5))})+'\n');return;
    }
    if(action==='execute-group'){
      const result=await refreshFollowupGroup(pool,actor,cfg,{contracts:selectContracts(values.get('contracts')!),requestId:values.get('request-id')!,expectedScopeHash:values.get('expected-scope')!});
      process.stdout.write(JSON.stringify({event:'FOLLOWUP_GROUP_RECEIPT',...result})+'\n');return;
    }
    if(action==='group-receipt'){
      const row=(await pool.query('SELECT status,result FROM ainuoke_material_group_requests WHERE actor_user_id=$1 AND request_id=$2 AND source_key=$3',[actor.internalUserId,values.get('request-id'),cfg.sourceKey])).rows[0];
      process.stdout.write(JSON.stringify({result:'FOLLOWUP_GROUP_RECEIPT',receipt:row??null,sourceRequests:0})+'\n');return;
    }
    if(action==='execute-bounded'){
      const result=await refreshBoundMaterialsOnce(pool,actor,cfg,selectContracts(values.get('contracts')!));
      process.stdout.write(JSON.stringify({result:'BOUNDED_MATERIAL_CAPTURED',...result})+'\n');return;
    }
    if(action==="preview-bind"||action==="bind"){
      requirePermission((await sourceActor(pool,actor,true)).permissions,"ainuoke.bind");
      const collect=()=>collectWithPython(cfg,[],{mode:"bindings"});
      if(action==="preview-bind"){
        const {preview,reviewHash}=await previewBindings(await collect());
        process.stdout.write(JSON.stringify({result:"BINDING_PREVIEW_NO_WRITES",targetFingerprint:fingerprint,reviewHash,orders:preview.candidates.length,coverage:preview.coverage,contracts:preview.candidates.map(c=>({contract:c.source.salesContractNo,style:c.source.styleNo,quantity:c.source.quantity,colorStatus:c.colorDetailStatus}))})+"\n");
      }else{
        const result=await bindOrders(pool,actor,{sourceKey:cfg.sourceKey,accountFingerprint:accountFingerprint(cfg),expectedPreview:values.get("expected-preview")!,collect});
        process.stdout.write(JSON.stringify({result:"ORDERS_BOUND",...result})+"\n");
      }
      return;
    }
    if(action==="preview-bind-selected"||action==="bind-selected"){
      requirePermission((await sourceActor(pool,actor,true)).permissions,"ainuoke.bind");
      const selected=selectContracts(values.get("contracts")!);
      const collect=()=>collectWithPython(cfg,selected,{mode:"additions"});
      if(action==="preview-bind-selected"){
        const result=await previewSelectedBindings(await collect(),selected);
        process.stdout.write(JSON.stringify({result:"SELECTED_BINDING_PREVIEW_NO_WRITES",targetFingerprint:fingerprint,
          reviewHash:result.reviewHash,visibleContracts:result.visibleContracts,selectedContracts:result.selectedContracts,
          contracts:result.preview.candidates.map(c=>({salesContractNo:c.source.salesContractNo,sourceId:c.source.sourceId,
            styleNo:c.source.styleNo,quantity:c.source.quantity,colorStatus:c.colorDetailStatus,colorLines:c.colors.length}))})+"\n");
      }else{
        const result=await bindOrders(pool,actor,{sourceKey:cfg.sourceKey,accountFingerprint:accountFingerprint(cfg),
          selected,expectedPreview:values.get("expected-preview")!,collect});
        process.stdout.write(JSON.stringify({result:"SELECTED_ORDERS_BOUND",...result})+"\n");
      }
      return;
    }
    if(action==="discover-add"||action==="preview-add"||action==="add"){
      requirePermission((await sourceActor(pool,actor,true)).permissions,"ainuoke.bind");
      const fingerprintForAccount=accountFingerprint(cfg);
      await requireAdditionProfile(pool,cfg.sourceKey,fingerprintForAccount);
      const bound=await readBoundIdentities(pool);
      if(action==="discover-add"){
        const result=await discoverAdditions(await collectWithPython(cfg,[],{mode:"discovery"}),bound);
        process.stdout.write(JSON.stringify({result:"ADDITIONS_DISCOVERED_NO_WRITES",targetFingerprint:fingerprint,...result})+"\n");
      }else{
        const selected=selectContracts(values.get("contracts")!);
        const collect=()=>collectWithPython(cfg,selected,{mode:"additions"});
        if(action==="preview-add"){
          const result=await previewAdditions(await collect(),selected,bound);
          if(result.alreadyBound)throw new SourceError("addition_already_bound");
          process.stdout.write(JSON.stringify({result:"ADDITIONS_PREVIEW_NO_WRITES",targetFingerprint:fingerprint,
            reviewHash:result.reviewHash,visibleContracts:result.visibleContracts,selectedContracts:result.selectedContracts,
            contracts:result.candidates.map(c=>({salesContractNo:c.source.salesContractNo,sourceId:c.source.sourceId,
              styleNo:c.source.styleNo,quantity:c.source.quantity,colorStatus:c.colorDetailStatus,colorLines:c.colors.length}))})+"\n");
        }else{
          const result=await addOrders(pool,actor,{sourceKey:cfg.sourceKey,accountFingerprint:fingerprintForAccount,
            selected,expectedPreview:values.get("expected-preview")!,collect});
          process.stdout.write(JSON.stringify({result:"ADDITIONS_BOUND",...result})+"\n");
        }
      }
      return;
    }
    const capture=async()=>{
      const current=readPrivateCollectorConfig(path);
      if(current.sourceKey!==cfg.sourceKey||current.operatorUsername!==cfg.operatorUsername||accountFingerprint(current)!==accountFingerprint(cfg))throw new SourceError("source_account_mismatch");
      // Recheck the migration ledger each cycle; this process never applies one.
      await verifyMigrationsCurrent(pool,server.migrationsDirectory);
      return captureSource(pool,actor,{sourceKey:cfg.sourceKey,accountFingerprint:accountFingerprint(cfg),maxAgeMs:600000,collect:contracts=>collectWithPython(current,contracts)});
    };
    if(action==="execute"){process.stdout.write(JSON.stringify({result:"SOURCE_CAPTURED",...await capture()})+"\n");return;}
    const controller=new AbortController();const stop=()=>controller.abort();
    process.once("SIGINT",stop);process.once("SIGTERM",stop);
    try {await runSchedule({capture,signal:controller.signal,policy:policy!,emit:event=>process.stdout.write(JSON.stringify({result:"SOURCE_SCHEDULE",...event})+"\n")});}
    finally {process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);}
  } finally {await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{process.stderr.write(JSON.stringify({result:"FAIL",code:error instanceof SourceError?error.code:"source_command_failed"})+"\n");process.exitCode=1;});
}

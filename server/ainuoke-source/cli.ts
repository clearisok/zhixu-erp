import { collectSelectedSourceOnce } from './selected-source-once.js';
import { publishCatalog } from './catalog.js';
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
  const actions=["check","preview-bind","bind","preview-bind-selected","bind-selected","discover-add","preview-add","add","execute","execute-bounded","catalog","catalog-receipt","plan-followup","execute-group","group-receipt","schedule"].filter(key=>values.has(key));
  if(actions.length!==1 || !values.get("config")) throw new SourceError("explicit_source_action_required");
  const action=actions[0];
  const allowed=["config",action,...(action==="check"?[]:["expected-target"]),...(["bind","bind-selected","add"].includes(action)?["expected-preview"]:[]),
    ...(["preview-add","add","preview-bind-selected","bind-selected","execute-bounded","execute-group"].includes(action)?["contracts"]:[]),...(action==="schedule"?["interval-ms","max-backoff-ms"]:[]),...(["catalog","catalog-receipt","execute-group","group-receipt"].includes(action)?["request-id"]:[]),...(action==="execute-group"?["expected-scope"]:[]),...(action==="plan-followup"?["batch-size"]:[])];
  if([...values.keys()].some(k=>!allowed.includes(k)) || action==="check"&&values.get(action)!==""
    || action!=="check"&&(!/^[a-z][a-z0-9_-]{2,63}$/u.test(values.get(action)!)||!/^[a-f0-9]{64}$/u.test(values.get("expected-target")??""))
    || ["bind","bind-selected","add"].includes(action)&&!/^[a-f0-9]{64}$/u.test(values.get("expected-preview")??"")
    || ["preview-add","add","preview-bind-selected","bind-selected","execute-bounded","execute-group"].includes(action)&&!values.get("contracts")) throw new SourceError("explicit_source_action_required");
  if(["preview-add","add","preview-bind-selected","bind-selected","execute-bounded","execute-group"].includes(action)) selectContracts(values.get("contracts")!);
  if(["catalog","catalog-receipt","execute-group","group-receipt"].includes(action)&&!/^[a-f0-9-]{36}$/i.test(values.get('request-id')??''))throw new SourceError('source_request_required');
  if(action==='execute-group'&&!/^[a-f0-9]{64}$/.test(values.get('expected-scope')??''))throw new SourceError('source_group_scope_required');
  return {action,values};
}
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if(args.length===0 || args.length===1&&args[0]==="--help") {
    process.stdout.write("catalog: --catalog=<source key> --request-id=<UUID> --expected-target=<fingerprint> --config=<private file>; bounded 1 login/40 reports/180s, no retry. Replay first checks receipt.\nplan-followup: --plan-followup=<source key> [--batch-size=5] --expected-target=<fingerprint> --config=<file>; DB only.\nexecute-group: --execute-group=<source key> --contracts=<selected BillNos> --expected-scope=<plan hash> --request-id=<UUID> --expected-target=<fingerprint> --config=<file>; at most one group, never repeats request.\nReceipts: --catalog-receipt or --group-receipt=<source key> --request-id=<UUID> --expected-target=<fingerprint> --config=<file>.\ncheck: --check --config=<absolute private file>\nread-only source preview: --preview-bind=<source key> --expected-target=<check fingerprint> --config=<file>\nbind: --bind=<source key> --expected-target=<fingerprint> --expected-preview=<reviewHash> --config=<file>\nselected first binding: --preview-bind-selected=<source key> --contracts=<BillNo,...> --expected-target=<fingerprint> --config=<file>\nconfirm first selection: --bind-selected=<source key> --contracts=<BillNo,...> --expected-preview=<reviewHash> --expected-target=<fingerprint> --config=<file>\nnew contracts: --discover-add=<source key> --expected-target=<fingerprint> --config=<file>\npreview selected: --preview-add=<source key> --contracts=<BillNo,...> --expected-target=<fingerprint> --config=<file>\nconfirm selected: --add=<source key> --contracts=<BillNo,...> --expected-preview=<reviewHash> --expected-target=<fingerprint> --config=<file>\ncapture: --execute=<source key> --expected-target=<fingerprint> --config=<file>\nbounded material capture: --execute-bounded=<source key> --contracts=<exact bound BillNos> --expected-target=<fingerprint> --config=<file>\nscheduler: --schedule=<source key> --expected-target=<fingerprint> --config=<file> [--interval-ms=300000] [--max-backoff-ms=1800000]\nNo migration, account bootstrap or deployment is performed. Scheduling does not bind orders.\n"); return;
  }
  const {action,values}=parseSourceArguments(args);
  const path=values.get("config")!;
  const cfg=readPrivateCollectorConfig(path);
  if(action!=="check"&&values.get(action)!==cfg.sourceKey) throw new SourceError("source_confirmation_mismatch");
  const policy=action==="schedule"?schedulePolicy(Number(values.get("interval-ms")??300000),Number(values.get("max-backoff-ms")??1800000)):null;
  const server=loadServerConfig();
  if(server.identityMode!=="session")throw new SourceError("source_session_required");
  const pool=createDatabasePool({connectionString:server.databaseUrl,max:2});
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
    if(action==='catalog'||action==='catalog-receipt'){
      requirePermission((await sourceActor(pool,actor,true)).permissions,'ainuoke.bind');
      await requireAdditionProfile(pool,cfg.sourceKey,accountFingerprint(cfg));
      const prior=(await pool.query('SELECT id AS "runId",content_hash AS "contentHash",captured_at AS "capturedAt" FROM ainuoke_catalog_runs WHERE source_key=$1 AND request_id=$2 AND actor_user_id=$3',[cfg.sourceKey,values.get('request-id'),actor.internalUserId])).rows[0];
      if(prior||action==='catalog-receipt'){process.stdout.write(JSON.stringify({result:prior?'CATALOG_RECORDED':'NOT_FOUND',receipt:prior??null,sourceRequests:0})+'\n');return;}
      const captured=await collectSelectedSourceOnce(cfg,{mode:'catalog-discovery',contracts:[]});
      if(captured.result!=='complete')throw new SourceError(captured.code);
      if(captured.mode!=='catalog-discovery')throw new SourceError('catalog_invalid');
      const result=await publishCatalog(pool,actor,{sourceKey:cfg.sourceKey,accountFingerprint:accountFingerprint(cfg),requestId:values.get('request-id')!,input:captured.bundle,expectedHash:captured.preview.contentHash});
      process.stdout.write(JSON.stringify({result:'CATALOG_RECORDED',...result,metrics:captured.metrics})+'\n');return;
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

import { pathToFileURL } from "node:url";
import { loadServerConfig } from "../config.js";
import { createDatabasePool } from "../db/pool.js";
import { verifyMigrationsCurrent } from "../db/migration-runner.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { SourceError, hash } from "./contract.js";
import { readPrivateCollectorConfig, accountFingerprint, collectWithPython } from "./collector.js";
import { boundOrders, captureSource, sourceActor } from "./service.js";
import { previewBindings, bindOrders } from "./binding.js";
import { runSchedule, schedulePolicy } from "./scheduler.js";
import { requirePermission } from "../auth/permissions.js";

export function parseSourceArguments(args: string[]) {
  const values = new Map<string,string>();
  for(const argument of args) {
    const match = /^--([a-z-]+)(?:=(.+))?$/u.exec(argument);
    if(!match || values.has(match[1])) throw new SourceError("explicit_source_action_required");
    values.set(match[1],match[2]??"");
  }
  const actions=["check","preview-bind","bind","execute","schedule"].filter(key=>values.has(key));
  if(actions.length!==1 || !values.get("config")) throw new SourceError("explicit_source_action_required");
  const action=actions[0];
  const allowed=["config",action,...(action==="check"?[]:["expected-target"]),...(action==="bind"?["expected-preview"]:[]),...(action==="schedule"?["interval-ms","max-backoff-ms"]:[])];
  if([...values.keys()].some(k=>!allowed.includes(k)) || action==="check"&&values.get(action)!==""
    || action!=="check"&&(!/^[a-z][a-z0-9_-]{2,63}$/u.test(values.get(action)!)||!/^[a-f0-9]{64}$/u.test(values.get("expected-target")??""))
    || action==="bind"&&!/^[a-f0-9]{64}$/u.test(values.get("expected-preview")??"")) throw new SourceError("explicit_source_action_required");
  return {action,values};
}
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if(args.length===0 || args.length===1&&args[0]==="--help") {
    process.stdout.write("check: --check --config=<absolute private file>\nread-only source preview: --preview-bind=<source key> --expected-target=<check fingerprint> --config=<file>\nbind: --bind=<source key> --expected-target=<fingerprint> --expected-preview=<reviewHash> --config=<file>\ncapture: --execute=<source key> --expected-target=<fingerprint> --config=<file>\nscheduler: --schedule=<source key> --expected-target=<fingerprint> --config=<file> [--interval-ms=300000] [--max-backoff-ms=1800000]\nNo migration, account bootstrap or deployment is performed. Scheduling does not bind orders.\n"); return;
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

import {readFile,writeFile,rename,appendFile,unlink} from 'node:fs/promises';
import {resolve,dirname,delimiter} from 'node:path';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {createApp} from './app.js';
import {verifyMigrationsCurrent} from './db/migration-runner.js';
import {createPersistedMaterialPorts} from './ainuoke-source/reader.js';
import {parseCollectorConfig,accountFingerprint} from './ainuoke-source/collector.js';
import {loadExistingBootstrapActor} from './sales-orders/bootstrap-runner.js';
import {configureSync} from './ainuoke-source/sync-queue.js';
import {DEFAULT_SYNC_POLICY} from './ainuoke-source/sync-schedule.js';
import {runAutomaticSync} from './ainuoke-source/sync-runner.js';
import {resumeInterruptedReads} from './ainuoke-source/sync-recovery.js';
import {readAutomaticSyncStatus} from './ainuoke-source/sync-status.js';
import {SourceError} from './ainuoke-source/contract.js';

async function main(){
 const rootArg=process.argv.slice(2);if(rootArg.length!==1||!rootArg[0].startsWith('--root='))throw Error('explicit_local_root_required');
 const root=resolve(rootArg[0].slice(7));
 const read=async(path:string)=>JSON.parse(await readFile(root+'/'+path,'utf8'));
 const service=await read('service.private.json'),runtime=await read('runtime.private.json');
 if(service.pythonExecutable)process.env.PATH=dirname(service.pythonExecutable)+delimiter+(process.env.PATH??'');
 const uri=new URL(runtime.databaseUrl);
 if(service.schemaVersion!==1||service.base!=='http://127.0.0.1:63051'||runtime.base!==service.base
  ||!['127.0.0.1','localhost'].includes(uri.hostname)||!uri.pathname.startsWith('/zhixu_it_real_orders_preview_')
  ||runtime.containerName!=='weaveops-local-postgres'||service.timezone!=='Asia/Shanghai')throw Error('local_runtime_identity_mismatch');
 const staticDirectory=resolve('dist/client'),build=JSON.parse(await readFile(staticDirectory+'/build-info.json','utf8'));
 if(build.orderRead!=='snapshot'||build.identityMode!=='session'||build.masterSettingsAuthority!=='server'||build.quoteAuthority!=='server'
  ||build.gitCommit!==service.codeVersion)throw Error('local_release_mismatch');
 const source=await read('source-config.private.json'),key=(await readFile(service.credentialFile,'utf8')).replace(/^\uFEFF/,'');
 const match=/^账号[:：]([^\r\n]+)\r?\n密码[:：]([^\r\n]+)(?:\r?\n)?$/.exec(key);if(!match)throw Error('private_credential_format');
 const config=parseCollectorConfig({...source,username:match[1].trim(),password:match[2],materialReport:'6087051'});
 if(config.sourceKey!==runtime.sourceKey||accountFingerprint(config)!==service.accountFingerprint)throw Error('source_identity_mismatch');
 const pool=new pg.Pool({connectionString:runtime.databaseUrl,max:8});pool.on('error',()=>undefined);
 await verifyMigrationsCurrent(pool,resolve('database/migrations'));
 const actor=await loadExistingBootstrapActor(pool,config.operatorUsername);
 const stored=(await pool.query('SELECT account_fingerprint FROM ainuoke_source_profiles WHERE source_key=$1',[config.sourceKey])).rows[0];
 if(stored?.account_fingerprint!==service.accountFingerprint)throw Error('source_identity_mismatch');
 const objects=(await read('object-bundle/objects.json')).objects,data=new Map<string,Buffer>();
 for(const object of objects){const bytes=await readFile(root+'/object-bundle/objects/'+object.id+'.bin');
  if(object.sha256&&createHash('sha256').update(bytes).digest('hex')!==object.sha256)throw Error('attachment_hash_mismatch');data.set(object.key,bytes);}
 const storage={provider:objects[0].provider,container:objects[0].container,
  async head(k:string){const b=data.get(k);return b?{byteSize:b.length,sha256:createHash('sha256').update(b).digest('hex')}:null;},
  async get(k:string){const b=data.get(k);return b?Readable.from([b]):null;},async put(){throw Error('preview_read_only');},async remove(){throw Error('preview_read_only');}};
 const app=createApp({pool,staticDirectory,attachmentStorage:storage,allowedOrigins:[service.base],security:{secureCookies:false,sessionTtlSeconds:28800},
  logger:{error:()=>{void appendFile(root+'/runtime-events.jsonl',JSON.stringify({at:new Date().toISOString(),event:'local_api_error'})+'\n');}},
  orderMaterialRead:createPersistedMaterialPorts(pool,{sourceKey:config.sourceKey,maxAgeMs:1800000})});
 const server=createServer((req,res)=>{const path=(req.url??'').split('?')[0];
  if(!['GET','HEAD','OPTIONS'].includes(req.method??'GET')&&!['/api/v1/auth/login','/api/v1/auth/logout','/api/v1/ainuoke/catalog/sync-order'].includes(path)){
   res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'preview_read_only',message:'本机业务资料保持只读'}}));return;
  }app(req,res);});
 await new Promise<void>(r=>server.listen(63051,'127.0.0.1',r));
 await writeFile(root+'/runtime.private.json',JSON.stringify({...runtime,pid:process.pid,codeVersion:service.codeVersion}));
 const abort=new AbortController();let closing=false;
 const stop=()=>{if(closing)return;closing=true;abort.abort();server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 let lastTick:unknown=null,lastWrite=0,phase='STARTING';
 const status=async(force=false)=>{if(!force&&Date.now()-lastWrite<15000)return;lastWrite=Date.now();
  const state=await readAutomaticSyncStatus(pool,actor,config.sourceKey);
  const metrics=(await pool.query(`SELECT count(*)::int AS captures,count(*) FILTER(WHERE status='complete')::int AS complete,
   count(*) FILTER(WHERE status='failed')::int AS failed,coalesce(sum((metrics->>'logins')::int),0)::int AS logins,
   coalesce(sum((metrics->>'reportRequests')::int),0)::int AS reports,min(started_at) AS first,max(finished_at) AS last
   FROM ainuoke_sync_capture_attempts WHERE source_key=$1 AND started_at>=$2`,[config.sourceKey,service.enabledAt])).rows[0];
  await writeFile(root+'/service-status.new.json',JSON.stringify({pid:process.pid,phase,codeVersion:service.codeVersion,base:service.base,enabledAt:service.enabledAt,lastTick,metrics,...state}));
  await rename(root+'/service-status.new.json',root+'/service-status.json');};
 const timer=setInterval(()=>{void(async()=>{
  const current=await read('service.private.json');
  if(!current.enabled)stop();
  try{const request=await read('restart.request.json');if(typeof request.requestId==='string'&&/^[a-f0-9-]{36}$/i.test(request.requestId)){
   await unlink(root+'/restart.request.json');process.exitCode=75;stop();
  }}catch{}
  await status();
 })().catch(()=>undefined);},15000);
 try{
  if(service.enabled){
   const recovery=await resumeInterruptedReads(pool,actor,config.sourceKey);
   const control=(await pool.query('SELECT * FROM ainuoke_sync_controls WHERE source_key=$1',[config.sourceKey])).rows[0];
   if(!control?.paused_reason){
    if(!control?.enabled||!Object.entries(DEFAULT_SYNC_POLICY).every(([k,v])=>control.policy[k]===v))
     await configureSync(pool,actor,{sourceKey:config.sourceKey,enabled:true,expectedVersion:control?.version??0,policy:{...DEFAULT_SYNC_POLICY}});
    phase='AUTOMATIC_RUNNING';await status(true);
    await appendFile(root+'/runtime-events.jsonl',JSON.stringify({at:new Date().toISOString(),event:'automatic_started',pid:process.pid,recovery})+'\n');
    await runAutomaticSync(pool,actor,config,{signal:abort.signal,adoptNewOrders:true,onTick:async(result,elapsedMs)=>{
     lastTick={at:new Date().toISOString(),status:result.status,elapsedMs,jobs:result.jobs?.map(j=>({id:j.id,status:j.status}))};
     if(result.status!=='idle')await appendFile(root+'/runtime-events.jsonl',JSON.stringify(lastTick)+'\n');await status();
    }});
    phase=abort.signal.aborted?'STOPPING':'SYNC_PAUSED';
   }else phase='SYNC_PAUSED';
  }else phase='AUTOMATIC_DISABLED';
  await status(true);
  if(!closing)await new Promise<void>(r=>abort.signal.addEventListener('abort',()=>r(),{once:true}));
 }finally{clearInterval(timer);server.closeAllConnections();server.close();await pool.end();}
}
main().catch(error=>{const message=error instanceof Error?error.message:'';
 const code=error instanceof SourceError?error.code:/^[a-z_]{3,80}$/.test(message)?message:'local_runtime_stopped';
 console.error(JSON.stringify({at:new Date().toISOString(),code}));process.exitCode=1;});

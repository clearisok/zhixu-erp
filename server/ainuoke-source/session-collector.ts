import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {resolve} from 'node:path';
import {parseCollectorConfig,type CollectorConfig} from './collector.js';
import {SourceError} from './contract.js';
import type {SelectedSourceRequest} from './selected-source-once.js';
import {validateCatalogCheckpointPage,type CatalogCollectionOptions} from './catalog-checkpoints.js';
import {validateRequestDiagnostics} from './sync-diagnostics.js';

/** One owner per running worker, one in-flight capture. No token crosses stdout.
 * Transport uncertainty destroys the owner. A caller may replace it only inside
 * an explicitly bounded read-retry policy; creating an owner performs no login.
 */
export function createSessionCollector(start:typeof spawn=spawn){
 let child:ChildProcessWithoutNullStreams|null=null,closed=false,identity:string|null=null;
 let pending:{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>;
  progress:Promise<void>;onPage?:CatalogCollectionOptions['onPage'];onRequest?:CatalogCollectionOptions['onRequest'];requestEvents:number;progressCount:number;progressBytes:number;finalReceived:boolean}|null=null;
 let buffered=Buffer.alloc(0),secret:string|null=null;
 const stop=(code='capture_session_stopped')=>{
  closed=true;const active=pending;pending=null;buffered=Buffer.alloc(0);
  if(active){clearTimeout(active.timer);active.reject(new SourceError(code));}
  child?.kill();
 };
 const collect=async(config:CollectorConfig,request:SelectedSourceRequest,options?:CatalogCollectionOptions):Promise<unknown>=>{
  const cfg=parseCollectorConfig(config);
  if(closed||pending)throw new SourceError('capture_session_unavailable');
  if(request.mode!=='catalog-contracts'&&request.mode!=='catalog-discovery')throw new SourceError('selected_source_scope_invalid');
  if(!Array.isArray(request.contracts)||request.mode==='catalog-discovery'&&request.contracts.length!==0
   ||request.mode==='catalog-contracts'&&(request.contracts.length<1||request.contracts.length>25||new Set(request.contracts).size!==request.contracts.length
    ||request.contracts.some(c=>typeof c!=='string'||!/^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(c))))throw new SourceError('selected_source_scope_invalid');
  const binding=JSON.stringify([cfg.sourceKey,cfg.baseUrl,cfg.username,cfg.password,cfg.operatorUsername,cfg.materialReport,cfg.transportPolicy]);
  if(identity!==null&&identity!==binding){stop();throw new SourceError('source_account_mismatch');}identity=binding;
  if((options?.onPage||options?.resumePages)&&request.mode!=='catalog-discovery')throw new SourceError('selected_source_scope_invalid');
  secret=cfg.password;
  if(!child){
   child=start(process.platform==='win32'?'python':'python3',['-m','ainuoke_bridge.session_worker'],{
    cwd:resolve('tools/ainuoke-bridge'),windowsHide:true,stdio:['pipe','pipe','pipe'],
    env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
   child.stderr.resume();child.on('error',()=>stop('source_collector_unavailable'));
   child.on('close',()=>{closed=true;if(pending&&!pending.finalReceived)stop('capture_session_closed');});child.stdin.on('error',()=>stop('capture_session_closed'));
   child.stdout.on('data',(chunk:Buffer)=>{
    if(!pending){stop('source_invalid');return;}
    buffered=Buffer.concat([buffered,chunk]);
    if(buffered.length>32*1024*1024){stop('source_limit');return;}
    let newline:number;
    while((newline=buffered.indexOf(10))>=0){
     const frame=buffered.subarray(0,newline);buffered=buffered.subarray(newline+1);
     try{
      const value=JSON.parse(frame.toString('utf8')),active=pending;
      if(!active||active.finalReceived)throw Error();
      if(value.schemaVersion==='ainuoke-request-event.v1'){
       if(!active.onRequest||Object.keys(value).sort().join(',')!=='diagnostic,phase,schemaVersion'||!['started','finished'].includes(value.phase)
        ||++active.requestEvents>162||frame.length>4096||secret&&frame.toString('utf8').includes(secret))throw Error();
       const d=validateRequestDiagnostics([value.diagnostic])[0];
       active.progress=active.progress.then(()=>active.onRequest!(value.phase,d));
       void active.progress.catch(()=>stop('sync_audit_progress_failed'));
      }else if(value.schemaVersion==='ainuoke-catalog-page.v1'){
       if(!active.onPage||Object.keys(value).sort().join(',')!=='page,phase,schemaVersion'||!['before','after'].includes(value.phase)
        ||++active.progressCount>56||(active.progressBytes+=frame.length)>32*1024*1024||secret&&frame.toString('utf8').includes(secret))throw Error();
       const page=validateCatalogCheckpointPage(value.page);
       active.progress=active.progress.then(()=>active.onPage!(value.phase,page));
       void active.progress.catch(()=>stop('catalog_checkpoint_failed'));
      }else{
       if(value.schemaVersion!=='ainuoke-session-diagnostics.v1'||buffered.length)throw Error();
       active.finalReceived=true;
       void active.progress.then(()=>{if(pending!==active)return;pending=null;clearTimeout(active.timer);active.resolve(value);},()=>stop('catalog_checkpoint_failed'));
      }
     }catch{stop('source_invalid');return;}
    }
   });
  }
  return new Promise((resolveResult,reject)=>{
   pending={resolve:resolveResult,reject,timer:setTimeout(()=>stop('source_timeout'),180000),progress:Promise.resolve(),
    onPage:options?.onPage,onRequest:options?.onRequest,requestEvents:0,progressCount:0,progressBytes:0,finalReceived:false};
   child!.stdin.write(JSON.stringify({baseUrl:cfg.baseUrl,username:cfg.username,password:cfg.password,contracts:request.contracts,
    mode:request.mode,...(cfg.materialReport&&request.mode==='catalog-contracts'?{materialReport:cfg.materialReport}:{}),
    ...(options?.onPage?{catalogProgress:true,catalogResume:options.resumePages??[]}:{}),
    ...(options?.onRequest?{auditProgress:true}:{}),
    ...(cfg.transportPolicy?{transportPolicy:cfg.transportPolicy}:{})})+'\n');
  });
 };
 return {collect,close:()=>stop(),available:()=>!closed};
}

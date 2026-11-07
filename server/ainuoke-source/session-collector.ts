import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {resolve} from 'node:path';
import {parseCollectorConfig,type CollectorConfig} from './collector.js';
import {SourceError} from './contract.js';
import type {SelectedSourceRequest} from './selected-source-once.js';

/** One owner per running worker, one in-flight capture. No token crosses stdout.
 * Transport uncertainty destroys the owner. A caller may replace it only inside
 * an explicitly bounded read-retry policy; creating an owner performs no login.
 */
export function createSessionCollector(){
 let child:ChildProcessWithoutNullStreams|null=null,closed=false,identity:string|null=null;
 let pending:{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
 let chunks:Buffer[]=[],size=0;
 const stop=(code='capture_session_stopped')=>{
  closed=true;child?.kill();if(pending){clearTimeout(pending.timer);pending.reject(new SourceError(code));pending=null;}
 };
 const collect=async(config:CollectorConfig,request:SelectedSourceRequest):Promise<unknown>=>{
  const cfg=parseCollectorConfig(config);
  if(closed||pending)throw new SourceError('capture_session_unavailable');
  if(request.mode!=='catalog-contracts'&&request.mode!=='catalog-discovery')throw new SourceError('selected_source_scope_invalid');
  if(!Array.isArray(request.contracts)||request.mode==='catalog-discovery'&&request.contracts.length!==0
   ||request.mode==='catalog-contracts'&&(request.contracts.length<1||request.contracts.length>25||new Set(request.contracts).size!==request.contracts.length
    ||request.contracts.some(c=>typeof c!=='string'||!/^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(c))))throw new SourceError('selected_source_scope_invalid');
  const binding=JSON.stringify([cfg.sourceKey,cfg.baseUrl,cfg.username,cfg.password,cfg.operatorUsername,cfg.materialReport,cfg.transportPolicy]);
  if(identity!==null&&identity!==binding){stop();throw new SourceError('source_account_mismatch');}identity=binding;
  if(!child){
   child=spawn(process.platform==='win32'?'python':'python3',['-m','ainuoke_bridge.session_worker'],{
    cwd:resolve('tools/ainuoke-bridge'),windowsHide:true,stdio:['pipe','pipe','pipe'],
    env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});
   child.stderr.resume();child.on('error',()=>stop('source_collector_unavailable'));
   child.on('close',()=>stop('capture_session_closed'));child.stdin.on('error',()=>stop('capture_session_closed'));
   child.stdout.on('data',(chunk:Buffer)=>{
    if(!pending){stop('source_invalid');return;}size+=chunk.length;
    if(size>32*1024*1024){stop('source_limit');return;}chunks.push(chunk);
    if(chunk.includes(10)){
     const data=Buffer.concat(chunks);if(data.indexOf(10)!==data.length-1){stop('source_invalid');return;}
     try{const value=JSON.parse(data.toString('utf8'));if(value.schemaVersion!=='ainuoke-session-diagnostics.v1')throw Error();
      const active=pending;pending=null;clearTimeout(active.timer);chunks=[];size=0;active.resolve(value);
     }catch{stop('source_invalid');}
    }
   });
  }
  return new Promise((resolveResult,reject)=>{
   pending={resolve:resolveResult,reject,timer:setTimeout(()=>stop('source_timeout'),180000)};
   child!.stdin.write(JSON.stringify({baseUrl:cfg.baseUrl,username:cfg.username,password:cfg.password,contracts:request.contracts,
    mode:request.mode,...(cfg.materialReport&&request.mode==='catalog-contracts'?{materialReport:cfg.materialReport}:{}),
    ...(cfg.transportPolicy?{transportPolicy:cfg.transportPolicy}:{})})+'\n');
  });
 };
 return {collect,close:()=>stop(),available:()=>!closed};
}

import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';

// Public read-only JSON probe. No redirects, unbounded bodies, or disabled TLS.
export function probeJson(url,ca,{timeoutMs=2500,hostname}={}) {
  return new Promise((resolve,reject)=>{
    const fail=()=>{const error=Error('https_probe_failed');error.tlsReady=req.socket?.authorized===true;reject(error);};
    const req=request(url,{ca,...(hostname?{servername:hostname,checkServerIdentity:(_host,cert)=>checkServerIdentity(hostname,cert)}:{})},res=>{
      let size=0;const chunks=[];
      res.on('data',b=>{size+=b.length;if(size>16384)req.destroy();else chunks.push(b);});
      res.on('error',fail);
      res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())});}catch{fail();}});
    });
    const timer=setTimeout(()=>req.destroy(),timeoutMs);req.once('close',()=>clearTimeout(timer));req.on('error',fail);req.end();
  });
}
export function verifyBuild(info,safe){
  if(info.gitCommit!==safe.commit||info.buildId!==safe.buildId||info.buildTime!==safe.buildTime||info.quoteAuthority!=='server'||info.masterSettingsAuthority!=='server'||info.quoteWriterMode!=='writable'||info.identityMode!=='session')throw Error('runtime_identity_mismatch');
}
export function verifyRuntime(rows,expected,{requireRunning=false}={}){
  if(rows.length!==3||new Set(rows.map(r=>r.service)).size!==3)throw Error('runtime_identity_mismatch');
  for(const r of rows){
    if(r.project!==expected.project||!['database','app','gateway'].includes(r.service)||r.image!==expected.images[r.service]||r.configHash!==expected.hashes[r.service])throw Error('runtime_identity_mismatch');
    if(requireRunning&&(!r.running||r.health!=='healthy'))throw Error(r.service==='gateway'?'gateway_unhealthy':r.service==='app'?'app_not_ready':'database_not_ready');
  }
}
export async function waitReady({inspect,expected,probe,safe,timeoutMs=90000,intervalMs=500,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  const until=now()+timeoutMs;let last='app_not_ready';
  while(now()<until){
    const rows=inspect();verifyRuntime(rows,expected);
    const stopped=rows.find(r=>!r.running);
    if(stopped)throw Error(stopped.service==='gateway'?'gateway_unhealthy':stopped.service==='app'?'app_not_ready':'database_not_ready');
    try{verifyRuntime(rows,expected,{requireRunning:true});}catch(e){last=e.message;await sleep(Math.min(intervalMs,Math.max(0,until-now())));continue;}
    try{
      const health=await probe('/api/v1/health',Math.max(1,Math.min(2500,until-now())));
      if(health.status!==200||health.body.status!=='ok'||health.body.database!=='ready'){last='app_not_ready';}
      else{
        const build=await probe('/build-info.json',Math.max(1,Math.min(2500,until-now())));
        if(build.status===200){verifyBuild(build.body,safe);verifyRuntime(inspect(),expected,{requireRunning:true});return;}
        last='runtime_identity_mismatch';
      }
    }catch(e){if(e.message==='runtime_identity_mismatch')throw e;last='https_entry_not_ready';}
    await sleep(Math.min(intervalMs,Math.max(0,until-now())));
  }
  throw Error(last);
}
export function safeFailure(error){
  return ['runtime_identity_mismatch','app_not_ready','gateway_unhealthy','database_not_ready','https_entry_not_ready','readiness_timeout_invalid','gateway_probe_required','image_identity_mismatch','compiled_identity_mismatch','explicit_matching_execute_required'].includes(error?.message)?error.message:'trial_operation_failed_review_config_or_safe_service_logs';
}

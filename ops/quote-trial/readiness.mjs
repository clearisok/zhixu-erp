import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { trialServices, verifyLocalObjectMounts } from './local-objects.mjs';

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
  if(safe.localObjects&&info.orderRead!=='snapshot')throw Error('runtime_identity_mismatch');
}
export function verifyRuntime(rows,expected,{requireRunning=false}={}){
  const services=trialServices(expected.localObjects);
  if(rows.length!==services.length||new Set(rows.map(r=>r.service)).size!==services.length)throw Error('runtime_identity_mismatch');
  for(const r of rows){
    if(r.project!==expected.project||!services.includes(r.service)||r.image!==expected.images[r.service]||r.configHash!==expected.hashes[r.service])throw Error('runtime_identity_mismatch');
    if(requireRunning&&(!r.running||r.health!=='healthy'))throw Error(serviceFailure(r.service));
  }
  if(expected.localObjects)verifyLocalObjectMounts(rows,expected.project);
}
const serviceFailure=service=>service==='gateway'?'gateway_unhealthy':service==='app'?'app_not_ready':service==='database'?'database_not_ready':'local_object_storage_not_ready';
export async function waitReady({inspect,expected,probe,safe,storageProbe,timeoutMs=90000,intervalMs=500,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(expected.localObjects&&typeof storageProbe!=='function')throw Error('local_object_storage_not_ready');
  const until=now()+timeoutMs;let last='app_not_ready';
  while(now()<until){
    const rows=inspect();verifyRuntime(rows,expected);
    const stopped=rows.find(r=>!r.running);
    if(stopped)throw Error(serviceFailure(stopped.service));
    try{verifyRuntime(rows,expected,{requireRunning:true});}catch(e){last=e.message;await sleep(Math.min(intervalMs,Math.max(0,until-now())));continue;}
    try{
      const health=await probe('/api/v1/health',Math.max(1,Math.min(2500,until-now())));
      if(health.status!==200||health.body.status!=='ok'||health.body.database!=='ready'){last='app_not_ready';}
      else{
        const build=await probe('/build-info.json',Math.max(1,Math.min(2500,until-now())));
        if(build.status===200){verifyBuild(build.body,safe);if(storageProbe)await storageProbe();verifyRuntime(inspect(),expected,{requireRunning:true});return;}
        last='runtime_identity_mismatch';
      }
    }catch(e){if(['runtime_identity_mismatch','runtime_storage_mismatch','local_object_storage_not_ready'].includes(e.message))throw e;last='https_entry_not_ready';}
    await sleep(Math.min(intervalMs,Math.max(0,until-now())));
  }
  throw Error(last);
}
export function safeFailure(error){
  if(['runtime_identity_mismatch','runtime_storage_mismatch','local_object_storage_not_ready','app_not_ready','gateway_unhealthy','database_not_ready','https_entry_not_ready','readiness_timeout_invalid','gateway_probe_required','image_identity_mismatch','compiled_identity_mismatch','explicit_matching_execute_required'].includes(error?.message))return error.message;
  // Child stderr may include credentials/configuration. Inspect only bounded
  // primitive bytes and return a fixed category; never forward the raw output.
  const stderr=error?.stderr;
  if(Number.isInteger(error?.status)&&error.status>0&&(typeof stderr==='string'||Buffer.isBuffer(stderr))&&Buffer.byteLength(stderr)<=65536){
    const text=typeof stderr==='string'?stderr:stderr.toString('utf8');
    if(/Error response from daemon: (?:all predefined address pools have been fully subnetted|could not find an available, non-overlapping IPv4 address pool)/i.test(text))return 'docker_address_pool_exhausted';
  }
  return 'trial_operation_failed_review_config_or_safe_service_logs';
}

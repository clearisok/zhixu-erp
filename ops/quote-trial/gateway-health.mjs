import { readFileSync } from 'node:fs';
import { probeJson } from './readiness.mjs';
try {
  const hostname=new URL(process.env.TRIAL_HTTPS_ORIGIN).hostname.replace(/^\[|\]$/g,'');
  const ca=readFileSync('/run/tls/ca.pem');
  let result;
  try{result=await probeJson('https://127.0.0.1:8443/api/v1/health',ca,{hostname,timeoutMs:2500});}
  catch(e){throw Error(e.tlsReady?'gateway_upstream_not_ready':'gateway_tls_unavailable');}
  if(result.status!==200||result.body.status!=='ok'||result.body.database!=='ready')throw Error('gateway_upstream_not_ready');
  console.log(JSON.stringify({gatewayTls:'ready',upstream:'ready'}));
}catch(e){console.error(e.message==='gateway_upstream_not_ready'?'gateway_upstream_not_ready':'gateway_tls_unavailable');process.exitCode=1;}

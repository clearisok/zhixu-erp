// Small TLS termination only, no authentication/business implementation.
import { createServer } from 'node:https';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
const server=createServer({cert:readFileSync('/run/tls/cert.pem'),key:readFileSync('/run/tls/key.pem')},(req,res)=>{
  const upstream=request({host:process.env.TRIAL_PROXY_HOST||'app',port:3000,path:req.url,method:req.method,
    headers:{...req.headers,'x-forwarded-proto':'https'},timeout:120000},remote=>{
      res.writeHead(remote.statusCode||502,remote.headers);remote.pipe(res);
      res.once('close',()=>remote.destroy());
  });
  upstream.on('timeout',()=>upstream.destroy());
  upstream.on('error',()=>{if(!res.headersSent){res.writeHead(502);res.end('upstream_unavailable');}else res.destroy();});
  res.once('close',()=>upstream.destroy());req.pipe(upstream);
});
server.requestTimeout=120000;server.headersTimeout=15000;
server.listen(8443,'0.0.0.0');

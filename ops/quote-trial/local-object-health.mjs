// Health only: validates the internal certificate and upstream, no bucket writes.
import { request } from 'node:https';
import { readFileSync } from 'node:fs';
try {
  await new Promise((resolve,reject)=>{
    const req=request('https://objects-tls:8443/minio/health/live',{ca:readFileSync('/run/tls/ca.pem')},res=>{
      res.resume();res.on('end',()=>res.statusCode===200?resolve():reject(Error()));res.on('error',reject);
    });
    const timer=setTimeout(()=>req.destroy(Error()),2500);
    req.once('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
} catch { console.error('local_object_tls_unavailable');process.exitCode=1; }

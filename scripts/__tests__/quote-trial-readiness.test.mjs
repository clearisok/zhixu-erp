import test from 'node:test';
import assert from 'node:assert/strict';
import { waitReady,verifyRuntime,verifyBuild,probeJson,safeFailure } from '../../ops/quote-trial/readiness.mjs';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const expected={project:'synthetic',images:{database:'db-id',app:'image-id',gateway:'image-id'},hashes:{database:'d',app:'a',gateway:'g'}};
const rows=()=>Object.keys(expected.images).map(service=>({project:expected.project,service,image:expected.images[service],configHash:expected.hashes[service],running:true,health:'healthy'}));
const safe={commit:'a'.repeat(40),buildId:'test',buildTime:'2026-10-09T03:00:00Z'};
const build={gitCommit:safe.commit,buildId:safe.buildId,buildTime:safe.buildTime,quoteAuthority:'server',masterSettingsAuthority:'server',quoteWriterMode:'writable',identityMode:'session'};
const probe=async path=>({status:200,body:path.includes('health')?{status:'ok',database:'ready'}:build});
test('readiness needs all exact healthy services, DB-ready HTTPS and running build identity',async()=>{
  let polls=0;await waitReady({inspect:()=>{const r=rows();if(++polls===1)r[1].health='starting';return r;},expected,safe,probe,intervalMs:1});assert.ok(polls>=3);
  for(const field of ['gitCommit','buildId','buildTime','quoteAuthority','masterSettingsAuthority','quoteWriterMode','identityMode'])assert.throws(()=>verifyBuild({...build,[field]:'wrong'},safe),/runtime_identity_mismatch/);
});
test('restart refuses changed candidate/config/project, duplicate or missing service',()=>{
  for(const field of ['project','image','configHash']){const r=rows();r[1][field]='wrong';assert.throws(()=>verifyRuntime(r,expected),/runtime_identity_mismatch/);}
  assert.throws(()=>verifyRuntime(rows().slice(1),expected));const r=rows();r[1].service='database';assert.throws(()=>verifyRuntime(r,expected));
});
test('bounded startup failures have safe codes and no recovery/writes',async()=>{
  for(const service of ['app','gateway','database']){const r=rows();r.find(x=>x.service===service).running=false;await assert.rejects(waitReady({inspect:()=>r,expected,safe,probe}),new RegExp(service==='gateway'?'gateway_unhealthy':`${service}_not_ready`));}
  let time=0,calls=0;
  await assert.rejects(waitReady({inspect:rows,expected,safe,probe:async()=>{calls++;return {status:503,body:{status:'no'}};},timeoutMs:10,intervalMs:1,now:()=>time,sleep:async ms=>{time+=ms;}}),/app_not_ready/);assert.equal(calls,10);
  await assert.rejects(waitReady({inspect:rows,expected,safe,probe:async()=>({status:200,body:{...build,status:'ok',database:'ready',gitCommit:'b'.repeat(40)}})}),/runtime_identity_mismatch/);
  assert.equal(safeFailure(Error('password=synthetic-secret')),'trial_operation_failed_review_config_or_safe_service_logs');
});
test('actual TLS probe rejects untrusted certificates, oversized/malformed JSON and stalls',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'zhixu-trial-probe-'));
  const certPath=join(dir,'cert.pem'),keyPath=join(dir,'key.pem');
  execFileSync(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
  const ca=readFileSync(certPath),server=createServer({cert:ca,key:readFileSync(keyPath)},(req,res)=>{if(req.url==='/stall')return;if(req.url==='/big')res.end('x'.repeat(17000));else if(req.url==='/bad')res.end('not-json');else res.end(JSON.stringify({status:'ok',database:'ready'}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true});});
  const url=`https://127.0.0.1:${server.address().port}`;
  assert.equal((await probeJson(url,ca,{hostname:'localhost'})).body.database,'ready');
  await assert.rejects(probeJson(url,undefined,{hostname:'localhost'}),/https_probe_failed/);
  await assert.rejects(probeJson(url,ca,{hostname:'wrong.invalid'}),/https_probe_failed/);
  for(const path of ['/stall','/big','/bad'])await assert.rejects(probeJson(url+path,ca,{hostname:'localhost',timeoutMs:80}),/https_probe_failed/);
});

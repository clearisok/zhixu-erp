import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrial, validateComposeTarget, parseObjectBundleOverride } from '../../ops/quote-trial/trial.mjs';
import { LOCAL_OBJECT_IMAGE, LOCAL_SERVICES, LOCAL_VOLUMES, isLocalObjectEndpoint, verifyLocalObjectMounts, verifyLocalVolumeOwnership, assertLocalMaintenance, assertLocalInitialization } from '../../ops/quote-trial/local-objects.mjs';
import { verifyRuntime, waitReady } from '../../ops/quote-trial/readiness.mjs';
import { readTrialConfig } from '../../ops/quote-trial/trial.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { X509Certificate } from 'node:crypto';
const values={TRIAL_PROJECT:'zhixu-quote-trial-unit',TRIAL_PORT:'62426',TRIAL_IMAGE:'synthetic:unit',TRIAL_COMMIT:'a'.repeat(40),TRIAL_BUILD_ID:'unit',TRIAL_BUILD_TIME:'2026-10-20T00:00:00Z',TRIAL_HTTPS_ORIGIN:'https://localhost:62426',TRIAL_S3_ENDPOINT:'https://objects-tls:8443',TRIAL_S3_PATH_STYLE:'true',TRIAL_LOCAL_OBJECTS:'true',TRIAL_DB_PASSWORD:'synthetic',TRIAL_ADMIN_PASSWORD:'synthetic',TRIAL_S3_REGION:'us-east-1',TRIAL_S3_BUCKET:'synthetic',TRIAL_SECRET_ID_FILE:'/test/id',TRIAL_SECRET_KEY_FILE:'/test/key',TRIAL_TLS_CERT_FILE:'/test/cert',TRIAL_TLS_KEY_FILE:'/test/key',TRIAL_TLS_CA_FILE:'/test/ca'};
const safe=validateTrial(values);
test('storage loader URL normalization preserves the exact local endpoint, never a remote/path credential variant',()=>{
  assert.equal(isLocalObjectEndpoint(values.TRIAL_S3_ENDPOINT),true);
  assert.equal(isLocalObjectEndpoint(new URL(values.TRIAL_S3_ENDPOINT).toString()),true);
  for(const url of ['http://objects-tls:8443','https://objects.invalid:8443','https://objects-tls:8443/path','https://objects-tls:8443/?query=1','https://user:password@objects-tls:8443','https://objects-tls:8443/#fragment'])assert.equal(isLocalObjectEndpoint(url),false);
});
const mount=(source,target,read_only=false)=>({type:'volume',source,target,read_only});
function model(){return {name:safe.project,services:{
  database:{image:'postgres:16-alpine',volumes:[mount('data','/var/lib/postgresql/data')]},
  app:{image:safe.image,environment:{DB_HOST:'database',DB_NAME:'quote_trial',DB_USER:'quote_trial',NODE_ENV:'production',ZHIXU_IDENTITY_MODE:'session',ZHIXU_COOKIE_SECURE:'true',ZHIXU_ALLOWED_ORIGINS:safe.browserOrigin,ZHIXU_GIT_COMMIT:safe.commit,ZHIXU_BUILD_ID:safe.buildId,ZHIXU_BUILD_TIME:safe.buildTime,NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY:'server',NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY:'server',NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE:'writable',NODE_EXTRA_CA_CERTS:'/run/tls/ca.pem',NEXT_PUBLIC_ZHIXU_ORDER_READ:'snapshot',ZHIXU_AINUOKE_SOURCE_READ:'snapshot',ZHIXU_AINUOKE_SOURCE_KEY:'local-empty',ZHIXU_AINUOKE_SOURCE_MAX_AGE_MS:'600000',ZHIXU_ATTACHMENT_S3_ENDPOINT:values.TRIAL_S3_ENDPOINT,ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE:'true'},volumes:[mount('appsecrets','/run/secrets',true)]},
  gateway:{image:safe.image,command:['node','/trial/tls-gateway.mjs'],environment:{TRIAL_PROXY_HOST:'app',TRIAL_HTTPS_ORIGIN:safe.origin},networks:{default:null,ingress:null},ports:[{host_ip:'127.0.0.1',published:String(safe.port)}],healthcheck:{test:['CMD','node','/trial/gateway-health.mjs']}},
  objects:{image:LOCAL_OBJECT_IMAGE,user:'1001:0',tmpfs:['/certs:ro,size=64k,mode=0555,noexec,nosuid'],environment:{MINIO_ROOT_USER_FILE:'/run/secrets/cos-id',MINIO_ROOT_PASSWORD_FILE:'/run/secrets/cos-key'},volumes:[{...mount('objects','/bitnami/minio/data'),volume:{nocopy:true}},mount('objectsecrets','/run/secrets',true)],healthcheck:{test:['CMD','curl','--fail','--silent','http://127.0.0.1:9000/minio/health/live']}},
  'objects-tls':{image:safe.image,user:'1000:1000',command:['node','/trial/tls-gateway.mjs'],environment:{TRIAL_PROXY_HOST:'objects',TRIAL_PROXY_PORT:'9000'},healthcheck:{test:['CMD','node','/trial/local-object-health.mjs']}},
},volumes:Object.fromEntries(['data','objects','appsecrets','objectsecrets'].map(key=>[key,{name:`${safe.project}_${key}`}])) ,networks:{default:{name:`${safe.project}_default`,internal:true},ingress:{name:`${safe.project}_ingress`,internal:false}}};}
const expected={project:safe.project,localObjects:true,images:Object.fromEntries(LOCAL_SERVICES.map(s=>[s,`${s}-image`])),hashes:Object.fromEntries(LOCAL_SERVICES.map(s=>[s,`${s}-hash`]))};
function rows(){const m=model();return LOCAL_SERVICES.map(service=>({project:safe.project,service,image:expected.images[service],configHash:expected.hashes[service],running:true,health:'healthy',mounts:(m.services[service].volumes||[]).map(v=>({Type:'volume',Name:`${safe.project}_${v.source}`,Destination:v.target,RW:!v.read_only}))}));}
test('local objects is opt-in, fixed HTTPS/path-style, never a remote or invalid fallback',()=>{
  assert.equal(safe.localObjects,true);
  assert.equal(validateTrial({...values,TRIAL_LOCAL_OBJECTS:'false'}).localObjects,false);
  for(const overrides of [{TRIAL_LOCAL_OBJECTS:'yes'},{TRIAL_S3_ENDPOINT:'https://objects.invalid'},{TRIAL_S3_ENDPOINT:'http://objects-tls:8443'},{TRIAL_S3_PATH_STYLE:'false'},{TRIAL_TLS_CA_FILE:undefined}])assert.throws(()=>validateTrial({...values,...overrides}));
});
test('exact five-service local Compose with isolated persistent volumes is accepted',()=>validateComposeTarget(model(),safe));
test('ingress gateway can only forward to the reviewed application and command',()=>{
  const explicit=model();explicit.services.gateway.environment.TRIAL_PROXY_PORT='3000';validateComposeTarget(explicit,safe);
  for(const mutate of [g=>g.environment.TRIAL_PROXY_HOST='remote.invalid',g=>delete g.environment.TRIAL_PROXY_HOST,g=>g.environment.TRIAL_PROXY_PORT='9000',g=>g.command=['node','other.mjs']]){
    const m=model();mutate(m.services.gateway);assert.throws(()=>validateComposeTarget(m,safe),/unsafe_local_gateway_upstream/);
  }
});
test('fresh bundle override is explicit, existing and limited to offline object jobs',()=>{
  const folder=mkdtempSync(join(tmpdir(),'zhixu-bundle-arg-'));
  try{
    assert.equal(parseObjectBundleOverride('objects-export',`--bundle-dir=${folder}`),resolve(folder));
    assert.equal(parseObjectBundleOverride('objects-restore',`--bundle-dir=${folder}`),resolve(folder));
    assert.equal(parseObjectBundleOverride('start',undefined),undefined);
    for(const [action,arg] of [['start',`--bundle-dir=${folder}`],['objects-export','--bundle-dir=relative'],['objects-export',`--wrong=${folder}`],['objects-export',`--bundle-dir=${join(folder,'missing')}`],['objects-export',`--bundle-dir=${resolve('package.json')}`]])assert.throws(()=>parseObjectBundleOverride(action,arg));
  }finally{assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep));rmSync(folder,{recursive:true});}
});
test('foreign storage, network, extra services, public ports and TLS downgrades fail closed',()=>{
  const mutations=[m=>m.services.extra={image:safe.image},m=>delete m.services.objects,m=>m.volumes.objects.external=true,m=>m.volumes.objects.name='old-data',m=>m.networks.default.internal=false,m=>m.services.app.networks={default:null,ingress:null},m=>m.services.objects.volumes[0].volume.nocopy=false,m=>m.networks.old={name:'old'},m=>m.services.objects.ports=[{published:'9000'}],m=>m.services['objects-tls'].ports=[{published:'8443'}],m=>m.services.objects.image='minio:latest',m=>m.services.objects.tmpfs=['/bitnami/minio/data'],m=>m.services.objects.volumes[0].type='bind',m=>m.services.objects.volumes[0].source='foreign',m=>m.services.app.volumes[0].read_only=false,m=>m.services.objects.environment.MINIO_ROOT_PASSWORD='plaintext',m=>m.services.app.environment.NODE_TLS_REJECT_UNAUTHORIZED='0',m=>m.services['objects-tls'].environment.NODE_OPTIONS='--some-hook',m=>m.services['objects-tls'].environment.TRIAL_PROXY_PORT='3000',m=>m.services.objects.healthcheck.disable=true];
  for(const mutate of mutations){const m=model();mutate(m);assert.throws(()=>validateComposeTarget(m,safe));}
  assert.throws(()=>validateComposeTarget(model(),{...safe,localObjects:false}));
});
test('actual volume name/type/write permissions and exact image/config remain mandatory',()=>{
  verifyRuntime(rows(),expected,{requireRunning:true});
  for(const field of ['Name','Type','Destination','RW']){const r=rows();r.find(x=>x.service==='objects').mounts[0][field]='wrong';assert.throws(()=>verifyLocalObjectMounts(r,safe.project),/runtime_storage_mismatch/);}
  assert.throws(()=>verifyRuntime(rows().slice(0,3),expected));
  assert.throws(()=>verifyRuntime(rows(),{...expected,localObjects:false}));
});
test('maintenance permits only verified local object services; DB restore still stops all writers',()=>{
  const r=rows();r.filter(x=>['app','gateway'].includes(x.service)).forEach(x=>x.running=false);
  assertLocalMaintenance(r,expected,{allowObjects:true});
  assert.throws(()=>assertLocalMaintenance(r,expected),/offline_maintenance_required/);
  r.filter(x=>['objects','objects-tls'].includes(x.service)).forEach(x=>x.running=false);
  assertLocalMaintenance(r,expected);
  r.find(x=>x.service==='app').running=true;assert.throws(()=>assertLocalMaintenance(r,expected,{allowObjects:true}));
  r.find(x=>x.service==='app').running=false;r.push({...r[0],service:'unexpected'});assert.throws(()=>assertLocalMaintenance(r,expected,{allowObjects:true}));
});
test('init validates existing DB identity before up and never adopts an unattached old data volume',()=>{
  assertLocalInitialization([],expected,false);
  assert.throws(()=>assertLocalInitialization([],expected,true),/unattached_database_volume/);
  const db=rows().filter(r=>r.service==='database');assertLocalInitialization(db,expected,true);
  for(const field of ['image','configHash','project'])assert.throws(()=>assertLocalInitialization([{...db[0],[field]:'wrong'}],expected,true),/runtime_identity_mismatch/);
});

test('unattached existing local volumes require exact project and volume ownership before any up',()=>{
  const volumes=LOCAL_VOLUMES.map(key=>({Name:`${safe.project}_${key}`,Labels:{'com.docker.compose.project':safe.project,'com.docker.compose.volume':key}}));
  verifyLocalVolumeOwnership([],safe.project);verifyLocalVolumeOwnership(volumes,safe.project);
  for(const volume of volumes){
    for(const labels of [null,{}, {...volume.Labels,'com.docker.compose.project':'other'}, {...volume.Labels,'com.docker.compose.volume':'other'}])assert.throws(()=>verifyLocalVolumeOwnership([{...volume,Labels:labels}],safe.project),/runtime_storage_mismatch/);
  }
});
test('DB healthy and five healthy containers cannot hide missing bucket, bad credentials or TLS',async()=>{
  const probe=async path=>({status:200,body:path.includes('health')?{status:'ok',database:'ready'}:{gitCommit:safe.commit,buildId:safe.buildId,buildTime:safe.buildTime,quoteAuthority:'server',masterSettingsAuthority:'server',quoteWriterMode:'writable',identityMode:'session',orderRead:'snapshot'}});
  await assert.rejects(waitReady({inspect:rows,expected,safe,probe}),/local_object_storage_not_ready/);
  await assert.rejects(waitReady({inspect:rows,expected,safe,probe,storageProbe:async()=>{throw Error('local_object_storage_not_ready');}}),/local_object_storage_not_ready/);
  let calls=0;await waitReady({inspect:rows,expected,safe,probe,storageProbe:async()=>{calls++;}});assert.equal(calls,1);
});
test('new Windows private target prepares once, validates real composed model, never installs certificate trust', {skip:process.platform!=='win32'},()=>{
  const parent=mkdtempSync(join(tmpdir(),'zhixu-local-input-test-')),folder=join(parent,'private');
  const args=['-NoProfile','-File',resolve('ops/quote-trial/new-local-target.ps1'),'-Root',folder,'-Project',values.TRIAL_PROJECT,'-Port',values.TRIAL_PORT,'-Image',values.TRIAL_IMAGE,'-Commit',values.TRIAL_COMMIT,'-BuildId',values.TRIAL_BUILD_ID,'-BuildTime',values.TRIAL_BUILD_TIME];
  const run=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',windowsHide:true,timeout:20000,stdio:['ignore','pipe','pipe']});
  try {
    assert.equal(JSON.parse(run('pwsh',args)).writes,0);
    const receipt=JSON.parse(run('pwsh',[...args,'-Execute']));assert.equal(receipt.systemTrustChanged,false);assert.equal(receipt.databaseContacted,false);
    const file=join(folder,'trial.conf'),before=readFileSync(file,'utf8'),v=readTrialConfig(file),safe=validateTrial(v);
    const cert=new X509Certificate(readFileSync(v.TRIAL_TLS_CERT_FILE));assert.equal(cert.checkHost('objects-tls'),'objects-tls');assert.equal(cert.checkHost('wrong.invalid'),undefined);assert.equal(cert.checkIP('127.0.0.1'),'127.0.0.1');
    const m=JSON.parse(run('docker',['compose','--env-file',file,'-f',resolve('ops/quote-trial/compose.yml'),'-f',resolve('ops/quote-trial/local-objects.compose.yml'),'-f',resolve('ops/quote-trial/objects.compose.yml'),'-p',v.TRIAL_PROJECT,'config','--format','json']));validateComposeTarget(m,safe);
    const restored=JSON.parse(run('docker',['compose','--env-file',file,'-f',resolve('ops/quote-trial/compose.yml'),'-f',resolve('ops/quote-trial/local-objects.compose.yml'),'-f',resolve('ops/quote-trial/objects.compose.yml'),'-f',resolve('ops/quote-trial/objects-readonly.compose.yml'),'-p',v.TRIAL_PROJECT,'config','--format','json']));
    assert.equal(m.services.app.volumes.find(v=>v.target==='/bundle').read_only,undefined);
    assert.equal(restored.services.app.volumes.find(v=>v.target==='/bundle').read_only,true);
    assert.throws(()=>run('pwsh',[...args,'-Execute']));assert.equal(readFileSync(file,'utf8'),before);
    assert.doesNotMatch(JSON.stringify(receipt),/PASSWORD|SECRET|token/i);
  } finally { assert.ok(resolve(parent).startsWith(resolve(tmpdir())+sep));rmSync(parent,{recursive:true}); }
});

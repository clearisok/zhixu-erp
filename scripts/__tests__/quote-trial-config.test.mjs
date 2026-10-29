import test from 'node:test';import assert from 'node:assert/strict';
import { validateTrial, validateComposeTarget, readTrialConfig } from '../../ops/quote-trial/trial.mjs';
import { mkdtempSync,writeFileSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const v={TRIAL_PROJECT:'zhixu-quote-trial-synthetic',TRIAL_PORT:'18443',TRIAL_COMMIT:'a'.repeat(40),TRIAL_HTTPS_ORIGIN:'https://localhost:18443',TRIAL_S3_ENDPOINT:'https://objects.invalid',TRIAL_IMAGE:'synthetic:test',TRIAL_BUILD_ID:'test',TRIAL_BUILD_TIME:'2026-10-09T00:00:00Z',TRIAL_DB_PASSWORD:'synthetic',TRIAL_ADMIN_PASSWORD:'synthetic',TRIAL_S3_REGION:'ap-hongkong',TRIAL_S3_BUCKET:'synthetic',TRIAL_SECRET_ID_FILE:'/test/id',TRIAL_SECRET_KEY_FILE:'/test/key',TRIAL_TLS_CERT_FILE:'/test/cert',TRIAL_TLS_KEY_FILE:'/test/tlskey'};
test('explicit isolated trial config, no defaults to old stack',()=>assert.equal(validateTrial(v).project,v.TRIAL_PROJECT));
test('readiness polling is bounded and certificate trust path is explicit',()=>{
  validateTrial({...v,TRIAL_READY_TIMEOUT_MS:'120000',TRIAL_TLS_CA_FILE:'/test/ca'});
  for(const timeout of ['0','NaN','999','120001'])assert.throws(()=>validateTrial({...v,TRIAL_READY_TIMEOUT_MS:timeout}),/readiness_timeout_invalid/);
  assert.throws(()=>validateTrial({...v,TRIAL_TLS_CA_FILE:'relative.pem'}));
});
test('gateway overrides app-image healthcheck with a trusted TLS/upstream probe',()=>{
  const gateway=readFileSync('ops/quote-trial/compose.yml','utf8').split('  gateway:')[1];
  assert.match(gateway,/healthcheck:/);assert.match(gateway,/gateway-health\.mjs/);
});
test('old project/ports/short commit/no TLS rejected',()=>{for(const override of [{TRIAL_PROJECT:'preparesystem'},{TRIAL_PORT:'3001'},{TRIAL_COMMIT:'short'},{TRIAL_HTTPS_ORIGIN:'http://localhost:18443'},{TRIAL_S3_ENDPOINT:'http://objects.invalid'}])assert.throws(()=>validateTrial({...v,...override}));});
const model=()=>({name:v.TRIAL_PROJECT,services:{database:{image:'postgres:16-alpine',volumes:[{type:'volume',source:'data',target:'/var/lib/postgresql/data'}]},app:{image:v.TRIAL_IMAGE,environment:{DB_HOST:'database',DB_NAME:'quote_trial',DB_USER:'quote_trial',NODE_ENV:'production',ZHIXU_ALLOWED_ORIGINS:v.TRIAL_HTTPS_ORIGIN,ZHIXU_IDENTITY_MODE:'session',ZHIXU_COOKIE_SECURE:'true',ZHIXU_GIT_COMMIT:v.TRIAL_COMMIT,ZHIXU_BUILD_ID:v.TRIAL_BUILD_ID,ZHIXU_BUILD_TIME:v.TRIAL_BUILD_TIME,NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY:'server',NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY:'server',NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE:'writable'}},gateway:{image:v.TRIAL_IMAGE,environment:{TRIAL_HTTPS_ORIGIN:v.TRIAL_HTTPS_ORIGIN},ports:[{host_ip:'127.0.0.1',published:v.TRIAL_PORT}]}},volumes:{data:{name:`${v.TRIAL_PROJECT}_data`}},networks:{default:{name:`${v.TRIAL_PROJECT}_default`}}});
test('resolved Compose cannot adopt a legacy volume/network/DB/container or expose DB/app',()=>{
  const valid=()=>{const m=model();m.services.gateway.healthcheck={test:['CMD','node','/trial/gateway-health.mjs']};return m;};
  validateComposeTarget(valid(),validateTrial(v));
  for(const mutate of [m=>m.volumes.data.external=true,m=>m.volumes.data.name='preparesystem_zhixu_data',m=>m.networks.default.external=true,m=>m.services.app.environment.DB_HOST='old-database',m=>m.services.app.container_name='preparesystem-server-1',m=>m.services.database.ports=[{published:'5432'}],m=>m.services.app.ports=[{published:'3002'}],m=>m.services.gateway.ports[0].host_ip='0.0.0.0',m=>m.services.app.environment.ZHIXU_IDENTITY_MODE='local-single-user',m=>delete m.services.gateway.healthcheck,m=>m.services.gateway.healthcheck.disable=true]){const m=valid();mutate(m);assert.throws(()=>validateComposeTarget(m,validateTrial(v)));}
});
test('explicit config is data, rejects duplicate keys and malformed lines',()=>{
  const dir=mkdtempSync(join(tmpdir(),'zhixu-trial-config-'));try{const p=join(dir,'input.conf');writeFileSync(p,'TRIAL_PORT=18443\n');assert.deepEqual(readTrialConfig(p),{TRIAL_PORT:'18443'});for(const text of ['TRIAL_PORT=18443\nTRIAL_PORT=3001','exec something']){writeFileSync(p,text);assert.throws(()=>readTrialConfig(p));}}finally{rmSync(dir,{recursive:true});}
});

test('staging access is explicit and leaves the loopback TLS probe unchanged',()=>{
  const local=validateTrial(v);assert.equal(local.accessProfile,'local');assert.equal(local.browserOrigin,v.TRIAL_HTTPS_ORIGIN);
  const publicOrigin='https://staging.weaveops.top',staging=validateTrial({...v,TRIAL_ACCESS_PROFILE:'staging',TRIAL_PUBLIC_HTTPS_ORIGIN:publicOrigin});
  assert.equal(staging.origin,v.TRIAL_HTTPS_ORIGIN);assert.equal(staging.browserOrigin,publicOrigin);assert.equal(staging.accessProfile,'staging');
  const m=model();m.services.app.environment.ZHIXU_ALLOWED_ORIGINS=publicOrigin;m.services.gateway.healthcheck={test:['CMD','node','/trial/gateway-health.mjs']};
  validateComposeTarget(m,staging);
  for(const bad of [undefined,'','https://staging.weaveops.top/','http://staging.weaveops.top','https://weaveops.top','https://staging.weaveops.top:443','https://staging.weaveops.top/path','https://staging.weaveops.top?x=1','https://staging.weaveops.top#fragment','https://user:pass@staging.weaveops.top','https://staging.weaveops.top,https://localhost:18443'])assert.throws(()=>validateTrial({...v,TRIAL_ACCESS_PROFILE:'staging',TRIAL_PUBLIC_HTTPS_ORIGIN:bad}),/exact_staging_origin_required/);
  assert.throws(()=>validateTrial({...v,TRIAL_PUBLIC_HTTPS_ORIGIN:publicOrigin}),/public_origin_requires_staging_profile/);
  assert.throws(()=>validateTrial({...v,TRIAL_ACCESS_PROFILE:'production',TRIAL_PUBLIC_HTTPS_ORIGIN:publicOrigin}),/invalid_trial_access_profile/);
  assert.throws(()=>validateTrial({...v,TRIAL_ACCESS_PROFILE:'staging',TRIAL_PUBLIC_HTTPS_ORIGIN:publicOrigin,TRIAL_HTTPS_ORIGIN:publicOrigin}),/local_trial_origin_mismatch/);
});

test('resolved configuration cannot drift the application or gateway probe origin',()=>{
  const publicOrigin='https://staging.weaveops.top',staging=validateTrial({...v,TRIAL_ACCESS_PROFILE:'staging',TRIAL_PUBLIC_HTTPS_ORIGIN:publicOrigin});
  const valid=()=>{const m=model();m.services.app.environment.ZHIXU_ALLOWED_ORIGINS=publicOrigin;m.services.gateway.healthcheck={test:['CMD','node','/trial/gateway-health.mjs']};return m;};
  for(const value of [undefined,v.TRIAL_HTTPS_ORIGIN,publicOrigin+',https://other.invalid','https://other.invalid']){const m=valid();m.services.app.environment.ZHIXU_ALLOWED_ORIGINS=value;assert.throws(()=>validateComposeTarget(m,staging),/application_origin_mismatch/);}
  for(const value of [undefined,publicOrigin,'https://localhost:18444']){const m=valid();m.services.gateway.environment.TRIAL_HTTPS_ORIGIN=value;assert.throws(()=>validateComposeTarget(m,staging),/gateway_probe_origin_mismatch/);}
  const local=model();local.services.gateway.healthcheck={test:['CMD','node','/trial/gateway-health.mjs']};local.services.app.environment.ZHIXU_ALLOWED_ORIGINS=publicOrigin;assert.throws(()=>validateComposeTarget(local,validateTrial(v)),/application_origin_mismatch/);
});

test('actual Compose resolves the two origin profiles and rejects inherited public overrides',()=>{
  const dir=mkdtempSync(join(tmpdir(),'zhixu-origin-compose-')),config=join(dir,'trial.conf');
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('TRIAL_'))delete env[key];
  const resolveModel=(values,extra={})=>{writeFileSync(config,Object.entries(values).map(([k,v])=>k+'='+v).join('\n'));return JSON.parse(execFileSync('docker',['compose','--env-file',config,'-f','ops/quote-trial/compose.yml','-p',values.TRIAL_PROJECT,'config','--format','json'],{encoding:'utf8',timeout:10000,env:{...env,...extra},stdio:['ignore','pipe','pipe']}));};
  try{
    for(const values of [v,{...v,TRIAL_ACCESS_PROFILE:'staging',TRIAL_PUBLIC_HTTPS_ORIGIN:'https://staging.weaveops.top'}]){
      const safe=validateTrial(values),m=resolveModel(values);validateComposeTarget(m,safe);
      assert.equal(m.services.app.environment.ZHIXU_ALLOWED_ORIGINS,safe.browserOrigin);assert.equal(m.services.gateway.environment.TRIAL_HTTPS_ORIGIN,safe.origin);
      assert.equal(m.services.gateway.ports[0].host_ip,'127.0.0.1');assert.equal(m.services.database.ports,undefined);assert.equal(m.services.app.ports,undefined);
    }
    const drifted=resolveModel(v,{TRIAL_PUBLIC_HTTPS_ORIGIN:'https://other.invalid'});assert.throws(()=>validateComposeTarget(drifted,validateTrial(v)),/application_origin_mismatch/);
  }finally{rmSync(dir,{recursive:true});}
});

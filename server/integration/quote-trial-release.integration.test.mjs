// Actual reviewed Dockerfile.server image; only newly named synthetic resources.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer as tlsServer, request as tlsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { createServer as tcpServer } from 'node:net';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { startDisposableMinio } from './minio-container.ts';

const exec=promisify(execFile), root=resolve('.');
const image='zhixu-quote-trial:9ee254db89c6', commit='9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function command(bin,args,input) {
  if(input!==undefined)return new Promise((ok,no)=>{const p=execFile(bin,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:5e6},(e,out)=>e?no(Error('isolated_command_failed')):ok(out.trim()));p.stdin.end(input);});
  try{return (await exec(bin,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:5e6})).stdout.trim();}catch{throw Error('isolated_command_failed');}
}
const docker=(args,input)=>command('docker',args,input);
async function freePort(){const s=tcpServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));assert.ok(![3000,3001,3002].includes(p));return p;}

test('Quote trial: actual production image, TLS/session/S3, persistent recreation and isolated restore', {timeout:540000},async t=>{
  const temp=await mkdtemp(join(tmpdir(),'zhixu-quote-trial-it-')), nonce=randomBytes(5).toString('hex');
  const projects=[`zhixu-quote-trial-it-${nonce}`,`zhixu-quote-trial-restore-${nonce}`];
  const states=[], stores=[], proxies=[];let backup;
  const certPath=join(temp,'cert.pem'),keyPath=join(temp,'key.pem'),bundle=join(temp,'bundle');await mkdir(bundle);
  t.after(async()=>{
    for(const state of states){assert.ok(projects.includes(state.project));await state.compose(['down','--volumes','--remove-orphans']);assert.equal(await docker(['ps','-a','--filter',`label=com.docker.compose.project=${state.project}`,'--format','{{.ID}}']),'');}
    for(const proxy of proxies){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
    for(const store of stores)await store.stop();
    if(backup){assert.ok(backup.startsWith(join(root,'backups'))&&backup.endsWith('.dump'));await rm(backup);await rm(`${backup}.manifest.json`);}
    assert.ok(temp.startsWith(join(tmpdir(),'zhixu-quote-trial-it-')));await rm(temp,{recursive:true});
    t.diagnostic('Cleanup PASS: only owned disposable projects/volumes/MinIO/temp files; no residual containers');
  });
  const openssl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl';
  await command(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,DNS:host.docker.internal']);
  const cert=await readFile(certPath),key=await readFile(keyPath);
  async function newState(project,originalBucket){
    const store=await startDisposableMinio();stores.push(store);
    if(originalBucket){const s3=new S3Client({endpoint:store.endpoint,region:store.region,forcePathStyle:true,credentials:store,maxAttempts:1});await s3.send(new CreateBucketCommand({Bucket:originalBucket}));s3.destroy();}
    const target=new URL(store.endpoint);
    const proxy=tlsServer({cert,key},(req,res)=>{
      const upstream=httpRequest({hostname:target.hostname,port:target.port,path:req.url,method:req.method,headers:req.headers},remote=>{res.writeHead(remote.statusCode,remote.headers);remote.pipe(res);res.once('close',()=>remote.destroy());});
      upstream.on('error',()=>res.destroy());res.once('close',()=>upstream.destroy());req.pipe(upstream);
    });await new Promise(r=>proxy.listen(0,'127.0.0.1',r));proxies.push(proxy);
    const port=await freePort(),origin=`https://localhost:${port}`,config=join(temp,`${project}.conf`),override=join(temp,`${project}.yml`);
    const slash=p=>p.replaceAll('\\','/');
    const values={TRIAL_PROJECT:project,TRIAL_PORT:String(port),TRIAL_IMAGE:image,TRIAL_COMMIT:commit,TRIAL_BUILD_ID:'quote-trial-20261009',TRIAL_BUILD_TIME:'2026-10-09T03:00:00Z',TRIAL_HTTPS_ORIGIN:origin,TRIAL_DB_PASSWORD:randomBytes(24).toString('hex'),TRIAL_ADMIN_USERNAME:'trial-admin',TRIAL_ADMIN_PASSWORD:'synthetic-trial-password-only',TRIAL_S3_ENDPOINT:`https://host.docker.internal:${proxy.address().port}`,TRIAL_S3_REGION:store.region,TRIAL_S3_BUCKET:originalBucket||store.bucket,TRIAL_S3_PATH_STYLE:'true',TRIAL_SECRET_ID_FILE:slash(join(temp,`${project}-id`)),TRIAL_SECRET_KEY_FILE:slash(join(temp,`${project}-key`)),TRIAL_TLS_CERT_FILE:slash(certPath),TRIAL_TLS_KEY_FILE:slash(keyPath)};
    await writeFile(values.TRIAL_SECRET_ID_FILE,store.accessKeyId,{mode:0o600});await writeFile(values.TRIAL_SECRET_KEY_FILE,store.secretAccessKey,{mode:0o600});
    values.TRIAL_COMPOSE_OVERRIDE=slash(override);values.TRIAL_OBJECT_BUNDLE_DIR=slash(bundle);
    await writeFile(config,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
    await writeFile(override,`services:\n  app:\n    environment:\n      NODE_EXTRA_CA_CERTS: /testtls/cert.pem\n    volumes: !override\n      - secrets:/run/secrets:ro\n      - "${slash(temp)}:/testtls:ro"\n      - "${slash(bundle)}:/bundle"\n      - "${slash(resolve('ops/quote-trial/object-bundle.mjs'))}:/trial/object-bundle.mjs:ro"\nvolumes:\n  secrets:\n`);
    const prefix=['compose','--env-file',config,'-f',resolve('ops/quote-trial/compose.yml'),'-f',override,'-p',project];
    const state={project,port,origin,config,values,db:`${project}-database-1`,app:`${project}-app-1`,compose:args=>docker([...prefix,...args])};states.push(state);
    await docker(['volume','create','--label',`com.docker.compose.project=${project}`,`${project}_secrets`]);
    await docker(['run','--rm','--user','0:0','--volume',`${project}_secrets:/secrets`,'--volume',`${slash(temp)}:/seed:ro`,image,'sh','-c',`cp /seed/${project}-id /secrets/cos-id && cp /seed/${project}-key /secrets/cos-key && chown 1000:1000 /secrets/cos-* && chmod 600 /secrets/cos-*`]);
    state.sql=q=>docker(['exec','-i',state.db,'psql','-X','-q','-U','quote_trial','-d','quote_trial','-At','-v','ON_ERROR_STOP=1'],q);
    state.request=(path,{method='GET',body,cookie,originHeader=true,headers={}}={})=>new Promise((ok,no)=>{
      const data=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
      const req=tlsRequest(`${origin}${path}`,{ca:cert,method,headers:{...(originHeader?{Origin:origin}:{}),'X-Zhixu-Request':'1',...(data?{'Content-Type':'application/json','Content-Length':data.length}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{const bytes=Buffer.concat(chunks);ok({status:res.statusCode,headers:res.headers,bytes,json:()=>JSON.parse(bytes.toString())});});});req.setTimeout(10000,()=>req.destroy());req.on('error',()=>no(Error('isolated_https_failed')));req.end(data);
    });
    state.login=async(username='trial-admin',password=values.TRIAL_ADMIN_PASSWORD)=>{const r=await state.request('/api/v1/auth/login',{method:'POST',body:{username,password}});assert.equal(r.status,200);assert.match(r.headers['set-cookie'][0],/Secure/);assert.match(r.headers['set-cookie'][0],/HttpOnly/);return r.headers['set-cookie'][0].split(';')[0];};
    state.ready=async()=>{const until=Date.now()+90000;while(Date.now()<until){try{if((await state.request('/api/v1/health')).status===200)return;}catch{}await sleep(500);}throw Error('candidate_not_healthy');};
    return state;
  }
  const a=await newState(projects[0]);let cookie,record,path,attachmentId;const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const read=async state=>{const r=await state.request(`/api/v1/quotes/${record.quote.id}`,{cookie});assert.equal(r.status,200);return r.json().quote;};
  const post=async(suffix,body,status=200)=>{const r=await a.request(`/api/v1/quotes/${record.quote.id}${suffix}`,{method:'POST',body,cookie});assert.equal(r.status,status,`POST ${suffix}: ${r.bytes.toString().slice(0,300)}`);record=r.json().quote;return r;};
  await t.test('reviewed full SHA labels, compiled identity; pending schema fails normal startup',async()=>{
    const labels=JSON.parse(await docker(['image','inspect','--format','{{json .Config.Labels}}',image]));assert.equal(labels['org.opencontainers.image.revision'],commit);assert.equal(labels['io.zhixu.identity-mode'],'session');
    const info=JSON.parse(await docker(['run','--rm',image,'node','-e',"console.log(require('fs').readFileSync('dist/client/build-info.json','utf8'))"]));assert.equal(info.gitCommit,commit);assert.equal(info.quoteAuthority,'server');assert.equal(info.masterSettingsAuthority,'server');assert.equal(info.quoteWriterMode,'writable');assert.equal(info.identityMode,'session');
    await a.compose(['up','-d','--wait','database']);await a.compose(['up','-d','app']);await sleep(2500);
    assert.equal(await docker(['inspect','--format','{{.State.Running}}',a.app]),'false');assert.equal(await a.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';"),'0');
    await assert.rejects(a.compose(['run','--rm','--no-deps','app','node','dist/server/server/index.js']));
  });
  await t.test('explicit runner 0001–0008; technical whitelist only; secure file permissions and private DB',async()=>{
    assert.match(await command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'check',a.config]),/CHECK_ONLY/);
    await assert.rejects(command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'init',a.config]));
    assert.match(await command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'init',a.config,`--execute=${a.project}`]),/PASS/);
    await assert.rejects(command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'init',a.config,`--execute=${a.project}`]));
    await a.compose(['up','-d','app','gateway']);await a.ready();
    assert.equal(await a.sql('SELECT count(*) FROM schema_migrations;'),'8');
    const tables=(await a.sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")).split('\n');const whitelist=['schema_migrations','app_users','app_roles','app_permissions','app_user_roles','app_role_permissions'];
    for(const table of tables){assert.match(table,/^[a-z_]+$/);const n=Number(await a.sql(`SELECT count(*) FROM ${table};`));if(!whitelist.includes(table))assert.equal(n,0,table);}
    assert.equal(await docker(['exec',a.app,'id','-u']),'1000');assert.equal(await docker(['exec',a.app,'id','-g']),'1000');assert.equal(await docker(['exec',a.app,'stat','-c','%u:%g:%a','/run/secrets/cos-id']),'1000:1000:600');
    const mounts=JSON.parse(await docker(['inspect','--format','{{json .Mounts}}',a.app]));assert.equal(mounts.find(m=>m.Destination==='/run/secrets').RW,false);
    assert.equal(await docker(['port',a.db]),'');t.diagnostic(`${tables.length-whitelist.length} business/non-bootstrap tables = 0; explicit six-table technical whitelist only`);
    cookie=await a.login();
  });
  await t.test('production TLS/session, Origin, 401/logout/expired and trusted restricted account',async()=>{
    assert.equal((await a.request('/api/v1/quotes')).status,401);
    assert.equal((await a.request('/api/v1/quotes',{method:'POST',body:{},cookie,originHeader:false})).status,403);
    await a.sql(`INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES('trial-viewer',crypt('synthetic-viewer-only',gen_salt('bf',12)),'Synthetic viewer','viewer',true); INSERT INTO app_roles(id,name) VALUES('trial-viewer-role','Trial viewer'); INSERT INTO app_role_permissions(role_id,permission_key) VALUES('trial-viewer-role','quote.view'); INSERT INTO app_user_roles(user_id,role_id) SELECT id,'trial-viewer-role' FROM app_users WHERE username='trial-viewer';`);
    const viewer=await a.login('trial-viewer','synthetic-viewer-only');assert.equal((await a.request('/api/v1/quotes',{cookie:viewer})).status,200);assert.equal((await a.request('/api/v1/quotes',{cookie:viewer,method:'POST',body:{}})).status,403);
    assert.equal((await a.request('/api/v1/auth/logout',{cookie:viewer,method:'POST',body:{}})).status,200);assert.equal((await a.request('/api/v1/quotes',{cookie:viewer})).status,401);
    const expired=await a.login('trial-viewer','synthetic-viewer-only');await a.sql("UPDATE app_sessions SET expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM app_users WHERE username='trial-viewer');");assert.equal((await a.request('/api/v1/quotes',{cookie:expired})).status,401);
  });
  await t.test('explicit masters/Quote/PV/Revision/Estimate writes; no seed or Browser source',async()=>{
    const brand=(await a.request('/api/v1/quote-masters/brands',{cookie,method:'POST',body:{name:'Synthetic trial brand'}})).json().brand;
    const person=(await a.request('/api/v1/quote-masters/customer-salespeople',{cookie,method:'POST',body:{name:'Synthetic salesperson',brandId:brand.id}})).json().customerSalesperson;
    const created=await a.request('/api/v1/quotes',{cookie,method:'POST',body:{}});assert.equal(created.status,201);record=created.json().quote;
    const r=record.quote.revisions[0],pv=r.priceVersions[0];Object.assign(r.baseInfo,{brandId:brand.id,brandName:brand.name,salespersonId:person.id,salespersonName:person.name,quoteStyleNo:'SYN-TRIAL-001',styleName:'Synthetic trial garment'});pv.quantity='100';pv.labor.value='8';pv.pricingParameters.usdCnyRate='7.2';pv.pricingParameters.markupRate='0';
    const saved=await a.request(`/api/v1/quotes/${record.quote.id}`,{cookie,method:'PUT',body:{quote:record.quote,expectedVersion:record.version}});assert.equal(saved.status,200);record=saved.json().quote;
    await post('/version-workflows',{action:'price.create',expectedVersion:record.version,revisionId:r.revisionId,priceVersionId:pv.id,name:'Second pricing',quantity:'200',description:'Synthetic alternate'});
    await post('/version-workflows',{action:'revision.create',expectedVersion:record.version,sourceRevisionId:r.revisionId,reason:'其他',note:'Synthetic revision'});
    await post('/estimate-workflows',{action:'estimate.generate',expectedVersion:record.version,sourceRevisionId:record.quote.defaultRevisionId});
    await post('/estimate-workflows',{action:'estimate.regenerate',expectedVersion:record.version,sourceRevisionId:record.quote.defaultRevisionId});assert.equal(record.quote.revisions.length,2);assert.equal(record.quote.estimateCostHistory.length,1);
    const viewer=await a.login('trial-viewer','synthetic-viewer-only');
    const restricted=await a.request(`/api/v1/quotes/${record.quote.id}`,{cookie:viewer});assert.equal(restricted.status,200);assert.equal(restricted.json().quote.estimateVisibility,'restricted');assert.equal(Object.hasOwn(restricted.json().quote.quote,'activeEstimateCost'),false);assert.equal(Object.hasOwn(restricted.json().quote.quote,'estimateCostHistory'),false);
    assert.equal((await a.request(`/api/v1/quotes/${record.quote.id}/estimate-workflows`,{cookie:viewer,method:'POST',body:{action:'estimate.ignore',expectedVersion:record.version,estimateId:record.quote.activeEstimateCost.id}})).status,403);
    assert.equal(await a.sql('SELECT count(*) FROM sales_orders;'),'0');assert.equal(await a.sql('SELECT count(*) FROM quote_center_quotes;'),'1');
  });
  await t.test('actual production S3 upload/download, confirmation, XLSX/summary/logs and pages',async()=>{
    const r=record.quote.revisions.find(x=>x.revisionId===record.quote.defaultRevisionId);path=`/api/v1/quotes/${record.quote.id}/revisions/${r.revisionId}/attachments`;
    const upload=await a.request(`${path}?name=synthetic.png&kind=image`,{cookie,method:'POST',body:png,headers:{'Content-Type':'image/png','X-Quote-Version':String(record.version),'Idempotency-Key':randomUUID()}});assert.equal(upload.status,201,upload.bytes.toString());attachmentId=upload.json().attachment.id;record=await read(a);
    const downloaded=await a.request(`${path}/${attachmentId}/download`,{cookie});assert.equal(downloaded.status,200);assert.deepEqual(downloaded.bytes,png);assert.equal(sha(downloaded.bytes),sha(png));
    await post('/confirmation-workflows',{action:'confirmation.save',expectedVersion:record.version,revisionId:r.revisionId,priceVersionId:r.priceVersions[0].id,confirmedLaborPrice:'3',confirmedGarmentPrice:'12',note:'Synthetic confirmation'});
    for(const [suffix,body] of [[`/api/v1/quotes/${record.quote.id}/customer-export`,{expectedVersion:record.version,revisionId:r.revisionId,priceVersionIds:r.priceVersions.map(p=>p.id)}],['/api/v1/quotes/internal-summary',{items:[{quoteId:record.quote.id,expectedVersion:record.version}],columns:['quote','quantity','labor'],rowMode:'price-version',estimateColumns:[]}]]){
      const file=await a.request(suffix,{cookie,method:'POST',body});assert.equal(file.status,200,file.bytes.toString().slice(0,200));const wb=new ExcelJS.Workbook();await wb.xlsx.load(file.bytes);assert.ok(wb.worksheets[0].rowCount>=3);t.diagnostic(`Actual image XLSX ${suffix.endsWith('internal-summary')?'internal':'customer'}: ${file.bytes.length} bytes SHA256 ${sha(file.bytes)}`);
    }
    assert.equal((await a.request('/api/v1/operation-logs',{cookie})).status,200);
    const batch=await a.request('/api/v1/quotes/customer-batch-export',{cookie,method:'POST',body:{items:[{quoteId:record.quote.id,expectedVersion:record.version}]}});assert.equal(batch.status,200);const zip=await JSZip.loadAsync(batch.bytes);assert.equal(Object.keys(zip.files).filter(n=>n.endsWith('.xlsx')).length,1);assert.equal(JSON.parse(await zip.file('export-results.json').async('string')).success,1);
    for(const page of ['/quote-center','/quote-center/new',`/quote-center/detail?id=${record.quote.id}`,'/basic-settings/brands'])assert.equal((await a.request(page,{cookie})).status,200,page);
  });
  let baseline,passwordHash;
  await t.test('restart and force recreation preserve Quote/history/Estimate/object/admin, runtime identity',async()=>{
    baseline=await read(a);passwordHash=await a.sql("SELECT password_hash FROM app_users WHERE username='trial-admin';");
    for(const action of [['restart','app','gateway'],['up','-d','--force-recreate','app','gateway']]){await a.compose(action);await a.ready();cookie=await a.login();assert.deepEqual(await read(a),baseline);assert.deepEqual((await a.request(`${path}/${attachmentId}/download`,{cookie})).bytes,png);assert.equal(await a.sql("SELECT password_hash FROM app_users WHERE username='trial-admin';"),passwordHash);}
    const info=(await a.request('/build-info.json')).json();assert.equal(info.gitCommit,commit);assert.equal(info.identityMode,'session');
    assert.match(await command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'status',a.config]),/running/);
    assert.match(await command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'target',a.config]),/fingerprint/);
    await assert.rejects(command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'objects-export',a.config,`--execute=${a.project}`]));
    await assert.rejects(a.compose(['run','--rm','--no-deps','-e','ZHIXU_COOKIE_SECURE=false','app','node','dist/server/server/index.js']));
  });
  let backupHash,b;
  const ps=process.platform==='win32'?'C:/Program Files/PowerShell/7/pwsh.exe':'pwsh';
  const target=s=>{const fingerprint=sha(`${s.project}|${s.db}|${s.project}_data|quote_trial|local_socket|5432`);return ['-ExpectedContainerName',s.db,'-ExpectedComposeProject',s.project,'-ExpectedVolumeName',`${s.project}_data`,'-ExpectedDatabaseName','quote_trial','-ExpectedTargetFingerprint',fingerprint];};
  await t.test('maintenance backup: existing exact-target dump plus DB-referenced S3 manifest/bytes',async()=>{
    await command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'maintenance',a.config,`--execute=${a.project}`]);const out=await command(ps,['-NoProfile','-File',resolve('Backup-Zhixu.ps1'),...target(a)]);const name=/filename=(zhixu-[a-zA-Z0-9-]+\.dump)/.exec(out)?.[1];assert.ok(name);backup=join(root,'backups',name);backupHash=sha(await readFile(backup));assert.equal(JSON.parse(await readFile(`${backup}.manifest.json`,'utf8')).sha256,backupHash);
    const obj=await command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'objects-export',a.config,`--execute=${a.project}`]);assert.match(obj,/"integrity":"PASS"/);const manifest=JSON.parse(await readFile(join(bundle,'objects.json'),'utf8'));assert.equal(manifest.objects.length,1);assert.equal(manifest.objects[0].sha256,sha(png));
    t.diagnostic(`Synthetic rollback backup: ${name}, SHA256 ${backupHash}; object bytes/hash manifest PASS`);
  });
  await t.test('independent empty DB + distinct object endpoint restore; tamper rejection before PUT',async()=>{
    b=await newState(projects[1],a.values.TRIAL_S3_BUCKET);await b.compose(['up','-d','--wait','database']);assert.equal(await b.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';"),'0');
    assert.match(await command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'restore-check',b.config]),/EMPTY_NO_CLIENTS/);
    const fingerprint=target(b).at(-1);await command(ps,['-NoProfile','-File',resolve('Restore-Zhixu.ps1'),'-BackupFile',backup,...target(b),'-ExpectedBackupSha256',backupHash,'-ConfirmDataLoss','-ConfirmTargetFingerprint',fingerprint]);
    const objectFile=join(bundle,'objects',`${attachmentId}.bin`);await writeFile(objectFile,Buffer.from('tampered'));await assert.rejects(b.compose(['run','--rm','--no-deps','app','node','/trial/object-bundle.mjs','restore','--execute']));await writeFile(objectFile,png);
    assert.match(await command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'objects-restore',b.config,`--execute=${b.project}`]),/"integrity":"PASS"/);
    await b.compose(['up','-d','app','gateway']);await b.ready();cookie=await b.login();assert.deepEqual(await read(b),baseline);assert.deepEqual((await b.request(`${path}/${attachmentId}/download`,{cookie})).bytes,png);assert.equal(await b.sql("SELECT password_hash FROM app_users WHERE username='trial-admin';"),passwordHash);assert.equal((await b.request(`/quote-center/detail?id=${record.quote.id}`,{cookie})).status,200);assert.equal(await b.sql('SELECT count(*) FROM schema_migrations;'),'8');
    await assert.rejects(command(process.execPath,[resolve('ops/quote-trial/trial.mjs'),'restore-check',b.config]));
  });
});

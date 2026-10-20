// Consumes an explicitly built exact-SHA image. Only unique synthetic projects.
// This never points at the persistent user target or an existing database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, readdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { request } from 'node:https';
import { readTrialConfig } from '../../ops/quote-trial/trial.mjs';
const execute=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
async function run(bin,args,input){
  if(input!==undefined)return new Promise((yes,no)=>{const p=execFile(bin,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8e6},(e,out)=>e?no(Error('owned_command_failed')):yes(out.trim()));p.stdin.end(input);});
  try{return (await execute(bin,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8e6})).stdout.trim();}catch{throw Error('owned_command_failed');}
}
const docker=(args,input)=>run('docker',args,input);
const trial=(state,action)=>run(process.execPath,[resolve('ops/quote-trial/trial.mjs'),action,state.config,`--execute=${state.project}`]);
async function port(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const result=server.address().port;await new Promise(r=>server.close(r));assert.ok(![3000,3001,3002,50426,59069,62326,18443,18444].includes(result));return result;}

test('persistent local trial: owned volumes, signed TLS S3, restart and independent recovery',{
  skip:process.platform!=='win32'||!process.env.ZHIXU_LOCAL_TRIAL_IMAGE,
  timeout:600000,
},async t=>{
  const image=process.env.ZHIXU_LOCAL_TRIAL_IMAGE,commit=process.env.ZHIXU_LOCAL_TRIAL_COMMIT;
  assert.match(commit||'',/^[0-9a-f]{40}$/);
  const labels=JSON.parse(await docker(['image','inspect','--format','{{json .Config.Labels}}',image]));
  assert.equal(labels['org.opencontainers.image.revision'],commit);
  const parent=await mkdtemp(join(tmpdir(),'zhixu-persistent-it-')),nonce=randomBytes(5).toString('hex'),states=[];
  const owned=[`zhixu-quote-trial-it-${nonce}`,`zhixu-quote-trial-recovery-${nonce}`];
  const expectedMigrations=(await readdir(resolve('database/migrations'))).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();
  let completed=false,backup,backupHash;
  // A failed Node subtest does not reject t.test(). Stop dependent phases and
  // retain their private fixtures unless every phase actually completed.
  async function phase(name,work){
    let passed=false;
    await t.test(name,async()=>{await work();passed=true;});
    if(!passed)throw Error(`owned_phase_failed: ${name}`);
  }
  t.after(async()=>{
    for(const s of states){assert.ok(owned.includes(s.project));await s.compose(completed?['down','--volumes']:['stop']);}
    if(completed){
      if(backup){assert.ok(backup.startsWith(resolve('backups')+sep)&&backup.endsWith('.dump'));await rm(backup);await rm(`${backup}.manifest.json`);}
      assert.ok(resolve(parent).startsWith(resolve(tmpdir())+sep));await rm(parent,{recursive:true});
    }else t.diagnostic('Failure retains owned synthetic volumes/private fixtures for investigation; no unrelated cleanup.');
  });
  async function state(project){
    const folder=join(parent,project),p=await port();
    await run('pwsh',['-NoProfile','-File',resolve('ops/quote-trial/new-local-target.ps1'),'-Root',folder,'-Project',project,'-Port',String(p),'-Image',image,'-Commit',commit,'-BuildId',labels['io.zhixu.build-id'],'-BuildTime',labels['org.opencontainers.image.created'],'-Execute']);
    const config=join(folder,'trial.conf'),values=readTrialConfig(config);
    const prefix=['compose','--env-file',config,'-f',resolve('ops/quote-trial/compose.yml'),'-f',resolve('ops/quote-trial/local-objects.compose.yml'),'-f',resolve('ops/quote-trial/objects.compose.yml'),'-p',project];
    const s={project,folder,config,values,db:`${project}-database-1`,app:`${project}-app-1`,compose:args=>docker([...prefix,...args])};states.push(s);
    s.sql=q=>docker(['exec','-i',s.db,'psql','-X','-q','-U','quote_trial','-d','quote_trial','-At','-v','ON_ERROR_STOP=1'],q);
    const ca=await readFile(values.TRIAL_TLS_CA_FILE);
    s.request=(path,{method='GET',body,cookie,headers={}}={})=>new Promise((yes,no)=>{
      const bytes=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
      const req=request(`${values.TRIAL_HTTPS_ORIGIN}${path}`,{ca,method,headers:{Origin:values.TRIAL_HTTPS_ORIGIN,'X-Zhixu-Request':'1',...(bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{
        const chunks=[];res.on('data',b=>chunks.push(b));res.on('error',()=>no(Error('owned_https_failed')));res.on('end',()=>{const data=Buffer.concat(chunks);yes({status:res.statusCode,headers:res.headers,bytes:data,json:()=>JSON.parse(data.toString())});});
      });req.setTimeout(10000,()=>req.destroy());req.on('error',()=>no(Error('owned_https_failed')));req.end(bytes);
    });
    s.login=async password=>{const r=await s.request('/api/v1/auth/login',{method:'POST',body:{username:'local.admin',password:password||values.TRIAL_ADMIN_PASSWORD}});assert.equal(r.status,200);assert.match(r.headers['set-cookie'][0],/Secure/);return r.headers['set-cookie'][0].split(';')[0];};
    return s;
  }
  const a=await state(owned[0]);let cookie,quoteId,record,attachmentId,attachmentPath,snapshot,adminHash;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const read=async(s,session)=>{const r=await s.request(`/api/v1/quotes/${quoteId}`,{cookie:session});assert.equal(r.status,200);return r.json().quote;};
  await phase('one-time private preparation and explicit empty-schema init; no automatic migration',async()=>{
    assert.match(await trial(a,'check'),/CHECK_ONLY/);
    assert.match(await trial(a,'prepare-local'),/LOCAL_SECRETS_PREPARED/);
    await assert.rejects(trial(a,'prepare-local'));
    await a.compose(['up','-d','--wait','database']);
    assert.equal(await a.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"),'0');
    await assert.rejects(a.compose(['run','--rm','--no-deps','app','node','dist/server/server/index.js']));
    assert.equal(await a.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"),'0');
    assert.match(await trial(a,'init'),/PASS/);await assert.rejects(trial(a,'init'));
    assert.match(await trial(a,'objects-init'),/READY/);
    assert.match(await trial(a,'start'),/"result":"READY"/);
    assert.equal(Number(await a.sql('SELECT count(*) FROM schema_migrations')),expectedMigrations.length);
    const tables=(await a.sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).split('\n');
    const technical=new Set(['schema_migrations','app_permissions','app_roles','app_users','app_user_roles','app_role_permissions','sales_order_normalization_target','sales_order_attribution_write_epoch','sales_order_command_control','sales_order_command_control_events']);
    for(const table of tables){assert.match(table,/^[a-z_]+$/);if(!technical.has(table))assert.equal(await a.sql(`SELECT count(*) FROM ${table}`),'0',table);}
    assert.equal(await a.sql('SELECT count(*) FROM app_users'),'1');
    assert.equal(await docker(['exec',a.app,'stat','-c','%u:%g:%a','/run/secrets/cos-id']),'1000:1000:600');
    assert.equal(await docker(['exec',`${a.project}-objects-1`,'stat','-c','%u:%g:%a','/bitnami/minio/data']),'1001:1001:700');
    const objectMounts=JSON.parse(await docker(['inspect','--format','{{json .Mounts}}',`${a.project}-objects-1`]));
    assert.deepEqual(objectMounts.filter(m=>m.Type==='volume').map(m=>m.Name).sort(),[`${a.project}_objects`,`${a.project}_objectsecrets`].sort());
    const certMounts=JSON.parse(await docker(['inspect','--format','{{json .HostConfig.Tmpfs}}',`${a.project}-objects-1`]));
    assert.equal(certMounts['/certs'],'ro,size=64k,mode=0555,noexec,nosuid');
    for(const service of ['database','app','objects','objects-tls'])assert.equal(await docker(['port',`${a.project}-${service}-1`]),'');
    cookie=await a.login();
  });
  await phase('DB health cannot mask missing bucket, wrong credentials or untrusted object TLS',async()=>{
    assert.equal((await a.request('/api/v1/health')).status,200);
    const bundle=a.values.TRIAL_OBJECT_BUNDLE_DIR;await writeFile(join(bundle,'wrong-id'),'synthetic-wrong-key');
    const wrongCa=join(bundle,'wrong-ca.pem'),wrongKey=join(bundle,'wrong-key.pem');
    await run('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',wrongKey,'-out',wrongCa,'-days','1','-subj','/CN=wrong.invalid']);
    for(const entry of ['ZHIXU_ATTACHMENT_S3_BUCKET=missing-synthetic','ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID_FILE=/bundle/wrong-id'])await assert.rejects(a.compose(['exec','-T','-e',entry,'app','node','/trial/local-object-control.mjs','check']));
    // Preserve the allowed path and change only the owned fixture CA bytes. This
    // reaches TLS validation rather than failing the path-policy precondition.
    const originalCa=await readFile(a.values.TRIAL_TLS_CA_FILE);
    try{await writeFile(a.values.TRIAL_TLS_CA_FILE,await readFile(wrongCa));await assert.rejects(a.compose(['exec','-T','app','node','/trial/local-object-control.mjs','check']));}
    finally{await writeFile(a.values.TRIAL_TLS_CA_FILE,originalCa);}
    assert.match(await a.compose(['exec','-T','app','node','/trial/local-object-control.mjs','check']),/READY/);
  });
  await phase('formal Quote/attachment API writes only synthetic records and downloads exact S3 bytes',async()=>{
    assert.equal((await a.request('/api/v1/quotes')).status,401);
    const requestId=randomUUID();const made=await a.request('/api/v1/quotes/creation-defaults',{method:'POST',cookie,body:{clientRequestId:requestId}});assert.equal(made.status,201);
    quoteId=made.json().result.quoteId;record=await read(a,cookie);
    assert.equal((await a.request('/api/v1/quotes/creation-defaults',{method:'POST',cookie,body:{clientRequestId:requestId}})).json().result.quoteId,quoteId);
    attachmentPath=`/api/v1/quotes/${quoteId}/revisions/${record.quote.revisions[0].revisionId}/attachments`;
    const upload=await a.request(`${attachmentPath}?name=persistent-synthetic.png&kind=image`,{method:'POST',cookie,body:png,headers:{'Content-Type':'image/png','X-Quote-Version':String(record.version),'Idempotency-Key':randomUUID()}});assert.equal(upload.status,201);attachmentId=upload.json().attachment.id;
    const download=await a.request(`${attachmentPath}/${attachmentId}/download`,{cookie});assert.equal(download.status,200);assert.deepEqual(download.bytes,png);
    snapshot=await read(a,cookie);adminHash=await a.sql("SELECT password_hash FROM app_users WHERE username='local.admin'");
    assert.equal(await a.sql('SELECT count(*) FROM sales_orders'),'0');
    await assert.rejects(trial(a,'objects-export'));
  });
  await phase('restart and cold container recreation preserve DB identity, adopted rows and attachment bytes',async()=>{
    const before=await a.sql('SELECT string_agg(version::text,\',\' ORDER BY version) FROM schema_migrations');
    assert.match(await trial(a,'restart'),/READY/);
    // Only this newly-created test project is recreated; named volumes remain.
    await a.compose(['stop']);await a.compose(['up','-d','--force-recreate','objects','objects-tls','database','app','gateway']);
    assert.match(await trial(a,'start'),/READY/);cookie=await a.login();
    assert.deepEqual(await read(a,cookie),snapshot);
    assert.deepEqual((await a.request(`${attachmentPath}/${attachmentId}/download`,{cookie})).bytes,png);
    assert.ok((await a.sql("SELECT password_hash FROM app_users WHERE username='local.admin'"))===adminHash,'admin credential must not be overwritten');
    assert.equal(await a.sql('SELECT string_agg(version::text,\',\' ORDER BY version) FROM schema_migrations'),before);
  });
  const target=s=>['-ExpectedContainerName',s.db,'-ExpectedComposeProject',s.project,'-ExpectedVolumeName',`${s.project}_data`,'-ExpectedDatabaseName','quote_trial','-ExpectedTargetFingerprint',sha(`${s.project}|${s.db}|${s.project}_data|quote_trial|local_socket|5432`)];
  await phase('offline DB and object bundle backup use the existing exact-target tools',async()=>{
    await trial(a,'maintenance');const out=await run('pwsh',['-NoProfile','-File',resolve('Backup-Zhixu.ps1'),...target(a)]);
    const name=/filename=(zhixu-[a-zA-Z0-9-]+\.dump)/.exec(out)?.[1];assert.ok(name);backup=resolve('backups',name);backupHash=sha(await readFile(backup));
    assert.match(await trial(a,'objects-export'),/"integrity":"PASS"/);
    const manifest=JSON.parse(await readFile(join(a.values.TRIAL_OBJECT_BUNDLE_DIR,'objects.json'),'utf8'));assert.equal(manifest.objects.length,1);assert.equal(manifest.objects[0].sha256,sha(png));
  });
  await phase('independent restore rejects writers/tampering, preserves original IDs and verifies all bytes',async()=>{
    const b=await state(owned[1]);await trial(b,'prepare-local');await b.compose(['up','-d','--wait','database']);
    assert.match(await trial(b,'restore-check'),/EMPTY_NO_CLIENTS/);
    await trial(b,'objects-init');
    const args=['-NoProfile','-File',resolve('Restore-Zhixu.ps1'),'-BackupFile',backup,...target(b),'-ExpectedBackupSha256',backupHash,'-ConfirmDataLoss','-ConfirmTargetFingerprint',target(b).at(-1)];
    // Shared DB writer guard is unchanged: even local object containers must stop.
    await assert.rejects(run('pwsh',args));assert.equal(await b.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'"),'0');
    await b.compose(['stop','objects-tls','objects']);
    await run('pwsh',args);await trial(b,'objects-init');
    const from=a.values.TRIAL_OBJECT_BUNDLE_DIR,to=b.values.TRIAL_OBJECT_BUNDLE_DIR;
    await cp(join(from,'objects.json'),join(to,'objects.json'));await cp(join(from,'objects'),join(to,'objects'),{recursive:true});
    const file=join(to,'objects',`${attachmentId}.bin`);await writeFile(file,'tampered');await assert.rejects(trial(b,'objects-restore'));
    await writeFile(file,png);assert.match(await trial(b,'objects-restore'),/"integrity":"PASS"/);assert.match(await trial(b,'objects-restore'),/"integrity":"PASS"/);
    const putSynthetic=async bytes=>b.compose(['run','--rm','--no-deps','app','node','--input-type=module','-e',
      `import {loadServerConfig} from './dist/server/server/config.js';import {S3AttachmentStorage} from './dist/server/server/attachments/s3-storage.js';const s=new S3AttachmentStorage(loadServerConfig().attachmentStorage);try{await s.put('attachments/${attachmentId}/original',Buffer.from('${bytes.toString('base64')}','base64'),'image/png');}finally{s.destroy();}`]);
    await putSynthetic(Buffer.from('synthetic-collision'));await assert.rejects(trial(b,'objects-restore'));
    // Explicitly repair this test's injected object; the restore tool never overwrites it.
    await putSynthetic(png);assert.match(await trial(b,'objects-restore'),/"integrity":"PASS"/);
    assert.match(await trial(b,'start'),/READY/);const restoredCookie=await b.login(a.values.TRIAL_ADMIN_PASSWORD);
    assert.deepEqual(await read(b,restoredCookie),snapshot);assert.deepEqual((await b.request(`${attachmentPath}/${attachmentId}/download`,{cookie:restoredCookie})).bytes,png);
    assert.ok((await b.sql("SELECT password_hash FROM app_users WHERE username='local.admin'"))===adminHash,'restored administrator stays unchanged');
    assert.equal(Number(await b.sql('SELECT count(*) FROM schema_migrations')),expectedMigrations.length);
    await assert.rejects(trial(b,'restore-check'));
  });
  completed=true;t.diagnostic(`Exact image ${commit}; ${expectedMigrations.length} migrations; source and restore use distinct persistent object/data/secret volumes; no existing environment touched.`);
});

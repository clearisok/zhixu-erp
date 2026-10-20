import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { probeJson, verifyRuntime, waitReady, safeFailure } from './readiness.mjs';
import { LOCAL_OBJECT_IMAGE, LOCAL_VOLUMES, trialServices, validateLocalObjectConfig, validateLocalObjectModel, verifyLocalObjectMounts, verifyLocalVolumeOwnership, assertLocalMaintenance, assertLocalInitialization } from './local-objects.mjs';
export function validateTrial(values) {
  if(!/^zhixu-quote-trial-[a-z0-9-]{3,40}$/.test(values.TRIAL_PROJECT||''))throw Error('invalid_trial_project');
  const port=Number(values.TRIAL_PORT);if(!Number.isInteger(port)||port<1024||port>65535||[3000,3001,3002].includes(port))throw Error('invalid_trial_port');
  if(!/^[0-9a-f]{40}$/.test(values.TRIAL_COMMIT||''))throw Error('full_reviewed_commit_required');
  const origin=new URL(values.TRIAL_HTTPS_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==values.TRIAL_HTTPS_ORIGIN)throw Error('https_origin_required');
  if(origin.port!==String(port)||!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw Error('local_trial_origin_mismatch');
  const endpoint=new URL(values.TRIAL_S3_ENDPOINT);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw Error('https_storage_required');
  for(const key of ['TRIAL_IMAGE','TRIAL_BUILD_ID','TRIAL_BUILD_TIME','TRIAL_DB_PASSWORD','TRIAL_ADMIN_PASSWORD','TRIAL_S3_REGION','TRIAL_S3_BUCKET','TRIAL_SECRET_ID_FILE','TRIAL_SECRET_KEY_FILE','TRIAL_TLS_CERT_FILE','TRIAL_TLS_KEY_FILE'])if(!values[key])throw Error('missing_'+key);
  for(const key of ['TRIAL_SECRET_ID_FILE','TRIAL_SECRET_KEY_FILE','TRIAL_TLS_CERT_FILE','TRIAL_TLS_KEY_FILE'])if(!isAbsolute(values[key]))throw Error('absolute_file_required');
  if(values.TRIAL_COMPOSE_OVERRIDE&&!isAbsolute(values.TRIAL_COMPOSE_OVERRIDE))throw Error('absolute_override_required');
  if(values.TRIAL_TLS_CA_FILE&&!isAbsolute(values.TRIAL_TLS_CA_FILE))throw Error('absolute_file_required');
  if(values.TRIAL_READY_TIMEOUT_MS!==undefined&&(!/^\d+$/.test(values.TRIAL_READY_TIMEOUT_MS)||Number(values.TRIAL_READY_TIMEOUT_MS)<1000||Number(values.TRIAL_READY_TIMEOUT_MS)>120000))throw Error('readiness_timeout_invalid');
  const localObjects=validateLocalObjectConfig(values);
  return {project:values.TRIAL_PROJECT,image:values.TRIAL_IMAGE,commit:values.TRIAL_COMMIT,buildId:values.TRIAL_BUILD_ID,buildTime:values.TRIAL_BUILD_TIME,origin:origin.origin,port,localObjects};
}
export function readTrialConfig(path) {
  const values={};for(const line of readFileSync(path,'utf8').split(/\r?\n/)) {
    if(!line.trim()||line.startsWith('#'))continue;
    const m=/^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);if(!m||Object.hasOwn(values,m[1]))throw Error('invalid_config');values[m[1]]=m[2];
  }return values;
}
// A fresh offline bundle must not change the canonical service configuration or
// invalidate the stopped application's identity. Override only the one-off job.
export function parseObjectBundleOverride(action,argument) {
  if(argument===undefined)return undefined;
  if(!['objects-export','objects-restore'].includes(action)||!argument.startsWith('--bundle-dir='))throw Error('invalid_bundle_argument');
  const path=argument.slice('--bundle-dir='.length);
  if(!isAbsolute(path)||/[\r\n]/.test(path))throw Error('absolute_bundle_directory_required');
  const resolved=resolve(path),actual=realpathSync(resolved);
  const samePath=process.platform==='win32'?actual.toLowerCase()===resolved.toLowerCase():actual===resolved;
  if(!samePath||!statSync(actual).isDirectory())throw Error('direct_bundle_directory_required');
  return actual;
}
export function validateComposeTarget(model,safe) {
  if(model.name!==safe.project||Object.keys(model.services).sort().join(',')!==[...trialServices(safe.localObjects)].sort().join(','))throw Error('unexpected_stack');
  for(const [key,volume] of Object.entries(model.volumes||{}))if(volume.external||volume.driver_opts||volume.name!==`${safe.project}_${key}`)throw Error('foreign_volume');
  for(const [key,network] of Object.entries(model.networks||{}))if(network.external||network.name!==`${safe.project}_${key}`)throw Error('foreign_network');
  const {app,database,gateway}=model.services;
  if(Object.values(model.services).some(s=>s.container_name||s.privileged||s.network_mode)||database.ports?.length||app.ports?.length||database.image!=='postgres:16-alpine'||app.image!==safe.image||gateway.image!==safe.image)throw Error('unsafe_services');
  if(database.volumes?.length!==1||database.volumes[0].source!=='data'||database.volumes[0].target!=='/var/lib/postgresql/data'||database.volumes[0].type!=='volume')throw Error('unsafe_pgdata');
  if(app.environment.DB_HOST!=='database'||app.environment.DB_NAME!=='quote_trial'||app.environment.DB_USER!=='quote_trial'||app.environment.DATABASE_URL)throw Error('foreign_db');
  if(app.environment.ZHIXU_IDENTITY_MODE!=='session'||app.environment.ZHIXU_COOKIE_SECURE!=='true'||app.environment.NODE_ENV!=='production')throw Error('unsafe_identity');
  for(const [key,value] of Object.entries({ZHIXU_GIT_COMMIT:safe.commit,ZHIXU_BUILD_ID:safe.buildId,ZHIXU_BUILD_TIME:safe.buildTime,NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY:'server',NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY:'server',NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE:'writable'}))if(app.environment[key]!==value)throw Error('runtime_identity_mismatch');
  if(gateway.ports?.length!==1||gateway.ports[0].host_ip!=='127.0.0.1'||String(gateway.ports[0].published)!==String(safe.port))throw Error('unsafe_binding');
  if(gateway.healthcheck?.disable||JSON.stringify(gateway.healthcheck?.test)!==JSON.stringify(['CMD','node','/trial/gateway-health.mjs']))throw Error('gateway_probe_required');
  if(safe.localObjects)validateLocalObjectModel(model,safe);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [action='check',configPath,ack,bundleArgument,...extra]=process.argv.slice(2);if(!configPath)throw Error('explicit_config_required');
    if(extra.length)throw Error('unexpected_arguments');
    const bundleOverride=parseObjectBundleOverride(action,bundleArgument);
    const config=resolve(configPath), values=readTrialConfig(config), safe=validateTrial(values);
    const ops=dirname(fileURLToPath(import.meta.url)), services=trialServices(safe.localObjects);
    const args=['compose','--env-file',config,'-f',resolve(ops,'compose.yml'),...(safe.localObjects?['-f',resolve(ops,'local-objects.compose.yml')]:[]),...(values.TRIAL_COMPOSE_OVERRIDE?['-f',values.TRIAL_COMPOSE_OVERRIDE]:[]),'-p',safe.project];
    const docker=(a,timeout=180000,overrides={})=>execFileSync('docker',[...args,...a],{encoding:'utf8',env:{...process.env,...values,...overrides},stdio:['ignore','pipe','pipe'],timeout});
    const rawDocker=a=>execFileSync('docker',a,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000});
    const expected={project:safe.project,localObjects:safe.localObjects,images:Object.fromEntries(services.map(service=>[service,rawDocker(['image','inspect','--format','{{.Id}}',service==='database'?'postgres:16-alpine':service==='objects'?LOCAL_OBJECT_IMAGE:safe.image]).trim()])),hashes:Object.fromEntries(docker(['config','--hash','*']).trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/)))};
    const inspect=()=>{
      const ids=rawDocker(['ps','-a','--filter',`label=com.docker.compose.project=${safe.project}`,'-q']).trim().split(/\r?\n/).filter(Boolean);
      const rows=ids.map(id=>JSON.parse(rawDocker(['inspect','--format','{"image":{{json .Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"missing"{{end}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"configHash":{{json (index .Config.Labels "com.docker.compose.config-hash")}},"mounts":{{json .Mounts}}}',id])));
      if(safe.localObjects){
        verifyLocalObjectMounts(rows,safe.project);
        for(const name of new Set(rows.flatMap(r=>r.mounts.filter(m=>m.Type==='volume').map(m=>m.Name)))){
          const labels=JSON.parse(rawDocker(['volume','inspect','--format','{{json .Labels}}',name]));
          if(labels?.['com.docker.compose.project']!==safe.project)throw Error('runtime_storage_mismatch');
        }
      }
      return rows;
    };
    docker(['config','-q']);
    validateComposeTarget(JSON.parse(docker(['config','--format','json'])),safe);
    if(safe.localObjects){
      const names=new Set(rawDocker(['volume','ls','--format','{{.Name}}']).trim().split(/\r?\n/));
      const existing=LOCAL_VOLUMES.map(key=>`${safe.project}_${key}`).filter(name=>names.has(name));
      if(existing.length)verifyLocalVolumeOwnership(JSON.parse(rawDocker(['volume','inspect',...existing])),safe.project);
    }
    const image=JSON.parse(execFileSync('docker',['image','inspect','--format','{{json .Config.Labels}}',safe.image],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}));
    if(image['org.opencontainers.image.revision']!==safe.commit||image['io.zhixu.build-id']!==values.TRIAL_BUILD_ID||image['org.opencontainers.image.created']!==values.TRIAL_BUILD_TIME||image['io.zhixu.identity-mode']!=='session'||image['io.zhixu.quote-authority']!=='server'||image['io.zhixu.master-settings-authority']!=='server'||image['io.zhixu.quote-writer-mode']!=='writable')throw Error('image_identity_mismatch');
    const built=JSON.parse(execFileSync('docker',['run','--rm','--network','none','--entrypoint','node',safe.image,'-e',"console.log(require('fs').readFileSync('dist/client/build-info.json','utf8'))"],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}));
    if(built.gitCommit!==safe.commit||built.buildId!==values.TRIAL_BUILD_ID||built.buildTime!==values.TRIAL_BUILD_TIME||built.identityMode!=='session'||built.quoteAuthority!=='server'||built.masterSettingsAuthority!=='server'||built.quoteWriterMode!=='writable')throw Error('compiled_identity_mismatch');
    if(safe.localObjects&&built.orderRead!=='snapshot')throw Error('compiled_identity_mismatch');
    if(action==='check')console.log(JSON.stringify({...safe,operation:'CHECK_ONLY'}));
    else if(action==='prepare-local') {
      if(!safe.localObjects||ack!==`--execute=${safe.project}`)throw Error('explicit_matching_execute_required');
      if(inspect().length)throw Error('local_prepare_requires_new_project');
      const names=rawDocker(['volume','ls','--format','{{.Name}}']).trim().split(/\r?\n/);
      if(['data','objects','appsecrets','objectsecrets'].some(key=>names.includes(`${safe.project}_${key}`)))throw Error('local_prepare_requires_new_volumes');
      // Private host inputs are copied once into owned Linux volumes, with exact
      // application/MinIO owners and 0600. Never overwrite an existing secret volume.
      for(const [key,owner] of [['appsecrets','1000:1000'],['objectsecrets','1001:1001']]) {
        const volume=`${safe.project}_${key}`;
        rawDocker(['volume','create','--label',`com.docker.compose.project=${safe.project}`,'--label',`com.docker.compose.volume=${key}`,volume]);
        rawDocker(['run','--rm','--network','none','--read-only','--user','0:0','--entrypoint','sh',
          '--mount',`type=volume,source=${volume},target=/out`,
          '--mount',`type=bind,source=${values.TRIAL_SECRET_ID_FILE},target=/input/id,readonly`,
          '--mount',`type=bind,source=${values.TRIAL_SECRET_KEY_FILE},target=/input/key,readonly`,safe.image,
          '-c','test ! -e /out/cos-id && test ! -e /out/cos-key && cp /input/id /out/cos-id && cp /input/key /out/cos-key && chown "$1" /out/cos-id /out/cos-key && chmod 600 /out/cos-id /out/cos-key','sh',owner]);
      }
      const objectVolume=`${safe.project}_objects`;
      rawDocker(['volume','create','--label',`com.docker.compose.project=${safe.project}`,'--label','com.docker.compose.volume=objects',objectVolume]);
      // Only the just-created empty volume is initialized. Never repair/chown an
      // adopted store: prepare-local already refuses every existing target volume.
      rawDocker(['run','--rm','--network','none','--read-only','--user','0:0','--entrypoint','sh',
        '--mount',`type=volume,source=${objectVolume},target=/out`,safe.image,
        '-c','test -z "$(ls -A /out)" && chown 1001:1001 /out && chmod 700 /out']);
      console.log(JSON.stringify({project:safe.project,operation:action,result:'LOCAL_SECRETS_PREPARED'}));
    }
    else if(action==='objects-init') {
      if(!safe.localObjects||ack!==`--execute=${safe.project}`)throw Error('explicit_matching_execute_required');
      assertLocalMaintenance(inspect(),expected,{allowObjects:true});
      docker(['up','-d','--wait','objects','objects-tls']);
      assertLocalMaintenance(inspect(),expected,{allowObjects:true});
      console.log(docker(['run','--rm','--no-deps','app','node','/trial/local-object-control.mjs','init','--execute']));
    }
    else if(['start','restart','init'].includes(action)) {
      if(ack!==`--execute=${safe.project}`)throw Error('explicit_matching_execute_required');
      if(action==='init') {
        if(safe.localObjects){
          const names=rawDocker(['volume','ls','--format','{{.Name}}']).trim().split(/\r?\n/);
          assertLocalInitialization(inspect(),expected,names.includes(`${safe.project}_data`));
        }
        const writers=execFileSync('docker',['ps','--filter',`label=com.docker.compose.project=${safe.project}`,'--format','{{.Label "com.docker.compose.service"}}'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim().split('\n').filter(Boolean);
        if(writers.some(service=>service!=='database'))throw Error('init_requires_stopped_application');
        docker(['up','-d','--wait','database']);
        const container=`${safe.project}-database-1`;
        const metadata=JSON.parse(execFileSync('docker',['inspect','--format','{{json .Mounts}}',container],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}));
        if(metadata.length!==1||metadata[0].Name!==`${safe.project}_data`)throw Error('target_volume_mismatch');
        const count=execFileSync('docker',['exec',container,'psql','-X','-U','quote_trial','-d','quote_trial','-Atc',"SELECT count(*) FROM pg_tables WHERE schemaname='public'"],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
        if(count!=='0')throw Error('init_requires_new_empty_database');
        // This command is intentionally explicit; normal app startup stays verify-only.
        docker(['run','--rm','--no-deps','app','node','dist/server/server/db/migrate.js']);
      } else {
        if(action==='restart')verifyRuntime(inspect(),expected);
        else {
          // Never silently recreate an existing database because its configuration changed.
          const db=inspect().find(r=>r.service==='database');
          if(db&&(db.image!==expected.images.database||db.configHash!==expected.hashes.database))throw Error('runtime_identity_mismatch');
          if(safe.localObjects)for(const row of inspect().filter(r=>!['app','gateway'].includes(r.service)))if(!services.includes(row.service)||row.image!==expected.images[row.service]||row.configHash!==expected.hashes[row.service])throw Error('runtime_identity_mismatch');
        }
        docker(action==='start'?['up','-d','app','gateway']:['restart','app','gateway']);
        console.log(JSON.stringify({project:safe.project,operation:action,result:'COMMAND_SUBMITTED'}));
        const ca=readFileSync(values.TRIAL_TLS_CA_FILE||values.TRIAL_TLS_CERT_FILE);
        await waitReady({inspect,expected,safe,timeoutMs:Number(values.TRIAL_READY_TIMEOUT_MS||90000),probe:(path,timeoutMs)=>probeJson(`${safe.origin}${path}`,ca,{timeoutMs}),
          ...(safe.localObjects?{storageProbe:async()=>{try{docker(['exec','-T','app','node','/trial/local-object-control.mjs','check'],10000);}catch{throw Error('local_object_storage_not_ready');}}}:{})});
      }
      console.log(JSON.stringify({project:safe.project,operation:action,result:action==='init'?'PASS':'READY',...(action==='init'?{}:{readiness:'PASS'})}));
    } else if(action==='status')console.log(JSON.stringify({project:safe.project,operation:'STATUS_ONLY',services:inspect().map(({service,running,health})=>({service,running,health}))}));
    else if(action==='logs') {
      for(const line of docker(['logs','--no-log-prefix','--tail','100','app']).split('\n'))try{
        const item=JSON.parse(line);if(typeof item.event==='string'&&/^[a-z_]{1,80}$/.test(item.event))console.log(JSON.stringify({event:item.event}));
      }catch{ /* Never forward raw error/credential-bearing logs. */ }
    }
    else if(['target','restore-check'].includes(action)) {
      const container=`${safe.project}-database-1`;
      const project=execFileSync('docker',['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
      const mounts=JSON.parse(execFileSync('docker',['inspect','--format','{{json .Mounts}}',container],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}));
      if(project!==safe.project||mounts.length!==1||mounts[0].Name!==`${safe.project}_data`)throw Error('target_mismatch');
      const identity=execFileSync('docker',['exec',container,'psql','-X','-q','-U','quote_trial','-d','quote_trial','-Atc',"BEGIN READ ONLY; SELECT current_database()||'|'||coalesce(inet_server_addr()::text,'local_socket')||'|'||current_setting('port'); COMMIT;"],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
      if(identity!=='quote_trial|local_socket|5432')throw Error('target_identity_mismatch');
      if(action==='restore-check') {
        if(docker(['ps','--services','--status','running']).split('\n').filter(Boolean).some(s=>s!=='database'))throw Error('restore_requires_stopped_application');
        const empty=execFileSync('docker',['exec',container,'psql','-X','-q','-U','quote_trial','-d','quote_trial','-Atc',"BEGIN READ ONLY; SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public')+(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()); COMMIT;"],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
        if(empty!=='0')throw Error('restore_requires_new_empty_database_without_clients');
      }
      console.log(JSON.stringify({project,container,volume:`${safe.project}_data`,database:'quote_trial',fingerprint:createHash('sha256').update(`${project}|${container}|${safe.project}_data|${identity}`).digest('hex'),...(action==='restore-check'?{restoreTarget:'EMPTY_NO_CLIENTS'}:{})}));
    }
    else if(['maintenance','maintenance-db','objects-export','objects-restore'].includes(action)) {
      if(ack!==`--execute=${safe.project}`)throw Error('explicit_matching_execute_required');
      if(action==='maintenance'||action==='maintenance-db'){
        if(safe.localObjects)verifyRuntime(inspect(),expected);
        docker(['stop','app','gateway',...(action==='maintenance-db'&&safe.localObjects?['objects-tls','objects']:[])]);
      }
      else {
        const running=docker(['ps','--services','--status','running']).split('\n').filter(Boolean);
        if(safe.localObjects)assertLocalMaintenance(inspect(),expected,{allowObjects:true});
        else if(running.some(s=>s!=='database'))throw Error('offline_maintenance_required');
        if(!values.TRIAL_COMPOSE_OVERRIDE||!values.TRIAL_OBJECT_BUNDLE_DIR||!isAbsolute(values.TRIAL_OBJECT_BUNDLE_DIR))throw Error('explicit_bundle_override_required');
        const effectiveBundle=bundleOverride??parseObjectBundleOverride(action,`--bundle-dir=${values.TRIAL_OBJECT_BUNDLE_DIR}`);
        // Compose on Windows can retain the inherited RW mount when --volume
        // repeats its target. A fixed final Compose layer reliably sets RO.
        console.log(docker([...(action==='objects-restore'?['-f',resolve(ops,'objects-readonly.compose.yml')]:[]),'run','--rm','--no-deps','app','node','/trial/object-bundle.mjs',action==='objects-export'?'export':'restore','--execute'],180000,{TRIAL_OBJECT_BUNDLE_DIR:effectiveBundle}));
      }
    }
    else throw Error('unsupported_operation');
  } catch(error) {console.error(safeFailure(error));process.exitCode=1;}
}

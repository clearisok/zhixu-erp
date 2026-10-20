export const LOCAL_OBJECT_IMAGE='bitnamilegacy/minio@sha256:6dabb4a2088c9a79908de3bc05f4586c23ad2182c8908e7e3acbf61c1467fb20';
export const BASE_SERVICES=['app','database','gateway'];
export const LOCAL_SERVICES=[...BASE_SERVICES,'objects','objects-tls'];
export const trialServices=local=>local?LOCAL_SERVICES:BASE_SERVICES;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function isLocalObjectEndpoint(value) {
  try { const u=new URL(value);return u.origin==='https://objects-tls:8443'&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password; }
  catch { return false; }
}

export function validateLocalObjectConfig(values) {
  if(values.TRIAL_LOCAL_OBJECTS!==undefined&&!['true','false'].includes(values.TRIAL_LOCAL_OBJECTS))throw Error('invalid_local_objects_flag');
  if(values.TRIAL_LOCAL_OBJECTS!=='true')return false;
  if(values.TRIAL_S3_ENDPOINT!=='https://objects-tls:8443'||values.TRIAL_S3_PATH_STYLE!=='true'||!values.TRIAL_TLS_CA_FILE)throw Error('local_objects_require_fixed_tls_endpoint');
  return true;
}

export function validateLocalObjectModel(model,safe) {
  const {app,objects,'objects-tls':tls}=model.services;
  if(Object.keys(model.volumes||{}).sort().join(',')!=='appsecrets,data,objects,objectsecrets'||Object.keys(model.networks||{}).join(',')!=='default'||model.networks.default.internal!==true)throw Error('unsafe_local_storage_network');
  for(const service of Object.values(model.services)) {
    if(service.tmpfs?.length||service.extra_hosts?.length||service.networks&&Object.keys(service.networks).some(n=>n!=='default'))throw Error('unsafe_local_service');
    if(service.environment?.NODE_TLS_REJECT_UNAUTHORIZED!==undefined||service.environment?.NODE_OPTIONS!==undefined)throw Error('unsafe_local_tls');
    if((service.volumes||[]).some(v=>v.type==='volume'&&!model.volumes[v.source]))throw Error('foreign_volume');
  }
  if(objects.image!==LOCAL_OBJECT_IMAGE||tls.image!==safe.image||objects.ports?.length||tls.ports?.length||objects.user!=='1001:1001'||tls.user!=='1000:1000')throw Error('unsafe_local_objects');
  if(objects.environment.MINIO_ROOT_USER_FILE!=='/run/secrets/cos-id'||objects.environment.MINIO_ROOT_PASSWORD_FILE!=='/run/secrets/cos-key'||objects.environment.MINIO_ROOT_USER||objects.environment.MINIO_ROOT_PASSWORD)throw Error('private_object_keys_required');
  if(tls.environment.TRIAL_PROXY_HOST!=='objects'||tls.environment.TRIAL_PROXY_PORT!=='9000'||!same(tls.command,['node','/trial/tls-gateway.mjs']))throw Error('unsafe_local_proxy');
  if(app.environment.NODE_EXTRA_CA_CERTS!=='/run/tls/ca.pem'||app.environment.ZHIXU_ATTACHMENT_S3_ENDPOINT!=='https://objects-tls:8443'||app.environment.ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE!=='true')throw Error('unsafe_local_tls');
  const volume=(service,source,target,readOnly)=>{
    const rows=(service.volumes||[]).filter(v=>v.target===target);
    if(rows.length!==1||rows[0].type!=='volume'||rows[0].source!==source||Boolean(rows[0].read_only)!==readOnly)throw Error('unsafe_local_storage_mount');
  };
  volume(objects,'objects','/bitnami/minio/data',false);volume(objects,'objectsecrets','/run/secrets',true);volume(app,'appsecrets','/run/secrets',true);
  if(objects.volumes.length!==2||(app.volumes||[]).some(v=>v.target.startsWith('/run/secrets/')))throw Error('unsafe_local_storage_mount');
  if(tls.healthcheck?.disable||!same(tls.healthcheck?.test,['CMD','node','/trial/local-object-health.mjs'])||objects.healthcheck?.disable||!same(objects.healthcheck?.test,['CMD','curl','--fail','--silent','http://127.0.0.1:9000/minio/health/live']))throw Error('local_object_probe_required');
}

// Verify actual mounts too: a valid Compose declaration cannot adopt a foreign volume.
export function verifyLocalObjectMounts(rows,project) {
  const requirements={database:[['data','/var/lib/postgresql/data',true]],app:[['appsecrets','/run/secrets',false]],objects:[['objects','/bitnami/minio/data',true],['objectsecrets','/run/secrets',false]]};
  for(const row of rows) {
    for(const [key,target,writable] of requirements[row.service]||[]) {
      const matches=(row.mounts||[]).filter(m=>m.Destination===target);
      if(matches.length!==1||matches[0].Type!=='volume'||matches[0].Name!==`${project}_${key}`||matches[0].RW!==writable)throw Error('runtime_storage_mismatch');
    }
  }
}

export function assertLocalMaintenance(rows,expected,{allowObjects=false}={}) {
  const allowed=allowObjects?['database','objects','objects-tls']:['database'];
  for(const row of rows) {
    if(row.project!==expected.project||!LOCAL_SERVICES.includes(row.service)||row.image!==expected.images[row.service]||row.configHash!==expected.hashes[row.service])throw Error('runtime_identity_mismatch');
    if(row.running&&!allowed.includes(row.service))throw Error('offline_maintenance_required');
  }
  verifyLocalObjectMounts(rows,expected.project);
}

export function assertLocalInitialization(rows,expected,dataVolumeExists) {
  assertLocalMaintenance(rows,expected);
  if(!rows.some(r=>r.service==='database')&&dataVolumeExists)throw Error('local_init_refuses_unattached_database_volume');
}

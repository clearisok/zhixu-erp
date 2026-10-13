export function localDockerEndpoint(endpoint,env={}) {
 if(env.DOCKER_HOST||env.DOCKER_CONTEXT)throw Error('ambient_docker_target_not_allowed');
 if(endpoint!=='npipe:////./pipe/dockerDesktopLinuxEngine'&&endpoint!=='unix:///var/run/docker.sock')throw Error('remote_docker_target_not_allowed');return endpoint;
}
export function assertOwnedResource(resource,manifest,kind){
 const labels=resource.Config?.Labels??resource.Labels; if(labels?.['io.zhixu.isolated.owner']!==manifest.owner||labels?.['io.zhixu.isolated.source']!==manifest.sourceSha)throw Error('isolated_resource_owner_mismatch');
 if(kind==='network'&&(resource.Internal!==true||resource.Id!==manifest.networkId))throw Error('isolated_network_identity_mismatch');
 if(kind==='volume'&&resource.Name!==manifest.project+'-data')throw Error('isolated_volume_identity_mismatch');
 if(kind==='container'){
  if(resource.HostConfig?.Privileged||resource.HostConfig?.NetworkMode==='host'||resource.HostConfig?.AutoRemove)throw Error('isolated_container_policy_mismatch');
  if(JSON.stringify(resource.Config?.Cmd)!==JSON.stringify(resource.Name==='/' +manifest.project+'-app'?['node','dist/server/server/isolated-demo/entry.js']:['postgres']))throw Error('isolated_entry_command_mismatch');
  const env=Object.fromEntries((resource.Config?.Env??[]).map(v=>[v.slice(0,v.indexOf('=')),v.slice(v.indexOf('=')+1)]));
  if(Object.keys(env).some(k=>/^(DATABASE_URL|DB_|AINUOKE_)/.test(k)))throw Error('isolated_inherited_configuration');
  const networks=Object.keys(resource.NetworkSettings?.Networks??{});if(networks.length!==1||networks[0]!==manifest.project+'-net')throw Error('isolated_network_mismatch');
  if(resource.Name==='/' +manifest.project+'-app'){
   if(resource.Mounts?.length!==1||env.NODE_ENV!=='test'||env.ZHIXU_AINUOKE_SOURCE_READ!=='snapshot'||env.ZHIXU_GIT_COMMIT!==manifest.sourceSha||env.ZHIXU_BUILD_ID!==manifest.buildId||env.NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY!=='server'||env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY!=='server'||env.ZHIXU_IDENTITY_MODE!=='session'||env.NEXT_PUBLIC_ZHIXU_ORDER_READ!=='snapshot')throw Error('isolated_app_configuration_mismatch');
   if(resource.Id!==manifest.appId||resource.Image!==manifest.imageId)throw Error('isolated_image_mismatch');
   const ports=Object.values(resource.HostConfig.PortBindings??{}).flat();if(ports.length!==1||ports[0].HostIp!=='127.0.0.1'||ports[0].HostPort!==String(manifest.port))throw Error('isolated_loopback_binding_required');
   if(!resource.Mounts?.some(x=>x.Destination==='/isolated'&&x.RW===false&&x.Type==='bind'&&x.Source.replaceAll('\\','/').toLowerCase()===manifest.privateDirectory.replaceAll('\\','/').toLowerCase()))throw Error('isolated_private_mount_required');
  }else if(resource.Name==='/' +manifest.project+'-pg'){
   if(resource.Mounts?.length!==2||env.POSTGRES_DB!==manifest.database||env.POSTGRES_USER!==manifest.user||env.POSTGRES_PASSWORD_FILE!=='/isolated/postgres-password.txt'||env.POSTGRES_PASSWORD)throw Error('isolated_postgres_configuration_mismatch');
   if(!resource.Mounts?.some(x=>x.Destination==='/isolated'&&x.RW===false&&x.Type==='bind'&&x.Source.replaceAll('\\','/').toLowerCase()===manifest.privateDirectory.replaceAll('\\','/').toLowerCase()))throw Error('isolated_private_mount_required');
   if(resource.Id!==manifest.pgId||resource.Image!==manifest.pgImageId)throw Error('isolated_postgres_identity_mismatch');
   if(Object.keys(resource.HostConfig.PortBindings??{}).length)throw Error('isolated_database_must_not_publish');
   if(!resource.Mounts?.some(x=>x.Name===manifest.project+'-data'&&x.Destination==='/var/lib/postgresql/data'))throw Error('isolated_durable_volume_required');
  }else throw Error('isolated_container_name_mismatch');
 }
 return true;
}
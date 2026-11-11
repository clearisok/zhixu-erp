/** Explicit local read-only demo launcher. Reuses existing app, reader and demo
 * session factory; no migrations, collector, queue commands or business writes. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {createApp} from '../server/app.ts';
import {createLocalDemoEntry} from '../server/auth/local-demo-entry.ts';
import {createLocalConfirmedMaterialPorts} from '../server/ainuoke-source/local-unit-confirmations.ts';

async function main(){
 const args=process.argv.slice(2);if(args.length!==1||!args[0].startsWith('--root='))throw Error('explicit_local_demo_root_required');
 const root=resolve(args[0].slice(7));
 const read=async(path:string)=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
 const conf=await read(root+'/demo.private.json');
 if(conf.schemaVersion!==1||conf.base!=='http://127.0.0.1:63054'||!isAbsolute(conf.existingRuntimeRoot)||!isAbsolute(conf.staticDirectory))throw Error('local_demo_target_invalid');
 const rt=await read(root+'/clone-runtime.private.json'),original=await read(conf.existingRuntimeRoot+'/service.private.json'),uri=new URL(rt.databaseUrl);
 if(uri.hostname!=='127.0.0.1'||uri.pathname!=='/zhixu_ui_dense_20261111'||original.localDemo?.enabled!==true||original.syncEnabled!==false)throw Error('isolated_readonly_clone_required');
 const pool=new pg.Pool({connectionString:rt.databaseUrl,max:4}),security={secureCookies:false,sessionTtlSeconds:28800};
 pool.on('error',()=>undefined);
 const manifest=await read(conf.existingRuntimeRoot+'/object-bundle/objects.json');
 const objects=manifest.objects as Array<{id:string;key:string;sha256:string;provider:string;container:string}>;
 if(!objects.length)throw Error('existing_object_bundle_required');
 const data=new Map<string,Buffer>();
 for(const object of objects){const bytes=await readFile(conf.existingRuntimeRoot+'/object-bundle/objects/'+object.id+'.bin');
  if(createHash('sha256').update(bytes).digest('hex')!==object.sha256)throw Error('object_bundle_changed');data.set(object.key,bytes);}
 const storage={provider:objects[0].provider,container:objects[0].container,
  async head(key:string){const bytes=data.get(key);return bytes?{byteSize:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}:null;},
  async get(key:string){const bytes=data.get(key);return bytes?Readable.from([bytes]):null;},
  async put(){throw Error('local_demo_read_only');},async remove(){throw Error('local_demo_read_only');}};
 const source={sourceKey:rt.sourceKey,maxAgeMs:1800000};
 const app=createApp({pool,staticDirectory:conf.staticDirectory,attachmentStorage:storage,allowedOrigins:[conf.base],security,logger:{error:()=>undefined},materialArrivalSource:source,
  orderMaterialRead:createLocalConfirmedMaterialPorts(pool,source,{accountFingerprint:original.accountFingerprint,
   read:async()=>read(conf.existingRuntimeRoot+'/material-unit-confirmations.private.json')})});
 const entry=createLocalDemoEntry({pool,baseUrl:conf.base,security,readConfig:async()=>original.localDemo});
 const server=createServer((request,response)=>{
  const path=(request.url??'').split('?')[0];
  if(!['GET','HEAD','OPTIONS'].includes(request.method??'GET')&&!['/api/v1/auth/login','/api/v1/auth/logout'].includes(path)){
   response.writeHead(403,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'preview_read_only',message:'本机演示保持只读'}}));return;
  }
  void entry(request,response).then(()=>app(request,response)).catch(()=>{response.writeHead(503,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'local_demo_unavailable'}}));});
 });
 await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(63054,'127.0.0.1',done);});
 const info=await read(conf.staticDirectory+'/build-info.json');
 await writeFile(root+'/demo-status.json',JSON.stringify({state:'LOCAL_READONLY_DEMO_READY',base:conf.base,pid:process.pid,sourceWorker:false,codeVersion:info.gitCommit,buildId:info.buildId,startedAt:new Date().toISOString()}));
 console.log(JSON.stringify({state:'LOCAL_READONLY_DEMO_READY',base:conf.base,sourceWorker:false}));
 const close=()=>{server.closeAllConnections();server.close(()=>void pool.end());};process.once('SIGINT',close);process.once('SIGTERM',close);
}
main().catch(error=>{const code=error instanceof Error&&/^[a-z_]{3,80}$/.test(error.message)?error.message:'local_demo_start_failed';console.error(JSON.stringify({code}));process.exit(1);});

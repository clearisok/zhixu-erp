import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {executeTeamCommand} from '../auth/team-access.js';
import {createApp} from '../app.js';
import {MemoryAttachmentStorage} from '../attachments/storage.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {configureSync,enqueueAutomaticSync} from '../ainuoke-source/sync-queue.js';
import {DEFAULT_SYNC_POLICY} from '../ainuoke-source/sync-schedule.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';

/** Synthetic SDK transport and owned tmpfs DB only. No credential/env discovery. */
export async function startCatalogFixture(staticDirectory=resolve('dist/client')){
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('catalogue_ui')});
 const server=createServer(),origins:string[]=[],errors:unknown[]=[];
 const close=async()=>{server.closeAllConnections();if(server.listening)await new Promise<void>(r=>server.close(()=>r()));await pool.end();await db.stop();};
 try{
  await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
  const password='Synthetic-Catalogue',admin=selectedConfig.operatorUsername,reader='catalog.reader';
  await bootstrapAdmin(pool,{username:admin,displayName:'合成合同管理员',password});
  const actor=await loadExistingBootstrapActor(pool,admin),sourceKey=selectedConfig.sourceKey;
  await executeTeamCommand(pool,actor,{action:'create',requestId:randomUUID(),account:reader,name:'合成只读用户',password,roleIds:['role-team-material-manager']});
  const selected=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  if(selected.result!=='complete'||selected.mode!=='selected-bindings')throw Error('synthetic binding invalid');
  const bound=await bindOrders(pool,actor,{sourceKey,accountFingerprint:accountFingerprint(selectedConfig),selected:selectedContracts,expectedPreview:selected.preview.reviewHash,collect:async()=>selected.bundle});
  await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[]));
  await configureSync(pool,actor,{sourceKey,enabled:true,expectedVersion:0,policy:{...DEFAULT_SYNC_POLICY}});
  await enqueueAutomaticSync(pool,actor,sourceKey);
  let captures=0,failNext=false;
  const tick=()=>runSyncTick(pool,actor,selectedConfig,{automatic:false,collect:async(_c,r)=>{
   captures++;if(r.mode!=='catalog-contracts')throw Error('unexpected source scope');
   const raw=selectedWorkerFixture('catalog-contracts','',r.contracts);
   if(failNext){failNext=false;return {schemaVersion:'ainuoke-request-diagnostics.v1',capture:{...(raw as Record<string,unknown>),result:'failed',bundle:null,code:'source_unavailable',metrics:{logins:1,reportRequests:1,httpAttempts:2,networkRetries:0,authRenewals:0}},requests:[
    {kind:'login',reportId:null,page:null,elapsedMs:10,outcome:'complete',httpStatus:null},
    {kind:'report',reportId:6087105,page:1,elapsedMs:45015,outcome:'timeout',httpStatus:null}]};}
   return raw;
  }});
  await tick();
  let materialOffset=0;
  const app=createApp({pool,staticDirectory,attachmentStorage:new MemoryAttachmentStorage(),allowedOrigins:origins,security:{secureCookies:false,sessionTtlSeconds:7200},logger:{error:e=>errors.push(e)},orderMaterialRead:createPersistedMaterialPorts(pool,{sourceKey,maxAgeMs:1800000},()=>Date.now()+materialOffset)});
  server.on('request',app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address!=='object')throw Error('loopback fixture failed');
  const base='http://127.0.0.1:'+address.port;origins.push(base);
  const login=async(username:string)=>{const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Zhixu-Request':'1'},body:JSON.stringify({username,password})});if(!response.ok)throw Error('synthetic login failed');return response.headers.get('set-cookie')!.split(';')[0];};
  return {pool,base,sourceKey,actor,admin,reader,password,orderIds:bound.orderIds,errors,login,tick,setMaterialOffset:(n:number)=>{materialOffset=n;},captures:()=>captures,failNextCapture:()=>{failNext=true;},close};
 }catch(e){await close();throw e;}
}

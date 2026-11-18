// This router is installed ONLY in the disposable test image. Health uses the
// real CLI; worker IO uses the existing in-memory SDK fixture, never a network.
import {setTimeout as delay} from 'node:timers/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const load=(path:string)=>import(pathToFileURL(resolve(path)).href);
const {createDatabasePool}=await load('server/db/pool.ts') as typeof import('../../db/pool.js');
const {loadServerConfig}=await load('server/config.ts') as typeof import('../../config.js');
const {readPrivateCollectorConfig}=await load('server/ainuoke-source/collector.ts') as typeof import('../../ainuoke-source/collector.js');
const {loadExistingBootstrapActor}=await load('server/sales-orders/bootstrap-runner.ts') as typeof import('../../sales-orders/bootstrap-runner.js');
const {runSyncTick}=await load('server/ainuoke-source/sync-worker.ts') as typeof import('../../ainuoke-source/sync-worker.js');
const {selectedWorkerFixture}=await load('server/integration/selected-source-fixture.ts') as typeof import('../selected-source-fixture.js');
const args=process.argv.slice(2);
if(!args.some(arg=>arg.startsWith('--sync-run='))){
 const {main}=await load('server/ainuoke-source/recovery-real-cli.ts'); await main(args);
}else{
 const config=readPrivateCollectorConfig('/run/source.json'),server=loadServerConfig();
 const pool=createDatabasePool({connectionString:server.databaseUrl});
 const actor=await loadExistingBootstrapActor(pool,config.operatorUsername);
 let stopping=false;process.once('SIGTERM',()=>{stopping=true;});
 try{while(!stopping){
  await runSyncTick(pool,actor,config,{automatic:true,batchSize:1,
   collect:async(_cfg,request)=>{if(!('contracts' in request))throw Error('unexpected_test_capture');
    return selectedWorkerFixture(request.mode==='catalog-discovery'?'catalog-discovery':'catalog-contracts','',request.contracts);}});
  await delay(250);
 }}finally{await pool.end();}
}

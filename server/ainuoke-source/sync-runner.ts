import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import type {CollectorConfig} from './collector.js';
import {createSessionCollector} from './session-collector.js';
import {runSyncTick} from './sync-worker.js';

/** One worker and one authentication owner for the process lifetime. Timer
 * checks enqueue only due contracts; pages and API polling never call this. */
export async function runAutomaticSync(pool:Pool,actor:Pick<TrustedIdentity,'internalUserId'|'userId'>,config:CollectorConfig,options:{
 signal:AbortSignal;adoptNewOrders:boolean;onTick?:(result:Awaited<ReturnType<typeof runSyncTick>>,elapsedMs:number)=>Promise<void>;
}){
 const owner=createSessionCollector();let automaticAt=0;
 try{while(!options.signal.aborted){
  const started=Date.now(),automatic=started>=automaticAt;
  const result=await runSyncTick(pool,actor,config,{automatic,batchSize:5,adoptNewOrders:options.adoptNewOrders,collect:owner.collect});
  if(automatic)automaticAt=Date.now()+60_000;
  await options.onTick?.(result,Date.now()-started);
  if(result.status==='paused'||result.status==='failed'&&!result.retryScheduled)break;
  await delay(result.status==='processed'?250:1000,undefined,{signal:options.signal}).catch(()=>undefined);
 }}finally{owner.close();}
}

import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {accountFingerprint,type CollectorConfig} from './collector.js';
import {SourceError} from './contract.js';
import {createSessionCollector} from './session-collector.js';
import {runSyncTick} from './sync-worker.js';
import {resumeTransientCatalogBackoff} from './sync-recovery.js';

/** One worker and one authentication owner for the process lifetime. Timer
 * checks enqueue only due contracts; pages and API polling never call this. */
export async function runAutomaticSync(pool:Pool,actor:Pick<TrustedIdentity,'internalUserId'|'userId'>,config:CollectorConfig,options:{
 signal:AbortSignal;adoptNewOrders:boolean;onTick?:(result:Awaited<ReturnType<typeof runSyncTick>>,elapsedMs:number)=>Promise<void>;
 now?:()=>number;createCollector?:typeof createSessionCollector;batchSize?:number;readConfig?:()=>CollectorConfig;
}){
 const now=options.now??Date.now,createCollector=options.createCollector??createSessionCollector;
 let owner=createCollector(),automaticAt=0;
 try{while(!options.signal.aborted){
  const current=options.readConfig?.()??config;
  if(current.sourceKey!==config.sourceKey||current.operatorUsername!==config.operatorUsername
   ||accountFingerprint(current)!==accountFingerprint(config))throw new SourceError('source_account_mismatch');
  if(!owner.available())owner=createCollector();
  const started=now(),automatic=started>=automaticAt;
  const result=await runSyncTick(pool,actor,current,{automatic,batchSize:options.batchSize??5,now,adoptNewOrders:options.adoptNewOrders,collect:owner.collect});
  if(automatic)automaticAt=now()+60_000;
  await options.onTick?.(result,now()-started);
  if(result.status==='paused'){
   const backoff=await resumeTransientCatalogBackoff(pool,actor,config.sourceKey,now());
   if(!backoff)break;
   automaticAt=0;
   await delay(Math.max(250,Math.min(60000,Date.parse(backoff.retryAt)-now())),undefined,{signal:options.signal}).catch(()=>undefined);
   continue;
  }
  // An exhausted order retry remains failed, but does not stop unrelated orders
  // or future scheduled slots. Unsafe failures persist a pause before this loop
  // can issue another Source request.
  await delay(result.status==='processed'?250:1000,undefined,{signal:options.signal}).catch(()=>undefined);
 }}finally{owner.close();}
}

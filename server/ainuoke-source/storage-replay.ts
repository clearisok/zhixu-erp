import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {captureSource} from './service.js';
import type {SourceBundle} from './contract.js';
import {hash} from './contract.js';
import {runSyncTick} from './sync-worker.js';
import {hydrateContractEvidence} from './catalog-evidence.js';
import {CATALOG_CONTRACT_LIMITS} from './selected-source-once.js';
import {accountFingerprint,type CollectorConfig} from './collector.js';
import {syncTier,validateSyncPolicy} from './sync-schedule.js';
import {effectiveSyncDeliverySql} from './sync-dates.js';

/** Read-only planning model, using the actual scheduler's effective manual/source dates. */
export async function readStorageScheduleModel(input:Pick<pg.Pool,'query'>,clock:number){
 const dated=(await input.query(`SELECT e.contract_date::text,${effectiveSyncDeliverySql()} AS delivery_date FROM ainuoke_catalog_entries e WHERE e.visible AND e.source_lifecycle_state='present'`)).rows;
 const policy=validateSyncPolicy((await input.query('SELECT policy FROM ainuoke_sync_controls LIMIT 1')).rows[0].policy);
 const tierCounts:Record<string,number>={};for(const row of dated){const tier=syncTier(row.delivery_date,clock,row.contract_date);tierCounts[tier]=(tierCounts[tier]??0)+1;}
 const firstDay=Date.parse(new Date(clock+8*3600000).toISOString().slice(0,10)+'T00:00:00+08:00')+86400000;
 const daily:number[]=[];
 for(let day=0;day<365;day++){
  let count=0;const instant=firstDay+day*86400000+12*3600000,date=new Date(instant+8*3600000),weekday=date.getUTCDay()||7;
  for(const row of dated){const tier=syncTier(row.delivery_date,instant,row.contract_date);count+=tier==='frequent'||tier==='date-review'?1440/policy.frequentMinutes:tier==='daily'?1:tier==='weekly'?(weekday===policy.weeklyDay?1:0):date.getUTCDate()===policy.monthlyDay?1:0;}
  daily.push(count);
 }
 const horizons=[30,90,365].map(days=>({days,automaticContractAttempts:daily.slice(0,days).reduce((a,b)=>a+b,0),lastSevenDaysAttempts:daily.slice(days-7,days).reduce((a,b)=>a+b,0),peakSevenDaysAttempts:Math.max(...daily.slice(0,days-6).map((_,i)=>daily.slice(i,i+7).reduce((a,b)=>a+b,0))),catalogCaptures:days*1440/policy.catalogMinutes}));
 return {basis:'fixed backup-visible present contracts; current effective manual/source delivery dates; complete future Beijing days; no new contracts, pauses, failures or manual tasks',contracts:dated.length,policy,tierCounts,horizons,catalogCapturesPerDay:1440/policy.catalogMinutes};
}

/** One-off offline publisher benchmark on owned clones. No collector, credentials,
 * upstream request, scheduling, real-source freshness claim or maintenance switch. */
async function main(){
 if(process.env.ISSUE174_ISOLATED_REHEARSAL!=='true')throw new Error('isolated replay required');
 const targetUrl=new URL(process.env.ISSUE174_REPLAY_URL??''),legacyUrl=new URL(process.env.ISSUE174_REPLAY_INPUT_URL??'');
 if(targetUrl.hostname!=='issue174-v2-pg-20261124'||legacyUrl.hostname!==targetUrl.hostname||!/^\/issue174_bench_(legacy|v2)_20261124$/.test(targetUrl.pathname)||legacyUrl.pathname!=='/issue174_bench_legacy_20261124')throw new Error('replay clone identity rejected');
 const rounds=Number(process.env.ISSUE174_REPLAY_ROUNDS??20),clock=Number(process.env.ISSUE174_REPLAY_CLOCK);
 if(!Number.isSafeInteger(rounds)||rounds<2||rounds>100||!Number.isSafeInteger(clock))throw new Error('bounded replay policy required');
 const input=new pg.Pool({connectionString:legacyUrl.toString(),max:1}),target=new pg.Pool({connectionString:targetUrl.toString(),max:3});
 try{
  const worker=process.env.ISSUE174_REPLAY_MODE==='worker';
  const config=worker?JSON.parse(await readFile('/evidence/replay-synthetic-config-private.json','utf8')) as CollectorConfig:null;
  if(config&&config.password!=='issue174-offline-no-upstream')throw new Error('only the synthetic benchmark password is accepted');
  const samples=(await input.query(`SELECT r.source_key,p.account_fingerprint,u.id::text AS internal_user_id,u.public_id::text AS user_id,
   s.sales_order_id::text,s.sales_contract_no,r.discovery,s.snapshots
   FROM ainuoke_material_order_heads h JOIN ainuoke_source_runs r ON r.id=h.run_id
   JOIN ainuoke_material_source_snapshots s ON s.run_id=h.run_id AND s.sales_order_id=h.sales_order_id
   JOIN ainuoke_source_profiles p ON p.source_key=r.source_key JOIN ainuoke_sync_controls c ON c.source_key=p.source_key
   JOIN app_users u ON u.id=c.operator_id
   WHERE h.last_error_code IS NULL ORDER BY pg_column_size(s.snapshots) DESC,s.sales_order_id LIMIT 5`)).rows;
  if(samples.length!==5)throw new Error('representative current source samples missing');
  if(worker){
   if(samples.some(r=>r.source_key!==config!.sourceKey||r.account_fingerprint!==accountFingerprint(config!)))throw new Error('recorded account identity mismatch');
   for(const row of samples){
    const proof=(await input.query(`SELECT o.*,p.account_fingerprint,l.external_id FROM sales_order_source_links l
     JOIN ainuoke_contract_sync_state s ON s.source_id=l.external_id AND s.source_key=$2
     JOIN ainuoke_contract_observations o ON o.id=s.observation_id JOIN ainuoke_source_profiles p ON p.source_key=o.source_key
     WHERE l.sales_order_id=$1 AND l.source_system='ainuoke'`,[row.sales_order_id,row.source_key])).rows;
    if(proof.length!==1)throw new Error('recorded contract proof missing');
    const raw=await hydrateContractEvidence(input,proof[0]);
    row.source_id=proof[0].source_id;row.colors=raw.addition.colors[row.sales_contract_no];row.snapshots=raw.materials;
    row.discoveryBefore=raw.addition.discoveryBefore;row.discovery=raw.addition.discoveryAfter;
   }
   // Only disposable benchmark clones: the paused real source is never addressed.
   await target.query('UPDATE ainuoke_sync_controls SET enabled=true,paused_reason=NULL,catalog_retry_at=NULL WHERE source_key=$1',[config!.sourceKey]);
  }
  const publish=async(index:number)=>{
   const elapsed=[];
   for(const row of samples){
    const pages=structuredClone(row.snapshots) as SourceBundle['materials'][string];
    const discovery=structuredClone(row.discovery) as SourceBundle['discoveryAfter'];
    const before=structuredClone(worker?row.discoveryBefore:row.discovery) as SourceBundle['discoveryBefore'];
    const colors=structuredClone(worker?row.colors:[]) as SourceBundle['materials'][string];
    // Explicit simulation metadata only; raw rows and business values are unchanged.
    for(const page of [...pages,...discovery,...before,...colors])page.fetchedAt=new Date(clock+index*1000).toISOString();
    const bundle:SourceBundle={schemaVersion:'ainuoke-server-source.v1',discoveryBefore:before,discoveryAfter:discovery,materials:{[row.sales_contract_no]:pages}};
    const started=performance.now();
    const actor={internalUserId:row.internal_user_id,userId:row.user_id};
    if(worker){
     await target.query("UPDATE ainuoke_contract_sync_state SET last_success_at=$3::timestamptz-interval '400 days',last_automatic_attempt_at=$3::timestamptz-interval '400 days' WHERE source_key=$1 AND source_id=$2",[row.source_key,row.source_id,new Date(clock+index*1000)]);
     await target.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by,requested_at,available_at)
      SELECT $1,$2,$3,$4,'automatic','queued',$5,$6,$6 WHERE NOT EXISTS(SELECT 1 FROM ainuoke_sync_jobs WHERE source_key=$2 AND source_id=$3 AND status IN ('queued','running','unknown'))`,[randomUUID(),row.source_key,row.source_id,row.sales_contract_no,row.internal_user_id,new Date(clock+index*1000)]);
     const count=pages.length+before.length+discovery.length+colors.length;
     const result=await runSyncTick(target,actor,config!,{automatic:false,batchSize:1,sourceIds:[row.source_id],now:()=>clock+index*1000,collect:async()=>({
      schemaVersion:'ainuoke-catalog-contracts.v1',mode:'catalog-contracts',result:'complete',code:null,databaseAccess:'none',sourceActivation:'not-activated',sourceFingerprint:accountFingerprint(config!),selectedContracts:[row.sales_contract_no],limits:CATALOG_CONTRACT_LIMITS,
      metrics:{logins:1,reportRequests:count,httpAttempts:count+1,networkRetries:0,authRenewals:0},
      bundle:{...bundle,schemaVersion:'ainuoke-contract-details.v1',colors:{[row.sales_contract_no]:colors}}})});
     if(result.status!=='processed'||result.jobs.length!==1||result.jobs[0].status!=='complete')throw new Error('recorded worker replay failed: '+JSON.stringify(result));
    }else await captureSource(target,actor,{sourceKey:row.source_key,accountFingerprint:row.account_fingerprint,selectedOrderIds:[row.sales_order_id],maxAgeMs:600000,now:()=>clock+index*1000,collect:async()=>bundle});
    elapsed.push(performance.now()-started);
   }
   return elapsed;
  };
  const measure=async()=>{
   await new Promise(done=>setTimeout(done,1100));
   await target.query('SELECT pg_stat_clear_snapshot()');
   const row=(await target.query(`SELECT pg_database_size(current_database())::text AS database_bytes,pg_current_wal_insert_lsn()::text AS lsn,
    (SELECT count(*)::text FROM ainuoke_source_runs) AS business_runs,
    (SELECT sum(pg_total_relation_size(c.oid))::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') AS relation_bytes`)).rows[0];
   row.dml=(await target.query('SELECT relname,n_tup_ins::text ins,n_tup_upd::text upd,n_tup_del::text del,n_tup_hot_upd::text hot FROM pg_stat_user_tables ORDER BY relname')).rows;
   row.background=(await target.query('SELECT sum(autovacuum_count)::text autovacuums FROM pg_stat_user_tables')).rows[0];
   return row;
  };
  await publish(0);const before=await measure(),times=[];
  for(let i=1;i<=rounds;i++)times.push(...await publish(i));
  const after=await measure();times.sort((a,b)=>a-b);
  const wal=Number((await target.query('SELECT pg_wal_lsn_diff($1::pg_lsn,$2::pg_lsn)::text n',[after.lsn,before.lsn])).rows[0].n);
  const scheduleModel=await readStorageScheduleModel(input,clock);
  const databaseRole=(await target.query(`SELECT current_user AS name,p.rolsuper,p.rolcreaterole,p.rolbypassrls,
   (SELECT count(*)::int FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relowner=p.oid) owned_tables
   FROM pg_roles p WHERE p.rolname=current_user`)).rows[0];
  const dml=(after.dml as Array<{relname:string;ins:string;upd:string;del:string;hot:string}>).map(row=>{
   const old=before.dml.find((r:{relname:string})=>r.relname===row.relname)??{ins:'0',upd:'0',del:'0',hot:'0'};
   return {table:row.relname,inserts:Number(row.ins)-Number(old.ins),updates:Number(row.upd)-Number(old.upd),deletes:Number(row.del)-Number(old.del),hotUpdates:Number(row.hot)-Number(old.hot)};
  }).filter(r=>r.inserts||r.updates||r.deletes);
  const result={state:'OFFLINE_RECORDED_REPLAY_MEASURED',mode:worker?'contract_worker':'material_publisher',database:targetUrl.pathname.slice(1),contracts:samples.length,rounds,publications:times.length,
   runtimeSourceSha:process.env.ISSUE174_RUNTIME_SOURCE_SHA??'not-supplied',databaseRole,dml,backgroundAutovacuums:Number(after.background.autovacuums)-Number(before.background.autovacuums),
   inputBusinessHash:hash(samples.map(r=>({contract:r.sales_contract_no,directory:r.discovery.flatMap((p:{rows:unknown[]})=>p.rows),materials:r.snapshots.flatMap((p:{rows:unknown[]})=>p.rows),colors:(r.colors??[]).flatMap((p:{rows:unknown[]})=>p.rows)}))),
   scheduleModel,
   simulatedClock:clock,sourceRequests:0,upstreamLatencyIncluded:false,maintenanceEnabled:false,warmupPublications:samples.length,
   fixtureWritesPerPublication:worker?2:0,fixtureNote:'Only owned clones: force a due state and enqueue one attempt; both variants include the same fixture writes. No real scheduler interval was changed.',
   databaseBeforeBytes:Number(before.database_bytes),databaseAfterBytes:Number(after.database_bytes),databaseGrowthBytes:Number(after.database_bytes)-Number(before.database_bytes),
   relationGrowthBytes:Number(after.relation_bytes)-Number(before.relation_bytes),walBytes:wal,businessVersionsAdded:Number(after.business_runs)-Number(before.business_runs),
   medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.ceil(times.length*.95)-1],p99Ms:times[Math.ceil(times.length*.99)-1],totalPublisherMs:times.reduce((a,b)=>a+b,0),inputBusinessValuesChanged:false};
  await writeFile(process.env.ISSUE174_REPLAY_RESULT??'/evidence/replay.json',JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result)+'\n');
 }finally{await input.end();await target.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(async error=>{
 await writeFile('/evidence/replay-failure-private.txt',error instanceof Error?error.stack??error.message:String(error));process.stderr.write('isolated_publisher_replay_failed\n');process.exitCode=1;
});

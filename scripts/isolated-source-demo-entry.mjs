// Explicit local isolated execution only. Mounted read-only; never a production startup entry.
import {readFileSync,existsSync,openSync,closeSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import pg from '/app/node_modules/pg/lib/index.js';
import {runMigrations,verifyMigrationsCurrent} from '/app/dist/server/server/db/migration-runner.js';
import {synchronizePermissionCatalog} from '/app/dist/server/server/auth/permissions.js';
import {bootstrapAdmin} from '/app/dist/server/server/auth/bootstrap.js';
import {executeTeamCommand} from '/app/dist/server/server/auth/team-access.js';
import {TEAM_ROLES} from '/app/dist/server/server/auth/team-roles.js';
import {loadExistingBootstrapActor} from '/app/dist/server/server/sales-orders/bootstrap-runner.js';
import {previewSelectedBindings,bindOrders} from '/app/dist/server/server/ainuoke-source/binding.js';
import {captureSource} from '/app/dist/server/server/ainuoke-source/service.js';
import {parseCollectorConfig,collectWithPython,accountFingerprint} from '/app/dist/server/server/ainuoke-source/collector.js';
import {hash} from '/app/dist/server/server/ainuoke-source/contract.js';
import {createPersistedMaterialPorts} from '/app/dist/server/server/ainuoke-source/reader.js';
import {createApp} from '/app/dist/server/server/app.js';
import {createIdentityAuthority} from '/app/dist/server/server/auth/identity-authority.js';
import {assertRuntimeBuildIdentity} from '/app/dist/server/server/build-identity.js';
const users=['demo.admin','demo.manager','demo.quote','demo.material','demo.production','demo.finance'];
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const fail=code=>{throw Error(code);};
let pool;
async function main(){
 const action=process.argv[2];if(!['capture-window','initialize','check','preview','bind','capture','inspect','serve'].includes(action))fail('explicit_isolated_action_required');
 const m=JSON.parse(readFileSync('/isolated/manifest.json','utf8'));
 if(m.schemaVersion!=='isolated-source-demo.v1'||!/^zhixu-live-demo-[a-z0-9-]{6,40}$/.test(m.project)||!/^zhixu_live_demo_[a-z0-9_]{6,40}$/.test(m.database)||m.user!==m.database||!/^live-demo-[a-z0-9-]{6,40}$/.test(m.sourceKey)||!Number.isInteger(m.port)||m.port<62000||m.port>62999||!Array.isArray(m.selected)||m.selected.length!==4||new Set(m.selected).size!==4||m.selected.some(s=>typeof s!=='string'||!s||s.length>80)||!/^[a-f0-9]{64}$/.test(m.owner)||!/^[a-f0-9]{40}$/.test(m.sourceSha)||typeof m.databasePassword!=='string'||m.databasePassword.length<32||typeof m.demoPassword!=='string'||m.demoPassword.length<16||m.authorizedCaptureCycles!==2||m.authorization!=='user-confirmed-four-orders-two-captures'||process.env.NODE_ENV!=='test'||process.env.DATABASE_URL||process.env.DB_HOST)fail('isolated_manifest_invalid');
 const scriptHash=createHash('sha256').update(readFileSync('/isolated/entry.mjs')).digest('hex');if(scriptHash!==m.entrySha256)fail('isolated_entry_changed');
 const build=await assertRuntimeBuildIdentity('/app/dist/client','server');
 if(build.gitCommit!==m.sourceSha||build.buildId!==m.buildId||build.quoteAuthority!=='server'||build.identityMode!=='session'||build.orderRead!=='snapshot')fail('isolated_build_mismatch');
 const uri=new URL('postgresql://localhost');uri.hostname=m.project+'-pg';uri.username=m.user;uri.password=m.databasePassword;uri.pathname='/'+m.database;
 pool=new pg.Pool({connectionString:uri.toString(),max:5});
 const identity=(await pool.query('SELECT current_database() AS database,current_user AS db_user')).rows[0];
 if(identity.database!==m.database||identity.db_user!==m.user)fail('isolated_database_mismatch');
 const selectionHash=hash([...m.selected].sort());
 const targetFingerprint=hash({owner:m.owner,project:m.project,database:identity,sourceSha:m.sourceSha,sourceKey:m.sourceKey,selectionHash});
 const marker=async()=>{
  const present=(await pool.query("SELECT to_regclass('zhixu_isolated_source.ownership') IS NOT NULL AS present")).rows[0].present;
  if(!present)return null;
  const rows=(await pool.query('SELECT * FROM zhixu_isolated_source.ownership')).rows;
  if(rows.length!==1||rows[0].owner!==m.owner||rows[0].source_sha!==m.sourceSha||rows[0].selection_hash!==selectionHash)fail('isolated_owner_mismatch');return rows[0];
 };
 if(action==='initialize'){
  if(await marker())fail('isolated_already_initialized');
  const tables=(await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")).rows[0].n;
  if(tables!==0)fail('isolated_empty_database_required');
  await pool.query('CREATE SCHEMA zhixu_isolated_source');
  await pool.query('CREATE TABLE zhixu_isolated_source.ownership(owner text PRIMARY KEY,source_sha text NOT NULL,selection_hash text NOT NULL,state text NOT NULL)');
  await pool.query('INSERT INTO zhixu_isolated_source.ownership VALUES($1,$2,$3,$4)',[m.owner,m.sourceSha,selectionHash,'initializing']);
  await runMigrations(pool,'database/migrations');await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:users[0],displayName:'真实来源演示管理员（演示账号）',password:m.demoPassword});
  const actor=await loadExistingBootstrapActor(pool,users[0]);
  for(let i=1;i<TEAM_ROLES.length;i++)await executeTeamCommand(pool,actor,{action:'create',requestId:randomUUID(),account:users[i],name:'演示'+TEAM_ROLES[i].name,password:m.demoPassword,roleIds:[TEAM_ROLES[i].id]});
  await pool.query("UPDATE zhixu_isolated_source.ownership SET state='ready'");
  emit({result:'ISOLATED_EMPTY_LEDGER_INITIALIZED',targetFingerprint,users:users.length,orders:0});return;
 }
 if((await marker())?.state!=='ready')fail('isolated_not_initialized');
 await verifyMigrationsCurrent(pool,'database/migrations');
 const orders=(await pool.query("SELECT o.id::text,l.sales_contract_no FROM sales_orders o LEFT JOIN sales_order_source_links l ON l.sales_order_id=o.id AND l.source_system='ainuoke' ORDER BY l.sales_contract_no")).rows;
 const runs=Number((await pool.query('SELECT count(*)::int n FROM ainuoke_source_runs')).rows[0].n);
 if(action==='check'){emit({result:'CHECKED_NO_SOURCE_READ',targetFingerprint,orders:orders.length,runs});return;}
 if(action==='inspect'){
  const snapshots=(await pool.query('SELECT s.sales_contract_no,s.sales_order_id::text,s.content_hash,s.snapshots FROM ainuoke_material_source_snapshots s JOIN ainuoke_source_profiles p ON p.latest_run_id=s.run_id WHERE p.source_key=$1',[m.sourceKey])).rows;
  emit({result:'ISOLATED_PRIVATE_READBACK',targetFingerprint,orders,runs,snapshots});return;
 }
 if(action==='serve'){
  let confirmed;
  if(existsSync('/isolated/confirmations.json')){
   const c=JSON.parse(readFileSync('/isolated/confirmations.json','utf8'));
   if(c.sourceKey!==m.sourceKey||c.targetFingerprint!==targetFingerprint)fail('isolated_confirmation_target_mismatch');
   confirmed={sourceKey:c.sourceKey,accountFingerprint:c.accountFingerprint,byOrder:new Map(c.byOrder)};
  }
  const app=createApp({pool,staticDirectory:'/app/dist/client',identityAuthority:createIdentityAuthority(pool,'session'),allowedOrigins:['http://127.0.0.1:'+m.port],security:{secureCookies:false,sessionTtlSeconds:43200},logger:{error:()=>emit({event:'isolated_request_failed'})},orderMaterialRead:createPersistedMaterialPorts(pool,{sourceKey:m.sourceKey,maxAgeMs:1800000},Date.now,confirmed)});
  const server=createServer(app);await new Promise(resolve=>server.listen(3000,'0.0.0.0',resolve));
  emit({result:'ISOLATED_REAL_SOURCE_APP_READY',orders:orders.length,runs,scheduler:false});
  const servingPool=pool;const stop=()=>server.close(()=>void servingPool.end());process.once('SIGTERM',stop);process.once('SIGINT',stop);pool=null;return;
 }
 let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>20000)fail('isolated_input_limit');}
 const input=JSON.parse(raw);if(input.expectedTarget!==targetFingerprint)fail('isolated_target_mismatch');
 const cfg=parseCollectorConfig(input.collectorConfig);
 if(cfg.sourceKey!==m.sourceKey||cfg.operatorUsername!==users[0])fail('isolated_source_mismatch');
 const actor=await loadExistingBootstrapActor(pool,users[0]);
 const lock=await pool.connect();
 try{
  if(!(await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',['isolated-operation:'+m.owner])).rows[0].locked)fail('isolated_operation_busy');
  const collect=()=>collectWithPython(cfg,m.selected,{mode:'additions'});
  if(action==='preview'){
   const p=await previewSelectedBindings(await collect(),m.selected);
   emit({result:'SELECTED_BINDING_PREVIEW_NO_WRITES',targetFingerprint,accountFingerprint:accountFingerprint(cfg),reviewHash:p.reviewHash,visibleContracts:p.visibleContracts,contracts:p.preview.candidates.map(c=>({contract:c.source.salesContractNo,sourceId:c.source.sourceId,insideOrderNo:c.source.insideOrderNo,quantity:c.source.quantity,colors:c.colors.length,colorStatus:c.colorDetailStatus}))});
  }else if(action==='bind'){
   const r=await bindOrders(pool,actor,{sourceKey:m.sourceKey,accountFingerprint:accountFingerprint(cfg),selected:m.selected,expectedPreview:input.expectedPreview,collect});emit({result:'SELECTED_ORDERS_BOUND',...r});
  }else{
   const latestRuns=Number((await lock.query('SELECT count(*)::int n FROM ainuoke_source_runs')).rows[0].n);
   let windowAuth;
   if(action==='capture-window'){
    windowAuth=JSON.parse(readFileSync('/isolated/schedule-authorization.json','utf8'));
    const a=windowAuth,slot=input.slot,now=Date.now();
    if(a.schemaVersion!=='isolated-source-window.v1'||a.authorization!=='user-approved-four-orders-10m-2h'||a.targetFingerprint!==targetFingerprint||a.owner!==m.owner||a.sourceSha!==m.sourceSha||JSON.stringify(a.selected)!==JSON.stringify(m.selected)||a.intervalMs!==600000||a.maxAttempts!==12||!Number.isSafeInteger(a.startedAt)||a.endsAt-a.startedAt!==7200000||now<a.startedAt||now>=a.endsAt-5000||! /^[a-f0-9]{32}$/.test(a.id)||!Number.isInteger(slot)||slot<0||slot>=12||Math.floor((now-a.startedAt)/600000)!==slot)fail('window_authorization_invalid');
    setTimeout(()=>{emit({result:'FAIL',code:'window_expired'});process.exit(1);},a.endsAt-Date.now()).unref();
    closeSync(openSync('/tmp/zhixu-window-'+a.id+'-'+slot,'wx'));
   }else if(latestRuns>=m.authorizedCaptureCycles)fail('authorized_capture_limit_reached');
   if(orders.length!==m.selected.length||orders.some(o=>!m.selected.includes(o.sales_contract_no)))fail('isolated_bound_scope_mismatch');
   const r=await captureSource(pool,actor,{sourceKey:m.sourceKey,accountFingerprint:accountFingerprint(cfg),maxAgeMs:600000,collect:async contracts=>{
    if(JSON.stringify([...contracts].sort())!==JSON.stringify([...m.selected].sort()))fail('isolated_bound_scope_mismatch');
    const timeoutMs=windowAuth?Math.min(590000,windowAuth.endsAt-Date.now()-5000):600000;
    if(timeoutMs<1)fail('window_expired');
    const data=await collectWithPython(cfg,contracts,{timeoutMs});
    if(windowAuth&&Date.now()>=windowAuth.endsAt-5000)fail('window_expired');return data;
   }});emit({result:'SOURCE_CAPTURED',...r});
  }
 }finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['isolated-operation:'+m.owner]).catch(()=>{});lock.release();}
}
main().catch(e=>{emit({result:'FAIL',code:/^[a-z_]+$/.test(e?.code??e?.message)?(e.code??e.message):'isolated_execution_failed'});process.exitCode=1;}).finally(async()=>{if(pool)await pool.end();});

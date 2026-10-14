import {readFileSync} from "node:fs";
import {createServer} from "node:http";
import {randomUUID,createHash} from "node:crypto";
import pg from "pg";
import {validateDemoManifest,assertDatabaseOwnership,type DemoManifest} from "./guard.js";
import {demoBundles,type WorkbookRows} from "./fixtures.js";
import {importWorkbook} from "./import-workbook.js";
import {assertRuntimeBuildIdentity} from "../build-identity.js";
import {loadServerConfig} from "../config.js";
import {runMigrations,verifyMigrationsCurrent} from "../db/migration-runner.js";
import {synchronizePermissionCatalog} from "../auth/permissions.js";
import {bootstrapAdmin} from "../auth/bootstrap.js";
import {loadExistingBootstrapActor} from "../sales-orders/bootstrap-runner.js";
import {executeTeamCommand} from "../auth/team-access.js";
import {TEAM_ROLES} from "../auth/team-roles.js";
import {bindOrders,previewBindings} from "../ainuoke-source/binding.js";
import {captureSource} from "../ainuoke-source/service.js";
import {createPersistedMaterialPorts} from "../ainuoke-source/reader.js";
import {createApp} from "../app.js";
import {createIdentityAuthority} from "../auth/identity-authority.js";
const users=['demo.admin','demo.manager','demo.quote','demo.material','demo.production','demo.finance'];
const password='Synthetic-Demo-2026';
async function main(){
 const m=validateDemoManifest(JSON.parse(readFileSync('/isolated/manifest.json','utf8')) as DemoManifest,process.env);
 const build=await assertRuntimeBuildIdentity('dist/client','server');
 if(build.gitCommit!==m.sourceSha||build.buildId!==m.buildId||build.buildTime!==m.buildTime||build.quoteAuthority!=='server'||build.identityMode!=='session'||build.orderRead!=='snapshot'||process.env.NODE_ENV!=='test')throw Error('isolated_build_identity_mismatch');
 const workbookBytes=readFileSync('/isolated/workbook.json');if(createHash('sha256').update(workbookBytes).digest('hex')!==m.workbookPayloadHash)throw Error('isolated_workbook_payload_mismatch');
 const wb=JSON.parse(workbookBytes.toString('utf8')) as {sha256:string;sheets:WorkbookRows};if(wb.sha256!==m.workbookHash)throw Error('isolated_workbook_identity_mismatch');
 const databaseUrl=new URL('postgresql://localhost');databaseUrl.hostname=m.project+'-pg';databaseUrl.username=m.user;databaseUrl.password=m.databasePassword;databaseUrl.pathname='/'+m.database;
 const config=loadServerConfig({NODE_ENV:'test',ZHIXU_IDENTITY_MODE:'session',DATABASE_URL:databaseUrl.toString(),ZHIXU_SERVER_HOST:'0.0.0.0',ZHIXU_SERVER_PORT:'3000',ZHIXU_ALLOWED_ORIGINS:'http://127.0.0.1:'+m.port,ZHIXU_COOKIE_SECURE:'false',ZHIXU_STATIC_DIR:'dist/client'});
 const pool=new pg.Pool({connectionString:config.databaseUrl,max:5});
 const identity=(await pool.query('SELECT current_database() AS database,current_user AS "user",(SELECT count(*)::int FROM information_schema.tables WHERE table_schema=\'public\') AS tables')).rows[0];
 const hasMarker=(await pool.query("SELECT to_regclass('zhixu_isolated_fixture.ownership') IS NOT NULL AS present")).rows[0].present;
 if(hasMarker)identity.marker=(await pool.query('SELECT owner,source_sha,workbook_hash,state FROM zhixu_isolated_fixture.ownership')).rows[0];
 const action=assertDatabaseOwnership(identity,m);
 if(action==='initialize'){
  await pool.query('CREATE SCHEMA zhixu_isolated_fixture');await pool.query('CREATE TABLE zhixu_isolated_fixture.ownership(owner text PRIMARY KEY,source_sha text NOT NULL,workbook_hash text NOT NULL,state text NOT NULL)');await pool.query('INSERT INTO zhixu_isolated_fixture.ownership VALUES($1,$2,$3,$4)',[m.owner,m.sourceSha,m.workbookPayloadHash,'initializing']);
  await runMigrations(pool,'database/migrations');await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:users[0],displayName:'隔离演示管理员（合成）',password});
  const actor=await loadExistingBootstrapActor(pool,users[0]);for(let i=1;i<TEAM_ROLES.length;i++)await executeTeamCommand(pool,actor,{action:'create',requestId:randomUUID(),account:users[i],name:'隔离演示'+TEAM_ROLES[i].name,password,roleIds:[TEAM_ROLES[i].id]});
  const b=demoBundles(wb.sheets).binding;const p=await previewBindings(b);await bindOrders(pool,actor,{sourceKey:'isolated-fixture',accountFingerprint:'a'.repeat(64),expectedPreview:p.reviewHash,collect:async()=>b});
  const imported=await importWorkbook(pool,actor,wb.sheets);
  await pool.query('UPDATE zhixu_isolated_fixture.ownership SET state=$1',['ready']);console.log(JSON.stringify({event:'isolated_import_complete',...imported,fixtureScope:'6 explicitly labelled cases + workbook simulated orders; not 558 live orders'}));
 }
 await verifyMigrationsCurrent(pool,'database/migrations');
 const actor=await loadExistingBootstrapActor(pool,users[0]);const capture=()=>captureSource(pool,actor,{sourceKey:'isolated-fixture',accountFingerprint:'a'.repeat(64),maxAgeMs:600000,collect:async()=>demoBundles(wb.sheets).materials});await capture();
 const app=createApp({pool,staticDirectory:config.staticDirectory,identityAuthority:createIdentityAuthority(pool,'session'),allowedOrigins:config.allowedOrigins,security:{secureCookies:false,sessionTtlSeconds:43200},logger:{error:()=>console.error(JSON.stringify({event:'isolated_request_failed'}))},orderMaterialRead:createPersistedMaterialPorts(pool,{sourceKey:'isolated-fixture',maxAgeMs:1800000})});
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(3000,'0.0.0.0',resolve));
 // Offline fixture refresh only. No collector, credential file or real Ainuoke endpoint is loaded.
 let stopping=false;let timer:ReturnType<typeof setTimeout>;
 const next=()=>{timer=setTimeout(async()=>{if(stopping)return;try{await capture();console.log(JSON.stringify({event:'offline_fixture_refreshed'}));}catch{console.error(JSON.stringify({event:'offline_fixture_refresh_failed'}));}next();},300000);};next();
 console.log(JSON.stringify({event:'isolated_demo_ready',sourceSha:m.sourceSha,fixtureOnly:true,realSourceActivated:false,orders:demoBundles(wb.sheets).binding.discoveryBefore[0].total}));
 const stop=()=>{if(stopping)return;stopping=true;clearTimeout(timer);server.close(()=>void pool.end());};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
main().catch(()=>{console.error(JSON.stringify({event:'isolated_startup_failed',code:'guard_or_initialization_failed',existingTargetsTouched:false}));process.exitCode=1;setTimeout(()=>process.exit(1),100).unref();});
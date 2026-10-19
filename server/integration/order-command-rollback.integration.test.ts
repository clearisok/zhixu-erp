import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,readdir,symlink,lstat,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import pg from 'pg';
import JSZip from 'jszip';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations,verifyMigrationsCurrent} from '../db/migration-runner.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {createSalesOrder,listSalesOrders} from '../sales-orders/repository.js';
import {readOrderCommandState} from '../sales-orders/command-control.js';

const baseline='064e3afaf7d08b3cb62907d4402f97d9c292f1e5';
const run=promisify(execFile);
function inside(root:string,path:string){const distance=relative(resolve(root),resolve(path));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));}

test('exact main Server binary refuses newer schema before identity/bootstrap/listen; compatible paused reads preserve history',{timeout:180000},async t=>{
 const temp=await mkdtemp(join(tmpdir(),'zhixu-order-rollback-'));const old=join(temp,'old-main');await mkdir(old);
 const dependencyLink=join(old,'node_modules');let linked=false;
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('rollback_compatibility')});
 t.after(async()=>{
  await pool.end();await db.stop();
  if(linked){inside(old,dependencyLink);assert.equal((await lstat(dependencyLink)).isSymbolicLink(),true);await unlink(dependencyLink);}
  inside(tmpdir(),temp);await rm(temp,{recursive:true,force:true});
 });
 const archive=join(temp,'main.zip');
 await run('git',['archive','--format=zip','--output',archive,baseline],{cwd:resolve(),timeout:30000,windowsHide:true});
 const zip=await JSZip.loadAsync(await readFile(archive));
 for(const entry of Object.values(zip.files)){
  const path=resolve(old,entry.name);inside(old,path);
  if(entry.dir)await mkdir(path,{recursive:true});else{await mkdir(dirname(path),{recursive:true});await writeFile(path,await entry.async('nodebuffer'));}
 }
 await symlink(resolve('node_modules'),dependencyLink,process.platform==='win32'?'junction':'dir');linked=true;
 // Image migrations are Git LF blobs. Add forward files separately instead of
 // comparing Windows checkout CRLF checksums to a Linux image's identical SQL.
 const upgraded=join(temp,'upgraded-migrations');await mkdir(upgraded);
 for(const file of await readdir(join(old,'database/migrations')))if(file.endsWith('.sql'))await copyFile(join(old,'database/migrations',file),join(upgraded,file));
 for(const file of await readdir('database/migrations'))if(file.endsWith('.sql')&&Number(file.slice(0,4))>12)await copyFile(join('database/migrations',file),join(upgraded,file));
 await runMigrations(pool,upgraded);await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:'synthetic-rollback-admin',displayName:'Synthetic',password:'Synthetic-2026'});
 const actor=await loadExistingBootstrapActor(pool,'synthetic-rollback-admin');const order=await createSalesOrder(pool,{creationSource:'manual'});
 await pool.query("UPDATE sales_order_command_control SET mode='frozen',reason='Synthetic compatible rollback pause',version=version+1 WHERE singleton");
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row=>row.tablename as string);
 const snapshot=async()=>Promise.all(tables.map(async table=>{assert.match(table,/^[a-z_]+$/);return (await pool.query('SELECT to_jsonb(x) row FROM '+table+' x ORDER BY to_jsonb(x)::text')).rows;}));
 const before=await snapshot();
 await t.test('build and run the exact old source, not a hand-written imitation of its writer',async()=>{
  await run(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'-p','server/tsconfig.json'],{cwd:old,timeout:120000,windowsHide:true,maxBuffer:4*1024*1024});
  const checker=join(old,'check-schema.mjs');
  await writeFile(checker,"import pg from 'pg'; import {verifyMigrationsCurrent} from './dist/server/server/db/migration-runner.js'; const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}); try {await verifyMigrationsCurrent(pool,process.env.ZHIXU_MIGRATIONS_DIR); process.exitCode=2;} catch(error) {process.stdout.write(String(error.message));} finally {await pool.end();}",'utf8');
  const environment:NodeJS.ProcessEnv={...process.env,NODE_ENV:'test',DATABASE_URL:pool.options.connectionString,ZHIXU_MIGRATIONS_DIR:join(old,'database/migrations'),ZHIXU_IDENTITY_MODE:'session',ZHIXU_ATTACHMENT_STORAGE:'disabled',ZHIXU_AINUOKE_SOURCE_READ:'disabled',ZHIXU_ALLOWED_ORIGINS:'http://127.0.0.1',ZHIXU_SERVER_HOST:'127.0.0.1',ZHIXU_SERVER_PORT:'31991',ZHIXU_ADMIN_USERNAME:'synthetic-must-not-bootstrap',ZHIXU_ADMIN_PASSWORD:''};
  const checked=await run(process.execPath,[checker],{cwd:old,env:environment,timeout:30000,windowsHide:true,encoding:'utf8'});assert.match(checked.stdout,/Applied migration 14 .* is missing from the migration directory/);
  let failure:unknown;
  try{await run(process.execPath,[join(old,'dist/server/server/index.js')],{cwd:old,env:environment,timeout:30000,windowsHide:true,encoding:'utf8'});}catch(error){failure=error;}
  assert.ok(failure);const stopped=failure as {code?:number;stdout?:string;stderr?:string;killed?:boolean};assert.equal(stopped.code,1);assert.notEqual(stopped.killed,true);assert.equal((stopped.stdout??'').includes('server_listening'),false);
  const event=JSON.parse((stopped.stderr??'').trim());assert.equal(event.event,'server_startup_failed');assert.equal(event.code,'startup_preflight_failed');
  assert.deepEqual(await snapshot(),before);assert.equal((await pool.query("SELECT count(*)::int n FROM app_users WHERE username='synthetic-must-not-bootstrap'")).rows[0].n,0);
 });
 await t.test('the compatible forward bundle remains verifiable and frozen reads retain every identity',async()=>{
  assert.equal((await verifyMigrationsCurrent(pool,upgraded)).pending.length,0);
  assert.equal((await readOrderCommandState(pool,actor,'frozen')).mode,'frozen');
  const orders=await listSalesOrders(pool,{limit:20,offset:0,includeHistorical:true});assert.equal(orders.total,1);assert.equal(orders.items[0].id,order.id);
  assert.deepEqual(await snapshot(),before);
 });
});

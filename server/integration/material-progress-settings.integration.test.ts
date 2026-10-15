import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {startContinuousFixture} from './ainuoke-continuous-fixture.js';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations,discoverMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {readMaterialProgressSettings} from '../material-progress-settings/service.js';
import {TEAM_ROLES} from '../auth/team-roles.js';

test('team material settings use trusted permissions, CAS and immutable idempotency on disposable PG',{timeout:180000},async t=>{
 const x=await startContinuousFixture(resolve('dist/client'));const cookies=await Promise.all(x.users.map(user=>x.login(user)));
 const call=(index:number,method='GET',body?:unknown,headers:Record<string,string>={})=>fetch(x.base+'/api/v1/material-progress-settings',{method,headers:{Cookie:cookies[index],Origin:x.base,'X-Zhixu-Request':'1','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const command=(version:number,keywords:string[])=>({requestId:randomUUID(),expectedVersion:version,trimPriorityKeywords:keywords});
 const counts=async()=> (await x.pool.query("SELECT (SELECT count(*)::int FROM material_progress_settings) settings,(SELECT count(*)::int FROM material_progress_setting_commands) commands,(SELECT count(*)::int FROM operation_logs WHERE entity_type='MaterialProgressSettings') logs")).rows[0];
 try{
  await t.test('all seven roles read one unconfigured state without creating rows or exposing source/quote data',async()=>{
   for(let index=0;index<x.users.length;index++){const response=await call(index);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/no-store/);const state=await response.json();assert.equal(state.version,0);assert.equal(state.configured,false);assert.deepEqual(state.trimPriorityKeywords,[]);assert.equal(state.canEdit,index===0||index===3);assert.doesNotMatch(JSON.stringify(state),/rawFields|sourceReferences|confirmedSale|confirmedLabor|password/);}
   assert.deepEqual(await counts(),{settings:0,commands:0,logs:0});
  });
  await t.test('only admin and material presets receive the bounded setting permission',async()=>{
   const roles=(await x.pool.query("SELECT role_id FROM app_role_permissions WHERE permission_key='style_progress.settings.edit' ORDER BY role_id")).rows.map(row=>row.role_id);
   assert.deepEqual(roles,['role-server-admin','role-team-material-manager']);
   for(const index of [1,2,4,5,6])assert.equal((await call(index,'PUT',command(0,['线']),{'X-Role':'admin'})).status,403);
   assert.deepEqual(await counts(),{settings:0,commands:0,logs:0});
   const material=TEAM_ROLES.find(role=>role.id==='role-team-material-manager')!;
   assert.equal(material.permissions.includes('commercial.sale.view'),false);assert.equal(material.permissions.includes('commercial.labor.view'),false);assert.equal(material.permissions.includes('ainuoke.sync'),false);assert.equal(material.permissions.includes('style_progress.edit'),false);
  });
  await t.test('authentication, Origin and trusted request boundary cannot be forged',async()=>{
   assert.equal((await fetch(x.base+'/api/v1/material-progress-settings')).status,401);
   assert.equal((await call(0,'PUT',command(0,['线']),{Origin:'https://outside.invalid'})).status,403);
   assert.equal((await call(0,'PUT',command(0,['线']),{'X-Zhixu-Request':'0'})).status,403);
   assert.equal((await call(0,'POST',command(0,['线']))).status,405);
  });
  let first:ReturnType<typeof command>;
  await t.test('material manager saves a single team version and retry after a lost response returns the same result',async()=>{
   first=command(0,[' 线 ','拉链']);const initial=await call(3,'PUT',first);assert.equal(initial.status,200);const saved=await initial.json();assert.equal(saved.settings.version,1);assert.deepEqual(saved.settings.trimPriorityKeywords,['线','拉链']);assert.equal(saved.replayed,false);
   const retry=await call(3,'PUT',first);assert.equal(retry.status,200);const replay=await retry.json();assert.equal(replay.replayed,true);assert.equal(replay.appliedVersion,1);assert.equal(replay.settings.version,1);
   assert.deepEqual(await counts(),{settings:1,commands:1,logs:1});
   for(const index of [0,1,2,4,5,6])assert.deepEqual((await(await call(index)).json()).trimPriorityKeywords,['线','拉链']);
  });
  await t.test('idempotency is actor-bound and changed payload cannot reuse a request identity',async()=>{
   assert.equal((await call(0,'PUT',first)).status,409);
   assert.equal((await call(3,'PUT',{...first,trimPriorityKeywords:['纽扣']})).status,409);
   assert.deepEqual(await counts(),{settings:1,commands:1,logs:1});
  });
  await t.test('two authorized people racing the same version yield one winner, then a concurrent exact retry writes once',async()=>{
   const racing=await Promise.all([call(0,'PUT',command(1,['线'])),call(3,'PUT',command(1,['拉链']))]);assert.deepEqual(racing.map(response=>response.status).sort(),[200,409]);
   assert.equal((await(await call(0)).json()).version,2);assert.deepEqual(await counts(),{settings:1,commands:2,logs:2});
   const same=command(2,['纽扣']);const retried=await Promise.all([call(3,'PUT',same),call(3,'PUT',same)]);assert.deepEqual(retried.map(response=>response.status),[200,200]);const results=await Promise.all(retried.map(response=>response.json()));assert.deepEqual(results.map(row=>row.replayed).sort(),[false,true]);assert.ok(results.every(row=>row.appliedVersion===3));assert.deepEqual(await counts(),{settings:1,commands:3,logs:3});
  });
  await t.test('malformed lists, fake actor fields and stale versions do not alter configuration or receipts',async()=>{
   const bad=[{...command(3,['线']),role:'admin'},{...command(3,['线']),actorId:'forged'},{...command(3,['线']),requestId:'wrong'},command(3,['ＡＢＣ','abc']),command(3,['线\n']),command(3,['字'.repeat(41)]),command(3,Array(51).fill('线')),{...command(3,['线']),expectedVersion:-1}];
   for(const body of bad)assert.equal((await call(0,'PUT',body)).status,400);
   assert.equal((await call(0,'PUT',command(2,['线']))).status,409);assert.deepEqual(await counts(),{settings:1,commands:3,logs:3});
  });
  await t.test('a no-op save records its request but does not add a revision or audit change',async()=>{
   const response=await call(0,'PUT',command(3,['纽扣']));assert.equal(response.status,200);const result=await response.json();assert.equal(result.changed,false);assert.equal(result.appliedVersion,3);assert.deepEqual(await counts(),{settings:1,commands:4,logs:3});
  });
  await t.test('permissions are rechecked on an existing session and a revoked writer cannot replay a receipt',async()=>{
   await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-team-material-manager' AND permission_key='style_progress.settings.edit'");
   try{assert.equal((await call(3,'PUT',first)).status,403);assert.equal((await(await call(3)).json()).canEdit,false);assert.deepEqual(await counts(),{settings:1,commands:4,logs:3});}
   finally{await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-team-material-manager','style_progress.settings.edit')");}
  });
  await t.test('audit failure atomically rolls back the preference and command receipt',async()=>{
   await x.pool.query("CREATE FUNCTION fail_progress_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-audit-unavailable-marker'; END; $$; CREATE TRIGGER fail_progress_audit BEFORE INSERT ON operation_logs FOR EACH ROW WHEN (NEW.entity_type='MaterialProgressSettings') EXECUTE FUNCTION fail_progress_audit();");
   try{const response=await call(0,'PUT',command(3,['线']));assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/synthetic-audit-unavailable-marker/);assert.equal((await(await call(0)).json()).version,3);assert.deepEqual(await counts(),{settings:1,commands:4,logs:3});}
   finally{await x.pool.query('DROP TRIGGER fail_progress_audit ON operation_logs; DROP FUNCTION fail_progress_audit();');}
  });
  await t.test('ordinary SQL cannot rewrite request history or store malformed list shapes',async()=>{
   await assert.rejects(x.pool.query('UPDATE material_progress_setting_commands SET payload_hash=$1',['b'.repeat(64)]),(error:unknown)=>(error as {code:string}).code==='23514');
   await assert.rejects(x.pool.query('DELETE FROM material_progress_setting_commands'),(error:unknown)=>(error as {code:string}).code==='23514');
   await assert.rejects(x.pool.query("UPDATE material_progress_settings SET trim_priority_keywords='[null]'::jsonb"),(error:unknown)=>(error as {code:string}).code==='23514');
   assert.deepEqual(await counts(),{settings:1,commands:4,logs:3});
  });
 }finally{await x.close();}
});

test('0024 upgrades only the explicitly approved permission and leaves business/account membership empty or unchanged',{timeout:180000},async()=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('progress_settings_upgrade')});
 const directory=await mkdtemp(join(tmpdir(),'zhixu-material-settings-upgrade-'));
 try{
  const migrations=await discoverMigrations(resolve('database/migrations'));
  for(const migration of migrations.filter(item=>Number(item.version)<=23))await writeFile(join(directory,migration.filename),migration.sql);
  await runMigrations(pool,directory);await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:'synthetic-upgrade-admin',displayName:'合成升级管理员',password:'Synthetic-Upgrade-Only-2026'});
  await pool.query("INSERT INTO app_roles(id,name,description) VALUES('role-team-material-manager','物控经理','old preset'),('custom-material-label','物控经理（自定义）','not a preset')");
  const material=TEAM_ROLES.find(role=>role.id==='role-team-material-manager')!;
  await pool.query('INSERT INTO app_role_permissions(role_id,permission_key) SELECT $1,unnest($2::text[])',['role-team-material-manager',material.permissions.filter(key=>key!=='style_progress.settings.edit')]);
  await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('custom-material-label','order.view')");
  await pool.query("DELETE FROM app_role_permissions WHERE permission_key='style_progress.settings.edit'; DELETE FROM app_permissions WHERE key='style_progress.settings.edit'");
  const actor=await loadExistingBootstrapActor(pool,'synthetic-upgrade-admin');const usersBefore=(await pool.query('SELECT id,public_id,username,display_name,role,active FROM app_users ORDER BY id')).rows;const membershipBefore=(await pool.query('SELECT * FROM app_user_roles ORDER BY user_id,role_id')).rows;
  await assert.rejects(readMaterialProgressSettings(pool,actor),(error:unknown)=>(error as {code:string}).code==='material_progress_settings_unavailable');
  const result=await runMigrations(pool,resolve('database/migrations'));assert.deepEqual(result.applied,['0024_material_progress_settings.sql']);
  assert.deepEqual((await pool.query("SELECT role_id FROM app_role_permissions WHERE permission_key='style_progress.settings.edit' ORDER BY role_id")).rows.map(row=>row.role_id),['role-server-admin','role-team-material-manager']);
  assert.deepEqual((await pool.query('SELECT id,public_id,username,display_name,role,active FROM app_users ORDER BY id')).rows,usersBefore);assert.deepEqual((await pool.query('SELECT * FROM app_user_roles ORDER BY user_id,role_id')).rows,membershipBefore);
  assert.equal((await pool.query('SELECT count(*)::int n FROM material_progress_settings')).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,0);
  assert.deepEqual((await pool.query("SELECT permission_key FROM app_role_permissions WHERE role_id='custom-material-label'")).rows,[{permission_key:'order.view'}]);
  assert.deepEqual((await readMaterialProgressSettings(pool,actor)).trimPriorityKeywords,[]);assert.equal((await readMaterialProgressSettings(pool,actor)).canEdit,true);
  assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,[]);
 }finally{await pool.end();await db.stop();const owned=relative(resolve(tmpdir()),resolve(directory));if(!owned||owned.startsWith('..')||isAbsolute(owned)||!owned.startsWith('zhixu-material-settings-upgrade-'))throw Error('unsafe temporary directory');await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

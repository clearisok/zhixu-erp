import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations,verifyMigrationsCurrent} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {captureSource,boundOrders} from '../ainuoke-source/service.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import {selectLegacyStorage,copySelectedRows,sqlName} from '../ainuoke-source/storage-selection.js';
import {convertSelectedStorage} from '../ainuoke-source/storage-conversion.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';

test('selective schema-0060 restore preserves business JSON precision, FK closure and current source; converts only selected history',{timeout:180000},async()=>{
 const db=await startDisposablePostgres(),sourceUrl=await db.createDatabase('storage_selection_source'),admin=new pg.Pool({connectionString:db.adminUrl,max:1});
 const targetName='issue174_selected_test_'+randomUUID().replaceAll('-','');await admin.query(`CREATE DATABASE ${targetName}`);
 const targetUrl=new URL(sourceUrl);targetUrl.pathname='/'+targetName;
 const sourcePool=new pg.Pool({connectionString:sourceUrl,max:3}),targetPool=new pg.Pool({connectionString:targetUrl.toString(),max:3});
 const fixture=await mkdtemp(join(tmpdir(),'issue174-schema60-'));
 const restore=(section:string)=>{
  const sql=execFileSync('docker',['exec',db.containerName,'pg_dump','-U','postgres','--schema-only','--section='+section,'--no-owner','--no-acl',new URL(sourceUrl).pathname.slice(1)],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,timeout:30000});
  const result=spawnSync('docker',['exec','-i',db.containerName,'psql','-X','-q','-U','postgres','-d',targetName,'-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,timeout:30000});
  assert.equal(result.status,0,result.stderr);
 };
 try{
  for(const file of await readdir(resolve('database/migrations')))if(/^\d{4}_.*\.sql$/.test(file)&&file.slice(0,4)<='0060')await copyFile(resolve('database/migrations',file),join(fixture,file));
  await runMigrations(sourcePool,fixture);await synchronizePermissionCatalog(sourcePool);
  await bootstrapAdmin(sourcePool,{username:selectedConfig.operatorUsername,displayName:'Selective restore',password:'synthetic-selection-test'});
  const actor=await loadExistingBootstrapActor(sourcePool,selectedConfig.operatorUsername),sourceKey=selectedConfig.sourceKey,fp=accountFingerprint(selectedConfig);
  const selected=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  assert.ok(selected.result==='complete'&&selected.mode==='selected-bindings');
  await bindOrders(sourcePool,actor,{sourceKey,accountFingerprint:fp,selected:selectedContracts,expectedPreview:selected.preview.reviewHash,collect:async()=>selected.bundle});
  const targets=await boundOrders(sourcePool);
  for(let i=0;i<3;i++)await captureSource(sourcePool,actor,{sourceKey,accountFingerprint:fp,maxAgeMs:600000,collect:async()=>{
   const captured=await validateSelectedSourceOnce(selectedWorkerFixture('bound-materials'),selectedConfig,{mode:'bound-materials',targets});
   assert.ok(captured.result==='complete'&&captured.mode==='bound-materials');return captured.bundle;
  }});
  await sourcePool.query(`INSERT INTO operation_logs(id,operation_id,actor_user_id,actor_public_id,actor_name,module,action,entity_type,entity_id,after_data)
   VALUES($1,$1,$2,$3,'synthetic','test','precision','SalesOrder',$4,'{"exact":123456789012345678901234567890.123456789}'::jsonb)`,[randomUUID(),actor.internalUserId,actor.userId,targets[0].id]);
  restore('pre-data');
  const source=await sourcePool.connect(),target=await targetPool.connect();
  let selectedRuns=0;
  try{
   await assert.rejects(selectLegacyStorage(source),/read-only/);
   await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const tables=await selectLegacyStorage(source);selectedRuns=tables.get('ainuoke_source_runs')!.keep!.size;
   assert.ok(selectedRuns>=2&&selectedRuns<3,'current head and non-latest audit baseline preserved, unreferenced repeated capture omitted');
   await copySelectedRows(source,target,tables);
   for(const table of tables.values())if(table.keep===null){
    const query=`SELECT encode(digest(coalesce(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') AS hash FROM (SELECT encode(digest(to_jsonb(t)::text,'sha256'),'hex') h FROM public.${sqlName(table.name)} t) rows`;
    assert.equal((await target.query(query)).rows[0].hash,(await source.query(query)).rows[0].hash,table.name);
   }
   await source.query('COMMIT');
  }finally{source.release();target.release();}
  restore('post-data');await runMigrations(targetPool,resolve('database/migrations'));
  const conversion=await targetPool.connect();
  try{const outcome=await convertSelectedStorage(conversion,new Date());assert.equal(outcome.runs,selectedRuns);assert.equal(outcome.snapshots,selectedRuns*2);}
  finally{conversion.release();}
  await verifyMigrationsCurrent(targetPool,resolve('database/migrations'));
  const role=(await targetPool.query("SELECT count(*)::int n FROM pg_roles WHERE rolname='issue174_offline_converter'")).rows[0].n;assert.equal(role,0);
  await assert.rejects(targetPool.query('UPDATE ainuoke_source_runs SET discovery=discovery'),/immutable/);
  for(const order of targets){const view=await createOrderMaterialReader(createPersistedMaterialPorts(targetPool,{sourceKey,maxAgeMs:600000}))(actor,{salesOrderId:order.id});assert.equal(view.status,200);if(view.status===200)assert.equal(view.body.progress.sourceStatus,'ready');}
  const generations=(await targetPool.query('SELECT run_id::text FROM ainuoke_material_order_heads ORDER BY sales_order_id')).rows;
  await captureSource(targetPool,actor,{sourceKey,accountFingerprint:fp,maxAgeMs:600000,collect:async()=>{
   const captured=await validateSelectedSourceOnce(selectedWorkerFixture('bound-materials'),selectedConfig,{mode:'bound-materials',targets:await boundOrders(targetPool)});
   assert.ok(captured.result==='complete'&&captured.mode==='bound-materials');return captured.bundle;
  }});
  assert.equal((await targetPool.query('SELECT count(*)::int n FROM ainuoke_source_runs')).rows[0].n,selectedRuns,'first unchanged post-migration capture reuses the original business generations');
  assert.deepEqual((await targetPool.query('SELECT run_id::text FROM ainuoke_material_order_heads ORDER BY sales_order_id')).rows,generations);
  assert.ok((await targetPool.query('SELECT source_history_started_at FROM ainuoke_source_profiles')).rows[0].source_history_started_at);
  assert.equal((await targetPool.query("SELECT after_data->>'exact' AS value FROM operation_logs WHERE after_data ? 'exact'")).rows[0].value,'123456789012345678901234567890.123456789');
 }finally{
  await sourcePool.end();await targetPool.end();await admin.end();await db.stop();
  const allowed=resolve(tmpdir())+requireSeparator();if(!resolve(fixture).startsWith(allowed))throw new Error('temporary fixture path escaped its root');
  await rm(fixture,{recursive:true,force:true});
 }
});
function requireSeparator(){return process.platform==='win32'?'\\':'/';}

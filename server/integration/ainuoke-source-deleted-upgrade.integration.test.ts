import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations,verifyMigrationsCurrent} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {previewCatalog,publishCatalog} from '../ainuoke-source/catalog.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {freezeExistingPublicRows} from './legacy-row-snapshot-fixture.js';

test('0059→0060 preserves nonempty original rows; old invisible is unclassified until a new full pair confirms it',{timeout:180000},async()=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('lifecycle_upgrade')});
 const root=resolve(tmpdir()),prefix=await mkdtemp(join(root,'zhixu-lifecycle-prefix-'));
 try{
  for(const file of await readdir('database/migrations'))if(file.endsWith('.sql')&&Number(file.slice(0,4))<=59)await copyFile(join('database/migrations',file),join(prefix,file));
  await runMigrations(pool,prefix);await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'合成升级管理员',password:'Synthetic-Upgrade'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername),fingerprint=accountFingerprint(selectedConfig);
  const selected=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  assert.ok(selected.result==='complete'&&selected.mode==='selected-bindings');
  await bindOrders(pool,actor,{sourceKey:selectedConfig.sourceKey,accountFingerprint:fingerprint,selected:selectedContracts,expectedPreview:selected.preview.reviewHash,collect:async()=>selected.bundle});
  const publish=async(mutation:string)=>{
   const captured=await validateSelectedSourceOnce(selectedWorkerFixture('catalog-discovery',mutation,[]),selectedConfig,{mode:'catalog-discovery',contracts:[]});
   assert.ok(captured.result==='complete'&&captured.mode==='catalog-discovery');
   const checked=await previewCatalog(captured.bundle);
   return publishCatalog(pool,actor,{sourceKey:selectedConfig.sourceKey,accountFingerprint:fingerprint,requestId:randomUUID(),input:checked.bundle,expectedHash:checked.contentHash});
  };
  await publish('');
  const removed=`if report == 6086103:
        mutate_rows(payload, lambda rows: rows.__setitem__(slice(None), [r for r in rows if r['id']!='1']))
        payload['dataCount']=2`;
  await publish(removed);
  const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(r=>r.tablename);
  const snapshot=await freezeExistingPublicRows(pool,tables),before=await snapshot();
  assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,['0060_ainuoke_contract_lifecycle.sql']);
  assert.deepEqual(await snapshot(),before);
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_contract_lifecycle_events')).rows[0].n,0);
  assert.deepEqual((await pool.query("SELECT visible,source_lifecycle_state FROM ainuoke_catalog_entries WHERE source_id='1'")).rows,[{visible:false,source_lifecycle_state:'present'}]);
  // Exactly the same normal capture/publication mechanism, no SQL backfill.
  await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery',removed,[]));
  assert.equal((await pool.query("SELECT source_lifecycle_state FROM ainuoke_catalog_entries WHERE source_id='1'")).rows[0].source_lifecycle_state,'source_deleted');
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,2);
  assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,[]);
  await verifyMigrationsCurrent(pool,resolve('database/migrations'));
 }finally{
  await pool.end();await db.stop();const distance=relative(root,resolve(prefix));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));await rm(prefix,{recursive:true});
 }
});

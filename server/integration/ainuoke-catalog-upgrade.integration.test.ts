import test from 'node:test';
import { freezeExistingPublicRows } from './legacy-row-snapshot-fixture.js';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations,verifyMigrationsCurrent} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {captureSource,boundOrders} from '../ainuoke-source/service.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {NORMALIZATION_REFERENCES,normalizationReferences} from '../sales-orders/normalization-preview.js';
import {createQuoteDraft} from '../../features/quote-center/model/quote-view-model.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createQuoteService} from '../quotes/service.js';

test('0053/0054 forward upgrade preserves nonempty legacy data and initializes per-order pointers without activating IO',{timeout:180000},async()=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('catalog_upgrade')});
 const tempRoot=realpathSync.native(tmpdir()),prefix=await mkdtemp(join(tempRoot,'zhixu-catalog-prefix-'));
 try{
  for(const file of await readdir('database/migrations'))if(file.endsWith('.sql')&&Number(file.slice(0,4))<=52)await copyFile(join('database/migrations',file),join(prefix,file));
  await runMigrations(pool,prefix);await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'合成升级管理员',password:'Synthetic-Upgrade'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername),scope={sourceKey:selectedConfig.sourceKey,accountFingerprint:accountFingerprint(selectedConfig)};
  const boundInput=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  assert.ok(boundInput.result==='complete'&&boundInput.mode==='selected-bindings');
  const bound=await bindOrders(pool,actor,{...scope,selected:selectedContracts,expectedPreview:boundInput.preview.reviewHash,collect:async()=>boundInput.bundle});
  const materials=await validateSelectedSourceOnce(selectedWorkerFixture('selected-materials'),selectedConfig,{mode:'selected-materials',targets:await boundOrders(pool)});assert.ok(materials.result==='complete'&&materials.mode==='selected-materials');
  await captureSource(pool,actor,{...scope,maxAgeMs:600000,collect:async()=>materials.bundle});
  await createQuoteService(pool).createAggregate(quoteSnapshotFromBrowser(createQuoteDraft('synthetic-catalog-upgrade','QT-UPGRADE','2026-11-02')));
  const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(r=>r.tablename);
  const snapshot=await freezeExistingPublicRows(pool,tables);
  const before=await snapshot(),reader=createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey:scope.sourceKey,maxAgeMs:600000})),oldView=await reader(actor,{salesOrderId:bound.orderIds[0]});
  assert.equal(oldView.status,200);if(oldView.status===200)assert.equal(oldView.body.progress.sourceStatus,'ready');
  assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,['0053_ainuoke_catalog_followup.sql','0054_ainuoke_catalog_receipts.sql','0055_ainuoke_shared_catalog_evidence.sql','0056_ainuoke_sync_attempt_recovery.sql','0057_ainuoke_catalog_scan_checkpoints.sql']);
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await reader(actor,{salesOrderId:bound.orderIds[0]}),oldView);
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_material_order_heads')).rows[0].n,2);
  for(const table of ['ainuoke_sync_controls','ainuoke_sync_jobs','ainuoke_catalog_entries'])assert.equal((await pool.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
  const c=await pool.connect();try{assert.equal((await normalizationReferences(c)).filter(([table])=>['ainuoke_material_order_heads','ainuoke_order_followups'].includes(table)).length,2);}finally{c.release();}
  const foreign=(await pool.query("SELECT c.relname AS table_name,a.attname AS column_name FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid CROSS JOIN LATERAL unnest(f.conkey) k(attnum) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE f.contype='f' AND f.confrelid='sales_orders'::regclass")).rows;
  assert.deepEqual(foreign.filter(r=>!NORMALIZATION_REFERENCES.some(([table,column])=>table===r.table_name&&column===r.column_name)),[]);
  assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,[]);await verifyMigrationsCurrent(pool,resolve('database/migrations'));
 }finally{await pool.end();await db.stop();const distance=relative(tempRoot,resolve(prefix));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));await rm(prefix,{recursive:true});}
});

test('legacy row snapshots permit new columns while detecting changes or loss of original data',async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('frozen_columns')});
 t.after(async()=>{try{await pool.end();}finally{await db.stop();}});
 await pool.query("CREATE TABLE retained_rows(id integer PRIMARY KEY, name text, quantity numeric); INSERT INTO retained_rows VALUES(1,'original',12.50)");
 const snapshot=await freezeExistingPublicRows(pool,['retained_rows']),before=await snapshot();
 await pool.query("ALTER TABLE retained_rows ADD COLUMN new_namespace text DEFAULT 'new value'");
 assert.deepEqual(await snapshot(),before);
 await pool.query("UPDATE retained_rows SET name='changed'");assert.notDeepEqual(await snapshot(),before);
 await pool.query("UPDATE retained_rows SET name='original'; INSERT INTO retained_rows(id,name,quantity) VALUES(2,'additional',1)");
 assert.notDeepEqual(await snapshot(),before);
 await pool.query('DELETE FROM retained_rows WHERE id=2');assert.deepEqual(await snapshot(),before);
 await pool.query('DELETE FROM retained_rows');assert.notDeepEqual(await snapshot(),before);
 await pool.query('ALTER TABLE retained_rows DROP COLUMN quantity');await assert.rejects(()=>snapshot(),{code:'42703'});
 await assert.rejects(()=>freezeExistingPublicRows(pool,['retained_rows;DROP TABLE retained_rows']),/snapshot_identifier_invalid/);
});

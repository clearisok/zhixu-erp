import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {refreshFollowupGroup} from '../ainuoke-source/group-refresh.js';
import {planFollowupGroups} from '../ainuoke-source/followup.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {hydrateSharedPages} from '../ainuoke-source/shared-content.js';
import {hash} from '../ainuoke-source/contract.js';

test('storage v2 retains A-B-A events, shares bodies, confirms unchanged generations and rejects damaged/scoped evidence',{timeout:180000},async()=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('storage_v2'),max:4});
 try{
  await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'Storage test',password:'synthetic-storage-test'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername),sourceKey=selectedConfig.sourceKey;
  const selected=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  assert.ok(selected.result==='complete'&&selected.mode==='selected-bindings');
  await bindOrders(pool,actor,{sourceKey,accountFingerprint:accountFingerprint(selectedConfig),selected:selectedContracts,expectedPreview:selected.preview.reviewHash,collect:async()=>selected.bundle});
  const group=(await planFollowupGroups(pool,actor,sourceKey,1)).groups[0];
  const capture=async(mutation='')=>refreshFollowupGroup(pool,actor,selectedConfig,{contracts:group.contracts as string[],expectedScopeHash:group.scopeHash,requestId:randomUUID()},
   async()=>selectedWorkerFixture('bound-materials',mutation,group.contracts as string[]));
  const counts=async()=> (await pool.query(`SELECT (SELECT count(*)::int FROM ainuoke_source_runs) runs,(SELECT count(*)::int FROM ainuoke_contract_contents) bodies`)).rows[0];
  await capture();const first=await counts();assert.deepEqual(first,{runs:1,bodies:1});
  const initial=(await pool.query('SELECT * FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[group.orderIds[0]])).rows[0];
  await capture();assert.deepEqual(await counts(),first);
  const unchanged=(await pool.query('SELECT * FROM ainuoke_material_order_heads WHERE sales_order_id=$1',[group.orderIds[0]])).rows[0];
  assert.equal(unchanged.run_id,initial.run_id);assert.ok(unchanged.last_verified_at>=initial.last_verified_at);
  const progress=await createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey,maxAgeMs:600000}))(actor,{salesOrderId:group.orderIds[0]});
  assert.equal(progress.status,200);if(progress.status===200)assert.equal(progress.body.progress.sourceStatus,'ready');
  await capture("if report == 6087050: mutate_rows(payload, lambda rows: rows[0].update({'TotalNum': '116.50'}))");
  assert.deepEqual(await counts(),{runs:2,bodies:2});
  await capture();assert.deepEqual(await counts(),{runs:3,bodies:2});
  const snapshots=(await pool.query(`SELECT s.*,r.source_key FROM ainuoke_material_source_snapshots s JOIN ainuoke_source_runs r ON r.id=s.run_id ORDER BY r.created_at`)).rows;
  assert.equal(snapshots[0].material_content_id,snapshots[2].material_content_id);
  assert.notEqual(snapshots[0].run_id,snapshots[2].run_id);
  for(const snapshot of snapshots)assert.equal(hash(await hydrateSharedPages(pool,sourceKey,snapshot.snapshots,{kind:'materials',contract:snapshot.sales_contract_no})),snapshot.content_hash);
  const damaged=structuredClone(snapshots[0].snapshots);damaged[0].manifest[0].ordinals[0]=999999;
  await assert.rejects(hydrateSharedPages(pool,sourceKey,damaged),/content_manifest_invalid/);
  await assert.rejects(hydrateSharedPages(pool,sourceKey,snapshots[0].snapshots,{contract:'OTHER-CONTRACT'}),/content_integrity_failure/);
  await assert.rejects(pool.query('UPDATE ainuoke_contract_contents SET body=body WHERE id=$1',[snapshots[0].material_content_id]),/immutable/);
  const allTables=(await pool.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n;
  assert.equal(allTables,147);
 }finally{await pool.end();await db.stop();}
});

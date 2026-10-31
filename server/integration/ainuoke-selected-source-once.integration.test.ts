import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {addOrders,previewAdditions,readBoundIdentities} from '../ainuoke-source/additions.js';
import type {AdditionBundle} from '../ainuoke-source/additions.js';
import {refreshBoundMaterialsOnce} from '../ainuoke-source/bounded-material-refresh.js';
import {boundOrders,captureSource} from '../ainuoke-source/service.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';

test('bounded synthetic worker feeds existing atomic binding and persisted four-stream reader',{timeout:120000},async t=>{
  const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('selected_source_once')});
  try {
    await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
    await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'Synthetic Selected Once',password:'Synthetic-Selected-Only'});
    const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername);
    const result=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
    assert.ok(result.result==='complete'&&result.mode==='selected-bindings');
    const count=async(table:string)=>(await pool.query('SELECT count(*)::int n FROM '+table)).rows[0].n;
    const options={sourceKey:selectedConfig.sourceKey,accountFingerprint:accountFingerprint(selectedConfig),selected:selectedContracts,
      expectedPreview:result.preview.reviewHash,collect:async()=>result.bundle};
    await t.test('preview is DB-free; changed review is atomic; concurrent same contract does not duplicate',async()=>{
      assert.equal(await count('sales_orders'),0);
      await assert.rejects(bindOrders(pool,actor,{...options,expectedPreview:'0'.repeat(64)}),/binding_preview_changed/);
      assert.equal(await count('sales_orders'),0);
      const both=await Promise.all([bindOrders(pool,actor,options),bindOrders(pool,actor,options)]);
      assert.equal(both.reduce((n,r)=>n+r.created,0),2);assert.equal(await count('sales_orders'),2);
      assert.equal(await count('ainuoke_source_profiles'),1);assert.equal(await count('quote_center_quotes'),0);
    });
    await t.test('trusted DB scope, original four quantities and source price-independent reads persist',async()=>{
      const targets=await boundOrders(pool);assert.equal(targets.length,2);
      const material=await validateSelectedSourceOnce(selectedWorkerFixture('selected-materials'),selectedConfig,{mode:'selected-materials',targets});
      assert.ok(material.result==='complete'&&material.mode==='selected-materials');
      await assert.rejects(captureSource(pool,actor,{sourceKey:options.sourceKey,accountFingerprint:'f'.repeat(64),maxAgeMs:600000,
        collect:async()=>material.bundle}),/source_account_mismatch/);
      assert.equal(await count('ainuoke_source_runs'),0);
      const captured=await captureSource(pool,actor,{sourceKey:options.sourceKey,accountFingerprint:options.accountFingerprint,maxAgeMs:600000,
        collect:async contracts=>{assert.deepEqual([...contracts].sort(),selectedContracts);return material.bundle;}});
      assert.equal(captured.orders,2);assert.equal(await count('ainuoke_material_source_snapshots'),2);
      const reader=createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey:options.sourceKey,maxAgeMs:600000}));
      for(const target of targets){
        const view=await reader(actor,{salesOrderId:target.id});assert.equal(view.status,200);
        if(view.status===200){
          assert.equal(view.body.progress.sourceStatus,'ready');
          for(const stream of ['purchases','inbounds','shipments','outbounds'] as const)assert.ok(view.body.progress.rows.some(row=>row[stream].length===1));
          const raw:Record<string,unknown>=material.bundle.materials[target.salesContractNo!][0].rows[0].values;
          assert.equal(raw.TotalNum,'115.50');assert.equal(raw.cgnum,118);assert.equal(raw.num_dyc,1);
        }
      }
      assert.equal(await count('ainuoke_payment_source_targets'),0);assert.equal(await count('ainuoke_payment_snapshots'),0);
    });
    await t.test('third bound order refreshes atomically; scope and malformed captures preserve accepted generation',async()=>{
      const third='SYN-SALES-3',contracts=[...selectedContracts,third];
      const raw=selectedWorkerFixture('selected-bindings','',[selectedContracts[0],third]) as {bundle:AdditionBundle};
      delete raw.bundle.colors[selectedContracts[0]];
      const preview=await previewAdditions(raw.bundle,[third],await readBoundIdentities(pool));
      await addOrders(pool,actor,{sourceKey:options.sourceKey,accountFingerprint:options.accountFingerprint,
        selected:[third],expectedPreview:preview.reviewHash,collect:async()=>raw.bundle});
      let calls=0;
      const collect=async()=>{calls++;return selectedWorkerFixture('bound-materials','',contracts);};
      const profilesBefore=await count('ainuoke_source_profiles');
      await assert.rejects(refreshBoundMaterialsOnce(pool,actor,{...selectedConfig,sourceKey:'nonexistent-source'},contracts,collect),/source_account_mismatch/);
      assert.equal(calls,0);assert.equal(await count('ainuoke_source_profiles'),profilesBefore);
      await assert.rejects(captureSource(pool,actor,{sourceKey:'nonexistent-source',accountFingerprint:options.accountFingerprint,
        maxAgeMs:600000,requireExistingProfile:true,collect:async()=>{calls++;return {};}}),/source_account_mismatch/);
      assert.equal(calls,0);assert.equal(await count('ainuoke_source_profiles'),profilesBefore);
      await pool.query('INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)',['profile-without-binding',options.accountFingerprint]);
      await assert.rejects(refreshBoundMaterialsOnce(pool,actor,{...selectedConfig,sourceKey:'profile-without-binding'},contracts,collect),/addition_requires_first_binding/);
      assert.equal(calls,0);assert.equal(await count('ainuoke_source_profiles'),profilesBefore+1);
      await assert.rejects(refreshBoundMaterialsOnce(pool,actor,selectedConfig,selectedContracts,collect),/bounded_material_scope_changed/);
      assert.equal(calls,0);assert.equal(await count('ainuoke_source_runs'),1);
      const result=await refreshBoundMaterialsOnce(pool,actor,selectedConfig,contracts,collect);
      assert.equal(result.orders,3);assert.equal(calls,1);assert.equal(result.metrics?.reportRequests,5);
      const latest=(await pool.query('SELECT latest_run_id::text id FROM ainuoke_source_profiles WHERE source_key=$1',[options.sourceKey])).rows[0].id;
      const acceptedRuns=await count('ainuoke_source_runs');
      await assert.rejects(refreshBoundMaterialsOnce(pool,actor,selectedConfig,contracts,async()=>
        selectedWorkerFixture('bound-materials',"if report == 6087050: mutate_rows(payload, lambda rows: rows[0].update({'ExpContractNo': 'SYN-SALES-99'}))",contracts)),/selected_source_row_scope_mismatch/);
      assert.equal(await count('ainuoke_source_runs'),acceptedRuns);
      assert.equal((await pool.query('SELECT latest_run_id::text id FROM ainuoke_source_profiles WHERE source_key=$1',[options.sourceKey])).rows[0].id,latest);
      await assert.rejects(refreshBoundMaterialsOnce(pool,actor,selectedConfig,contracts,async()=>{
        const snapshot=selectedWorkerFixture('bound-materials','',contracts);
        await pool.query('UPDATE sales_orders SET version=version+1 WHERE id=$1',(await boundOrders(pool)).slice(0,1).map(r=>r.id));
        return snapshot;
      }),/source_order_changed/);
      assert.equal(await count('ainuoke_source_runs'),acceptedRuns);
      assert.equal((await pool.query('SELECT latest_run_id::text id FROM ainuoke_source_profiles WHERE source_key=$1',[options.sourceKey])).rows[0].id,latest);
      assert.equal(await count('sales_orders'),3);assert.equal(await count('quote_center_quotes'),0);
      assert.equal(await count('ainuoke_payment_source_targets'),0);assert.equal(await count('ainuoke_payment_snapshots'),0);
      assert.equal(await count('sales_order_commercial_versions'),0);assert.equal(await count('production_schedule_assignments'),0);
    });
  } finally {await pool.end();await db.stop();}
});

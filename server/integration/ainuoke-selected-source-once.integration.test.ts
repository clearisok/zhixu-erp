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
  } finally {await pool.end();await db.stop();}
});

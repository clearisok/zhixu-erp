import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {startContinuousFixture} from './ainuoke-continuous-fixture.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {buildAinuokeMaterialApiPreview} from '../../features/style-progress/service/ainuoke-material-api-preview.js';
import {materialConfirmationEvidence,type MaterialConfirmation} from '../../features/ainuoke-material-progress/confirmed-facts.js';

test('explicit reviewed confirmations use persisted identity, survive batch reads, and never write source or business facts',{timeout:120000},async()=>{
 const x=await startContinuousFixture(resolve('dist/client'),{orderAlerts:true});
 try{
  const actor=await loadExistingBootstrapActor(x.pool,x.users[0]);
  const records=async()=> (await x.pool.query('SELECT snapshots,content_hash FROM ainuoke_material_source_snapshots ORDER BY run_id,sales_order_id')).rows;
  const before=await records(),pipeline=buildAinuokeMaterialApiPreview({snapshots:before[0].snapshots}).pipeline;
  const demand=pipeline.demands.find(d=>d.materialCode==='SYNTHETIC-MAT-ready')!;
  const receipt:MaterialConfirmation={id:'synthetic-unit-confirmation',salesContractNo:demand.salesContractNo,demandId:demand.id,
   evidenceKey:materialConfirmationEvidence(demand,pipeline.rawRows.filter(r=>r.normalizedDemandId===demand.id)),
   confirmedBy:'synthetic-human',confirmedAt:'2026-10-14T00:00:00Z',evidenceReference:'synthetic-private-receipt',unit:{value:'个',acceptedSourceUnits:[null],ratio:1}};
  const review={sourceKey:'synthetic-demo',accountFingerprint:'a'.repeat(64),byOrder:new Map([[x.orderId,[receipt]]])};
  assert.throws(()=>createPersistedMaterialPorts(x.pool,{sourceKey:'wrong-source',maxAgeMs:1800000},Date.now,review),/confirmation_source_mismatch/);
  const wrongAccount=createPersistedMaterialPorts(x.pool,{sourceKey:'synthetic-demo',maxAgeMs:1800000},Date.now,{...review,accountFingerprint:'b'.repeat(64)});
  for(const ports of [wrongAccount,await wrongAccount.prepareBatch!(actor,[x.orderId])])assert.equal((await createOrderMaterialReader(ports)(actor,{salesOrderId:x.orderId})).status,503);
  const ports=createPersistedMaterialPorts(x.pool,{sourceKey:'synthetic-demo',maxAgeMs:1800000},Date.now,review);
  receipt.unit!.value='changed-after-construction';
  review.sourceKey='changed-after-construction';review.accountFingerprint='c'.repeat(64);
  for(const p of [ports,await ports.prepareBatch!(actor,[x.orderId])]){
   const result=await createOrderMaterialReader(p)(actor,{salesOrderId:x.orderId});assert.equal(result.status,200);
   if(result.status!==200)throw Error('reader failed');
   const row=result.body.progress.rows.find(r=>r.demand.id===demand.id)!;
   assert.equal(row.unitOrigin,'confirmed');assert.equal(row.unit,'个');assert.deepEqual(row.sourceUnits,[null]);
   assert.doesNotMatch(JSON.stringify(result.body),/synthetic-human|synthetic-private-receipt|evidenceKey/);
  }
  assert.deepEqual(await records(),before);
  const defaultResult=await createOrderMaterialReader(createPersistedMaterialPorts(x.pool,{sourceKey:'synthetic-demo',maxAgeMs:1800000}))(actor,{salesOrderId:x.orderId});
  assert.equal(defaultResult.status,200);if(defaultResult.status===200)assert.equal(defaultResult.body.progress.rows.find(r=>r.demand.id===demand.id)!.unit,null);
  await x.capture();
  const changed=await createOrderMaterialReader(ports)(actor,{salesOrderId:x.orderId});assert.equal(changed.status,200);
  if(changed.status===200){const row=changed.body.progress.rows.find(r=>r.demand.id===demand.id)!;assert.equal(row.unit,null);assert.equal(row.confirmationStatus,'stale');}
  await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='ainuoke.view'");
  assert.notEqual((await createOrderMaterialReader(ports)(actor,{salesOrderId:x.orderId})).status,200);
 }finally{await x.close();}
});

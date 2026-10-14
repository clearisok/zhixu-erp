import assert from 'node:assert/strict';
import test from 'node:test';
import {projectMaterialProgress,filterProgressRows} from '../features/ainuoke-material-progress/projection.ts';
import {materialConfirmationEvidence} from '../features/ainuoke-material-progress/confirmed-facts.ts';
import {buildAinuokeMaterialApiPreview} from '../features/style-progress/service/ainuoke-material-api-preview.ts';
import {createSyntheticMaterialSource,syntheticOrder} from '../features/ainuoke-material-progress/synthetic-source.ts';
import {createOrderMaterialReader} from '../features/ainuoke-material-progress/read-service.ts';
const pages=()=>createSyntheticMaterialSource();
const source=(p,code='ready')=>p[0].rows.find(r=>r.values.GoodsNo==='SYNTHETIC-MAT-'+code);
const row=(v,code='ready')=>v.rows.find(r=>r.demand.materialCode==='SYNTHETIC-MAT-'+code);
function receipt(p,code='ready',extra={unit:{value:'个',acceptedSourceUnits:[null],ratio:1}}){
 const pipeline=buildAinuokeMaterialApiPreview({snapshots:p}).pipeline;
 const demand=pipeline.demands.find(r=>r.materialCode==='SYNTHETIC-MAT-'+code);
 return {id:'synthetic-confirmation',salesContractNo:syntheticOrder.salesContractNo,demandId:demand.id,
  confirmedBy:'synthetic-operator',confirmedAt:'2026-10-14T00:00:00Z',evidenceReference:'synthetic-human-receipt',
  evidenceKey:materialConfirmationEvidence(demand,pipeline.rawRows.filter(r=>r.normalizedDemandId===demand.id)),...extra};
}
const project=(p,f=[])=>projectMaterialProgress(syntheticOrder,p,f);
test('missing unit stays raw null; exact confirmation supplies display unit without mutating quantities or snapshots',()=>{
 const p=pages();source(p).values.QtyUnit=null;source(p).values.TotalNum=115.5;source(p).values.cgnum=118;
 const original=structuredClone(p),f=receipt(p),r=row(project(p,[f]));
 assert.equal(r.unit,'个');assert.equal(r.unitOrigin,'confirmed');assert.deepEqual(r.sourceUnits,[null]);
 assert.equal(r.demand.requiredQuantity,115.5);assert.equal(r.purchased,118);assert.equal(r.purchaseExcess,2.5);
 assert.deepEqual(p,original);assert.equal(row(project(p)).unit,null);
});
test('two paid purchases remain distinct after scoped 1:1 unit confirmation; no inference of production usability',()=>{
 const p=pages(),a=source(p);a.values.QtyUnit='只';
 const b=structuredClone(a);b.sourceRowIdentity='6087050:sha256:synthetic-confirmed-repurchase';b.values.QtyUnit='个';b.values.cgdh='PO-SYNTHETIC-SECOND';b.values.rkdh='IN-SYNTHETIC-SECOND';p[0].rows.push(b);p[0].total++;
 const f=receipt(p,'ready',{unit:{value:'个',acceptedSourceUnits:['只','个'],ratio:1}}),r=row(project(p,[f]));
 assert.equal(r.purchases.length,2);assert.equal(r.purchased,200);assert.equal(r.demand.requiredQuantity,100);assert.equal(r.unitStatus,'known');assert.equal(r.status,null);
 assert.deepEqual(new Set(r.sourceUnits),new Set(['只','个']));assert.equal(row(project(p)).unitStatus,'conflict');
});
test('unconfirmed blank units never default to pieces and unknown quantities never become zero',()=>{
 const p=pages();source(p,'unknown').values.QtyUnit=null;const f=receipt(p,'unknown');const r=row(project(p,[f]),'unknown');
 assert.equal(r.unit,'个');assert.equal(r.purchased,null);assert.equal(r.status,null);assert.equal(row(project(p),'unknown').unit,null);
});
test('factory responsibility retains source self-purchase, demand and events but leaves guomao pending counts',()=>{
 const p=pages(),f=receipt(p,'unknown',{procurementResponsibility:'factory'});const before=project(p),after=project(p,[f]),r=row(after,'unknown');
 assert.equal(r.demand.supplyMethod,'自购');assert.equal(r.demand.requiredQuantity,100);assert.equal(r.purchased,null);assert.equal(r.status,null);
 assert.equal(r.procurementResponsibility,'factory_confirmed');assert.equal(after.summary.trim.demands,before.summary.trim.demands-1);assert.equal(after.summary.trim.unknown,before.summary.trim.unknown-1);
 assert.equal(row(after,'unbought').procurementResponsibility,'guomao');assert.equal(after.rows.length,before.rows.length);assert.ok(!filterProgressRows(after,'','all','unknown').some(x=>x.demand.id===r.demand.id));
});
test('wrong contract, wrong demand, stale evidence, conflicting receipts and missing audit metadata cannot apply',()=>{
 for(const change of [f=>f.salesContractNo='SC-OTHER',f=>f.demandId='other',f=>f.evidenceKey+='changed',f=>f.confirmedBy='',f=>f.confirmedAt='invalid',f=>f.evidenceReference='',f=>f.unit.ratio=2,f=>f.unit.acceptedSourceUnits=['个'],f=>f.unit.value=' ']){
  const p=pages();source(p).values.QtyUnit=null;const f=receipt(p);change(f);const r=row(project(p,[f]));assert.equal(r.unit,null);assert.notEqual(r.confirmationStatus,'applied');
 }
 const p=pages();source(p).values.QtyUnit=null;const f=receipt(p);assert.equal(row(project(p,[f,{...f,id:'other'}])).confirmationStatus,'stale');
});
test('source unit, supplier method, material specification and new purchase identity invalidate prior confirmation',()=>{
 for(const values of [{QtyUnit:'米'},{SupplyType:'其他'},{CnComposition:'changed-spec'},{cgdh:'PO-NEW'}]){
  const p=pages();source(p).values.QtyUnit=null;const f=receipt(p);Object.assign(source(p).values,values);const r=row(project(p,[f]));assert.notEqual(r.unitOrigin,'confirmed');assert.notEqual(r.confirmationStatus,'applied');
 }
});
test('duplicate joined rows and new movement do not remove a reviewed unit or duplicate its purchase event',()=>{
 const p=pages();source(p).values.QtyUnit=null;const f=receipt(p);source(p).values.rknum=105;
 const copy=structuredClone(source(p));copy.sourceRowIdentity='6087050:sha256:synthetic-confirmed-second-join';p[0].rows.push(copy);p[0].total++;
 const r=row(project(p,[f]));assert.equal(r.unitOrigin,'confirmed');assert.equal(r.purchases.length,1);assert.equal(r.purchased,100);assert.equal(r.inbound,105);
});
test('trusted reader alone loads confirmation after scope/source checks; requests cannot inject confirmations',async()=>{
 const id='aaaaaaaa-1111-4111-8111-111111111111',identity={userId:id,internalUserId:'1',permissions:['order.view','style_progress.read']};
 const p=pages();source(p).values.QtyUnit=null;let reads=0;const f=receipt(p);
 const reader=createOrderMaterialReader({resolveVisibleOrder:async()=>({id,version:1,...syntheticOrder}),loadSource:async()=>({salesOrderId:id,salesContractNo:syntheticOrder.salesContractNo,provenance:'synthetic',snapshots:p}),loadConfirmations:async()=>{reads++;return[f];}});
 assert.equal((await reader(null,{salesOrderId:id})).status,401);assert.equal((await reader({...identity,permissions:[]},{salesOrderId:id})).status,403);
 assert.equal((await reader(identity,{salesOrderId:id,confirmations:[f]})).status,400);assert.equal(reads,0);
 const result=await reader(identity,{salesOrderId:id});assert.equal(result.status,200);assert.equal(row(result.body.progress).unitOrigin,'confirmed');
 assert.doesNotMatch(JSON.stringify(result.body),/synthetic-operator|synthetic-human-receipt|evidenceKey|confirmedBy/);
});

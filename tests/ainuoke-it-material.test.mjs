import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {projectMaterialProgress} from '../features/ainuoke-material-progress/projection.ts';
import {adaptAinuokeMaterialApiSnapshots} from '../features/style-progress/source/ainuoke-material-api-adapter.ts';
import {buildAinuokeMaterialApiPreview} from '../features/style-progress/service/ainuoke-material-api-preview.ts';
import {toAinuokeMaterialImportPreview} from '../features/style-progress/service/ainuoke-material-api-commit.ts';
const at='2026-11-06T08:00:00.000Z';
const order={salesContractNo:'SYN-IT-1',styleNo:'NEW',insideOrderNo:'NEW-1'};
export const itRows=()=>[418.7,349.3,213].map((quantity,i)=>({id:35776,ExpContractNo:'SYN-IT-1',insideorderno:'OLD-1',styleno:'OLD',
  lx:'面料',GoodsNo:'SYN-FABRIC',CnName:'合成面料',CnColor:'紫',StyleColor:'紫',StyleNum:1000,TotalNum:937,
  cgid:6031,cgmxid:31711,cgdh:'SYN-PO',cgnum:952,cgprice:70.5,goodsamount:67116,CurrencyName:'RMB',
  rkid:8919,rkmxid:35631+i,rkdh:'SYN-IN',rknum:quantity,
  cyid:11471,cymxid:85212+i,cydh:'SYN-SHIP',CYNum:quantity,ckid:4909,ckmxid:38220+i,ckdh:'SYN-OUT',OutStoreNum:quantity}));
export function page(reportId,rows,queryContext={salesContractNo:'SYN-IT-1'}){
  return {schemaVersion:'ainuoke-direct-read.v2',reportId,fetchedAt:at,page:1,pageSize:50,total:rows.length,queryContext,
    snapshotHash:'synthetic',rows:rows.map(values=>({sourceRowIdentity:reportId+':sha256:'+createHash('sha256').update(JSON.stringify(values)).digest('hex'),values}))};
}
const main=(rows=itRows())=>page('6087051',rows);
test('IT uses row facts only: one demand, one purchase, three different inbound details',()=>{
  const p=main();p.headerTotals={TotalNum:999999,cgnum:5780,rknum:999999};p.sum={goodsamount:416534};
  const result=buildAinuokeMaterialApiPreview({snapshots:[p]});
  assert.equal(result.pipeline.demands.length,1);assert.equal(result.pipeline.demands[0].requiredQuantity,937);
  assert.equal(result.pipeline.purchaseEvents.length,1);assert.equal(result.pipeline.purchaseEvents[0].quantity,952);
  assert.equal(result.pipeline.inboundEvents.length,3);assert.equal(result.pipeline.inboundEvents.reduce((n,e)=>n+e.quantity,0),981);
  assert.equal(JSON.stringify(result).includes('999999'),false);
  const view=projectMaterialProgress(order,[p]);assert.equal(view.sourceStatus,'ready');
  assert.equal(view.insideOrderDrift,false);assert.equal(view.rows[0].status,null);assert.equal(view.rows[0].purchased,null);
});
test('equal quantities with different detail IDs remain separate',()=>{
  const a=itRows()[0],b={...a,cgmxid:31714,rkmxid:35699};
  const result=buildAinuokeMaterialApiPreview({snapshots:[main([a,b])]});
  assert.equal(result.pipeline.purchaseEvents.length,2);assert.equal(result.pipeline.inboundEvents.length,2);
});
test('same demand/event identity with contradictory facts is not accepted',()=>{
  for(const change of [{rknum:999},{cgnum:999},{TotalNum:999},{CurrencyName:'USD'},{cgid:9},{SupplierName:'OTHER'}]) {
    const a=itRows()[0];assert.equal(projectMaterialProgress(order,[main([a,{...a,...change}])]).sourceStatus,'incomplete');
  }
});

test('an unverified main-table unit cannot certify demand or transaction totals',()=>{
  const view=projectMaterialProgress(order,[main(itRows().map(row=>({...row,QtyUnit:'米'})))]);
  assert.equal(view.sourceStatus,'ready');assert.equal(view.rows[0].unit,null);
  assert.equal(view.rows[0].purchased,null);assert.equal(view.rows[0].status,null);
});
test('distinct demands with otherwise identical facts do not collapse; shared transactions are unallocated',()=>{
  const a=itRows()[0],b={...a,id:35777};
  const result=adaptAinuokeMaterialApiSnapshots([main([a,b])]);assert.equal(result.rows.length,2);
  assert.ok(result.rows.every(row=>row.unallocatedFlows.includes('purchase')));
  const view=projectMaterialProgress(order,[main([a,b])]);assert.equal(view.rows.length,2);
  assert.ok(view.rows.every(row=>row.purchased===null&&row.issues.some(i=>i.includes('共享'))));
});
test('unit matches require independent entity, main ID, document and quantity',()=>{
  const units=page('6086405',[{id:31711,PurContractID:6031,PurContractNo:'SYN-PO',OrderNum:952,QtyUnit:'千克'}],{insideOrderNo:'OLD-1'});
  const view=projectMaterialProgress(order,[main(),units]);
  assert.equal(view.sourceStatus,'ready');assert.equal(view.rows[0].purchases[0].unit,'千克');
  assert.equal(view.rows[0].unit,null);assert.equal(view.rows[0].status,null); // never infer demand/other flow units
  for(const change of [{PurContractID:1},{OrderNum:951},{PurContractNo:'OTHER'}]) {
    const bad=page('6086405',[{...units.rows[0].values,...change}],{insideOrderNo:'OLD-1'});
    assert.equal(projectMaterialProgress(order,[main(),bad]).rows[0].purchases[0].unitMatchStatus,'conflict');
  }
});
test('unit conflicts and missing unit stay unknown; no material-name guessing',()=>{
  const unit={id:31711,PurContractID:6031,PurContractNo:'SYN-PO',OrderNum:952,QtyUnit:'千克'};
  for(const rows of [[unit,{...unit,QtyUnit:'米'}],[{...unit,QtyUnit:null}],[{...unit,id:88888}]]) {
    const view=projectMaterialProgress(order,[main(),page('6086405',rows,{insideOrderNo:'OLD-1'})]);
    assert.equal(view.rows[0].purchases[0].unit,null);
  }
});
test('outdated, unrelated or incomplete supplementary evidence cannot enter the read model',()=>{
  const unit=page('6086405',[],{insideOrderNo:'OLD-1'});
  for(const change of [{fetchedAt:'2026-11-01T00:00:00Z'},{queryContext:{insideOrderNo:'OTHER'}},{total:2}]) {
    assert.equal(projectMaterialProgress(order,[main(),{...unit,...change}]).sourceStatus,'incomplete');
  }
});
test('mixed contracts and mixed source versions fail closed',()=>{
  assert.equal(projectMaterialProgress(order,[main([{...itRows()[0],ExpContractNo:'SYN-IT-10'}])]).sourceStatus,'identity_mismatch');
  assert.equal(projectMaterialProgress(order,[main(),page('6087050',itRows(),{insideOrderNo:'OLD-1'})]).sourceStatus,'incomplete');
});
test('missing transaction identity retains readable observation but no reliable sum',()=>{
  const row={...itRows()[0]};delete row.cgmxid;
  const view=projectMaterialProgress(order,[main([row])]);assert.equal(view.sourceStatus,'ready');
  assert.equal(view.rows[0].purchases[0].quantity,952);assert.equal(view.rows[0].purchased,null);
});
test('new Server source cannot be committed through old Browser import',()=>{
  assert.throws(()=>toAinuokeMaterialImportPreview(buildAinuokeMaterialApiPreview({snapshots:[main()]}),'synthetic'),/不受支持/);
});

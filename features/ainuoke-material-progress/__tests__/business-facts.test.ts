import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {projectMaterialProgress} from '../projection.ts';
import {businessTransactionCounts} from '../business-facts.ts';
import {adaptItMaterialSnapshots} from '../../style-progress/source/ainuoke-it-material-adapter.ts';
import type {AinuokeReportSnapshot} from '../../ainuoke-api/model/ainuoke-api.ts';

const at='2026-11-07T08:00:00Z',order={salesContractNo:'SYN-BUSINESS',styleNo:'SYN',insideOrderNo:'SYN'};
const base=()=>({id:1,lx:'面料',ExpContractNo:order.salesContractNo,insideorderno:'SYN',GoodsNo:'SYN-1',CnName:'合成面料',CnColor:'蓝',CnComposition:'合成规格',SupplyType:'自购',TotalNum:937,
  cgid:100,cgmxid:200,cgdh:'PO-SYN',cgnum:952,cgcnname:'合成面料',cgCnComposition:'合成规格',cgcncolor:'蓝',
  rkid:300,rkmxid:400,rkdh:'IN-SYN',rknum:981,cyid:500,cymxid:600,cydh:'SHIP-SYN',CYNum:900,ckid:700,ckmxid:800,ckdh:'OUT-SYN',OutStoreNum:880});
const page=(reportId:string,values:Record<string,unknown>[],queryContext:Record<string,string>={salesContractNo:order.salesContractNo}):AinuokeReportSnapshot=>({schemaVersion:'ainuoke-direct-read.v2',reportId,fetchedAt:at,page:1,pageSize:50,total:values.length,queryContext,snapshotHash:'synthetic',rows:values.map(values=>({sourceRowIdentity:reportId+':sha256:'+createHash('sha256').update(JSON.stringify(values)).digest('hex'),values}))} as AinuokeReportSnapshot);
const purchases=(unit='千克')=>page('6086405',[{id:200,PurContractID:100,PurContractNo:'PO-SYN',OrderNum:952,QtyUnit:unit}],{insideOrderNo:'SYN'});
const inbound=(unit='千克')=>page('6086875',[{id:400,MainID:300,FInStoreNo:'IN-SYN',Num:981,QtyUnit:unit}],{insideOrderNo:'SYN'});

test('real transaction quantities remain visible independently of an unverified demand unit',()=>{
  const row=projectMaterialProgress(order,[page('6087051',[base()]),purchases(),inbound()]).rows[0];
  assert.equal(row.unit,null);assert.equal(row.purchased,null); // legacy comparable-demand contract stays unchanged
  assert.equal(row.business?.flows.purchase.quantity,952);assert.equal(row.business?.flows.purchase.unit,'千克');
  assert.equal(row.business?.flows.inbound.quantity,981);assert.equal(row.business?.flows.inbound.unit,'千克');
  assert.equal(row.business?.pendingInbound.quantity,0);assert.equal(row.business?.pendingInbound.unit,'千克');
  assert.equal(row.business?.purchaseGap.quantity,null);assert.equal(row.business?.purchaseGap.reason,'demand_unit_missing');
  assert.equal(row.business?.flows.shipment.quantity,900);assert.equal(row.business?.flows.shipment.state,'unit_unknown');
  assert.equal(row.business?.flows.outbound.quantity,880);assert.equal(row.business?.flows.outbound.state,'unit_unknown');
  assert.equal(row.purchases[0].relation?.sourceDetailId,'200');assert.equal(row.demand.sourceDetailId,'1');
});

test('6086354 missing MainID requires every alternative identity and variant field',()=>{
  const raw={...base(),lx:'辅料'},candidate={id:400,Num:981,BillNo:'IN-SYN',QtyUnit:'米',InsideOrderNo:'SYN',PurContractNo:'PO-SYN',CnName:'合成面料',ProductSpec:'合成规格',CnColor:'蓝'};
  const view=(changes:Record<string,unknown>={})=>projectMaterialProgress(order,[page('6087051',[raw]),page('6086354',[{...candidate,...changes}],{insideOrderNo:'SYN'})]).rows[0];
  assert.equal(view().inbounds[0].unit,'米');
  for(const change of [{InsideOrderNo:'SYN-OTHER'},{PurContractNo:'OTHER'},{ProductSpec:'OTHER'},{CnColor:'红'},{CnName:'OTHER'},{MainID:999},{Num:980},{BillNo:'OTHER'},{id:401}]) assert.equal(view(change).inbounds[0].unit,null);
  const matched=adaptItMaterialSnapshots([page('6087051',[raw]),page('6086354',[candidate],{insideOrderNo:'SYN'})]);
  assert.equal(matched.rows[0].matchedUnits?.inbound?.basis,'detail_document_purchase_material');
});

test('one purchase expanded over three inbound batches is counted once; all distinct inbound IDs survive',()=>{
  const rows=[400,401,402].map((id,i)=>({...base(),rkmxid:id,rknum:[418.7,349.3,213][i]}));
  const units=page('6086875',rows.map(r=>({id:r.rkmxid,MainID:300,FInStoreNo:'IN-SYN',Num:r.rknum,QtyUnit:'千克'})),{insideOrderNo:'SYN'});
  const model=projectMaterialProgress(order,[page('6087051',rows),purchases(),units]);
  assert.equal(model.rows.length,1);assert.deepEqual(businessTransactionCounts(model.rows),{purchase:1,inbound:3,shipment:1,outbound:1});
  assert.equal(model.rows[0].business?.flows.purchase.quantity,952);assert.equal(model.rows[0].business?.flows.inbound.quantity,981);
  assert.deepEqual(projectMaterialProgress(order,[page('6087051',rows),purchases(),units]),model);
});

test('shared source transaction stays unallocated on both demands and is counted once for the order',()=>{
  const model=projectMaterialProgress(order,[page('6087051',[base(),{...base(),id:2}]),purchases(),inbound()]);
  assert.equal(model.rows.length,2);
  for(const row of model.rows){assert.equal(row.business?.flows.purchase.state,'allocation_pending');assert.equal(row.business?.flows.purchase.quantity,null);assert.deepEqual(row.purchases[0].relation?.relatedDemandIds,['1','2']);}
  assert.equal(businessTransactionCounts(model.rows).purchase,1);
});

test('mixed units, missing IDs and incomplete quantities cannot become a false total or zero',()=>{
  const raw1=base(),raw2={...base(),cgmxid:201,cgnum:10};
  const u=page('6086405',[{id:200,PurContractID:100,PurContractNo:'PO-SYN',OrderNum:952,QtyUnit:'米'},{id:201,PurContractID:100,PurContractNo:'PO-SYN',OrderNum:10,QtyUnit:'千克'}],{insideOrderNo:'SYN'});
  const mixed=projectMaterialProgress(order,[page('6087051',[raw1,raw2]),u]).rows[0];
  assert.equal(mixed.business?.flows.purchase.state,'mixed_units');assert.equal(mixed.business?.flows.purchase.quantity,null);
  const noId={...base(),cgmxid:null};const unidentified=projectMaterialProgress(order,[page('6087051',[noId])]).rows[0];
  assert.equal(unidentified.business?.flows.purchase.state,'unlinked');
  const missing=projectMaterialProgress(order,[page('6087051',[{...base(),cgnum:null}])]).rows[0];
  assert.equal(missing.business?.flows.purchase.state,'incomplete');assert.equal(missing.business?.flows.purchase.quantity,null);
  assert.equal(missing.unverifiedEvents?.[0].sourceDetailId,'200');assert.equal(businessTransactionCounts([missing]).purchase,1);
});

test('a complete demand without transactions and a complete empty source are normal distinct states',()=>{
  const raw={id:1,lx:'面料',ExpContractNo:order.salesContractNo,insideorderno:'SYN',GoodsNo:'SYN',CnName:'未采购物料',SupplyType:'自购',TotalNum:10};
  const demand=projectMaterialProgress(order,[page('6087051',[raw])]);assert.equal(demand.sourceStatus,'ready');assert.equal(demand.rows.length,1);assert.equal(demand.rows[0].business?.flows.purchase.state,'empty');
  const empty=projectMaterialProgress(order,[page('6087051',[])]);assert.equal(empty.sourceStatus,'ready');assert.equal(empty.rows.length,0);
});

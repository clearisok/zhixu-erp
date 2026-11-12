import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { ReadOnlyMaterialControlTower, purchaseDisplayUnit, filterBusinessMaterialRows } from '../material-control-tower-read-only';
import { PermissionProvider } from '@/features/permissions/components/permission-provider';
import { projectMaterialProgress } from '@/features/ainuoke-material-progress/projection';
import type { AinuokeReportSnapshot } from '@/features/ainuoke-api/model/ainuoke-api';

const order = { salesContractNo:'SYN-VIEW', styleNo:'SYN', insideOrderNo:'SYN' };
const page = (rows: Record<string,unknown>[]): AinuokeReportSnapshot => ({
  schemaVersion:'ainuoke-direct-read.v2', reportId:'6087051', fetchedAt:'2026-11-07T08:00:00Z',
  page:1,pageSize:50,total:rows.length,queryContext:{salesContractNo:order.salesContractNo},snapshotHash:'synthetic',
  rows:rows.map(values=>({sourceRowIdentity:'6087051:sha256:'+createHash('sha256').update(JSON.stringify(values)).digest('hex'),values})),
// The legacy default Snapshot generic describes inside-order reports. 7051
// really uses contract-only input; the projector validates this raw transport.
} as unknown as AinuokeReportSnapshot);
const demand = {id:1,lx:'面料',ExpContractNo:order.salesContractNo,insideorderno:'SYN',GoodsNo:'SYN-FABRIC',
  CnName:'合成同名物料',CnColor:'蓝',CnComposition:'测试规格',SupplyType:'自购',TotalNum:937,
  cgid:100,cgmxid:200,cgdh:'SYN-PO',cgnum:952,cgcnname:'合成同名物料',cgCnComposition:'测试规格',cgcncolor:'蓝'};
const html = (rows:Record<string,unknown>[]) => renderToStaticMarkup(createElement(PermissionProvider,null,
  createElement(ReadOnlyMaterialControlTower,{view:projectMaterialProgress(order,[page(rows)])})));

test('IT status filtering uses observed business states when readiness is intentionally unknown',()=>{
 const view=projectMaterialProgress(order,[page([demand,
  {...demand,id:2,cgmxid:null,cgdh:null,cgnum:null},
  {...demand,id:3,cgmxid:null,cgdh:null,cgnum:null,SupplyType:'厂供'},
  {...demand,id:4,cgmxid:204,rkid:304,rkmxid:404,rkdh:'SYN-IN',rknum:10}])]);
 assert.ok(view.rows.every(row=>row.status===null),'6087051 does not assert readiness');
 const before=JSON.stringify(view);
 for(const [state,sourceId] of [['已有采购','1'],['待采购','2'],['仅有需求','3'],['已有入库','4']] as const){
  const selected=filterBusinessMaterialRows(view,'','all',state);assert.equal(selected.length,1,state);assert.equal(selected[0].demand.sourceDetailId,sourceId);
 }
 assert.equal(filterBusinessMaterialRows(view,'不匹配','all','已有采购').length,0);
 assert.equal(filterBusinessMaterialRows(view,'','trim','已有采购').length,0);
 assert.equal(filterBusinessMaterialRows(view,'','all','all').length,4);
 assert.equal(JSON.stringify(view),before,'filter does not mutate source facts or quantity rules');
 const row=view.rows[0],facts=row.business!;
 row.business={...facts,flows:{...facts.flows,purchase:{...facts.flows.purchase,state:'unlinked'}}};
 assert.equal(filterBusinessMaterialRows(view,'','all','关联待核实')[0],row);
 row.business=facts;row.purchases[0].relation={...row.purchases[0].relation!,problems:['source specification differs']};
 assert.equal(filterBusinessMaterialRows(view,'','all','规格待核实')[0],row);
});

test('business table keeps self and factory rows separate and exposes actual quantities with unknown units',()=>{
  const markup=html([demand,{...demand,id:2,SupplyType:'厂供',TotalNum:580,cgmxid:null,cgdh:null,cgnum:null}]);
  const self=markup.indexOf('data-supply-scope="self"'),factory=markup.indexOf('data-supply-scope="factory"');
  assert.ok(self>=0);assert.equal(factory,-1,'factory records have their own view, never combined into default demand table');
  assert.ok(markup.includes('厂供记录'));const end=markup.indexOf('</section>',self);
  assert.match(markup.slice(self,end),/>937<\/button>/);
  assert.match(markup.slice(self,end),/>952<\/span>/); // source quantity survives unverified unit
  assert.doesNotMatch(markup.slice(self,end),/>580<\/button>/);
  assert.doesNotMatch(markup,/>580<\/button>/);
  for(const header of ['门幅','克重','多余仓','待入库','物料出运','显示列','紧凑模式','标准模式'])assert.ok(markup.includes(header));
  for(const phrase of ['单位以各行来源为准','来源值','38 项物料待核对','SERVER · MATERIAL'])assert.ok(!markup.includes(phrase));
  assert.ok(markup.includes('查看采购明细'));
});

test('no transaction and complete empty source use distinct normal business states',()=>{
  const markup=html([{...demand,cgmxid:null,cgdh:null,cgnum:null}]);
  assert.ok(markup.includes('待采购'));assert.ok(markup.includes('无记录'));
  assert.ok(!markup.includes('采购不足</th><td>0'));
  const empty=html([]);assert.ok(empty.includes('暂无物料需求'));assert.ok(empty.includes('业务尚未开始'));assert.equal((empty.match(/sp-business-empty-card/g)||[]).length,1);
});


test('dense view preserves all six source views and original business detail entry points',()=>{
 const markup=html([demand]);
 for(const label of ['物料总览 / 自购需求','厂供记录','采购明细','入库明细','出运明细','出库明细','来源与核实项','查看明细','收起全部','全部状态']) assert.ok(markup.includes(label),label);
 assert.match(markup,/data-density="compact"/);
 assert.equal((markup.match(/data-demand-id=/g)||[]).length,1);
 assert.equal((markup.match(/class="sp-dense-group"/g)||[]).length,1);
});


test('unconnected source is not represented by zero-count source views',()=>{
 const markup=renderToStaticMarkup(createElement(PermissionProvider,null,createElement(ReadOnlyMaterialControlTower,{view:projectMaterialProgress(order,null)})));
 assert.ok(markup.includes('物料尚未接入'));
 assert.ok(!markup.includes('>0<small>'));
 assert.ok(!markup.includes('>0</span>'));
 assert.ok(markup.includes('尚未取得完整来源，不能认定需求为零。'));
});

test('overview removes only approved columns and keeps the source footer after the table',()=>{
 const markup=html([demand]);
 assert.ok(!markup.includes('data-column="gap"'));assert.ok(!markup.includes('data-column="outbound"'));
 assert.ok(markup.includes('data-column="excess"'));assert.ok(markup.includes('data-column="shipment"'));
 assert.ok(markup.indexOf('sp-business-source')>markup.indexOf('</table>'));
 assert.ok(!markup.includes('data-column="name"'));assert.ok(markup.includes('sp-dense-group-actions'));
 assert.ok(markup.includes('出库明细'),'outbound detail view remains available');
});
test('procurement display unit does not change demand facts or choose a conflicted unit',()=>{
 const row=projectMaterialProgress(order,[page([demand])]).rows[0];const before=structuredClone(row);
 row.purchases[0].unit='千克';row.purchases[0].unitMatchStatus='matched';
 assert.equal(purchaseDisplayUnit(row).unit,'千克');assert.equal(row.unit,before.unit);assert.equal(row.purchaseShortfall,before.purchaseShortfall);
 row.purchases.push({...row.purchases[0],id:'synthetic-second',unit:'米',relation:{...row.purchases[0].relation!,sourceDetailId:'201'}});
 assert.equal(purchaseDisplayUnit(row).unit,null);assert.ok(purchaseDisplayUnit(row).reason.includes('不同单位'));
 row.purchases[1].unit=null;assert.equal(purchaseDisplayUnit(row).unit,null);
});

test('excess warehouse preserves explicit zero and missing values without increasing inbound',()=>{
 const raw={...demand,rkid:300,rkmxid:400,rkdh:'IN-SYN',rknum:12,num_dyc:0};
 const zero=html([raw]);assert.ok(zero.includes('sp-dense-excess'));assert.match(zero,/原字段 num_dyc[^>]*>0/);
 const duplicate=html([raw,raw]);assert.equal((duplicate.match(/原字段 num_dyc/g)||[]).length,1);
 const missing=html([{...raw,num_dyc:null}]);assert.ok(missing.includes('sp-dense-excess'));assert.doesNotMatch(missing,/原字段 num_dyc[^>]*>0/);
 const projected=projectMaterialProgress(order,[page([raw])]);assert.equal(projected.rows[0].inbounds[0].quantity,12);assert.equal(projected.rows[0].inbounds[0].excessWarehouse.includedInInbound,false);
});

test('overview has no material-name cells but preserves identity and group labels',()=>{
 const view=projectMaterialProgress(order,[page([demand])]);view.groups[0].name='不同的分组标题';
 const markup=renderToStaticMarkup(createElement(PermissionProvider,null,createElement(ReadOnlyMaterialControlTower,{view})));
 assert.ok(markup.includes('不同的分组标题'));assert.ok(markup.includes('aria-label="合成同名物料 · 蓝"'));assert.ok(!markup.includes('data-column="name"'));
 const header=markup.match(/<thead>(.*?)<\/thead>/)?.[1]||'';assert.ok(header.indexOf('data-column="color"')<header.indexOf('data-column="spec"'));
 assert.equal((markup.match(/data-column=/g)||[]).length,26,'13 headers plus 13 demand cells; no empty leading cell');
});

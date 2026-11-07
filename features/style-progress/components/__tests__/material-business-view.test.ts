import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { ReadOnlyMaterialControlTower } from '../material-control-tower-read-only';
import { PermissionProvider } from '@/features/permissions/components/permission-provider';
import { projectMaterialProgress } from '@/features/ainuoke-material-progress/projection';
import type { AinuokeReportSnapshot } from '@/features/ainuoke-api/model/ainuoke-api';

const order = { salesContractNo:'SYN-VIEW', styleNo:'SYN', insideOrderNo:'SYN' };
const page = (rows: Record<string,unknown>[]): AinuokeReportSnapshot => ({
  schemaVersion:'ainuoke-direct-read.v2', reportId:'6087051', fetchedAt:'2026-11-07T08:00:00Z',
  page:1,pageSize:50,total:rows.length,queryContext:{insideOrderNo:'SYN',salesContractNo:order.salesContractNo},snapshotHash:'synthetic',
  rows:rows.map(values=>({sourceRowIdentity:'6087051:sha256:'+createHash('sha256').update(JSON.stringify(values)).digest('hex'),values})),
} as AinuokeReportSnapshot);
const demand = {id:1,lx:'面料',ExpContractNo:order.salesContractNo,insideorderno:'SYN',GoodsNo:'SYN-FABRIC',
  CnName:'合成同名物料',CnColor:'蓝',CnComposition:'测试规格',SupplyType:'自购',TotalNum:937,
  cgid:100,cgmxid:200,cgdh:'SYN-PO',cgnum:952,cgcnname:'合成同名物料',cgCnComposition:'测试规格',cgcncolor:'蓝'};
const html = (rows:Record<string,unknown>[]) => renderToStaticMarkup(createElement(PermissionProvider,null,
  createElement(ReadOnlyMaterialControlTower,{view:projectMaterialProgress(order,[page(rows)])})));

test('business table keeps self and factory rows separate and exposes actual quantities with unknown units',()=>{
  const markup=html([demand,{...demand,id:2,SupplyType:'厂供',TotalNum:580,cgmxid:null,cgdh:null,cgnum:null}]);
  const self=markup.indexOf('data-supply-scope="self"'),factory=markup.indexOf('data-supply-scope="factory"');
  assert.ok(self>=0&&factory>self);
  assert.match(markup.slice(self,factory),/>937<\/button>/);
  assert.match(markup.slice(self,factory),/>952<\/span>/); // source quantity survives unverified unit
  assert.doesNotMatch(markup.slice(self,factory),/>580<\/button>/);
  assert.match(markup.slice(factory),/>580<\/button>/);
  for(const header of ['门幅','克重','采购不足','待入库','物料出运','物料出库','已落实数量','到货数量'])assert.ok(markup.includes(header));
  for(const phrase of ['单位以各行来源为准','来源值','38 项物料待核对','SERVER · MATERIAL'])assert.ok(!markup.includes(phrase));
  assert.ok(markup.includes('查看采购明细'));
});

test('no transaction and complete empty source use distinct normal business states',()=>{
  const markup=html([{...demand,cgmxid:null,cgdh:null,cgnum:null}]);
  assert.ok(markup.includes('待采购'));assert.ok(markup.includes('无记录'));
  assert.ok(!markup.includes('采购不足</th><td>0'));
  const empty=html([]);assert.ok(empty.includes('暂无物料需求'));assert.ok(empty.includes('业务尚未开始'));
});

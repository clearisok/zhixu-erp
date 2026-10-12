"use client";
import { useState } from 'react';
import { Card } from '@/components/foundation/card';
import { MaterialReadCard, MaterialReadTable } from './material-read-display';
import { filterProgressRows, type MaterialProgressView } from '@/features/ainuoke-material-progress/projection';
import { materialStateLabels } from '@/features/ainuoke-material-progress/order-material-summary';
const quantity=(n:number|null)=>n===null?'未知':String(n);
/** Existing Control Tower display structure, Source-only DTO, no planner/import/Browser providers. */
export function ReadOnlyMaterialControlTower({view}:{view:MaterialProgressView}) {
  const [search,setSearch]=useState('');const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const visible=new Set(filterProgressRows(view,search,'all','all').map(row=>row.demand.id));
  return <><Card className="sp-v4-filter"><input type="search" className="qc-control" aria-label="搜索物料" placeholder="搜索物料、颜色、规格、供应商、采购单号" value={search} onChange={e=>setSearch(e.target.value)}/><span>{view.rows.length} 个物料项 · 厂供排除 {view.factoryExcluded}</span></Card><p role="status">{view.message} · 来源读取 {view.fetchedAt??'—'}</p>
    <section className="sp-v4-material-list" aria-label="采购跟进物料">{view.groups.filter(g=>g.rows.some(r=>visible.has(r.demand.id))).map(group=><MaterialReadCard key={group.key} materialKey={group.key}>
      <div className="sp-v4-material-head"><button className="sp-v4-material-identity" aria-expanded={expanded.has(group.key)} onClick={()=>setExpanded(old=>{const next=new Set(old);if(next.has(group.key))next.delete(group.key);else next.add(group.key);return next;})}><span>{expanded.has(group.key)?'▾':'▸'}</span><div><strong>{group.name}</strong><small>{group.type==='fabric'?'面料':'辅料'} · {group.rows.length} 个颜色 / 明细</small></div></button><span>逐项数量，单位尚未确认</span></div>
      <MaterialReadTable headers={['颜色 / 规格','需求','采购','采购不足','入库','待入库','物料出运','物料出库','状态']} rows={group.rows.filter(r=>visible.has(r.demand.id)).map(r=>[`${r.demand.materialColor} / ${r.demand.specification}`,quantity(r.demand.requiredQuantity),quantity(r.purchased),quantity(r.purchaseShortfall),quantity(r.inbound),quantity(r.pendingInbound),quantity(r.shipped),quantity(r.outbound),r.status===null?'来源未知':materialStateLabels[r.status]])}/>
      {expanded.has(group.key)&&<div className="sp-v4-material-body">{group.rows.filter(r=>visible.has(r.demand.id)).map(row=><section key={row.demand.id}><h3>{row.demand.materialColor} · {row.demand.specification}</h3>
        <h4>采购事件</h4><MaterialReadTable headers={['采购单','日期','供应商','数量','来源单价','来源金额','币种']} rows={row.purchases.map(p=>[p.purchaseOrderNo,p.purchaseDate,p.supplier,String(p.quantity),p.sourcePricing.unitPrice===null?'未知':String(p.sourcePricing.unitPrice),p.sourcePricing.amount===null?'未知':String(p.sourcePricing.amount),p.sourcePricing.currency])}/>
        {([['入库',row.inbounds],['物料出运',row.shipments],['物料出库',row.outbounds]] as const).map(([label,events])=><section key={label}><h4>{label}事件</h4><MaterialReadTable headers={['单号','日期','数量']} rows={events.map(e=>[e.documentNo,e.eventDate,String(e.quantity)])}/></section>)}
        {row.issues.map(issue=><p key={issue}>{issue}</p>)}</section>)}</div>}
    </MaterialReadCard>)}</section>{!view.rows.length&&<Card>暂无可判定物料；未连接或异常来源不能视为零采购。</Card>}</>;
}

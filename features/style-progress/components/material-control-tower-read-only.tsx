"use client";

import { Fragment, useEffect, useImperativeHandle, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { Card } from '@/components/foundation/card';
import { Button } from '@/components/foundation/button';
import { Drawer } from '@/components/foundation/drawer';
import { filterProgressRows, materialSupplyScope, type MaterialProgressView, type ProgressRow, type ReadPurchase, type ReadMovement, type ReadInbound } from '@/features/ainuoke-material-progress/projection';
import { businessTransactionCounts, materialBusinessFacts, materialEventKey, type FlowQuantity, type MaterialFlow, type QuantityGap } from '@/features/ainuoke-material-progress/business-facts';
import { orderMaterialGroups } from '../model/material-display-order';
import { PaymentRequestsReadPanel } from './payment-requests-read-panel';

const number = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 9 }).format(value);
const text = (value: string | null | undefined) => value?.trim() || '未提供';
const flowLabels: Record<MaterialFlow, string> = { purchase: '采购', inbound: '入库', shipment: '出运', outbound: '出库' };
const flowFields = { purchase: 'purchases', inbound: 'inbounds', shipment: 'shipments', outbound: 'outbounds' } as const;
const tabs = [
  { key: 'material', label: '物料 / 需求' }, { key: 'arrivals', label: '到料计划' },
  { key: 'purchase', label: '采购明细' }, { key: 'inbound', label: '入库明细' },
  { key: 'shipment', label: '出运明细' }, { key: 'outbound', label: '出库明细' },
  { key: 'verification', label: '数据核实' }, { key: 'reconciliation', label: '对账' },
] as const;
type EventTab = typeof tabs[number]['key'];
type Selection = { kind: 'all' } | { kind: 'group'; key: string; scope: 'self' | 'factory' | 'unknown' } | { kind: 'row'; id: string };
type FlowEvent = ReadPurchase | (ReadMovement & { transportMode?: string });

function sourceStatus(view: MaterialProgressView): string | null {
  if (view.sourceStatus === 'ready') return view.insideOrderDrift ? '工厂款号有变化，请在详情核对。' : null;
  if (view.sourceStatus === 'source_failed') return view.fetchedAt ? '最近刷新未成功，保留上次成功数据。' : '最近刷新未成功，尚无可用物料数据。';
  if (view.sourceStatus === 'stale') return view.fetchedAt ? '当前显示历史数据，来源更新时间见本栏。' : '尚无可用物料数据。';
  return {
    not_fetched: '物料尚未同步。', not_connected: '物料尚未接入。',
    incomplete: '本次来源不完整，未替换上次成功数据。',
    identity_mismatch: '订单身份需要核实。', source_missing: '尚未取得这张合同的物料数据。',
  }[view.sourceStatus];
}
function date(value: string | null | undefined, full = false): string {
  if (!value) return '未提供';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    ...(full ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } as const : {}),
  }).format(timestamp);
}
function gapTitle(gap: QuantityGap): string {
  return {
    known: '', not_applicable: '不参与自购需求缺口计算', not_started: '尚无采购或入库记录',
    demand_unit_missing: '需求单位尚未核实，不能与采购数量比较',
    unit_mismatch: '需求或流水的计量单位不同，不能直接相减',
    association_pending: '明细关联、分配或数量尚未核实',
    variant_pending: '采购规格或颜色与需求不同，适用范围待核实',
  }[gap.reason];
}
function FlowValue({ fact, label, onClick }: { fact: FlowQuantity; label: string; onClick: () => void }) {
  if (fact.state === 'empty') return <span className="sp-business-empty">无记录</span>;
  const value = fact.quantity === null
    ? ({ mixed_units: '分单位', allocation_pending: '待分配', unlinked: '待关联', incomplete: '待核实', unit_unknown: '分笔查看', known: '待核实' } as const)[fact.state]
    : number(fact.quantity);
  return <button type="button" className="sp-business-quantity" aria-label={'查看' + label + '明细：' + value + (fact.unit || '')} onClick={onClick} title={fact.reasons.join('；') || '查看真实单据明细'}>
    <span>{value}{fact.unit && <small>{fact.unit}</small>}</span>
    {fact.state === 'unit_unknown' && <small className="sp-business-caution">单位待核实</small>}
  </button>;
}
function GapValue({ fact, onClick }: { fact: QuantityGap; onClick: () => void }) {
  if (fact.reason === 'not_started') return <span className="sp-business-empty">未开始</span>;
  if (fact.reason === 'not_applicable') return <span className="sp-business-empty">—</span>;
  return fact.quantity !== null
    ? <span className={fact.quantity > 0 ? 'sp-business-gap' : 'sp-business-zero'} title={fact.unit ?? undefined}>{number(fact.quantity)}{fact.unit && <small>{fact.unit}</small>}</span>
    : <button type="button" className="sp-business-pending" title={gapTitle(fact)} onClick={onClick}>待核实</button>;
}
function rowState(row: ProgressRow) {
  const facts = row.business ?? materialBusinessFacts(row);
  if (Object.values(facts.flows).some(flow => ['allocation_pending', 'unlinked', 'incomplete', 'mixed_units'].includes(flow.state))) return { label: '关联待核实', attention: true };
  if (row.purchases.some(event => event.relation?.problems.length)) return { label: '规格待核实', attention: true };
  if (row.inbounds.length) return { label: '已有入库', attention: false };
  if (row.purchases.length) return { label: '已有采购', attention: false };
  return { label: materialSupplyScope(row.demand) === 'self' ? '待采购' : '仅有需求', attention: false };
}
function uniqueEvents(rows: ProgressRow[], flow: MaterialFlow) {
  const entries = new Map<string, { row: ProgressRow; event: FlowEvent; demands: ProgressRow[] }>();
  for (const row of rows) for (const event of row[flowFields[flow]]) {
    const key = row.demand.materialType + ':' + materialEventKey(event);
    const existing = entries.get(key);
    if (existing) { if (!existing.demands.some(item => item.demand.id === row.demand.id)) existing.demands.push(row); }
    else entries.set(key, { row, event, demands: [row] });
  }
  return [...entries.values()];
}
function eventQuantity(event: FlowEvent, row: ProgressRow) {
  const unit = event.unit === undefined ? row.unit : event.unit;
  return <span className="sp-business-event-quantity">{number(event.quantity)} <small>{unit || '单位待核实'}</small></span>;
}
function EventTable({ rows, flow }: { rows: ProgressRow[]; flow: MaterialFlow }) {
  const entries = uniqueEvents(rows, flow);
  const unverified = [...new Map(rows.flatMap(row => (row.unverifiedEvents ?? []).filter(event => event.flow === flow).map(event => [row.demand.materialType + ':' + (event.sourceDetailId ?? row.demand.id), { row, event }] as const))).values()];
  return <div className="sp-business-event-list" data-flow={flow}>
    {!entries.length && !unverified.length && <p className="sp-business-no-events">这批需求没有{flowLabels[flow]}记录。</p>}
    {entries.length > 0 && <div className="sp-business-table-scroll" tabIndex={0} aria-label={flowLabels[flow] + '明细表，可横向滚动'}><table className="sp-business-event-table">
      <thead><tr><th>{flow === 'purchase' ? '物料 / 采购颜色' : '需求物料 / 颜色'}</th><th>{flow === 'purchase' ? '采购规格' : '需求规格'}</th><th>{flowLabels[flow]}单号</th>
        {flow === 'purchase' && <th>供应商</th>}<th>{flow === 'purchase' ? '采购日期' : '日期'}</th>
        {flow === 'purchase' && <th>交期</th>}<th className="numeric">数量</th>
        {flow === 'inbound' && <th className="numeric">多余仓</th>}
        {flow === 'purchase' && <><th className="numeric">单价</th><th>币种</th></>}
        {flow === 'shipment' && <th>运输方式</th>}{flow === 'outbound' && <th>业务类型</th>}<th>关联</th>
      </tr></thead><tbody>{entries.map(({ row, event, demands }) => {
        const purchase = event as ReadPurchase;
        return <tr key={row.demand.materialType + ':' + materialEventKey(event)}>
          <td><strong>{row.demand.materialName}</strong><small>{(flow === 'purchase' ? purchase.color : row.demand.materialColor) || '颜色未提供'}</small></td>
          <td>{flow === 'purchase' ? text(purchase.specification) : text(row.demand.specification)}</td>
          <td><strong>{flow === 'purchase' ? purchase.purchaseOrderNo : (event as ReadMovement).documentNo}</strong><small>明细 {event.relation?.sourceDetailId || '未提供'}</small></td>
          {flow === 'purchase' && <td>{text(purchase.supplier)}</td>}<td>{date(flow === 'purchase' ? purchase.purchaseDate : (event as ReadMovement).eventDate)}</td>
          {flow === 'purchase' && <td>{date(purchase.deliveryDate)}</td>}<td className="numeric">{eventQuantity(event, row)}</td>
          {flow === 'inbound' && <td className="numeric">{(() => {
            const fact = (event as ReadInbound).excessWarehouse;
            if (!fact) return '未取得';
            if (fact.quantity !== null) return <span>{number(fact.quantity)} {fact.unit || '单位待核实'}</span>;
            return fact.status === 'missing' ? '未提供' : '待核实';
          })()}</td>}
          {flow === 'purchase' && <><td className="numeric">{purchase.sourcePricing.unitPrice === null ? '未提供' : number(purchase.sourcePricing.unitPrice)}</td><td>{text(purchase.sourcePricing.currency)}</td></>}
          {flow === 'shipment' && <td>{({ Sea: '海运', Air: '空运' } as Record<string, string>)[(event as { transportMode: string }).transportMode] || text((event as { transportMode: string }).transportMode)}</td>}
          {flow === 'outbound' && <td>{text((event as ReadMovement).businessType)}</td>}
          <td>{event.relation?.status === 'shared' || demands.length > 1 ? <span className="sp-business-caution">关联 {event.relation?.relatedDemandIds.length || demands.length} 条需求，待分配</span> : event.relation?.status === 'unidentified' ? <span className="sp-business-caution">明细身份待核实</span> : '已关联'}
            {event.relation?.problems.map(problem => <small className="sp-business-caution" key={problem}>{problem}</small>)}
          </td>
        </tr>;
      })}</tbody></table></div>}
    {flow === 'inbound' && entries.length > 0 && <p className="sp-business-no-events">多余仓独立记录，不计入已入库。</p>}
    {unverified.length > 0 && <section className="sp-business-unverified"><h3>未能汇总的记录</h3>{unverified.map(({ row, event }, index) => <p key={index}>{row.demand.materialName} · {event.documentNo || '单号未提供'} · 明细 {event.sourceDetailId || '未提供'} · {event.quantity === null ? '数量未取得' : number(event.quantity)}：{event.reason}</p>)}</section>}
    {entries.length > 0 && <details className="sp-business-evidence"><summary>来源与关联依据</summary>
      <p>合同 {rows[0]?.demand.salesContractNo}；按各节点稳定明细编号保留流水，同一明细只展示一次。</p>
      <ul>{entries.map(({ row, event, demands }) => <li key={row.demand.materialType + ':' + materialEventKey(event)}>明细 {event.relation?.sourceDetailId || event.id} → 需求 {event.relation?.sourceDemandId || row.demand.sourceDetailId || '未提供'}；采购明细 {event.relation?.purchaseDetailId || '未提供'}；{demands.map(item => item.demand.materialColor || '颜色未提供').join('、')}</li>)}</ul>
    </details>}
  </div>;
}
function Verification({ rows, view }: { rows: ProgressRow[]; view: MaterialProgressView }) {
  return <div className="sp-business-verification">
    <p>来源更新时间：{date(view.fetchedAt, true)}（北京时间）</p>
    {sourceStatus(view) && <p>{sourceStatus(view)}</p>}
    {rows.map(row => {
      const facts = row.business ?? materialBusinessFacts(row);
      const issues = [...new Set([
        ...(!row.unit ? ['需求单位未提供，需求与采购差额待核实。'] : []),
        ...Object.values(facts.flows).flatMap(flow => flow.reasons),
        ...row.purchases.flatMap(event => event.relation?.problems ?? []),
        ...(row.unverifiedEvents ?? []).map(event => flowLabels[event.flow] + '：' + event.reason),
      ])];
      return <section key={row.demand.id}><h3>{row.demand.materialName} · {row.demand.materialColor || '颜色未提供'}</h3>
        <p>{text(row.demand.specification)} · {materialSupplyScope(row.demand) === 'factory' ? '厂供独立记录' : materialSupplyScope(row.demand) === 'self' ? '自购需求' : text(row.demand.supplyMethod)}</p>
        {issues.length ? <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p>当前已取得明细关联与计量单位。</p>}
        <details className="sp-business-evidence"><summary>需求来源与校验记录</summary><p>合同 {row.demand.salesContractNo} · 需求明细 {row.demand.sourceDetailId || row.demand.id} · 物料编码 {text(row.demand.materialCode)}</p>
          <p>需求数量 {number(row.demand.requiredQuantity)} · 单位 {row.unit || '未提供'}{row.unitOrigin === 'confirmed' ? '（经确认）' : ''} · 门幅 {text(row.demand.width)} · 克重 {text(row.demand.gsm)}</p>
          {row.issues.length > 0 && <ul>{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        </details>
      </section>;
    })}
  </div>;
}

const views = [{key:'self',label:'物料总览 / 自购需求'},{key:'factory',label:'厂供记录'},
  {key:'purchase',label:'采购明细'},{key:'inbound',label:'入库明细'},{key:'shipment',label:'出运明细'},{key:'outbound',label:'出库明细'}] as const;
type MainView = typeof views[number]['key'];
export type MaterialSourceHandle={open:()=>void};
const selfColumns = [
  ['color','颜色'],['spec','规格'],['width','门幅'],['gsm','克重'],['demand','需求数量'],['unit','单位'],
  ['purchase','已采购'],['inbound','已入库'],['pending','待入库'],['excess','多余仓'],['shipment','物料出运'],['state','状态'],['action','操作'],
] as const;
const factoryColumns = ([['name','物料名称'],...selfColumns] as const).filter(([key])=>!['width','gsm','pending','excess','shipment'].includes(key)).map(([key,label])=>[key,key==='demand'?'厂供数量':key==='purchase'?'已落实数量':key==='inbound'?'到货数量':label] as const);
const numericColumns = new Set(['demand','purchase','inbound','pending','excess','shipment']);
const preferenceKey='weaveops.material-display.v1';
/** Display preferences only. No order, source values, credentials or business state are persisted. */
function useDisplayPreferences(){
  const [density,setDensity]=useState<'compact'|'standard'>('compact'),[hidden,setHidden]=useState<string[]>([]);
  useEffect(()=>{let active=true;try{const saved=JSON.parse(localStorage.getItem(preferenceKey)||'null');
    if(saved)queueMicrotask(()=>{if(!active)return;if(['compact','standard'].includes(saved.density))setDensity(saved.density);
      if(Array.isArray(saved.hidden))setHidden(saved.hidden.filter((key:unknown)=>typeof key==='string'&&selfColumns.some(([k])=>k===key)&&key!=='color'&&key!=='action'));});
  }catch{/* Unavailable preference storage does not block the business page. */}return()=>{active=false;};},[]);
  const save=(nextDensity:typeof density,nextHidden:string[])=>{setDensity(nextDensity);setHidden(nextHidden);try{localStorage.setItem(preferenceKey,JSON.stringify({density:nextDensity,hidden:nextHidden}));}catch{}};
  return {density,hidden,setDensity:(next:typeof density)=>save(next,hidden),toggle:(key:string)=>save(density,hidden.includes(key)?hidden.filter(k=>k!==key):[...hidden,key]),reset:()=>save(density,[])};
}
/** Procurement unit is display-only. Never substitutes the demand unit used by calculations. */
export function purchaseDisplayUnit(row: ProgressRow): {unit:string|null; reason:string} {
  const events = row.purchases; // Unit disagreements must survive even duplicate source references.
  if (!events.length) return {unit:row.unit,reason:row.unit?'需求原始单位；尚无采购明细':'尚无可核实的采购单位'};
  const units = new Set(events.map(event=>event.unit===undefined?row.unit:event.unit).filter(Boolean));
  if (units.size>1 || events.some(event=>event.unitMatchStatus==='conflict')) return {unit:null,reason:'关联采购明细存在不同单位，保留各笔证据，请核实'};
  if (events.some(event=>!(event.unit===undefined?row.unit:event.unit) || event.relation?.status==='unidentified'
    || event.unitMatchStatus==='missing')) return {unit:null,reason:'部分采购单位或明细关联尚未核实'};
  return {unit:[...units][0]||null,reason:'来自已核实的关联采购明细；不推断需求或收发单位'};
}
function ExcessWarehouseValue({row,onClick}:{row:ProgressRow;onClick:()=>void}) {
  const entries=[...new Map(row.inbounds.map(event=>[materialEventKey(event),event])).values()];
  if (!entries.length) return <span className="sp-business-empty" title="来源未提供关联入库的多余仓记录，不代表数量为零">无记录</span>;
  return <div className="sp-dense-excess">{entries.map(event=>{
    const fact=event.excessWarehouse;
    return <button type="button" key={materialEventKey(event)} onClick={onClick} title={'入库明细 '+(event.relation?.sourceDetailId||event.id)+'；原字段 num_dyc；分笔保留，不累计入库'}>
      {fact?.quantity!=null?<>{number(fact.quantity)}{fact.unit&&<small> {fact.unit}</small>}{fact.status!=='known'&&<small className="sp-business-caution"> 单位待核实</small>}</>:fact?.status==='missing'?<span className="sp-business-empty">无记录</span>:<span className="sp-business-pending">待核实</span>}
    </button>;
  })}</div>;
}
/** Existing projection, per-node quantities, permission gates and arrival owner remain authoritative. */
export function ReadOnlyMaterialControlTower({ view, trimPriorityKeywords = [], settingsNotice, paymentScope, materialActions, materialPlan, sourcePanelRef }: {
  view: MaterialProgressView; trimPriorityKeywords?: readonly string[]; settingsNotice?: string; sourcePanelRef?:Ref<MaterialSourceHandle>;
  paymentScope?: { salesOrderId: string; identityKey: string };
  materialActions?: (key: string, name: string) => ReactNode; materialPlan?: (key: string) => ReactNode;
}) {
  const [search,setSearch]=useState(''),[status,setStatus]=useState<Parameters<typeof filterProgressRows>[3]>('all'),[type,setType]=useState<Parameters<typeof filterProgressRows>[2]>('all');
  const [mainView,setMainView]=useState<MainView>('self'),[collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const [selection,setSelection]=useState<Selection|null>(null),[tab,setTab]=useState<EventTab>('material');
  useImperativeHandle(sourcePanelRef,()=>({open:()=>{setSelection({kind:'all'});setTab('verification');}}),[]);
  const workspace=useRef<HTMLDivElement>(null);
  const display=useDisplayPreferences(),id=useId(),tabList=useRef<HTMLDivElement>(null),mainTabs=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const tables=workspace.current?.querySelectorAll<HTMLTableElement>('.sp-dense-table');
    const measure=()=>tables?.forEach(table=>{const width=table.querySelector<HTMLElement>('thead [data-column="action"]')?.getBoundingClientRect().width;
      if(width)table.style.setProperty('--sp-action-width',width+'px');});
    measure();if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);tables?.forEach(table=>observer.observe(table));return()=>observer.disconnect();
  },[mainView,display.hidden,display.density,search,type,status,collapsed]);
  const filtered=filterProgressRows(view,search,type,status),visible=new Set(filtered.map(row=>row.demand.id));
  const ordered=orderMaterialGroups(view.groups,trimPriorityKeywords),counts=businessTransactionCounts(view.rows);
  const selfRows=view.rows.filter(row=>materialSupplyScope(row.demand)==='self'),factoryRows=view.rows.filter(row=>materialSupplyScope(row.demand)==='factory');
  const selectedRows=!selection?[]:selection.kind==='all'?view.rows:selection.kind==='row'?view.rows.filter(row=>row.demand.id===selection.id):view.groups.find(group=>group.key===selection.key)?.rows.filter(row=>materialSupplyScope(row.demand)===selection.scope)??[];
  const selectedGroups=ordered.filter(group=>group.rows.some(row=>selectedRows.some(selected=>selected.demand.id===row.demand.id)));
  const selectedName=selection?.kind==='row'?selectedRows[0]?.demand.materialName:selection?.kind==='group'?view.groups.find(group=>group.key===selection.key)?.name:'全部物料';
  const notice=sourceStatus(view),hasCompleteFacts=view.sourceStatus==='ready'||Boolean(view.fetchedAt&&['stale','source_failed'].includes(view.sourceStatus));
  const open=(target:Selection,nextTab:EventTab)=>{setSelection(target);setTab(nextTab);};
  const selectTab=(index:number)=>{const next=(index+tabs.length)%tabs.length;setTab(tabs[next].key);tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();};
  const selectMain=(index:number)=>{const next=(index+views.length)%views.length;setMainView(views[next].key);mainTabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();};
  const allKeys=ordered.flatMap(group=>(['self','factory','unknown'] as const).filter(scope=>group.rows.some(row=>materialSupplyScope(row.demand)===scope)).map(scope=>scope+':'+group.key));
  const allCollapsed=allKeys.length>0&&allKeys.every(key=>collapsed.has(key));
  const toggle=(key:string)=>setCollapsed(old=>{const next=new Set(old);if(next.has(key))next.delete(key);else next.add(key);return next;});
  const renderRow=(row:ProgressRow,scope:'self'|'factory'|'unknown',groupName:string)=>{
    const facts=row.business??materialBusinessFacts(row),state=rowState(row),displayUnit=purchaseDisplayUnit(row);
    const onFlow=(flow:MaterialFlow)=>()=>open({kind:'row',id:row.demand.id},flow),onVerify=()=>open({kind:'row',id:row.demand.id},'verification');
    const columns=(scope==='self'?selfColumns:factoryColumns).filter(([key])=>!display.hidden.includes(key));
    const cells:Record<string,ReactNode>={
      name:row.demand.materialName.normalize('NFKC').trim()===groupName.normalize('NFKC').trim()?<span className="sp-dense-visually-hidden">{row.demand.materialName}</span>:<strong>{row.demand.materialName}</strong>,color:row.demand.materialColor||'未提供',spec:row.demand.specification||'未提供',width:row.demand.width||'—',gsm:row.demand.gsm||'—',
      demand:<button type="button" className="sp-business-demand" title="查看需求来源" onClick={onVerify}>{number(row.demand.requiredQuantity)}</button>,
      unit:displayUnit.unit?<button type="button" className="sp-business-demand" title={displayUnit.reason} onClick={onFlow('purchase')}>{displayUnit.unit}</button>:<button type="button" className="sp-business-pending" title={displayUnit.reason} onClick={onVerify}>待核实</button>,
      purchase:<FlowValue fact={facts.flows.purchase} label="采购" onClick={onFlow('purchase')}/>,
      inbound:<FlowValue fact={facts.flows.inbound} label="入库" onClick={onFlow('inbound')}/>,pending:<GapValue fact={facts.pendingInbound} onClick={onVerify}/>,excess:<ExcessWarehouseValue row={row} onClick={onFlow('inbound')}/>,
      shipment:<FlowValue fact={facts.flows.shipment} label="出运" onClick={onFlow('shipment')}/>,
      state:<button type="button" className="sp-business-status" data-attention={state.attention} onClick={onVerify}>{state.label}</button>,
      action:<button type="button" className="sp-dense-detail" aria-label={'查看 '+row.demand.materialName+' '+(row.demand.materialColor||'')+' 明细'} onClick={()=>open({kind:'row',id:row.demand.id},'material')}>查看明细</button>,
    };
    return <tr key={row.demand.id} aria-label={row.demand.materialName+' · '+(row.demand.materialColor||'颜色未提供')} data-demand-id={row.demand.id} data-source-demand-id={row.demand.sourceDetailId}>{columns.map(([key])=><td key={key} data-column={key} className={numericColumns.has(key)?'numeric':key==='name'?'sp-business-name':key==='spec'?'sp-business-spec':undefined} title={key==='spec'?row.demand.specification||undefined:undefined}>{cells[key]}</td>)}</tr>;
  };
  const renderScope=(scope:'self'|'factory'|'unknown')=>{
    const rows=view.rows.filter(row=>materialSupplyScope(row.demand)===scope),groups=ordered.filter(group=>group.rows.some(row=>visible.has(row.demand.id)&&materialSupplyScope(row.demand)===scope));
    if(!rows.length&&scope==='unknown')return null;
    const columns=(scope==='self'?selfColumns:factoryColumns).filter(([key])=>!display.hidden.includes(key));
    return <section key={scope} className="sp-dense-scope" data-supply-scope={scope} aria-label={scope==='self'?'自购需求':scope==='factory'?'厂供记录':'其他供料记录'}>
      {scope==='unknown'&&<h2>其他供料记录 <small>供料方式待核实，独立保留</small></h2>}
      {scope==='factory'&&<p className="sp-dense-factory-note">厂供独立保留，不计自购需求缺口。</p>}
      {!groups.length?<Card className="sp-business-empty-card">{scope==='self'&&!view.rows.length&&<h2>{hasCompleteFacts?'暂无物料需求':'物料尚未接入'}</h2>}{rows.length?'没有符合搜索或筛选条件的记录。':scope==='factory'?(hasCompleteFacts?'暂无厂供记录。':'厂供记录尚未取得，不能认定为零。'):hasCompleteFacts?'上次完整来源没有自购需求，相关业务尚未开始。':'尚未取得完整来源，不能认定需求为零。'}</Card>:<div className="sp-business-table-scroll sp-dense-scroll" tabIndex={0} aria-label={scope==='self'?'自购需求表，可横向滚动':'厂供记录表，可横向滚动'}><table className={'sp-business-table sp-dense-table '+(scope==='self'?'sp-business-self-table':'sp-business-factory-table')}>
        <thead><tr>{columns.map(([key,label])=><th key={key} title={key==='unit'?'关联采购单位；不用于推断需求单位或换算数量':undefined} data-column={key} className={numericColumns.has(key)?'numeric':undefined}>{label}</th>)}</tr></thead>
        {groups.map((group,index)=>{const key=scope+':'+group.key,closed=collapsed.has(key),groupRows=group.rows.filter(row=>materialSupplyScope(row.demand)===scope&&visible.has(row.demand.id));
          const owner=group.rows.some(row=>materialSupplyScope(row.demand)==='self')?'self':group.rows.some(row=>materialSupplyScope(row.demand)==='factory')?'factory':'unknown';
          return <tbody key={key} id={id+'-'+scope+'-'+index} className="sp-business-material" data-canonical-material-key={group.key}>
            <tr className="sp-dense-group"><th colSpan={columns.filter(([k])=>k!=='state'&&k!=='action').length} scope="rowgroup"><div className="sp-business-material-head">
              <button type="button" className="sp-business-material-toggle" aria-expanded={!closed} aria-controls={id+'-'+scope+'-'+index} onClick={()=>toggle(key)}><span className="sp-business-chevron" aria-hidden="true">{closed?'▸':'▾'}</span><h3>{group.name}</h3><span>{group.type==='fabric'?'面料':'辅料'} · {groupRows.length} 项</span></button>
              </div></th><th colSpan={columns.filter(([k])=>k==='state'||k==='action').length} className="sp-dense-group-actions"><div className="sp-business-material-actions">{owner===scope&&materialActions?.(group.key,group.name)}<Button variant="text" size="compact" aria-label={'查看 '+group.name+' 明细'} onClick={()=>open({kind:'group',key:group.key,scope},'material')}>查看明细</Button></div></th></tr>
            <Fragment key={key+'-rows'}>{!closed&&groupRows.map(row=>renderRow(row,scope,group.name))}</Fragment>
          </tbody>;
        })}
      </table></div>}
    </section>;
  };
  return <div ref={workspace} className="sp-business-workspace sp-dense-workspace" data-density={display.density}>

    <section className="sp-business-overview" aria-label="订单物料概况"><div className="sp-business-metrics">
      <button type="button" onClick={()=>setMainView('self')}><span>自购需求</span><strong>{hasCompleteFacts?selfRows.length:'—'}<small>项</small></strong></button>
      <button type="button" onClick={()=>setMainView('factory')}><span>厂供记录</span><strong>{hasCompleteFacts?factoryRows.length:'—'}<small>项</small></strong></button>
      {(['purchase','inbound','shipment','outbound'] as const).map(flow=><button key={flow} type="button" aria-label={'查看全部'+flowLabels[flow]+'明细'} onClick={()=>setMainView(flow)}><span>{flowLabels[flow]}明细</span><strong>{hasCompleteFacts?counts[flow]:'—'}<small>笔</small></strong></button>)}
    </div></section>
    <div className="sp-business-toolbar sp-dense-toolbar"><label className="sp-dense-search"><span className="sp-business-search-icon" aria-hidden="true">⌕</span><input type="search" aria-label="搜索物料" placeholder="物料、颜色、规格、供应商或单号" value={search} onChange={event=>setSearch(event.target.value)}/></label>
      <select aria-label="物料类型" value={type} onChange={event=>setType(event.target.value as typeof type)}><option value="all">全部物料</option><option value="fabric">面料</option><option value="trim">辅料</option></select>
      <select aria-label="物料状态" value={status} onChange={event=>setStatus(event.target.value as typeof status)}><option value="all">全部状态</option><option value="not_purchased">未采购</option><option value="purchasing">采购中</option><option value="pending_inbound">已采购待入库</option><option value="ready">已齐套</option><option value="unknown">状态待核实</option></select>
      <Button variant="secondary" size="compact" onClick={()=>setCollapsed(allCollapsed?new Set():new Set(allKeys))}>{allCollapsed?'展开全部':'收起全部'}</Button>
      <select aria-label="显示密度" value={display.density} onChange={event=>display.setDensity(event.target.value as 'compact'|'standard')}><option value="compact">紧凑模式</option><option value="standard">标准模式</option></select>
      <details className="sp-dense-columns"><summary>显示列</summary><div>{selfColumns.filter(([key])=>key!=='color'&&key!=='action').map(([key,label])=><label key={key}><input type="checkbox" checked={!display.hidden.includes(key)} onChange={()=>display.toggle(key)}/>{label}</label>)}<Button variant="text" onClick={display.reset}>恢复全部列</Button></div></details>
      {(search||status!=='all'||type!=='all')&&<Button variant="text" size="compact" onClick={()=>{setSearch('');setStatus('all');setType('all');}}>清除筛选</Button>}
    </div>
    {settingsNotice&&<p className="sp-business-settings-notice" role="status">{settingsNotice}</p>}
    <div ref={mainTabs} className="sp-dense-view-tabs" role="tablist" aria-label="物料数据视图">{views.map((item,index)=><button type="button" role="tab" key={item.key} id={id+'-view-'+item.key} aria-selected={mainView===item.key} aria-controls={id+'-main'} tabIndex={mainView===item.key?0:-1} onClick={()=>setMainView(item.key)} onKeyDown={event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();selectMain(event.key==='Home'?0:event.key==='End'?views.length-1:index+(event.key==='ArrowRight'?1:-1));}}}>{item.label}<span>{!hasCompleteFacts?'—':item.key==='self'?selfRows.length:item.key==='factory'?factoryRows.length:counts[item.key]}</span></button>)}</div>
    <div role="tabpanel" id={id+'-main'} aria-labelledby={id+'-view-'+mainView} className="sp-dense-main">
      {mainView==='self'?<>{renderScope('self')}{renderScope('unknown')}</>:mainView==='factory'?renderScope('factory'):hasCompleteFacts?<EventTable rows={filtered} flow={mainView}/>:<Card className="sp-business-empty-card">尚未取得完整来源，不能据此认定没有{flowLabels[mainView]}记录。</Card>}
    </div>

    <div className="sp-business-source"><span>来源更新 <time dateTime={view.fetchedAt||undefined}>{view.fetchedAt?date(view.fetchedAt,true):'尚未同步'}</time></span>{notice&&<span className="sp-dense-source-notice" role="status">{notice}</span>}{!sourcePanelRef&&<button type="button" onClick={()=>open({kind:'all'},'verification')}>来源与核实项</button>}</div>
    <Drawer open={Boolean(selection)} title={(selectedName||'物料')+' · 业务明细'} description={'销售合同 '+view.order.salesContractNo} className="sp-business-events sp-dense-events" onClose={()=>setSelection(null)}>
      <div ref={tabList} className="sp-business-event-tabs" role="tablist" aria-label="物料明细类型">{tabs.map((item,index)=><button key={item.key} type="button" role="tab" id={id+'-tab-'+item.key} aria-controls={id+'-events'} aria-selected={tab===item.key} tabIndex={tab===item.key?0:-1} onClick={()=>setTab(item.key)} onKeyDown={event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();selectTab(event.key==='Home'?0:event.key==='End'?tabs.length-1:index+(event.key==='ArrowRight'?1:-1));}}}>{item.label}{['purchase','inbound','shipment','outbound'].includes(item.key)?' ('+businessTransactionCounts(selectedRows)[item.key as MaterialFlow]+')':''}</button>)}</div>
      <div role="tabpanel" tabIndex={0} id={id+'-events'} aria-labelledby={id+'-tab-'+tab}>
        {tab==='material'?<><div className="sp-business-table-scroll"><table className="sp-business-event-table"><thead><tr>{['物料','供料方式','颜色','规格','门幅','克重','需求数量','单位'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{selectedRows.map(row=><tr key={row.demand.id}><td>{row.demand.materialName}</td><td>{text(row.demand.supplyMethod)}</td><td>{text(row.demand.materialColor)}</td><td>{text(row.demand.specification)}</td><td>{text(row.demand.width)}</td><td>{text(row.demand.gsm)}</td><td className="numeric">{number(row.demand.requiredQuantity)}</td><td>{row.unit||'待核实'}</td></tr>)}</tbody></table></div>
          {selectedGroups.map(group=><div key={group.key} className="sp-dense-arrival-link"><strong>{group.name}</strong>{materialActions?.(group.key,group.name)}{materialPlan?.(group.key)}</div>)}<details className="sp-business-evidence"><summary>需求来源与核实项</summary><Verification rows={selectedRows} view={view}/></details></>
        :tab==='arrivals'?<>{selectedGroups.map(group=><section key={group.key} className="sp-dense-arrival-link"><h3>{group.name}</h3>{materialActions?.(group.key,group.name)}{materialPlan?.(group.key)||<p>尚无已保存的到料计划；可打开原计划窗口查看依据。</p>}</section>)}</>
        :tab==='verification'?<Verification rows={selectedRows} view={view}/>:tab==='reconciliation'?paymentScope?<PaymentRequestsReadPanel key={paymentScope.salesOrderId+'/'+paymentScope.identityKey} salesOrderId={paymentScope.salesOrderId} salesContractNo={view.order.salesContractNo} identityKey={paymentScope.identityKey}/>:<p className="sp-business-no-events">尚未取得货款申请明细。</p>:hasCompleteFacts?<EventTable rows={selectedRows} flow={tab}/>:<p>尚未取得完整来源，不能据此认定没有{flowLabels[tab]}记录。</p>}
      </div>
    </Drawer>
  </div>;
}

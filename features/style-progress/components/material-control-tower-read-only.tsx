"use client";

import { useId, useRef, useState, type ReactNode } from 'react';
import { Card } from '@/components/foundation/card';
import { Button } from '@/components/foundation/button';
import { Drawer } from '@/components/foundation/drawer';
import { filterProgressRows, materialSupplyScope, type MaterialProgressView, type ProgressRow, type ReadPurchase, type ReadMovement } from '@/features/ainuoke-material-progress/projection';
import { businessTransactionCounts, materialBusinessFacts, materialEventKey, type FlowQuantity, type MaterialFlow, type QuantityGap } from '@/features/ainuoke-material-progress/business-facts';
import { orderMaterialGroups } from '../model/material-display-order';
import { PaymentRequestsReadPanel } from './payment-requests-read-panel';

const number = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 9 }).format(value);
const text = (value: string | null | undefined) => value?.trim() || '未提供';
const flowLabels: Record<MaterialFlow, string> = { purchase: '采购', inbound: '入库', shipment: '出运', outbound: '出库' };
const flowFields = { purchase: 'purchases', inbound: 'inbounds', shipment: 'shipments', outbound: 'outbounds' } as const;
const tabs = [
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
  if (view.sourceStatus === 'stale') return view.fetchedAt ? '当前显示历史数据，来源时间见上方。' : '尚无可用物料数据。';
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
          {flow === 'purchase' && <><td className="numeric">{purchase.sourcePricing.unitPrice === null ? '未提供' : number(purchase.sourcePricing.unitPrice)}</td><td>{text(purchase.sourcePricing.currency)}</td></>}
          {flow === 'shipment' && <td>{({ Sea: '海运', Air: '空运' } as Record<string, string>)[(event as { transportMode: string }).transportMode] || text((event as { transportMode: string }).transportMode)}</td>}
          {flow === 'outbound' && <td>{text((event as ReadMovement).businessType)}</td>}
          <td>{event.relation?.status === 'shared' || demands.length > 1 ? <span className="sp-business-caution">关联 {event.relation?.relatedDemandIds.length || demands.length} 条需求，待分配</span> : event.relation?.status === 'unidentified' ? <span className="sp-business-caution">明细身份待核实</span> : '已关联'}
            {event.relation?.problems.map(problem => <small className="sp-business-caution" key={problem}>{problem}</small>)}
          </td>
        </tr>;
      })}</tbody></table></div>}
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

/** The existing read projection and arrival owner remain authoritative; no source request is made here. */
export function ReadOnlyMaterialControlTower({ view, trimPriorityKeywords = [], settingsNotice, paymentScope, materialActions, materialPlan }: {
  view: MaterialProgressView; trimPriorityKeywords?: readonly string[]; settingsNotice?: string;
  paymentScope?: { salesOrderId: string; identityKey: string };
  materialActions?: (key: string, name: string) => ReactNode; materialPlan?: (key: string) => ReactNode;
}) {
  const [search, setSearch] = useState(''), [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null), [tab, setTab] = useState<EventTab>('purchase');
  const id = useId(), tabList = useRef<HTMLDivElement>(null);
  const visible = new Set(filterProgressRows(view, search, 'all', 'all').map(row => row.demand.id));
  const ordered = orderMaterialGroups(view.groups, trimPriorityKeywords);
  const counts = businessTransactionCounts(view.rows);
  const selectedRows = !selection ? [] : selection.kind === 'all' ? view.rows : selection.kind === 'row' ? view.rows.filter(row => row.demand.id === selection.id) : view.groups.find(group => group.key === selection.key)?.rows.filter(row => materialSupplyScope(row.demand) === selection.scope) ?? [];
  const selectedName = selection?.kind === 'row' ? selectedRows[0]?.demand.materialName : selection?.kind === 'group' ? view.groups.find(group => group.key === selection.key)?.name : '全部物料';
  const notice = sourceStatus(view);
  const hasCompleteFacts = view.sourceStatus === 'ready' || Boolean(view.fetchedAt && ['stale', 'source_failed'].includes(view.sourceStatus));
  const open = (target: Selection, nextTab: EventTab) => { setSelection(target); setTab(nextTab); };
  const selectTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setTab(tabs[next].key);
    tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const allKeys = ordered.flatMap(group => (['self', 'factory', 'unknown'] as const).filter(scope => group.rows.some(row => materialSupplyScope(row.demand) === scope)).map(scope => scope + ':' + group.key));
  const allCollapsed = allKeys.length > 0 && allKeys.every(key => collapsed.has(key));
  const renderRow = (row: ProgressRow, scope: 'self' | 'factory' | 'unknown') => {
    const facts = row.business ?? materialBusinessFacts(row), state = rowState(row);
    const onFlow = (flow: MaterialFlow) => () => open({ kind: 'row', id: row.demand.id }, flow);
    const onVerify = () => open({ kind: 'row', id: row.demand.id }, 'verification');
    return <tr key={row.demand.id} data-demand-id={row.demand.id} data-source-demand-id={row.demand.sourceDetailId}>
      <td className="sp-business-name"><strong>{row.demand.materialName}</strong></td><td>{row.demand.materialColor || '未提供'}</td><td className="sp-business-spec">{row.demand.specification || '未提供'}</td>
      {scope === 'self' && <><td>{row.demand.width || '—'}</td><td>{row.demand.gsm || '—'}</td></>}
      <td className="numeric"><button type="button" className="sp-business-demand" title="查看需求来源" onClick={onVerify}>{number(row.demand.requiredQuantity)}</button></td>
      <td>{row.unit || <button type="button" className="sp-business-pending" onClick={onVerify}>待核实</button>}</td>
      <td className="numeric"><FlowValue fact={facts.flows.purchase} label="采购" onClick={onFlow('purchase')} /></td>
      {scope === 'self' && <td className="numeric"><GapValue fact={facts.purchaseGap} onClick={onVerify} /></td>}
      <td className="numeric"><FlowValue fact={facts.flows.inbound} label="入库" onClick={onFlow('inbound')} /></td>
      {scope === 'self' && <><td className="numeric"><GapValue fact={facts.pendingInbound} onClick={onVerify} /></td>
        <td className="numeric"><FlowValue fact={facts.flows.shipment} label="出运" onClick={onFlow('shipment')} /></td>
        <td className="numeric"><FlowValue fact={facts.flows.outbound} label="出库" onClick={onFlow('outbound')} /></td></>}
      <td><button type="button" className="sp-business-status" data-attention={state.attention} onClick={onVerify}>{state.label}</button></td>
    </tr>;
  };
  return <div className="sp-business-workspace">
    <section className="sp-business-overview" aria-label="订单物料概况">
      <div className="sp-business-metrics">
        <div><span>自购需求</span><strong>{hasCompleteFacts ? view.rows.filter(row => materialSupplyScope(row.demand) === 'self').length : '—'}<small>项</small></strong></div>
        <div><span>厂供记录</span><strong>{hasCompleteFacts ? view.rows.filter(row => materialSupplyScope(row.demand) === 'factory').length : '—'}<small>项</small></strong></div>
        {(['purchase', 'inbound', 'shipment', 'outbound'] as const).map(flow => <button key={flow} type="button" aria-label={'查看全部' + flowLabels[flow] + '明细'} onClick={() => open({ kind: 'all' }, flow)}><span>{flowLabels[flow]}明细</span><strong>{hasCompleteFacts ? counts[flow] : '—'}<small>笔</small></strong></button>)}
      </div>
      <div className="sp-business-source"><span>来源更新 <time dateTime={view.fetchedAt || undefined}>{view.fetchedAt ? date(view.fetchedAt, true) : '尚未同步'}</time></span><button type="button" onClick={() => open({ kind: 'all' }, 'verification')}>查看来源与核实项</button></div>
      {notice && <p className="sp-business-source-notice" role="status">{notice}</p>}
    </section>
    <div className="sp-business-toolbar"><label><span className="sp-business-search-icon" aria-hidden="true">⌕</span><input type="search" aria-label="搜索物料" placeholder="搜索物料、颜色、规格、供应商或单号" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <Button variant="secondary" size="compact" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allKeys))}>{allCollapsed ? '展开全部' : '收起全部'}</Button>
    </div>
    {settingsNotice && <p className="sp-business-settings-notice" role="status">{settingsNotice}</p>}
    {(['self', 'factory', 'unknown'] as const).map(scope => {
      const rows = view.rows.filter(row => materialSupplyScope(row.demand) === scope);
      if (!rows.length) return null;
      const groups = ordered.filter(group => group.rows.some(row => visible.has(row.demand.id) && materialSupplyScope(row.demand) === scope));
      return <section key={scope} className="sp-business-section" data-supply-scope={scope} aria-label={scope === 'self' ? '自购需求' : scope === 'factory' ? '厂供记录' : '其他供料记录'}>
        <header className="sp-business-section-title"><h2>{scope === 'self' ? '自购需求' : scope === 'factory' ? '厂供记录' : '其他供料记录'}</h2><span>{rows.length} 项</span>{scope === 'factory' && <small>独立保留，不计自购需求缺口</small>}</header>
        {!groups.length && <Card className="sp-business-empty-card">没有符合搜索条件的记录。</Card>}
        {groups.map((group, index) => {
          const key = scope + ':' + group.key, closed = collapsed.has(key);
          const groupRows = group.rows.filter(row => materialSupplyScope(row.demand) === scope);
          const owner = group.rows.some(row => materialSupplyScope(row.demand) === 'self') ? 'self' : group.rows.some(row => materialSupplyScope(row.demand) === 'factory') ? 'factory' : 'unknown';
          const headers = scope === 'self' ? ['物料名称', '颜色', '规格', '门幅', '克重', '需求数量', '单位', '已采购', '采购不足', '已入库', '待入库', '物料出运', '物料出库', '状态'] : ['物料名称', '颜色', '规格', scope === 'factory' ? '厂供数量' : '需求数量', '单位', '已落实数量', '到货数量', '状态'];
          return <Card key={key} className="sp-business-material" data-canonical-material-key={group.key}>
            <header className="sp-business-material-head"><button type="button" className="sp-business-material-toggle" aria-expanded={!closed} aria-controls={id + '-' + scope + '-' + index} onClick={() => setCollapsed(old => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; })}><span className="sp-business-chevron" aria-hidden="true">{closed ? '▸' : '▾'}</span><h3>{group.name}</h3><span>{group.type === 'fabric' ? '面料' : '辅料'} · {groupRows.length} 项</span></button>
              <div className="sp-business-material-actions">{owner === scope && materialActions?.(group.key, group.name)}<Button variant="text" size="compact" aria-label={'查看 '+group.name+' 明细'} onClick={() => open({ kind: 'group', key: group.key, scope }, 'purchase')}>查看明细</Button></div>
            </header>
            {!closed && <><div id={id + '-' + scope + '-' + index} className="sp-business-table-scroll" tabIndex={0} aria-label={group.name + (scope === 'self' ? '自购需求表' : '厂供记录表') + '，可横向滚动'}><table className={'sp-business-table ' + (scope === 'self' ? 'sp-business-self-table' : 'sp-business-factory-table')}><thead><tr>{headers.map((header, column) => <th key={header} className={(scope === 'self' ? [5, 7, 8, 9, 10, 11, 12] : [3, 5, 6]).includes(column) ? 'numeric' : undefined}>{header}</th>)}</tr></thead>
              <tbody>{groupRows.filter(row => visible.has(row.demand.id)).map(row => renderRow(row, scope))}</tbody>
            </table></div>{owner === scope && materialPlan?.(group.key)}</>}
          </Card>;
        })}
      </section>;
    })}
    {!view.rows.length && <Card className="sp-business-empty-card"><h2>{hasCompleteFacts ? '暂无物料需求' : '物料尚未接入'}</h2><p>{hasCompleteFacts ? '上次完整来源中没有物料记录，业务尚未开始。' : '尚未取得完整来源，不能据此认定需求或采购为零。'}</p></Card>}
    <Drawer open={Boolean(selection)} title={(selectedName || '物料') + ' · 业务明细'} description={'销售合同 ' + view.order.salesContractNo} className="sp-business-events" onClose={() => setSelection(null)}>
      <div ref={tabList} className="sp-business-event-tabs" role="tablist" aria-label="物料明细类型">{tabs.map((item, index) => <button key={item.key} type="button" role="tab" id={id + '-tab-' + item.key} aria-controls={id + '-events'} aria-selected={tab === item.key} tabIndex={tab === item.key ? 0 : -1} onClick={() => setTab(item.key)} onKeyDown={event => { if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) { event.preventDefault(); selectTab(event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : index + (event.key === 'ArrowRight' ? 1 : -1)); } }}>{item.label}{item.key !== 'verification' && item.key !== 'reconciliation' ? ' (' + businessTransactionCounts(selectedRows)[item.key] + ')' : ''}</button>)}</div>
      <div role="tabpanel" tabIndex={0} id={id + '-events'} aria-labelledby={id + '-tab-' + tab}>{tab === 'verification' ? <Verification rows={selectedRows} view={view} /> : tab === 'reconciliation' ? paymentScope ? <PaymentRequestsReadPanel key={paymentScope.salesOrderId + '/' + paymentScope.identityKey} salesOrderId={paymentScope.salesOrderId} salesContractNo={view.order.salesContractNo} identityKey={paymentScope.identityKey} /> : <p className="sp-business-no-events">尚未取得货款申请明细。</p> : <EventTable rows={selectedRows} flow={tab} />}</div>
    </Drawer>
  </div>;
}

"use client";
import { useMemo, useState } from 'react';
import type { MaterialReadinessStatus } from '../style-progress/model/style-progress.ts';
import { filterProgressRows, projectMaterialProgress, type ProgressRow } from './projection.ts';
import { createSyntheticMaterialSource, syntheticOrder, type DemoScenario } from './synthetic-source.ts';
import './material-progress.css';

const labels: Record<MaterialReadinessStatus, string> = { not_purchased: '未采购', purchasing: '采购中', pending_inbound: '待入库', ready: '已齐套' };
const quantity = (value: number | null, unit: string | null) => value === null ? '未知' : `${value.toLocaleString('zh-CN', { maximumSignificantDigits: 15 })}${unit ? ` ${unit}` : ''}`;
const PAGE_SIZE = 30;
function MaterialRow({ row }: { row: ProgressRow }) {
  const [expanded, setExpanded] = useState(false);
  return <article className="amp-row" data-demand-id={row.demand.id} data-status={row.status ?? 'unknown'}>
    <header className="amp-row-head"><div><strong>{row.demand.materialColor || '颜色未提供'}</strong><span>{row.demand.specification || '规格未提供'}</span><small>{row.demand.materialCode}</small></div>
      <span className={`amp-status amp-status-${row.status ?? 'unknown'}`}>{row.status ? labels[row.status] : '来源不完整'}</span></header>
    <dl className="amp-metrics">
      <div><dt>需求数量</dt><dd>{quantity(row.unitStatus === 'conflict' ? null : row.demand.requiredQuantity, row.unit)}</dd></div>
      <div><dt>采购数量</dt><dd>{quantity(row.purchased, row.unit)}</dd></div>
      <div><dt>采购不足量</dt><dd>{quantity(row.purchaseShortfall, row.unit)}</dd></div>
      <div><dt>入库数量</dt><dd>{quantity(row.inbound, row.unit)}</dd></div>
      <div><dt>待入库（已采购）</dt><dd>{quantity(row.pendingInbound, row.unit)}</dd></div>
    </dl>
    {row.issues.length > 0 && <p className="amp-row-warning">{row.issues.join('；')}</p>}
    <details onToggle={event => setExpanded(event.currentTarget.open)}><summary>采购与入库明细 <span>{row.purchases.length} 个采购事件 · {row.inbounds.length} 个入库事件</span></summary>
      {expanded && <div className="amp-events"><section><h4>采购事件</h4>{row.purchases.map(event => <div className="amp-event" key={event.id}>
        <strong>{event.purchaseOrderNo}</strong><span>采购日期 {event.purchaseDate ?? '未提供'}</span><span>供应商 {event.supplier || '未提供'}</span><span>数量 {row.unitStatus === 'conflict' ? '待核对' : quantity(event.quantity, row.unit)}</span>
        <small>颜色 {event.color || '未提供'} · 规格 {event.specification || '未提供'}</small></div>)}
        {!row.purchases.length && <p>{row.purchased === null ? '采购来源未知，不能确认无采购。' : '无采购事件；本合成 Source 明确采购数量为零。'}</p>}</section>
        <section><h4>入库事件</h4>{row.inbounds.map(event => <div className="amp-event" key={event.id}><strong>{event.documentNo}</strong><span>入库日期 {event.eventDate ?? '未提供'}</span><span>数量 {row.unitStatus === 'conflict' ? '待核对' : quantity(event.quantity, row.unit)}</span></div>)}
        {!row.inbounds.length && <p>{row.inbound === null ? '入库来源未知。' : '无入库事件；本合成 Source 明确入库数量为零。'}</p>}</section></div>}
    </details>
  </article>;
}

export function MaterialProgressPage() {
  const [scenario, setScenario] = useState<DemoScenario>('complete');
  const [refreshCount, setRefreshCount] = useState(0);
  const [source, setSource] = useState(() => createSyntheticMaterialSource('complete'));
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'fabric' | 'trim'>('all');
  const [status, setStatus] = useState<'all' | 'unknown' | MaterialReadinessStatus>('all');
  const [page, setPage] = useState(1);
  const view = useMemo(() => projectMaterialProgress(syntheticOrder, source), [source]);
  const filtered = useMemo(() => filterProgressRows(view, search, type, status), [view, search, type, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleIds = new Set(visible.map(row => row.demand.id));
  const resetFilters = () => { setSearch(''); setType('all'); setStatus('all'); setPage(1); };
  return <main className="amp-page">
    <header className="amp-heading"><div><p className="amp-eyebrow">织序 · 独立只读预览</p><h1>订单物料采购进度</h1><p>逐颜色、逐规格查看需求、采购和入库事实</p></div><span className="amp-demo-tag">合成测试数据 · 非实时同步</span></header>
    <section className="amp-context" aria-label="订单来源"><div><small>销售合同号 / BillNo</small><strong>{syntheticOrder.salesContractNo}</strong></div>
      <div><small>款号</small><strong>{syntheticOrder.styleNo}</strong></div><div><small>来源更新时间（合成快照）</small><strong>{view.fetchedAt ?? '未获取'}</strong></div></section>
    <section className="amp-notice"><strong>只读演示，未连接正式艾诺科账号或 PostgreSQL 物料库</strong><p>已核实的 6087050 来源单位按需求逐项展示；缺失或冲突仍保持未知，不跨颜色、规格或单位汇总数量。厂供保留来源追溯，排除采购与齐套指标。</p></section>
    <div className={`amp-source amp-source-${view.sourceStatus}`} role="status"><strong>{view.sourceStatus === 'ready' ? '来源检查' : view.sourceStatus === 'not_fetched' ? '数据未获取' : view.sourceStatus === 'identity_mismatch' ? '身份不匹配' : '数据不完整'}</strong><span>{view.message}</span></div>
    {view.insideOrderDrift && <p className="amp-drift">InsideOrderNo 漂移：Source 查询 {view.queryInsideOrderNo} → 当前 {syntheticOrder.insideOrderNo}。合同号一致，关联保持；查询号不作为订单身份。</p>}
    <section className="amp-toolbar" aria-label="演示与筛选"><label>演示场景<select aria-label="演示场景" value={scenario} onChange={event => { const next = event.target.value as DemoScenario; setScenario(next); setSource(createSyntheticMaterialSource(next)); resetFilters(); }}>
      <option value="complete">完整来源与数量边界</option><option value="not_fetched">数据未获取</option><option value="incomplete">不完整分页</option><option value="identity_mismatch">合同身份不匹配</option><option value="collision">来源身份冲突</option><option value="large">大量需求（5,000）</option></select></label>
      <button className="amp-refresh" onClick={() => { setSource(createSyntheticMaterialSource(scenario)); setRefreshCount(count => count + 1); setPage(1); }}>重新读取合成快照</button>
      <label className="amp-search">搜索<input aria-label="搜索物料" placeholder="物料名称、颜色、规格、采购单、供应商" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label>物料类型<select aria-label="物料类型" value={type} onChange={event => { setType(event.target.value as typeof type); setPage(1); }}><option value="all">全部</option><option value="fabric">面料</option><option value="trim">辅料</option></select></label>
      <label>进度状态<select aria-label="进度状态" value={status} onChange={event => { setStatus(event.target.value as typeof status); setPage(1); }}><option value="all">全部</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="unknown">来源不完整</option></select></label></section>
    <div className="amp-summary" aria-live="polite"><span>匹配 <b data-testid="matched-count">{filtered.length}</b> 条需求 · {view.groups.length} 个物料组</span><span>厂供排除 {view.factoryExcluded} 项</span><span>重复来源去重 {view.duplicateSourceRows} · 重复事件去重 {view.duplicateEvents}</span><span data-testid="refresh-count">已重新读取 {refreshCount} 次</span></div>
    <div className="amp-materials">{(['fabric', 'trim'] as const).map(materialType => {
      const groups = view.groups.filter(group => group.type === materialType && group.rows.some(row => visibleIds.has(row.demand.id)));
      return groups.length > 0 && <section key={materialType} aria-label={materialType === 'fabric' ? '面料进度' : '辅料进度'}><h2>{materialType === 'fabric' ? '面料' : '辅料'}<small>单位未核实，保留逐需求口径</small></h2>{groups.map(group => <section className="amp-group" key={group.key}><header><h3>{group.name}</h3><span>{group.rows.length} 条颜色 / 规格需求</span></header>{group.rows.filter(row => visibleIds.has(row.demand.id)).map(row => <MaterialRow key={row.demand.id} row={row} />)}</section>)}</section>;
    })}</div>
    {!visible.length && <section className="amp-empty"><h2>{view.sourceStatus === 'ready' ? '没有匹配的物料需求' : '尚不能展示采购状态'}</h2><p>{view.sourceStatus === 'ready' ? '调整搜索与筛选条件；厂供物料已排除。' : '需要完整、有效且合同身份一致的 Source；不能把未知来源当成零采购。'}</p></section>}
    <nav className="amp-pagination" aria-label="需求分页"><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage} / {pageCount} 页 · 每页最多 {PAGE_SIZE} 条</span><button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>
    <footer className="amp-footer">此页不创建订单、不导入业务数据、不修改采购或物流决策。刷新仅重新生成当前合成快照。</footer>
  </main>;
}

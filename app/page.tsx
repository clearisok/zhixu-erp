"use client";

import { useMemo, useState } from "react";

type View = "overview" | "quotes" | "orders" | "schedule";
type ModalType = "quote" | "order" | "schedule" | null;

const quotes = [
  { id: "BJ-2508-018", client: "澄海服饰", style: "女士针织开衫", qty: 3200, unit: 68.5, total: "21.92万", owner: "陈妍", date: "08-15", status: "待确认" },
  { id: "BJ-2508-017", client: "NOVA Apparel", style: "防风机能外套", qty: 1800, unit: 126, total: "22.68万", owner: "周航", date: "08-16", status: "核价中" },
  { id: "BJ-2508-015", client: "棉屿生活", style: "精梳棉圆领T恤", qty: 5000, unit: 32.8, total: "16.40万", owner: "陈妍", date: "08-14", status: "已报价" },
  { id: "BJ-2508-012", client: "RIVET Studio", style: "水洗工装裤", qty: 2400, unit: 89.6, total: "21.50万", owner: "林舒", date: "08-13", status: "已转订单" },
  { id: "BJ-2508-009", client: "野岸户外", style: "轻量冲锋衣", qty: 1500, unit: 148, total: "22.20万", owner: "周航", date: "08-12", status: "已失效" },
];

const orders = [
  { id: "DD-2508-036", client: "澄海服饰", style: "女士针织开衫", qty: 3200, delivered: 0, line: "A1 针织线", date: "09-18", status: "待排产", risk: "正常" },
  { id: "DD-2508-031", client: "NOVA Apparel", style: "防风机能外套", qty: 1800, delivered: 620, line: "C1 外套线", date: "09-10", status: "生产中", risk: "延误风险" },
  { id: "DD-2507-098", client: "棉屿生活", style: "精梳棉圆领T恤", qty: 5000, delivered: 3850, line: "B2 梭织线", date: "08-28", status: "生产中", risk: "正常" },
  { id: "DD-2507-091", client: "RIVET Studio", style: "水洗工装裤", qty: 2400, delivered: 2400, line: "B1 梭织线", date: "08-22", status: "待出货", risk: "正常" },
  { id: "DD-2507-086", client: "无界运动", style: "速干训练短裤", qty: 4200, delivered: 4200, line: "A2 针织线", date: "08-16", status: "已完成", risk: "正常" },
  { id: "DD-2507-079", client: "野岸户外", style: "轻量冲锋衣", qty: 1500, delivered: 820, line: "C1 外套线", date: "08-20", status: "生产中", risk: "加急" },
];

const scheduleRows = [
  { line: "A1 针织线", meta: "22人 · 负荷 86%", blocks: [{ name: "女士针织开衫", sub: "DD-036 · 3,200件", start: 1, span: 4, tone: "green" }, { name: "设备保养", sub: "2小时", start: 5, span: 1, tone: "gray" }] },
  { line: "B2 梭织线", meta: "28人 · 负荷 74%", blocks: [{ name: "精梳棉圆领T恤", sub: "DD-098 · 剩余1,150件", start: 1, span: 2, tone: "navy" }, { name: "工装裤返单", sub: "DD-041 · 1,600件", start: 3, span: 3, tone: "green" }] },
  { line: "C1 外套线", meta: "18人 · 负荷 103%", blocks: [{ name: "防风机能外套", sub: "DD-031 · 交期风险", start: 1, span: 4, tone: "amber" }, { name: "轻量冲锋衣", sub: "DD-079 · 加急", start: 5, span: 2, tone: "red" }] },
];

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "运营总览", icon: "⌂" },
  { id: "quotes", label: "报价管理", icon: "¥" },
  { id: "orders", label: "订单中心", icon: "□" },
  { id: "schedule", label: "生产排单", icon: "▦" },
];

const viewInfo: Record<View, { title: string; desc: string; action: string; modal: ModalType }> = {
  overview: { title: "工厂协同工作台", desc: "今天有 6 个重点节点需要跟进，3 个订单存在交期风险。", action: "新建报价", modal: "quote" },
  quotes: { title: "成衣报价", desc: "统一核算面辅料、工艺、损耗与利润，快速生成工厂报价。", action: "新建报价", modal: "quote" },
  orders: { title: "订单中心", desc: "跟踪从确认、备料、生产到出货的完整订单状态。", action: "新建订单", modal: "order" },
  schedule: { title: "生产排单", desc: "按产线、产能与交期协调生产，提前识别排期冲突。", action: "智能排单", modal: "schedule" },
};

const statusClass: Record<string, string> = {
  待确认: "pending", 核价中: "info", 已报价: "success", 已转订单: "success", 已失效: "muted",
  待排产: "pending", 生产中: "info", 待出货: "purple", 已完成: "success",
};

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [modal, setModal] = useState<ModalType>(null);
  const [toast, setToast] = useState("");
  const [week, setWeek] = useState(0);
  const [costs, setCosts] = useState({ fabric: 31.8, trim: 6.4, labor: 12.5, wash: 3.2, overhead: 5.1, profit: 15 });

  const info = viewInfo[view];
  const filteredQuotes = useMemo(() => quotes.filter((item) => {
    const text = `${item.id}${item.client}${item.style}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === "全部" || item.status === filter);
  }), [query, filter]);
  const filteredOrders = useMemo(() => orders.filter((item) => {
    const text = `${item.id}${item.client}${item.style}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === "全部" || item.status === filter);
  }), [query, filter]);
  const baseCost = costs.fabric + costs.trim + costs.labor + costs.wash + costs.overhead;
  const quotePrice = baseCost / (1 - costs.profit / 100);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function switchView(next: View) {
    setView(next);
    setFilter("全部");
    setQuery("");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">织</span>
          <span><strong>织序</strong><small>ZHIXU</small></span>
        </div>
        <div className="factory-switch"><span>工厂</span><strong>苏州织造一厂</strong><i>⌄</i></div>
        <nav aria-label="主导航">
          <p className="nav-heading">工作台</p>
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => switchView(item.id)}>
              <span className="nav-icon">{item.icon}</span>{item.label}
              {item.id === "quotes" && <em>12</em>}
              {item.id === "orders" && <em>18</em>}
            </button>
          ))}
          <p className="nav-heading nav-heading-space">基础设置</p>
          <button className="nav-item" onClick={() => notify("款式资料库已同步")}><span className="nav-icon">◇</span>款式资料</button>
          <button className="nav-item" onClick={() => notify("产线设置已打开")}><span className="nav-icon">≡</span>产线设置</button>
        </nav>
        <div className="sidebar-foot">
          <div className="capacity-label"><span>本月产能</span><strong>78%</strong></div>
          <div className="capacity-track"><i /></div>
          <p>已排 68,400 / 87,600 件</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="global-search"><span>⌕</span><input aria-label="全局搜索" placeholder="搜索订单、款号或客户" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className="top-actions">
            <button className="icon-button" aria-label="通知" onClick={() => notify("暂无新通知")}>♢<i /></button>
            <span className="top-divider" />
            <div className="avatar">陈</div>
            <div className="user"><strong>陈妍</strong><span>业务主管</span></div>
            <span className="chevron">⌄</span>
          </div>
        </header>

        <div className="content">
          <div className="page-head">
            <div><p className="eyebrow">2026年8月14日 · 星期五</p><h1>{info.title}</h1><p>{info.desc}</p></div>
            <button className="primary-button" onClick={() => setModal(info.modal)}><span>＋</span>{info.action}</button>
          </div>

          {view === "overview" && <Overview onNavigate={switchView} />}
          {view === "quotes" && <QuotesView query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} rows={filteredQuotes} costs={costs} setCosts={setCosts} baseCost={baseCost} quotePrice={quotePrice} notify={notify} />}
          {view === "orders" && <OrdersView query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} rows={filteredOrders} notify={notify} />}
          {view === "schedule" && <ScheduleView week={week} setWeek={setWeek} notify={notify} />}
        </div>
      </section>

      {modal && <ActionModal type={modal} onClose={() => setModal(null)} onSubmit={() => { setModal(null); notify(modal === "quote" ? "报价单已创建" : modal === "order" ? "订单已创建" : "已生成建议排单"); }} />}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function Overview({ onNavigate }: { onNavigate: (view: View) => void }) {
  return <>
    <section className="kpi-grid" aria-label="关键指标">
      <Kpi label="待确认报价" value="12" suffix="份" delta="较上周 +3" tone="navy" icon="¥" />
      <Kpi label="进行中订单" value="18" suffix="单" delta="总货值 286.4万" tone="green" icon="□" />
      <Kpi label="本周排单" value="7" suffix="条产线" delta="平均负荷 82%" tone="blue" icon="▦" />
      <Kpi label="交期风险" value="3" suffix="单" delta="1 单需今日处理" tone="red" icon="!" />
    </section>
    <section className="split-layout">
      <div className="panel order-panel">
        <PanelTitle title="重点订单" meta="更新于 10:32" action="查看全部" onClick={() => onNavigate("orders")} />
        <div className="table-wrap"><table><thead><tr><th>订单 / 客户</th><th>款式</th><th>数量</th><th>交期</th><th>状态</th></tr></thead>
          <tbody>{orders.slice(0, 5).map((o) => <tr key={o.id}><td><strong>{o.id}</strong><small>{o.client}</small></td><td>{o.style}</td><td>{o.qty.toLocaleString()} 件</td><td className={o.risk !== "正常" ? "risk-text" : ""}>{o.date}{o.risk !== "正常" && <small>{o.risk}</small>}</td><td><Status value={o.status} /></td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="panel attention-panel">
        <PanelTitle title="今日待办" meta="6 个节点" />
        <div className="todo-list">
          <Todo time="10:00" title="确认 BJ-2508-018 面料单价" sub="澄海服饰 · 陈妍" tone="amber" />
          <Todo time="14:30" title="NOVA 外套首件确认" sub="C1 外套线 · 周航" tone="red" />
          <Todo time="16:00" title="棉屿 T 恤尾数质检" sub="B2 梭织线 · 林舒" tone="green" />
          <Todo time="今天" title="安排 DD-2508-036 产线" sub="建议 A1 针织线" tone="navy" />
        </div>
      </div>
    </section>
    <section className="panel schedule-panel">
      <PanelTitle title="本周产线排单" meta="8月17日 — 8月23日" action="打开排单" onClick={() => onNavigate("schedule")} />
      <CompactSchedule />
    </section>
  </>;
}

function QuotesView({ query, setQuery, filter, setFilter, rows, costs, setCosts, baseCost, quotePrice, notify }: any) {
  const filters = ["全部", "待确认", "核价中", "已报价", "已转订单"];
  return <div className="module-grid quotes-grid">
    <section className="panel">
      <div className="module-toolbar"><div className="filter-tabs">{filters.map((f) => <button key={f} onClick={() => setFilter(f)} className={filter === f ? "selected" : ""}>{f}</button>)}</div><label className="table-search">⌕<input aria-label="搜索报价" placeholder="客户 / 款式 / 报价号" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
      <div className="table-wrap quote-table"><table><thead><tr><th>报价编号</th><th>客户 / 款式</th><th>数量</th><th>报价单价</th><th>报价总额</th><th>负责人</th><th>状态</th><th /></tr></thead><tbody>
        {rows.map((q: any) => <tr key={q.id}><td><strong>{q.id}</strong><small>{q.date}</small></td><td><strong>{q.client}</strong><small>{q.style}</small></td><td>{q.qty.toLocaleString()}</td><td>¥ {q.unit.toFixed(2)}</td><td>¥ {q.total}</td><td>{q.owner}</td><td><Status value={q.status} /></td><td><button className="more-button" onClick={() => notify(`已打开 ${q.id}`)}>•••</button></td></tr>)}
      </tbody></table></div>
      <div className="table-footer"><span>共 {rows.length} 条报价</span><div><button>‹</button><button className="current">1</button><button>2</button><button>›</button></div></div>
    </section>
    <aside className="panel calculator">
      <div className="calculator-head"><div><span className="calc-icon">¥</span><h2>快速核价</h2></div><button onClick={() => notify("成本模板已载入")}>载入模板</button></div>
      <p>按单件成本快速预估出厂价</p>
      <div className="cost-list">
        {[ ["fabric", "面料成本"], ["trim", "辅料成本"], ["labor", "车缝工费"], ["wash", "后整 / 洗水"], ["overhead", "管理及其他"] ].map(([key, label]) => <label key={key}><span>{label}</span><div><em>¥</em><input type="number" min="0" step="0.1" value={costs[key]} onChange={(e) => setCosts({ ...costs, [key]: Number(e.target.value) })} /></div></label>)}
      </div>
      <div className="cost-summary"><span>单件成本</span><strong>¥ {baseCost.toFixed(2)}</strong></div>
      <label className="profit-field"><span>目标毛利率</span><div><input type="range" min="5" max="35" value={costs.profit} onChange={(e) => setCosts({ ...costs, profit: Number(e.target.value) })} /><strong>{costs.profit}%</strong></div></label>
      <div className="quote-result"><span>建议出厂价</span><strong>¥ {quotePrice.toFixed(2)}<small> / 件</small></strong><p>按 3,200 件计算，预计总额 ¥ {(quotePrice * 3200 / 10000).toFixed(2)} 万</p></div>
      <button className="secondary-button full" onClick={() => notify("核价结果已带入新报价")}>生成报价单</button>
    </aside>
  </div>;
}

function OrdersView({ query, setQuery, filter, setFilter, rows, notify }: any) {
  const filters = ["全部", "待排产", "生产中", "待出货", "已完成"];
  return <>
    <section className="kpi-grid mini-kpis">
      <Kpi label="订单总货值" value="286.4" suffix="万元" delta="本月新增 42.8万" tone="navy" icon="¥" />
      <Kpi label="生产完成率" value="72" suffix="%" delta="较上周 +8%" tone="green" icon="↗" />
      <Kpi label="待出货" value="4" suffix="单" delta="共 12,600 件" tone="blue" icon="□" />
      <Kpi label="异常订单" value="3" suffix="单" delta="需协调产能" tone="red" icon="!" />
    </section>
    <section className="panel">
      <div className="module-toolbar"><div className="filter-tabs">{filters.map((f) => <button key={f} onClick={() => setFilter(f)} className={filter === f ? "selected" : ""}>{f}</button>)}</div><label className="table-search">⌕<input aria-label="搜索订单" placeholder="客户 / 款式 / 订单号" value={query} onChange={(e) => setQuery(e.target.value)} /></label><button className="export-button" onClick={() => notify("订单清单已导出")}>导出</button></div>
      <div className="table-wrap"><table><thead><tr><th>订单编号</th><th>客户 / 款式</th><th>数量</th><th>生产进度</th><th>当前产线</th><th>交期</th><th>状态</th><th /></tr></thead><tbody>
        {rows.map((o: any) => { const pct = Math.round(o.delivered / o.qty * 100); return <tr key={o.id}><td><strong>{o.id}</strong></td><td><strong>{o.client}</strong><small>{o.style}</small></td><td>{o.qty.toLocaleString()} 件</td><td><div className="progress-cell"><div><i style={{ width: `${pct}%` }} /></div><span>{pct}%</span></div></td><td>{o.line}</td><td className={o.risk !== "正常" ? "risk-text" : ""}>{o.date}<small>{o.risk !== "正常" ? o.risk : ""}</small></td><td><Status value={o.status} /></td><td><button className="more-button" onClick={() => notify(`已打开 ${o.id}`)}>•••</button></td></tr>; })}
      </tbody></table></div>
    </section>
  </>;
}

function ScheduleView({ week, setWeek, notify }: any) {
  const dates = week === 0 ? ["17 周一", "18 周二", "19 周三", "20 周四", "21 周五", "22 周六", "23 周日"] : week > 0 ? ["24 周一", "25 周二", "26 周三", "27 周四", "28 周五", "29 周六", "30 周日"] : ["10 周一", "11 周二", "12 周三", "13 周四", "14 周五", "15 周六", "16 周日"];
  return <>
    <section className="schedule-summary">
      <div><span>本周计划产量</span><strong>24,600<small> 件</small></strong><em>较上周 +12%</em></div>
      <div><span>平均产线负荷</span><strong>82<small>%</small></strong><em>合理区间</em></div>
      <div><span>待排订单</span><strong>5<small> 单</small></strong><em>共 9,800 件</em></div>
      <div className="warning"><span>产能冲突</span><strong>2<small> 处</small></strong><em>需今日处理</em></div>
    </section>
    <section className="panel full-schedule">
      <div className="schedule-toolbar"><div><button onClick={() => setWeek(week - 1)}>‹</button><strong>{week === 0 ? "8月17日 — 8月23日" : week > 0 ? "8月24日 — 8月30日" : "8月10日 — 8月16日"}</strong><button onClick={() => setWeek(week + 1)}>›</button><button className="today-button" onClick={() => setWeek(0)}>本周</button></div><div className="schedule-legend"><span><i className="legend-green" />生产中</span><span><i className="legend-navy" />已排期</span><span><i className="legend-amber" />有风险</span></div></div>
      <div className="gantt">
        <div className="gantt-head"><div>产线 / 负荷</div>{dates.map((d, i) => <div key={d} className={i === 0 && week === 0 ? "today" : ""}>{d}</div>)}</div>
        {scheduleRows.concat([
          { line: "A2 针织线", meta: "20人 · 负荷 68%", blocks: [{ name: "速干训练短裤", sub: "DD-086 · 尾单", start: 1, span: 2, tone: "navy" }, { name: "可用产能", sub: "约 2,100件", start: 3, span: 3, tone: "gray" }] },
          { line: "B1 梭织线", meta: "25人 · 负荷 91%", blocks: [{ name: "水洗工装裤", sub: "DD-091 · 2,400件", start: 1, span: 4, tone: "green" }, { name: "订单切换", sub: "备料", start: 5, span: 1, tone: "gray" }] },
        ]).map((row) => <div className="gantt-row" key={row.line}><div className="line-name"><strong>{row.line}</strong><span>{row.meta}</span></div><div className="lane-grid">{row.blocks.map((b: any) => <button key={b.name} className={`job-block ${b.tone}`} style={{ gridColumn: `${b.start} / span ${b.span}` }} onClick={() => notify(`${b.name} 排单详情已打开`)}><strong>{b.name}</strong><span>{b.sub}</span></button>)}</div></div>)}
      </div>
      <div className="schedule-foot"><span>拖动任务可调整排期，系统将自动检查产能与交期冲突</span><button onClick={() => notify("排单方案已保存")}>保存排单</button></div>
    </section>
  </>;
}

function CompactSchedule() {
  const days = ["周一 17", "周二 18", "周三 19", "周四 20", "周五 21", "周六 22", "周日 23"];
  return <div className="compact-schedule"><div className="compact-head"><div>产线</div>{days.map((d) => <div key={d}>{d}</div>)}</div>{scheduleRows.map((row) => <div className="compact-row" key={row.line}><div><strong>{row.line}</strong><span>{row.meta}</span></div><div className="compact-lane">{row.blocks.map((b: any) => <div key={b.name} className={`compact-block ${b.tone}`} style={{ gridColumn: `${b.start} / span ${b.span}` }}><strong>{b.name}</strong><span>{b.sub}</span></div>)}</div></div>)}</div>;
}

function Kpi({ label, value, suffix, delta, tone, icon }: any) { return <article className={`kpi-card ${tone}`}><div className="kpi-icon">{icon}</div><div><p>{label}</p><strong>{value}<small>{suffix}</small></strong><span>{delta}</span></div></article>; }
function Status({ value }: { value: string }) { return <span className={`status ${statusClass[value] || "muted"}`}><i />{value}</span>; }
function PanelTitle({ title, meta, action, onClick }: any) { return <div className="panel-title"><div><h2>{title}</h2><span>{meta}</span></div>{action && <button onClick={onClick}>{action}<b>→</b></button>}</div>; }
function Todo({ time, title, sub, tone }: any) { return <div className="todo-item"><div className={`todo-dot ${tone}`} /><div><span>{time}</span><strong>{title}</strong><small>{sub}</small></div><button aria-label={`完成${title}`}>›</button></div>; }

function ActionModal({ type, onClose, onSubmit }: { type: Exclude<ModalType, null>; onClose: () => void; onSubmit: () => void }) {
  const isQuote = type === "quote";
  const isOrder = type === "order";
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <form className="modal" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="modal-head"><div><span className="modal-icon">{isQuote ? "¥" : isOrder ? "□" : "▦"}</span><div><h2>{isQuote ? "新建成衣报价" : isOrder ? "新建工厂订单" : "生成智能排单"}</h2><p>{isQuote ? "填写基础信息后进入成本核算" : isOrder ? "创建订单并同步到待排产池" : "系统将根据交期、工艺和产能给出建议"}</p></div></div><button type="button" onClick={onClose} aria-label="关闭">×</button></div>
      {type === "schedule" ? <div className="schedule-options"><label><input type="checkbox" defaultChecked /> 优先保障临近交期订单</label><label><input type="checkbox" defaultChecked /> 自动避开产能冲突</label><label><input type="checkbox" defaultChecked /> 同款工艺尽量连续生产</label><div className="modal-note"><strong>待排订单 5 单</strong><span>预计需要 4 条产线，共 12 个生产日</span></div></div> : <div className="form-grid">
        <label><span>客户名称</span><input required placeholder="请输入客户名称" /></label>
        <label><span>{isQuote ? "款式名称" : "关联报价"}</span><input required placeholder={isQuote ? "例如：女士针织开衫" : "选择或输入报价编号"} /></label>
        <label><span>订单数量</span><input required type="number" min="1" placeholder="0" /></label>
        <label><span>{isQuote ? "期望报价日期" : "要求交期"}</span><input required type="date" /></label>
        <label className="wide"><span>备注</span><textarea placeholder="面料、工艺或包装等特殊要求" /></label>
      </div>}
      <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button type="submit">{isQuote ? "创建并核价" : isOrder ? "创建订单" : "开始排单"}</button></div>
    </form>
  </div>;
}

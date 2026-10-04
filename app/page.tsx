"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserIdentityMode } from "@/features/server-auth/identity-mode";

type Role = "admin" | "sales" | "planner" | "viewer";
type Module = "dashboard" | "quotes" | "orders" | "schedules" | "users" | "audit";
type Modal = "quote" | "schedule" | "user" | "password" | null;

type User = { id: number; username: string; display_name: string; role: Role; active?: boolean; created_at?: string };
type Quote = { id: number; quote_no: string; customer_name: string; style_no: string; style_name: string; quantity: number; currency: string; material_cost: number; processing_cost: number; other_cost: number; margin: number; unit_price: number; total_amount: number; valid_until: string; status: string; notes: string; created_at: string };
type Order = { id: number; order_no: string; quote_id?: number; customer_name: string; style_no: string; style_name: string; quantity: number; unit_price: number; total_amount: number; currency: string; due_date: string; status: string; notes: string; created_at: string };
type Schedule = { id: number; order_id: number; order_no: string; customer_name: string; style_no: string; style_name: string; line_name: string; start_date: string; end_date: string; planned_quantity: number; progress: number; status: string; notes: string };
type Audit = { id: number; username: string; action: string; entity_type: string; entity_id?: number; details: Record<string, unknown>; created_at: string };
type Bootstrap = {
  user: User;
  dashboard: { open_quotes: number; active_orders: number; planned_quantity: number; due_soon: number; order_value: number };
  customers: Array<{ id: number; name: string }>;
  quotes: Quote[];
  orders: Order[];
  schedules: Schedule[];
  users: User[];
  audit: Audit[];
};

const labels: Record<string, string> = {
  draft: "草稿", sent: "已发送", accepted: "已接受", rejected: "已拒绝", expired: "已过期", converted: "已转订单",
  confirmed: "已确认", material_preparing: "备料中", scheduled: "已排单", in_production: "生产中", quality_check: "质检中", completed: "已完成", cancelled: "已取消",
  planned: "待排产", ready: "待上线", running: "生产中", paused: "已暂停",
  admin: "系统管理员", sales: "业务员", planner: "计划员", viewer: "只读用户",
  create: "新建", status: "状态变更", convert: "报价转订单", login: "登录", logout: "退出", change_password: "修改密码",
  quote: "报价", order: "订单", schedule: "排单", user: "用户", session: "会话",
};

const DEFAULT_VALID_UNTIL = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

const navItems: Array<{ id: Module; label: string; symbol: string; roles?: Role[] }> = [
  { id: "dashboard", label: "经营工作台", symbol: "⌂" },
  { id: "quotes", label: "成衣报价", symbol: "¥" },
  { id: "orders", label: "工厂订单", symbol: "▣" },
  { id: "schedules", label: "生产排单", symbol: "▦" },
  { id: "users", label: "账号权限", symbol: "◎", roles: ["admin"] },
  { id: "audit", label: "操作审计", symbol: "≡", roles: ["admin"] },
];

function money(value: number | string, currency = "CNY") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function dateText(value: string) {
  return value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "—";
}

function statusTone(status: string) {
  if (["completed", "accepted", "converted"].includes(status)) return "success";
  if (["running", "in_production", "sent", "quality_check"].includes(status)) return "active";
  if (["rejected", "cancelled", "expired", "paused"].includes(status)) return "danger";
  return "neutral";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1", ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({ error: "服务器返回了无效数据" }));
  if (!response.ok) throw new Error(payload.error || "操作失败");
  return payload as T;
}

function downloadCsv(name: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = "\ufeff" + [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${statusTone(status)}`}><i />{labels[status] || status}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state"><span>◇</span><strong>{text}</strong><small>使用右上角按钮创建第一条业务记录</small></div>;
}

function LocalSingleUserLanding() {
  const router = useRouter();
  useEffect(() => { router.replace("/quote-center"); }, [router]);
  return <div className="loading-screen"><div className="loading-mark">纫</div><strong>正在进入报价中心</strong><span /></div>;
}

export default function Home() {
  return browserIdentityMode() === "local-single-user" ? <LocalSingleUserLanding /> : <LegacyHome />;
}

function LegacyHome() {
  const [booting, setBooting] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [active, setActive] = useState<Module>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [quoteDraft, setQuoteDraft] = useState({ material_cost: 18, processing_cost: 12, other_cost: 2, margin: 22, quantity: 3000 });

  async function refresh(silent = false) {
    if (!silent) setBooting(true);
    try {
      const next = await request<Bootstrap>("/api/bootstrap");
      setData(next);
      setError("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "载入失败";
      if (message.includes("登录")) setData(null);
      else setError(message);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => { Promise.resolve().then(() => refresh()); }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function perform(action: () => Promise<unknown>, success: string, close = true) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh(true);
      if (close) setModal(null);
      notify(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      await request("/api/login", { method: "POST", body: JSON.stringify({ username: values.get("username"), password: values.get("password") }) });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    await request("/api/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    setData(null);
    setActive("dashboard");
  }

  const canQuote = data?.user.role === "admin" || data?.user.role === "sales";
  const canPlan = data?.user.role === "admin" || data?.user.role === "planner";
  const canOperateOrders = data?.user.role !== "viewer";
  const query = search.trim().toLowerCase();
  const quotes = useMemo(() => (data?.quotes || []).filter((item) => !query || `${item.quote_no}${item.customer_name}${item.style_no}${item.style_name}`.toLowerCase().includes(query)), [data, query]);
  const orders = useMemo(() => (data?.orders || []).filter((item) => !query || `${item.order_no}${item.customer_name}${item.style_no}${item.style_name}`.toLowerCase().includes(query)), [data, query]);
  const schedules = useMemo(() => (data?.schedules || []).filter((item) => !query || `${item.order_no}${item.line_name}${item.style_name}`.toLowerCase().includes(query)), [data, query]);
  const quoteCost = quoteDraft.material_cost + quoteDraft.processing_cost + quoteDraft.other_cost;
  const quotePrice = quoteCost / (1 - quoteDraft.margin / 100);

  if (booting) return <div className="loading-screen"><div className="loading-mark">纫</div><strong>织序正在连接业务数据库</strong><span /></div>;

  if (!data) {
    return <main className="login-page">
      <section className="login-story">
        <div className="login-brand"><span>纫</span><div><strong>织序 ZHIXU</strong><small>GARMENT OPERATIONS</small></div></div>
        <div className="story-copy"><em>从一件成衣，到一条可信的交付链</em><h1>报价、订单与产线<br />在同一节奏里协同。</h1><p>本地部署的工厂业务系统。所有经营数据保存在你的电脑中，不依赖公网服务。</p></div>
        <div className="story-stats"><div><strong>01</strong><span>成本报价</span></div><div><strong>02</strong><span>订单履约</span></div><div><strong>03</strong><span>产线排单</span></div></div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={login}>
          <span className="eyebrow">SECURE ACCESS</span><h2>登录工厂工作台</h2><p>请输入由管理员分配的内部账号</p>
          <label><span>用户名</span><input name="username" defaultValue="admin" autoComplete="username" required /></label>
          <label><span>密码</span><input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="login-button" disabled={loginBusy}>{loginBusy ? "正在验证…" : "安全登录"}<span>→</span></button>
          <small className="login-note">首次登录后，请在右上角修改初始密码</small>
        </form>
      </section>
    </main>;
  }

  const pageTitle = navItems.find((item) => item.id === active)?.label || "经营工作台";

  return <main className="ops-shell">
    <aside className="ops-sidebar">
      <div className="ops-brand"><span>纫</span><div><strong>织序 ZHIXU</strong><small>GARMENT OPERATIONS</small></div></div>
      <div className="organization"><span>苏</span><div><small>当前组织</small><strong>苏州织序服饰</strong></div><i>本地生产库</i></div>
      <nav>
        <p>核心业务</p>
        {navItems.filter((item) => !item.roles || item.roles.includes(data.user.role)).map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => { setActive(item.id); setSearch(""); }}><span>{item.symbol}</span>{item.label}{item.id === "quotes" && data.dashboard.open_quotes > 0 && <em>{data.dashboard.open_quotes}</em>}</button>)}
      </nav>
      <div className="ops-user"><span>{data.user.display_name.slice(0, 1)}</span><div><strong>{data.user.display_name}</strong><small>{labels[data.user.role]}</small></div><button onClick={logout} title="退出登录">↗</button></div>
    </aside>

    <section className="ops-workspace">
      <header className="ops-topbar">
        <div><small>织序 / 业务中心</small><strong>{pageTitle}</strong></div>
        <div className="topbar-actions">
          <label className="global-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索编号、客户、款号" /></label>
          <button className="icon-button" onClick={() => setModal("password")} title="修改密码">⚙</button>
          <button className="user-pill" onClick={() => setModal("password")}><span>{data.user.display_name.slice(0, 1)}</span><div><strong>{data.user.display_name}</strong><small>{labels[data.user.role]}</small></div></button>
        </div>
      </header>

      <div className="ops-content">
        {error && <div className="page-error"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}

        {active === "dashboard" && <>
          <div className="hero-row"><div><span className="eyebrow">FACTORY OVERVIEW</span><h1>今天的工厂，正在有序推进。</h1><p>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date())} · 数据已实时连接本地生产库</p></div>{canQuote && <button className="primary-action" onClick={() => setModal("quote")}>＋ 新建成衣报价</button>}</div>
          <div className="metric-grid">
            <article><span className="metric-icon green">¥</span><div><small>进行中报价</small><strong>{data.dashboard.open_quotes}</strong><p>待客户确认与转单</p></div></article>
            <article><span className="metric-icon blue">▣</span><div><small>履约中订单</small><strong>{data.dashboard.active_orders}</strong><p>{data.dashboard.due_soon} 单将在 14 天内交付</p></div></article>
            <article><span className="metric-icon amber">▦</span><div><small>已排产数量</small><strong>{Number(data.dashboard.planned_quantity).toLocaleString()}</strong><p>件 · 待上线及生产中</p></div></article>
            <article><span className="metric-icon rose">Σ</span><div><small>订单总额</small><strong>{money(data.dashboard.order_value)}</strong><p>不含已取消订单</p></div></article>
          </div>
          <div className="dashboard-grid">
            <section className="panel"><div className="panel-head"><div><h2>近期订单</h2><p>优先关注临近交期的订单</p></div><button onClick={() => setActive("orders")}>查看全部 →</button></div>{data.orders.length ? <div className="compact-list">{data.orders.slice(0, 5).map((order) => <button key={order.id} onClick={() => setActive("orders")}><span className="record-mark">{order.style_no.slice(0, 2)}</span><div><strong>{order.order_no}</strong><small>{order.customer_name} · {order.style_name}</small></div><b>{order.quantity.toLocaleString()} 件</b><div className="due"><span>{dateText(order.due_date)}</span><StatusBadge status={order.status} /></div></button>)}</div> : <Empty text="还没有工厂订单" />}</section>
            <section className="panel"><div className="panel-head"><div><h2>产线负荷</h2><p>当前排单进度</p></div><button onClick={() => setActive("schedules")}>排单管理 →</button></div>{data.schedules.length ? <div className="line-loads">{data.schedules.slice(0, 5).map((schedule) => <div key={schedule.id}><div><span><strong>{schedule.line_name}</strong><small>{schedule.order_no} · {schedule.style_name}</small></span><b>{schedule.progress}%</b></div><div className="progress-track"><i style={{ width: `${schedule.progress}%` }} /></div></div>)}</div> : <Empty text="暂未安排生产计划" />}</section>
          </div>
        </>}

        {active === "quotes" && <section className="module-page">
          <div className="module-head"><div><span className="eyebrow">QUOTATION CONTROL</span><h1>成衣报价</h1><p>从成本核算到客户确认，完整保留每一次报价决策。</p></div><div>{quotes.length > 0 && <button className="secondary-action" onClick={() => downloadCsv("成衣报价", ["报价编号", "客户", "款号", "款式", "数量", "单价", "总额", "状态"], quotes.map((q) => [q.quote_no, q.customer_name, q.style_no, q.style_name, q.quantity, q.unit_price, q.total_amount, labels[q.status]]))}>导出 CSV</button>}{canQuote && <button className="primary-action" onClick={() => setModal("quote")}>＋ 新建报价</button>}</div></div>
          <div className="data-panel">{quotes.length ? <div className="table-wrap"><table><thead><tr><th>报价编号 / 客户</th><th>款式</th><th>数量</th><th>报价单价</th><th>报价总额</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead><tbody>{quotes.map((quote) => <tr key={quote.id}><td><strong>{quote.quote_no}</strong><small>{quote.customer_name}</small></td><td><strong>{quote.style_name}</strong><small>{quote.style_no}</small></td><td>{quote.quantity.toLocaleString()} 件</td><td>{money(quote.unit_price, quote.currency)}</td><td><strong>{money(quote.total_amount, quote.currency)}</strong></td><td>{dateText(quote.valid_until)}</td><td><StatusBadge status={quote.status} /></td><td>{canQuote && quote.status !== "converted" ? <div className="row-actions"><select value={quote.status} onChange={(event) => perform(() => request(`/api/quotes/${quote.id}/status`, { method: "POST", body: JSON.stringify({ status: event.target.value }) }), "报价状态已更新", false)}><option value="draft">草稿</option><option value="sent">已发送</option><option value="accepted">已接受</option><option value="rejected">已拒绝</option><option value="expired">已过期</option></select><button onClick={() => perform(() => request(`/api/quotes/${quote.id}/convert`, { method: "POST", body: "{}" }), "已生成工厂订单")}>转订单</button></div> : "—"}</td></tr>)}</tbody></table></div> : <Empty text="还没有成衣报价" />}</div>
        </section>}

        {active === "orders" && <section className="module-page">
          <div className="module-head"><div><span className="eyebrow">ORDER FULFILLMENT</span><h1>工厂订单</h1><p>跟踪客户、款式、金额、交期与生产状态。</p></div>{orders.length > 0 && <button className="secondary-action" onClick={() => downloadCsv("工厂订单", ["订单编号", "客户", "款号", "款式", "数量", "交期", "总额", "状态"], orders.map((o) => [o.order_no, o.customer_name, o.style_no, o.style_name, o.quantity, o.due_date, o.total_amount, labels[o.status]]))}>导出 CSV</button>}</div>
          <div className="data-panel">{orders.length ? <div className="table-wrap"><table><thead><tr><th>订单编号 / 客户</th><th>款式</th><th>订单数量</th><th>订单金额</th><th>交付日期</th><th>履约状态</th><th>操作</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.order_no}</strong><small>{order.customer_name}</small></td><td><strong>{order.style_name}</strong><small>{order.style_no}</small></td><td>{order.quantity.toLocaleString()} 件</td><td><strong>{money(order.total_amount, order.currency)}</strong></td><td className={new Date(order.due_date) < new Date() && !["completed", "cancelled"].includes(order.status) ? "overdue" : ""}>{dateText(order.due_date)}</td><td><StatusBadge status={order.status} /></td><td>{canOperateOrders ? <select className="status-select" value={order.status} onChange={(event) => perform(() => request(`/api/orders/${order.id}/status`, { method: "POST", body: JSON.stringify({ status: event.target.value }) }), "订单状态已更新", false)}><option value="confirmed">已确认</option><option value="material_preparing">备料中</option><option value="scheduled">已排单</option><option value="in_production">生产中</option><option value="quality_check">质检中</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select> : "—"}</td></tr>)}</tbody></table></div> : <Empty text="报价转订单后将显示在这里" />}</div>
        </section>}

        {active === "schedules" && <section className="module-page">
          <div className="module-head"><div><span className="eyebrow">PRODUCTION SCHEDULING</span><h1>生产排单</h1><p>按订单拆分产线任务，控制上线日期与完成进度。</p></div><div>{schedules.length > 0 && <button className="secondary-action" onClick={() => downloadCsv("生产排单", ["订单", "产线", "款式", "开始", "结束", "数量", "进度", "状态"], schedules.map((s) => [s.order_no, s.line_name, s.style_name, s.start_date, s.end_date, s.planned_quantity, `${s.progress}%`, labels[s.status]]))}>导出 CSV</button>}{canPlan && <button className="primary-action" onClick={() => setModal("schedule")}>＋ 新增排单</button>}</div></div>
          {schedules.length ? <div className="schedule-grid">{schedules.map((schedule) => <article className="schedule-card" key={schedule.id}><header><div><span className="line-tag">{schedule.line_name}</span><StatusBadge status={schedule.status} /></div><strong>{schedule.order_no}</strong><small>{schedule.customer_name}</small></header><div className="schedule-style"><span>{schedule.style_no.slice(0, 2)}</span><div><strong>{schedule.style_name}</strong><small>{schedule.style_no} · {schedule.planned_quantity.toLocaleString()} 件</small></div></div><div className="schedule-dates"><span><small>上线日期</small><strong>{dateText(schedule.start_date)}</strong></span><i>→</i><span><small>计划完成</small><strong>{dateText(schedule.end_date)}</strong></span></div><div className="progress-head"><span>完成进度</span><strong>{schedule.progress}%</strong></div><div className="progress-track large"><i style={{ width: `${schedule.progress}%` }} /></div>{canPlan && <div className="schedule-actions"><button disabled={busy || schedule.status === "completed"} onClick={() => { const next = schedule.status === "planned" ? { status: "ready", progress: 10 } : schedule.status === "ready" ? { status: "running", progress: 25 } : schedule.progress >= 75 ? { status: "completed", progress: 100 } : { status: "running", progress: schedule.progress + 25 }; perform(() => request(`/api/schedules/${schedule.id}/status`, { method: "POST", body: JSON.stringify(next) }), "生产进度已更新", false); }}>{schedule.status === "completed" ? "已完成" : schedule.status === "planned" ? "确认备产" : schedule.status === "ready" ? "开始生产" : "推进 25%"}</button>{schedule.status === "running" && <button className="pause" onClick={() => perform(() => request(`/api/schedules/${schedule.id}/status`, { method: "POST", body: JSON.stringify({ status: "paused", progress: schedule.progress }) }), "排单已暂停", false)}>暂停</button>}</div>}</article>)}</div> : <div className="data-panel"><Empty text="还没有生产排单" /></div>}
        </section>}

        {active === "users" && data.user.role === "admin" && <section className="module-page">
          <div className="module-head"><div><span className="eyebrow">ACCESS CONTROL</span><h1>账号与权限</h1><p>为业务、计划和管理人员分配最小必要权限。</p></div><button className="primary-action" onClick={() => setModal("user")}>＋ 新增账号</button></div>
          <div className="user-grid">{data.users.map((user) => <article key={user.id}><span className="large-avatar">{user.display_name.slice(0, 1)}</span><div><strong>{user.display_name}</strong><small>@{user.username}</small></div><StatusBadge status={user.active ? "accepted" : "paused"} /><p>{labels[user.role]}</p><em>创建于 {dateText(user.created_at || "")}</em></article>)}</div>
        </section>}

        {active === "audit" && data.user.role === "admin" && <section className="module-page">
          <div className="module-head"><div><span className="eyebrow">AUDIT TRAIL</span><h1>操作审计</h1><p>最近 100 条关键业务操作，便于责任追踪。</p></div></div>
          <div className="audit-list">{data.audit.map((item) => <article key={item.id}><span>{item.username.slice(0, 1).toUpperCase()}</span><div><strong>{item.username}</strong><p>{labels[item.action] || item.action} · {labels[item.entity_type] || item.entity_type}{item.entity_id ? ` #${item.entity_id}` : ""}</p></div><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></article>)}</div>
        </section>}
      </div>
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}><section className="modal-card">
      <header><div><span className="eyebrow">ZHIXU WORKFLOW</span><h2>{modal === "quote" ? "新建成衣报价" : modal === "schedule" ? "新增生产排单" : modal === "user" ? "新增内部账号" : "修改登录密码"}</h2></div><button onClick={() => setModal(null)}>×</button></header>

      {modal === "quote" && <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); perform(() => request("/api/quotes", { method: "POST", body: JSON.stringify({ customer_name: form.get("customer_name"), style_no: form.get("style_no"), style_name: form.get("style_name"), quantity: quoteDraft.quantity, currency: form.get("currency"), material_cost: quoteDraft.material_cost, processing_cost: quoteDraft.processing_cost, other_cost: quoteDraft.other_cost, margin: quoteDraft.margin, valid_until: form.get("valid_until"), notes: form.get("notes") }) }), "报价已保存到生产数据库"); }}>
        <div className="form-grid-new"><label className="wide"><span>客户名称 *</span><input name="customer_name" list="customer-list" required placeholder="例如：上海叙白服饰有限公司" /><datalist id="customer-list">{data.customers.map((customer) => <option key={customer.id} value={customer.name} />)}</datalist></label><label><span>款号 *</span><input name="style_no" required placeholder="TS-2608-014" /></label><label><span>款式名称 *</span><input name="style_name" required placeholder="重磅精梳棉宽松短袖" /></label><label><span>报价数量 *</span><input type="number" min="1" value={quoteDraft.quantity} onChange={(e) => setQuoteDraft({ ...quoteDraft, quantity: Number(e.target.value) })} required /></label><label><span>币种</span><select name="currency"><option value="CNY">人民币 CNY</option><option value="USD">美元 USD</option></select></label><label><span>物料成本 / 件</span><input type="number" min="0" step="0.01" value={quoteDraft.material_cost} onChange={(e) => setQuoteDraft({ ...quoteDraft, material_cost: Number(e.target.value) })} /></label><label><span>加工成本 / 件</span><input type="number" min="0" step="0.01" value={quoteDraft.processing_cost} onChange={(e) => setQuoteDraft({ ...quoteDraft, processing_cost: Number(e.target.value) })} /></label><label><span>其他费用 / 件</span><input type="number" min="0" step="0.01" value={quoteDraft.other_cost} onChange={(e) => setQuoteDraft({ ...quoteDraft, other_cost: Number(e.target.value) })} /></label><label><span>目标毛利率 %</span><input type="number" min="0" max="89" step="0.5" value={quoteDraft.margin} onChange={(e) => setQuoteDraft({ ...quoteDraft, margin: Number(e.target.value) })} /></label><label><span>有效期至</span><input name="valid_until" type="date" defaultValue={DEFAULT_VALID_UNTIL} /></label><label className="wide"><span>报价备注</span><textarea name="notes" placeholder="包装、税费、运输与大货确认说明" /></label></div>
        <div className="quote-preview"><span><small>核算成本</small><strong>{money(quoteCost)}</strong></span><i /><span><small>建议单价</small><strong>{money(quotePrice)}</strong></span><i /><span><small>预计总额</small><strong>{money(quotePrice * quoteDraft.quantity)}</strong></span></div>
        <footer><button type="button" className="secondary-action" onClick={() => setModal(null)}>取消</button><button className="primary-action" disabled={busy}>{busy ? "正在保存…" : "保存报价"}</button></footer>
      </form>}

      {modal === "schedule" && <form onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); perform(() => request("/api/schedules", { method: "POST", body: JSON.stringify({ ...form, order_id: Number(form.order_id), planned_quantity: Number(form.planned_quantity) }) }), "生产排单已创建"); }}><div className="form-grid-new"><label className="wide"><span>工厂订单 *</span><select name="order_id" required><option value="">请选择待排产订单</option>{data.orders.filter((order) => !["completed", "cancelled"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.order_no} · {order.style_name} · {order.quantity}件</option>)}</select></label><label><span>生产线 *</span><input name="line_name" required placeholder="例如：针织一线" /></label><label><span>排产数量 *</span><input name="planned_quantity" type="number" min="1" required /></label><label><span>上线日期 *</span><input name="start_date" type="date" required /></label><label><span>计划完成 *</span><input name="end_date" type="date" required /></label><label className="wide"><span>生产备注</span><textarea name="notes" placeholder="面辅料、工艺或交付注意事项" /></label></div><footer><button type="button" className="secondary-action" onClick={() => setModal(null)}>取消</button><button className="primary-action" disabled={busy}>{busy ? "正在保存…" : "确认排单"}</button></footer></form>}

      {modal === "user" && <form onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); perform(() => request("/api/users", { method: "POST", body: JSON.stringify(form) }), "内部账号已创建"); }}><div className="form-grid-new"><label><span>用户名 *</span><input name="username" minLength={3} required autoComplete="off" /></label><label><span>姓名 *</span><input name="display_name" required /></label><label><span>角色 *</span><select name="role"><option value="sales">业务员</option><option value="planner">计划员</option><option value="viewer">只读用户</option><option value="admin">系统管理员</option></select></label><label><span>初始密码 *</span><input name="password" type="password" minLength={10} required autoComplete="new-password" /></label></div><div className="permission-note">业务员可维护报价和订单；计划员可维护订单状态与排单；只读用户仅查看；管理员拥有全部权限。</div><footer><button type="button" className="secondary-action" onClick={() => setModal(null)}>取消</button><button className="primary-action" disabled={busy}>创建账号</button></footer></form>}

      {modal === "password" && <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const next = String(form.get("new_password")); if (next !== form.get("confirm_password")) { setError("两次输入的新密码不一致"); return; } perform(() => request("/api/change-password", { method: "POST", body: JSON.stringify({ current_password: form.get("current_password"), new_password: next }) }), "密码已更新"); }}><div className="form-grid-new one"><label><span>当前密码 *</span><input name="current_password" type="password" required autoComplete="current-password" /></label><label><span>新密码 *</span><input name="new_password" type="password" minLength={10} required autoComplete="new-password" /></label><label><span>确认新密码 *</span><input name="confirm_password" type="password" minLength={10} required autoComplete="new-password" /></label></div><div className="permission-note">新密码至少 10 位。修改后，其他已登录设备会自动退出。</div><footer><button type="button" className="secondary-action" onClick={() => setModal(null)}>取消</button><button className="primary-action" disabled={busy}>更新密码</button></footer></form>}
    </section></div>}

    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}

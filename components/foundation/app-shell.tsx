"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export function AppShell({ title, children, onRequestNavigation }: { title: string; children: ReactNode; onRequestNavigation?: (target: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const navigate = onRequestNavigation ?? ((target: string) => router.push(target));
  const [basicOpen, setBasicOpen] = useState(pathname.startsWith("/basic-settings"));
  const nav = [
    { label: "经营工作台", symbol: "⌂", href: "/", active: pathname === "/" },
    { label: "报价中心", symbol: "¥", href: "/quote-center", active: pathname.startsWith("/quote-center") },
    { label: "工厂订单", symbol: "▣", href: "/", active: false },
    { label: "生产排单", symbol: "▦", href: "/", active: false },
  ];

  return <main className="ops-shell qc-app-shell">
    <aside className="ops-sidebar">
      <div className="ops-brand"><span>纫</span><div><strong>织序 ZHIXU</strong><small>GARMENT OPERATIONS</small></div></div>
      <div className="organization"><span>苏</span><div><small>当前组织</small><strong>苏州织序服饰</strong></div><i>报价 UI V1</i></div>
      <nav aria-label="主导航"><p>核心业务</p>{nav.slice(0, 2).map((item) => <button key={item.label} className={item.active ? "active" : ""} onClick={() => navigate(item.href)}><span>{item.symbol}</span>{item.label}</button>)}<button className={pathname.startsWith("/basic-settings") ? "active" : ""} aria-expanded={basicOpen} onClick={() => { setBasicOpen(true); if (!pathname.startsWith("/basic-settings")) navigate("/basic-settings/brands"); else setBasicOpen(!basicOpen); }}><span>⚙</span>基础设置<i>{basicOpen ? "⌃" : "⌄"}</i></button>{basicOpen && <div className="ops-subnav"><button className={pathname === "/basic-settings/brands" ? "active" : ""} onClick={() => navigate("/basic-settings/brands")}>品牌设置</button><button className={pathname === "/basic-settings/customer-salespeople" ? "active" : ""} onClick={() => navigate("/basic-settings/customer-salespeople")}>客户业务员设置</button></div>}{nav.slice(2).map((item) => <button key={item.label} className={item.active ? "active" : ""} onClick={() => navigate(item.href)}><span>{item.symbol}</span>{item.label}</button>)}</nav>
      <div className="ops-user"><span>林</span><div><strong>林青禾</strong><small>高级业务经理</small></div><button onClick={() => navigate("/")} title="返回原 ERP">↗</button></div>
    </aside>
    <section className="ops-workspace">
      <header className="ops-topbar">
        <div><small>织序 / 业务中心 / {pathname.startsWith("/basic-settings") ? "基础设置" : "报价中心"}</small><strong>{title}</strong></div>
        <div className="topbar-actions"><button className="icon-button" title="通知">♢</button><button className="user-pill"><span>林</span><div><strong>林青禾</strong><small>高级业务经理</small></div></button></div>
      </header>
      {children}
    </section>
  </main>;
}

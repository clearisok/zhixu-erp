"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useResponsiveMode } from "./responsive";
import { SidebarFloatingMenu } from "./sidebar-floating-menu";
import { usePermissions } from "@/features/permissions";
import { GlobalSearchPalette } from "@/features/global-search";

const basicRoutes = [
  { label: "品牌设置", href: "/basic-settings/brands" },
  { label: "客户业务员设置", href: "/basic-settings/customer-salespeople" },
  { label: "面料库", href: "/basic-settings/fabrics" },
  { label: "辅料库", href: "/basic-settings/trims" },
];

const systemRoutes = [
  { label: "报价设置", href: "/system-settings/quote-settings" },
  { label: "模板设置", href: "/basic-settings/templates" },
  { label: "用户权限", href: "/basic-settings/user-permissions" },
  { label: "操作日志", href: "/system-settings/operation-logs" },
];

export function AppShell({ title, children, onRequestNavigation }: { title: string; children: ReactNode; onRequestNavigation?: (target: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const navigateRequest = onRequestNavigation ?? ((target: string) => router.push(target));
  const basicTriggerRef = useRef<HTMLButtonElement | null>(null);
  const systemTriggerRef = useRef<HTMLButtonElement | null>(null);
  const viewportMode = useResponsiveMode();
  const basicActive = basicRoutes.some((route) => pathname === route.href);
  const systemActive = systemRoutes.some((route) => pathname === route.href);
  const [basicOpen, setBasicOpen] = useState(basicActive);
  const [systemOpen, setSystemOpen] = useState(systemActive);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const { state: permissionState, currentUser, currentRole, can, setCurrentUser } = usePermissions();
  const userInitial = currentUser.name.trim().slice(0, 1) || "用";

  const closeMenus = useCallback(() => {
    setBasicOpen(false);
    setSystemOpen(false);
  }, []);

  useEffect(() => {
    if (viewportMode !== "mobile" || (!basicOpen && !systemOpen)) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [basicOpen, closeMenus, systemOpen, viewportMode]);

  useEffect(() => {
    const openGlobalSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    document.addEventListener("keydown", openGlobalSearch);
    return () => document.removeEventListener("keydown", openGlobalSearch);
  }, []);

  const navigate = (target: string) => {
    setBasicOpen(false);
    setSystemOpen(false);
    navigateRequest(target);
  };
  const nav = [
    { label: "经营工作台", symbol: "⌂", href: "/", active: pathname === "/" },
    { label: "报价中心", symbol: "¥", href: "/quote-center", active: pathname.startsWith("/quote-center") },
    { label: "工厂订单", symbol: "▣", href: "/", active: false },
    { label: "生产排单", symbol: "▦", href: "/", active: false },
  ];

  const basicMenuItems = <>
    {basicRoutes.map((item) => <button key={item.href} type="button" role="menuitem" className={pathname === item.href ? "active" : ""} onClick={() => navigate(item.href)}>{item.label}</button>)}
  </>;
  const systemMenuItems = <>
    {systemRoutes.map((item) => <button key={item.href} type="button" role="menuitem" className={pathname === item.href ? "active" : ""} onClick={() => navigate(item.href)}>{item.label}</button>)}
  </>;

  return <main className="ops-shell qc-app-shell" data-responsive-mode={viewportMode}>
    <aside className="ops-sidebar">
      <div className="ops-brand"><span>纫</span><div><strong>织序 ZHIXU</strong><small>GARMENT OPERATIONS</small></div></div>
      <div className="organization"><span>苏</span><div><small>当前组织</small><strong>苏州织序服饰</strong></div><i>报价 UI V1</i></div>
      <nav aria-label="主导航">
        {nav.slice(0, 2).map((item) => <button key={item.label} type="button" title={item.label} aria-label={item.label} className={item.active ? "active" : ""} onClick={() => navigate(item.href)}><span>{item.symbol}</span><b>{item.label}</b></button>)}
        <div className="ops-nav-item">
          <button ref={basicTriggerRef} type="button" title="基础设置" aria-label="基础设置" className={basicActive ? "active" : ""} aria-expanded={basicOpen} aria-haspopup="menu" aria-controls="sidebar-basic-menu" onClick={() => { setSystemOpen(false); setBasicOpen((open) => !open); }}><span>⚙</span><b>基础设置</b><i>{basicOpen ? "⌃" : "⌄"}</i></button>
          {basicOpen && viewportMode === "desktop" && <div className="ops-subnav" role="menu" aria-label="基础设置菜单">{basicMenuItems}</div>}
          <SidebarFloatingMenu id="sidebar-basic-menu" open={basicOpen && viewportMode !== "desktop" && viewportMode !== "mobile"} anchorRef={basicTriggerRef} label="基础设置菜单" onClose={closeMenus}>{basicMenuItems}</SidebarFloatingMenu>
        </div>
        {nav.slice(2).map((item) => <button key={item.label} type="button" title={item.label} aria-label={item.label} className={item.active ? "active" : ""} onClick={() => navigate(item.href)}><span>{item.symbol}</span><b>{item.label}</b></button>)}
        <div className="ops-nav-item ops-system-entry">
          <button ref={systemTriggerRef} type="button" title="系统设置" aria-label="系统设置" className={systemActive ? "active" : ""} aria-expanded={systemOpen} aria-haspopup="menu" aria-controls="sidebar-system-menu" onClick={() => { setBasicOpen(false); setSystemOpen((open) => !open); }}><span>⋯</span><b>系统设置</b><i>{systemOpen ? "⌃" : "⌄"}</i></button>
          {systemOpen && viewportMode === "desktop" && <div className="ops-subnav" role="menu" aria-label="系统设置菜单">{systemMenuItems}</div>}
          <SidebarFloatingMenu id="sidebar-system-menu" open={systemOpen && viewportMode !== "desktop" && viewportMode !== "mobile"} anchorRef={systemTriggerRef} label="系统设置菜单" onClose={closeMenus}>{systemMenuItems}</SidebarFloatingMenu>
        </div>
      </nav>
      <div className="ops-user"><span>{userInitial}</span><div><strong>{currentUser.name}</strong><small>{currentRole.name}</small></div></div>
    </aside>

    <section className="ops-workspace">
      <header className="ops-topbar">
        <div><small>织序 / 业务中心 / {basicActive ? "基础设置" : systemActive ? "系统设置" : "报价中心"}</small><strong>{title}</strong></div>
        <div className="topbar-actions"><button type="button" className="qc-global-search-trigger" aria-label="打开全局搜索" title="全局搜索（Ctrl+K）" onClick={() => setGlobalSearchOpen(true)}><span>⌕</span><b>搜索</b><kbd>Ctrl K</kbd></button><button type="button" className="icon-button" title="通知">♢</button><label className="qc-test-user-switcher" title="切换测试账号"><span>{userInitial}</span><select aria-label="切换测试账号" value={currentUser.id} onChange={(event) => setCurrentUser(event.target.value)}>{permissionState.users.filter((user) => user.status === "active").map((user) => <option key={user.id} value={user.id}>{user.name} · {permissionState.roles.find((role) => role.id === user.roleId)?.name ?? "未分配"}</option>)}</select></label></div>
      </header>
      {children}
    </section>

    {viewportMode === "mobile" && <nav className="ops-mobile-nav" aria-label="移动端主导航">
      <button type="button" className={pathname.startsWith("/quote-center") ? "active" : ""} onClick={() => navigate("/quote-center")}><span>¥</span>报价中心</button>
      <button type="button" className={basicActive ? "active" : ""} aria-expanded={basicOpen} onClick={() => { setSystemOpen(false); setBasicOpen((open) => !open); }}><span>⚙</span>基础设置</button>
      <button type="button" className={systemActive ? "active" : ""} aria-expanded={systemOpen} onClick={() => { setBasicOpen(false); setSystemOpen((open) => !open); }}><span>⋯</span>系统设置</button>
    </nav>}

    {viewportMode === "mobile" && (basicOpen || systemOpen) && <div className="ops-mobile-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && (setBasicOpen(false), setSystemOpen(false))}>
      <section className="ops-mobile-drawer" role="dialog" aria-modal="true" aria-label={basicOpen ? "基础设置" : "系统设置"}>
        <header><strong>{basicOpen ? "基础设置" : "系统设置"}</strong><button type="button" aria-label="关闭" onClick={() => { setBasicOpen(false); setSystemOpen(false); }}>×</button></header>
        <div>
          {(basicOpen ? basicRoutes : systemRoutes).map((item) => <button key={item.href} type="button" className={pathname === item.href ? "active" : ""} onClick={() => navigate(item.href)}>{item.label}<span>›</span></button>)}
        </div>
      </section>
    </div>}
    <GlobalSearchPalette open={globalSearchOpen} context={{ userId: currentUser.id, can }} onClose={() => setGlobalSearchOpen(false)} onNavigate={navigate} />
  </main>;
}

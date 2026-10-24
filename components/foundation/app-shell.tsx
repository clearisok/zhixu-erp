"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useResponsiveMode } from "./responsive";
import { SidebarFloatingMenu } from "./sidebar-floating-menu";
import { Drawer } from "./drawer";
import { ServerUserMenu } from "./server-user-menu";
import { usePermissions } from "@/features/permissions";
import { GlobalSearchPalette } from "@/features/global-search";
import { useServerSession } from "@/features/server-auth";
import { browserIdentityMode } from "@/features/server-auth/identity-mode";
import { loadSidebarPreference, saveSidebarPreference } from "./sidebar-preference";
import { isEnabledServerRoute, quoteAuthority } from "@/features/quote-center/authority/quote-authority";
import { useProtectedRouter, useServerNavigationControls } from "./server-navigation-protection";

const basicRoutes = [
  { label: "品牌设置", href: "/basic-settings/brands" },
  { label: "客户业务员设置", href: "/basic-settings/customer-salespeople" },
  { label: "面料库", href: "/basic-settings/fabrics" },
  { label: "辅料库", href: "/basic-settings/trims" },
  { label: "生产组", href: "/basic-settings/production-groups" },
  { label: "外发厂", href: "/basic-settings/outsource-factories" },
];

const systemRoutes = [
  { label: "进度设置", href: "/system-settings/progress-settings" },
  { label: "报价设置", href: "/system-settings/quote-settings" },
  { label: "模板设置", href: "/basic-settings/templates" },
  { label: "用户权限", href: "/basic-settings/user-permissions" },
  { label: "操作日志", href: "/system-settings/operation-logs" },
  { label: "关账设置", href: "/system-settings/closing-settings" },
  { label: "生产与运输", href: "/system-settings/production-infrastructure" },
  { label: "数据管理", href: "/system-settings/data-management" },
];
const serverBasicRoutes = [
  { label: "品牌设置", href: "/basic-settings/server/brands" },
  { label: "客户业务员设置", href: "/basic-settings/server/customer-salespeople" },
  { label: "面料库", href: "/basic-settings/server/fabrics" },
  { label: "辅料库", href: "/basic-settings/server/trims" },
];
const serverSystemRoutes = [{ label: "报价设置", href: "/system-settings/server/quote-settings" }, { label: "进度设置", href: "/system-settings/progress-settings" }];

export type AppShellBackTarget = {
  href: string;
  label: string;
};

type AppShellProps = { title: string; children: ReactNode; onRequestNavigation?: (target: string) => void; onRequestLogout?: () => Promise<void>; backTarget?: AppShellBackTarget; identityMode?: "browser" | "server" };
type ShellPage = Omit<AppShellProps, "children" | "identityMode"> & { token: symbol; route: string; scope: string };
const ServerShellContext = createContext<{ scope: string; register(page: ShellPage): () => void } | null>(null);

/** The Server boundary owns only the frame; page state and authority stay in the page. */
export function PersistentServerAppShell({ children, scope, title = "业务工作区" }: { children: ReactNode; scope: string | null; title?: string }) {
  const path = usePathname(), search = useSearchParams().toString();
  const route = `${path}?${search}`;
  const [page, setPage] = useState<ShellPage | null>(null);
  const register = useCallback((next: ShellPage) => {
    setPage(next);
    return () => setPage(current => current?.token === next.token ? null : current);
  }, []);
  const context = useMemo(() => ({ scope: scope ?? "unavailable", register }), [scope, register]);
  // A stale page may finish cleanup after its replacement. Never use its identity/title/callbacks.
  const current = scope !== null && page?.scope === scope && page.route === route ? page : null;
  return <ServerShellContext.Provider value={context}><AppShellFrame title={current?.title ?? title} identityMode="server" backTarget={current?.backTarget} onRequestNavigation={current?.onRequestNavigation} onRequestLogout={current?.onRequestLogout}>{children}</AppShellFrame></ServerShellContext.Provider>;
}

function ServerShellPage({ children, title, backTarget, onRequestNavigation, onRequestLogout }: AppShellProps) {
  const context = useContext(ServerShellContext)!;
  const path = usePathname(), search = useSearchParams().toString();
  const token = useRef(Symbol("shell-page"));
  const callbacks = useRef({ onRequestNavigation, onRequestLogout });
  useLayoutEffect(() => { callbacks.current = { onRequestNavigation, onRequestLogout }; });
  const router = useRouter();
  const session = useServerSession();
  const navigation = useCallback((target: string) => callbacks.current.onRequestNavigation ? callbacks.current.onRequestNavigation(target) : router.push(target), [router]);
  const logout = useCallback(() => callbacks.current.onRequestLogout ? callbacks.current.onRequestLogout() : session.logout(), [session]);
  const backHref = backTarget?.href, backLabel = backTarget?.label;
  const hasNavigation = Boolean(onRequestNavigation), hasLogout = Boolean(onRequestLogout);
  useLayoutEffect(() => context.register({ token: token.current, route: `${path}?${search}`, scope: context.scope, title, backTarget: backHref && backLabel ? { href: backHref, label: backLabel } : undefined, onRequestNavigation: hasNavigation ? navigation : undefined, onRequestLogout: hasLogout ? logout : undefined }), [context, path, search, title, backHref, backLabel, hasNavigation, hasLogout, navigation, logout]);
  return children;
}

export function AppShell(props: AppShellProps) {
  const context = useContext(ServerShellContext);
  return context ? <ServerShellPage {...props} /> : <AppShellFrame {...props} />;
}

function AppShellFrame({ title, children, onRequestNavigation, onRequestLogout, backTarget, identityMode = "browser" }: AppShellProps) {
  const freshServer = quoteAuthority() === "server";
  if (freshServer) identityMode = "server";
  const router = useProtectedRouter();
  const pathname = usePathname();
  const serverSession = useServerSession();
  const navigationControls = useServerNavigationControls();
  const navigateRequest = (target: string) => {
    if (navigationControls && !navigationControls.check(Boolean(onRequestNavigation))) return;
    const run = () => onRequestNavigation ? onRequestNavigation(target) : router.push(target);
    if (navigationControls) navigationControls.confirmed(run); else run();
  };
  const requestLogout = async () => {
    if (navigationControls && !navigationControls.check(Boolean(onRequestLogout))) return;
    const run = () => (onRequestLogout ?? serverSession.logout)();
    await (navigationControls ? navigationControls.confirmed(run) : run());
  };
  const basicTriggerRef = useRef<HTMLButtonElement | null>(null);
  const systemTriggerRef = useRef<HTMLButtonElement | null>(null);
  const viewportMode = useResponsiveMode();
  const serverSettingsMode = !freshServer && identityMode === "server" && (pathname.startsWith("/basic-settings/server/") || pathname === "/system-settings/server/quote-settings" || pathname === "/system-settings/progress-settings");
  const localSingleUser = browserIdentityMode() === "local-single-user";
  const visibleBasicRoutes = (serverSettingsMode ? serverBasicRoutes : basicRoutes).filter((route) => !freshServer || isEnabledServerRoute(route.href));
  const formalSystemRoutes = [
    {label:"进度设置",href:"/system-settings/progress-settings"},
    {label:"报价设置",href:"/system-settings/quote-settings"},
    {label:"角色权限",href:"/system-settings/roles"},
    {label:"用户管理",href:"/system-settings/users"},
    {label:"操作日志",href:"/system-settings/operation-logs"},
  ];
  const visibleSystemRoutes = (freshServer ? formalSystemRoutes : serverSettingsMode ? serverSystemRoutes : systemRoutes).filter((route) => (route.href !== "/system-settings/progress-settings" || freshServer && isEnabledServerRoute(route.href)) && (!freshServer || isEnabledServerRoute(route.href)) && (!localSingleUser || route.href !== "/basic-settings/user-permissions" && route.href !== "/system-settings/roles" && route.href !== "/system-settings/users") && (!freshServer || !["/system-settings/roles","/system-settings/users"].includes(route.href) || serverSession.hasPermission("user_permissions.manage")));
  const basicActive = visibleBasicRoutes.some((route) => pathname === route.href);
  const systemActive = visibleSystemRoutes.some((route) => pathname === route.href) || freshServer && pathname === "/basic-settings/user-permissions";
  const personalActive = pathname.startsWith("/my-settings/");
  const [basicOpen, setBasicOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const { state: permissionState, currentUser, currentRole, can, setCurrentUser } = usePermissions();
  const serverIdentityMode = identityMode === "server";
  const showSettingsNavigation = freshServer || localSingleUser || !serverIdentityMode || serverSettingsMode;
  const visibleUserName = localSingleUser ? "本地开发用户" : serverIdentityMode ? serverSession.user?.name ?? "Server 会话" : currentUser.name;
  const visibleUserDetail = localSingleUser ? "Local Development · Single User" : serverIdentityMode
    ? serverSession.user ? `${serverSession.user.username} · Server identity` : "Trusted Server identity"
    : `${currentRole.name} · 我的设置`;
  const preferenceUserId = localSingleUser ? "local-single-user" : serverIdentityMode ? serverSession.user?.id ?? "server-session" : currentUser.id;
  const userInitial = visibleUserName.trim().slice(0, 1) || "用";

  const closeMenus = useCallback(() => {
    setBasicOpen(false);
    setSystemOpen(false);
  }, []);

  useEffect(() => {
    if (serverIdentityMode) return;
    const openGlobalSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    document.addEventListener("keydown", openGlobalSearch);
    return () => document.removeEventListener("keydown", openGlobalSearch);
  }, [serverIdentityMode]);

  useEffect(() => {
    Promise.resolve().then(() => {
      setBasicOpen(false);
      setSystemOpen(false);
    });
  }, [pathname]);

  useEffect(() => {
    if (freshServer) return; // Legacy preference store also initializes the Browser business manifest.
    Promise.resolve().then(() => setSidebarCollapsed(loadSidebarPreference(preferenceUserId).collapsed));
  }, [preferenceUserId, freshServer]);

  const navigate = (target: string) => {
    setBasicOpen(false);
    setSystemOpen(false);
    setNavigationOpen(false);
    navigateRequest(target);
  };
  const nav = [
    { label: "经营工作台", symbol: "⌂", href: "/", active: pathname === "/" },
    { label: "报价中心", symbol: "¥", href: "/quote-center", active: pathname.startsWith("/quote-center") },
    { label: "订单中心", symbol: "▣", href: "/order-center", active: pathname.startsWith("/order-center") || pathname.startsWith("/ainuoke-sync") },
    { label: "生产排单", symbol: "▦", href: "/production-scheduling", active: pathname.startsWith("/production-scheduling") },
    { label: "关账中心", symbol: "结", href: "/closing-center", active: pathname.startsWith("/closing-center") },
  ].filter((route) => !freshServer || route.href === "/quote-center" || route.href === "/order-center" && isEnabledServerRoute(route.href));

  const basicMenuItems = <>
    {visibleBasicRoutes.map((item) => <button key={item.href} type="button" role="menuitem" className={pathname === item.href ? "active" : ""} onClick={() => navigate(item.href)}>{item.label}</button>)}
  </>;
  const systemMenuItems = <>
    {visibleSystemRoutes.map((item) => <button key={item.href} type="button" role="menuitem" className={pathname === item.href ? "active" : ""} onClick={() => navigate(item.href)}>{item.label}</button>)}
  </>;
  const desktopSidebar = viewportMode === "wide" || viewportMode === "primary";
  const expandedSidebar = desktopSidebar && !sidebarCollapsed;
  const compactSidebar = viewportMode === "compact" || desktopSidebar && sidebarCollapsed;
  const touchNavigation = viewportMode === "tablet" || viewportMode === "mobile";

  const toggleSidebar = () => {
    const collapsed = !sidebarCollapsed;
    setSidebarCollapsed(collapsed);
    if (!freshServer) saveSidebarPreference({ userId: preferenceUserId, collapsed });
    closeMenus();
  };

  return <main className="ops-shell qc-app-shell" data-responsive-mode={viewportMode} data-sidebar-state={sidebarCollapsed ? "collapsed" : "expanded"}>
    <aside className="ops-sidebar">
      <div className="ops-brand"><span>纫</span><div><strong>织序 ZHIXU</strong><small>GARMENT OPERATIONS</small></div></div>
      {desktopSidebar && <button type="button" className="ops-sidebar-toggle" aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"} title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"} onClick={toggleSidebar}><span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span><b>{sidebarCollapsed ? "展开" : "收起"}</b></button>}
      <div className="organization"><span>织</span><div><small>当前组织</small><strong>{quoteAuthority() === "server" ? "尚未配置组织" : "苏州织序服饰"}</strong></div><i>报价 UI V1</i></div>
      <nav aria-label="主导航">
        {!serverSettingsMode && nav.slice(0, 2).map((item) => <button key={item.label} type="button" title={item.label} aria-label={item.label} className={item.active ? "active" : ""} onClick={() => navigate(item.href)}><span>{item.symbol}</span><b>{item.label}</b></button>)}
        {showSettingsNavigation && <div className="ops-nav-item">
          <button ref={basicTriggerRef} type="button" title="基础设置" aria-label="基础设置" className={basicActive ? "active" : ""} aria-expanded={basicOpen} aria-haspopup="menu" aria-controls="sidebar-basic-menu" onClick={() => { setSystemOpen(false); setBasicOpen((open) => !open); }}><span>⚙</span><b>基础设置</b><i>{basicOpen ? "⌃" : "⌄"}</i></button>
          {basicOpen && expandedSidebar && <div className="ops-subnav" role="menu" aria-label="基础设置菜单">{basicMenuItems}</div>}
          <SidebarFloatingMenu id="sidebar-basic-menu" open={basicOpen && compactSidebar} anchorRef={basicTriggerRef} label="基础设置菜单" onClose={closeMenus}>{basicMenuItems}</SidebarFloatingMenu>
        </div>}
        {!serverSettingsMode && nav.slice(2).map((item) => <button key={item.label} type="button" title={item.label} aria-label={item.label} className={item.active ? "active" : ""} onClick={() => navigate(item.href)}><span>{item.symbol}</span><b>{item.label}</b></button>)}
        {showSettingsNavigation && <div className="ops-nav-item ops-system-entry">
          <button ref={systemTriggerRef} type="button" title="系统设置" aria-label="系统设置" className={systemActive ? "active" : ""} aria-expanded={systemOpen} aria-haspopup="menu" aria-controls="sidebar-system-menu" onClick={() => { setBasicOpen(false); setSystemOpen((open) => !open); }}><span>⋯</span><b>系统设置</b><i>{systemOpen ? "⌃" : "⌄"}</i></button>
          {systemOpen && expandedSidebar && <div className="ops-subnav" role="menu" aria-label="系统设置菜单">{systemMenuItems}</div>}
          <SidebarFloatingMenu id="sidebar-system-menu" open={systemOpen && compactSidebar} anchorRef={systemTriggerRef} label="系统设置菜单" onClose={closeMenus}>{systemMenuItems}</SidebarFloatingMenu>
        </div>}
      </nav>
      {serverIdentityMode || localSingleUser
        ? <div className="ops-user ops-server-user" aria-label="可信 Server 身份"><span>{userInitial}</span><div><strong>{visibleUserName}</strong><small>{visibleUserDetail}</small></div></div>
        : <button type="button" className={`ops-user ${personalActive ? "active" : ""}`} title="我的设置" onClick={() => navigate("/my-settings/ainuoke-account")}><span>{userInitial}</span><div><strong>{visibleUserName}</strong><small>{visibleUserDetail}</small></div></button>}
    </aside>

    <section className="ops-workspace">
      <header className="ops-topbar">
        {touchNavigation && <button type="button" className="ops-mobile-menu-trigger" aria-label="打开主导航" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><span aria-hidden="true">☰</span></button>}
        <div className="ops-topbar-heading">
          {backTarget && <button type="button" className="ops-topbar-back" aria-label={backTarget.label} title={backTarget.label} onClick={() => navigateRequest(backTarget.href)}><span aria-hidden="true">‹</span></button>}
          <div className="ops-topbar-title"><small>织序 / 业务中心 / {personalActive ? "我的设置" : basicActive ? "基础设置" : systemActive ? "系统设置" : pathname.startsWith("/ainuoke-sync") || pathname.startsWith("/order-center") ? "订单中心" : pathname.startsWith("/closing-center") ? "关账中心" : pathname.startsWith("/production-scheduling") ? "生产排单" : "报价中心"}</small><strong>{title}</strong></div>
        </div>
        <div className="topbar-actions">{serverIdentityMode || localSingleUser ? <ServerUserMenu name={visibleUserName} detail={visibleUserDetail} initial={userInitial} canLogout={!localSingleUser && serverSession.status === "authenticated"} onLogout={requestLogout} /> : <><button type="button" className="qc-global-search-trigger" aria-label="打开全局搜索" title="全局搜索（Ctrl+K）" onClick={() => setGlobalSearchOpen(true)}><span>⌕</span><b>搜索</b><kbd>Ctrl K</kbd></button><button type="button" className="icon-button" title="通知">♢</button><label className="qc-test-user-switcher" title="切换测试账号"><span>{userInitial}</span><select aria-label="切换测试账号" value={currentUser.id} onChange={(event) => setCurrentUser(event.target.value)}>{permissionState.users.filter((user) => user.status === "active").map((user) => <option key={user.id} value={user.id}>{user.name} · {permissionState.roles.find((role) => role.id === user.roleId)?.name ?? "未分配"}</option>)}</select></label></>}</div>
      </header>
      {children}
    </section>
    <Drawer open={navigationOpen && touchNavigation} className="ops-navigation-drawer" placement="left" title="业务导航" description="报价、订单、排单与系统设置" eyebrow="ZHIXU ERP" onClose={() => setNavigationOpen(false)}>
      <nav className="ops-touch-navigation" aria-label="完整业务导航">
        {!serverSettingsMode&&<section><strong>业务工作区</strong>{nav.map((item) => <button key={item.href} type="button" className={item.active ? "active" : ""} aria-current={item.active ? "page" : undefined} onClick={() => navigate(item.href)}><span aria-hidden="true">{item.symbol}</span><b>{item.label}</b><i aria-hidden="true">›</i></button>)}</section>}
        {showSettingsNavigation && <><section><strong>基础设置</strong>{visibleBasicRoutes.map((item) => <button key={item.href} type="button" className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined} onClick={() => navigate(item.href)}><span aria-hidden="true">⚙</span><b>{item.label}</b><i aria-hidden="true">›</i></button>)}</section><section><strong>系统设置</strong>{visibleSystemRoutes.map((item) => <button key={item.href} type="button" className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined} onClick={() => navigate(item.href)}><span aria-hidden="true">⋯</span><b>{item.label}</b><i aria-hidden="true">›</i></button>)}</section>{!serverIdentityMode&&<section><strong>我的设置</strong><button type="button" className={personalActive ? "active" : ""} aria-current={personalActive ? "page" : undefined} onClick={() => navigate("/my-settings/ainuoke-account")}><span aria-hidden="true">我</span><b>艾诺科账号</b><i aria-hidden="true">›</i></button></section>}</>}
      </nav>
    </Drawer>
    {!serverIdentityMode && <GlobalSearchPalette open={globalSearchOpen} context={{ userId: currentUser.id, can }} onClose={() => setGlobalSearchOpen(false)} onNavigate={navigate} />}
  </main>;
}

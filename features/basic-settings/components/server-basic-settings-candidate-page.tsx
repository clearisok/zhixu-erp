"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell, ErrorState, LoadingState, PageContainer } from "@/components/foundation";
import { PermissionAuthorityProvider } from "@/features/permissions";
import type { PermissionKey } from "@/features/permissions/model/permissions";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import { browserIdentityMode } from "@/features/server-auth/identity-mode";
import { defaultBasicSettings, type BasicSettingsState } from "../model/basic-settings";
import { BasicSettingsControllerProvider } from "./basic-settings-controller";
import { BrandSettingsPage, CustomerSalespeopleSettingsPage, FabricLibraryPage, TrimLibraryPage } from "./basic-settings-pages";
import { createServerBasicSettingsAdapter, type BasicSettingsServerScope } from "../server/server-basic-settings-adapter";
import { QuoteMasterServerError } from "../server/quote-master-server-client";
import { createServerGlobalQuoteSettingsAdapter } from "../server/server-global-quote-settings-adapter";
import { GlobalQuoteSettingsPage } from "@/features/quote-center/components/global-quote-settings-page";

const scopePermission: Record<BasicSettingsServerScope, PermissionKey> = {
  brands: "settings.brand.edit",
  salespeople: "settings.salesperson.edit",
  fabrics: "settings.fabric.edit",
  trims: "settings.trim.edit",
};

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return <AppShell title={title} identityMode="server"><PageContainer>{children}</PageContainer></AppShell>;
}

function safeError(error: unknown): string {
  if (error instanceof QuoteMasterServerError && error.status === 403) return "Server 权限不足（403）。";
  if (error instanceof Error && error.name === "UnsafeServerQuoteDecimalError") return "Server decimal 无法通过当前 UI 精确往返；已 fail closed。";
  return "Server 基础资料不可用；未回退到 Browser 数据。";
}

export function ServerBasicSettingsCandidatePage({ scope, production = false }: { scope: BasicSettingsServerScope; production?: boolean }) {
  const session = useServerSession();
  const [state, setState] = useState<BasicSettingsState>(defaultBasicSettings);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const adapter = useMemo(() => createServerBasicSettingsAdapter({ scope, permissions: session.permissions }), [scope, session.permissions]);
  const required = scopePermission[scope];
  const title = scope === "brands" ? "品牌设置" : scope === "salespeople" ? "客户业务员设置" : scope === "fabrics" ? "面料库" : "辅料库";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await adapter.load();
      setState(next);
      setSupplierOptions(adapter.getSupplierOptions());
    } catch (nextError) {
      if (nextError instanceof QuoteMasterServerError && nextError.status === 401) session.invalidate();
      setError(safeError(nextError));
    } finally { setLoading(false); }
  }, [adapter, session]);

  const canRead = session.hasPermission(required) || session.hasPermission("quote.view");
  useEffect(() => {
    if (session.status === "authenticated" && canRead) void Promise.resolve().then(load);
    else void Promise.resolve().then(() => setLoading(false));
  }, [canRead, load, session]);

  if (session.status === "checking") return <Frame title={title}><LoadingState label="确认织序 Server 登录状态" /></Frame>;
  if (session.status === "error") return <Frame title={title}><ErrorState title="无法确认 Server 登录状态" description={session.error} onRetry={() => void session.refresh()} /></Frame>;
  if (session.status === "anonymous") return <Frame title={title}><ServerLoginCard defaultUsername={process.env.NODE_ENV === "development" ? "admin" : ""} description={production ? "登录后读取 PostgreSQL 基础资料；不会回退到 Browser 数据。" : "登录后进入 PostgreSQL 基础资料 candidate；不会回退到 Browser 数据。"} /></Frame>;
  if (!canRead) return <Frame title={title}><ErrorState permission title="Server 权限不足（403）" description={`需要 ${required} 或 quote.view 权限。`} /></Frame>;
  if (loading) return <Frame title={title}><LoadingState label="读取 PostgreSQL 基础资料" /></Frame>;
  if (error) return <Frame title={title}><ErrorState title={production ? "Server 基础资料不可用" : "Server candidate 不可用"} description={error} onRetry={() => void load()} /></Frame>;

  const persist = async (next: BasicSettingsState) => {
    try {
      const result = await adapter.persist(state, next);
      setState(result.state);
      setSupplierOptions(result.supplierOptions ?? adapter.getSupplierOptions());
      return result;
    } catch (nextError) {
      if (nextError instanceof QuoteMasterServerError && nextError.status === 401) session.invalidate();
      throw nextError;
    }
  };
  const controller = { state, supplierOptions, persist, reload: load };
  const logout = browserIdentityMode() === "local-single-user" ? undefined : () => { void session.logout(); };
  const page = scope === "brands" ? <BrandSettingsPage serverCandidate serverProduction={production} onServerLogout={logout} />
    : scope === "salespeople" ? <CustomerSalespeopleSettingsPage serverCandidate serverProduction={production} onServerLogout={logout} />
      : scope === "fabrics" ? <FabricLibraryPage serverCandidate serverProduction={production} onServerLogout={logout} />
        : <TrimLibraryPage serverCandidate serverProduction={production} onServerLogout={logout} />;
  return <PermissionAuthorityProvider can={session.hasPermission}><BasicSettingsControllerProvider value={controller}>{page}</BasicSettingsControllerProvider></PermissionAuthorityProvider>;
}

export function ServerGlobalQuoteSettingsCandidatePage({ production = false }: { production?: boolean } = {}) {
  const session = useServerSession();
  const adapter = useMemo(() => createServerGlobalQuoteSettingsAdapter(), []);
  if (session.status === "checking") return <Frame title="报价设置"><LoadingState label="确认织序 Server 登录状态" /></Frame>;
  if (session.status === "error") return <Frame title="报价设置"><ErrorState title="无法确认 Server 登录状态" description={session.error} onRetry={() => void session.refresh()} /></Frame>;
  if (session.status === "anonymous") return <Frame title="报价设置"><ServerLoginCard defaultUsername={process.env.NODE_ENV === "development" ? "admin" : ""} description={production ? "登录后读取 PostgreSQL 报价设置；不会回退到 Browser 设置。" : "登录后进入 PostgreSQL 报价设置 candidate；不会回退到 Browser 设置。"} /></Frame>;
  if (!session.hasPermission("settings.global.edit") && !session.hasPermission("quote.view")) return <Frame title="报价设置"><ErrorState permission title="Server 权限不足（403）" description="需要 settings.global.edit 或 quote.view 权限。" /></Frame>;
  const controller = {
    load: () => adapter.load().catch((error) => { if (error instanceof QuoteMasterServerError && error.status === 401) session.invalidate(); throw error; }),
    save: (settings: Parameters<typeof adapter.save>[0]) => adapter.save(settings).catch((error) => { if (error instanceof QuoteMasterServerError && error.status === 401) session.invalidate(); throw error; }),
  };
  return <PermissionAuthorityProvider can={session.hasPermission}><GlobalQuoteSettingsPage serverController={controller} serverProduction={production} onServerLogout={browserIdentityMode() === "local-single-user" ? undefined : () => { void session.logout(); }} /></PermissionAuthorityProvider>;
}

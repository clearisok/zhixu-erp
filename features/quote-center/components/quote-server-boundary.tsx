"use client";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AppShell, Button, ErrorState, LoadingState, PageContainer } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { LoginRedirect } from "../../server-auth/components/login-redirect";
import { PermissionAuthorityProvider } from "@/features/permissions";
import { PermissionProvider, TrustedPermissionProvider } from "../../permissions/components/permission-provider";
import { isEnabledServerRoute, quoteAuthority } from "../authority/quote-authority";
import { browserIdentityMode } from "../../server-auth/identity-mode";

function SessionLogout() {
  const session = useServerSession();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function logout() {
    setPending(true); setError("");
    try { await session.logout(); }
    catch { setError("退出未完成，请检查网络后重试。"); }
    finally { setPending(false); }
  }
  return <div className="qc-server-session-actions qc-server-session-floating"><Button variant="text" disabled={pending} onClick={() => void logout()}>退出 Server</Button>{error && <span role="alert">{error}</span>}</div>;
}

export function QuoteServerBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const session = useServerSession();
  if (path === "/login") return children;
  if (quoteAuthority() !== "server") return <PermissionProvider>{children}</PermissionProvider>;
  return <TrustedPermissionProvider><PermissionAuthorityProvider can={session.hasPermission}>
    {!isEnabledServerRoute(path) ? <AppShell title="此模块尚未接通 Server"><PageContainer><ErrorState title="此模块未在当前候选中启用" description="此路由不会加载旧 Browser 业务数据。" /></PageContainer></AppShell>
      : session.status === "checking" ? <LoadingState label="恢复 Server 身份" />
      : session.status === "error" ? <ErrorState title="Server 身份不可用" description={session.error} onRetry={() => void session.refresh()} />
      : session.status === "anonymous" ? <LoginRedirect />
      : <>{browserIdentityMode() !== "local-single-user" && <SessionLogout />}{children}</>}
  </PermissionAuthorityProvider></TrustedPermissionProvider>;
}

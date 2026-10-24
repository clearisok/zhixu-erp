"use client";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { ErrorState, LoadingState, PageContainer, PersistentServerAppShell } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { LoginRedirect } from "../../server-auth/components/login-redirect";
import { PermissionAuthorityProvider } from "@/features/permissions";
import { PermissionProvider, TrustedPermissionProvider } from "../../permissions/components/permission-provider";
import { isEnabledServerRoute, quoteAuthority } from "../authority/quote-authority";
import { ServerNavigationProtection } from "@/components/foundation/server-navigation-protection";

export function QuoteServerBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const session = useServerSession();
  if (path === "/login") return children;
  if (quoteAuthority() !== "server") return <PermissionProvider>{children}</PermissionProvider>;
  const enabled = isEnabledServerRoute(path);
  const scope = enabled && session.status === "authenticated" ? `${session.user.id}:${session.permissions.join("|")}` : null;
  return <TrustedPermissionProvider><PermissionAuthorityProvider can={session.hasPermission}>
    <ServerNavigationProtection scope={scope}><PersistentServerAppShell scope={scope} title={enabled ? "业务工作区" : "此模块尚未接通 Server"}>
    {!enabled ? <PageContainer><ErrorState title="此模块未在当前候选中启用" description="此路由不会加载旧 Browser 业务数据。" /></PageContainer>
      : session.status === "checking" ? <PageContainer><LoadingState label="恢复 Server 身份" /></PageContainer>
      : session.status === "error" ? <PageContainer><ErrorState title="Server 身份不可用" description={session.error} onRetry={() => void session.refresh()} /></PageContainer>
      : session.status === "anonymous" ? <LoginRedirect />
      : children}
    </PersistentServerAppShell></ServerNavigationProtection>
  </PermissionAuthorityProvider></TrustedPermissionProvider>;
}

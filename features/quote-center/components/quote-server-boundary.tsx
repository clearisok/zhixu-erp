"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, Button, ErrorState, LoadingState, PageContainer } from "@/components/foundation";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import { PermissionAuthorityProvider } from "@/features/permissions";
import { PermissionProvider, TrustedPermissionProvider } from "../../permissions/components/permission-provider";
import { isServerQuoteRoute, quoteAuthority } from "../authority/quote-authority";
import { browserIdentityMode } from "../../server-auth/identity-mode";

export function QuoteServerBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const session = useServerSession();
  if (quoteAuthority() !== "server") return <PermissionProvider>{children}</PermissionProvider>;
  return <TrustedPermissionProvider><PermissionAuthorityProvider can={session.hasPermission}>
    {!isServerQuoteRoute(path) ? <AppShell title="此模块尚未接通 Server"><PageContainer><ErrorState title="当前新系统只启用报价与必要基础设置" description="此路由不会加载旧 Browser 业务数据。" /></PageContainer></AppShell>
      : session.status === "checking" ? <LoadingState label="恢复 Server 身份" />
      : session.status === "error" ? <ErrorState title="Server 身份不可用" description={session.error} onRetry={() => void session.refresh()} />
      : session.status === "anonymous" ? <AppShell title="登录织序"><PageContainer><ServerLoginCard description="使用同一 Server 身份访问报价和基础设置；不读取 Browser mock 权限。" /></PageContainer></AppShell>
      : <>{browserIdentityMode() !== "local-single-user" && <div className="qc-server-session-actions qc-server-session-floating"><Button variant="text" onClick={() => void session.logout()}>退出 Server</Button></div>}{children}</>}
  </PermissionAuthorityProvider></TrustedPermissionProvider>;
}

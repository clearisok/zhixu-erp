"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AlertBanner, AppShell, Button, Card, ErrorState, LoadingState, PageContainer, PageHeader } from "@/components/foundation";
import { PermissionAuthorityProvider } from "@/features/permissions";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import { QuoteServerError } from "../server/quote-server-client";
import { quoteServerRepository } from "../server/quote-server-repository";

function ServerNewFrame({ children }: { children: ReactNode }) {
  return <AppShell title="Server 新建报价准备区" identityMode="server" backTarget={{ href: "/quote-center/server-preview", label: "返回 Server 报价预览" }}>
    <PageContainer className="qc-server-quote-page">
      <PageHeader
        eyebrow="Q2B2B · SERVER NEW QUOTE TEST WORKSPACE"
        title="创建 Server 报价草稿"
        description="Source = PostgreSQL · Identity = Server · Number = Server generated · Production cutover = NOT ACTIVE"
      />
      {children}
    </PageContainer>
  </AppShell>;
}

function ServerQuoteNewWorkspace() {
  const router = useRouter();
  const serverSession = useServerSession();
  const [creating, setCreating] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDraft = async () => {
    if (creating || serverSession.status !== "authenticated" || !serverSession.hasPermission("quote.create")) return;
    setCreating(true);
    setError(null);
    try {
      const created = await quoteServerRepository.create();
      router.push(`/quote-center/server-edit?id=${encodeURIComponent(created.quote.id)}`);
    } catch (nextError) {
      if (nextError instanceof QuoteServerError && nextError.status === 401) {
        setCreationUncertain(true);
        setSessionExpired(true);
        serverSession.invalidate();
        setError("Server 会话已失效；未确认创建成功。请先在 Server 报价预览核对，再重新登录，避免盲目重复创建。");
      } else if (nextError instanceof QuoteServerError && nextError.status === 403) {
        setError("Server 拒绝创建（403）；需要 quote.create。");
      } else {
        setCreationUncertain(true);
        setError("Server 创建结果不确定；没有 Browser fallback，也不会自动重试。请先核对 Server 报价列表再决定下一步。");
      }
    } finally {
      setCreating(false);
    }
  };

  if (serverSession.status === "checking") return <ServerNewFrame><LoadingState label="确认织序 Server 登录状态" /></ServerNewFrame>;
  if (serverSession.status === "error") return <ServerNewFrame><ErrorState title="无法确认 Server 登录状态" description={serverSession.error} onRetry={() => void serverSession.refresh()} /></ServerNewFrame>;
  if (serverSession.status === "anonymous") return <ServerNewFrame>
    <AlertBanner tone="info" title={sessionExpired ? "Server 会话已失效" : "请登录织序 Server"}>此页面只接受 trusted Server identity；Browser 测试账号不能授予创建权限。</AlertBanner>
    {error && <ErrorState title="创建未完成" description={error} />}
    <ServerLoginCard defaultUsername={process.env.NODE_ENV === "development" ? "admin" : ""} description="登录后可显式创建一个 Server-owned 空白报价草稿。" />
  </ServerNewFrame>;
  if (!serverSession.hasPermission("quote.create")) return <ServerNewFrame>
    <ErrorState permission title="Server 权限不足（403）" description="需要 quote.create 才能创建 Server Quote。" />
  </ServerNewFrame>;

  return <ServerNewFrame>
    <AlertBanner tone="warning" title="Lazy Create">打开本页不会写入数据库。只有点击下方按钮才会执行一次 POST；编号将在创建时由 Server 自动生成。</AlertBanner>
    {error && <ErrorState title="创建未完成" description={error} />}
    <Card className="qc-server-writer-section qc-server-new-card">
      <header><div><small>SERVER-OWNED IDENTITY</small><h2>新报价草稿</h2></div><span>不读取 Browser defaults</span></header>
      <ul>
        <li>Quote UUID、Revision ID、PriceVersion ID：Server 生成</li>
        <li>Quote business number：Server 按 Asia/Shanghai 创建日期与全局 sequence 生成</li>
        <li>品牌、业务员、制作国家与预设：保持空白，不读取 Browser masters/settings</li>
        <li>附件、ConfirmedCommercialTerms、SalesOrder：不会创建</li>
      </ul>
      <div className="qc-server-new-action"><Button permission="quote.create" disabled={creating || creationUncertain} onClick={() => void createDraft()}>{creating ? "创建中…" : creationUncertain ? "请先核对 Server 列表" : "创建 Server 报价草稿"}</Button></div>
    </Card>
  </ServerNewFrame>;
}

export function ServerQuoteNewPage() {
  const serverSession = useServerSession();
  return <PermissionAuthorityProvider can={serverSession.hasPermission}><ServerQuoteNewWorkspace /></PermissionAuthorityProvider>;
}

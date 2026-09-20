"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertBanner,
  AppShell,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/foundation";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import type { QuoteServerListItem, QuoteServerPage } from "../server/quote-server-client";
import { quoteServerRepository } from "../server/quote-server-repository";
import { classifyQuoteServerReadFailure, quoteServerReadErrorLabel } from "../server/quote-server-read-model";

const PAGE_SIZE = 50;
const emptyPage: QuoteServerPage = { limit: PAGE_SIZE, offset: 0, count: 0 };

function ServerQuoteFrame({ count = "—", children }: { count?: ReactNode; children: ReactNode }) {
  return (
    <AppShell title="Server 报价只读预览" identityMode="server">
      <PageContainer className="qc-server-quote-page">
        <PageHeader
          eyebrow="Q2B1 · SERVER SHADOW READ"
          title="Server 报价只读预览"
          count={count}
          description="仅通过可信 Server Session 读取 PostgreSQL Quote；不会读取或回退到 Browser 报价数据。"
        />
        {children}
      </PageContainer>
    </AppShell>
  );
}

export function ServerQuotePreviewPage() {
  const serverSession = useServerSession();
  const [items, setItems] = useState<QuoteServerListItem[]>([]);
  const [page, setPage] = useState<QuoteServerPage>(emptyPage);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);

  const loadQuotes = useCallback(async () => {
    if (serverSession.status !== "authenticated" || !serverSession.hasPermission("quote.view")) return;
    setLoading(true);
    setError(null);
    setPermissionDenied(false);
    try {
      const result = await quoteServerRepository.list({ limit: PAGE_SIZE, offset });
      setItems(result.items);
      setPage(result.page);
    } catch (nextError) {
      setItems([]);
      setPage({ ...emptyPage, offset });
      const failure = classifyQuoteServerReadFailure(nextError);
      if (failure === "unauthorized") {
        setSessionExpired(true);
        serverSession.invalidate();
      } else if (failure === "forbidden") {
        setPermissionDenied(true);
      } else {
        setError(quoteServerReadErrorLabel(nextError));
      }
    } finally {
      setLoading(false);
    }
  }, [offset, serverSession]);

  useEffect(() => {
    if (serverSession.status === "authenticated" && serverSession.hasPermission("quote.view")) {
      void Promise.resolve().then(loadQuotes);
    }
  }, [loadQuotes, serverSession]);

  const logout = async () => {
    setSessionActionError(null);
    try {
      await serverSession.logout();
      setItems([]);
      setPage(emptyPage);
    } catch {
      setSessionActionError("无法退出 Server 会话，请稍后重试。");
    }
  };

  if (serverSession.status === "checking") {
    return <ServerQuoteFrame><LoadingState label="确认织序 Server 登录状态" /></ServerQuoteFrame>;
  }

  if (serverSession.status === "error") {
    return <ServerQuoteFrame><ErrorState title="无法确认 Server 登录状态" description={serverSession.error} onRetry={() => void serverSession.refresh()} /></ServerQuoteFrame>;
  }

  if (serverSession.status === "anonymous") {
    return (
      <ServerQuoteFrame>
        <AlertBanner tone="info" title={sessionExpired ? "Server 会话已失效，请重新登录" : "请登录织序 Server"}>
          此页面只接受可信 Server identity 与 quote.view；Browser 测试账号不会在这里显示或授权。
        </AlertBanner>
        <ServerLoginCard
          defaultUsername={process.env.NODE_ENV === "development" ? "admin" : ""}
          description="请登录织序 Server 以读取 PostgreSQL Quote 只读预览。"
        />
      </ServerQuoteFrame>
    );
  }

  const trustedIdentity = `${serverSession.user.name}（${serverSession.user.username}）`;
  if (permissionDenied || !serverSession.hasPermission("quote.view")) {
    return (
      <ServerQuoteFrame>
        <AlertBanner tone="warning" title="当前 Server 账号没有报价查看权限" actions={<Button variant="secondary" onClick={() => void logout()}>退出 Server 会话</Button>}>
          已登录为 {trustedIdentity}；读取 Server Quote 需要 quote.view。
        </AlertBanner>
        {sessionActionError && <ErrorState description={sessionActionError} />}
        <ErrorState permission title="Server 权限不足（403）" description="请联系管理员分配 quote.view 权限。" />
      </ServerQuoteFrame>
    );
  }

  return (
    <ServerQuoteFrame count={`本页 ${page.count} 条`}>
      <AlertBanner tone="info" title="Shadow read · source = PostgreSQL" actions={<Button variant="text" onClick={() => void logout()}>退出 Server 会话</Button>}>
        Server identity：{trustedIdentity}。此隔离页面没有 Quote 创建、保存、删除或 Browser fallback。
      </AlertBanner>
      {sessionActionError && <ErrorState description={sessionActionError} />}
      {loading ? (
        <LoadingState label="读取 PostgreSQL Quote 列表" />
      ) : error ? (
        <ErrorState title="Quote Server 暂时不可用" description={`${error}；未回退到 Browser 报价。`} onRetry={() => void loadQuotes()} />
      ) : items.length === 0 ? (
        <EmptyState title="当前页没有 Server Quote" description="这里只显示 PostgreSQL Quote；Browser 本地报价不会补入。" />
      ) : (
        <Card className="qc-server-quote-card">
          <div className="qc-server-quote-table-wrap" role="region" aria-label="Server Quote 列表">
            <table>
              <thead><tr><th>报价编号</th><th>Quote ID</th><th>默认 Revision</th><th>聚合版本</th><th>操作</th></tr></thead>
              <tbody>{items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.quoteCode}</strong></td>
                  <td><code>{item.id}</code></td>
                  <td><code>{item.defaultRevisionId}</code></td>
                  <td>v{item.version}</td>
                  <td><Link className="qc-server-quote-link" href={`/quote-center/server-detail?id=${encodeURIComponent(item.id)}`}>查看 Server 报价</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <footer className="qc-server-quote-pagination">
            <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>上一页</Button>
            <span>offset {page.offset} · 本页 {page.count}</span>
            <Button variant="secondary" disabled={page.count < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>下一页</Button>
          </footer>
        </Card>
      )}
    </ServerQuoteFrame>
  );
}

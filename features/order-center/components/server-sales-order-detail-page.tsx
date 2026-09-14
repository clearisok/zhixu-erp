"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertBanner,
  AppShell,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  ErrorState,
  LoadingState,
  PageBackButton,
  PageContainer,
  PageHeader,
  StatusTag,
} from "@/components/foundation";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import { OrderCenterNavigation } from "@/features/style-progress/components/order-center-navigation";
import { SalesOrderServerReadError } from "../server/sales-order-server-client";
import { loadServerOrderCenterDetail } from "../server/server-order-center-query";
import { serverSalesOrderReadRepository } from "../server/server-sales-order-read-repository";
import type {
  OrderCenterServerDetailViewModel,
  ServerSalesOrderCreationSource,
  ServerSalesOrderLifecycleState,
} from "../server/sales-order-server-model";

const lifecycleLabels: Record<ServerSalesOrderLifecycleState, string> = {
  draft: "草稿",
  confirmed: "已确认",
  active: "执行中",
  completed: "已完成",
  cancelled: "已取消",
};

const creationSourceLabels: Record<ServerSalesOrderCreationSource, string> = {
  ainuoke: "艾诺科",
  quote: "报价",
  reorder: "翻单",
  manual: "手工",
};

function lifecycleTone(
  lifecycleState: ServerSalesOrderLifecycleState,
): "neutral" | "success" | "danger" {
  if (lifecycleState === "cancelled") return "danger";
  if (lifecycleState === "confirmed" || lifecycleState === "completed") return "success";
  return "neutral";
}

function unavailableMessage(error: unknown): string {
  if (error instanceof SalesOrderServerReadError) {
    return `${error.code}（HTTP ${error.status}）。不会切换到 Browser 本地订单。`;
  }
  return "订单服务暂时不可用，请稍后重试。不会切换到 Browser 本地订单。";
}

function ServerDetailFrame({
  detail,
  children,
}: {
  detail: OrderCenterServerDetailViewModel | null;
  children: React.ReactNode;
}) {
  return (
    <AppShell title="正式订单详情">
      <PageContainer className="oc-order-center-page oc-server-detail-page">
        <OrderCenterNavigation />
        <PageHeader
          eyebrow="READ ONLY · POSTGRESQL"
          title={detail?.styleNo || "正式订单详情"}
          description={detail
            ? <><strong>{detail.orderNo}</strong><span> · BillNo {detail.billNo ?? "—"}</span></>
            : "从 PostgreSQL 读取权威订单与艾诺科来源事实。"}
          back={<PageBackButton fallbackHref="/order-center" label="返回订单列表" />}
          status={detail ? <StatusTag tone={lifecycleTone(detail.lifecycleState)}>{lifecycleLabels[detail.lifecycleState]}</StatusTag> : undefined}
        />
        {children}
      </PageContainer>
    </AppShell>
  );
}

export function ServerSalesOrderDetailPage() {
  const searchParams = useSearchParams();
  const salesOrderId = searchParams.get("id")?.normalize("NFKC").trim() ?? "";
  const serverSession = useServerSession();
  const [detail, setDetail] = useState<OrderCenterServerDetailViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (serverSession.status !== "authenticated" || !serverSession.hasPermission("order.view")) return;
    if (!salesOrderId) {
      setDetail(null);
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setDetail(null);
    setNotFound(false);
    setPermissionDenied(false);
    setSessionExpired(false);
    setError(null);
    try {
      setDetail(await loadServerOrderCenterDetail(serverSalesOrderReadRepository, salesOrderId));
    } catch (nextError) {
      if (nextError instanceof SalesOrderServerReadError && nextError.status === 401) {
        setSessionExpired(true);
        serverSession.invalidate();
      } else if (nextError instanceof SalesOrderServerReadError && nextError.status === 403) {
        setPermissionDenied(true);
      } else if (nextError instanceof SalesOrderServerReadError && nextError.status === 404) {
        setNotFound(true);
      } else {
        setError(unavailableMessage(nextError));
      }
    } finally {
      setLoading(false);
    }
  }, [salesOrderId, serverSession]);

  useEffect(() => {
    if (serverSession.status === "authenticated" && serverSession.hasPermission("order.view")) {
      void Promise.resolve().then(loadDetail);
    }
  }, [loadDetail, serverSession]);

  const logout = async () => {
    setSessionActionError(null);
    try {
      await serverSession.logout();
      setDetail(null);
    } catch {
      setSessionActionError("无法退出 Server 会话，请稍后重试。");
    }
  };

  if (serverSession.status === "checking") {
    return <ServerDetailFrame detail={null}><LoadingState label="确认织序 Server 登录状态" /></ServerDetailFrame>;
  }

  if (serverSession.status === "error") {
    return (
      <ServerDetailFrame detail={null}>
        <ErrorState title="订单服务暂时不可用" description={serverSession.error} onRetry={() => void serverSession.refresh()} />
      </ServerDetailFrame>
    );
  }

  if (serverSession.status === "anonymous") {
    return (
      <ServerDetailFrame detail={null}>
        <AlertBanner tone="info" title={sessionExpired ? "Server 会话已失效，请重新登录" : "登录后查看正式订单详情"}>
          详情使用可信 Server session；不会读取或回退到 Browser 本地订单。
        </AlertBanner>
        <ServerLoginCard defaultUsername={process.env.NODE_ENV === "development" ? "admin" : ""} />
      </ServerDetailFrame>
    );
  }

  const trustedIdentity = `${serverSession.user.name}（${serverSession.user.username}）`;
  if (permissionDenied || !serverSession.hasPermission("order.view")) {
    return (
      <ServerDetailFrame detail={null}>
        <AlertBanner
          tone="warning"
          title="当前 Server 账号没有订单查看权限"
          actions={<Button variant="secondary" onClick={() => void logout()}>退出 Server 会话</Button>}
        >
          已登录为 {trustedIdentity}；读取详情需要 order.view 权限。
        </AlertBanner>
        {sessionActionError && <ErrorState description={sessionActionError} />}
        <ErrorState permission title="Server 权限不足（403）" description="请联系管理员分配 order.view 权限。" />
      </ServerDetailFrame>
    );
  }

  return (
    <ServerDetailFrame detail={detail}>
      <div className="oc-server-source-bar">
        <span><i aria-hidden="true" />数据源：PostgreSQL</span>
        <small>Server identity：{trustedIdentity}</small>
        <Button variant="text" onClick={() => void logout()}>退出登录</Button>
      </div>
      {sessionActionError && <ErrorState description={sessionActionError} />}
      {loading ? (
        <LoadingState label="读取 PostgreSQL 正式订单详情" />
      ) : notFound ? (
        <ErrorState title="正式订单不存在（404）" description="该 PostgreSQL SalesOrder ID 不存在或链接无效。" />
      ) : error ? (
        <ErrorState title="订单服务暂时不可用" description={error} onRetry={() => void loadDetail()} />
      ) : detail ? (
        <div className="oc-server-detail-content">
          <Card className="oc-server-detail-section oc-server-detail-zhixu">
            <header>
              <div><small>ZHIXU FACTS</small><h2>织序订单事实</h2></div>
              <span>Server-owned · 只读</span>
            </header>
            <DescriptionList columns={3} items={[
              { key: "orderNo", label: "正式订单号", value: detail.orderNo, secondary: `UUID ${detail.id}` },
              { key: "version", label: "数据版本", value: `v${detail.version}` },
              { key: "lifecycle", label: "织序生命周期", value: lifecycleLabels[detail.lifecycleState], secondary: detail.lifecycleState },
              { key: "creationSource", label: "创建来源", value: creationSourceLabels[detail.creationSource], secondary: detail.creationSource },
              { key: "createdAt", label: "创建时间", value: detail.createdAt },
              { key: "updatedAt", label: "更新时间", value: detail.updatedAt },
            ]} />
          </Card>

          <Card className="oc-server-detail-section oc-server-detail-source">
            <header>
              <div><small>AINUOKE SOURCE FACTS</small><h2>艾诺科来源事实</h2></div>
              <span>来源权威 · 不可编辑</span>
            </header>
            <DescriptionList columns={3} items={[
              { key: "billNo", label: "BillNo", value: detail.billNo },
              { key: "insideOrderNo", label: "工厂单号 / InsideOrderNo", value: detail.insideOrderNo, secondary: "可变来源属性，不是稳定订单身份" },
              { key: "styleNo", label: "款号", value: detail.styleNo },
              { key: "company", label: "公司", value: detail.companyName },
              { key: "customer", label: "客户", value: detail.customerName },
              { key: "brand", label: "品牌", value: detail.brandName },
              { key: "quantity", label: "订单数量（来源只读）", value: detail.quantity?.toLocaleString("zh-CN") },
              { key: "contractDate", label: "合同日期", value: detail.contractDate },
              { key: "contractDelivery", label: "工艺单交期（来源）", value: detail.contractDeliveryDate },
              { key: "sourceLifecycle", label: "艾诺科状态", value: detail.sourceLifecycleStatus },
              { key: "colorCount", label: "有效颜色数", value: detail.colorCount.toLocaleString("zh-CN") },
            ]} />
          </Card>

          <Card className="oc-server-detail-section oc-server-detail-colors">
            <header>
              <div><small>COLOR SOURCE SLICE</small><h2>颜色明细</h2></div>
              <span>{detail.colors.length} 个颜色 · 来源只读</span>
            </header>
            {detail.colors.length === 0 ? (
              <EmptyState compact title="当前订单主档有效；颜色明细暂无有效数据。" description="颜色 enrichment 为空不影响 SalesOrder master 有效性。" />
            ) : (
              <div className="oc-server-color-table" role="region" aria-label="正式订单颜色明细">
                <table>
                  <thead><tr><th>颜色</th><th>数量</th></tr></thead>
                  <tbody>{detail.colors.map((color) => (
                    <tr key={color.sourceLineIdentity}>
                      <td>{color.colorName}</td>
                      <td>{color.quantity.toLocaleString("zh-CN")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <EmptyState title="未读取到正式订单详情" />
      )}
    </ServerDetailFrame>
  );
}

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
  FormItem,
  LoadingState,
  Modal,
  PageBackButton,
  PageContainer,
  PageHeader,
  StatusTag,
} from "@/components/foundation";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import {
  ConfirmedCommercialTermsServerError,
  confirmedCommercialTermsServerClient,
  type ConfirmedCommercialTermsDto,
  type ConfirmedLaborCurrency,
} from "@/features/confirmed-commercial-terms";
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

function commercialAmount(value: string | null, currency: string): string {
  return value === null ? "未确认" : `${value} ${currency} / 件`;
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
  const [terms, setTerms] = useState<ConfirmedCommercialTermsDto | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsDraft, setTermsDraft] = useState({ customerPrice: "", laborPrice: "", laborCurrency: "" as "" | ConfirmedLaborCurrency });
  const [termsMutationError, setTermsMutationError] = useState<string | null>(null);
  const [termsSaving, setTermsSaving] = useState(false);

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
      const [nextDetail, nextTerms] = await Promise.all([
        loadServerOrderCenterDetail(serverSalesOrderReadRepository, salesOrderId),
        confirmedCommercialTermsServerClient.getBySalesOrder(salesOrderId),
      ]);
      setDetail(nextDetail);
      setTerms(nextTerms);
    } catch (nextError) {
      if ((nextError instanceof SalesOrderServerReadError || nextError instanceof ConfirmedCommercialTermsServerError) && nextError.status === 401) {
        setSessionExpired(true);
        serverSession.invalidate();
      } else if ((nextError instanceof SalesOrderServerReadError || nextError instanceof ConfirmedCommercialTermsServerError) && nextError.status === 403) {
        setPermissionDenied(true);
      } else if ((nextError instanceof SalesOrderServerReadError || nextError instanceof ConfirmedCommercialTermsServerError) && nextError.status === 404) {
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

  const openTermsEditor = () => {
    setTermsDraft({
      customerPrice: terms?.current?.customerConfirmedPrice ?? "",
      laborPrice: terms?.current?.confirmedLaborPrice ?? "",
      laborCurrency: terms?.current?.laborCurrency ?? "",
    });
    setTermsMutationError(null);
    setTermsOpen(true);
  };

  const saveTerms = async () => {
    const linkedLaborCurrency = terms?.linkage === "linked" ? terms.current?.laborCurrency ?? null : null;
    if (termsDraft.laborPrice && terms?.linkage === "linked" && !linkedLaborCurrency) {
      setTermsMutationError("关联 Quote 尚未建立工价币种；请先从对应 PriceVersion 确认，订单端不会猜测币种。");
      return;
    }
    if (termsDraft.laborPrice && terms?.linkage !== "linked" && !termsDraft.laborCurrency) {
      setTermsMutationError("填写确认工价时必须明确选择币种。");
      return;
    }
    setTermsSaving(true);
    setTermsMutationError(null);
    try {
      const next = await confirmedCommercialTermsServerClient.updateBySalesOrder(salesOrderId, {
        expectedVersion: terms?.current?.version ?? 0,
        customerConfirmedPrice: termsDraft.customerPrice || null,
        confirmedLaborPrice: termsDraft.laborPrice || null,
        laborCurrency: terms?.linkage === "linked" ? linkedLaborCurrency : termsDraft.laborCurrency || null,
      });
      setTerms(next);
      setTermsOpen(false);
    } catch (nextError) {
      if (nextError instanceof ConfirmedCommercialTermsServerError && nextError.status === 401) {
        serverSession.invalidate();
        setTermsOpen(false);
        return;
      }
      if (nextError instanceof ConfirmedCommercialTermsServerError && nextError.status === 409) {
        try {
          setTerms(await confirmedCommercialTermsServerClient.getBySalesOrder(salesOrderId));
        } catch {
          // Keep the explicit conflict as the primary safe error.
        }
        setTermsMutationError(nextError.code === "linked_labor_currency_not_established"
          ? "关联 Quote 尚未建立工价币种；请先从对应 PriceVersion 确认，订单端未写入任何条款。"
          : nextError.code === "linked_labor_currency_order_conflict"
            ? "订单端不能更改关联 Quote PriceVersion 的工价币种；本次未写入。"
            : "条款已被其他页面更新，已重新读取当前值；请核对后再保存。");
        return;
      }
      setTermsMutationError(nextError instanceof ConfirmedCommercialTermsServerError && nextError.status === 403
        ? "当前 Server 账号没有 order.edit 权限。"
        : "确认商业条款保存失败；未写入 Browser 本地订单。");
    } finally {
      setTermsSaving(false);
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

          <Card className="oc-server-detail-section oc-server-detail-commercial-terms">
            <header>
              <div><small>SERVER CURRENT TERMS</small><h2>确认商业条款</h2></div>
              <span>PostgreSQL · v{terms?.current?.version ?? 0}</span>
            </header>
            <DescriptionList columns={3} items={[
              { key: "customerConfirmedPrice", label: "客户确认价格", value: commercialAmount(terms?.current?.customerConfirmedPrice ?? null, "CNY") },
              { key: "confirmedLaborPrice", label: "确认工价", value: commercialAmount(terms?.current?.confirmedLaborPrice ?? null, terms?.current?.laborCurrency ?? "币种未指定") },
              { key: "termsLinkage", label: "共享范围", value: terms?.linkage === "linked" ? "精确 Quote provenance 共享" : "仅当前 SalesOrder", secondary: terms?.linkage === "linked" ? `${terms.associatedSalesOrderIds.length} 张正式订单共享` : "未伪造 Quote 关联" },
            ]} />
            {serverSession.hasPermission("order.edit")
              ? <Button variant="secondary" onClick={openTermsEditor}>编辑确认商业条款</Button>
              : <small>当前账号仅有 order.view；确认商业条款只读。</small>}
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
          <Modal
            open={termsOpen}
            title="编辑确认商业条款"
            description={terms?.linkage === "linked" ? "仅修改 Server current 确认金额；工价币种由精确关联的 Quote PriceVersion 确定且订单端只读。" : "仅修改当前 SalesOrder-owned 商业条款；不会修改订单来源事实。"}
            onClose={() => setTermsOpen(false)}
            onSubmit={() => void saveTerms()}
            footer={<><Button variant="secondary" onClick={() => setTermsOpen(false)}>取消</Button><Button type="submit" disabled={termsSaving}>{termsSaving ? "保存中" : "保存"}</Button></>}
          >
            <div className="qc-modal-form">
              <FormItem label="客户确认价格（CNY / 件）"><input className="qc-control" inputMode="decimal" value={termsDraft.customerPrice} onChange={(event) => { if (/^\d*(?:\.\d*)?$/u.test(event.target.value)) setTermsDraft({ ...termsDraft, customerPrice: event.target.value }); }} placeholder="未确认" /></FormItem>
              <FormItem label="确认工价"><input className="qc-control" inputMode="decimal" value={termsDraft.laborPrice} onChange={(event) => { if (/^\d*(?:\.\d*)?$/u.test(event.target.value)) setTermsDraft({ ...termsDraft, laborPrice: event.target.value }); }} placeholder="未确认" /></FormItem>
              {terms?.linkage === "linked"
                ? <FormItem label="工价币种（Quote PriceVersion，只读）"><div className="qc-create-readonly"><strong>{terms.current?.laborCurrency ?? "尚未建立"}</strong><small>{terms.current?.laborCurrency ? "订单端保存时必须保持该币种。" : "请先从关联 Quote 建立；订单端不会猜测 CNY/USD。"}</small></div></FormItem>
                : <FormItem label="工价币种"><select className="qc-control" value={termsDraft.laborCurrency} onChange={(event) => setTermsDraft({ ...termsDraft, laborCurrency: event.target.value as "" | ConfirmedLaborCurrency })}><option value="">请选择</option><option value="CNY">CNY</option><option value="USD">USD</option></select></FormItem>}
              {termsMutationError && <p className="qc-form-alert">{termsMutationError}</p>}
            </div>
          </Modal>
        </div>
      ) : (
        <EmptyState title="未读取到正式订单详情" />
      )}
    </ServerDetailFrame>
  );
}

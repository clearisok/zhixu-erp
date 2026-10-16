"use client";
import { MaterialHistoryDialog } from "./material-history-dialog";
import { OrderBusinessSourceButton } from "./order-business-source-button";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrderMaterialSummary } from '@/features/ainuoke-material-progress/order-material-summary';
import { useSearchParams, useRouter } from "next/navigation";
import {
  AlertBanner,
  AppShell,
  Card,
  DescriptionList,
  EmptyState,
  ErrorState,
  LoadingState,
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
  onRequestNavigation,
  onRequestLogout,
  sourceAction,
}: {
  detail: OrderCenterServerDetailViewModel | null;
  children: React.ReactNode;
  onRequestNavigation?: (target:string)=>void;
  onRequestLogout?: () => Promise<void>;
  sourceAction?: React.ReactNode;
}) {
  return (
    <AppShell title="正式订单详情" backTarget={{href:"/order-center",label:"返回订单列表"}} identityMode="server" onRequestNavigation={onRequestNavigation} onRequestLogout={onRequestLogout}>
      <PageContainer className="oc-order-center-page oc-server-detail-page">
        <OrderCenterNavigation onRequestNavigation={onRequestNavigation} />
        <PageHeader
          eyebrow="READ ONLY · POSTGRESQL"
          title={!detail ? "正式订单详情" : detail.businessType==='ainuoke_contract' ? detail.insideOrderNo || "工厂款号待获取" : detail.styleNo || "正式订单详情"}
          description={detail
            ? <><strong>{detail.orderNo}</strong><span>{detail.businessType==='processing'?" · 加工订单":` · BillNo ${detail.billNo ?? "—"}`}</span></>
            : "从 PostgreSQL 读取权威订单与艾诺科来源事实。"}
          status={detail ? <StatusTag tone={lifecycleTone(detail.lifecycleState)}>{lifecycleLabels[detail.lifecycleState]}</StatusTag> : undefined}
          actions={sourceAction}
        />
        {children}
      </PageContainer>
    </AppShell>
  );
}

export function ServerSalesOrderDetailPage({ executionOnly = false }: { executionOnly?: boolean } = {}) {
  const searchParams = useSearchParams();
  const router=useRouter();
  const [preparationGuard,setPreparationGuard]=useState(false),[navigationNotice,setNavigationNotice]=useState('');
  const updatePreparationGuard=useCallback((blocked:boolean)=>{setPreparationGuard(blocked);if(!blocked)setNavigationNotice('');},[]);
  const requestNavigation=useCallback((target:string)=>{if(preparationGuard){setNavigationNotice('来源维护尚未完成，请先保存或关闭维护来源。');return;}router.push(target);},[preparationGuard,router]);
  useEffect(()=>{if(!preparationGuard)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[preparationGuard]);
  const salesOrderId = searchParams.get("id")?.normalize("NFKC").trim() ?? "";
  const serverSession = useServerSession();
  const requestLogout = async () => {
    if (preparationGuard) {
      setNavigationNotice('来源维护尚未完成，请先保存或关闭维护来源，再退出登录。');
      return;
    }
    await serverSession.logout();
  };
  const [detail, setDetail] = useState<OrderCenterServerDetailViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadEpoch = useRef(0);
  const [loadedScope, setLoadedScope] = useState("");
  const scopeKey = `${salesOrderId}/${serverSession.user?.id ?? ""}/${serverSession.permissions.join("|")}/${executionOnly}`;
  const loadDetail = useCallback(async () => {
    if (serverSession.status !== "authenticated" || !serverSession.hasPermission("order.view")) return;
    const epoch=++loadEpoch.current;
    if (!salesOrderId) {
      setDetail(null);
      setNotFound(true);
      setLoadedScope(scopeKey);
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
      const nextDetail = await loadServerOrderCenterDetail(serverSalesOrderReadRepository, salesOrderId);
      if(epoch!==loadEpoch.current)return;
      setDetail(nextDetail);
    } catch (nextError) {
      if(epoch!==loadEpoch.current)return;
      if ((nextError instanceof SalesOrderServerReadError) && nextError.status === 401) {
        setSessionExpired(true);
        serverSession.invalidate();
      } else if ((nextError instanceof SalesOrderServerReadError) && nextError.status === 403) {
        setPermissionDenied(true);
      } else if ((nextError instanceof SalesOrderServerReadError) && nextError.status === 404) {
        setNotFound(true);
      } else {
        setError(unavailableMessage(nextError));
      }
    } finally {
      if (epoch === loadEpoch.current) { setLoadedScope(scopeKey); setLoading(false); }
    }
  }, [salesOrderId, serverSession, scopeKey]);

  useEffect(() => {
    const epochRef = loadEpoch;
    let active = true;
    if (serverSession.status === "authenticated" && serverSession.hasPermission("order.view")) {
      void Promise.resolve().then(() => { if (active) void loadDetail(); });
    }
    return () => { active = false; epochRef.current++; };
  }, [loadDetail, serverSession]);



  if (serverSession.status === "checking") {
    return <ServerDetailFrame onRequestNavigation={requestNavigation} onRequestLogout={requestLogout} detail={null}><LoadingState label="确认织序 Server 登录状态" /></ServerDetailFrame>;
  }

  if (serverSession.status === "error") {
    return (
      <ServerDetailFrame onRequestNavigation={requestNavigation} onRequestLogout={requestLogout} detail={null}>
        <ErrorState title="订单服务暂时不可用" description={serverSession.error} onRetry={() => void serverSession.refresh()} />
      </ServerDetailFrame>
    );
  }

  if (serverSession.status === "anonymous") {
    return (
      <ServerDetailFrame onRequestNavigation={requestNavigation} onRequestLogout={requestLogout} detail={null}>
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
      <ServerDetailFrame onRequestNavigation={requestNavigation} onRequestLogout={requestLogout} detail={null}>
        <AlertBanner
          tone="warning"
          title="当前 Server 账号没有订单查看权限"
        >
          已登录为 {trustedIdentity}；读取详情需要 order.view 权限。
        </AlertBanner>
        <ErrorState permission title="Server 权限不足（403）" description="请联系管理员分配 order.view 权限。" />
      </ServerDetailFrame>
    );
  }

  if (loadedScope !== scopeKey) return <ServerDetailFrame onRequestNavigation={requestNavigation} onRequestLogout={requestLogout} detail={null}><LoadingState label="读取 PostgreSQL 正式订单详情" /></ServerDetailFrame>;

  return (
    <ServerDetailFrame onRequestNavigation={requestNavigation} onRequestLogout={requestLogout} detail={detail} sourceAction={detail?<OrderBusinessSourceButton key={'source-'+scopeKey} orderId={salesOrderId} businessType={detail.businessType} readOnly={Boolean(detail.attribution?.historicalDuplicate)||['completed','cancelled'].includes(detail.lifecycleState)} onGuardChange={updatePreparationGuard}/>:undefined}>

      {navigationNotice&&<AlertBanner tone="warning" title={navigationNotice}/> }
      {loading ? (
        <LoadingState label="读取 PostgreSQL 正式订单详情" />
      ) : notFound ? (
        <ErrorState title="正式订单不存在（404）" description="该 PostgreSQL SalesOrder ID 不存在或链接无效。" />
      ) : error ? (
        <ErrorState title="订单服务暂时不可用" description={error} onRetry={() => void loadDetail()} />
      ) : detail ? (
        <div className="oc-server-detail-content">
          {detail.attribution?.historicalDuplicate&&<AlertBanner tone="warning" title="历史重复订单 · 原身份与记录保留" actions={<a className="qc-button qc-button-secondary" href={`/order-center/server-detail?id=${encodeURIComponent(detail.attribution.effectiveOrderId)}`}>查看有效订单</a>}>此单不再接收新的执行、认领或价格采用。原合同、商业版本和历史流水保持。</AlertBanner>}
          <Card className="oc-server-detail-section oc-server-detail-zhixu oc-server-detail-overview">
            <header><div><h2>订单概况</h2></div><span>来源权威 · 不可编辑</span></header>
            <DescriptionList columns={3} compact items={[
              { key: "styleNo", label: "业务款号", value: detail.styleNo },
              { key: "customer", label: "客户", value: detail.customerName },
              { key: "brand", label: "品牌", value: detail.brandName },
              { key: "quantity", label: detail.businessType==='processing'?"加工数量（下单批次）":"订单数量（来源只读）", value: detail.quantity?.toLocaleString("zh-CN") },
              { key: "contractDelivery", label: detail.businessType==='processing'?"加工交期":"合同交期（来源）", value: detail.contractDeliveryDate },
              { key: "lifecycle", label: "订单状态", value: lifecycleLabels[detail.lifecycleState] },
              { key: "sourceLifecycle", label: "艾诺科状态", value: detail.businessType==='processing'?"不适用":detail.sourceLifecycleStatus },
            ]} />
          </Card>
          <Card className="oc-server-detail-section oc-server-detail-colors">
            <header>
              <div><h2>颜色明细</h2></div>
              <span>{detail.colors.length} 个颜色 · 来源只读</span>
            </header>
            <p className="oc-server-color-note">分码数据尚未接线；不依据颜色数量推算尺码。</p>
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

          {detail.businessType==='processing'?<Card className="oc-server-detail-section"><p style={{padding:18}}>加工订单不关联艾诺科销售合同，艾诺科物料流水不适用。</p></Card>:detail.attribution?.historicalDuplicate?<Card className="oc-server-detail-section"><p style={{padding:18}}>当前物料来源请在有效订单查看；原单快照保留在历史物料来源。</p></Card>:<OrderMaterialSummary key={'materials-'+scopeKey} salesOrderId={detail.id} />}
          {detail.businessType!=='processing'&&<MaterialHistoryDialog key={'material-history-'+scopeKey} orderId={detail.id}/>}
          <Card className="oc-server-detail-section">
            <details className="oc-server-technical-details">
              <summary>来源与技术详情 <span>只读</span></summary>
              <DescriptionList columns={3} compact items={[
                { key: "uuid", label: "UUID", value: detail.id },
                { key: "version", label: "数据版本", value: `v${detail.version}` },
                { key: "creationSource", label: "创建来源", value: creationSourceLabels[detail.creationSource], secondary: detail.creationSource },
                { key: "lifecycleCode", label: "生命周期原值", value: detail.lifecycleState },
                { key: "insideOrderNo", label: "工厂款号 / InsideOrderNo", value: detail.insideOrderNo, secondary: "可变来源属性，不是稳定订单身份" },
                { key: "company", label: "公司", value: detail.companyName },
                { key: "contractDate", label: detail.businessType==='processing'?"下单日期":"合同日期", value: detail.contractDate },
                { key: "colorCount", label: "有效颜色数", value: detail.colorCount.toLocaleString("zh-CN") },
                { key: "createdAt", label: "创建时间", value: detail.createdAt },
                { key: "updatedAt", label: "更新时间", value: detail.updatedAt },
              ]} />
              <div className="oc-server-source-bar">
                <span><i aria-hidden="true" />数据源：PostgreSQL</span>
                <small>Server identity：{trustedIdentity}</small>

              </div>
            </details>
          </Card>
        </div>
      ) : (
        <EmptyState title="未读取到正式订单详情" />
      )}
    </ServerDetailFrame>
  );
}

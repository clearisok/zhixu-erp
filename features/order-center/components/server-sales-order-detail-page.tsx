"use client";
import { ServerOrderWorkbench } from "./server-order-workbench";
import {useServerNavigationProtection} from '@/components/foundation/server-navigation-protection';
import { OrderBusinessSourceButton } from "./order-business-source-button";
import { ServerDeliveryPlanMaintenance } from './server-delivery-plan-maintenance';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProtectedRouter as useRouter } from "@/components/foundation/server-navigation-protection";
import {
  AlertBanner,
  AppShell,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
} from "@/components/foundation";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import { SalesOrderServerReadError } from "../server/sales-order-server-client";
import { loadServerOrderCenterDetail } from "../server/server-order-center-query";
import { serverSalesOrderReadRepository } from "../server/server-sales-order-read-repository";
import type {
  OrderCenterServerDetailViewModel,
} from "../server/sales-order-server-model";

function unavailableMessage(error: unknown): string {
  if (error instanceof SalesOrderServerReadError) {
    return `${error.code}（HTTP ${error.status}）。不会切换到 Browser 本地订单。`;
  }
  return "订单服务暂时不可用，请稍后重试。不会切换到 Browser 本地订单。";
}

function ServerDetailFrame({
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
    <AppShell title="订单工作台" backTarget={{href:"/order-center",label:"返回订单列表"}} identityMode="server" headerActions={sourceAction} onRequestNavigation={onRequestNavigation} onRequestLogout={onRequestLogout}>
      <PageContainer className="oc-order-center-page oc-server-detail-page">
        {children}
      </PageContainer>
    </AppShell>
  );
}

export function ServerSalesOrderDetailPage({ executionOnly = false }: { executionOnly?: boolean } = {}) {
  const searchParams = useSearchParams();
  const router=useRouter();
  const [preparationGuard,setPreparationGuard]=useState(false),[deliveryGuard,setDeliveryGuard]=useState(false),[navigationNotice,setNavigationNotice]=useState('');
  const protectedMaintenance = preparationGuard || deliveryGuard;
  const maintenanceMessage = '来源或交期维护尚未完成，请先保存、关闭或核对原请求。';
  useServerNavigationProtection({blocked:protectedMaintenance,message:maintenanceMessage});
  const updatePreparationGuard=useCallback((blocked:boolean)=>{setPreparationGuard(blocked);if(!blocked)setNavigationNotice('');},[]);
  const updateDeliveryGuard=useCallback((blocked:boolean)=>{setDeliveryGuard(blocked);if(!blocked)setNavigationNotice('');},[]);
  const [deliveryPlanRefreshToken, setDeliveryPlanRefreshToken] = useState(0);
  const requestNavigation=useCallback((target:string)=>{if(protectedMaintenance){setNavigationNotice(maintenanceMessage);return;}router.push(target);},[protectedMaintenance,router]);
  useEffect(()=>{if(!protectedMaintenance)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[protectedMaintenance]);
  const salesOrderId = searchParams.get("id")?.normalize("NFKC").trim().toLowerCase() ?? "";
  const serverSession = useServerSession();
  const deliverySaved = useCallback((orderId: string) => { if (orderId === salesOrderId) setDeliveryPlanRefreshToken(value => value + 1); }, [salesOrderId]);
  const requestLogout = async () => {
    if (protectedMaintenance) {
      setNavigationNotice(maintenanceMessage);
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
  const [loadedIdentity, setLoadedIdentity] = useState<object | null>(null);
  const scopeKey = `${salesOrderId}/${serverSession.user?.id ?? ""}/${serverSession.permissions.join("|")}/${executionOnly}`;
  const identity = useMemo(() => ({ salesOrderId, serverSession, executionOnly }), [salesOrderId, serverSession, executionOnly]);
  const identityOwner = useRef<object | null>(null);
  useLayoutEffect(() => { const epoch = loadEpoch; identityOwner.current = identity; return () => { identityOwner.current = null; epoch.current++; }; }, [identity]);
  const loadDetail = useCallback(async () => {
    if (serverSession.status !== "authenticated" || !serverSession.hasPermission("order.view")) return;
    const epoch=++loadEpoch.current;
    if (!salesOrderId) {
      setDetail(null);
      setNotFound(true);
      setLoadedScope(scopeKey);
      setLoadedIdentity(identity);
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
      if(epoch!==loadEpoch.current||identityOwner.current!==identity)return;
      setDetail(nextDetail);
    } catch (nextError) {
      if(epoch!==loadEpoch.current||identityOwner.current!==identity)return;
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
      if (epoch === loadEpoch.current && identityOwner.current === identity) { setLoadedScope(scopeKey); setLoadedIdentity(identity); setLoading(false); }
    }
  }, [salesOrderId, serverSession, scopeKey, identity]);

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

  if (loadedScope !== scopeKey || loadedIdentity !== identity) return <ServerDetailFrame onRequestNavigation={requestNavigation} onRequestLogout={requestLogout} detail={null}><LoadingState label="读取 PostgreSQL 正式订单详情" /></ServerDetailFrame>;

  return (
    <ServerDetailFrame onRequestNavigation={requestNavigation} onRequestLogout={requestLogout} detail={detail} sourceAction={detail?<div className="oc-server-detail-actions" role="group" aria-label="订单维护操作"><OrderBusinessSourceButton key={'source-'+scopeKey} orderId={salesOrderId} businessType={detail.businessType} readOnly={Boolean(detail.attribution?.historicalDuplicate)||['completed','cancelled'].includes(detail.lifecycleState)} onGuardChange={updatePreparationGuard}/><ServerDeliveryPlanMaintenance key={'delivery-'+scopeKey} orderId={salesOrderId} processing={detail.businessType==='processing'} readOnly={Boolean(detail.attribution?.historicalDuplicate)} onGuardChange={updateDeliveryGuard} onSaved={deliverySaved}/></div>:undefined}>

      {navigationNotice&&<AlertBanner tone="warning" title={navigationNotice}/> }
      {loading ? (
        <LoadingState label="读取 PostgreSQL 正式订单详情" />
      ) : notFound ? (
        <ErrorState title="正式订单不存在（404）" description="该 PostgreSQL SalesOrder ID 不存在或链接无效。" />
      ) : error ? (
        <ErrorState title="订单服务暂时不可用" description={error} onRetry={() => void loadDetail()} />
      ) : detail ? (
        <ServerOrderWorkbench key={scopeKey} detail={detail} trustedIdentity={trustedIdentity} deliveryPlanRefreshToken={deliveryPlanRefreshToken} />
      ) : (
        <EmptyState title="未读取到正式订单详情" />
      )}
    </ServerDetailFrame>
  );
}

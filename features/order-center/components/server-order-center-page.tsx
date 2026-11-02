"use client";

import {ServerSourceCatalog} from './server-source-catalog';
import {ProcessingBatchDialog} from "./processing-batch-dialog";
import { useCallback, useEffect, useState, useRef } from "react";
import { OrderAlertTags } from "./order-alert-tags";
import { useProtectedRouter as useRouter } from "@/components/foundation/server-navigation-protection";
import {
  AlertBanner,
  AppShell,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  FormItem,
  LoadingState,
  PageContainer,
  PageHeader,
  SearchField,
  StatusTag,
  Toolbar,
  type DataColumn,
} from "@/components/foundation";
import { ServerLoginCard, useServerSession } from "@/features/server-auth";
import { OrderCenterNavigation } from "@/features/style-progress/components/order-center-navigation";
import { SalesOrderServerReadError } from "../server/sales-order-server-client";
import {
  initialServerOrderCenterQuery,
  loadServerOrderCenterPage,
  normalizeServerOrderSearch,
  SERVER_ORDER_CENTER_PAGE_SIZE,
  type ServerOrderCenterQueryState,
} from "../server/server-order-center-query";
import { serverSalesOrderReadRepository } from "../server/server-sales-order-read-repository";
import type {
  OrderCenterServerListViewModel,
  ServerSalesOrderCreationSource,
  ServerSalesOrderLifecycleState,
  ServerSalesOrderPage,
} from "../server/sales-order-server-model";

const emptyPage: ServerSalesOrderPage = {
  limit: SERVER_ORDER_CENTER_PAGE_SIZE,
  offset: 0,
  total: 0,
  hasMore: false,
};

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

function readError(error: unknown): string {
  if (error instanceof SalesOrderServerReadError) {
    return `${error.code}（HTTP ${error.status}）`;
  }
  return "订单服务暂时不可用，请稍后重试。不会切换到 Browser 本地订单。";
}

function lifecycleTone(
  lifecycleState: ServerSalesOrderLifecycleState,
): "neutral" | "success" | "danger" {
  if (lifecycleState === "cancelled") return "danger";
  if (lifecycleState === "confirmed" || lifecycleState === "completed") return "success";
  return "neutral";
}

function OrderCenterFrame({
  count,
  children,
  actions,
}: {
  count: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <AppShell title="订单中心" identityMode="server">
      <PageContainer className="oc-order-center-page oc-server-order-center-page">
        <OrderCenterNavigation />
        <PageHeader
          eyebrow="ORDER CENTER"
          title="订单中心"
          count={count}
          description="正式订单基础视图；数据源：PostgreSQL。"
          actions={actions}
        />
        {children}
      </PageContainer>
    </AppShell>
  );
}

export function ServerOrderCenterPage() {
  const router = useRouter();
  const [catalogOpen,setCatalogOpen]=useState(false);
  const serverSession = useServerSession();
  const [items, setItems] = useState<OrderCenterServerListViewModel[]>([]);
  const [page, setPage] = useState<ServerSalesOrderPage>(emptyPage);
  const [query, setQuery] = useState<ServerOrderCenterQueryState>(initialServerOrderCenterQuery);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const loadEpoch = useRef(0);
  const [loadedScope,setLoadedScope] = useState('');
  const scopeKey=JSON.stringify([query,serverSession.user?.id,serverSession.permissions]);
  const handleReadFailure = useCallback((error: unknown): "session" | "read" => {
    if (error instanceof SalesOrderServerReadError && error.status === 401) {
      setItems([]);
      setPage(emptyPage);
      serverSession.invalidate();
      return "session";
    }
    if (error instanceof SalesOrderServerReadError && error.status === 403) {
      setItems([]);
      setPage(emptyPage);
      setPermissionDenied(true);
      return "session";
    }
    return "read";
  }, [serverSession]);

  const loadList = useCallback(async () => {
    if (serverSession.status !== "authenticated" || !serverSession.hasPermission("order.view")) return;
    const epoch=++loadEpoch.current;
    setLoading(true);
    setItems([]);
    setListError(null);
    setPermissionDenied(false);
    try {
      const result = await loadServerOrderCenterPage(serverSalesOrderReadRepository, query);
      if(epoch!==loadEpoch.current)return;
      setItems(result.items);
      setPage(result.page);
    } catch (error) {
      if(epoch!==loadEpoch.current)return;
      if (handleReadFailure(error) === "read") {
        setItems([]);
        setPage(emptyPage);
        setListError(readError(error));
      }
    } finally {
      if(epoch===loadEpoch.current){setLoadedScope(scopeKey);setLoading(false);}
    }
  }, [handleReadFailure, query, serverSession,scopeKey]);

  useEffect(() => {
    if (serverSession.status === "authenticated" && serverSession.hasPermission("order.view")) {
      let active=true;const epochRef=loadEpoch;
      void Promise.resolve().then(()=>{if(active)void loadList();});
      return()=>{active=false;epochRef.current++;};
    }
  }, [loadList, serverSession]);

  const openDetail = (item: OrderCenterServerListViewModel) => {
    router.push(`/order-center/server-detail?id=${encodeURIComponent(item.id)}`);
  };



  const updateQuery = <Key extends keyof ServerOrderCenterQueryState,>(
    key: Key,
    value: ServerOrderCenterQueryState[Key],
  ) => {
    setQuery((current) => ({ ...current, offset: 0, [key]: value }));
  };

  const columns: DataColumn<OrderCenterServerListViewModel>[] = [
    {
      key: "orderNo",
      header: "正式订单 / BillNo",
      width: 188,
      sticky: "left",
      responsivePriority: "primary",
      render: (item) => (
        <div className="oc-primary-cell">
          <strong>{item.orderNo}</strong>{item.attribution?.historicalDuplicate&&<StatusTag tone="warning">历史重复</StatusTag>}
          <small>{item.businessType==='processing'?'加工订单 · 无销售合同':item.billNo??'未绑定 BillNo'}</small>
        </div>
      ),
    },
    {
      key: "style",
      header: "款号 / 工厂款号",
      width: 178,
      responsivePriority: "primary",
      render: (item) => (
        <div className="oc-primary-cell">
          <strong>{item.styleNo || "—"}</strong>
          <small>{item.factoryStyleNo ?? "—"}</small>
        </div>
      ),
    },
    {
      key: "customer",
      header: "客户 / 品牌",
      width: 172,
      responsivePriority: "primary",
      render: (item) => (
        <div className="oc-primary-cell">
          <strong>{item.customerName || "—"}</strong>
          <small>{item.brandName || "—"}</small>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "订单数量",
      width: 96,
      align: "right",
      responsivePriority: "primary",
      render: (item) => (
        <strong className="oc-number">
          {item.initialQuantity?.toLocaleString("zh-CN") ?? "—"}
        </strong>
      ),
    },
    {
      key: "lifecycle",
      header: "生命周期 / 来源状态",
      width: 158,
      responsivePriority: "primary",
      render: (item) => (
        <div className="oc-server-status-cell">
          <StatusTag tone={lifecycleTone(item.lifecycleState)}>
            {lifecycleLabels[item.lifecycleState]}
          </StatusTag>
          <small>{item.businessType==='processing'?'加工下单批次':`艾诺科：${item.sourceLifecycleStatus||'未记录'}`}</small>
        </div>
      ),
    },
    {
      key: "delivery",
      header: "交期 / 颜色",
      width: 142,
      responsivePriority: "primary",
      render: (item) => (
        <div className="oc-delivery-cell">
          <strong>{item.contractDeliveryDate ?? "—"}</strong>
          <small>{item.colorCount} 个颜色</small>
        </div>
      ),
    },
    {
      key: "source",
      header: "业务来源",
      width: 104,
      responsivePriority: "secondary",
      render: (item) => <><span>{item.businessSource==='quote'?'来自报价':item.businessSource==='reorder'?'来自翻单':'待维护'}</span><small>{item.businessType==='ainuoke_contract'?'合同类':item.businessType==='processing'?'加工类':'历史类型待核实'}</small></>,
    },
    { key: "alerts", header: "异常", width: 158, responsivePriority: "primary", render: (item) => <OrderAlertTags alerts={item.alerts} /> },
    {
      key: "action",
      header: "操作",
      width: 94,
      sticky: "right",
      align: "center",
      responsivePriority: "primary",
      className: "oc-sticky-action",
      render: (item) => (
        <Button
          variant="text"
          onClick={(event) => {
            event.stopPropagation();
            openDetail(item);
          }}
        >
          查看
        </Button>
      ),
    },
  ];

  const renderRecord = (item: OrderCenterServerListViewModel) => (
    <div className="oc-order-record oc-server-order-record">
      <header>
        <div><strong>{item.styleNo || "未记录款号"}</strong><small>{item.businessType==='processing'?'加工业务款号':item.factoryStyleNo??'未记录工厂款号'}</small></div>
        <span>只读查看 <b>›</b></span>
      </header>
      <div className="oc-order-record-identity">
        <span><small>正式订单号</small><strong>{item.orderNo}</strong></span>
        <span><small>BillNo</small><strong>{item.billNo ?? "—"}</strong></span>
      </div>
      <div className="oc-order-record-facts">
        <span><small>订单数量</small><strong>{item.initialQuantity?.toLocaleString("zh-CN") ?? "—"}</strong></span>
        <span><small>交期</small><strong>{item.contractDeliveryDate ?? "—"}</strong></span>
        <span><small>颜色数</small><strong>{item.colorCount}</strong></span>
      </div>
      <OrderAlertTags alerts={item.alerts} />
      <div className="oc-server-record-status">
        <StatusTag tone={lifecycleTone(item.lifecycleState)}>{lifecycleLabels[item.lifecycleState]}</StatusTag>
        {item.attribution?.historicalDuplicate&&<StatusTag tone="warning">历史重复</StatusTag>}
        <small>{item.businessType==='processing'?'艾诺科来源：不适用':`艾诺科来源状态：${item.sourceLifecycleStatus||'未记录'}`}</small>
      </div>
    </div>
  );

  if (serverSession.status === "checking") {
    return <OrderCenterFrame count="—"><LoadingState label="确认织序 Server 登录状态" /></OrderCenterFrame>;
  }

  if (serverSession.status === "error") {
    return (
      <OrderCenterFrame count="—">
        <ErrorState title="订单服务暂时不可用" description={serverSession.error} onRetry={() => void serverSession.refresh()} />
      </OrderCenterFrame>
    );
  }

  if (serverSession.status === "anonymous") {
    return (
      <OrderCenterFrame count="—">
        <AlertBanner tone="info" title="登录后查看正式订单">
          订单中心使用可信 Server session；不会读取或回退到 Browser 本地订单。
        </AlertBanner>
        <ServerLoginCard defaultUsername={process.env.NODE_ENV === "development" ? "admin" : ""} />
      </OrderCenterFrame>
    );
  }

  const trustedIdentity = `${serverSession.user.name}（${serverSession.user.username}）`;
  if (permissionDenied || !serverSession.hasPermission("order.view")) {
    return (
      <OrderCenterFrame count="—">
        <AlertBanner
          tone="warning"
          title="当前 Server 账号没有订单查看权限"
        >
          已登录为 {trustedIdentity}；需要 order.view 权限。
        </AlertBanner>
        <ErrorState permission title="Server 权限不足（403）" description="请联系管理员分配 order.view 权限。" />
      </OrderCenterFrame>
    );
  }

  return (
    <OrderCenterFrame count={loadedScope===scopeKey?`${page.total} 条${query.includeHistorical?'（含历史记录）':''}`:"—"} actions={<><Button variant="secondary" onClick={()=>setCatalogOpen(value=>!value)}>{catalogOpen?"当前跟进":"全部合同 / 历史查阅"}</Button><ProcessingBatchDialog key={serverSession.user.id} mode="import" /></>}>
      <div className="oc-server-source-bar">
        <span><i aria-hidden="true" />数据源：PostgreSQL</span>
        <small>Server identity：{trustedIdentity}</small>

      </div>
      {catalogOpen?<ServerSourceCatalog key={serverSession.user.id} canManage={serverSession.hasPermission("ainuoke.bind")} onChanged={()=>void loadList()}/>:<>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          updateQuery("search", normalizeServerOrderSearch(searchInput));
        }}
      >
        <Toolbar
          className="oc-order-toolbar oc-server-order-toolbar"
          search={<SearchField value={searchInput} onChange={setSearchInput} label="搜索正式订单" placeholder="订单号、BillNo、工厂款号、款号、客户或品牌" />}
          filters={<Button type="submit" variant="secondary">查询</Button>}
          moreFilters={(
            <>
              <FormItem label="订单范围">
                <select className="qc-control" value={query.includeHistorical?'history':'current'} onChange={event=>updateQuery('includeHistorical',event.target.value==='history')}>
                  <option value="current">有效订单</option><option value="history">包含历史订单</option>
                </select>
              </FormItem>
              <FormItem label="生命周期">
                <select className="qc-control" value={query.lifecycleState} onChange={(event) => updateQuery("lifecycleState", event.target.value as ServerSalesOrderLifecycleState | "")}>
                  <option value="">全部生命周期</option>
                  {Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormItem>
              <FormItem label="创建来源">
                <select className="qc-control" value={query.creationSource} onChange={(event) => updateQuery("creationSource", event.target.value as ServerSalesOrderCreationSource | "")}>
                  <option value="">全部来源</option>
                  {Object.entries(creationSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormItem>
              <FormItem label="排序字段">
                <select className="qc-control" value={query.sortBy} onChange={(event) => updateQuery("sortBy", event.target.value as ServerOrderCenterQueryState["sortBy"])}>
                  <option value="orderNo">正式订单号</option>
                  <option value="updatedAt">更新时间</option>
                  <option value="contractDeliveryDate">合同交期</option>
                  <option value="salesContractNo">BillNo</option>
                </select>
              </FormItem>
              <FormItem label="排序方向">
                <select className="qc-control" value={query.sortDirection} onChange={(event) => updateQuery("sortDirection", event.target.value as ServerOrderCenterQueryState["sortDirection"])}>
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </FormItem>
            </>
          )}
          resultSummary={page.total === 0 ? "0 条" : `${page.offset + 1}–${Math.min(page.offset + items.length, page.total)} / ${page.total}`}
          mobileFilterTitle="正式订单筛选与排序"
        />
      </form>
      <Card className="oc-list-card oc-order-table oc-server-order-table">
        <DataTable
          rows={loadedScope===scopeKey?items:[]}
          columns={columns}
          rowKey={(item) => item.id}
          loading={loading||loadedScope!==scopeKey}
          loadingLabel="读取 PostgreSQL 正式订单"
          error={listError}
          onRetry={() => void loadList()}
          onRowActivate={openDetail}
          renderRecord={renderRecord}
          ariaLabel="PostgreSQL 正式订单列表"
          moduleKey="order-center"
          tableKey="order-center.server-order-list"
          empty={<EmptyState title="没有匹配的正式订单" description="调整搜索或筛选条件后重试。" />}
        />
        <div className="oc-server-pagination" aria-label="正式订单分页">
          <Button variant="secondary" disabled={query.offset === 0 || loading} onClick={() => setQuery((current) => ({ ...current, offset: Math.max(0, current.offset - SERVER_ORDER_CENTER_PAGE_SIZE) }))}>上一页</Button>
          <span>{page.total === 0 ? "0" : `${page.offset + 1}–${Math.min(page.offset + items.length, page.total)}`} / {page.total}</span>
          <Button variant="secondary" disabled={!page.hasMore || loading} onClick={() => setQuery((current) => ({ ...current, offset: current.offset + SERVER_ORDER_CENTER_PAGE_SIZE }))}>下一页</Button>
        </div>
      </Card>
      </>}
    </OrderCenterFrame>
  );
}

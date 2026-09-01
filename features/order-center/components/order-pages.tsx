"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertBanner, AppShell, Button, Card, ContextSummary, DataTable, DescriptionList, Drawer, EmptyState, ErrorState, FormItem, FormSection, FormShell, loadTablePreference, Modal, NullableNumberInput, PageContainer, PageHeader, SaveBar, saveTablePreference, SearchField, SectionNavigation, StatusTag, Toast, Toolbar, Workspace, type DataColumn, type TablePreference } from "@/components/foundation";
import { createOperationId, createOrderOperationLog, operationLogRepository, type OperationLog } from "@/features/operation-logs";
import { PermissionButton, usePermissions } from "@/features/permissions";
import {
  activeDeliveryPlans,
  createOrderId,
  getCurrentPriceVersion,
  getDeliveryPlannedQuantity,
  getEffectiveQuantity,
  getOrderLatestDeliveryDate,
  getOrderNearestDeliveryDate,
  validateOrderIntegrity,
  type DeliveryPlan,
  type OrderPriceVersion,
  type OrderQuantityChangeType,
  type SalesOrder,
} from "../model/order";
import {
  cancelOrder,
  changeOrderQuantity,
  confirmOrder,
  createManualOrder,
  createOrderPriceVersion,
  createReorder,
  orderDeliveryWarning,
  suggestOrderNo,
  upsertDeliveryPlan,
  voidDeliveryPlan,
} from "../service/order-service";
import { orderRepository } from "../repository/order-repository";
import { OrderAttachmentPanel } from "./order-attachment-panel";
import { assignmentsForOrder, getMaterialReadyDate, productionSchedulingRepository, productionSiteForAssignment, projectOrderSchedule, recommendTransport, type ProductionSchedulingState } from "@/features/production-scheduling";
import { closingRepository, projectOrderClosing, type ClosingState } from "@/features/closing-center";
import { operationsSettingsRepository } from "@/features/operations-settings/repository/operations-settings-repository";

const emptySchedulingState: ProductionSchedulingState = { scheduleAssignments: [], orderExecutionTrackings: [], scheduleBatches: [] };
const emptyClosingState: ClosingState = { periods: [], allocations: [] };

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number | null, currency = "¥") => value === null ? "—" : `${currency}${value.toFixed(2)}`;
const statusLabel: Record<SalesOrder["status"], string> = { draft: "草稿", confirmed: "已确认", active: "执行中", completed: "已完成", cancelled: "已取消" };
const sourceLabel: Record<SalesOrder["sourceType"], string> = { quote: "报价生成", reorder: "翻单", manual: "手工创建", ainuoke: "艾诺科同步" };
const orderTypeLabel = { processing: "加工", distribution: "经销" } as const;
export const ORDER_LIST_DEFAULT_COLUMN_WIDTHS: Record<string, number> = { orderNo: 154, image: 78, style: 176, customer: 170, type: 88, country: 110, quantity: 94, labor: 110, salePrice: 110, delivery: 142, merchandiser: 120, statuses: 164, updatedAt: 120, action: 108 };

export function OrderCenterPage() {
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [scheduling, setScheduling] = useState<ProductionSchedulingState>(emptySchedulingState);
  const [closing, setClosing] = useState<ClosingState>(emptyClosingState);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [orderType, setOrderType] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tablePreference, setTablePreference] = useState<TablePreference>({ moduleKey: "order-center", tableKey: "order-center.order-list", columnWidths: ORDER_LIST_DEFAULT_COLUMN_WIDTHS });
  const loadOrders = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([orderRepository.list(), productionSchedulingRepository.load(), closingRepository.load()])
      .then(([nextOrders, nextScheduling, nextClosing]) => { setOrders(nextOrders); setScheduling(nextScheduling); setClosing(nextClosing); })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "订单数据加载失败"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    Promise.all([orderRepository.list(), productionSchedulingRepository.load(), closingRepository.load()])
      .then(([nextOrders, nextScheduling, nextClosing]) => { setOrders(nextOrders); setScheduling(nextScheduling); setClosing(nextClosing); })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "订单数据加载失败"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { Promise.resolve().then(() => setTablePreference(loadTablePreference(currentUser.id, "order-center", "order-center.order-list", ORDER_LIST_DEFAULT_COLUMN_WIDTHS))); }, [currentUser.id]);
  const rows = useMemo(() => orders.filter((order) => {
    const searchable = [order.orderNo, order.salesContractNo, order.customerPoNo, order.customerNameSnapshot, order.styleNo, order.factoryStyleNo, order.styleName, order.brandNameSnapshot].join(" ").toLocaleLowerCase();
    return (!query.trim() || searchable.includes(query.trim().toLocaleLowerCase()))
      && (status === "all" || order.status === status)
      && (orderType === "all" || order.orderType === orderType);
  }), [orderType, orders, query, status]);

  if (!can("order.view")) return <AppShell title="订单中心"><PageContainer><Card className="oc-no-permission"><ErrorState permission title="暂无订单查看权限" description="请联系管理员分配 order.view 权限。" /></Card></PageContainer></AppShell>;

  const productionLabel = { unscheduled: "未排单", partially_scheduled: "部分排单", scheduled_pending: "已排待产", in_production: "生产中", partially_completed: "部分完成", completed: "已完成" } as const;
  const closingLabel = { unclosed: "未关账", partially_closed: "部分关账", closed: "已关账", over_allocated: "超额关账" } as const;
  const factsFor = (order: SalesOrder) => {
    const schedule = projectOrderSchedule(order, scheduling);
    const closingProjection = projectOrderClosing(order, closing);
    const nearest = getOrderNearestDeliveryDate(order);
    const latest = getOrderLatestDeliveryDate(order);
    const warning = schedule.deliveryRisk.messages[0] ?? schedule.warnings[0] ?? orderDeliveryWarning(order);
    return { schedule, closingProjection, nearest, latest, warning };
  };
  const openOrder = (order: SalesOrder) => router.push(`/order-center/detail?id=${encodeURIComponent(order.id)}`);
  const renderStatuses = (order: SalesOrder) => {
    const { schedule, closingProjection } = factsFor(order);
    return <div className="oc-status-summary" aria-label="订单、生产、关账状态">
      <span><small>订单</small><StatusTag tone={order.status === "cancelled" ? "danger" : order.status === "confirmed" || order.status === "completed" ? "success" : "neutral"}>{statusLabel[order.status]}</StatusTag></span>
      <span><small>生产</small><b>{productionLabel[schedule.productionStatus]}</b></span>
      <span><small>关账</small><b>{closingLabel[closingProjection.status]}</b></span>
    </div>;
  };
  const columns: DataColumn<SalesOrder>[] = [
    { key: "style", header: "款号 / 款式", width: tablePreference.columnWidths.style, sticky: "left", responsivePriority: "primary", render: (order) => <div className="oc-primary-cell"><strong>{order.styleNo || "—"}</strong><small>{order.styleName || "—"}</small></div> },
    { key: "orderNo", header: "销售合同 / 订单号", width: tablePreference.columnWidths.orderNo, responsivePriority: "primary", render: (order) => <div className="oc-primary-cell"><strong>{order.salesContractNo || order.orderNo}</strong><small>{order.salesContractNo ? order.orderNo : orderTypeLabel[order.orderType]}{order.productionCountry ? ` · ${order.productionCountry}` : ""}</small></div> },
    { key: "customer", header: "客户 / PO", width: tablePreference.columnWidths.customer, responsivePriority: "primary", render: (order) => <div className="oc-primary-cell"><strong>{order.customerNameSnapshot || "—"}</strong><small>PO {order.customerPoNo || "—"}</small></div> },
    { key: "quantity", header: "有效数量", width: tablePreference.columnWidths.quantity, align: "right", responsivePriority: "primary", render: (order) => <strong className="oc-number">{getEffectiveQuantity(order).toLocaleString("zh-CN")}</strong> },
    { key: "delivery", header: "最近 / 最终交期", width: tablePreference.columnWidths.delivery, responsivePriority: "primary", render: (order) => { const { nearest, latest, warning } = factsFor(order); return <div className="oc-delivery-cell"><strong>{nearest ?? "—"}</strong><small>最终 {latest ?? "—"}</small>{warning && <em>{warning}</em>}</div>; } },
    { key: "statuses", header: "执行状态", width: tablePreference.columnWidths.statuses, responsivePriority: "primary", render: renderStatuses },
    { key: "action", header: "操作", width: tablePreference.columnWidths.action, sticky: "right", align: "center", responsivePriority: "primary", className: "oc-sticky-action", render: (order) => <Button variant="text" onClick={(event) => { event.stopPropagation(); openOrder(order); }}>打开订单 →</Button> },
  ];
  const renderOrderRecord = (order: SalesOrder) => { const { nearest, latest, warning } = factsFor(order); return <div className="oc-order-record">
    <header><div><strong>{order.styleNo || "未填写款号"}</strong><small>{order.styleName || "—"}</small></div><span>打开订单 <b>›</b></span></header>
    <div className="oc-order-record-identity"><span><small>订单号</small><strong>{order.orderNo}</strong></span><span><small>客户 / PO</small><strong>{order.customerNameSnapshot || "—"}</strong><em>{order.customerPoNo || "—"}</em></span></div>
    <div className="oc-order-record-facts"><span><small>有效数量</small><strong>{getEffectiveQuantity(order).toLocaleString("zh-CN")}</strong></span><span><small>最近交期</small><strong>{nearest ?? "—"}</strong></span><span><small>最终交期</small><strong>{latest ?? "—"}</strong></span></div>
    {renderStatuses(order)}
    {warning && <div className="oc-order-risk"><small>异常</small><strong>{warning}</strong></div>}
  </div>; };

  return <AppShell title="订单中心"><PageContainer className="oc-order-center-page">
    <PageHeader eyebrow="ORDER CENTER" title="订单中心" count={`${rows.length} 条`} description="按款式识别订单，快速判断数量、交期与执行状态。" secondaryActions={<><Button variant="secondary" permission="ainuoke.view" onClick={() => router.push("/ainuoke-sync")}>艾诺科同步</Button><Button variant="secondary" onClick={() => setSettingsOpen(true)}>页面设置</Button></>} primaryAction={<PermissionButton permission="order.create" onClick={() => router.push("/order-center/new")}>＋ 新建订单</PermissionButton>} />
    <Toolbar className="oc-order-toolbar" search={<SearchField value={query} onChange={setQuery} placeholder="搜索销售合同、订单号、款号、工厂款号、客户或 PO" label="搜索订单" />} moreFilters={<><FormItem label="订单状态"><select className="qc-control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="draft">草稿</option><option value="confirmed">已确认</option><option value="active">执行中</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></FormItem><FormItem label="订单类型"><select className="qc-control" value={orderType} onChange={(event) => setOrderType(event.target.value)}><option value="all">全部类型</option><option value="processing">加工</option><option value="distribution">经销</option></select></FormItem></>} resultSummary={`显示 ${rows.length} / ${orders.length} 条`} mobileFilterTitle="订单筛选" />
    <Card className="oc-list-card oc-order-table">
      <DataTable rows={rows} columns={columns} rowKey={(order) => order.id} loading={loading} error={loadError} onRetry={loadOrders} onRowActivate={openOrder} renderRecord={renderOrderRecord} ariaLabel="订单中心列表" empty={<EmptyState title="没有匹配的订单" description="调整搜索或筛选条件后重试。" />} />
    </Card>
    <Modal open={settingsOpen} title="订单列表页面设置" description="调整默认核心列宽；原有用户设置与存储键继续兼容。" onClose={() => setSettingsOpen(false)} onSubmit={() => { setTablePreference(saveTablePreference(currentUser.id, tablePreference, ORDER_LIST_DEFAULT_COLUMN_WIDTHS)); setSettingsOpen(false); }} footer={<><Button variant="secondary" onClick={() => setTablePreference({ ...tablePreference, columnWidths: ORDER_LIST_DEFAULT_COLUMN_WIDTHS })}>恢复默认</Button><Button variant="secondary" onClick={() => setSettingsOpen(false)}>取消</Button><Button type="submit">保存设置</Button></>}><div className="oc-column-settings">{Object.entries({ style: "款号 / 款式", orderNo: "订单号", customer: "客户 / PO", quantity: "有效数量", delivery: "交期", statuses: "执行状态", action: "操作" }).map(([key, label]) => <FormItem key={key} label={label}><NullableNumberInput className="qc-control" min="56" value={tablePreference.columnWidths[key]} onValueChange={(value) => setTablePreference((current) => ({ ...current, columnWidths: { ...current.columnWidths, [key]: value ?? ORDER_LIST_DEFAULT_COLUMN_WIDTHS[key] } }))} /></FormItem>)}</div></Modal>
  </PageContainer></AppShell>;
}

type QuantityModalState = { afterQuantity: number | null; changeType: OrderQuantityChangeType; reason: string } | null;
type PriceModalState = { salePrice: number | null; processingUnitPrice: number | null; processingCurrency: "CNY" | "USD"; exchangeRateSnapshot: number | null; effectiveDate: string; reason: string } | null;
type DeliveryModalState = { plan: DeliveryPlan } | null;

function OrderEditor({ initialOrder, isNew }: { initialOrder: SalesOrder; isNew: boolean }) {
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const actor = { id: currentUser.id, name: currentUser.name };
  const [order, setOrder] = useState(initialOrder);
  const savedRef = useRef<SalesOrder | null>(isNew ? null : structuredClone(initialOrder));
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [quantityModal, setQuantityModal] = useState<QuantityModalState>(null);
  const [priceModal, setPriceModal] = useState<PriceModalState>(null);
  const [deliveryModal, setDeliveryModal] = useState<DeliveryModalState>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pendingListNavigation, setPendingListNavigation] = useState(false);
  const [historyDrawer, setHistoryDrawer] = useState<"quantity" | "price" | null>(null);
  const [activeSection, setActiveSection] = useState("order-overview");
  const [cancelReason, setCancelReason] = useState("");
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [scheduling, setScheduling] = useState<ProductionSchedulingState>(emptySchedulingState);
  const [closing, setClosing] = useState<ClosingState>(emptyClosingState);
  const [operationsSettings] = useState(() => operationsSettingsRepository.load());
  const readOnly = !(isNew ? can("order.create") : can("order.edit")) || order.status === "cancelled";
  const currentPrice = getCurrentPriceVersion(order);
  const warning = orderDeliveryWarning(order);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2500); };
  const patchOrder = (patch: Partial<SalesOrder>) => { if (readOnly) return; setOrder((current) => ({ ...current, ...patch })); setDirty(true); };
  const refreshLogs = () => { if (!isNew) void operationLogRepository.listByOrderId(order.id).then(setLogs); };
  useEffect(refreshLogs, [isNew, order.id]);
  useEffect(() => { if (!isNew) void Promise.all([productionSchedulingRepository.load(), closingRepository.load()]).then(([nextScheduling, nextClosing]) => { setScheduling(nextScheduling); setClosing(nextClosing); }); }, [isNew]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  const persistWithLogs = async (next: SalesOrder, nextLogs: ReturnType<typeof createOrderOperationLog>[]) => {
    const saved = await orderRepository.save(next);
    await operationLogRepository.appendMany(nextLogs);
    savedRef.current = structuredClone(saved);
    setOrder(saved);
    setDirty(false);
    refreshLogs();
    return saved;
  };

  const save = async (): Promise<boolean> => {
    if (!can(isNew ? "order.create" : "order.edit")) return false;
    setError("");
    if (isNew) {
      const creationIssues = validateOrderIntegrity(order);
      if (creationIssues.length) {
        setError(creationIssues.map((issue) => issue.message).join("；"));
        document.querySelector<HTMLElement>(".oc-create-form [data-invalid], .oc-create-form input, .oc-create-form select")?.focus();
        return false;
      }
    }
    if (await orderRepository.orderNoExists(order.orderNo, order.id)) { setError("订单号已存在"); return false; }
    const action = isNew ? order.sourceType === "reorder" ? "翻单创建订单" : "创建订单" : "修改订单基础信息";
    const before = savedRef.current;
    const afterValues = { "订单号": order.orderNo, "客户": order.customerNameSnapshot, "客户PO": order.customerPoNo || null, "款号": order.styleNo, "订单类型": orderTypeLabel[order.orderType], "订单状态": statusLabel[order.status] };
    const operationId = createOperationId();
    const nextLogs = [createOrderOperationLog({
      order,
      actor: { userId: currentUser.id, userName: currentUser.name },
      action,
      beforeValues: before ? { "订单号": before.orderNo, "客户": before.customerNameSnapshot, "客户PO": before.customerPoNo || null, "款号": before.styleNo, "订单类型": orderTypeLabel[before.orderType], "订单状态": statusLabel[before.status] } : undefined,
      afterValues,
      operationId,
    })];
    if (isNew) nextLogs.push(createOrderOperationLog({
      order,
      actor: { userId: currentUser.id, userName: currentUser.name },
      action: "创建订单初始价格",
      entityType: "OrderPriceVersion",
      entityId: order.currentPriceVersionId,
      afterValues: { "价格版本": "P1", "销售价": currentPrice.salePrice, "工价": currentPrice.processingUnitPrice, "加工币种": currentPrice.processingCurrency, "汇率依据": currentPrice.exchangeRateSnapshot },
      operationId,
      operationSequence: 1,
    }));
    if (isNew) order.deliveryPlans.forEach((plan, index) => nextLogs.push(createOrderOperationLog({
      order,
      actor: { userId: currentUser.id, userName: currentUser.name },
      action: "新增交期",
      entityType: "DeliveryPlan",
      entityId: plan.id,
      afterValues: { "交期": plan.deliveryDate, "数量": plan.quantity },
      operationId,
      operationSequence: index + 2,
    })));
    try {
      const saved = await persistWithLogs({ ...order, orderNo: order.orderNo.trim(), updatedAt: new Date().toISOString(), updatedBy: currentUser.name }, nextLogs);
      notify("订单已保存");
      if (isNew) window.setTimeout(() => router.replace(`/order-center/detail?id=${encodeURIComponent(saved.id)}`), 250);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "订单保存失败"); return false; }
  };

  const requestListNavigation = () => { if (dirty) setPendingListNavigation(true); else router.push("/order-center"); };
  const saveAndReturn = async () => { if (await save()) router.push("/order-center"); };

  const confirm = async () => {
    const issues = validateOrderIntegrity(order);
    if (issues.length) { setError(issues.map((issue) => issue.message).join("；")); return; }
    const next = confirmOrder(order, actor);
    await persistWithLogs(next, [createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action: "确认订单", beforeValues: { "订单状态": statusLabel[order.status] }, afterValues: { "订单状态": statusLabel[next.status] } })]);
    notify("订单已确认；交期差异仅提示，不会自动调整");
  };

  const applyQuantity = async () => {
    if (!quantityModal || !can("order.edit")) return;
    const isCancellation = quantityModal.changeType === "partial_cancel" || quantityModal.changeType === "full_cancel";
    if (isCancellation && !can("order.cancel")) { setError("暂无取消订单权限，请联系管理员"); return; }
    try {
      const before = getEffectiveQuantity(order);
      const next = changeOrderQuantity(order, { afterQuantity: quantityModal.afterQuantity ?? before, changeType: quantityModal.changeType, reason: quantityModal.reason, actor });
      const change = next.quantityChanges.at(-1)!;
      const action = quantityModal.changeType === "partial_cancel" ? "部分取消订单" : quantityModal.changeType === "full_cancel" ? "全部取消订单" : "调整订单数量";
      await persistWithLogs(next, [createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action, entityType: "OrderQuantityChange", entityId: change.id, beforeValues: { "有效数量": before }, afterValues: { "有效数量": quantityModal.afterQuantity ?? before }, reason: quantityModal.reason })]);
      setQuantityModal(null);
      notify("数量历史已追加，交期计划未自动修改");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "数量调整失败"); }
  };

  const applyPrice = async () => {
    if (!priceModal || !can("order.edit")) return;
    try {
      const before = getCurrentPriceVersion(order);
      const next = createOrderPriceVersion(order, { ...priceModal, actor });
      const after = getCurrentPriceVersion(next);
      const operationId = createOperationId();
      const priceLogs = [
        createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action: "调整订单销售价", entityType: "OrderPriceVersion", entityId: after.id, beforeValues: { "销售价": before.salePrice }, afterValues: { "销售价": after.salePrice }, reason: priceModal.reason, operationId }),
        createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action: "调整订单工价", entityType: "OrderPriceVersion", entityId: after.id, beforeValues: { "工价": before.processingUnitPrice, "加工币种": before.processingCurrency }, afterValues: { "工价": after.processingUnitPrice, "加工币种": after.processingCurrency }, reason: priceModal.reason, operationId, operationSequence: 1 }),
        createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action: "调整订单汇率依据", entityType: "OrderPriceVersion", entityId: after.id, beforeValues: { "汇率依据": before.exchangeRateSnapshot }, afterValues: { "汇率依据": after.exchangeRateSnapshot }, reason: priceModal.reason, operationId, operationSequence: 2 }),
      ];
      await persistWithLogs(next, priceLogs);
      setPriceModal(null);
      notify(`已创建 ${after.displayLabel}，历史价格未覆盖`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "价格调整失败"); }
  };

  const saveDelivery = async () => {
    if (!deliveryModal || !can(isNew ? "order.create" : "order.edit")) return;
    try {
      if (isNew) {
        const next = upsertDeliveryPlan(order, deliveryModal.plan, actor);
        setOrder(next);
        setDirty(true);
        setDeliveryModal(null);
        return;
      }
      const before = order.deliveryPlans.find((plan) => plan.id === deliveryModal.plan.id);
      const next = upsertDeliveryPlan(order, deliveryModal.plan, actor);
      await persistWithLogs(next, [createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action: before ? "修改交期" : "新增交期", entityType: "DeliveryPlan", entityId: deliveryModal.plan.id, beforeValues: before ? { "交期": before.deliveryDate, "数量": before.quantity } : undefined, afterValues: { "交期": deliveryModal.plan.deliveryDate, "数量": deliveryModal.plan.quantity } })]);
      setDeliveryModal(null);
      notify("交期已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "交期保存失败"); }
  };

  const removeDelivery = async (plan: DeliveryPlan) => {
    const next = voidDeliveryPlan(order, plan.id, actor);
    await persistWithLogs(next, [createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action: "作废交期", entityType: "DeliveryPlan", entityId: plan.id, beforeValues: { "交期": plan.deliveryDate, "数量": plan.quantity }, afterValues: { "状态": "已作废" } })]);
    notify("交期已作废并保留历史");
  };

  const cancelWholeOrder = async () => {
    if (!can("order.cancel")) return;
    try {
      const operationId = createOperationId();
      const beforeQuantity = getEffectiveQuantity(order);
      const next = cancelOrder(order, cancelReason, actor);
      const logsToWrite: ReturnType<typeof createOrderOperationLog>[] = [];
      if (beforeQuantity > 0) logsToWrite.push(createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action: "全部取消订单", entityType: "OrderQuantityChange", entityId: next.quantityChanges.at(-1)?.id, beforeValues: { "有效数量": beforeQuantity }, afterValues: { "有效数量": 0 }, reason: cancelReason, operationId }));
      logsToWrite.push(createOrderOperationLog({ order: next, actor: { userId: currentUser.id, userName: currentUser.name }, action: "取消整张订单", beforeValues: { "订单状态": statusLabel[order.status] }, afterValues: { "订单状态": statusLabel.cancelled }, reason: cancelReason, operationId, operationSequence: logsToWrite.length }));
      await persistWithLogs(next, logsToWrite);
      setCancelOpen(false);
      notify("订单已取消，数量历史已保留");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "取消订单失败"); }
  };

  const updateNewInitialPrice = (patch: Partial<OrderPriceVersion>) => {
    const current = getCurrentPriceVersion(order);
    patchOrder({ priceVersions: order.priceVersions.map((price) => price.id === current.id ? { ...price, ...patch } : price) });
  };

  if (!isNew) {
    const scheduleProjection = projectOrderSchedule(order, scheduling);
    const closingProjection = projectOrderClosing(order, closing);
    const activeAssignments = assignmentsForOrder(scheduling, order.id).filter((item) => item.status !== "cancelled");
    const productionLabels = { unscheduled: "未排单", partially_scheduled: "部分排单", scheduled_pending: "已排待产", in_production: "生产中", partially_completed: "部分完成", completed: "已完成" } as const;
    const closingLabels = { unclosed: "未关账", partially_closed: "部分关账", closed: "已关账", over_allocated: "超额关账" } as const;
    const formalExceptions = [...new Set([...scheduleProjection.deliveryRisk.messages, ...scheduleProjection.warnings, ...(warning ? [warning] : [])])];
    const tracking = scheduling.orderExecutionTrackings.find((item) => item.salesOrderId === order.id) ?? null;
    const firstInternalAssignment = activeAssignments.filter((item) => item.executionType === "internal").sort((a, b) => (a.plannedStartDate ?? "9999").localeCompare(b.plannedStartDate ?? "9999"))[0] ?? null;
    const hubName = operationsSettings.supplyHubs.find((item) => item.id === tracking?.supplyHubId)?.name ?? "供应枢纽";
    const site = firstInternalAssignment ? productionSiteForAssignment(firstInternalAssignment, operationsSettings) : null;
    const logistics = firstInternalAssignment ? recommendTransport({ assignment: firstInternalAssignment, tracking, settings: operationsSettings }) : null;
    const nextAction = order.status === "draft" ? "确认订单" : scheduleProjection.productionStatus === "unscheduled" || scheduleProjection.productionStatus === "partially_scheduled" ? "进入排单" : closingProjection.status === "unclosed" || closingProjection.status === "partially_closed" ? "查看关账" : "查看执行记录";
    const sections = [
      { id: "order-overview", label: "概览" },
      { id: "order-business", label: "商务资料" },
      { id: "order-delivery", label: "数量与交期" },
      { id: "order-production", label: "生产执行" },
      { id: "order-material", label: "物料 / 物流" },
      { id: "order-price", label: "价格 / 关账" },
      { id: "order-attachments", label: "附件" },
      { id: "order-history", label: "操作记录" },
    ];
    const historyLogFor = (entityId: string) => logs.find((log) => log.entityId === entityId);

    return <AppShell title="订单明细"><PageContainer className="oc-cockpit-page"><FormShell submitOnEnter={false} onSubmit={() => void save()}>
      <Workspace
        className="oc-order-workspace"
        header={<PageHeader variant="object" eyebrow="ORDER COCKPIT" title={order.styleNo || "未填写款号"} description={<><strong>{order.styleName || "未填写款式名称"}</strong><span>{order.customerNameSnapshot || "未填写客户"}{order.brandNameSnapshot ? ` · ${order.brandNameSnapshot}` : ""}</span><small>{order.orderNo} · {sourceLabel[order.sourceType]} · 只读系统编号</small></>} back={<Button variant="text" onClick={requestListNavigation}>← 返回订单中心</Button>} status={<StatusTag tone={order.status === "cancelled" ? "danger" : order.status === "confirmed" || order.status === "completed" ? "success" : "neutral"}>{statusLabel[order.status]}</StatusTag>} secondaryActions={<><PermissionButton permission="order.create" variant="secondary" onClick={() => router.push(`/order-center/new?reorder=${encodeURIComponent(order.id)}`)}>翻单</PermissionButton>{order.status === "draft" && <PermissionButton permission="order.edit" variant="secondary" onClick={() => void confirm()}>确认订单</PermissionButton>}</>} moreActions={<details className="oc-object-more"><summary aria-label="更多订单操作">更多</summary><div>{order.status !== "cancelled" && <PermissionButton permission="order.cancel" variant="text" onClick={() => setCancelOpen(true)}>取消订单</PermissionButton>}</div></details>} primaryAction={<PermissionButton permission="order.edit" onClick={() => void save()} disabled={!dirty}>保存</PermissionButton>} />}
        navigation={<SectionNavigation sections={sections} activeId={activeSection} onNavigate={(sectionId) => { setActiveSection(sectionId); document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />}
        saveBar={dirty ? <SaveBar state="dirty" onSave={() => void save()} message="订单基础资料有未保存修改" /> : undefined}
      >
        <section id="order-overview" className="oc-cockpit-section oc-scroll-anchor">
          <Card className="oc-cockpit-card">
            <div className="oc-cockpit-primary"><small>款式 / 订单</small><strong>{order.styleNo || "—"}</strong><span>{order.orderNo}</span></div>
            <div><small>客户 / PO</small><strong>{order.customerNameSnapshot || "—"}</strong><span>{order.customerPoNo || "—"}</span></div>
            <div><small>有效数量</small><strong className="oc-tabular">{getEffectiveQuantity(order).toLocaleString("zh-CN")}</strong><span>原始 {order.initialQuantity.toLocaleString("zh-CN")}</span></div>
            <div><small>客户交期</small><strong>{getOrderLatestDeliveryDate(order) ?? "未安排"}</strong><span>最近 {getOrderNearestDeliveryDate(order) ?? "—"}</span></div>
            <div className="oc-cockpit-statuses"><small>执行状态</small><span><b>订单</b>{statusLabel[order.status]}</span><span><b>生产</b>{productionLabels[scheduleProjection.productionStatus]}</span><span><b>关账</b>{closingLabels[closingProjection.status]}</span></div>
            <div className="oc-next-action"><small>下一步</small><strong>{nextAction}</strong><span>{activeAssignments.length} 条排单 · {activeDeliveryPlans(order).length} 条客户交期</span></div>
          </Card>
          {formalExceptions.length > 0 && <AlertBanner tone="warning" title="当前异常 / 提醒">{formalExceptions.join("；")}</AlertBanner>}
        </section>

        {error && <AlertBanner tone="danger" title="订单操作未完成">{error}</AlertBanner>}

        <section id="order-business" className="oc-work-section oc-scroll-anchor"><header><div><small>BUSINESS</small><h2>商务资料</h2></div><span>普通字段可保存；系统订单号与原始数量保持只读</span></header><Card className="oc-section-card"><fieldset disabled={readOnly}><div className="oc-business-grid">
          <FormItem label="销售合同号"><input className="qc-control" value={order.salesContractNo ?? ""} readOnly placeholder="艾诺科同步后生成" /></FormItem>
          <FormItem label="款号" required><input className="qc-control" value={order.styleNo} onChange={(event) => patchOrder({ styleNo: event.target.value })} /></FormItem>
          <FormItem label="工厂款号"><input className="qc-control" value={order.factoryStyleNo} onChange={(event) => patchOrder({ factoryStyleNo: event.target.value })} /></FormItem>
          <FormItem label="款式名称"><input className="qc-control" value={order.styleName} onChange={(event) => patchOrder({ styleName: event.target.value })} /></FormItem>
          <FormItem label="客户" required><input className="qc-control" value={order.customerNameSnapshot} onChange={(event) => patchOrder({ customerNameSnapshot: event.target.value })} /></FormItem>
          <FormItem label="客户 PO"><input className="qc-control" value={order.customerPoNo} onChange={(event) => patchOrder({ customerPoNo: event.target.value })} /></FormItem>
          <FormItem label="品牌"><input className="qc-control" value={order.brandNameSnapshot} onChange={(event) => patchOrder({ brandNameSnapshot: event.target.value })} /></FormItem>
          <FormItem label="制作国家"><input className="qc-control" value={order.productionCountry} onChange={(event) => patchOrder({ productionCountry: event.target.value })} /></FormItem>
          <FormItem label="订单类型"><select className="qc-control" value={order.orderType} onChange={(event) => patchOrder({ orderType: event.target.value as SalesOrder["orderType"] })}><option value="processing">加工</option><option value="distribution">经销</option></select></FormItem>
          <FormItem label="下单日期"><input type="date" className="qc-control" value={order.orderDate} onChange={(event) => patchOrder({ orderDate: event.target.value })} /></FormItem>
          <FormItem label="合同交期"><input type="date" className="qc-control" value={order.contractDeliveryDate ?? ""} readOnly /></FormItem>
          <FormItem label="业务确认交期"><input type="date" className="qc-control" value={order.businessConfirmedDeliveryDate ?? ""} onChange={(event) => patchOrder({ businessConfirmedDeliveryDate: event.target.value || null })} /></FormItem>
          <FormItem label="验货日期"><input type="date" className="qc-control" value={order.inspectionDate ?? ""} onChange={(event) => patchOrder({ inspectionDate: event.target.value || null })} /></FormItem>
          <FormItem label="业务员"><input className="qc-control" value={order.salespersonNameSnapshot} onChange={(event) => patchOrder({ salespersonNameSnapshot: event.target.value })} /></FormItem>
          <FormItem label="理单员"><input className="qc-control" value={order.merchandiserNameSnapshot} onChange={(event) => patchOrder({ merchandiserNameSnapshot: event.target.value })} /></FormItem>
          <FormItem label="客户要求"><input className="qc-control" value={order.customerRequirement} onChange={(event) => patchOrder({ customerRequirement: event.target.value })} /></FormItem>
          <FormItem label="备注"><input className="qc-control" value={order.remark} onChange={(event) => patchOrder({ remark: event.target.value })} /></FormItem>
        </div></fieldset></Card></section>

        <section id="order-delivery" className="oc-work-section oc-scroll-anchor"><header><div><small>QUANTITY & DELIVERY</small><h2>数量与客户交期</h2></div><div className="oc-section-actions"><PermissionButton permission="order.edit" variant="secondary" onClick={() => setQuantityModal({ afterQuantity: getEffectiveQuantity(order), changeType: "decrease", reason: "" })}>调整数量</PermissionButton><PermissionButton permission="order.edit" variant="secondary" onClick={() => setDeliveryModal({ plan: { id: createOrderId("delivery-plan"), salesOrderId: order.id, deliveryDate: "", quantity: getEffectiveQuantity(order), remark: "", createdAt: "", updatedAt: "", voidedAt: null } })}>添加交期</PermissionButton></div></header><div className="oc-section-split"><Card className="oc-section-card"><ContextSummary title="数量 / 交期摘要" items={[{ key: "effective", label: "有效数量", value: getEffectiveQuantity(order).toLocaleString("zh-CN") }, { key: "planned", label: "交期数量", value: getDeliveryPlannedQuantity(order).toLocaleString("zh-CN") }, { key: "nearest", label: "最近交期", value: getOrderNearestDeliveryDate(order) ?? "—" }, { key: "latest", label: "最终交期", value: getOrderLatestDeliveryDate(order) ?? "—" }]} />{activeDeliveryPlans(order).map((plan) => <article className="oc-delivery-row" key={plan.id}><div><strong>{plan.deliveryDate}</strong><span>{plan.quantity.toLocaleString("zh-CN")} 件</span><small>{plan.remark || "无备注"}</small></div><div><PermissionButton permission="order.edit" variant="text" onClick={() => setDeliveryModal({ plan: { ...plan } })}>编辑</PermissionButton><PermissionButton permission="order.edit" variant="text" onClick={() => void removeDelivery(plan)}>作废</PermissionButton></div></article>)}{!activeDeliveryPlans(order).length && <EmptyState compact title="尚未安排客户交期" description="ScheduleAssignment 日期不会替代客户交期。" />}</Card><Card className="oc-history-summary"><header><strong>数量历史</strong><Button variant="text" onClick={() => setHistoryDrawer("quantity")}>查看全部 {order.quantityChanges.length}</Button></header>{[...order.quantityChanges].reverse().slice(0, 3).map((change) => <article key={change.id}><strong>{change.beforeQuantity.toLocaleString("zh-CN")} → {change.afterQuantity.toLocaleString("zh-CN")}</strong><span>{change.delta > 0 ? "+" : ""}{change.delta.toLocaleString("zh-CN")} · {change.createdBy}</span><small>{change.reason || "无备注"}</small></article>)}{!order.quantityChanges.length && <p>尚无数量变更</p>}</Card></div></section>

        {order.orderColorLines.length > 0 && <section className="oc-work-section"><header><div><small>COLOR DETAIL</small><h2>颜色明细</h2></div><span>艾诺科分色分码汇总 · {order.orderColorLines.length} 色</span></header><Card className="oc-section-card"><div className="as-table-wrap"><table className="as-table"><thead><tr><th>颜色</th><th>数量</th><th>交期</th><th>来源合同</th></tr></thead><tbody>{order.orderColorLines.map((line) => <tr key={line.id}><td><strong>{line.colorName}</strong></td><td>{line.quantity.toLocaleString("zh-CN")}</td><td>{line.deliveryDate ?? "—"}</td><td>{line.salesContractNo ?? "—"}</td></tr>)}</tbody></table></div></Card></section>}

        <section id="order-production" className="oc-work-section oc-scroll-anchor"><header><div><small>PRODUCTION</small><h2>生产执行</h2></div><Button variant="secondary" permission="schedule.view" onClick={() => router.push(`/production-scheduling?orderId=${encodeURIComponent(order.id)}`)}>进入排单中心</Button></header><Card className="oc-section-card"><DescriptionList columns={4} compact items={[{ key: "status", label: "生产状态", value: productionLabels[scheduleProjection.productionStatus] }, { key: "count", label: "排单记录", value: `${activeAssignments.length} 条` }, { key: "scheduled", label: "已排数量", value: scheduleProjection.scheduledQuantity.toLocaleString("zh-CN") }, { key: "completed", label: "完成数量", value: scheduleProjection.completedQuantity.toLocaleString("zh-CN") }, { key: "internal", label: "内部", value: scheduleProjection.internalScheduledQuantity.toLocaleString("zh-CN") }, { key: "outsource", label: "外发", value: scheduleProjection.outsourceScheduledQuantity.toLocaleString("zh-CN") }, { key: "remaining", label: "剩余", value: scheduleProjection.remainingQuantity.toLocaleString("zh-CN") }, { key: "execution", label: "执行模式", value: ({ unscheduled: "未排", internal: "内部", outsource: "外发", mixed: "混合" } as const)[scheduleProjection.executionMode] }]} /></Card></section>

        <section id="order-material" className="oc-work-section oc-scroll-anchor"><header><div><small>MATERIAL & LOGISTICS</small><h2>物料 / 物流</h2></div><Button variant="secondary" permission="schedule.view" onClick={() => router.push(`/production-scheduling?orderId=${encodeURIComponent(order.id)}`)}>维护物料与运输</Button></header><Card className="oc-section-card"><DescriptionList columns={3} items={[{ key: "ready", label: "物料齐套", value: tracking ? getMaterialReadyDate(tracking) ?? "尚未齐套" : "尚未登记" }, { key: "fabric", label: `面料到${hubName}`, value: tracking?.fabricSupplyHubArrivalDate ?? "—" }, { key: "trim", label: `辅料到${hubName}`, value: tracking?.trimSupplyHubArrivalDate ?? "—" }, { key: "site", label: "实际生产地点", value: site?.name ?? "—" }, { key: "start", label: "计划开始", value: firstInternalAssignment?.plannedStartDate ?? "—" }, { key: "sample", label: "封样提前", value: site ? `${site.preProductionSampleLeadDays} 天` : "—" }, { key: "latest", label: "最晚到厂", value: logistics?.latestRequiredArrivalDate ?? "—" }, { key: "mode", label: "推荐运输", value: logistics?.recommendedMode?.name ?? "—" }, { key: "arrival", label: "预计到厂", value: logistics?.earliestArrivalDate ?? "—", secondary: logistics?.message }]} /></Card></section>

        <section id="order-price" className="oc-work-section oc-scroll-anchor"><header><div><small>PRICE & CLOSING</small><h2>价格 / 关账</h2></div><div className="oc-section-actions"><PermissionButton permission="order.edit" variant="secondary" onClick={() => setPriceModal({ salePrice: currentPrice.salePrice, processingUnitPrice: currentPrice.processingUnitPrice, processingCurrency: currentPrice.processingCurrency, exchangeRateSnapshot: currentPrice.exchangeRateSnapshot, effectiveDate: today(), reason: "" })}>调整价格</PermissionButton><Button variant="secondary" permission="closing.view" onClick={() => router.push(`/closing-center?orderId=${encodeURIComponent(order.id)}`)}>进入关账中心</Button></div></header><div className="oc-section-split"><Card className="oc-section-card"><DescriptionList columns={3} items={[{ key: "version", label: "当前价格", value: currentPrice.displayLabel }, { key: "sale", label: "销售价", value: money(currentPrice.salePrice) }, { key: "labor", label: "客户加工单价", value: `${money(currentPrice.processingUnitPrice, currentPrice.processingCurrency === "USD" ? "$" : "¥")} ${currentPrice.processingCurrency}` }, { key: "trim", label: "代购辅料单价", value: order.purchasedTrimUnitCostSnapshot === null ? "—" : `${money(order.purchasedTrimUnitCostSnapshot, order.purchasedTrimCurrencySnapshot === "USD" ? "$" : "¥")} ${order.purchasedTrimCurrencySnapshot}` }, { key: "factory", label: "柬厂结算单价", value: order.factorySettlementUnitPrice === null ? "—" : `${money(order.factorySettlementUnitPrice, order.purchasedTrimCurrencySnapshot === "USD" ? "$" : "¥")} ${order.purchasedTrimCurrencySnapshot ?? currentPrice.processingCurrency}` }, { key: "closing", label: "关账状态", value: closingLabels[closingProjection.status] }, { key: "allocated", label: "累计关账", value: `${closingProjection.allocatedQuantity.toLocaleString("zh-CN")} 件` }, { key: "output", label: "客户加工产值", value: `${currentPrice.processingCurrency === "USD" ? "$" : "¥"}${closingProjection.summary.processingOutputRmb.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` }]} /></Card><Card className="oc-history-summary"><header><strong>价格历史</strong><Button variant="text" onClick={() => setHistoryDrawer("price")}>查看全部 {order.priceVersions.length}</Button></header>{[...order.priceVersions].reverse().slice(0, 3).map((price) => <article key={price.id}><strong>{price.displayLabel} · {price.effectiveDate}</strong><span>销售 {money(price.salePrice)} · 工价 {money(price.processingUnitPrice, price.processingCurrency === "USD" ? "$" : "¥")}</span><small>{price.reason}</small></article>)}</Card></div></section>

        <section id="order-attachments" className="oc-work-section oc-scroll-anchor"><header><div><small>ATTACHMENTS</small><h2>附件</h2></div></header><OrderAttachmentPanel order={order} readOnly={readOnly} createdBy={currentUser.name} onChange={(next) => patchOrder(next)} /></section>

        <section id="order-history" className="oc-work-section oc-scroll-anchor"><header><div><small>OPERATION LOG</small><h2>操作记录</h2></div><span>统一 OperationLog · 只读 {logs.length} 条</span></header><Card className="oc-log-card oc-log-compact">{logs.slice(0, 12).map((log) => <article key={log.id}><time>{new Date(log.createdAt).toLocaleString("zh-CN")}</time><div><strong>{log.action}</strong><small>{log.userName}</small>{log.reason || log.afterData?.reason || log.beforeData?.reason ? <em>原因：{log.reason || log.afterData?.reason || log.beforeData?.reason}</em> : null}</div></article>)}{!logs.length && <EmptyState compact title="暂无操作记录" />}</Card></section>
      </Workspace>
      <Drawer open={historyDrawer !== null} title={historyDrawer === "quantity" ? "数量历史" : "价格历史"} description="不可变业务事实；技术引用仅作为辅助信息。" onClose={() => setHistoryDrawer(null)} footer={<Button onClick={() => setHistoryDrawer(null)}>关闭</Button>} className="oc-history-drawer">
        {historyDrawer === "quantity" && [...order.quantityChanges].reverse().map((change) => { const log = historyLogFor(change.id); return <article key={change.id}><header><strong>{change.beforeQuantity.toLocaleString("zh-CN")} → {change.afterQuantity.toLocaleString("zh-CN")}</strong><StatusTag tone={change.delta < 0 ? "warning" : "success"}>{change.delta > 0 ? "+" : ""}{change.delta.toLocaleString("zh-CN")}</StatusTag></header><DescriptionList compact columns={1} items={[{ key: "type", label: "变更类型", value: change.changeType }, { key: "reason", label: "原因", value: change.reason || "未记录" }, { key: "time", label: "时间", value: new Date(change.createdAt).toLocaleString("zh-CN") }, { key: "actor", label: "操作人", value: change.createdBy }, { key: "technical", label: "技术引用", value: log?.operationId ?? change.id, secondary: `记录 ${change.id}` }]} /></article>; })}
        {historyDrawer === "price" && [...order.priceVersions].reverse().map((price) => { const log = historyLogFor(price.id); return <article key={price.id}><header><strong>{price.displayLabel} · {price.effectiveDate}</strong>{price.id === order.currentPriceVersionId && <StatusTag tone="success">当前</StatusTag>}</header><DescriptionList compact columns={1} items={[{ key: "sale", label: "销售价", value: money(price.salePrice) }, { key: "labor", label: "工价", value: `${money(price.processingUnitPrice, price.processingCurrency === "USD" ? "$" : "¥")} ${price.processingCurrency}` }, { key: "rate", label: "汇率依据", value: price.exchangeRateSnapshot ?? "—" }, { key: "reason", label: "原因", value: price.reason || "未记录" }, { key: "time", label: "时间", value: new Date(price.createdAt).toLocaleString("zh-CN") }, { key: "actor", label: "操作人", value: price.createdBy }, { key: "technical", label: "技术引用", value: log?.operationId ?? price.id, secondary: `记录 ${price.id}` }]} /></article>; })}
      </Drawer>
      <Modal open={Boolean(quantityModal)} title="调整订单数量" description="数量历史追加保存；不会自动修改客户交期。" onClose={() => setQuantityModal(null)} onSubmit={applyQuantity} footer={<><Button variant="secondary" onClick={() => setQuantityModal(null)}>取消</Button><Button type="submit">保存数量变更</Button></>}>{quantityModal && <div className="qc-modal-form"><FormItem label="变更类型"><select className="qc-control" value={quantityModal.changeType} onChange={(event) => setQuantityModal({ ...quantityModal, changeType: event.target.value as OrderQuantityChangeType })}><option value="increase">增加</option><option value="decrease">减少</option><option value="partial_cancel">部分取消</option><option value="full_cancel">全部取消</option></select></FormItem><FormItem label="调整后有效数量" required><NullableNumberInput className="qc-control" min="0" value={quantityModal.afterQuantity} onValueChange={(value) => setQuantityModal({ ...quantityModal, afterQuantity: value })} /></FormItem><FormItem label="原因"><textarea className="qc-control" value={quantityModal.reason} onChange={(event) => setQuantityModal({ ...quantityModal, reason: event.target.value })} /></FormItem></div>}</Modal>
      <Modal open={Boolean(priceModal)} title="调整订单价格" description="保存后创建新的只读价格版本，不覆盖当前历史。" onClose={() => setPriceModal(null)} onSubmit={applyPrice} footer={<><Button variant="secondary" onClick={() => setPriceModal(null)}>取消</Button><Button type="submit">创建新价格版本</Button></>}>{priceModal && <div className="qc-modal-form"><FormItem label="成衣销售价"><NullableNumberInput className="qc-control" min="0" value={priceModal.salePrice} disabled={order.orderType === "processing"} onValueChange={(value) => setPriceModal({ ...priceModal, salePrice: value })} /></FormItem><FormItem label="工价"><NullableNumberInput className="qc-control" min="0" value={priceModal.processingUnitPrice} onValueChange={(value) => setPriceModal({ ...priceModal, processingUnitPrice: value })} /></FormItem><FormItem label="加工币种"><select className="qc-control" value={priceModal.processingCurrency} onChange={(event) => setPriceModal({ ...priceModal, processingCurrency: event.target.value as "CNY" | "USD" })}><option value="CNY">CNY</option><option value="USD">USD</option></select></FormItem><FormItem label="汇率依据"><NullableNumberInput className="qc-control" min="0" value={priceModal.exchangeRateSnapshot} onValueChange={(value) => setPriceModal({ ...priceModal, exchangeRateSnapshot: value })} /></FormItem><FormItem label="生效日期"><input type="date" className="qc-control" value={priceModal.effectiveDate} onChange={(event) => setPriceModal({ ...priceModal, effectiveDate: event.target.value })} /></FormItem><FormItem label="调整原因" required><textarea className="qc-control" value={priceModal.reason} onChange={(event) => setPriceModal({ ...priceModal, reason: event.target.value })} /></FormItem></div>}</Modal>
      <Modal open={Boolean(deliveryModal)} title="维护客户交期" description="客户交期与生产排单日期严格分离。" onClose={() => setDeliveryModal(null)} onSubmit={saveDelivery} footer={<><Button variant="secondary" onClick={() => setDeliveryModal(null)}>取消</Button><Button type="submit">保存交期</Button></>}>{deliveryModal && <div className="qc-modal-form"><FormItem label="交期" required><input type="date" className="qc-control" value={deliveryModal.plan.deliveryDate} onChange={(event) => setDeliveryModal({ ...deliveryModal, plan: { ...deliveryModal.plan, deliveryDate: event.target.value } })} /></FormItem><FormItem label="数量" required><NullableNumberInput className="qc-control" min="0" value={deliveryModal.plan.quantity} onValueChange={(value) => setDeliveryModal({ ...deliveryModal, plan: { ...deliveryModal.plan, quantity: value ?? 0 } })} /></FormItem><FormItem label="备注"><textarea className="qc-control" value={deliveryModal.plan.remark} onChange={(event) => setDeliveryModal({ ...deliveryModal, plan: { ...deliveryModal.plan, remark: event.target.value } })} /></FormItem></div>}</Modal>
      <Modal open={cancelOpen} title="取消整张订单" description="将追加全量取消记录并更新商务状态，历史不会删除。" onClose={() => setCancelOpen(false)} onSubmit={cancelWholeOrder} footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>返回</Button><Button type="submit" variant="danger">确认取消订单</Button></>}><FormItem label="取消原因" required><textarea className="qc-control" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></FormItem></Modal>
      <Modal open={pendingListNavigation} title="当前订单有未保存修改" description="离开后修改将丢失。" onClose={() => setPendingListNavigation(false)} footer={<><Button variant="secondary" onClick={() => setPendingListNavigation(false)}>继续编辑</Button><Button variant="danger" onClick={() => router.push("/order-center")}>不保存并返回</Button><Button onClick={() => void saveAndReturn()}>保存并返回</Button></>}><p>请先选择如何处理当前未保存内容。</p></Modal>
      <Toast message={toast} />
    </FormShell></PageContainer></AppShell>;
  }

  const creationIssues = validateOrderIntegrity(order);
  const creationIssue = (code: string) => creationIssues.find((issue) => issue.code === code)?.message;
  const addDeliveryDraft = () => setDeliveryModal({ plan: { id: createOrderId("delivery-plan"), salesOrderId: order.id, deliveryDate: "", quantity: order.initialQuantity, remark: "", createdAt: "", updatedAt: "", voidedAt: null } });

  return <AppShell title="新建订单"><PageContainer className="qc-create-page oc-create-page">
    <FormShell className="qc-create-form oc-create-form" submitOnEnter={false} onSubmit={async () => { await save(); }}>
      <PageHeader
        variant="object"
        eyebrow="CREATE ORDER"
        title={order.styleNo || "新建订单"}
        description={<><strong>{order.customerNameSnapshot || "先建立单款订单上下文"}</strong><span>一张 SalesOrder 只对应一个款式；创建后进入订单详情继续执行。</span></>}
        back={<Button variant="text" onClick={requestListNavigation}>← 返回订单中心</Button>}
        status={<span className="qc-create-state" data-dirty={dirty || undefined}>{dirty ? "有未保存修改" : "尚未保存"}</span>}
        primaryAction={<Button type="submit" permission="order.create">创建订单</Button>}
      />

      <ContextSummary title="创建摘要" items={[
        { key: "orderNo", label: "系统订单号", value: order.orderNo },
        { key: "style", label: "款号", value: order.styleNo || "待填写" },
        { key: "customer", label: "客户 / PO", value: order.customerNameSnapshot ? `${order.customerNameSnapshot} · ${order.customerPoNo || "PO 待填写"}` : "待填写" },
        { key: "quantity", label: "初始数量", value: `${order.initialQuantity.toLocaleString("zh-CN")} 件` },
      ]} />

      {creationIssues.length > 0 && <AlertBanner tone="warning" title={`创建订单前还需完成 ${creationIssues.length} 项`}>{creationIssues.map((issue) => issue.message).join("；")}</AlertBanner>}
      {error && <AlertBanner tone="danger" title="订单创建未完成">{error}</AlertBanner>}

      <FormSection title="款式与订单身份" description="系统订单号只读；款号是日常识别主信息。" columns={2}>
        <div className="qc-create-readonly"><span>系统订单号</span><strong>{order.orderNo}</strong><small>由现有 suggestOrderNo 规则生成，不可编辑。</small></div>
        <div className="qc-create-readonly"><span>来源</span><strong>{sourceLabel[order.sourceType]}</strong><small>{order.sourceOrderId ? `翻单来源 ${order.sourceOrderId}` : "手工创建单款订单"}</small></div>
        <FormItem label="款号" required error={creationIssue("order.styleNo.required")}><input className="qc-control" value={order.styleNo} onChange={(event) => patchOrder({ styleNo: event.target.value })} /></FormItem>
        <FormItem label="款式名称"><input className="qc-control" value={order.styleName} onChange={(event) => patchOrder({ styleName: event.target.value })} /></FormItem>
      </FormSection>

      <FormSection title="客户与订单资料" description="客户、品牌和 PO 保存在当前 SalesOrder 快照中。" columns={3}>
        <FormItem label="客户" required error={creationIssue("order.customer.required")}><input className="qc-control" value={order.customerNameSnapshot} onChange={(event) => patchOrder({ customerNameSnapshot: event.target.value })} /></FormItem>
        <FormItem label="品牌"><input className="qc-control" value={order.brandNameSnapshot} onChange={(event) => patchOrder({ brandNameSnapshot: event.target.value })} /></FormItem>
        <FormItem label="客户 PO"><input className="qc-control" value={order.customerPoNo} onChange={(event) => patchOrder({ customerPoNo: event.target.value })} /></FormItem>
        <FormItem label="业务员"><input className="qc-control" value={order.salespersonNameSnapshot} onChange={(event) => patchOrder({ salespersonNameSnapshot: event.target.value })} /></FormItem>
        <FormItem label="理单员"><input className="qc-control" value={order.merchandiserNameSnapshot} onChange={(event) => patchOrder({ merchandiserNameSnapshot: event.target.value })} /></FormItem>
        <FormItem label="下单日期"><input type="date" className="qc-control" value={order.orderDate} onChange={(event) => patchOrder({ orderDate: event.target.value })} /></FormItem>
      </FormSection>

      <FormSection title="数量与客户交期" description="DeliveryPlan 是客户交付需求，不会由 ScheduleAssignment 反推。" columns={2} actions={<Button variant="secondary" onClick={addDeliveryDraft}>＋ 添加交期</Button>}>
        <FormItem label="初始数量" required error={creationIssue("order.quantity.invalid")}><NullableNumberInput className="qc-control" min="0" value={order.initialQuantity} onValueChange={(value) => patchOrder({ initialQuantity: value ?? 0 })} /></FormItem>
        <div className="qc-create-readonly"><span>已安排交期数量</span><strong>{getDeliveryPlannedQuantity(order).toLocaleString("zh-CN")} 件</strong><small>{order.deliveryPlans.length ? `${order.deliveryPlans.length} 条 DeliveryPlan` : "可以先创建订单，之后继续维护交期"}</small></div>
        <div className="oc-create-deliveries">{activeDeliveryPlans(order).map((plan) => <article key={plan.id}><div><strong>{plan.deliveryDate || "日期待填写"}</strong><span>{plan.quantity.toLocaleString("zh-CN")} 件</span><small>{plan.remark || "无备注"}</small></div><div><Button variant="text" onClick={() => setDeliveryModal({ plan: { ...plan } })}>编辑</Button><Button variant="text" onClick={() => { setOrder((current) => ({ ...current, deliveryPlans: current.deliveryPlans.filter((item) => item.id !== plan.id) })); setDirty(true); }}>移除</Button></div></article>)}{!activeDeliveryPlans(order).length && <EmptyState compact title="尚未安排客户交期" description="可在创建时添加，也可进入订单详情后维护。" />}</div>
      </FormSection>

      <FormSection title="订单执行口径" description="只记录订单商务资料；生产执行方与排单数量不写入 SalesOrder。" columns={3}>
        <FormItem label="订单类型"><select className="qc-control" value={order.orderType} onChange={(event) => patchOrder({ orderType: event.target.value as SalesOrder["orderType"] })}><option value="processing">加工</option><option value="distribution">经销</option></select></FormItem>
        <FormItem label="制作国家"><input className="qc-control" value={order.productionCountry} onChange={(event) => patchOrder({ productionCountry: event.target.value })} /></FormItem>
        <FormItem label="客户要求"><input className="qc-control" value={order.customerRequirement} onChange={(event) => patchOrder({ customerRequirement: event.target.value })} /></FormItem>
        <FormItem label="备注" className="oc-create-note"><textarea className="qc-control" value={order.remark} onChange={(event) => patchOrder({ remark: event.target.value })} /></FormItem>
      </FormSection>

      <FormSection title="初始成交价格" description="继续使用现有 OrderPriceVersion P1 与 currentPriceVersionId；本页不推导报价成本。" columns={2}>
        <FormItem label="初始销售价"><NullableNumberInput className="qc-control" min="0" value={currentPrice.salePrice} disabled={order.orderType === "processing"} onValueChange={(value) => updateNewInitialPrice({ salePrice: order.orderType === "processing" ? null : value })} /></FormItem>
        <FormItem label="初始工价" required error={creationIssue("order.processingPrice.required")}><NullableNumberInput className="qc-control" min="0" value={currentPrice.processingUnitPrice} onValueChange={(value) => updateNewInitialPrice({ processingUnitPrice: value })} /></FormItem>
        <FormItem label="加工币种"><select className="qc-control" value={currentPrice.processingCurrency} onChange={(event) => updateNewInitialPrice({ processingCurrency: event.target.value as "CNY" | "USD" })}><option value="CNY">CNY</option><option value="USD">USD</option></select></FormItem>
        <FormItem label="汇率依据"><NullableNumberInput className="qc-control" min="0" value={currentPrice.exchangeRateSnapshot} onValueChange={(value) => updateNewInitialPrice({ exchangeRateSnapshot: value })} /></FormItem>
      </FormSection>

      <section className="qc-create-next-step"><div><strong>创建后继续</strong><span>订单详情将继续维护确认、数量历史、价格历史、附件、排单与关账摘要。</span></div><small>本页不会修改 ScheduleAssignment、ClosingAllocation 或报价快照。</small></section>
      {dirty && <SaveBar state="dirty" message="新建订单有未保存修改" saveLabel="创建订单" onSave={() => void save()} />}
    </FormShell>
  <Modal open={Boolean(quantityModal)} title="调整订单数量" description="数量历史追加保存；不会自动修改交期。" onClose={() => setQuantityModal(null)} onSubmit={applyQuantity} footer={<><Button variant="secondary" onClick={() => setQuantityModal(null)}>取消</Button><Button type="submit">保存数量变更</Button></>}>{quantityModal && <div className="qc-modal-form"><FormItem label="变更类型"><select className="qc-control" value={quantityModal.changeType} onChange={(event) => setQuantityModal({ ...quantityModal, changeType: event.target.value as OrderQuantityChangeType })}><option value="increase">增加</option><option value="decrease">减少</option><option value="partial_cancel">部分取消</option><option value="full_cancel">全部取消</option></select></FormItem><FormItem label="调整后有效数量" required><NullableNumberInput className="qc-control" min="0" value={quantityModal.afterQuantity} onValueChange={(value) => setQuantityModal({ ...quantityModal, afterQuantity: value })} /></FormItem><FormItem label="原因"><textarea className="qc-control" value={quantityModal.reason} onChange={(event) => setQuantityModal({ ...quantityModal, reason: event.target.value })} /></FormItem></div>}</Modal>
  <Modal open={Boolean(priceModal)} title="调整订单价格" description="保存后创建新的只读价格版本，不覆盖当前历史。" onClose={() => setPriceModal(null)} onSubmit={applyPrice} footer={<><Button variant="secondary" onClick={() => setPriceModal(null)}>取消</Button><Button type="submit">创建新价格版本</Button></>}>{priceModal && <div className="qc-modal-form"><FormItem label="成衣销售价"><NullableNumberInput className="qc-control" min="0" value={priceModal.salePrice} disabled={order.orderType === "processing"} onValueChange={(value) => setPriceModal({ ...priceModal, salePrice: value })} /></FormItem><FormItem label="工价"><NullableNumberInput className="qc-control" min="0" value={priceModal.processingUnitPrice} onValueChange={(value) => setPriceModal({ ...priceModal, processingUnitPrice: value })} /></FormItem><FormItem label="加工币种"><select className="qc-control" value={priceModal.processingCurrency} onChange={(event) => setPriceModal({ ...priceModal, processingCurrency: event.target.value as "CNY" | "USD" })}><option value="CNY">CNY</option><option value="USD">USD</option></select></FormItem><FormItem label="汇率依据"><NullableNumberInput className="qc-control" min="0" value={priceModal.exchangeRateSnapshot} onValueChange={(value) => setPriceModal({ ...priceModal, exchangeRateSnapshot: value })} /></FormItem><FormItem label="生效日期"><input type="date" className="qc-control" value={priceModal.effectiveDate} onChange={(event) => setPriceModal({ ...priceModal, effectiveDate: event.target.value })} /></FormItem><FormItem label="调整原因" required><textarea className="qc-control" value={priceModal.reason} onChange={(event) => setPriceModal({ ...priceModal, reason: event.target.value })} /></FormItem></div>}</Modal>
  <Modal open={Boolean(deliveryModal)} title="维护客户交期" description="客户交期与未来生产排单严格分离。" onClose={() => setDeliveryModal(null)} onSubmit={saveDelivery} footer={<><Button variant="secondary" onClick={() => setDeliveryModal(null)}>取消</Button><Button type="submit">保存交期</Button></>}>{deliveryModal && <div className="qc-modal-form"><FormItem label="交期" required><input type="date" className="qc-control" value={deliveryModal.plan.deliveryDate} onChange={(event) => setDeliveryModal({ ...deliveryModal, plan: { ...deliveryModal.plan, deliveryDate: event.target.value } })} /></FormItem><FormItem label="数量" required><NullableNumberInput className="qc-control" min="0" value={deliveryModal.plan.quantity} onValueChange={(value) => setDeliveryModal({ ...deliveryModal, plan: { ...deliveryModal.plan, quantity: value ?? 0 } })} /></FormItem><FormItem label="备注"><textarea className="qc-control" value={deliveryModal.plan.remark} onChange={(event) => setDeliveryModal({ ...deliveryModal, plan: { ...deliveryModal.plan, remark: event.target.value } })} /></FormItem></div>}</Modal>
  <Modal open={cancelOpen} title="取消整张订单" description="将追加全量取消记录并更新商务状态，历史不会删除。" onClose={() => setCancelOpen(false)} onSubmit={cancelWholeOrder} footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>返回</Button><Button type="submit" variant="danger">确认取消订单</Button></>}><FormItem label="取消原因" required><textarea className="qc-control" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></FormItem></Modal>
  <Modal open={pendingListNavigation} title="当前订单有未保存修改" description="离开后修改将丢失。" onClose={() => setPendingListNavigation(false)} footer={<><Button variant="secondary" onClick={() => setPendingListNavigation(false)}>继续编辑</Button><Button variant="danger" onClick={() => router.push("/order-center")}>不保存并返回</Button><Button onClick={() => void saveAndReturn()}>保存并返回</Button></>}><p>请先选择如何处理当前未保存内容。</p></Modal>
  <Toast message={toast} />
  </PageContainer></AppShell>;
}

export function OrderNewLoader() {
  const searchParams = useSearchParams();
  const reorderId = searchParams.get("reorder");
  const { currentUser, can } = usePermissions();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  useEffect(() => {
    if (!can("order.create")) return;
    const actor = { id: currentUser.id, name: currentUser.name };
    void (async () => {
      const orders = await orderRepository.list();
      const orderNo = suggestOrderNo(orders, today());
      if (reorderId) {
        const source = await orderRepository.getById(reorderId);
        if (source) { setOrder(createReorder({ source, orderNo, orderDate: today(), actor })); return; }
      }
      setOrder(createManualOrder({ header: { orderNo, customerId: null, customerNameSnapshot: "", customerPoNo: "", orderDate: today(), salespersonId: null, salespersonNameSnapshot: "", merchandiserId: null, merchandiserNameSnapshot: "", orderType: "processing", remark: "" }, actor }));
    })();
  }, [can, currentUser.id, currentUser.name, reorderId]);
  if (!can("order.create")) return <AppShell title="新建订单"><PageContainer><Card className="oc-no-permission"><strong>暂无创建订单权限</strong></Card></PageContainer></AppShell>;
  if (!order) return <AppShell title="新建订单"><PageContainer><div className="loading-screen qc-inline-loading"><div className="loading-mark">纫</div><strong>正在准备订单草稿</strong><span /></div></PageContainer></AppShell>;
  return <OrderEditor initialOrder={order} isNew />;
}

export function OrderDetailLoader() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { can } = usePermissions();
  const [order, setOrder] = useState<SalesOrder | null | undefined>(undefined);
  useEffect(() => { orderRepository.getById(id).then(setOrder); }, [id]);
  if (!can("order.view")) return <AppShell title="订单明细"><PageContainer><Card className="oc-no-permission"><strong>暂无订单查看权限</strong></Card></PageContainer></AppShell>;
  if (order === undefined) return <AppShell title="载入订单"><PageContainer><div className="loading-screen qc-inline-loading"><div className="loading-mark">纫</div><strong>正在载入订单</strong><span /></div></PageContainer></AppShell>;
  if (!order) return <AppShell title="订单不存在"><PageContainer><Card className="oc-no-permission"><strong>没有找到该订单</strong><Button onClick={() => window.location.assign("/order-center")}>返回订单中心</Button></Card></PageContainer></AppShell>;
  return <OrderEditor key={order.id} initialOrder={order} isNew={false} />;
}

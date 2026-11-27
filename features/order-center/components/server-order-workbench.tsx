"use client";

import { useCallback, useRef, useState } from "react";
import { AlertBanner, Button, Card, DescriptionList, StatusTag } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { OrderMaterialSummary, type MaterialSummaryReadState } from "@/features/ainuoke-material-progress/order-material-summary";
import { GarmentShipmentSection } from "@/features/ainuoke-garment-shipments/garment-shipment-section";
import type { OrderCenterServerDetailViewModel } from "../server/sales-order-server-model";
import { orderAlertDescription, orderAlertLabels } from "../server/order-alerts";
import { MaterialHistoryDialog } from "./material-history-dialog";
import { SavedColorSizes, SavedDeliveryPlans, SavedOrderSourceDetails } from "./server-saved-order-sources";
import { OrderColorPrices } from "./order-color-prices";
import { WorkbenchClosing, WorkbenchProduction } from "./order-workbench-execution";
import "./order-workbench.css";

const lifecycleLabels = { draft: "草稿", confirmed: "已确认", active: "执行中", completed: "已完成", cancelled: "已取消" };
const creationLabels = { ainuoke: "艾诺科", quote: "报价", reorder: "翻单", manual: "手工" };
const tabs = [{ id: "overview", label: "订单总览" }, { id: "colors", label: "颜色与尺码" }, { id: "history", label: "价格与历史" }] as const;
type Tab = typeof tabs[number]["id"];
const quantity = (value: number | null) => value === null ? "暂未取得数据" : value.toLocaleString("zh-CN");

export function ServerOrderWorkbench({ detail, trustedIdentity, deliveryPlanRefreshToken }: {
  detail: OrderCenterServerDetailViewModel; trustedIdentity: string; deliveryPlanRefreshToken: number;
}) {
  const session = useServerSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [materialRead, setMaterialRead] = useState<MaterialSummaryReadState | null>(null);
  const materialReadChanged = useCallback((value: MaterialSummaryReadState) => setMaterialRead(value), []);
  const tablist = useRef<HTMLDivElement>(null);
  const processing = detail.businessType === "processing", historical = Boolean(detail.attribution?.historicalDuplicate);
  const title = processing ? detail.styleNo || "款号待维护" : detail.insideOrderNo || "工厂款号待获取";
  const alerts = detail.alerts ?? [];
  const deleted = detail.sourceLifecycle?.state === "source_deleted" || alerts.some(alert => alert.code === "order_source_deleted");
  const otherAlerts = alerts.filter(alert => alert.code !== "order_source_deleted");
  const materialNeedsReview = materialRead !== null && (!["ready", "loading"].includes(materialRead.status) || Boolean(materialRead.reviewItems)) && !otherAlerts.some(alert => alert.code === "material_source_stale" || alert.code === "material_source_unavailable");
  const hasAttention = otherAlerts.length > 0 || materialNeedsReview;
  const selectColor = (identity: string) => { setSelectedColor(identity); setTab("colors"); };
  const showMaterial = () => { setTab("overview"); requestAnimationFrame(() => document.getElementById("ow-material-" + detail.id)?.scrollIntoView({ block: "start", behavior: "smooth" })); };
  return <div className="oc-server-detail-content ow-workbench" data-order-workbench>
    {historical && <AlertBanner tone="warning" title="历史重复订单 · 原身份与记录保留" actions={<a className="qc-button qc-button-secondary" href={`/order-center/server-detail?id=${encodeURIComponent(detail.attribution!.effectiveOrderId)}`}>查看有效订单</a>}>此单不再接收新的执行或价格采用。原合同、商业版本和历史流水保持。</AlertBanner>}
    {deleted && <div className="ow-source-deleted" role="alert"><strong>订单删除 · 艾诺科来源已删除</strong><p>本地订单及历史业务资料保留，自动同步已停止。此状态不表示本地订单已取消。</p></div>}
    <section className="ow-order-heading" aria-label="订单概况">
      <div><div className="ow-heading-title"><h1 className="oc-order-identity">{title}</h1><StatusTag tone={detail.lifecycleState === "cancelled" ? "danger" : ["confirmed", "completed"].includes(detail.lifecycleState) ? "success" : "neutral"}>订单状态 · {lifecycleLabels[detail.lifecycleState]}</StatusTag></div>
        <p className="ow-customer">{detail.customerName || "客户暂未取得"}</p><div className="ow-identifiers"><span>{detail.orderNo}</span><span>{processing ? "加工订单" : `销售合同 ${detail.billNo ?? "未记录"}`}</span><span>{detail.brandName || "品牌未记录"}</span></div></div>
      <dl className="ow-heading-metrics"><div><dt title="来源只读">{processing ? "加工数量（下单批次）" : "订单数量"}</dt><dd>{quantity(detail.quantity)}</dd><small>{detail.colors.length} 个颜色</small></div><div><dt title={processing ? undefined : "来源合同交期，只读"}>{processing ? "加工交期" : "合同交期"}</dt><dd>{detail.contractDeliveryDate ?? "暂未取得数据"}</dd>{processing && <small>下单批次日期</small>}</div></dl>
    </section>
    <section className={`ow-attention ${hasAttention ? "ow-has-attention" : ""}`} aria-label="需要关注">
      <h2>需要关注</h2>
      {hasAttention ? <ul>{otherAlerts.map((alert, index) => <li key={alert.code + index}><span className="ow-alert-kind">{alert.code === "color_quantity_zero" ? "业务提醒" : "数据待核对"}</span><strong>{orderAlertLabels[alert.code]}</strong><span>{alert.count === undefined && ["color_quantity_zero", "material_unit_missing", "material_unit_conflict"].includes(alert.code) ? "数量或单位信息待核对" : orderAlertDescription(alert)}</span>{alert.code === "color_quantity_zero" && <Button variant="text" size="compact" onClick={() => setTab("colors")}>查看颜色</Button>}</li>)}{materialNeedsReview && <li><span className="ow-alert-kind">数据待核对</span><strong>物料数据待核对</strong><span>{materialRead.status === "ready" && materialRead.reviewItems ? `${materialRead.reviewItems} 项物料完成状态待核对` : "暂未取得可用于判断当前采购的来源"}</span></li>}</ul>
        : <p className="ow-help">{materialRead?.status === "loading" ? "正在核对物料数据。" : "暂无已确认的待处理事项。各环节数据是否可用，请查看下方模块。"}</p>}
      {hasAttention && !processing && <Button className="ow-attention-action" variant="text" size="compact" onClick={showMaterial}>查看物料跟进 →</Button>}
    </section>
    <div className="ow-tabs" role="tablist" aria-label="订单工作台内容" ref={tablist} onKeyDown={event => {
      const index = tabs.findIndex(item => item.id === tab);
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next === null) return; event.preventDefault(); setTab(tabs[next].id); (tablist.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
    }}>{tabs.map(item => <button key={item.id} type="button" role="tab" id={`ow-tab-${item.id}`} aria-controls={`ow-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    <div id="ow-panel-overview" role="tabpanel" aria-labelledby="ow-tab-overview" hidden={tab !== "overview"}>
      <div className="ow-overview-grid"><div className="ow-main-stack">
        <Card className="oc-server-detail-section ow-delivery"><header><h2>交付计划</h2></header><div className="ow-section-body"><SavedDeliveryPlans orderId={detail.id} active processing={processing} refreshToken={deliveryPlanRefreshToken} compact /></div></Card>
        <div id={"ow-material-" + detail.id} className="ow-material-anchor">
          {processing ? <Card className="oc-server-detail-section"><header><h2>物料</h2></header><p className="ow-section-copy">加工订单不关联艾诺科销售合同，艾诺科物料流水不适用。</p></Card>
            : historical ? <Card className="oc-server-detail-section"><header><h2>物料历史</h2><MaterialHistoryDialog orderId={detail.id} compact /></header><p className="ow-section-copy">当前物料来源请在有效订单查看；原单快照保留在历史物料来源。</p></Card>
            : session.hasPermission("style_progress.read") ? <OrderMaterialSummary salesOrderId={detail.id} history={<MaterialHistoryDialog orderId={detail.id} compact />} onReadState={materialReadChanged} />
            : <Card className="oc-server-detail-section"><header><h2>物料采购汇总</h2></header><p className="ow-section-copy">当前账号没有物料查看权限。</p></Card>}
        </div>
        <WorkbenchProduction orderId={detail.id} historical={historical} />
        <GarmentShipmentSection orderId={detail.id} contract={detail.billNo} processing={processing} historicalAlias={historical} workbench />
        <WorkbenchClosing orderId={detail.id} historical={historical} />
      </div><aside className="ow-side-stack" aria-label="颜色及订单资料">
        <Card className="oc-server-detail-section ow-color-summary"><header><h2>颜色数量</h2><span className="ow-help">来源</span></header><div className="ow-section-body">{detail.colors.length ? detail.colors.map(color => <div className="ow-color-summary-row" key={color.sourceLineIdentity}><span>{color.colorName}</span><Button variant="text" size="compact" onClick={() => selectColor(color.sourceLineIdentity)}>{quantity(color.quantity)}</Button></div>) : <p className="ow-help">暂未取得颜色明细。</p>}<Button variant="text" onClick={() => setTab("colors")}>查看颜色尺码 →</Button></div></Card>
        <Card className="oc-server-detail-section"><header><h2>订单资料</h2></header><div className="ow-section-body"><dl className="ow-info"><dt>业务款号</dt><dd>{detail.styleNo || "未记录"}</dd><dt>{processing ? "下单日期" : "合同日期"}</dt><dd>{detail.contractDate ?? "未记录"}</dd><dt>艾诺科状态</dt><dd>{processing ? "不适用" : detail.sourceLifecycleStatus || "未记录"}</dd><dt>公司</dt><dd>{detail.companyName || "未记录"}</dd></dl></div></Card>
      </aside></div>
    </div>
    <div id="ow-panel-colors" role="tabpanel" aria-labelledby="ow-tab-colors" hidden={tab !== "colors"}>
      <Card className="oc-server-detail-section"><header><h2>颜色与尺码</h2><span className="ow-help">来源只读 · 未知与 0 分开</span></header><SavedColorSizes colors={detail.colors} source={detail.colorSource} processing={processing} matrix selectedColor={selectedColor} /></Card>
    </div>
    <div id="ow-panel-history" role="tabpanel" aria-labelledby="ow-tab-history" hidden={tab !== "history"}>
      <Card className="oc-server-detail-section ow-price-history"><header><h2>{processing ? "采用工价与价格依据" : "订单价格与调价历史"}</h2></header><div className="ow-section-body"><OrderColorPrices orderId={detail.id} colors={detail.colors} processing={processing} /></div></Card>
      <Card className="oc-server-detail-section ow-order-history"><header><h2>订单变更历史</h2></header><div className="ow-section-body"><p>价格变化见上方调价历史；来源维护、交期和执行历史保留在各自操作入口。</p><p className="ow-help">当前接口未提供本订单的完整变更时间线，暂未取得汇总数据。</p></div></Card>
    </div>
    <Card className="oc-server-detail-section ow-source-details"><SavedOrderSourceDetails orderId={detail.id} processing={processing} deliveryPlanRefreshToken={deliveryPlanRefreshToken}>
      <DescriptionList columns={3} compact items={[
        { key: "uuid", label: "UUID", value: detail.id }, { key: "version", label: "数据版本", value: `v${detail.version}` },
        { key: "creationSource", label: "创建来源", value: creationLabels[detail.creationSource], secondary: detail.creationSource },
        { key: "lifecycleCode", label: "生命周期原值", value: detail.lifecycleState },
        { key: "insideOrderNo", label: "工厂款号 / InsideOrderNo", value: detail.insideOrderNo, secondary: "可变来源属性，不是稳定订单身份" },
        { key: "colorCount", label: "有效颜色数", value: detail.colorCount.toLocaleString("zh-CN") },
        { key: "createdAt", label: "创建时间", value: detail.createdAt }, { key: "updatedAt", label: "更新时间", value: detail.updatedAt },
      ]} /><div className="oc-server-source-bar"><span><i aria-hidden="true" />数据源：PostgreSQL</span><small>Server identity：{trustedIdentity}</small></div>
    </SavedOrderSourceDetails></Card>
  </div>;
}

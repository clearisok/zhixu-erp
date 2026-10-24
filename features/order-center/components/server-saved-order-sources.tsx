"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DescriptionList, ErrorState, LoadingState } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import type { DeliveryPlanSetDto } from "../../../server/sales-orders/delivery-plan-model";
import type { ServerSalesOrderColorDto, ServerSalesOrderDetailDto } from "../server/sales-order-server-model";
import { readServerDeliveryPlans, SalesOrderServerReadError } from "../server/sales-order-server-client";

const matrixNotes = {
  SIZE_MATRIX_VALID: "已保存的分码与当时颜色数量一致。",
  SIZE_MATRIX_QUANTITY_MISMATCH: "来源分码与颜色数量不一致，保留原值待核对。",
  SIZE_MATRIX_MISSING: "来源未记录分码数量。",
  SIZE_MATRIX_RULE_OVERFLOW: "来源尺码超出可对应槽位，未对应数量保持未知。",
  SIZE_RULE_MISSING: "来源未记录尺码规则，不能推算尺码。",
  ZERO_QUANTITY_WITHOUT_SIZE: "来源颜色数量为0，未记录分码。",
  ZERO_QUANTITY_WITH_SIZE: "来源颜色数量为0，分码原值保留。",
};

function sizeNote(color: ServerSalesOrderColorDto): string {
  const evidence = color.sizeEvidence;
  if (evidence?.status === "available") return evidence.quantityPendingConfirmation
    ? "颜色数量待确认，尺码数量保持未知。"
    : matrixNotes[evidence.matrixStatus];
  if (!evidence || evidence.status === "not_recorded") return "尚未记录尺码证据，不依据颜色数量推算。";
  if (evidence.status === "not_applicable") return "加工订单不适用艾诺科颜色尺码来源。";
  if (evidence.status === "invalid") {
    if (evidence.reason === "quantity_changed") return "颜色数量已变化，原尺码证据需核对。";
    if (evidence.reason === "evidence_too_large") return "尺码证据超出读取范围，未截取部分数据。";
    return "尺码来源无法可靠核对，颜色事实仍保留。";
  }
  return "尺码来源尚未确认。";
}

/** Saved evidence only: no source request, quantity allocation or price read. */
export function SavedColorSizes({ colors, source, processing = false }: {
  colors: ServerSalesOrderColorDto[];
  source?: ServerSalesOrderDetailDto["colorSource"];
  processing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return <details className="oc-server-technical-details" data-saved-color-sizes onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>查看颜色尺码 <span>只读</span></summary>
    {expanded && <>
      {processing ? <p className="oc-server-color-note">加工订单不适用艾诺科颜色尺码来源。</p> : <>
        <p className="oc-server-color-note">尺码按来源槽位展示；未知与0分别保留，不自动合计或补算。</p>
        {source?.status === "recorded" ? <p className="oc-server-color-note">
          {source.colorDetailStatus === "missing" ? "来源未返回可用颜色明细。" : source.colorDetailStatus === "invalid" ? "保存的颜色来源存在异常。" : "已保存颜色来源。"}
          {source.insideOrderNoDrift && " 工厂款号有变化，仍按销售合同对应。"}
          {source.savedSourceBatchAt && ` 来源批次保存时间：${new Date(source.savedSourceBatchAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（非逐色读取时间）。`}
        </p> : <p className="oc-server-color-note">{source?.status === "invalid" ? "颜色来源证据无法可靠核对。" : "颜色来源批次尚未记录。"}</p>}
        {colors.map(color => <section key={color.sourceLineIdentity} aria-label={`${color.colorName}尺码`}>
          <p className="oc-server-color-note"><strong>{color.colorName}</strong> · {sizeNote(color)}{color.sizeEvidence?.status === "available" && color.sizeEvidence.insideOrderNoDrift && " 工厂款号有变化。"}</p>
          {color.sizeEvidence?.status === "available" && color.sizeEvidence.allocations.length > 0 && <div className="oc-server-color-table" role="region" aria-label={`${color.colorName}尺码明细`} tabIndex={0}>
            <table><thead><tr><th>来源槽位</th><th>尺码</th><th>数量</th></tr></thead><tbody>
              {color.sizeEvidence.allocations.map(size => <tr key={size.slot}><td>{size.slot}</td><td>{size.sizeName}</td><td>{size.quantity === null ? "未知" : String(size.quantity)}</td></tr>)}
            </tbody></table>
          </div>}
        </section>)}
        {!colors.length && <p className="oc-server-color-note">暂无可展示的颜色尺码。</p>}
      </>}
    </>}
  </details>;
}

const ownershipLabels = {
  source_derived: "首次来源初始化的系统默认计划",
  user_managed: "织序维护计划",
  uninitialized: "所有权尚未记录，不推定为自动或人工",
};
const quantityLabels = {
  no_source_quantity: "合同数量未记录", unplanned: "尚无有效日期计划",
  short: "计划数量少于合同数量", matched: "计划数量与合同数量一致", excess: "计划数量超出合同数量",
};
const dateLabels = { no_source_date: "合同交期未记录", matched: "计划日期与合同交期一致", drift: "计划日期与合同交期有差异" };

export function SavedDeliveryPlanFacts({ data, processing = false }: { data: DeliveryPlanSetDto; processing?: boolean }) {
  return <>
    <DescriptionList columns={3} compact items={[
      { key: "ownership", label: "计划归属", value: ownershipLabels[data.ownership] },
      ...(!processing ? [
        { key: "date", label: "艾诺科合同交期（对照）", value: data.sourceDeliveryDate ?? "未记录" },
        { key: "quantity", label: "艾诺科合同数量（对照）", value: data.sourceQuantity ?? "未记录" },
      ] : []),
    ]} />
    <p className="oc-server-color-note">{processing ? "加工订单无艾诺科合同对照。" : `${dateLabels[data.reconciliation.dateStatus]}；${quantityLabels[data.reconciliation.quantityStatus]}。`} 不自动分配或修改计划。</p>
    {data.plans.length ? <div className="oc-server-color-table" role="region" aria-label="织序交付计划明细" tabIndex={0}>
      <table><thead><tr><th>交付日期</th><th>计划数量</th><th>记录状态</th></tr></thead><tbody>
        {data.plans.map(plan => <tr key={plan.id}>
          <td>{plan.deliveryDate ?? "日期未记录"}</td><td>{plan.quantity}</td>
          <td>{plan.voidedAt ? "已作废（历史保留）" : "有效"}{plan.isDerivedDefault ? " · 初始默认行" : ""}</td>
        </tr>)}
      </tbody></table>
    </div> : <p className="oc-server-color-note">尚无交付计划记录。</p>}
  </>;
}

type PlanView = { lease: object } & ({ data: DeliveryPlanSetDto; error?: never } | { error: number; data?: never });

/** Only the existing disclosure triggers a GET; each committed identity owns its reply. */
export function SavedDeliveryPlans({ orderId, active, processing = false }: { orderId: string; active: boolean; processing?: boolean }) {
  const session = useServerSession();
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<PlanView | null>(null);
  const lease = useMemo(() => ({ orderId, session, active, attempt }), [orderId, session, active, attempt]);
  const owner = useRef<object | null>(null);
  useLayoutEffect(() => {
    owner.current = lease;
    return () => { owner.current = null; };
  }, [lease]);
  useEffect(() => {
    if (!active || session.status !== "authenticated" || !session.hasPermission("order.view")) return;
    let current = true;
    const owned = () => current && owner.current === lease;
    void readServerDeliveryPlans(orderId).then(data => {
      if (!owned()) return;
      if (data.salesOrderId !== orderId) { setView({ lease, error: 500 }); return; }
      setView({ lease, data });
    }).catch((error: unknown) => {
      if (!owned()) return;
      const status = error instanceof SalesOrderServerReadError ? error.status : 0;
      setView({ lease, error: status });
      if (status === 401) session.invalidate();
    });
    return () => { current = false; };
  }, [active, lease, orderId, session]);
  if (!active || session.status !== "authenticated" || !session.hasPermission("order.view")) return null;
  const result = view?.lease === lease ? view : null;
  return <section aria-label="交付计划（织序）" data-saved-delivery-plans>
    <p className="oc-server-color-note"><strong>交付计划（织序）</strong> · 读取织序保存的计划；与订单详情为独立读取。</p>
    {!result ? <LoadingState compact label="读取交付计划" rows={2} /> : result.data ? <SavedDeliveryPlanFacts data={result.data} processing={processing} /> : <ErrorState
      title={result.error === 403 ? "没有交付计划查看权限" : result.error === 404 ? "交付计划对应订单不存在" : "交付计划暂时无法读取"}
      description="未展示先前计划。重试只读取织序记录，不采集艾诺科来源。"
      permission={result.error === 403}
      onRetry={() => setAttempt(value => value + 1)}
    />}
  </section>;
}

export function SavedOrderSourceDetails({ orderId, processing, children }: {
  orderId: string; processing: boolean; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return <details className="oc-server-technical-details" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>来源与技术详情 <span>只读</span></summary>
    <SavedDeliveryPlans orderId={orderId} active={expanded} processing={processing} />
    {children}
  </details>;
}

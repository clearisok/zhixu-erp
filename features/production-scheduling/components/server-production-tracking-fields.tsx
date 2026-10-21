"use client";
import { FormItem } from "@/components/foundation";
import { ServerProductionReferencePicker } from "@/features/operations-settings/components/server-production-reference-picker";
import type { OrderTrackingIntent, OrderTrackingRead } from "../server/production-plan-client";

export type TrackingForm = OrderTrackingIntent["data"];
export function ServerProductionTrackingFields({ scope, form, canEdit, update, isCurrent }: {
  scope: OrderTrackingRead; form: TrackingForm; canEdit: boolean; update: (patch: Partial<TrackingForm>) => void; isCurrent: () => boolean;
}) {
  return <div className="qc-modal-form">
    <div className="ps-order-context"><strong>{scope.order.orderNo}</strong><span>集货仓与备注归属本订单，不改变排单或已登记产出。</span></div>
    {canEdit ? <>
      <FormItem label="集货仓"><ServerProductionReferencePicker kind="hubs" value={form.supplyHubId ?? ""} emptyLabel="未设置" isCurrent={isCurrent} onChange={id => update({ supplyHubId: id || null })} /></FormItem>
      <FormItem label="备注"><textarea aria-label="物料与运输备注" className="qc-control" rows={4} maxLength={2000} value={form.remark} onChange={event => update({ remark: event.target.value })} /></FormItem>
    </> : <><p>集货仓：{scope.currentHub?.name ?? "未设置"}{scope.currentHub && !scope.currentHub.enabled ? "（已停用）" : ""}</p><p className="ps-tracking-remark">备注：{scope.tracking?.remark || "未填写"}</p><p>当前仅可查看。</p>
      {(form.supplyHubId !== (scope.tracking?.supplyHubId ?? null) || form.remark !== (scope.tracking?.remark ?? "")) && <p role="status">保留了未保存的输入，尚未应用；当前仅展示已保存内容。</p>}</>}
    {scope.tracking?.hubSnapshot && <p>上次保存时：{scope.tracking.hubSnapshot.name}{scope.currentHub && scope.currentHub.name !== scope.tracking.hubSnapshot.name ? `；当前名称：${scope.currentHub.name}` : ""}{scope.currentHub && !scope.currentHub.enabled ? "。该仓已停用，可保留原引用或清空。" : ""}</p>}
    <p>逐物料到仓与运输建议尚未接入，不以来源交期代替到仓日期。</p>
  </div>;
}

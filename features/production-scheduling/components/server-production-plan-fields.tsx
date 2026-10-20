"use client";
import { Button, FormItem } from "@/components/foundation";
import { ServerProductionReferencePicker } from "@/features/operations-settings/components/server-production-reference-picker";
import { planFormDuration, type PlanForm } from "../server/production-plan-form";
import type { PlanOrderRead } from "../server/production-plan-client";

export function ServerProductionPlanFields({ form, order, update, isCurrent }: {
  form: PlanForm; order: PlanOrderRead; update: (patch: Partial<PlanForm>) => void; isCurrent: () => boolean;
}) {
  const derived = planFormDuration(form), info = order.summary;
  const colors = order.order.colors.filter((item, index, all) => all.findIndex(row => row.id === item.id) === index);
  const saved = order.assignments.find(row => row.id === form.assignmentId), resource = saved && order.resources[saved.resourceSnapshotHash];
  const adoptedName = resource?.executionType === "internal" ? resource.group.name : resource?.factory.name;
  return <div className="qc-modal-form ps-assignment-form">
    <div className="ps-order-context"><strong>{info.factoryStyleNo || info.styleNo || info.orderNo} · {info.customerName || "未记录客户"}</strong>
      <span>订单 {info.quantity ?? "待核实"} · 已排 {info.plannedQuantity} · 可排 {info.remainingQuantity ?? "待核实"}</span>
      <small>{info.orderNo}{info.contractNo ? ` · 合同 ${info.contractNo}` : " · 加工订单"}</small>
    </div>
    <FormItem label="生产组织"><select className="qc-control" aria-label="生产组织" value={form.executionType} onChange={event => {
      const executionType = event.target.value as PlanForm["executionType"];
      update({ executionType, executorId: "", dateMode: executionType === "internal" ? "auto_queue" : "manual_fixed" });
    }}><option value="internal">内部</option><option value="outsource">外发</option></select></FormItem>
    <FormItem label={form.executionType === "internal" ? "生产组" : "外发厂"} required>
      <ServerProductionReferencePicker kind={form.executionType === "internal" ? "groups" : "factories"} value={form.executorId} onChange={executorId => update({ executorId })} isCurrent={isCurrent} />
      {adoptedName && form.executorId === (saved?.productionGroupId ?? saved?.outsourceFactoryId) && <small>本条已采用：{adoptedName}。保持执行方时保留原资源与日历。</small>}
    </FormItem>
    <FormItem label="颜色"><select className="qc-control" aria-label="排单颜色" value={form.colorId} onChange={event => update({ colorId: event.target.value })}>
      <option value="">整单，不按颜色拆分</option>
      {form.colorId && !colors.some(row => row.id === form.colorId) && <option value={form.colorId}>{saved?.colorNameSnapshot || "历史颜色"}（待核对）</option>}
      {colors.map(color => <option key={color.id} value={color.id} disabled={color.ambiguous && color.id !== saved?.colorId}>{color.colorName}{color.ambiguous ? "（数量待核对）" : ` · ${color.quantity}`}</option>)}
    </select></FormItem>
    <FormItem label="排单数量" required><div className="ps-quantity-control">
      <input className="qc-control" aria-label="排单数量" inputMode="decimal" value={form.plannedQuantity} onChange={event => update({ plannedQuantity: event.target.value })} />
      <Button type="button" variant="secondary" disabled={info.remainingQuantity === null || info.remainingQuantity === "0"} onClick={() => { if (info.remainingQuantity !== null && info.remainingQuantity !== "0") update({ plannedQuantity: info.remainingQuantity }); }}>全部可排数量</Button>
    </div></FormItem>
    <FormItem label="平均日产"><input className="qc-control" aria-label="平均日产" inputMode="decimal"
      value={form.durationMode === "workdays" && derived ? derived.dailyOutputSnapshot : form.dailyOutput}
      onChange={event => update({ durationMode: "average_daily_output", dailyOutput: event.target.value })} /></FormItem>
    <FormItem label="所需工作日"><input className="qc-control" aria-label="所需工作日" inputMode="numeric"
      value={form.durationMode === "average_daily_output" && derived ? String(derived.requiredWorkdays) : form.workdays}
      onChange={event => update({ durationMode: "workdays", workdays: event.target.value })} />
      <small>{form.durationMode === "workdays" ? "按工作日计算参考日产量" : "按平均日产计算工作日"}</small>
    </FormItem>
    <FormItem label="日期安排"><select className="qc-control" aria-label="日期安排" value={form.dateMode} onChange={event => update({ dateMode: event.target.value as PlanForm["dateMode"] })}>
      {form.executionType === "internal" && <option value="auto_queue">自动队列</option>}<option value="manual_fixed">手工固定</option>
    </select></FormItem>
    <FormItem label="计划开始" required><input className="qc-control" aria-label="计划开始" type="date" value={form.startDate} onChange={event => update({ startDate: event.target.value })} /></FormItem>
    {form.dateMode === "manual_fixed" && <FormItem label="计划结束" required><input className="qc-control" aria-label="计划结束" type="date" value={form.endDate} onChange={event => update({ endDate: event.target.value })} /></FormItem>}
    <FormItem label="备注"><textarea className="qc-control" aria-label="排单备注" value={form.remark} onChange={event => update({ remark: event.target.value })} /></FormItem>
    {form.assignmentId && <FormItem label="修改说明"><textarea className="qc-control" aria-label="排单修改说明" value={form.reason} onChange={event => update({ reason: event.target.value })} /></FormItem>}
    <div className="ps-logistics-feedback"><strong>先预览，再确认保存</strong><span>预览会核对当前订单、颜色、队列和工作日历。实际完成与物料运输尚未纳入本页。</span></div>
  </div>;
}

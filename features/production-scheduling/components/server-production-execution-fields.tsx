"use client";
import { ContextSummary, FormItem } from "@/components/foundation";
import type { ExecutionScope } from "../server/production-plan-client";
import type { ExecutionForm } from "../server/production-execution-form";

export function ServerProductionExecutionFields({ scope, form, update }: {
  scope: ExecutionScope; form: ExecutionForm; update: (patch: Partial<ExecutionForm>) => void;
}) {
  const { order, assignment } = scope, info = order.summary, saved = order.executions[assignment.id];
  const resource = order.resources[assignment.resourceSnapshotHash];
  return <div className="qc-modal-form ps-assignment-form">
    <ContextSummary title="当前登记对象" items={[
      { key: "style", label: "款号 / 订单", value: `${info.factoryStyleNo || info.styleNo || info.orderNo} · ${info.orderNo}` },
      { key: "executor", label: assignment.executionType === "internal" ? "生产组" : "外发厂", value: resource?.executionType === "internal" ? resource.group.name : resource?.factory.name ?? "资料待核对" },
      { key: "color", label: "颜色", value: assignment.colorNameSnapshot || "整单" },
      { key: "quantity", label: "计划 / 累计完成", value: `${assignment.plannedQuantity} / ${saved?.completedQuantity ?? "尚未登记"}` },
    ]} />
    {assignment.status === "cancelled" && <p role="status">本排单已取消，仅可更正已有实际记录；完成量仍保留在原执行方。</p>}
    <FormItem label="执行状态" required><select aria-label="执行状态" className="qc-control" value={form.status} onChange={event => update({ status: event.target.value as ExecutionForm["status"] })}>
      <option value="in_progress">进行中</option><option value="completed">已结束</option>
    </select></FormItem>
    <FormItem label="累计完成数量" required><input aria-label="累计完成数量" inputMode="decimal" className="qc-control" value={form.completedQuantity} onChange={event => update({ completedQuantity: event.target.value })} />
      <small>填写截至目前的累计数量，不是本次增加量；超计划完成保留真实值。</small>
    </FormItem>
    <FormItem label="实际开工日期"><input aria-label="实际开工日期" type="date" className="qc-control" value={form.actualStartDate} onChange={event => update({ actualStartDate: event.target.value })} /><small>未记录时留空。</small></FormItem>
    {form.status === "completed" && <FormItem label="实际完成日期" required><input aria-label="实际完成日期" type="date" className="qc-control" value={form.actualCompletedDate} onChange={event => update({ actualCompletedDate: event.target.value })} /></FormItem>}
    <FormItem label="说明（更正时必填）"><textarea aria-label="执行更正说明" className="qc-control" value={form.reason} onChange={event => update({ reason: event.target.value })} />
      <small>减少完成量、更正已记录日期、重新打开或修改已取消记录，需要说明原因。</small>
    </FormItem>
    <p>计划窗口仍保留为 {assignment.plannedStartDate} → {assignment.plannedEndDate}。更换执行方或取消剩余任务后，为剩余数量另建排单。</p>
  </div>;
}

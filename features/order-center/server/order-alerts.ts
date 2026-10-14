export type OrderAlertCode = "color_quantity_zero" | "material_unit_missing" | "material_unit_conflict" | "material_source_stale" | "material_source_unavailable";
export type OrderAlert = { code: OrderAlertCode; count?: number; pendingCount?: number };
export const orderAlertLabels: Record<OrderAlertCode, string> = {
  color_quantity_zero: "数量0", material_unit_missing: "单位为空", material_unit_conflict: "单位冲突",
  material_source_stale: "来源过期", material_source_unavailable: "来源未就绪",
};
export function orderAlertDescription(alert: OrderAlert): string {
  if (alert.code === "color_quantity_zero") return `${alert.count ?? 0}条颜色数量为0${alert.pendingCount ? `，其中${alert.pendingCount}条数量待确认` : ""}；不代表整单合同数量为0`;
  if (alert.code === "material_unit_missing") return `${alert.count ?? 0}项物料来源单位为空，不默认填单位`;
  if (alert.code === "material_unit_conflict") return `${alert.count ?? 0}项物料单位冲突，暂停对应汇总`;
  return alert.code === "material_source_stale" ? "物料来源已过期，异常尚未重新核实" : "物料来源未连接、缺失或读取失败，不能据此判定无异常";
}

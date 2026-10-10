import { orderMaterialNavigation } from './order-navigation';
import type { OrderMaterialReadModel } from './read-service';
export async function readOrderMaterial(id: string, signal?: AbortSignal): Promise<OrderMaterialReadModel> {
  const route = orderMaterialNavigation(id); if (!route) throw new Error('invalid_order_uuid');
  const response = await fetch(`/api/v1/sales-orders/${route.salesOrderId}/material-progress`, {credentials:'same-origin',cache:'no-store',signal});
  if (!response.ok) throw new Error(`物料来源未接通或没有权限（HTTP ${response.status}）`);
  const model = await response.json() as OrderMaterialReadModel;
  if (model.salesOrderId !== route.salesOrderId || model.progress.schemaVersion !== 'order-material-read.v1') throw new Error('物料响应关联无效');
  return model;
}

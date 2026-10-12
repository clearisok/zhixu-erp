/** Fixed same-origin targets. No caller-controlled return URL or Browser order ID. */
export type OrderMaterialNavigation = { salesOrderId: string; detailHref: string; returnHref: string };
export function orderMaterialNavigation(value: unknown): OrderMaterialNavigation | null {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) return null;
  const salesOrderId = value.toLowerCase();
  return { salesOrderId, detailHref: `/order-center/style-progress/detail?orderId=${salesOrderId}`,
    returnHref: `/order-center/server-detail?id=${salesOrderId}` };
}

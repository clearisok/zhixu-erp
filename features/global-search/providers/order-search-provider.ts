import { getEffectiveQuantity, getOrderNearestDeliveryDate } from "../../order-center/model/order.ts";
import type { OrderRepository } from "../../order-center/repository/order-repository.ts";
import type { SearchProvider, SearchResult } from "../model/global-search.ts";

function matches(value: string, query: string): boolean {
  const words = query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const source = value.normalize("NFKC").toLocaleLowerCase();
  return words.every((word) => source.includes(word));
}

export function createOrderSearchProvider(repository: OrderRepository): SearchProvider {
  return {
    id: "orders",
    label: "订单",
    canSearch: (context) => context.can("order.view"),
    async search(query) {
      const orders = await repository.list();
      return orders.flatMap((order): SearchResult[] => {
        if (!matches([order.orderNo, order.customerPoNo, order.styleNo, order.styleName, order.customerNameSnapshot].join(" "), query)) return [];
        const effectiveQuantity = getEffectiveQuantity(order);
        return [{
          id: `order:${order.id}`,
          providerId: "orders",
          type: "order",
          typeLabel: "订单",
          icon: "▣",
          title: order.orderNo,
          subtitle: `${order.customerNameSnapshot || "未填写客户"} · ${order.styleNo || "未填写款号"}${order.styleName ? ` · ${order.styleName}` : ""}`,
          meta: [
            { label: "客户 PO", value: order.customerPoNo || "—" },
            { label: "有效数量", value: effectiveQuantity.toLocaleString("zh-CN") },
            { label: "最近交期", value: getOrderNearestDeliveryDate(order) ?? "未安排" },
          ],
          href: `/order-center/detail?id=${encodeURIComponent(order.id)}`,
        }];
      }).slice(0, 20);
    },
  };
}

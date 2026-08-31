import type { ClosingRepository } from "../../closing-center/repository/closing-repository.ts";
import type { OrderRepository } from "../../order-center/repository/order-repository.ts";
import type { OperationsSettingsState } from "../../operations-settings/model/operations-settings.ts";
import type { SearchProvider, SearchResult } from "../model/global-search.ts";

const includes = (value: string, query: string) => value.normalize("NFKC").toLocaleLowerCase().includes(query.normalize("NFKC").trim().toLocaleLowerCase());

export function createClosingSearchProvider(repository: ClosingRepository, orderRepository: OrderRepository, settings: () => OperationsSettingsState): SearchProvider {
  return { id: "closing-center", label: "关账中心", canSearch: (context) => context.can("closing.view"), async search(query): Promise<SearchResult[]> {
    const [state, orders] = await Promise.all([repository.load(), orderRepository.list()]); const masters = settings(); const orderMap = new Map(orders.map((item) => [item.id, item]));
    return state.periods.flatMap((period): SearchResult[] => {
      const allocations = state.allocations.filter((item) => item.closingPeriodId === period.id && item.status !== "voided");
      const text = [period.month, ...allocations.flatMap((item) => { const order = orderMap.get(item.salesOrderId); return [order?.orderNo ?? "", order?.styleNo ?? "", order?.styleName ?? "", order?.customerNameSnapshot ?? "", item.productionGroupNameSnapshot ?? "", item.outsourceFactoryNameSnapshot ?? ""]; })].join(" ");
      if (!includes(text, query)) return [];
      const quantity = allocations.reduce((sum, item) => sum + item.quantity, 0);
      return [{ id: `closing:${period.id}`, providerId: "closing-center", type: "closing", typeLabel: "关账", icon: "结", title: `${period.month} 月度关账`, subtitle: `${allocations.length} 条归属 · ${quantity.toLocaleString("zh-CN")} 件`, meta: [{ label: "状态", value: period.status === "open" ? "开放" : period.status === "confirmed" ? "已确认" : "已锁定" }, { label: "生产基础资料", value: `${masters.productionGroups.length} 组 / ${masters.outsourceFactories.length} 厂` }], href: `/closing-center?month=${encodeURIComponent(period.month)}` }];
    }).slice(0, 20);
  } };
}

import type { OrderRepository } from "../../order-center/repository/order-repository.ts";
import type { StyleProgressRepository } from "../../style-progress/repository/style-progress-repository.ts";
import type { SearchProvider, SearchResult } from "../model/global-search.ts";

const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();

export function createStyleProgressSearchProvider(repository: StyleProgressRepository, orders: OrderRepository): SearchProvider {
  return {
    id: "style-progress",
    label: "款式进度",
    canSearch: (context) => context.can("style_progress.read"),
    async search(query) {
      const [demands, orderRows] = await Promise.all([repository.listDemands(), orders.list()]);
      const orderByContract = new Map(orderRows.filter((order) => order.salesContractNo).map((order) => [order.salesContractNo!, order]));
      const normalized = normalize(query);
      const contracts = new Map<string, typeof demands[number]>();
      for (const demand of demands) if (!contracts.has(demand.salesContractNo)) contracts.set(demand.salesContractNo, demand);
      return [...contracts.values()].flatMap((demand): SearchResult[] => {
        const order = orderByContract.get(demand.salesContractNo);
        const haystack = normalize([demand.salesContractNo, order?.factoryStyleNo || demand.sourceFactoryStyleNoSnapshot, order?.styleNo || demand.sourceStyleNoSnapshot].join(" "));
        if (!haystack.includes(normalized)) return [];
        return [{
          id: `style-progress:${demand.salesContractNo}`, providerId: "style-progress", type: "style-progress", typeLabel: "款式进度", icon: "◫",
          title: demand.salesContractNo, subtitle: `${order?.factoryStyleNo || demand.sourceFactoryStyleNoSnapshot || "未记录工厂款号"} · ${order?.styleNo || demand.sourceStyleNoSnapshot || "未记录业务款号"}`,
          meta: [{ label: "订单", value: order?.orderNo ?? "销售合同尚未形成织序订单" }, { label: "查看", value: "款式进度" }],
          href: `/order-center/style-progress/detail?contract=${encodeURIComponent(demand.salesContractNo)}`,
        }];
      }).slice(0, 20);
    },
  };
}

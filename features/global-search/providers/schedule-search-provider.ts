import type { OrderRepository } from "../../order-center/repository/order-repository.ts";
import type { OperationsSettingsState } from "../../operations-settings/model/operations-settings.ts";
import type { ProductionSchedulingRepository } from "../../production-scheduling/repository/production-scheduling-repository.ts";
import { assignmentsForOrder, projectOrderSchedule } from "../../production-scheduling/service/production-scheduling-service.ts";
import type { SearchProvider, SearchResult } from "../model/global-search.ts";

const includes = (value: string, query: string) => value.normalize("NFKC").toLocaleLowerCase().includes(query.normalize("NFKC").trim().toLocaleLowerCase());
const executionModeLabels = { unscheduled: "未安排", internal: "内部", outsource: "外发", mixed: "混合" } as const;

export function createScheduleSearchProvider(repository: ProductionSchedulingRepository, orderRepository: OrderRepository, settings: () => OperationsSettingsState): SearchProvider {
  return {
    id: "production-scheduling",
    label: "生产排单",
    canSearch: (context) => context.can("schedule.view"),
    async search(query): Promise<SearchResult[]> {
      const [state, orders] = await Promise.all([repository.load(), orderRepository.list()]);
      const masters = settings();
      return orders.flatMap((order): SearchResult[] => {
        const assignments = assignmentsForOrder(state, order.id);
        const executorNames = assignments.map((assignment) => assignment.executionType === "internal"
          ? masters.productionGroups.find((item) => item.id === assignment.productionGroupId)?.name ?? ""
          : masters.outsourceFactories.find((item) => item.id === assignment.outsourceFactoryId)?.name ?? "");
        const siteNames = assignments.flatMap((assignment) => { const group = masters.productionGroups.find((item) => item.id === assignment.productionGroupId); return masters.productionSites.find((item) => item.id === group?.productionSiteId)?.name ?? []; });
        if (!includes([order.orderNo, order.styleNo, order.styleName, order.customerNameSnapshot, ...executorNames, ...siteNames, ...masters.supplyHubs.map((item) => item.name)].join(" "), query)) return [];
        const projection = projectOrderSchedule(order, state);
        return [{ id: `schedule:${order.id}`, providerId: "production-scheduling", type: "schedule", typeLabel: "排单", icon: "▦", title: `${order.orderNo} · ${order.styleNo}`, subtitle: order.styleName || order.customerNameSnapshot, meta: [{ label: "执行方式", value: executionModeLabels[projection.executionMode] }, { label: "排单", value: `${projection.scheduledQuantity}/${projection.effectiveOrderQuantity}` }, { label: "风险", value: projection.deliveryRisk.messages[0] ?? "正常" }], href: `/production-scheduling?orderId=${encodeURIComponent(order.id)}` }];
      }).slice(0, 20);
    },
  };
}

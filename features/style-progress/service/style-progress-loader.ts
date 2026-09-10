import type { SalesOrder } from "../../order-center/model/order.ts";
import { orderRepository } from "../../order-center/repository/order-repository.ts";
import type { OperationsSettingsState } from "../../operations-settings/model/operations-settings.ts";
import { operationsSettingsRepository } from "../../operations-settings/repository/operations-settings-repository.ts";
import type { ProductionSchedulingState } from "../../production-scheduling/model/production-scheduling.ts";
import { productionSchedulingRepository } from "../../production-scheduling/repository/production-scheduling-repository.ts";
import type { StyleProgressData } from "../model/style-progress.ts";
import { styleProgressRepository } from "../repository/style-progress-repository.ts";
import { buildStyleProgressProjections, type StyleProgressProjection } from "./style-progress-service.ts";

export type LoadedStyleProgress = {
  data: StyleProgressData;
  orders: SalesOrder[];
  projections: StyleProgressProjection[];
  settings: OperationsSettingsState;
};

export type StyleProgressLoaders = {
  loadData: () => Promise<StyleProgressData>;
  loadOrders: () => Promise<SalesOrder[]>;
  loadScheduling: () => Promise<ProductionSchedulingState>;
  loadSettings: () => OperationsSettingsState | Promise<OperationsSettingsState>;
};

const defaultLoaders: StyleProgressLoaders = {
  loadData: () => styleProgressRepository.loadAll(),
  loadOrders: () => orderRepository.list(),
  loadScheduling: () => productionSchedulingRepository.load(),
  loadSettings: () => operationsSettingsRepository.load(),
};

export async function loadStyleProgress(
  overrides: Partial<StyleProgressLoaders> = {},
): Promise<LoadedStyleProgress> {
  const loaders = { ...defaultLoaders, ...overrides };
  const [data, orders, scheduling, settings] = await Promise.all([
    loaders.loadData(),
    loaders.loadOrders(),
    loaders.loadScheduling(),
    Promise.resolve(loaders.loadSettings()),
  ]);
  return {
    data,
    orders,
    settings,
    projections: buildStyleProgressProjections({
      data,
      orders,
      scheduling,
      settings,
    }),
  };
}

import { SearchRegistry } from "./model/global-search.ts";
import { mockQuoteRepository } from "../quote-center/repository/mock-quote-repository";
import { createQuoteSearchProvider } from "./providers/quote-search-provider.ts";
import { orderRepository } from "../order-center/repository/order-repository.ts";
import { createOrderSearchProvider } from "./providers/order-search-provider.ts";
import { createScheduleSearchProvider } from "./providers/schedule-search-provider.ts";
import { productionSchedulingRepository } from "../production-scheduling/repository/production-scheduling-repository.ts";
import { operationsSettingsRepository } from "../operations-settings/repository/operations-settings-repository.ts";
import { closingRepository } from "../closing-center/repository/closing-repository.ts";
import { createClosingSearchProvider } from "./providers/closing-search-provider.ts";
import { styleProgressRepository } from "../style-progress/repository/style-progress-repository.ts";
import { createStyleProgressSearchProvider } from "./providers/style-progress-search-provider.ts";

export const globalSearchRegistry = new SearchRegistry([
  createQuoteSearchProvider(mockQuoteRepository),
  createOrderSearchProvider(orderRepository),
  createScheduleSearchProvider(productionSchedulingRepository, orderRepository, () => operationsSettingsRepository.load()),
  createClosingSearchProvider(closingRepository, orderRepository, () => operationsSettingsRepository.load()),
  createStyleProgressSearchProvider(styleProgressRepository, orderRepository),
]);

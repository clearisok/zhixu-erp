import { SearchRegistry } from "./model/global-search.ts";
import { mockQuoteRepository } from "../quote-center/repository/mock-quote-repository";
import { createQuoteSearchProvider } from "./providers/quote-search-provider.ts";

export const globalSearchRegistry = new SearchRegistry([
  createQuoteSearchProvider(mockQuoteRepository),
]);

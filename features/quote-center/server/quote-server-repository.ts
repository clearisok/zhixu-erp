import type { QuoteRecord, ServerQuote } from "../../../server/quotes/model";
import {
  quoteServerClient,
  type QuoteServerClient,
  type QuoteServerListItem,
  type QuoteServerPage,
} from "./quote-server-client";

/** Q2A foundation only. The Browser Quote Center is not wired to this adapter. */
export interface QuoteServerRepository {
  list(query?: { limit?: number; offset?: number }): Promise<{ items: QuoteServerListItem[]; page: QuoteServerPage }>;
  getById(id: string): Promise<QuoteRecord>;
  create(quote: ServerQuote): Promise<QuoteRecord>;
  save(quote: ServerQuote, expectedVersion: number): Promise<QuoteRecord>;
}

export function createQuoteServerRepository(client: QuoteServerClient = quoteServerClient): QuoteServerRepository {
  return {
    async list(query) {
      const result = await client.list(query);
      return { items: result.quotes, page: result.page };
    },
    getById: (id) => client.getById(id),
    create: (quote) => client.create(quote),
    save: (quote, expectedVersion) => client.save(quote, expectedVersion),
  };
}

export const quoteServerRepository = createQuoteServerRepository();

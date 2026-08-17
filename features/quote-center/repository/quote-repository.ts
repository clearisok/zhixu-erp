import type { Quote } from "../model/quote-view-model";

export interface QuoteRepository {
  list(): Promise<Quote[]>;
  getById(id: string): Promise<Quote | null>;
  save(quote: Quote): Promise<void>;
  createDraft(today: string): Promise<Quote>;
}

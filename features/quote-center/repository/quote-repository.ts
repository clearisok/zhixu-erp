import type { Quote } from "../model/quote-view-model";

export type QuoteDeleteOptions = { mode?: "hard" | "soft"; deletedAt?: string };

export interface QuoteRepository {
  list(): Promise<Quote[]>;
  getById(id: string): Promise<Quote | null>;
  save(quote: Quote): Promise<void>;
  delete(id: string, options?: QuoteDeleteOptions): Promise<void>;
  createDraft(today: string): Promise<Quote>;
}

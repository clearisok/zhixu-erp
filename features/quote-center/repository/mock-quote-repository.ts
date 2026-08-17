"use client";

import { quoteFixtures } from "../fixtures/quote-fixtures";
import { createQuoteDraft, type Quote } from "../model/quote-view-model";
import { loadBasicSettings } from "../../basic-settings/repository/basic-settings-repository";
import type { QuoteRepository } from "./quote-repository";

const STORAGE_KEY = "zhixu.quote-center.slice-1.2";
let memoryQuotes: Quote[] | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readQuotes(): Quote[] {
  if (memoryQuotes) return memoryQuotes;
  if (typeof window !== "undefined") {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { memoryQuotes = JSON.parse(stored) as Quote[]; } catch { memoryQuotes = null; }
    }
  }
  memoryQuotes = memoryQuotes ?? clone(quoteFixtures);
  return memoryQuotes;
}

function writeQuotes(quotes: Quote[]) {
  memoryQuotes = clone(quotes);
  if (typeof window !== "undefined") window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryQuotes));
}

export const mockQuoteRepository: QuoteRepository = {
  async list() {
    return clone(readQuotes());
  },
  async getById(id) {
    return clone(readQuotes().find((quote) => quote.id === id) ?? null);
  },
  async save(quote) {
    const quotes = readQuotes();
    const index = quotes.findIndex((item) => item.id === quote.id);
    if (index >= 0) quotes[index] = clone(quote);
    else quotes.unshift(clone(quote));
    writeQuotes(quotes);
  },
  async createDraft(today) {
    const suffix = String(readQuotes().length + 1).padStart(3, "0");
    const id = `quote-draft-${Date.now()}`;
    const defaults = loadBasicSettings().systemDefaults;
    const quote = createQuoteDraft(id, `QT-2026-0817-${suffix}`, today, defaults);
    await this.save(quote);
    return clone(quote);
  },
};

import type { QuoteRecord, ServerQuote } from "../../../server/quotes/model";

export type QuoteServerListItem = {
  id: string;
  quoteCode: string;
  defaultRevisionId: string;
  version: number;
  summary?: { quoteStyleNo: string; styleName: string; brandName: string; salespersonName: string; status: string; quoteType: string; quoteDate: string | null; revisionLabel: string; priceVersionCount: number };
};

export type QuoteServerPage = {
  limit: number;
  offset: number;
  count: number;
  total?: number;
};

export class QuoteServerError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "QuoteServerError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: { code?: string; message?: string } };
  if (!response.ok) {
    throw new QuoteServerError(
      response.status,
      payload.error?.code ?? "quote_request_failed",
      payload.error?.message ?? "Quote Server request failed",
    );
  }
  return payload;
}

export type QuoteServerClient = {
  list(query?: { limit?: number; offset?: number; search?: string; type?: string; status?: string }): Promise<{ quotes: QuoteServerListItem[]; page: QuoteServerPage }>;
  getById(quoteId: string): Promise<QuoteRecord>;
  create(): Promise<QuoteRecord>;
  save(quote: ServerQuote, expectedVersion: number): Promise<QuoteRecord>;
};

export function createQuoteServerClient(options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}): QuoteServerClient {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/u, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const request = async <T>(path: string, init?: RequestInit) => parseResponse<T>(await fetchImpl(`${baseUrl}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
  }));
  const mutation = (method: "POST" | "PUT", path: string, body: Record<string, unknown>) => request<{ quote: QuoteRecord }>(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1" },
    body: JSON.stringify(body),
  }).then((payload) => payload.quote);
  return {
    list(query = {}) {
      const params = new URLSearchParams();
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      if (query.offset !== undefined) params.set("offset", String(query.offset));
      for (const key of ["search", "type", "status"] as const) if (query[key]) params.set(key, query[key]);
      return request(`/api/v1/quotes${params.size ? `?${params}` : ""}`);
    },
    getById(quoteId) {
      return request<{ quote: QuoteRecord }>(`/api/v1/quotes/${encodeURIComponent(quoteId)}`).then((payload) => payload.quote);
    },
    create() {
      return mutation("POST", "/api/v1/quotes", {});
    },
    save(quote, expectedVersion) {
      return mutation("PUT", `/api/v1/quotes/${encodeURIComponent(quote.id)}`, { quote, expectedVersion });
    },
  };
}

export const quoteServerClient = createQuoteServerClient();

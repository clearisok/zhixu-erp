import type {
  ConfirmedCommercialTermsDto,
  UpdateConfirmedCommercialTermsInput,
} from "./model";

export class ConfirmedCommercialTermsServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConfirmedCommercialTermsServerError";
  }
}

export type ConfirmedCommercialTermsServerClient = {
  getBySalesOrder(salesOrderId: string): Promise<ConfirmedCommercialTermsDto>;
  updateBySalesOrder(salesOrderId: string, input: UpdateConfirmedCommercialTermsInput): Promise<ConfirmedCommercialTermsDto>;
  getByQuote(quoteId: string, revisionId: string, priceVersionId: string): Promise<ConfirmedCommercialTermsDto>;
  updateByQuote(quoteId: string, revisionId: string, priceVersionId: string, input: UpdateConfirmedCommercialTermsInput): Promise<ConfirmedCommercialTermsDto>;
};

async function parseResponse(response: Response): Promise<ConfirmedCommercialTermsDto> {
  const payload = await response.json() as {
    confirmedCommercialTerms?: ConfirmedCommercialTermsDto;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !payload.confirmedCommercialTerms) {
    throw new ConfirmedCommercialTermsServerError(
      response.status,
      payload.error?.code ?? "confirmed_commercial_terms_request_failed",
      payload.error?.message ?? "确认商业条款请求失败",
    );
  }
  return payload.confirmedCommercialTerms;
}

function quotePath(quoteId: string, revisionId: string, priceVersionId: string): string {
  return `/api/v1/quotes/${encodeURIComponent(quoteId)}/revisions/${encodeURIComponent(revisionId)}/price-versions/${encodeURIComponent(priceVersionId)}/confirmed-commercial-terms`;
}

export function createConfirmedCommercialTermsServerClient(options: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
} = {}): ConfirmedCommercialTermsServerClient {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/u, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const request = async (path: string, input?: UpdateConfirmedCommercialTermsInput) => parseResponse(await fetchImpl(`${baseUrl}${path}`, {
    method: input ? "PATCH" : "GET",
    credentials: "include",
    cache: "no-store",
    headers: input ? {
      "Content-Type": "application/json",
      "X-Zhixu-Request": "1",
    } : undefined,
    body: input ? JSON.stringify(input) : undefined,
  }));
  return {
    getBySalesOrder: (salesOrderId) => request(`/api/v1/sales-orders/${encodeURIComponent(salesOrderId)}/confirmed-commercial-terms`),
    updateBySalesOrder: (salesOrderId, input) => request(`/api/v1/sales-orders/${encodeURIComponent(salesOrderId)}/confirmed-commercial-terms`, input),
    getByQuote: (quoteId, revisionId, priceVersionId) => request(quotePath(quoteId, revisionId, priceVersionId)),
    updateByQuote: (quoteId, revisionId, priceVersionId, input) => request(quotePath(quoteId, revisionId, priceVersionId), input),
  };
}

export const confirmedCommercialTermsServerClient = createConfirmedCommercialTermsServerClient();

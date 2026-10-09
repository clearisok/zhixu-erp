import type {
  ConfirmedCommercialTermsDto,
  UpdateConfirmedCommercialTermsInput,
  UpdateQuoteConfirmedCommercialTermsInput,
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
  updateByQuote(quoteId: string, revisionId: string, priceVersionId: string, input: UpdateQuoteConfirmedCommercialTermsInput): Promise<ConfirmedCommercialTermsDto>;
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

function verifiedQuoteResponse(dto: ConfirmedCommercialTermsDto, quoteId: string, revisionId: string, priceVersionId: string) {
  const provenance = dto.quoteProvenance;
  if (!provenance || provenance.quoteId !== quoteId || provenance.revisionId !== revisionId || provenance.priceVersionId !== priceVersionId
    || !["linked", "unlinked"].includes(dto.linkage) || !Array.isArray(dto.associatedSalesOrderIds)
    || (dto.linkage === "linked" ? dto.scope !== "quote" || !dto.associatedSalesOrderIds.length : dto.scope !== null || dto.current !== null || dto.associatedSalesOrderIds.length !== 0)) {
    throw new ConfirmedCommercialTermsServerError(502, "confirmed_commercial_terms_provenance_mismatch", "共享条款响应来源不匹配；请显式核对");
  }
  return dto;
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
    getByQuote: async (quoteId, revisionId, priceVersionId) => verifiedQuoteResponse(await request(quotePath(quoteId, revisionId, priceVersionId)), quoteId, revisionId, priceVersionId),
    updateByQuote: async (quoteId, revisionId, priceVersionId, input) => verifiedQuoteResponse(await request(quotePath(quoteId, revisionId, priceVersionId), input), quoteId, revisionId, priceVersionId),
  };
}

export const confirmedCommercialTermsServerClient = createConfirmedCommercialTermsServerClient();

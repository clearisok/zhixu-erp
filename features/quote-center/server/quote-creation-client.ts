import type { CreationInput, CreationCommand, CreationReceipt } from "../../../server/quotes/creation-contract";
import type { CreationOptions, CreationPreview } from "../../../server/quotes/creation-workflows";
import type { CreationOrderContext, CreationOrderSelection } from "../../../server/quotes/creation-order-context";
import { QuoteServerError } from "./quote-server-client";

export function createQuoteCreationClient(fetchImpl: typeof fetch = fetch) {
  const request = async <T>(path: string, input?: unknown): Promise<T> => {
    const response = await fetchImpl(`/api/v1/quotes/${path}`, { credentials: "include", cache: "no-store", ...(input === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1" }, body: JSON.stringify(input) }) });
    const body = await response.json();
    if (!response.ok) throw new QuoteServerError(response.status, body.error?.code ?? "creation_failed", "创建未确认，请保留输入并核对结果。");
    return body as T;
  };
  return {
    defaults: (clientRequestId: string, orderContext?: CreationOrderSelection) => request<CreationReceipt>("creation-defaults", {clientRequestId,...(orderContext?{orderContext}:{})}),
    orderContext: (orderId: string) => request<CreationOrderContext>(`creation-order-context/${encodeURIComponent(orderId)}`),
    origin: (quoteId: string) => request<{context: CreationOrderContext | null}>(`${encodeURIComponent(quoteId)}/creation-origin`),
    options: (search = "") => request<CreationOptions>(`creation-options?search=${encodeURIComponent(search)}`),
    preview: (input: CreationInput) => request<CreationPreview>("creation-preview", input),
    execute: (input: CreationCommand) => request<CreationReceipt>("creation-workflows", input),
    receipt: (requestId: string) => request<CreationReceipt>(`creation-receipts/${encodeURIComponent(requestId)}`),
  };
}
export const quoteCreationClient = createQuoteCreationClient();

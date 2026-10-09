import type { AttachmentKind } from "../model/quote-attachments";

export type ServerAttachment = {
  id: string; name: string; originalName: string; mimeType: string; size: number;
  sha256: string; kind: AttachmentKind; createdAt: string; createdBy: string;
  position: number; isStyleImage: boolean;
};

export class QuoteAttachmentServerError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`${code} (HTTP ${status})`);
    this.name = "QuoteAttachmentServerError";
  }
}

export class QuoteAttachmentTransportError extends Error {
  constructor() { super("Attachment request outcome is unknown; refresh before another command."); this.name = "QuoteAttachmentTransportError"; }
}

async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  let code = "attachment_request_failed";
  try {
    const payload = await response.json() as { error?: { code?: string } };
    if (typeof payload.error?.code === "string") code = payload.error.code;
  } catch { /* Keep a safe generic code. */ }
  throw new QuoteAttachmentServerError(response.status, code);
}

export function createQuoteAttachmentClient(options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/u, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const scope = (quoteId: string, revisionId: string) => `${baseUrl}/api/v1/quotes/${encodeURIComponent(quoteId)}/revisions/${encodeURIComponent(revisionId)}/attachments`;
  const request = async (url: string, init?: RequestInit) => {
    try { return await checked(await fetchImpl(url, { credentials: "include", cache: "no-store", ...init })); }
    catch (error) { if (error instanceof QuoteAttachmentServerError) throw error; throw new QuoteAttachmentTransportError(); }
  };
  const json = async <T>(url: string, method: string, body: Record<string, unknown>): Promise<T> =>
    (await request(url, { method, headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1" }, body: JSON.stringify(body) })).json() as Promise<T>;
  return {
    async list(quoteId: string, revisionId: string) {
      return (await (await request(scope(quoteId, revisionId))).json() as { attachments: ServerAttachment[] }).attachments;
    },
    async read(quoteId: string, revisionId: string, attachmentId: string) {
      return (await (await request(`${scope(quoteId, revisionId)}/${encodeURIComponent(attachmentId)}`)).json() as { attachment: ServerAttachment }).attachment;
    },
    async download(quoteId: string, revisionId: string, attachmentId: string, signal?: AbortSignal, maxBytes?: number) {
      const response = await request(`${scope(quoteId, revisionId)}/${encodeURIComponent(attachmentId)}/download`, { signal });
      if (maxBytes === undefined) return response.blob();
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !response.body) throw new QuoteAttachmentTransportError();
      const reader = response.body.getReader(), chunks: BlobPart[] = [];
      let size = 0;
      try {
        if (Number(response.headers.get("content-length")) > maxBytes) throw new QuoteAttachmentTransportError();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new QuoteAttachmentTransportError();
          chunks.push(value);
        }
        return new Blob(chunks, { type: response.headers.get("content-type") ?? "" });
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    },
    async upload(quoteId: string, revisionId: string, expectedVersion: number, file: File, kind: AttachmentKind, token: string) {
      const url = `${scope(quoteId, revisionId)}?${new URLSearchParams({ name: file.name, kind })}`;
      return await (await request(url, { method: "POST", headers: { "Content-Type": file.type, "X-Zhixu-Request": "1", "X-Quote-Version": String(expectedVersion), "Idempotency-Key": token }, body: file })).json() as { attachment: ServerAttachment; version: number; replayed: boolean };
    },
    rename(quoteId: string, revisionId: string, attachmentId: string, expectedVersion: number, name: string) {
      return json<{ result: { id: string; name: string }; version: number }>(`${scope(quoteId, revisionId)}/${encodeURIComponent(attachmentId)}`, "PATCH", { expectedVersion, name });
    },
    link(quoteId: string, revisionId: string, attachmentId: string, expectedVersion: number) {
      return json<{ result: { attachmentId: string }; version: number }>(`${scope(quoteId, revisionId)}/${encodeURIComponent(attachmentId)}/link`, "POST", { expectedVersion });
    },
    unlink(quoteId: string, revisionId: string, attachmentId: string, expectedVersion: number) {
      return json<{ result: { attachmentId: string }; version: number }>(`${scope(quoteId, revisionId)}/${encodeURIComponent(attachmentId)}`, "DELETE", { expectedVersion });
    },
    style(quoteId: string, revisionId: string, expectedVersion: number, attachmentId: string | null) {
      return json<{ result: { styleImageAttachmentId: string | null }; version: number }>(`${scope(quoteId, revisionId)}/style-image`, "PUT", { expectedVersion, attachmentId });
    },
  };
}

export const quoteAttachmentClient = createQuoteAttachmentClient();

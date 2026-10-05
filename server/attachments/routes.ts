import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import type { Pool } from "pg";
import type { IdentityAuthority } from "../auth/identity-authority.js";
import { requirePermission } from "../auth/permissions.js";
import { HttpError } from "../http/errors.js";
import { assertMutationBoundary, readBinaryBody, readJsonBody } from "../http/request.js";
import { sendJson } from "../http/responses.js";
import { createAttachmentService } from "./service.js";
import type { AttachmentStorage } from "./storage.js";

type Dependencies = { pool: Pool; identityAuthority: IdentityAuthority; allowedOrigins: readonly string[]; attachmentStorage?: AttachmentStorage };
const MAX_BYTES = 100 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function id(raw: string, label: string, isUuid = false): string {
  let value: string;
  try { value = decodeURIComponent(raw).normalize("NFKC").trim(); }
  catch { throw new HttpError(400, "invalid_attachment_path", `${label} is invalid`); }
  if (!value || value.length > 256 || (isUuid && !uuid.test(value))) throw new HttpError(400, "invalid_attachment_path", `${label} is invalid`);
  return value;
}
function version(raw: unknown): number {
  const value = typeof raw === "string" && /^\d+$/u.test(raw) ? Number(raw) : raw;
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new HttpError(400, "invalid_quote_version", "expectedVersion is required");
  return value as number;
}
function exact(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some((key) => !keys.includes(key)) || keys.some((key) => !(key in body)))
    throw new HttpError(400, "invalid_attachment_request", "Request fields are invalid");
}
export async function routeQuoteAttachments(request: IncomingMessage, response: ServerResponse, dependencies: Dependencies): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  const match = /^\/api\/v1\/quotes\/([^/]+)\/revisions\/([^/]+)\/attachments(?:\/(style-image)|\/([^/]+)(?:\/(download|link))?)?$/.exec(path);
  if (!match) return false;
  const mutation = request.method !== "GET";
  if (mutation) assertMutationBoundary(request, dependencies.allowedOrigins);
  const actor = await dependencies.identityAuthority.resolve(request);
  if (!actor) throw new HttpError(401, "authentication_required", "Authentication is required");
  requirePermission(actor.permissions, mutation ? "quote.edit" : "quote.view");
  if (!dependencies.attachmentStorage) throw new HttpError(503, "attachment_storage_not_configured", "Attachment storage is not configured");
  const service = createAttachmentService(dependencies.pool, dependencies.attachmentStorage);
  const quoteId = id(match[1], "quoteId");
  const revisionId = id(match[2], "revisionId");
  const attachmentId = match[4] ? id(match[4], "attachmentId", true) : null;
  const command = match[3] ?? match[5] ?? null;
  if (request.method === "GET" && !attachmentId && !command) {
    if (url.search) throw new HttpError(400, "invalid_attachment_query", "Query is not supported");
    sendJson(response, 200, { attachments: await service.list(actor, quoteId, revisionId) }); return true;
  }
  if (request.method === "POST" && !attachmentId && !command) {
    if ([...url.searchParams.keys()].some((key) => key !== "name" && key !== "kind")) throw new HttpError(400, "invalid_attachment_query", "Query is invalid");
    const result = await service.upload(actor, quoteId, revisionId, version(request.headers["x-quote-version"]), {
      name: url.searchParams.get("name"), kind: url.searchParams.get("kind"),
      mimeType: request.headers["content-type"]?.split(";", 1)[0],
      uploadToken: request.headers["idempotency-key"], bytes: await readBinaryBody(request, MAX_BYTES),
    });
    sendJson(response, result.replayed ? 200 : 201, result); return true;
  }
  if (request.method === "GET" && attachmentId && !command) {
    const found = await service.read(actor, quoteId, revisionId, attachmentId);
    sendJson(response, 200, { attachment: found.attachment }); return true;
  }
  if (request.method === "GET" && attachmentId && command === "download") {
    const found = await service.download(actor, quoteId, revisionId, attachmentId);
    response.statusCode = 200;
    response.setHeader("Content-Type", found.attachment.mimeType);
    response.setHeader("Content-Length", found.attachment.size);
    response.setHeader("Content-Disposition", `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(found.attachment.name)}`);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(found.stream, response); return true;
  }
  if (request.method === "PATCH" && attachmentId && !command) {
    const body = await readJsonBody(request); exact(body, ["expectedVersion", "name"]);
    sendJson(response, 200, await service.rename(actor, quoteId, revisionId, attachmentId, version(body.expectedVersion), body.name)); return true;
  }
  if (request.method === "POST" && attachmentId && command === "link") {
    const body = await readJsonBody(request); exact(body, ["expectedVersion"]);
    sendJson(response, 200, await service.link(actor, quoteId, revisionId, attachmentId, version(body.expectedVersion))); return true;
  }
  if (request.method === "DELETE" && attachmentId && !command) {
    const body = await readJsonBody(request); exact(body, ["expectedVersion"]);
    sendJson(response, 200, await service.unlink(actor, quoteId, revisionId, attachmentId, version(body.expectedVersion))); return true;
  }
  if (request.method === "PUT" && command === "style-image") {
    const body = await readJsonBody(request); exact(body, ["expectedVersion", "attachmentId"]);
    if (body.attachmentId !== null && (typeof body.attachmentId !== "string" || !uuid.test(body.attachmentId)))
      throw new HttpError(400, "invalid_attachment_identity", "attachmentId is invalid");
    sendJson(response, 200, await service.style(actor, quoteId, revisionId, body.attachmentId, version(body.expectedVersion))); return true;
  }
  throw new HttpError(405, "method_not_allowed", "Method is not supported");
}

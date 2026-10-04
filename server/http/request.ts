import type { IncomingMessage } from "node:http";
import { HttpError } from "./errors.js";

const MAX_JSON_BODY_BYTES = 32 * 1024;

export async function readJsonBody(request: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<Record<string, unknown>> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new HttpError(413, "payload_too_large", "Request body is too large");
    }
    chunks.push(buffer);
  }

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be a JSON object");
  }
}

export async function readBinaryBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "payload_too_large", "Request body is too large");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new HttpError(413, "payload_too_large", "Request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}

export function assertMutationBoundary(request: IncomingMessage, allowedOrigins: readonly string[]): void {
  if (request.headers["x-zhixu-request"] !== "1") {
    throw new HttpError(403, "request_boundary_required", "Trusted request header is required");
  }
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new HttpError(403, "origin_not_allowed", "Request origin is not allowed");
  }
}

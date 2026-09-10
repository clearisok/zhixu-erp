import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

export type ErrorPayload = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

export function requestId(): string {
  return randomUUID();
}

export function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

export function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  correlationId: string,
): void {
  sendJson(response, status, { error: { code, message, requestId: correlationId } } satisfies ErrorPayload);
}

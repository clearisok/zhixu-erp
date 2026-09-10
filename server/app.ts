import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { requestId, sendError, sendJson } from "./http/responses.js";

export type ServerLogger = {
  error(event: Record<string, unknown>): void;
};

export type AppDependencies = {
  pool: Pool;
  logger?: ServerLogger;
};

const defaultLogger: ServerLogger = {
  error(event) {
    process.stderr.write(`${JSON.stringify(event)}\n`);
  },
};

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: Required<AppDependencies>,
  correlationId: string,
): Promise<void> {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method === "GET" && path === "/api/v1/health") {
    try {
      await dependencies.pool.query("SELECT 1");
      sendJson(response, 200, { status: "ok", database: "ready" });
    } catch {
      dependencies.logger.error({
        event: "database_healthcheck_failed",
        requestId: correlationId,
      });
      sendError(response, 503, "database_unavailable", "Database is unavailable", correlationId);
    }
    return;
  }

  sendError(response, 404, "not_found", "Route not found", correlationId);
}

export function createApp(dependencies: AppDependencies): RequestListener {
  const resolved: Required<AppDependencies> = {
    ...dependencies,
    logger: dependencies.logger ?? defaultLogger,
  };
  return (request, response) => {
    const correlationId = requestId();
    response.setHeader("X-Request-Id", correlationId);
    void route(request, response, resolved, correlationId).catch(() => {
      resolved.logger.error({ event: "unhandled_request_error", requestId: correlationId });
      if (!response.headersSent) {
        sendError(response, 500, "internal_error", "Internal server error", correlationId);
      } else {
        response.destroy();
      }
    });
  };
}

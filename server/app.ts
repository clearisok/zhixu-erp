import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { authenticate, login, revokeSession, sessionCookie, type SessionSecurityConfig, type TrustedIdentity } from "./auth/session.js";
import { requirePermission } from "./auth/permissions.js";
import { HttpError } from "./http/errors.js";
import { assertMutationBoundary, readJsonBody } from "./http/request.js";
import { requestId, sendError, sendJson } from "./http/responses.js";
import { listOperationLogs } from "./operation-logs/repository.js";
import { getSalesOrderById, listSalesOrders } from "./sales-orders/repository.js";
import type { SalesOrderCreationSource, SalesOrderLifecycleState } from "./sales-orders/model.js";
import { serveStatic } from "./static-files.js";

export type ServerLogger = {
  error(event: Record<string, unknown>): void;
};

export type AppDependencies = {
  pool: Pool;
  logger?: ServerLogger;
  allowedOrigins?: readonly string[];
  security?: SessionSecurityConfig;
  staticDirectory?: string;
};

const defaultLogger: ServerLogger = {
  error(event) {
    process.stderr.write(`${JSON.stringify(event)}\n`);
  },
};

const SALES_ORDER_LIST_DEFAULT_LIMIT = 100;
const SALES_ORDER_LIST_MAX_LIMIT = 200;
const salesOrderLifecycleStates = new Set<SalesOrderLifecycleState>(["draft", "confirmed", "active", "completed", "cancelled"]);
const salesOrderCreationSources = new Set<SalesOrderCreationSource>(["quote", "reorder", "manual", "ainuoke"]);
const salesOrderSortFields = new Set<string>(["orderNo", "updatedAt", "contractDeliveryDate", "salesContractNo"]);

function integerQuery(value: string | null, fallback: number, label: string, minimum: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new HttpError(400, "invalid_sales_order_list_query", `${label} is invalid`);
  }
  return parsed;
}

function salesOrderListQuery(requestUrl: string | undefined) {
  const params = new URL(requestUrl ?? "/", "http://localhost").searchParams;
  const limit = integerQuery(params.get("limit"), SALES_ORDER_LIST_DEFAULT_LIMIT, "limit", 1);
  if (limit > SALES_ORDER_LIST_MAX_LIMIT) {
    throw new HttpError(400, "invalid_sales_order_list_query", `limit cannot exceed ${SALES_ORDER_LIST_MAX_LIMIT}`);
  }
  const offset = integerQuery(params.get("offset"), 0, "offset", 0);
  const search = params.get("search")?.normalize("NFKC").trim() || undefined;
  if (search && search.length > 200) {
    throw new HttpError(400, "invalid_sales_order_list_query", "search cannot exceed 200 characters");
  }
  const lifecycleState = params.get("lifecycleState") || undefined;
  const creationSource = params.get("creationSource") || undefined;
  const sortBy = params.get("sortBy") || "orderNo";
  const sortDirection = params.get("sortDirection") || "asc";
  if (lifecycleState && !salesOrderLifecycleStates.has(lifecycleState as SalesOrderLifecycleState)) {
    throw new HttpError(400, "invalid_sales_order_list_query", "lifecycleState is invalid");
  }
  if (creationSource && !salesOrderCreationSources.has(creationSource as SalesOrderCreationSource)) {
    throw new HttpError(400, "invalid_sales_order_list_query", "creationSource is invalid");
  }
  if (!salesOrderSortFields.has(sortBy)
    || (sortDirection !== "asc" && sortDirection !== "desc")) {
    throw new HttpError(400, "invalid_sales_order_list_query", "sort is invalid");
  }
  return {
    limit,
    offset,
    search,
    lifecycleState: lifecycleState as SalesOrderLifecycleState | undefined,
    creationSource: creationSource as SalesOrderCreationSource | undefined,
    sortBy: sortBy as "orderNo" | "updatedAt" | "contractDeliveryDate" | "salesContractNo",
    sortDirection: sortDirection as "asc" | "desc",
  };
}

function publicIdentity(identity: TrustedIdentity): {
  id: string;
  username: string;
  name: string;
} {
  return { id: identity.userId, username: identity.username, name: identity.userName };
}

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

  if (request.method === "POST" && path === "/api/v1/auth/login") {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const body = await readJsonBody(request);
    const result = await login(dependencies.pool, body.username, body.password, dependencies.security);
    response.setHeader("Set-Cookie", sessionCookie(result.token, dependencies.security));
    sendJson(response, 200, {
      user: publicIdentity(result.identity),
      permissions: result.identity.permissions,
    });
    return;
  }

  if (request.method === "POST" && path === "/api/v1/auth/logout") {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await authenticate(dependencies.pool, request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    await revokeSession(dependencies.pool, request);
    response.setHeader("Set-Cookie", sessionCookie(null, dependencies.security));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && (path === "/api/v1/auth/me" || path === "/api/v1/auth/permissions")) {
    const identity = await authenticate(dependencies.pool, request);
    if (!identity) {
      response.setHeader("Set-Cookie", sessionCookie(null, dependencies.security));
      throw new HttpError(401, "authentication_required", "Authentication is required");
    }
    sendJson(
      response,
      200,
      path.endsWith("/permissions")
        ? { permissions: identity.permissions }
        : { user: publicIdentity(identity) },
    );
    return;
  }

  if (request.method === "GET" && path === "/api/v1/operation-logs") {
    const identity = await authenticate(dependencies.pool, request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, "audit_log.view");
    const limit = Number.parseInt(new URL(request.url ?? "/", "http://localhost").searchParams.get("limit") ?? "100", 10);
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new HttpError(400, "invalid_limit", "limit must be a positive integer");
    }
    sendJson(response, 200, { operationLogs: await listOperationLogs(dependencies.pool, limit) });
    return;
  }

  if (request.method === "GET" && path === "/api/v1/sales-orders") {
    const identity = await authenticate(dependencies.pool, request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, "order.view");
    const query = salesOrderListQuery(request.url);
    const result = await listSalesOrders(dependencies.pool, query);
    sendJson(response, 200, {
      salesOrders: result.items,
      page: {
        limit: query.limit,
        offset: query.offset,
        total: result.total,
        hasMore: query.offset + result.items.length < result.total,
      },
    });
    return;
  }

  const salesOrderMatch = /^\/api\/v1\/sales-orders\/([^/]+)$/.exec(path);
  if (request.method === "GET" && salesOrderMatch) {
    const identity = await authenticate(dependencies.pool, request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, "order.view");
    const salesOrder = await getSalesOrderById(dependencies.pool, decodeURIComponent(salesOrderMatch[1]));
    if (!salesOrder) throw new HttpError(404, "sales_order_not_found", "SalesOrder was not found");
    sendJson(response, 200, { salesOrder });
    return;
  }

  if (!path.startsWith("/api/") && dependencies.staticDirectory) {
    if (await serveStatic(request, response, dependencies.staticDirectory)) return;
  }

  sendError(response, 404, "not_found", "Route not found", correlationId);
}

export function createApp(dependencies: AppDependencies): RequestListener {
  const resolved: Required<AppDependencies> = {
    ...dependencies,
    logger: dependencies.logger ?? defaultLogger,
    allowedOrigins: dependencies.allowedOrigins ?? ["http://127.0.0.1:3001"],
    security: dependencies.security ?? { secureCookies: false, sessionTtlSeconds: 43_200 },
    staticDirectory: dependencies.staticDirectory ?? "",
  };
  return (request, response) => {
    const correlationId = requestId();
    response.setHeader("X-Request-Id", correlationId);
    void route(request, response, resolved, correlationId).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendError(response, error.status, error.code, error.message, correlationId);
        return;
      }
      resolved.logger.error({
        event: "unhandled_request_error",
        requestId: correlationId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      if (!response.headersSent) {
        sendError(response, 500, "internal_error", "Internal server error", correlationId);
      } else {
        response.destroy();
      }
    });
  };
}

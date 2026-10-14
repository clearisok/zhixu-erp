import {readOrderCommercialState,previewOrderCommercial,adoptOrderCommercial} from './sales-orders/commercial-version-service.js';
import {parseCommercialProvenance} from './sales-orders/commercial-source.js';
import {projectOrderCommercialState,projectOrderCommercialVersion,projectCommercialCandidate} from './sales-orders/commercial-projection.js';
import { readOrderIdentity, mutateOrderIdentity, createOrderPreparation, listOrderPreparations, listClaimants } from "./sales-orders/identity-service.js";
import { createOrderMaterialReader, type MaterialReadPorts } from '../features/ainuoke-material-progress/read-service.js';
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { listQuoteSummaries } from "./quotes/list-summary.js";
import { parseBusinessColumns } from "./quotes/business-source.js";
import { createInternalSummaryService, parseInternalSummary } from "./quotes/internal-summary.js";
import { login, revokeSession, sessionCookie, type SessionSecurityConfig, type TrustedIdentity } from "./auth/session.js";
import { createIdentityAuthority, type IdentityAuthority } from "./auth/identity-authority.js";
import { requirePermission } from "./auth/permissions.js";
import { HttpError } from "./http/errors.js";
import { assertMutationBoundary, readJsonBody } from "./http/request.js";
import { requestId, sendError, sendJson } from "./http/responses.js";
import { queryOperationLogs } from "./operation-logs/repository.js";
import { parseOperationLogQuery } from "./operation-logs/query.js";
import type { UpdateConfirmedCommercialTermsInput, UpdateQuoteConfirmedCommercialTermsInput } from "../features/confirmed-commercial-terms/model.js";
import { projectCommercialTerms } from "./confirmed-commercial-terms/read-projection.js";
import {
  isConfirmedLaborCurrency,
  readConfirmedCommercialTermsByQuote,
  readConfirmedCommercialTermsBySalesOrder,
  updateConfirmedCommercialTermsByQuote,
  updateConfirmedCommercialTermsBySalesOrder,
} from "./confirmed-commercial-terms/service.js";
import { getSalesOrderById, listSalesOrders } from "./sales-orders/repository.js";
import type { SalesOrderCreationSource, SalesOrderLifecycleState } from "./sales-orders/model.js";
import { readDeliveryPlanSet } from "./sales-orders/delivery-plan-repository.js";
import { updateDeliveryPlans } from "./sales-orders/delivery-plan-service.js";
import { UUID_PATTERN } from "./sales-orders/delivery-plan-model.js";
import { QuoteConflictError, QuoteInvariantError } from "./quotes/model.js";
import { createTrustedQuoteService } from "./quotes/service.js";
import { createQuoteCreationService } from "./quotes/creation-workflows.js";
import { creationId, parseCreationInput, parseCreationCommand } from "./quotes/creation-contract.js";
import { parseQuoteVersionCommand } from "./quotes/version-workflows.js";
import { parseQuoteConfirmationCommand } from "./quotes/confirmation-workflows.js";
import { createCustomerExportService, parseCustomerExport } from "./quotes/customer-export.js";
import { generateCustomerBatch, parseCustomerBatch } from "./quotes/customer-batch-export.js";
import { parseEstimateCommand } from "./quotes/estimate-workflows.js";
import { routeQuoteMasters } from "./quote-masters/routes.js";
import { routeQuoteAttachments } from "./attachments/routes.js";
import type { AttachmentStorage } from "./attachments/storage.js";
import { serveStatic } from "./static-files.js";
import { routeTeamAccess } from "./auth/team-access-routes.js";

export type ServerLogger = {
  error(event: Record<string, unknown>): void;
};

export type AppDependencies = {
  pool: Pool;
  logger?: ServerLogger;
  allowedOrigins?: readonly string[];
  security?: SessionSecurityConfig;
  staticDirectory?: string;
  identityAuthority?: IdentityAuthority;
  attachmentStorage?: AttachmentStorage;
  orderMaterialRead?: MaterialReadPorts;
};
type ResolvedAppDependencies = Required<Omit<AppDependencies, "attachmentStorage" | "orderMaterialRead">> & Pick<AppDependencies, "attachmentStorage" | "orderMaterialRead">;

const defaultLogger: ServerLogger = {
  error(event) {
    process.stderr.write(`${JSON.stringify(event)}\n`);
  },
};

const SALES_ORDER_LIST_DEFAULT_LIMIT = 100;
const SALES_ORDER_LIST_MAX_LIMIT = 200;
const QUOTE_LIST_DEFAULT_LIMIT = 50;
const QUOTE_LIST_MAX_LIMIT = 100;
const QUOTE_AGGREGATE_MAX_BODY_BYTES = 2 * 1024 * 1024;
const salesOrderLifecycleStates = new Set<SalesOrderLifecycleState>(["draft", "confirmed", "active", "completed", "cancelled"]);
const salesOrderCreationSources = new Set<SalesOrderCreationSource>(["quote", "reorder", "manual", "ainuoke"]);
const salesOrderSortFields = new Set<string>(["orderNo", "updatedAt", "contractDeliveryDate", "salesContractNo"]);
const commercialTermsInputKeys = new Set([
  "expectedVersion",
  "customerConfirmedPrice",
  "confirmedLaborPrice",
  "laborCurrency",
]);
const quoteSaveInputKeys = new Set(["quote", "expectedVersion"]);

function commercialAmount(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 128 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    throw new HttpError(400, "invalid_confirmed_commercial_terms", `${label} must be a non-negative decimal string or null`);
  }
  return value;
}

function confirmedCommercialTermsInput(body: Record<string, unknown>, quoteSurface = false): UpdateConfirmedCommercialTermsInput {
  if (Object.keys(body).some((key) => !commercialTermsInputKeys.has(key) && !(quoteSurface && key === "expectedQuoteVersion"))) {
    throw new HttpError(400, "invalid_confirmed_commercial_terms", "Request contains unsupported fields");
  }
  if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0) {
    throw new HttpError(400, "invalid_confirmed_commercial_terms", "expectedVersion must be a non-negative integer");
  }
  const customerConfirmedPrice = Object.hasOwn(body,"customerConfirmedPrice") ? commercialAmount(body.customerConfirmedPrice, "customerConfirmedPrice") : undefined;
  const confirmedLaborPrice = Object.hasOwn(body,"confirmedLaborPrice") ? commercialAmount(body.confirmedLaborPrice, "confirmedLaborPrice") : undefined;
  const laborCurrency = body.laborCurrency;
  if (Object.hasOwn(body,"laborCurrency") && laborCurrency !== null && !isConfirmedLaborCurrency(laborCurrency)) {
    throw new HttpError(400, "invalid_confirmed_commercial_terms", "laborCurrency must be CNY, USD, or null");
  }
  if (confirmedLaborPrice !== undefined && confirmedLaborPrice !== null && laborCurrency === null) {
    throw new HttpError(400, "invalid_confirmed_commercial_terms", "laborCurrency is required when confirmedLaborPrice is present");
  }
  return {
    ...(quoteSurface ? { expectedQuoteVersion: body.expectedQuoteVersion } : {}),
    expectedVersion: body.expectedVersion as number,
    ...(customerConfirmedPrice !== undefined ? {customerConfirmedPrice} : {}),
    ...(confirmedLaborPrice !== undefined ? {confirmedLaborPrice} : {}),
    ...(Object.hasOwn(body,"laborCurrency") ? {laborCurrency: laborCurrency as "CNY"|"USD"|null} : {}),
  };
}

function requiredPathIdentity(value: string, label: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value).normalize("NFKC").trim();
  } catch {
    throw new HttpError(400, "invalid_quote_provenance", `${label} is invalid`);
  }
  if (!decoded || decoded.length > 256) {
    throw new HttpError(400, "invalid_quote_provenance", `${label} is invalid`);
  }
  return decoded;
}

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

function quoteListQuery(requestUrl: string | undefined) {
  const params = new URL(requestUrl ?? "/", "http://localhost").searchParams;
  if ([...params.keys()].some((key) => !["limit", "offset", "search", "type", "status", "columns"].includes(key) || params.getAll(key).length !== 1)) {
    throw new HttpError(400, "invalid_quote_list_query", "Quote list query contains unsupported fields");
  }
  const parse = (key: "limit" | "offset", fallback: number, minimum: number) => {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^\d+$/u.test(value)) throw new HttpError(400, "invalid_quote_list_query", `${key} is invalid`);
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < minimum) throw new HttpError(400, "invalid_quote_list_query", `${key} is invalid`);
    return result;
  };
  const limit = parse("limit", QUOTE_LIST_DEFAULT_LIMIT, 1);
  if (limit > QUOTE_LIST_MAX_LIMIT) throw new HttpError(400, "invalid_quote_list_query", `limit cannot exceed ${QUOTE_LIST_MAX_LIMIT}`);
  const search = params.get("search") ?? "";
  const type = params.get("type") ?? undefined;
  const status = params.get("status") ?? undefined;
  if (search.length > 200 || (type && !["processing", "distribution"].includes(type)) || (status && !["draft", "quoting", "partially_confirmed", "confirmed"].includes(status))) throw new HttpError(400, "invalid_quote_list_query", "Quote filters are invalid");
  const rawColumns = params.get("columns");
  if (rawColumns !== null && rawColumns.length > 400) throw new HttpError(400, "invalid_quote_columns", "Column selection is too long");
  return { limit, offset: parse("offset", 0, 0), search, type, status, ...(rawColumns !== null ? { columns: parseBusinessColumns(rawColumns.split(",")) } : {}) };
}

function quoteBody(body: Record<string, unknown>): { quote: import("./quotes/quote-response.js").QuoteSaveContent; expectedVersion: number } {
  if (Object.keys(body).some((key) => !quoteSaveInputKeys.has(key))) {
    throw new HttpError(400, "invalid_quote_request", "Request contains unsupported fields");
  }
  if (!body.quote || typeof body.quote !== "object" || Array.isArray(body.quote)) {
    throw new HttpError(400, "invalid_quote_request", "quote must be an object");
  }
  const authorityKeys = new Set(["actor", "actorUserId", "internalUserId", "userId", "role", "permissions", "estimateVisibility", "costVisibility"]);
  const containsAuthorityField = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(containsAuthorityField);
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, nested]) => authorityKeys.has(key) || containsAuthorityField(nested));
  };
  if (containsAuthorityField(body.quote)) {
    throw new HttpError(400, "invalid_quote_request", "Quote aggregate contains unsupported authority fields");
  }
  if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) {
    throw new HttpError(400, "invalid_quote_request", "expectedVersion must be a positive integer");
  }
  // Validation of the complete domain entity happens after the trusted service
  // merges the current protected Estimate slice. This input is not a DB row.
  return { quote: body.quote as import("./quotes/quote-response.js").QuoteSaveContent, expectedVersion: body.expectedVersion as number };
}

function asQuoteHttpError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof QuoteConflictError) throw new HttpError(409, "quote_version_conflict", "Quote version is stale");
  if (error instanceof QuoteInvariantError) {
    if (/Quote code immutable/i.test(error.message)) {
      throw new HttpError(409, "quote_code_immutable", "Quote business number is immutable");
    }
    const immutable = /immutable|Historical|removal\/reordering|Frozen|Previous estimate|structure/i.test(error.message);
    throw new HttpError(immutable ? 409 : 400, immutable ? "quote_immutable_history" : "invalid_quote", immutable ? "Quote history is immutable" : "Quote aggregate is invalid");
  }
  if ((error as { code?: string } | null)?.code === "23505") {
    throw new HttpError(409, "quote_already_exists", "Quote already exists");
  }
  if ((error as { code?: string; constraint?: string } | null)?.code === "23514"
      && (error as { constraint?: string }).constraint === "quote_center_quote_code_immutable") {
    throw new HttpError(409, "quote_code_immutable", "Quote business number is immutable");
  }
  throw error;
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
  dependencies: ResolvedAppDependencies,
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
    if (dependencies.identityAuthority.mode === "local-single-user") throw new HttpError(404, "not_found", "Route not found");
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
    if (dependencies.identityAuthority.mode === "local-single-user") throw new HttpError(404, "not_found", "Route not found");
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    await revokeSession(dependencies.pool, request);
    response.setHeader("Set-Cookie", sessionCookie(null, dependencies.security));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && (path === "/api/v1/auth/me" || path === "/api/v1/auth/permissions")) {
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) {
      if (dependencies.identityAuthority.mode === "session") response.setHeader("Set-Cookie", sessionCookie(null, dependencies.security));
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
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, "audit_log.view");
    const query = parseOperationLogQuery(new URL(request.url ?? "/", "http://localhost").searchParams);
    if (query.quoteId) {
      requirePermission(identity.permissions,"quote.view");
      if (!await createTrustedQuoteService(dependencies.pool).getById(query.quoteId)) throw new HttpError(404,"quote_not_found","Quote not found");
    }
    const result=await queryOperationLogs(dependencies.pool,query,identity);
    sendJson(response, 200, {...result,operationLogs:result.logs});
    return;
  }

  if (await routeQuoteMasters(request, response, dependencies, correlationId)) return;
  if (await routeTeamAccess(request, response, dependencies)) return;
  const creationReceipt = /^\/api\/v1\/quotes\/creation-receipts\/([^/]+)$/.exec(path);
  if ((request.method === "GET" && (path === "/api/v1/quotes/creation-options" || creationReceipt))
    || (request.method === "POST" && ["/api/v1/quotes/creation-preview", "/api/v1/quotes/creation-workflows", "/api/v1/quotes/creation-defaults"].includes(path))) {
    if (request.method === "POST") assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    const creation = createQuoteCreationService(dependencies.pool, dependencies.identityAuthority.mode);
    if (creationReceipt) sendJson(response, 200, await creation.receipt(identity, creationId(creationReceipt[1])));
    else if (path === "/api/v1/quotes/creation-defaults") {
      const body = await readJsonBody(request, 1024);
      if(Object.keys(body).length!==1 || !("clientRequestId" in body)) throw new HttpError(400,"invalid_creation_input","Only clientRequestId is accepted");
      const id=creationId(body.clientRequestId);
      const result=await creation.executeDefaults(identity,id,{requestId:correlationId,method:request.method,path});
      sendJson(response,result.replayed?200:201,{receiptId:id,...result.receipt});
    }
    else if (request.method === "GET") {
      const search = new URL(request.url!, "http://local").searchParams.get("search") ?? "";
      if (search.length > 200) throw new HttpError(400, "invalid_creation_input", "Search is too long");
      sendJson(response, 200, await creation.options(identity, search));
    } else if (path.endsWith("creation-preview")) sendJson(response, 200, await creation.preview(identity, parseCreationInput(await readJsonBody(request, 16_384))));
    else {
      const command = parseCreationCommand(await readJsonBody(request, 16_384));
      const result = await creation.execute(identity, command, { requestId: correlationId, method: request.method, path });
      sendJson(response, result.replayed ? 200 : 201, { receiptId: command.clientRequestId, ...result.receipt });
    }
    return;
  }
  if (await routeQuoteAttachments(request, response, dependencies)) return;

  if (request.method === "GET" && path === "/api/v1/sales-orders") {
    const identity = await dependencies.identityAuthority.resolve(request);
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

  if (request.method === "GET" && path === "/api/v1/quotes") {
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, "quote.view");
    const query = quoteListQuery(request.url);
    sendJson(response, 200, await listQuoteSummaries(dependencies.pool, query, identity));
    return;
  }

  if (request.method === "POST" && path === "/api/v1/quotes") {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, "quote.create");
    const input = await readJsonBody(request, QUOTE_AGGREGATE_MAX_BODY_BYTES);
    if (Object.keys(input).length > 0) {
      throw new HttpError(400, "invalid_quote_create_request", "Runtime Quote creation accepts an empty object only");
    }
    try {
      const quote = await createTrustedQuoteService(dependencies.pool).createRuntimeDraft(identity, {
        requestId: correlationId,
        method: request.method,
        path,
      });
      sendJson(response, 201, { quote });
    } catch (error) { asQuoteHttpError(error); }
    return;
  }

  const materialProgressMatch = /^\/api\/v1\/sales-orders\/([^/]+)\/material-progress$/.exec(path);
  if (materialProgressMatch && request.method === 'GET') {
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, 'authentication_required', 'Authentication is required');
    requirePermission(identity.permissions, 'order.view');
    requirePermission(identity.permissions, 'style_progress.read');
    if (new URL(request.url ?? '', 'http://localhost').search) throw new HttpError(400, 'invalid_order_request', 'Only SalesOrder UUID is accepted');
    if (!dependencies.orderMaterialRead) throw new HttpError(503, 'material_read_not_connected', 'Trusted material read capability is not connected');
    const result = await createOrderMaterialReader(dependencies.orderMaterialRead)(identity, { salesOrderId: materialProgressMatch[1] });
    response.setHeader('Cache-Control', 'no-store');
    if (result.status !== 200) throw new HttpError(result.status, result.error.code, result.error.message);
    sendJson(response, 200, result.body);
    return;
  }

  const deliveryPlansMatch = /^\/api\/v1\/sales-orders\/([^/]+)\/delivery-plans$/.exec(path);
  if (deliveryPlansMatch && (request.method === "GET" || request.method === "PATCH")) {
    if (request.method === "PATCH") assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, "order.view");
    if (request.method === "PATCH") requirePermission(identity.permissions, "order.edit");
    const salesOrderId = requiredPathIdentity(deliveryPlansMatch[1], "salesOrderId");
    if (!UUID_PATTERN.test(salesOrderId)) throw new HttpError(400, "invalid_sales_order_id", "SalesOrder ID must be a UUID");
    const deliveryPlanSet = request.method === "GET"
      ? await readDeliveryPlanSet(dependencies.pool, salesOrderId)
      : await updateDeliveryPlans(dependencies.pool, identity, salesOrderId, await readJsonBody(request));
    sendJson(response, 200, { deliveryPlanSet });
    return;
  }

  const salesOrderTermsMatch = /^\/api\/v1\/sales-orders\/([^/]+)\/confirmed-commercial-terms$/.exec(path);
  if (salesOrderTermsMatch && (request.method === "GET" || request.method === "PATCH")) {
    if (request.method === "PATCH") assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, request.method === "GET" ? "order.view" : "order.edit");
    const salesOrderId = requiredPathIdentity(salesOrderTermsMatch[1], "salesOrderId");
    const terms = request.method === "GET"
      ? await readConfirmedCommercialTermsBySalesOrder(dependencies.pool, salesOrderId)
      : await updateConfirmedCommercialTermsBySalesOrder(
        dependencies.pool,
        identity,
        salesOrderId,
        confirmedCommercialTermsInput(await readJsonBody(request)),
      );
    sendJson(response, 200, { confirmedCommercialTerms: projectCommercialTerms(identity, terms) });
    return;
  }

  const estimateMatch = /^\/api\/v1\/quotes\/([^/]+)\/estimate-workflows$/.exec(path);
  if (estimateMatch && request.method === "POST") {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    const command = parseEstimateCommand(await readJsonBody(request, QUOTE_AGGREGATE_MAX_BODY_BYTES));
    try {
      const quote = await createTrustedQuoteService(dependencies.pool).estimateWorkflow(identity, requiredPathIdentity(estimateMatch[1], "quoteId"), command, { requestId: correlationId, method: request.method, path });
      sendJson(response, 200, { quote });
    } catch (error) { asQuoteHttpError(error); }
    return;
  }
  if (request.method === "POST" && path === "/api/v1/quotes/internal-summary") {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    const file = await createInternalSummaryService(dependencies.pool).generate(identity, parseInternalSummary(await readJsonBody(request)));
    response.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Length": file.bytes.length, "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`, "X-Zhixu-File-Name": encodeURIComponent(file.fileName), "X-Zhixu-File-Sha256": file.sha256,
      "X-Zhixu-Export-Warnings": "%5B%5D", "X-Zhixu-Summary-Rows": String(file.rowCount) });
    response.end(file.bytes); return;
  }
  if (request.method === "POST" && path === "/api/v1/quotes/customer-batch-export") {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    const items = parseCustomerBatch(await readJsonBody(request));
    const result = await generateCustomerBatch(dependencies.pool, dependencies.attachmentStorage, identity, items);
    if (!result.bytes) { sendJson(response, 200, {report:result.report});return; }
    response.writeHead(200,{"Content-Type":"application/zip","Content-Length":result.bytes.length,"Cache-Control":"no-store",
      "X-Zhixu-File-Name":encodeURIComponent(result.fileName!),"X-Zhixu-File-Sha256":result.sha256!,
      "X-Zhixu-Export-Warnings":encodeURIComponent(JSON.stringify(result.report.warnings.length?["部分文件有警告，详见 ZIP export-results.json。"]:[])),"X-Zhixu-Batch-Report":encodeURIComponent(JSON.stringify(result.report))});
    response.end(result.bytes);return;
  }
  const exportMatch = /^\/api\/v1\/quotes\/([^/]+)\/customer-export$/.exec(path);
  if (request.method === "POST" && exportMatch) {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    const selection = parseCustomerExport(await readJsonBody(request));
    const file = await createCustomerExportService(dependencies.pool, dependencies.attachmentStorage).generate(identity, requiredPathIdentity(exportMatch[1], "quoteId"), selection);
    response.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Length": file.bytes.length,
      "Cache-Control": "no-store", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "X-Zhixu-File-Name": encodeURIComponent(file.fileName), "X-Zhixu-File-Sha256": file.sha256,
      "X-Zhixu-Export-Warnings": encodeURIComponent(JSON.stringify(file.warnings)) });
    response.end(file.bytes); return;
  }

  const confirmationMatch = /^\/api\/v1\/quotes\/([^/]+)\/confirmation-workflows$/.exec(path);
  if (confirmationMatch && request.method === "POST") {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    const command = parseQuoteConfirmationCommand(await readJsonBody(request, QUOTE_AGGREGATE_MAX_BODY_BYTES));
    try {
      const quote = await createTrustedQuoteService(dependencies.pool).confirmationWorkflow(identity, requiredPathIdentity(confirmationMatch[1], "quoteId"), command, { requestId: correlationId, method: request.method, path });
      sendJson(response, 200, { quote });
    } catch (error) { asQuoteHttpError(error); }
    return;
  }
  const workflowMatch = /^\/api\/v1\/quotes\/([^/]+)\/version-workflows$/.exec(path);
  if (workflowMatch && request.method === "POST") {
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    const command = parseQuoteVersionCommand(await readJsonBody(request, QUOTE_AGGREGATE_MAX_BODY_BYTES));
    try {
      const quote = await createTrustedQuoteService(dependencies.pool).versionWorkflow(identity, requiredPathIdentity(workflowMatch[1], "quoteId"), command, { requestId: correlationId, method: request.method, path });
      sendJson(response, 200, { quote });
    } catch (error) { asQuoteHttpError(error); }
    return;
  }
  const quoteTermsMatch = /^\/api\/v1\/quotes\/([^/]+)\/revisions\/([^/]+)\/price-versions\/([^/]+)\/confirmed-commercial-terms$/.exec(path);
  if (quoteTermsMatch && (request.method === "GET" || request.method === "PATCH")) {
    if (request.method === "PATCH") assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, request.method === "GET" ? "quote.view" : "quote.confirm");
    const provenance = {
      quoteId: requiredPathIdentity(quoteTermsMatch[1], "quoteId"),
      revisionId: requiredPathIdentity(quoteTermsMatch[2], "revisionId"),
      priceVersionId: requiredPathIdentity(quoteTermsMatch[3], "priceVersionId"),
    };
    const terms = request.method === "GET"
      ? await readConfirmedCommercialTermsByQuote(dependencies.pool, provenance)
      : await updateConfirmedCommercialTermsByQuote(
        dependencies.pool,
        identity,
        provenance,
        confirmedCommercialTermsInput(await readJsonBody(request), true) as UpdateQuoteConfirmedCommercialTermsInput,
      );
    sendJson(response, 200, { confirmedCommercialTerms: projectCommercialTerms(identity, terms) });
    return;
  }

  const quoteMatch = /^\/api\/v1\/quotes\/([^/]+)$/.exec(path);
  if (quoteMatch && (request.method === "GET" || request.method === "PUT")) {
    if (request.method === "PUT") assertMutationBoundary(request, dependencies.allowedOrigins);
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    const service = createTrustedQuoteService(dependencies.pool);
    const quoteId = requiredPathIdentity(quoteMatch[1], "quoteId");
    if (request.method === "GET") {
      requirePermission(identity.permissions, "quote.view");
      const quote = await service.getForActor(identity, quoteId);
      if (!quote) throw new HttpError(404, "quote_not_found", "Quote was not found");
      sendJson(response, 200, { quote });
      return;
    }
    requirePermission(identity.permissions, "quote.edit");
    const input = quoteBody(await readJsonBody(request, QUOTE_AGGREGATE_MAX_BODY_BYTES));
    if (input.quote.id !== quoteId) throw new HttpError(400, "quote_identity_mismatch", "Path and aggregate Quote IDs must match");
    try {
      const quote = await service.saveAggregate(identity, input.quote, input.expectedVersion, {
        requestId: correlationId,
        method: request.method,
        path,
      });
      sendJson(response, 200, { quote });
    } catch (error) { asQuoteHttpError(error); }
    return;
  }

  const commercialMatch = /^\/api\/v1\/sales-orders\/([^/]+)\/commercial-versions(?:\/(preview))?$/.exec(path);
  if (commercialMatch) {
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401,"authentication_required","Authentication is required");
    requirePermission(identity.permissions,"order.view");
    if (new URL(request.url??"/","http://localhost").searchParams.size) throw new HttpError(400,"invalid_commercial_query","Query selectors are not accepted");
    const id=requiredPathIdentity(commercialMatch[1],"salesOrderId");
    response.setHeader("Cache-Control","no-store");
    if(request.method==="GET"&&!commercialMatch[2]){
      sendJson(response,200,projectOrderCommercialState(identity,await readOrderCommercialState(dependencies.pool,id)));return;
    }
    if(request.method!=="POST")throw new HttpError(405,"method_not_allowed","Method not allowed");
    if(dependencies.identityAuthority.mode!=="session")throw new HttpError(403,"trusted_session_required","A trusted session is required");
    assertMutationBoundary(request,dependencies.allowedOrigins);
    requirePermission(identity.permissions,"order.commercial.adopt");
    const body=await readJsonBody(request,8192);
    if(commercialMatch[2]){
      const preview=await previewOrderCommercial(dependencies.pool,identity,id,parseCommercialProvenance(body));
      sendJson(response,200,{current:projectOrderCommercialState(identity,preview.current),candidate:projectCommercialCandidate(identity,preview.candidate)});
    }else{
      const result=await adoptOrderCommercial(dependencies.pool,identity,id,body);
      sendJson(response,200,{adopted:projectOrderCommercialVersion(identity,result.adopted),replayed:result.replayed});
    }
    return;
  }

  const identityMatch = /^\/api\/v1\/sales-orders\/([^/]+)\/identity$/.exec(path);
  if (identityMatch || path === "/api/v1/order-preparations" || path === "/api/v1/order-claimants") {
    const identity = await dependencies.identityAuthority.resolve(request);
    if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
    requirePermission(identity.permissions, "order.view");
    const identityQuery = new URL(request.url ?? "/", "http://localhost").searchParams;
    if (path === "/api/v1/order-preparations" && request.method === "GET") {
      requirePermission(identity.permissions, "order.preparation.create");
      if ([...identityQuery.keys()].some(key => !["referenceOrderId", "offset"].includes(key)) || [...new Set(identityQuery.keys())].some(key=>identityQuery.getAll(key).length!==1) || !/^\d+$/u.test(identityQuery.get("offset")??"0")) throw new HttpError(400,"invalid_preparation_query","Invalid query");
      response.setHeader("Cache-Control", "no-store");
      sendJson(response,200,await listOrderPreparations(dependencies.pool,identityQuery.get("referenceOrderId")??"",Number(identityQuery.get("offset")??0)));return;
    }
    if (identityQuery.size) throw new HttpError(400, "invalid_identity_query", "Query selectors are not accepted");
    if (path === "/api/v1/order-claimants") {
      requirePermission(identity.permissions,"order.transfer");
      if(request.method!=="GET") throw new HttpError(405,"method_not_allowed","Method not allowed");
      response.setHeader("Cache-Control","no-store");sendJson(response,200,await listClaimants(dependencies.pool));return;
    }
    response.setHeader("Cache-Control", "no-store");
    if (identityMatch && request.method === "GET") sendJson(response, 200, {identity: await readOrderIdentity(dependencies.pool, identityMatch[1])});
    else if ((identityMatch && request.method === "PATCH") || (!identityMatch && request.method === "POST")) {
      if (dependencies.identityAuthority.mode !== "session") throw new HttpError(403, "trusted_session_required", "A trusted session is required");
      assertMutationBoundary(request, dependencies.allowedOrigins);
      const body = await readJsonBody(request, 8192);
      const result = identityMatch ? await mutateOrderIdentity(dependencies.pool, identity, identityMatch[1], body) : await createOrderPreparation(dependencies.pool, identity, body);
      sendJson(response, 200, result);
    } else throw new HttpError(405, "method_not_allowed", "Method not allowed");
    return;
  }

  const salesOrderMatch = /^\/api\/v1\/sales-orders\/([^/]+)$/.exec(path);
  if (request.method === "GET" && salesOrderMatch) {
    const identity = await dependencies.identityAuthority.resolve(request);
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
  const resolved: ResolvedAppDependencies = {
    ...dependencies,
    logger: dependencies.logger ?? defaultLogger,
    allowedOrigins: dependencies.allowedOrigins ?? ["http://127.0.0.1:3001"],
    security: dependencies.security ?? { secureCookies: false, sessionTtlSeconds: 43_200 },
    staticDirectory: dependencies.staticDirectory ?? "",
    identityAuthority: dependencies.identityAuthority ?? createIdentityAuthority(dependencies.pool, "session"),
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

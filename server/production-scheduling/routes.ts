import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { IdentityAuthority } from "../auth/identity-authority.js";
import { HttpError } from "../http/errors.js";
import { assertMutationBoundary, readJsonBody } from "../http/request.js";
import { sendJson } from "../http/responses.js";
import { executeProductionPlan, listProductionPlanGroups, listProductionPlanOrders, previewProductionPlan, readOrderProductionPlans, readProductionAssignment, readProductionPlanReceipt, readProductionQueue } from "./service.js";
import { parsePlanHistoryQuery } from "./read-contract.js";
import { executeProductionExecution, previewProductionExecution, readProductionExecutionHistory } from "./execution-service.js";

export async function routeProductionScheduling(request: IncomingMessage, response: ServerResponse, dependencies: {
  pool: Pool; identityAuthority: IdentityAuthority; allowedOrigins: readonly string[];
}): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost"), prefix = "/api/v1/production-scheduling";
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return false;
  if (dependencies.identityAuthority.mode !== "session") throw new HttpError(404, "not_found", "Route not found");
  const actor = await dependencies.identityAuthority.resolve(request);
  if (!actor) throw new HttpError(401, "authentication_required", "Authentication required");
  if ([prefix + "/preview", prefix + "/commands", prefix + "/execution/preview", prefix + "/execution/commands"].includes(url.pathname) && request.method === "POST") {
    if (url.search) throw new HttpError(400, "invalid_production_plan_query", "Unexpected query");
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const body = await readJsonBody(request, 1024 * 1024);
    const execution = url.pathname.startsWith(prefix + "/execution/");
    if (url.pathname.endsWith("/preview")) sendJson(response, 200, await (execution ? previewProductionExecution : previewProductionPlan)(dependencies.pool, actor, body));
    else { const result = await (execution ? executeProductionExecution : executeProductionPlan)(dependencies.pool, actor, body); sendJson(response, result.status === "rejected" ? result.error.status : 200, result); }
    return true;
  }
  if (request.method !== "GET") throw new HttpError(405, "method_not_allowed", "Method not allowed");
  if (url.pathname === prefix + "/orders") { sendJson(response, 200, await listProductionPlanOrders(dependencies.pool, actor, url.searchParams)); return true; }
  if (url.pathname === prefix + "/groups") { sendJson(response, 200, await listProductionPlanGroups(dependencies.pool, actor, url.searchParams)); return true; }
  const match = /^\/api\/v1\/production-scheduling\/(orders|groups|assignments|commands|executions)\/([^/]+)$/u.exec(url.pathname);
  if (!match) throw new HttpError(404, "not_found", "Route not found");
  if (!["assignments", "executions"].includes(match[1]) && url.search) throw new HttpError(400, "invalid_production_plan_query", "Unexpected query");
  if (match[1] === "orders") sendJson(response, 200, await readOrderProductionPlans(dependencies.pool, actor, match[2]));
  else if (match[1] === "groups") sendJson(response, 200, await readProductionQueue(dependencies.pool, actor, match[2]));
  else if (match[1] === "commands") sendJson(response, 200, await readProductionPlanReceipt(dependencies.pool, actor, match[2]));
  else {
    const query = parsePlanHistoryQuery(url.searchParams);
    sendJson(response, 200, await (match[1] === "executions" ? readProductionExecutionHistory : readProductionAssignment)(dependencies.pool, actor, match[2], query.offset, query.asOfVersion));
  }
  return true;
}

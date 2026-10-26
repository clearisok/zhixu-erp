import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { IdentityAuthority } from "../auth/identity-authority.js";
import type { SourceReadConfig } from "../ainuoke-source/reader.js";
import { HttpError } from "../http/errors.js";
import { assertMutationBoundary, readJsonBody } from "../http/request.js";
import { sendJson } from "../http/responses.js";
import { parseArrivalHistoryQuery } from "./contract.js";
import { executeMaterialArrival, previewMaterialArrival, readMaterialArrivalHistory, readMaterialArrivalReceipt, readMaterialArrivals } from "./service.js";

export async function routeMaterialArrivals(request: IncomingMessage, response: ServerResponse, dependencies: {
  pool: Pool; identityAuthority: IdentityAuthority; allowedOrigins: readonly string[]; materialArrivalSource?: SourceReadConfig | null;
}): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost"), prefix = "/api/v1/material-arrivals";
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return false;
  if (dependencies.identityAuthority.mode !== "session") throw new HttpError(404, "not_found", "Route not found");
  const actor = await dependencies.identityAuthority.resolve(request);
  if (!actor) throw new HttpError(401, "authentication_required", "Authentication required");
  const config = dependencies.materialArrivalSource ?? null;
  if ([prefix + "/preview", prefix + "/commands"].includes(url.pathname) && request.method === "POST") {
    if (url.search) throw new HttpError(400, "invalid_material_arrival_query", "Unexpected query");
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const body = await readJsonBody(request, 1024 * 1024);
    if (url.pathname.endsWith("/preview")) sendJson(response, 200, await previewMaterialArrival(dependencies.pool, actor, body, config));
    else { const result = await executeMaterialArrival(dependencies.pool, actor, body, config); sendJson(response, result.status === "rejected" ? result.error.status : 200, result); }
    return true;
  }
  if (request.method !== "GET") throw new HttpError(405, "method_not_allowed", "Method not allowed");
  const history = /^\/api\/v1\/material-arrivals\/orders\/([^/]+)\/materials\/([^/]+)\/history$/u.exec(url.pathname);
  if (history) {
    const query = parseArrivalHistoryQuery(url.searchParams);
    sendJson(response, 200, await readMaterialArrivalHistory(dependencies.pool, actor, history[1], history[2], query.offset, query.asOfVersion)); return true;
  }
  const match = /^\/api\/v1\/material-arrivals\/(orders|commands)\/([^/]+)$/u.exec(url.pathname);
  if (!match) throw new HttpError(404, "not_found", "Route not found");
  if (url.search) throw new HttpError(400, "invalid_material_arrival_query", "Unexpected query");
  sendJson(response, 200, match[1] === "orders" ? await readMaterialArrivals(dependencies.pool, actor, match[2], config) : await readMaterialArrivalReceipt(dependencies.pool, actor, match[2])); return true;
}

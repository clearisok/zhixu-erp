import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { IdentityAuthority } from "../auth/identity-authority.js";
import { HttpError } from "../http/errors.js";
import { assertMutationBoundary, readJsonBody } from "../http/request.js";
import { sendJson } from "../http/responses.js";
import { managedResourceKind, parseManagedResourceCommand } from "./managed-contract.js";
import { executeProductionResourceCommand, listProductionResources, parseResourceListQuery, readProductionResource, readProductionResourceReceipt } from "./service.js";

export async function routeProductionResources(request: IncomingMessage, response: ServerResponse, dependencies: {
  pool: Pool; identityAuthority: IdentityAuthority; allowedOrigins: readonly string[];
}): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost"), prefix = "/api/v1/production-resources";
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) return false;
  if (dependencies.identityAuthority.mode !== "session") throw new HttpError(404, "not_found", "Route not found");
  const actor = await dependencies.identityAuthority.resolve(request);
  if (!actor) throw new HttpError(401, "authentication_required", "Authentication required");
  if (url.pathname === prefix + "/commands" && request.method === "POST") {
    if (url.search) throw new HttpError(400, "invalid_production_resource_query", "Unexpected query");
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const result = await executeProductionResourceCommand(dependencies.pool, actor, parseManagedResourceCommand(await readJsonBody(request, 1024 * 1024)));
    sendJson(response, result.status === "rejected" ? result.error.status : 200, result); return true;
  }
  if (request.method !== "GET") throw new HttpError(405, "method_not_allowed", "Method not allowed");
  const receipt = /^\/api\/v1\/production-resources\/commands\/([^/]+)$/u.exec(url.pathname);
  if (receipt) {
    if (url.search) throw new HttpError(400, "invalid_production_resource_query", "Unexpected query");
    sendJson(response, 200, await readProductionResourceReceipt(dependencies.pool, actor, receipt[1])); return true;
  }
  const resource = /^\/api\/v1\/production-resources\/([^/]+)(?:\/([^/]+))?$/u.exec(url.pathname);
  if (!resource) throw new HttpError(404, "not_found", "Route not found");
  const kind = managedResourceKind(resource[1]);
  if (resource[2]) {
    if (url.search) throw new HttpError(400, "invalid_production_resource_query", "Unexpected query");
    sendJson(response, 200, { resource: await readProductionResource(dependencies.pool, actor, kind, resource[2]) });
  } else sendJson(response, 200, await listProductionResources(dependencies.pool, actor, kind, parseResourceListQuery(url.searchParams)));
  return true;
}

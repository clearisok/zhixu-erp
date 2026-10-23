import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { IdentityAuthority } from "./identity-authority.js";
import { readTeamAccess, executeTeamCommand, parseTeamCommand, parseTeamQuery } from "./team-access.js";
import { HttpError } from "../http/errors.js";
import { assertMutationBoundary, readJsonBody } from "../http/request.js";
import { sendJson } from "../http/responses.js";
import { requirePermission } from "./permissions.js";

export async function routeTeamAccess(request: IncomingMessage, response: ServerResponse, dependencies: { pool: Pool; identityAuthority: IdentityAuthority; allowedOrigins: readonly string[] }) {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path !== "/api/v1/team-access") return false;
  if (dependencies.identityAuthority.mode !== "session") throw new HttpError(404, "not_found", "Route not found");
  if (request.method !== "GET" && request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Method not allowed");
  const identity = await dependencies.identityAuthority.resolve(request);
  if (!identity) throw new HttpError(401, "authentication_required", "Authentication is required");
  requirePermission(identity.permissions, "user_permissions.view");
  if (request.method === "GET") sendJson(response, 200, await readTeamAccess(dependencies.pool, identity, parseTeamQuery(new URL(request.url ?? "/", "http://localhost").searchParams)));
  else {
    requirePermission(identity.permissions, "user_permissions.manage");
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const command = parseTeamCommand(await readJsonBody(request, 16 * 1024));
    sendJson(response, 200, await executeTeamCommand(dependencies.pool, identity, command));
  }
  return true;
}

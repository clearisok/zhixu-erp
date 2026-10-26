import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { IdentityAuthority } from '../auth/identity-authority.js';
import { HttpError } from '../http/errors.js';
import { sendJson } from '../http/responses.js';
import { readClosingOrderBasis } from './basis-service.js';

export async function routeClosing(request: IncomingMessage, response: ServerResponse, dependencies: { pool: Pool; identityAuthority: IdentityAuthority }): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost'), prefix = '/api/v1/closing';
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return false;
  if (dependencies.identityAuthority.mode !== 'session') throw new HttpError(404, 'not_found', 'Route not found');
  const actor = await dependencies.identityAuthority.resolve(request);
  if (!actor) throw new HttpError(401, 'authentication_required', 'Authentication required');
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
  const match = /^\/api\/v1\/closing\/orders\/([^/]+)\/basis$/u.exec(url.pathname);
  if (!match) throw new HttpError(404, 'not_found', 'Route not found');
  if (url.search) throw new HttpError(400, 'invalid_closing_basis_query', 'Unexpected query');
  sendJson(response, 200, await readClosingOrderBasis(dependencies.pool, actor, match[1])); return true;
}

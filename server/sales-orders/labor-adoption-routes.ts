import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { IdentityAuthority } from '../auth/identity-authority.js';
import { HttpError } from '../http/errors.js';
import { sendJson } from '../http/responses.js';
import { assertMutationBoundary, readJsonBody } from '../http/request.js';
import type { OrderCommandMode } from './command-control.js';
import { executeLaborAdoption, previewLaborAdoption, readLaborAdoptionHistory, readLaborAdoptionReceipt } from './labor-adoption-service.js';

/** Quote Center is the only write surface; order readers remain read-only. */
export async function routeLaborAdoptions(request: IncomingMessage, response: ServerResponse, dependencies: {
  pool: Pool; identityAuthority: IdentityAuthority; allowedOrigins: readonly string[]; orderCommandMode?: OrderCommandMode;
}): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost'), prefix = '/api/v1/quotes/order-labor-adoptions';
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return false;
  if (dependencies.identityAuthority.mode !== 'session') throw new HttpError(404, 'not_found', 'Route not found');
  const actor = await dependencies.identityAuthority.resolve(request); if (!actor) throw new HttpError(401, 'authentication_required', 'Authentication required');
  if ([prefix + '/preview', prefix + '/commands'].includes(url.pathname) && request.method === 'POST') {
    if (url.search) throw new HttpError(400, 'invalid_labor_query', 'Unexpected query'); assertMutationBoundary(request, dependencies.allowedOrigins);
    const body = await readJsonBody(request, 131072);
    if (url.pathname.endsWith('/preview')) sendJson(response, 200, await previewLaborAdoption(dependencies.pool, actor, body));
    else { const result = await executeLaborAdoption(dependencies.pool, actor, body, dependencies.orderCommandMode); sendJson(response, result.status === 'rejected' ? result.error.status : result.status === 'unverified' ? 202 : 200, result); }
    return true;
  }
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
  if (url.pathname === prefix + '/history') { sendJson(response, 200, await readLaborAdoptionHistory(dependencies.pool, actor, url.searchParams)); return true; }
  const receipt = /^\/api\/v1\/quotes\/order-labor-adoptions\/commands\/([^/]+)$/u.exec(url.pathname);
  if (!receipt) throw new HttpError(404, 'not_found', 'Route not found'); if (url.search) throw new HttpError(400, 'invalid_labor_query', 'Unexpected query');
  sendJson(response, 200, await readLaborAdoptionReceipt(dependencies.pool, actor, receipt[1])); return true;
}

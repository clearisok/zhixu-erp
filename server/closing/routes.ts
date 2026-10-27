import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { IdentityAuthority } from '../auth/identity-authority.js';
import { HttpError } from '../http/errors.js';
import { sendJson } from '../http/responses.js';
import { assertMutationBoundary, readJsonBody } from '../http/request.js';
import { readClosingOrderBasis } from './basis-service.js';
import { executeClosingCommand, previewClosingCommand, readClosingCommandReceipt } from './service.js';
import { listClosingPeriods, readClosingHistory, readClosingPeriodDetail } from './read-service.js';
import {readClosingYear} from './annual-service.js';
import { executeClosingMonthMove, previewClosingMonthMove, readClosingMonthReceipt, readOrderClosingMonthPlan } from './month-plan-service.js';

export async function routeClosing(request: IncomingMessage, response: ServerResponse, dependencies: { pool: Pool; identityAuthority: IdentityAuthority; allowedOrigins: readonly string[] }): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost'), prefix = '/api/v1/closing';
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return false;
  if (dependencies.identityAuthority.mode !== 'session') throw new HttpError(404, 'not_found', 'Route not found');
  const actor = await dependencies.identityAuthority.resolve(request);
  if (!actor) throw new HttpError(401, 'authentication_required', 'Authentication required');
  if ([prefix + '/month-plans/preview', prefix + '/month-plans/commands'].includes(url.pathname) && request.method === 'POST') {
    if (url.search) throw new HttpError(400, 'invalid_closing_query', 'Unexpected query');
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const body = await readJsonBody(request, 16384);
    if (url.pathname.endsWith('/preview')) sendJson(response, 200, await previewClosingMonthMove(dependencies.pool, actor, body));
    else { const result = await executeClosingMonthMove(dependencies.pool, actor, body); sendJson(response, result.status === 'rejected' ? result.error.status : result.status === 'unverified' ? 202 : 200, result); }
    return true;
  }
  if ([prefix + '/preview', prefix + '/commands'].includes(url.pathname) && request.method === 'POST') {
    if (url.search) throw new HttpError(400, 'invalid_closing_query', 'Unexpected query');
    assertMutationBoundary(request, dependencies.allowedOrigins);
    const body = await readJsonBody(request, 16384);
    if (url.pathname.endsWith('/preview')) sendJson(response, 200, await previewClosingCommand(dependencies.pool, actor, body));
    else { const result = await executeClosingCommand(dependencies.pool, actor, body); sendJson(response, result.status === 'rejected' ? result.error.status : result.status === 'unverified' ? 202 : 200, result); }
    return true;
  }
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
  if(url.pathname===prefix+'/year'){sendJson(response,200,await readClosingYear(dependencies.pool,actor,url.searchParams));return true;}
  const monthPlan = /^\/api\/v1\/closing\/orders\/([^/]+)\/month-plan$/u.exec(url.pathname);
  const monthReceipt = /^\/api\/v1\/closing\/month-plans\/commands\/([^/]+)$/u.exec(url.pathname);
  if (monthPlan || monthReceipt) {
    if (url.search) throw new HttpError(400, 'invalid_closing_query', 'Unexpected query');
    sendJson(response, 200, monthPlan ? await readOrderClosingMonthPlan(dependencies.pool, actor, monthPlan[1])
      : await readClosingMonthReceipt(dependencies.pool, actor, monthReceipt![1])); return true;
  }
  const basis = /^\/api\/v1\/closing\/orders\/([^/]+)\/basis$/u.exec(url.pathname);
  if (basis) {
    if (url.search) throw new HttpError(400, 'invalid_closing_basis_query', 'Unexpected query');
    sendJson(response, 200, await readClosingOrderBasis(dependencies.pool, actor, basis[1])); return true;
  }
  if (url.pathname === prefix + '/periods') { sendJson(response, 200, await listClosingPeriods(dependencies.pool, actor, url.searchParams)); return true; }
  const history = /^\/api\/v1\/closing\/(periods|allocations)\/([^/]+)\/history$/u.exec(url.pathname);
  if (history) { sendJson(response, 200, await readClosingHistory(dependencies.pool, actor, history[1] === 'periods' ? 'period' : 'allocation', history[2], url.searchParams)); return true; }
  const detail = /^\/api\/v1\/closing\/(periods|commands)\/([^/]+)$/u.exec(url.pathname);
  if (detail) {
    if (detail[1] === 'commands') {
      if (url.search) throw new HttpError(400, 'invalid_closing_query', 'Unexpected query');
      sendJson(response, 200, await readClosingCommandReceipt(dependencies.pool, actor, detail[2]));
    } else sendJson(response, 200, await readClosingPeriodDetail(dependencies.pool, actor, detail[2], url.searchParams));
    return true;
  }
  throw new HttpError(404, 'not_found', 'Route not found');
}

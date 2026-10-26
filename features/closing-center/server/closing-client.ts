import { parseClosingCommand, parseClosingIntent, closingUuid, type ClosingCommand, type ClosingIntent } from '../../../server/closing/contract';
import { parseClosingReadQuery } from '../../../server/closing/read-contract';
import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import type { ClosingOutcome } from '../../../server/closing/service';
import { ClosingClientError, CLOSING_RESPONSE_LIMIT, bool, hash, invalidClosingResponse, keys, member, messages, obj,
  parseClosingBasis, parseClosingDetail, parseClosingHistory, parseClosingPeriods, parseClosingPreview, same, str, uid, type ClosingVisibility } from './closing-projection';

export { ClosingClientError, CLOSING_RESPONSE_LIMIT } from './closing-projection';
export type { ClosingIntent, ClosingCommand, ClosingVisibility };
export type ClosingLease = () => boolean;
export type ClosingReceipt = { state: 'unknown'; requestId: string } | { state: 'recorded'; requestId: string; commandHash: string; result: ClosingOutcome };
export function closingCommand(value: unknown): ClosingCommand { return parseClosingCommand(value); }
export async function closingCommandHash(value: ClosingCommand) {
  const bytes = new TextEncoder().encode(canonicalPlanJson(closingCommand(value)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
function outcome(value: unknown, command: ClosingCommand): ClosingOutcome {
  const row = obj(value); same(row.requestId, command.requestId);
  if (row.status === 'rejected') {
    keys(row, ['requestId', 'status', 'error']); const error = obj(row.error); keys(error, ['status', 'code']);
    if (typeof error.status !== 'number' || ![404, 409, 422].includes(error.status) || !/^[a-z][a-z0-9_]{1,100}$/u.test(str(error.code))) invalidClosingResponse();
  } else {
    const intent = command.intent, allocated = intent.action.endsWith('_allocation');
    keys(row, ['requestId', 'status', 'periodId', 'periodVersion', 'periodStatus', 'operationId', ...(allocated ? ['allocationId', 'allocationVersion'] : [])]);
    same(row.status, 'applied'); uid(row.periodId); same(row.periodStatus, intent.action === 'confirm_period' ? 'confirmed' : intent.action === 'lock_period' ? 'locked' : 'open');
    if ('periodId' in intent) { same(row.periodId, intent.periodId); same(row.periodVersion, intent.expectedPeriodVersion + 1); } else same(row.periodVersion, 1);
    if (allocated) { uid(row.allocationId); if ('allocationId' in intent) { same(row.allocationId, intent.allocationId); same(row.allocationVersion, intent.expectedVersion + 1); } else same(row.allocationVersion, 1); }
    const operation = str(row.operationId); if (!operation.startsWith('operation-')) invalidClosingResponse(); uid(operation.slice(10));
  }
  return row as unknown as ClosingOutcome;
}
export async function parseClosingReceipt(value: unknown, input: ClosingCommand): Promise<ClosingReceipt> {
  const command = closingCommand(input), row = obj(value); same(row.requestId, command.requestId);
  if (row.state === 'unknown') { keys(row, ['state', 'requestId']); return { state: 'unknown', requestId: command.requestId }; }
  keys(row, ['state', 'requestId', 'commandHash', 'result']); same(row.state, 'recorded'); same(hash(row.commandHash), await closingCommandHash(command));
  return { state: 'recorded', requestId: command.requestId, commandHash: String(row.commandHash), result: outcome(row.result, command) };
}
const owned = (lease: ClosingLease) => { if (!lease()) throw new ClosingClientError(0, 'closing_owner_changed'); };
async function bounded(response: Response, lease: ClosingLease) {
  if (!response.body) return invalidClosingResponse(); const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try { while (true) { owned(lease); const part = await reader.read(); owned(lease); if (part.done) break; size += part.value.byteLength;
    if (size > CLOSING_RESPONSE_LIMIT) throw new ClosingClientError(502, 'closing_response_too_large'); parts.push(part.value); }
    const bytes = new Uint8Array(size); let at = 0; for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
    try { return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)) as unknown; } catch { return invalidClosingResponse(); }
  } finally { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
/** Only the existing Server authority. No Browser fallback, price calculation or automatic retry. */
export function createClosingClient(options: { visibility: () => ClosingVisibility; fetchImpl?: typeof fetch; baseUrl?: string }) {
  const fetchImpl = options.fetchImpl ?? fetch, base = (options.baseUrl ?? '').replace(/\/$/u, '') + '/api/v1/closing';
  async function request(path: string, body: object | undefined, lease: ClosingLease, signal?: AbortSignal) {
    owned(lease); let response: Response;
    try { response = await fetchImpl(base + path, { method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', signal,
      ...(body ? { headers: { 'Content-Type': 'application/json', 'X-Zhixu-Request': '1' }, body: JSON.stringify(body) } : {}) }); }
    catch { owned(lease); throw new ClosingClientError(0, 'closing_outcome_unknown'); }
    owned(lease); const row = obj(await bounded(response, lease)); owned(lease);
    if (!response.ok) { const error = obj(row.error), code = error.code; throw new ClosingClientError(response.status, typeof code === 'string' && Object.hasOwn(messages, code) ? code
      : response.status === 401 ? 'authentication_required' : response.status === 403 ? 'permission_denied' : 'closing_request_failed'); }
    return row;
  }
  function visibility() { const v = obj(options.visibility()); keys(v, ['sale', 'work']); return { sale: bool(v.sale), work: bool(v.work) }; }
  async function query<T>(path: string, lease: ClosingLease, signal: AbortSignal | undefined, parse: (raw: unknown, view: ClosingVisibility) => T) {
    const raw = await request(path, undefined, lease, signal); owned(lease); const result = parse(raw, visibility()); owned(lease); return result;
  }
  return {
    async periods(params: URLSearchParams, lease: ClosingLease, signal?: AbortSignal) {
      const raw = new URLSearchParams(params), q = parseClosingReadQuery(raw, 'list');
      return query('/periods?' + raw, lease, signal, (value, view) => parseClosingPeriods(value, q, view));
    },
    async period(periodId: string, params: URLSearchParams, lease: ClosingLease, signal?: AbortSignal) {
      const id = closingUuid(periodId), raw = new URLSearchParams(params), q = parseClosingReadQuery(raw, 'period');
      return query('/periods/' + id + '?' + raw, lease, signal, (value, view) => parseClosingDetail(value, id, q, view));
    },
    async history(kind: 'period' | 'allocation', entityId: string, params: URLSearchParams, lease: ClosingLease, signal?: AbortSignal) {
      member(kind, ['period', 'allocation']); const id = closingUuid(entityId), raw = new URLSearchParams(params), q = parseClosingReadQuery(raw, 'history');
      return query('/' + (kind === 'period' ? 'periods' : 'allocations') + '/' + id + '/history?' + raw, lease, signal, (value, view) => parseClosingHistory(value, kind, id, q, view));
    },
    async basis(orderId: string, lease: ClosingLease, signal?: AbortSignal) {
      const id = closingUuid(orderId); return query('/orders/' + id + '/basis', lease, signal, (value, view) => parseClosingBasis(value, id, view));
    },
    async preview(value: ClosingIntent, lease: ClosingLease, signal?: AbortSignal) {
      const intent = parseClosingIntent(value), raw = await request('/preview', intent, lease, signal); owned(lease);
      const result = parseClosingPreview(raw, intent, visibility()); owned(lease); return result;
    },
    async submit(value: ClosingCommand, lease: ClosingLease, signal?: AbortSignal) {
      const command = closingCommand(value), row = await request('/commands', command, lease, signal);
      if (row.status === 'unverified') { keys(row, ['requestId', 'status']); same(row.requestId, command.requestId); return { status: 'unverified' as const, requestId: command.requestId }; }
      bool(row.replayed); const { replayed, ...clean } = row; void replayed; return outcome(clean, command);
    },
    async receipt(value: ClosingCommand, lease: ClosingLease, signal?: AbortSignal) {
      const command = closingCommand(value), raw = await request('/commands/' + command.requestId, undefined, lease, signal);
      const result = await parseClosingReceipt(raw, command); owned(lease); return result;
    },
  };
}

import type { LaborAdoptionCommand, LaborAdoptionIntent } from '../../../server/sales-orders/labor-adoption-model';
import type { listLaborAdoptionOrders, readLaborAdoptionOptions } from '../../../server/sales-orders/labor-adoption-queries';
import type { LaborAdoptionOutcome, previewLaborAdoption, readLaborAdoptionHistory } from '../../../server/sales-orders/labor-adoption-service';
import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import { ServerAuthError } from '../../server-auth/server-auth-client';

export type LaborOrderPage = Awaited<ReturnType<typeof listLaborAdoptionOrders>>;
export type LaborOptions = Awaited<ReturnType<typeof readLaborAdoptionOptions>>;
export type LaborPreview = Awaited<ReturnType<typeof previewLaborAdoption>>;
export type LaborHistory = Awaited<ReturnType<typeof readLaborAdoptionHistory>>;
export type LaborPending = { quoteId: string; command: LaborAdoptionCommand };
export type LaborLease = () => boolean;
export type LaborReceipt = { state: 'unknown'; requestId: string } | { state: 'recorded'; requestId: string; orderId: string; commandHash: string; result: LaborAdoptionOutcome };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const hashPattern = /^[a-f0-9]{64}$/u;
export const LABOR_RESPONSE_LIMIT = 1048576;
const messages: Record<string, string> = {
  labor_response_invalid: '返回内容无法完整核对，原请求仍保留。', labor_receipt_mismatch: '回执与原订单或命令不一致，原请求仍保留。',
  labor_response_too_large: '记录较多，无法完整读取，请缩小查询范围。', labor_owner_changed: '登录身份或操作范围已变化，原请求仍保留。',
  labor_outcome_unknown: '采用结果尚未确认，请先核对原请求。', invalid_labor_adoption: '请选择订单、报价修订和颜色，核对产品未变化并填写原因。',
  labor_usd_confirmation_required: '该方案尚无有效的 USD 确认工价。', labor_confirmation_currency_evidence_required: '缺少确认时的 USD 币种依据，请在报价中心明确确认。',
  labor_product_changed: '该修订的产品条件发生变化，不能仅采用工价。', labor_revision_not_successor: '请选择原报价修订或其可信后继修订。',
  labor_revision_creation_evidence_required: '该修订缺少可信创建依据，请从原修订建立新的报价修订。',
  order_commercial_version_conflict: '订单商业版本已变化，请重新读取并预览。', labor_adoption_preview_changed: '确认来源或订单已变化，请重新预览。',
  labor_conversion_scope_cny_required: '本次仅支持将 CNY 工价明确采用为 USD，请取消已是 USD 的行。',
  order_commercial_frozen: '该订单已完成或取消，不能采用新工价。', historical_duplicate_order_read_only: '该历史订单只可查看。',
  labor_order_quote_mismatch: '该订单不属于当前采用报价，请重新选择。', order_commands_frozen: '订单写入暂时关闭，原请求可继续核对。',
  labor_color_mapping_required: '缺少可核实的订单颜色映射，请先核对来源。', order_color_identity_ambiguous: '颜色身份待核对，暂不能采用工价。',
  labor_request_failed: '工价采用暂不可用，请保留原请求并稍后核对。',
};
export class LaborAdoptionClientError extends ServerAuthError {
  constructor(status: number, code: string) { super(status, code, messages[code]); }
}
const invalid = (): never => { throw new LaborAdoptionClientError(502, 'labor_response_invalid'); };
const mismatch = (): never => { throw new LaborAdoptionClientError(502, 'labor_receipt_mismatch'); };
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
function text(value: unknown, max = 256): string {
  if (typeof value !== 'string' || !value || value.length > max || value.includes('\0')
    || new TextDecoder().decode(new TextEncoder().encode(value)) !== value) return invalid(); return value;
}
function uuid(value: unknown): string { const result = text(value, 36); if (!uuidPattern.test(result)) return invalid(); return result.toLowerCase(); }
function hash(value: unknown): string { const result = text(value, 64); if (!hashPattern.test(result)) return invalid(); return result; }
function operationId(value: unknown): string { const result = text(value, 46); if (!result.startsWith('operation-') || !uuidPattern.test(result.slice(10))) return invalid(); return result; }
function integer(value: unknown, minimum = 0): number { if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) >= 2147483647) return invalid(); return Number(value); }
function decimal(value: unknown): string { const result = text(value, 2000); if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(result)) return invalid(); return result; }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') return invalid(); return value; }
function array(value: unknown, max = 1000): unknown[] { if (!Array.isArray(value) || value.length > max) return invalid(); return value; }
function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function same(left: unknown, right: unknown) { if (canonicalPlanJson(left) !== canonicalPlanJson(right)) mismatch(); }
function owned(lease: LaborLease) { if (!lease()) throw new LaborAdoptionClientError(0, 'labor_owner_changed'); }
function currency(value: unknown): 'CNY' | 'USD' { if (value !== 'CNY' && value !== 'USD') return invalid(); return value; }

/** Browser-safe command parsing; no Node, calculation or quotation data imports. */
export function laborIntent(value: unknown): LaborAdoptionIntent {
  const row = object(value); keys(row, ['orderId', 'expectedVersion', 'targetRevisionId', 'colorIds', 'productUnchangedConfirmed', 'reason']);
  if (row.productUnchangedConfirmed !== true) return invalid();
  const colorIds = array(row.colorIds).map(value => nullable(value, uuid));
  if (!colorIds.length || new Set(colorIds).size !== colorIds.length) return invalid();
  colorIds.sort((a, b) => (a ?? '').localeCompare(b ?? ''));
  const reason = text(row.reason, 2000).trim(), targetRevisionId = text(row.targetRevisionId).trim(); if (!reason || !targetRevisionId) return invalid();
  return { orderId: uuid(row.orderId), expectedVersion: integer(row.expectedVersion, 1), targetRevisionId, colorIds, productUnchangedConfirmed: true, reason };
}
export function laborCommand(value: unknown): LaborAdoptionCommand {
  const row = object(value); keys(row, ['requestId', 'intent', 'previewHash']);
  return { requestId: uuid(row.requestId), intent: laborIntent(row.intent), previewHash: hash(row.previewHash) };
}
export function laborPending(value: unknown): LaborPending {
  const row = object(value); keys(row, ['quoteId', 'command']); const quoteId = text(row.quoteId); if (quoteId !== quoteId.trim()) return invalid();
  return { quoteId, command: laborCommand(row.command) };
}
export async function laborCommandHash(value: LaborAdoptionCommand): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPlanJson(laborCommand(value)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
function confirmation(value: unknown) {
  const row = object(value); keys(row, ['quoteId', 'revisionId', 'priceVersionId', 'quoteVersion', 'sourceKind', 'sourceCctId', 'sourceCctVersion', 'confirmedAt']);
  text(row.quoteId); text(row.revisionId); text(row.priceVersionId); integer(row.quoteVersion, 1);
  if (row.sourceKind !== 'cct' && row.sourceKind !== 'quote_confirmation') return invalid();
  nullable(row.sourceCctId, uuid); nullable(row.sourceCctVersion, value => integer(value, 1));
  if ((row.sourceKind === 'cct' ? row.sourceCctId === null || row.sourceCctVersion === null : row.sourceCctId !== null || row.sourceCctVersion !== null)
    || !Number.isFinite(Date.parse(text(row.confirmedAt, 64)))) return invalid();
  return row;
}
function workLine(value: unknown, hasConfirmation = false) {
  const row = object(value); keys(row, ['colorId', 'colorName', 'quantity', 'priceVersionId', 'priceVersionName', 'laborPrice', 'laborCurrency', ...(hasConfirmation ? ['confirmation'] : [])]);
  nullable(row.colorId, uuid); nullable(row.colorName, value => text(value, 2000)); nullable(row.quantity, decimal); text(row.priceVersionId);
  if (typeof row.priceVersionName !== 'string' || row.priceVersionName.length > 2000) return invalid(); decimal(row.laborPrice); currency(row.laborCurrency);
  if (hasConfirmation) nullable(row.confirmation, confirmation); return row;
}
export function parseLaborOrders(value: unknown, quoteId: string): LaborOrderPage {
  const row = object(value); keys(row, ['quoteId', 'items', 'offset', 'hasMore']); same(row.quoteId, quoteId); integer(row.offset); boolean(row.hasMore);
  const ids = new Set<string>(); for (const value of array(row.items, 20)) {
    const item = object(value); keys(item, ['id', 'orderNo', 'lifecycle', 'businessType', 'contractNo', 'styleNo', 'historical', 'version', 'work', 'editable']);
    const id = uuid(item.id); if (ids.has(id)) return invalid(); ids.add(id); text(item.orderNo); text(item.lifecycle);
    if (item.businessType !== 'distribution' && item.businessType !== 'processing') return invalid(); nullable(item.contractNo, value => text(value, 2000)); nullable(item.styleNo, value => text(value, 2000));
    boolean(item.historical); integer(item.version, 1); boolean(item.editable);
    for (const value of array(item.work)) { const work = object(value); keys(work, ['price', 'currency']); decimal(work.price); currency(work.currency); }
  }
  return row as unknown as LaborOrderPage;
}
export function parseLaborOptions(value: unknown, quoteId: string, orderId: string): LaborOptions {
  const row = object(value); keys(row, ['quoteId', 'quoteCode', 'orderId', 'orderNo', 'version', 'currentVersionId', 'businessType', 'lines', 'revisions', 'revisionOffset', 'hasMoreRevisions']);
  same(row.quoteId, quoteId); same(uuid(row.orderId), uuid(orderId)); text(row.quoteCode); text(row.orderNo); integer(row.version, 1); uuid(row.currentVersionId);
  if (row.businessType !== 'ainuoke_contract' && row.businessType !== 'processing') return invalid(); integer(row.revisionOffset); boolean(row.hasMoreRevisions);
  const colors = new Set<string | null>(); for (const item of array(row.lines)) { const line = workLine(item), color = nullable(line.colorId, uuid); if (colors.has(color)) return invalid(); colors.add(color); }
  const ids = new Set<string>(); for (const value of array(row.revisions, 20)) {
    const revision = object(value); keys(revision, ['revisionId', 'label', 'priceVersions']); const id = text(revision.revisionId); if (ids.has(id)) return invalid(); ids.add(id); text(revision.label);
    const pvIds = new Set<string>(); for (const value of array(revision.priceVersions)) {
      const pv = object(value), available = boolean(pv.available); keys(pv, ['priceVersionId', 'name', 'available', ...(available ? ['laborPrice', 'confirmation'] : ['code'])]);
      const id = text(pv.priceVersionId); if (pvIds.has(id)) return invalid(); pvIds.add(id); if (typeof pv.name !== 'string') return invalid();
      if (available) { decimal(pv.laborPrice); const c = confirmation(pv.confirmation); same(c.quoteId, quoteId); same(c.revisionId, revision.revisionId); same(c.priceVersionId, id); } else text(pv.code);
    }
  }
  return row as unknown as LaborOptions;
}
export function parseLaborPreview(value: unknown, intent: LaborAdoptionIntent, quoteId: string): LaborPreview {
  const row = object(value); keys(row, ['intent', 'previewHash', 'currentVersion', 'currentVersionId', 'quoteId', 'quoteCode', 'targetRevisionId', 'revisionLabel', 'before', 'after', 'unchanged', 'warnings', 'preserved']);
  same(row.intent, laborIntent(intent)); same(row.quoteId, quoteId); same(row.targetRevisionId, intent.targetRevisionId); same(row.currentVersion, intent.expectedVersion);
  hash(row.previewHash); uuid(row.currentVersionId); text(row.quoteCode); text(row.revisionLabel); boolean(row.unchanged);
  for (const values of [row.before, row.after]) {
    const lines = array(values); same(lines.length, intent.colorIds.length);
    const colors: (string | null)[] = []; for (const value of lines) { const line = workLine(value, true); colors.push(nullable(line.colorId, uuid)); }
    same([...colors].sort((a, b) => (a ?? '').localeCompare(b ?? '')), intent.colorIds);
  }
  for (const value of array(row.after)) { const line = object(value); same(line.laborCurrency, 'USD'); const source = confirmation(line.confirmation); same(source.quoteId, quoteId); same(source.revisionId, intent.targetRevisionId); same(source.priceVersionId, line.priceVersionId); }
  for (const value of array(row.warnings, 10)) if (value !== 'revision_note_changed_confirm_product_unchanged') return invalid();
  same(row.preserved, ['garment_sale', 'product_snapshot', 'creation_source', 'processing_batch', 'closing_history', 'unselected_colors']);
  return row as unknown as LaborPreview;
}
function outcome(value: unknown, pending?: LaborPending): LaborAdoptionOutcome {
  const row = object(value); uuid(row.requestId); if (pending) same(uuid(row.requestId), pending.command.requestId);
  if (row.status === 'rejected') { keys(row, ['requestId', 'status', 'error']); const error = object(row.error); keys(error, ['status', 'code']);
    if (typeof error.status !== 'number' || ![404, 409, 422].includes(error.status) || !/^[a-z][a-z0-9_]{1,100}$/u.test(text(error.code))) return invalid();
  } else { keys(row, ['requestId', 'status', 'commercialVersionId', 'version', 'operationId']);
    if (row.status !== 'applied' && row.status !== 'unchanged') return invalid(); uuid(row.commercialVersionId); nullable(row.operationId, operationId);
    integer(row.version, row.status === 'applied' ? 2 : 1);
    if (pending) same(row.version, pending.command.intent.expectedVersion + (row.status === 'applied' ? 1 : 0));
    if ((row.status === 'unchanged') !== (row.operationId === null)) return invalid();
  }
  return row as unknown as LaborAdoptionOutcome;
}
export function parseLaborHistory(value: unknown, orderId: string): LaborHistory {
  const row = object(value); keys(row, ['orderId', 'items', 'offset', 'hasMore']); same(uuid(row.orderId), uuid(orderId)); integer(row.offset); boolean(row.hasMore);
  const ids = new Set<string>(); for (const value of array(row.items, 20)) {
    const item = object(value); keys(item, ['requestId', 'createdAt', 'actorUserId', 'actorName', 'result', 'before', 'after']);
    const id = uuid(item.requestId), actor = uuid(item.actorUserId), key = actor + '/' + id; if (ids.has(key)) return invalid(); ids.add(key); nullable(item.actorName, value => text(value, 2000));
    if (!Number.isFinite(Date.parse(text(item.createdAt, 64)))) return invalid(); same(outcome(item.result).requestId, id);
    for (const values of [item.before, item.after]) { const colors = new Set<string | null>(); for (const value of array(values)) {
      const line = workLine(value, true), color = nullable(line.colorId, uuid); if (colors.has(color)) return invalid(); colors.add(color);
    } }
  }
  return row as unknown as LaborHistory;
}
export async function parseLaborReceipt(value: unknown, input: LaborPending): Promise<LaborReceipt> {
  const pending = laborPending(input), row = object(value); same(uuid(row.requestId), pending.command.requestId);
  if (row.state === 'unknown') { keys(row, ['state', 'requestId']); return { state: 'unknown', requestId: pending.command.requestId }; }
  if (row.state !== 'recorded') return invalid(); keys(row, ['state', 'requestId', 'orderId', 'commandHash', 'result']);
  same(uuid(row.orderId), pending.command.intent.orderId); same(hash(row.commandHash), await laborCommandHash(pending.command));
  return { state: 'recorded', requestId: pending.command.requestId, orderId: pending.command.intent.orderId, commandHash: String(row.commandHash), result: outcome(row.result, pending) };
}
async function bounded(response: Response, lease: LaborLease) {
  if (!response.body) return invalid(); const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { owned(lease); const part = await reader.read(); owned(lease); if (part.done) break; size += part.value.byteLength;
    if (size > LABOR_RESPONSE_LIMIT) throw new LaborAdoptionClientError(502, 'labor_response_too_large'); chunks.push(part.value); }
    const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)) as unknown; } catch { return invalid(); }
  } finally { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
export function createLaborAdoptionClient(options: { fetchImpl?: typeof fetch; baseUrl?: string } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch, base = (options.baseUrl ?? '').replace(/\/$/u, '') + '/api/v1/quotes/order-labor-adoptions';
  async function request(path: string, body: object | undefined, lease: LaborLease, signal?: AbortSignal) {
    owned(lease); let response: Response;
    try { response = await fetchImpl(base + path, { method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', signal,
      ...(body ? { headers: { 'Content-Type': 'application/json', 'X-Zhixu-Request': '1' }, body: JSON.stringify(body) } : {}) }); }
    catch { owned(lease); throw new LaborAdoptionClientError(0, 'labor_outcome_unknown'); }
    owned(lease); const result = object(await bounded(response, lease)); owned(lease);
    if (!response.ok) { const code = object(result.error).code;
      throw new LaborAdoptionClientError(response.status, typeof code === 'string' && Object.hasOwn(messages, code) ? code
        : response.status === 401 ? 'authentication_required' : response.status === 403 ? 'permission_denied' : 'labor_request_failed'); }
    return result;
  }
  return {
    async orders(quoteId: string, search: string, offset: number, lease: LaborLease, signal?: AbortSignal) {
      const result = parseLaborOrders(await request('/orders?' + new URLSearchParams({ quoteId: text(quoteId), search, offset: String(integer(offset)) }), undefined, lease, signal), quoteId);
      same(result.offset, offset); return result;
    },
    async options(quoteId: string, orderId: string, revisionOffset: number, lease: LaborLease, signal?: AbortSignal) {
      const result = parseLaborOptions(await request('/orders/' + uuid(orderId) + '/options?' + new URLSearchParams({ quoteId: text(quoteId), revisionOffset: String(integer(revisionOffset)) }), undefined, lease, signal), quoteId, orderId);
      same(result.revisionOffset, revisionOffset); return result;
    },
    async preview(quoteId: string, value: LaborAdoptionIntent, lease: LaborLease, signal?: AbortSignal) {
      const intent = laborIntent(value); return parseLaborPreview(await request('/preview', intent, lease, signal), intent, quoteId);
    },
    async submit(value: LaborPending, lease: LaborLease, signal?: AbortSignal) {
      const pending = laborPending(value), result = await request('/commands', pending.command, lease, signal);
      if (result.status === 'unverified') { keys(result, ['requestId', 'status']); same(uuid(result.requestId), pending.command.requestId); return { status: 'unverified' as const, requestId: pending.command.requestId }; }
      keys(result, ['requestId', 'status', ...(result.status === 'rejected' ? ['error'] : ['commercialVersionId', 'version', 'operationId']), 'replayed']);
      boolean(result.replayed); const { replayed, ...clean } = result; void replayed; return outcome(clean, pending);
    },
    async receipt(value: LaborPending, lease: LaborLease, signal?: AbortSignal) {
      const pending = laborPending(value), result = await request('/commands/' + pending.command.requestId, undefined, lease, signal);
      const receipt = await parseLaborReceipt(result, pending); owned(lease); return receipt;
    },
    async history(orderId: string, offset: number, lease: LaborLease, signal?: AbortSignal) {
      const result = parseLaborHistory(await request('/history?' + new URLSearchParams({ orderId: uuid(orderId), offset: String(integer(offset)) }), undefined, lease, signal), orderId);
      same(result.offset, offset); return result;
    },
  };
}

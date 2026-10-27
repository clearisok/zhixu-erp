import type { executeClosingMonthMove, previewClosingMonthMove, readOrderClosingMonthPlan, readClosingMonthReceipt } from '../../../server/closing/month-plan-service';
import { matchMonthExecutors, moveMonthQuantities, parseClosingMonthCommand, sumMonthQuantities, validateMonthLines, type ClosingMonthCommand, type ClosingMonthIntent, type ClosingMonthLine } from '../../../server/closing/month-plan-model';
import { closingRequestHash } from './closing-request-hash';
import { arr, bool, date, decimal, hash, invalidClosingResponse, keys, member, nullable, num, obj, references, same, str, uid } from './closing-projection';

export type ClosingMonthState = Awaited<ReturnType<typeof readOrderClosingMonthPlan>>;
export type ClosingMonthPreview = Awaited<ReturnType<typeof previewClosingMonthMove>>;
export type ClosingMonthReceipt = Awaited<ReturnType<typeof readClosingMonthReceipt>>;
export type ClosingMonthOutcome = Exclude<Awaited<ReturnType<typeof executeClosingMonthMove>>, { status: 'unverified' }>;
export const closingMonthCommandHash = (value: ClosingMonthCommand) => closingRequestHash(parseClosingMonthCommand(value));
const month = (value: unknown) => { if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/u.test(str(value))) invalidClosingResponse(); };
function lines(value: unknown, quantity?: string | null): ClosingMonthLine[] {
  try {
    const rows = arr(value, 2000) as ClosingMonthLine[];
    const total = quantity === undefined ? sumMonthQuantities(rows) : quantity;
    const parsed = validateMonthLines(rows, total); same(parsed, rows); return parsed;
  } catch { return invalidClosingResponse(); }
}
function warnings(raw: unknown, refs: unknown) {
  const ids = new Set(arr(refs, 500).map(value => uid(obj(value).assignmentId))), seen = new Set<string>();
  for (const value of arr(raw, 1000)) { const row = obj(value); keys(row, ['assignmentId', 'code', 'quantity', 'referenceQuantity']);
    const id = uid(row.assignmentId), code = member(row.code, ['executor_plan_cancelled', 'executor_quantity_exceeds_reference']);
    if (!ids.has(id) || seen.has(id + code)) invalidClosingResponse(); seen.add(id + code); decimal(row.quantity); decimal(row.referenceQuantity); }
}
function assignedReferences(value: unknown, owner: string, portions: ClosingMonthLine[]) {
  references(value, owner); const assigned = new Set(portions.flatMap(line => line.assignmentId ? [line.assignmentId] : []));
  const refs = arr(value, 500); same(assigned.size, refs.length); for (const ref of refs) if (!assigned.has(uid(obj(ref).assignmentId))) invalidClosingResponse();
}
export function parseClosingMonthState(value: unknown, orderId: string): ClosingMonthState {
  const row = obj(value); keys(row, ['plan', 'currentDeliveryDate', 'sourceChanged', 'executorChanges', 'executorWarnings', 'executorCandidates', 'meaning']);
  same(row.meaning, 'unpriced_quantity_month_plan'); nullable(row.currentDeliveryDate, date); bool(row.sourceChanged); references(row.executorCandidates, orderId);
  const assigned = new Set<string>();
  if (row.plan !== null) {
    const p = obj(row.plan); keys(p, ['orderId', 'defaultMonth', 'sourceDeliveryDate', 'versionId', 'version', 'sourceQuantity', 'quantityState', 'sourceFingerprint', 'lines', 'executorBasis']);
    same(p.orderId, orderId); nullable(p.defaultMonth, month); nullable(p.sourceDeliveryDate, date); uid(p.versionId); num(p.version, 1); nullable(p.sourceQuantity, decimal); hash(p.sourceFingerprint);
    member(p.quantityState, ['ready', 'unknown', 'unsupported']); if (p.quantityState === 'unknown') same(p.sourceQuantity, null); else if (p.sourceQuantity === null) invalidClosingResponse();
    const portions = lines(p.lines, p.quantityState === 'ready' ? str(p.sourceQuantity) : null); assignedReferences(p.executorBasis, orderId, portions);
    for (const portion of portions) if (portion.assignmentId) assigned.add(portion.assignmentId);
    if (p.sourceDeliveryDate !== null) same(str(p.sourceDeliveryDate).slice(0, 7), p.defaultMonth);
  }
  const changed = new Set<string>(); for (const value of arr(row.executorChanges, 500)) { const c = obj(value); keys(c, ['assignmentId', 'reason']);
    const id = uid(c.assignmentId); if (!assigned.has(id) || changed.has(id)) invalidClosingResponse(); changed.add(id); same(c.reason, 'attribution_changed'); }
  warnings(row.executorWarnings, row.executorCandidates); return row as unknown as ClosingMonthState;
}
// Compare quantity scopes, not generated split UUIDs. This reuses the exact
// existing pure movement/matching rules without calculating monetary values.
function scopes(rows: ClosingMonthLine[]) {
  const sums = new Map<string, ClosingMonthLine[]>(); for (const row of rows) { const key = JSON.stringify([row.colorId, row.assignmentId, row.month]); sums.set(key, [...(sums.get(key) ?? []), row]); }
  return [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => ({ key, quantity: sumMonthQuantities(rows) }));
}
export function parseClosingMonthPreview(value: unknown, intent: ClosingMonthIntent): ClosingMonthPreview {
  const row = obj(value), moving = intent.action === 'move_months';
  keys(row, ['intent', 'version', 'before', 'after', moving ? 'movedQuantity' : 'matchedQuantity', 'beforeExecutorBasis', 'executorBasis', 'warnings', 'touchedMonths', 'previewHash']);
  same(row.intent, intent); same(row.version, intent.expectedVersion); hash(row.previewHash);
  const before = lines(row.before), after = lines(row.after); same(sumMonthQuantities(before), sumMonthQuantities(after));
  assignedReferences(row.beforeExecutorBasis, intent.orderId, before); assignedReferences(row.executorBasis, intent.orderId, after); warnings(row.warnings, row.executorBasis);
  try {
    let sequence = 0; const taken = new Set(before.map(line => line.id));
    const id = () => { let id: string; do { id = 'ffffffff-ffff-4fff-8fff-' + String(++sequence).padStart(12, '0'); } while (taken.has(id)); taken.add(id); return id; };
    const expected = moving ? moveMonthQuantities(before, intent, id) : matchMonthExecutors(before, intent, id);
    same(scopes(after), scopes(expected.lines)); same(row.touchedMonths, expected.touchedMonths);
    if ('movedQuantity' in expected) same(row.movedQuantity, expected.movedQuantity); else same(row.matchedQuantity, expected.matchedQuantity);
  } catch { return invalidClosingResponse(); }
  if (moving) same(row.executorBasis, row.beforeExecutorBasis);
  else {
    const replaced = new Set(intent.items.flatMap(item => item.parts.flatMap(part => part.assignmentId ? [part.assignmentId] : [])));
    for (const value of arr(row.beforeExecutorBasis, 500)) if (!replaced.has(uid(obj(value).assignmentId))) {
      same(arr(row.executorBasis, 500).find(ref => obj(ref).assignmentId === obj(value).assignmentId), value);
    }
  }
  return row as unknown as ClosingMonthPreview;
}
export function parseClosingMonthOutcome(value: unknown, command: ClosingMonthCommand): Extract<ClosingMonthReceipt, { state: 'recorded' }>['result'] {
  const row = obj(value); same(row.requestId, command.requestId);
  if (row.status === 'rejected') { keys(row, ['requestId', 'status', 'error']); const error = obj(row.error); keys(error, ['status', 'code']);
    if (![404, 409, 422].includes(num(error.status)) || !/^[a-z][a-z0-9_]{1,100}$/u.test(str(error.code))) invalidClosingResponse(); }
  else { keys(row, ['requestId', 'status', 'orderId', 'version', 'versionId', 'operationId']); same(row.status, 'applied'); same(row.orderId, command.intent.orderId);
    same(row.version, command.intent.expectedVersion + 1); uid(row.versionId); const operation = str(row.operationId).split(':');
    same(operation.length, 3); same(operation[0], 'closing-month'); uid(operation[1]); same(operation[2], command.requestId); }
  return row as unknown as Extract<ClosingMonthReceipt, { state: 'recorded' }>['result'];
}
export async function parseClosingMonthReceipt(value: unknown, input: ClosingMonthCommand): Promise<ClosingMonthReceipt> {
  const command = parseClosingMonthCommand(input), row = obj(value); same(row.requestId, command.requestId);
  if (row.state === 'unknown') { keys(row, ['state', 'requestId']); return { state: 'unknown', requestId: command.requestId }; }
  keys(row, ['state', 'requestId', 'commandHash', 'result']); same(row.state, 'recorded'); same(hash(row.commandHash), await closingMonthCommandHash(command));
  return { state: 'recorded', requestId: command.requestId, commandHash: str(row.commandHash), result: parseClosingMonthOutcome(row.result, command) };
}

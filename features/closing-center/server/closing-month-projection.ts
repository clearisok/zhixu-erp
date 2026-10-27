import type { executeClosingMonthMove, previewClosingMonthMove, readOrderClosingMonthPlan, readClosingMonthReceipt } from '../../../server/closing/month-plan-service';
import { matchMonthExecutors, moveMonthQuantities, parseClosingMonthCommand, sumMonthQuantities, validateMonthLines, type ClosingMonthCommand, type ClosingMonthIntent, type ClosingMonthLine } from '../../../server/closing/month-plan-model';
import { reconcileClosingSource, type ObservedClosingSource } from '../../../server/closing/source-reconciliation-model';
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
function observedSource(value: unknown): ObservedClosingSource {
  const row = obj(value); keys(row, ['fingerprint','quantity','quantityState','businessType','colors']); hash(row.fingerprint);
  member(row.quantityState,['ready','unknown','unsupported']); member(row.businessType,['ainuoke_contract','processing']); nullable(row.quantity,decimal);
  if (row.quantityState==='unknown') same(row.quantity,null); else if (row.quantity===null) invalidClosingResponse();
  for (const value of arr(row.colors,2000)) { const color=obj(value); keys(color,['id','quantity','ambiguous']); uid(color.id); decimal(color.quantity); bool(color.ambiguous); }
  if (row.businessType==='processing') same(row.colors,[]);
  return row as unknown as ObservedClosingSource;
}
export function parseClosingMonthState(value: unknown, orderId: string): ClosingMonthState {
  const row = obj(value); keys(row, ['plan', 'currentDeliveryDate', 'sourceChanged', 'observedSource', 'executorChanges', 'executorWarnings', 'executorCandidates', 'meaning']);
  same(row.meaning, 'unpriced_quantity_month_plan'); nullable(row.currentDeliveryDate, date); bool(row.sourceChanged); references(row.executorCandidates, orderId);
  const observed=observedSource(row.observedSource);
  const assigned = new Set<string>();
  if (row.plan !== null) {
    const p = obj(row.plan); keys(p, ['orderId', 'defaultMonth', 'sourceDeliveryDate', 'versionId', 'version', 'sourceQuantity', 'quantityState', 'sourceFingerprint', 'lines', 'executorBasis']);
    same(p.orderId, orderId); nullable(p.defaultMonth, month); nullable(p.sourceDeliveryDate, date); uid(p.versionId); num(p.version, 1); nullable(p.sourceQuantity, decimal); hash(p.sourceFingerprint);
    member(p.quantityState, ['ready', 'unknown', 'unsupported']); if (p.quantityState === 'unknown') same(p.sourceQuantity, null); else if (p.sourceQuantity === null) invalidClosingResponse();
    const portions = lines(p.lines, p.quantityState === 'ready' ? str(p.sourceQuantity) : null); assignedReferences(p.executorBasis, orderId, portions);
    for (const portion of portions) if (portion.assignmentId) assigned.add(portion.assignmentId);
    if (p.sourceDeliveryDate !== null) same(str(p.sourceDeliveryDate).slice(0, 7), p.defaultMonth);
    same(row.sourceChanged,p.sourceFingerprint!==observed.fingerprint);
  }
  else same(row.sourceChanged,false);
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
  const row = obj(value), moving = intent.action === 'move_months', reconciling=intent.action==='reconcile_source';
  keys(row, ['intent', 'version', 'before', 'after', reconciling?'sourceReconciliation':moving ? 'movedQuantity' : 'matchedQuantity', 'beforeExecutorBasis', 'executorBasis', 'warnings', 'touchedMonths', 'previewHash']);
  same(row.intent, intent); same(row.version, intent.expectedVersion); hash(row.previewHash);
  const before = lines(row.before), after = lines(row.after); if (!reconciling) same(sumMonthQuantities(before), sumMonthQuantities(after));
  assignedReferences(row.beforeExecutorBasis, intent.orderId, before); assignedReferences(row.executorBasis, intent.orderId, after); warnings(row.warnings, row.executorBasis);
  try {
    let sequence = 0; const taken = new Set(before.map(line => line.id));
    const id = () => { let id: string; do { id = 'ffffffff-ffff-4fff-8fff-' + String(++sequence).padStart(12, '0'); } while (taken.has(id)); taken.add(id); return id; };
    let expected;
    if (intent.action==='reconcile_source') {
      const info=obj(row.sourceReconciliation); keys(info,['beforeQuantity','beforeQuantityState','quantityDelta','changedLines','addedLines','source']);
      nullable(info.beforeQuantity,decimal); member(info.beforeQuantityState,['ready','unknown','unsupported']);
      const source=observedSource(info.source);
      expected=reconcileClosingSource({sourceQuantity:info.beforeQuantity as string|null,quantityState:info.beforeQuantityState as ObservedClosingSource['quantityState'],lines:before},intent,source,id);
      same(info.quantityDelta,expected.quantityDelta); same(info.changedLines,expected.changedLines); same(info.addedLines,expected.addedLines);
      const originalIds=new Set(before.map(line=>line.id));
      for (const line of expected.lines) if (originalIds.has(line.id)) same(after.find(value=>value.id===line.id),line);
      const retained=new Set(expected.lines.filter(line=>originalIds.has(line.id)).map(line=>line.id));
      if(after.some(line=>originalIds.has(line.id)&&!retained.has(line.id))) invalidClosingResponse();
    } else expected = moving ? moveMonthQuantities(before, intent, id) : matchMonthExecutors(before, intent, id);
    same(scopes(after), scopes(expected.lines)); same(row.touchedMonths, expected.touchedMonths);
    if ('movedQuantity' in expected) same(row.movedQuantity, expected.movedQuantity); else if ('matchedQuantity' in expected) same(row.matchedQuantity, expected.matchedQuantity);
  } catch { return invalidClosingResponse(); }
  if (moving) same(row.executorBasis, row.beforeExecutorBasis);
  else if (intent.action==='match_executors') {
    const replaced = new Set(intent.items.flatMap(item => item.parts.flatMap(part => part.assignmentId ? [part.assignmentId] : [])));
    for (const value of arr(row.beforeExecutorBasis, 500)) if (!replaced.has(uid(obj(value).assignmentId))) {
      same(arr(row.executorBasis, 500).find(ref => obj(ref).assignmentId === obj(value).assignmentId), value);
    }
  }
  else {
    const used=new Set(after.flatMap(line=>line.assignmentId?[line.assignmentId]:[]));
    same(row.executorBasis,arr(row.beforeExecutorBasis,500).filter(ref=>used.has(uid(obj(ref).assignmentId))));
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

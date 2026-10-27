import type { ClosingMonthDisplay } from '../../../server/closing/month-display-model';
import { parseClosingMonthState, type ClosingMonthState } from './closing-month-projection';
import { arr, bool, hash, invalidClosingResponse, keys, member, nullable, num, obj, same, str, uid } from './closing-projection';

export type ClosingMonthDisplayState = ClosingMonthState & { display: ClosingMonthDisplay };
const executorKey = (row: Record<string, unknown>) => JSON.stringify([row.assignmentId, row.resourceSnapshotHash, row.executionType, row.executorId]);
export function parseClosingMonthDisplay(value: unknown, orderId: string): ClosingMonthDisplayState {
  const { display: raw, ...plain } = obj(value), state = parseClosingMonthState(plain, orderId), display = obj(raw);
  keys(display, ['schemaVersion', 'meaning', 'colors', 'executors', 'periods']);
  same(display.schemaVersion, 'server-closing-month-display.v1'); same(display.meaning, 'non_monetary_reference_not_financial_snapshot');
  const expectedColors = [...new Set([...state.observedSource.colors.map(row => row.id), ...(state.plan?.lines.flatMap(row => row.colorId ? [row.colorId] : []) ?? [])])].sort();
  const colors = new Set<string>();
  for (const value of arr(display.colors, 4000)) {
    const row = obj(value); keys(row, ['colorId', 'identityName', 'currentSourceName', 'currentSourceAmbiguous']);
    const id = uid(row.colorId); if (colors.has(id)) invalidClosingResponse(); colors.add(id);
    nullable(row.identityName, value => str(value));
    const source = state.observedSource.colors.filter(row => row.id === id);
    const ambiguous = source.length ? source.length !== 1 || source.some(row => row.ambiguous) : null;
    same(row.currentSourceAmbiguous, ambiguous);
    if (ambiguous === false) str(row.currentSourceName); else same(row.currentSourceName, null);
    if (row.currentSourceAmbiguous !== null) bool(row.currentSourceAmbiguous);
  }
  same([...colors].sort(), expectedColors);
  const expectedRefs = [...new Set([...(state.plan?.executorBasis ?? []), ...state.executorCandidates].map(row => executorKey(row)))].sort();
  const refs = new Set<string>();
  for (const value of arr(display.executors, 1000)) {
    const row = obj(value); keys(row, ['assignmentId', 'resourceSnapshotHash', 'executionType', 'executorId', 'name', 'nameEvidence']);
    uid(row.assignmentId); hash(row.resourceSnapshotHash); member(row.executionType, ['internal', 'outsource']); uid(row.executorId);
    const key = executorKey(row); if (refs.has(key)) invalidClosingResponse(); refs.add(key);
    member(row.nameEvidence, ['immutable_resource_snapshot', 'missing_snapshot']);
    if (row.nameEvidence === 'missing_snapshot') same(row.name, null); else str(row.name);
  }
  same([...refs].sort(), expectedRefs);
  const expectedMonths = [...new Set([...(state.plan?.defaultMonth ? [state.plan.defaultMonth] : []), ...(state.plan?.lines.flatMap(row => row.month ? [row.month] : []) ?? [])])].sort();
  const months = new Set<string>();
  for (const value of arr(display.periods, 2001)) {
    const row = obj(value); keys(row, ['month', 'periodId', 'version', 'status']); const month = str(row.month);
    if (!expectedMonths.includes(month) || months.has(month)) invalidClosingResponse(); months.add(month);
    member(row.status, ['not_created', 'open', 'confirmed', 'locked']);
    if (row.status === 'not_created') { same(row.periodId, null); same(row.version, null); }
    else { uid(row.periodId); num(row.version, 1); }
  }
  same([...months].sort(), expectedMonths);
  return { ...state, display: display as unknown as ClosingMonthDisplay };
}

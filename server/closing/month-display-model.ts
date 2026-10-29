import { closingFail, CLOSING_RESOURCE_READ_BYTES } from './contract.js';
import { planHash } from '../production-scheduling/repository.js';
import type { ClosingExecutionReference } from './basis-model.js';
import type { MonthPlan } from './month-plan-service.js';

export const MONTH_DISPLAY_LIMITS = { sourceColors: 2000, colors: 4000, executors: 1000, months: 2001,
  snapshotBytes: CLOSING_RESOURCE_READ_BYTES, responseBytes: 1024 * 1024 } as const;
export type DisplaySourceColor = { id: string; colorName: string; ambiguous: boolean };
export type DisplayPeriod = { month: string; id: string; status: string; version: number };
const invalid = (): never => closingFail(503, 'closing_month_display_evidence_invalid');
const name = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.length > 2000 || value.includes('\0')
    || Buffer.from(value, 'utf8').toString('utf8') !== value) return invalid();
  return value;
};
export const monthDisplayExecutorKey = (ref: Pick<ClosingExecutionReference, 'assignmentId' | 'resourceSnapshotHash' | 'executionType' | 'executorId'>) =>
  JSON.stringify([ref.assignmentId, ref.resourceSnapshotHash, ref.executionType, ref.executorId]);

/** Scope is derived only from the same order's existing state, never from UI IDs. */
export function closingMonthDisplayScope(plan: MonthPlan | null, colors: readonly DisplaySourceColor[], current: readonly ClosingExecutionReference[]) {
  const colorIds = [...new Set([...colors.map(row => row.id), ...(plan?.lines.flatMap(row => row.colorId ? [row.colorId] : []) ?? [])])].sort();
  const byKey = new Map([...(plan?.executorBasis ?? []), ...current].map(ref => [monthDisplayExecutorKey(ref), ref]));
  const references = [...byKey].sort(([a], [b]) => a.localeCompare(b)).map(([, ref]) => ref);
  const months = [...new Set([...(plan?.defaultMonth ? [plan.defaultMonth] : []), ...(plan?.lines.flatMap(row => row.month ? [row.month] : []) ?? [])])].sort();
  if (colors.length > MONTH_DISPLAY_LIMITS.sourceColors || colorIds.length > MONTH_DISPLAY_LIMITS.colors
    || references.length > MONTH_DISPLAY_LIMITS.executors || months.length > MONTH_DISPLAY_LIMITS.months) closingFail(422, 'closing_month_display_too_large');
  return { colorIds, references, months, hashes: [...new Set(references.map(ref => ref.resourceSnapshotHash))].sort() };
}

export function projectClosingMonthDisplay(scope: ReturnType<typeof closingMonthDisplayScope>, source: readonly DisplaySourceColor[],
  identities: readonly { id: string; name: string }[], snapshots: readonly { hash: string; facts: unknown }[], periods: readonly DisplayPeriod[]) {
  const identityNames = new Map<string, string>(), resourceFacts = new Map<string, Record<string, unknown>>(), periodRows = new Map<string, DisplayPeriod>();
  for (const row of identities) {
    if (!scope.colorIds.includes(row.id) || identityNames.has(row.id)) return invalid();
    identityNames.set(row.id, name(row.name));
  }
  for (const row of snapshots) {
    if (!scope.hashes.includes(row.hash) || resourceFacts.has(row.hash) || !row.facts || typeof row.facts !== 'object' || Array.isArray(row.facts)) return invalid();
    try { if (planHash(row.facts) !== row.hash) return invalid(); } catch { return invalid(); }
    resourceFacts.set(row.hash, row.facts as Record<string, unknown>);
  }
  for (const row of periods) {
    if (!scope.months.includes(row.month) || periodRows.has(row.month) || !['open', 'confirmed', 'locked'].includes(row.status)
      || !Number.isSafeInteger(row.version) || row.version < 1) return invalid();
    periodRows.set(row.month, row);
  }
  return { schemaVersion: 'server-closing-month-display.v1' as const,
    meaning: 'non_monetary_reference_not_financial_snapshot' as const,
    colors: scope.colorIds.map(colorId => {
      const rows = source.filter(row => row.id === colorId), ambiguous = rows.length ? rows.length !== 1 || rows.some(row => row.ambiguous) : null;
      return { colorId, identityName: identityNames.get(colorId) ?? null,
        currentSourceName: rows.length === 1 && ambiguous === false ? name(rows[0].colorName) : null, currentSourceAmbiguous: ambiguous };
    }),
    executors: scope.references.map(ref => {
      const facts = resourceFacts.get(ref.resourceSnapshotHash);
      let executorName: string | null = null;
      if (facts) {
        if (facts.schemaVersion !== 'production-resource.v1' || facts.executionType !== ref.executionType) return invalid();
        const resource = facts[ref.executionType === 'internal' ? 'group' : 'factory'];
        if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return invalid();
        const value = resource as Record<string, unknown>;
        if (value.id !== ref.executorId || value.kind !== (ref.executionType === 'internal' ? 'groups' : 'factories')) return invalid();
        executorName = name(value.name);
      }
      return { assignmentId: ref.assignmentId, resourceSnapshotHash: ref.resourceSnapshotHash, executionType: ref.executionType,
        executorId: ref.executorId, name: executorName, nameEvidence: facts ? 'immutable_resource_snapshot' as const : 'missing_snapshot' as const };
    }),
    periods: scope.months.map(month => { const row = periodRows.get(month); return { month, periodId: row?.id ?? null,
      version: row?.version ?? null, status: row ? row.status as 'open' | 'confirmed' | 'locked' : 'not_created' as const }; }) };
}

export type ClosingMonthDisplay = ReturnType<typeof projectClosingMonthDisplay>;

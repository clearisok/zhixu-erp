import { createHash } from 'node:crypto';
import { projectPaymentRequestContractPage } from './payment-request-observations.js';

export const PAYMENT_SNAPSHOT_LIMITS = Object.freeze({ maxRows: 200, maxPages: 2, pageSize: 100, maxAgeMs: 600000, maxBytes: 16777216 });
export class PaymentSnapshotError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'PaymentSnapshotError'; }
}
type Obj = Record<string, unknown>;
const fail = (code: string): never => { throw new PaymentSnapshotError(code); };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
function object(value: unknown): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('payment_snapshot_invalid_shape');
  return value as Obj;
}
function exact(value: Obj, keys: string[]) {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('payment_snapshot_invalid_shape');
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value === value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}
export type PaymentSnapshotScope = { sourceFingerprint: string; salesContractNo: string; witness: { id: string; BillNo: string; PurContractNo: string } };
function scopeOf(input: unknown): PaymentSnapshotScope {
  const scope = object(input); exact(scope, ['sourceFingerprint', 'salesContractNo', 'witness']);
  const witness = object(scope.witness); exact(witness, ['id', 'BillNo', 'PurContractNo']);
  if (!sha(scope.sourceFingerprint) || !text(scope.salesContractNo, 80) || Object.values(witness).some(value => !text(value, 128))) fail('payment_snapshot_invalid_scope');
  return scope as PaymentSnapshotScope;
}

/** Internal pure validation, not an authorization boundary or an ingestion API.
 * Input pages must come from the checked exact-string bridge. Query filtering,
 * SO ownership, DB permission and activation remain separate required gates. */
export function buildPaymentContractSnapshot(input: unknown, expectedScope: PaymentSnapshotScope, now = Date.now()) {
  if (!Number.isFinite(now) || now < 0) fail('payment_snapshot_clock_unavailable');
  const scope = scopeOf(expectedScope), value = object(input);
  exact(value, ['schemaVersion', 'firstPass', 'secondPass']);
  if (value.schemaVersion !== 'ainuoke-payment-contract-snapshot-input.v1'
    || !Array.isArray(value.firstPass) || !Array.isArray(value.secondPass)
    || value.firstPass.length < 1 || value.firstPass.length > 2
    || value.secondPass.length < 1 || value.secondPass.length > 2) fail('payment_snapshot_invalid_shape');
  const rawPasses = [value.firstPass as unknown[], value.secondPass as unknown[]];
  const passes = rawPasses.map(pages => pages.map(page => ({
    input: object(page), projected: projectPaymentRequestContractPage(page),
  })));
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > PAYMENT_SNAPSHOT_LIMITS.maxBytes) fail('payment_snapshot_limit');
  let total: number | null = null, previousTime = -Infinity, oldestTime = Infinity;
  const captureIds = new Set<string>();
  for (const pages of passes) {
    const pageHashes = new Set<string>();
    for (const [index, { input: page, projected }] of pages.entries()) {
      if (projected.page !== index + 1) fail('payment_snapshot_page_order');
      if (page.sourceFingerprint !== scope.sourceFingerprint) fail('payment_snapshot_scope_changed');
      const count = projected.completeness.reportedTotal;
      if (count < 1) fail('payment_snapshot_empty_unverified');
      if (total !== null && total !== count) fail('payment_snapshot_source_changed');
      total = count;
      const stamp = Date.parse(page.capturedAt as string);
      if (stamp > now || stamp < previousTime) fail('payment_snapshot_capture_time_invalid');
      previousTime = stamp; oldestTime = Math.min(oldestTime, stamp);
      if (captureIds.has(projected.captureId)) fail('payment_snapshot_replayed_pass');
      captureIds.add(projected.captureId);
      if (projected.rows.some(row => row.sourceFields.ExpContractNo.state !== 'known'
        || row.sourceFields.ExpContractNo.raw !== scope.salesContractNo)) fail('payment_snapshot_contract_mismatch');
      const pageHash = hash(projected.rows.map(row => row.sourceFields));
      if (pageHashes.has(pageHash)) fail('payment_snapshot_repeated_page');
      pageHashes.add(pageHash);
    }
    if (pages.length !== Math.ceil(total! / 100)) fail('payment_snapshot_incomplete');
  }
  const first = passes[0].flatMap(page => page.projected.rows), second = passes[1].flatMap(page => page.projected.rows);
  if (hash(first.map(row => row.sourceFields)) !== hash(second.map(row => row.sourceFields))) fail('payment_snapshot_source_changed');
  if (!first.some(row => Object.entries(scope.witness).every(([key, raw]) => {
    const field = row.sourceFields[key as keyof typeof row.sourceFields]; return field.state === 'known' && field.raw === raw;
  }))) fail('payment_snapshot_witness_missing');
  if (now - oldestTime >= PAYMENT_SNAPSHOT_LIMITS.maxAgeMs) fail('payment_snapshot_stale');
  const trace = passes.flatMap((pages, pass) => pages.map(({ input: page, projected }) => ({
    pass: pass + 1, page: projected.page, captureId: projected.captureId,
    rawResponseSha256: page.rawResponseSha256 as string, capturedAt: page.capturedAt as string,
    rowCount: projected.rows.length, contentHash: hash(projected.rows.map(row => row.sourceFields)),
  })));
  const snapshotId = hash(['6086941', scope.sourceFingerprint, scope.salesContractNo, trace]);
  return {
    schemaVersion: 'ainuoke-payment-contract-snapshot.v1' as const, snapshotId, reportId: '6086941' as const,
    sourceFingerprint: scope.sourceFingerprint, salesContractNo: scope.salesContractNo,
    observedFrom: new Date(oldestTime).toISOString(), observedThrough: new Date(previousTime).toISOString(),
    expiresAt: new Date(oldestTime + PAYMENT_SNAPSHOT_LIMITS.maxAgeMs).toISOString(),
    completeness: { selectedContractComplete: true as const, reportedRows: total!, pagesPerPass: passes[0].length,
      allCompanyRecordsRead: false as const, consistency: 'two_pass_observed_rows_not_transaction' as const },
    trace, rows: first, aggregation: 'none' as const, deduplication: 'none_unverified_event_identity' as const,
    sourceActivation: 'not_activated' as const, mappingVerified: false as const, bankPaymentStatus: 'not_inferred' as const,
  };
}
export type PaymentContractSnapshot = ReturnType<typeof buildPaymentContractSnapshot>;

/** Freshness is not publication authorization. Persistence must additionally
 * check immutable content, effective SO, source profile and fresh permissions. */
export function paymentSnapshotFreshness(snapshot: PaymentContractSnapshot, expected: Pick<PaymentSnapshotScope, 'sourceFingerprint' | 'salesContractNo'>, now = Date.now()) {
  if (!Number.isFinite(now) || now < 0) return { readable: false as const, reason: 'clock_unavailable' as const };
  if (snapshot.schemaVersion !== 'ainuoke-payment-contract-snapshot.v1' || !sha(snapshot.snapshotId)
    || !Number.isFinite(Date.parse(snapshot.observedFrom)) || !Number.isFinite(Date.parse(snapshot.observedThrough))
    || Date.parse(snapshot.observedThrough) < Date.parse(snapshot.observedFrom)
    || Date.parse(snapshot.expiresAt) !== Date.parse(snapshot.observedFrom) + PAYMENT_SNAPSHOT_LIMITS.maxAgeMs)
    return { readable: false as const, reason: 'invalid_snapshot' as const };
  if (snapshot.sourceFingerprint !== expected.sourceFingerprint || snapshot.salesContractNo !== expected.salesContractNo)
    return { readable: false as const, reason: 'source_scope_changed' as const };
  if (now < Date.parse(snapshot.observedThrough) || now >= Date.parse(snapshot.expiresAt)) return { readable: false as const, reason: 'stale' as const };
  return { readable: true as const, reason: 'fresh' as const };
}

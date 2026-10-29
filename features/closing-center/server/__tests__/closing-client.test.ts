import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { parseClosingIntent, parseClosingCommand, type ClosingCommand } from '../../../../server/closing/contract';
import { parseClosingReadQuery } from '../../../../server/closing/read-contract';
import { canonicalPlanJson } from '../../../../server/production-scheduling/canonical-json';
import { projectClosingSnapshot, type ClosingSnapshot } from '../../../../server/closing/snapshot';
import { projectClosingPriceBasis, type ClosingCommercialBasis } from '../../../../server/closing/basis-model';
import type { TrustedIdentity } from '../../../../server/auth/session';
import { closingCommandHash, createClosingClient, parseClosingReceipt, CLOSING_RESPONSE_LIMIT } from '../closing-client';
import { parseClosingBasis, parseClosingDetail, parseClosingHistory, parseClosingPeriods, parseClosingPreview } from '../closing-projection';
import { acknowledgeClosingPending, closingPendingKey, readClosingPending, saveClosingPending } from '../closing-pending';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const view = { sale: true, work: true }, hidden = { sale: false, work: false }, scope = { userId: id(1) };
const periodIntent = () => ({ action: 'create_period' as const, month: '2026-10', taxRatePercent: '13', taxRateConfirmed: true as const, remark: '' });
const command = (): ClosingCommand => ({ requestId: id(2), intent: periodIntent(), previewHash: 'a'.repeat(64) });
const period = () => ({ id: id(3), month: '2026-10', versionId: id(4), version: 1, status: 'open', taxRatePercent: '13', actorName: 'Synthetic', action: 'create_period', recordedAt: '2026-10-27T00:00:00.000Z' });
const amount = () => ({ numerator: '100', denominator: '1', decimal: '100', scale: 6, rounding: 'half_up' });
function snapshot(channels = { sales: true, work: true }): ClosingSnapshot {
  return { schemaVersion: 'server-closing-allocation.v1', order: { id: id(5), orderNo: 'SO-SYN', businessType: 'ainuoke_contract' },
    commercial: { id: id(6), version: 1, quoteId: 'q', revisionId: 'r', priceVersionId: 'pv' }, colorId: id(7), colorName: 'Blue', assignmentId: null,
    quantity: '1', channels, taxRatePercent: '13', prices: { ...(channels.sales ? { sale: { price: '113', currency: 'CNY' as const } } : {}), ...(channels.work ? { work: { price: '0', currency: 'USD' as const } } : {}) },
    quantityBasis: { order: '100', color: '50', planned: null, completed: null }, executor: null, productionBasis: [], reviewBasis: [], remark: 'PRIVATE WORK NOTE' };
}
const actor = (visible = view): TrustedIdentity => ({ internalUserId: '1', userId: id(1), username: 'synthetic', userName: 'Synthetic', permissions: [...(visible.sale ? ['commercial.sale.view' as const] : []), ...(visible.work ? ['commercial.labor.view' as const] : [])] });
function allocation(visible = view) { return { id: id(8), periodId: id(3), versionId: id(9), version: 1, status: 'active', actorName: 'Synthetic', action: 'create_allocation', recordedAt: '2026-10-27T00:00:00.000Z',
  snapshot: projectClosingSnapshot(snapshot(), actor(visible)), executionReview: { status: 'unchanged', changes: [], requiresReview: false, lockedSnapshotPreserved: false } }; }
function detail(visible = view) {
  const out = (allowed: boolean, currency: string) => allowed ? { visibility: 'allowed', currency, amount: amount() } : { visibility: 'restricted' };
  return { period: period(), summary: { activeCount: 1, voidedCount: 0, registeredQuantity: '1', salesQuantity: '1', distributionWorkQuantity: '1', processingServiceQuantity: '0', quantityMeaning: 'one_manual_quantity_per_record_channels_are_not_added',
    garmentSalesCny: out(visible.sale, 'CNY'), distributionLaborUsd: out(visible.work, 'USD'), processingServiceUsd: out(visible.work, 'USD') },
    total: 1, offset: 0, limit: 25, reviewRequiredCount: 0, laterCorrectionCount: 0, items: [allocation(visible)], source: 'server_closing_snapshots', automaticMonthAllocation: false, currentPeriodVersion: 1 };
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
async function receipt(c = command()) {
  const intent = c.intent, periodId = 'periodId' in intent ? intent.periodId : id(3), allocated = intent.action.endsWith('_allocation');
  return { state: 'recorded', requestId: c.requestId, commandHash: await closingCommandHash(c), result: { requestId: c.requestId, status: 'applied', periodId,
    periodVersion: 'periodId' in intent ? intent.expectedPeriodVersion + 1 : 1, periodStatus: intent.action === 'confirm_period' ? 'confirmed' : intent.action === 'lock_period' ? 'locked' : 'open',
    ...(allocated ? { allocationId: 'allocationId' in intent ? intent.allocationId : id(8), allocationVersion: 'expectedVersion' in intent ? intent.expectedVersion + 1 : 1 } : {}), operationId: 'operation-' + id(10) } };
}
class MemoryStorage { values = new Map([['zhixu.erp.local.closing-center', 'KEEP']]); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); } }

test('shared intent normalization preserves explicit tax, no default/FX and Buffer-equivalent Unicode validation', () => {
  assert.deepEqual(parseClosingIntent(periodIntent()), periodIntent());
  for (const value of ['中文', '\ufeffa', '\uFEFF', ' ', '😀', 'e\u0301', '\ud800', '\udc00', '\0', 'A'.repeat(2001)]) {
    const accepted = value.length <= 2000 && !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value;
    if (accepted) assert.equal((parseClosingIntent({ ...periodIntent(), remark: value }) as ReturnType<typeof periodIntent>).remark, value.trim());
    else assert.throws(() => parseClosingIntent({ ...periodIntent(), remark: value }));
  }
  for (const patch of [{ taxRateConfirmed: false }, { taxRatePercent: 13 }, { taxRatePercent: null }, { taxRatePercent: '13e0' }, { fxRate: '7' }]) assert.throws(() => parseClosingIntent({ ...periodIntent(), ...patch }));
});

test('browser command digest equals existing server canonical hash; all actions validate original CAS outcomes', async () => {
  const data = { quantity: '1', colorId: id(7), channels: { sales: true, work: false }, assignmentId: null, executor: null, remark: '' };
  const intents = [periodIntent(), { action: 'create_allocation', periodId: id(3), expectedPeriodVersion: 2, orderId: id(5), data },
    ...['update_allocation', 'review_allocation', 'void_allocation'].map(action => ({ action, periodId: id(3), expectedPeriodVersion: 2, allocationId: id(8), expectedVersion: 3, reason: 'Explicit', ...(action === 'update_allocation' ? { data } : {}) })),
    ...['confirm_period', 'unconfirm_period', 'lock_period', 'reopen_period'].map(action => ({ action, periodId: id(3), expectedPeriodVersion: 2, reason: 'Explicit' }))];
  for (const intent of intents) {
    const c = parseClosingCommand({ ...command(), intent }), r = await receipt(c);
    assert.equal(await closingCommandHash(c), createHash('sha256').update(canonicalPlanJson(c)).digest('hex')); assert.equal((await parseClosingReceipt(r, c)).state, 'recorded');
    await assert.rejects(() => parseClosingReceipt({ ...r, result: { ...r.result, periodVersion: 999 } }, c));
  }
});

test('receipt binds exact original action/body/hash, rejects substituted IDs, primitive enums and hidden fields', async () => {
  const c = command(), r = await receipt();
  for (const patch of [{ commandHash: 'b'.repeat(64) }, { requestId: id(12) }, { rawCommand: c }, { result: { ...r.result, periodStatus: ['open'] } }, { result: { ...r.result, status: [['applied']] } },
    { result: { ...r.result, operationId: id(10) } }, { result: { ...r.result, salePrice: '100' } }, { result: { requestId: c.requestId, status: 'rejected', error: { status: '409', code: 'closing_preview_changed' } } }]) await assert.rejects(() => parseClosingReceipt({ ...r, ...patch }, c));
  await assert.rejects(() => parseClosingReceipt(r, { ...c, intent: { ...periodIntent(), month: '2026-11' } }));
  assert.equal((await parseClosingReceipt({ state: 'unknown', requestId: c.requestId }, c)).state, 'unknown');
});

test('actor/tab pending preserves original normalized command, other actors and Browser ledger bytes', () => {
  const storage = new MemoryStorage(), c = command(); saveClosingPending(storage, scope, c); c.intent = { ...periodIntent(), month: '2027-01' };
  assert.deepEqual(readClosingPending(storage, scope), command()); assert.equal(readClosingPending(storage, { userId: id(11) }), null);
  assert.throws(() => saveClosingPending(storage, scope, c), /closing_pending_locked/u); assert.throws(() => acknowledgeClosingPending(storage, scope, c));
  acknowledgeClosingPending(storage, scope, command()); assert.equal(readClosingPending(storage, scope), null); assert.equal(storage.getItem('zhixu.erp.local.closing-center'), 'KEEP');
});

test('bad/future/noncanonical pending and failed readback never overwrite the original bytes', () => {
  for (const raw of ['{broken', JSON.stringify({ schemaVersion: 2 }), 'x'.repeat(131073), JSON.stringify({ schemaVersion: 1, userId: scope.userId, savedAt: new Date().toISOString(), command: { ...command(), intent: { ...periodIntent(), taxRatePercent: '013.0' } } })]) {
    const storage = new MemoryStorage(), key = closingPendingKey(scope); storage.setItem(key, raw);
    assert.throws(() => readClosingPending(storage, scope)); assert.throws(() => saveClosingPending(storage, scope, command())); assert.throws(() => acknowledgeClosingPending(storage, scope, command())); assert.equal(storage.getItem(key), raw);
  }
  const storage = new MemoryStorage(); storage.setItem = () => {}; assert.throws(() => saveClosingPending(storage, scope, command()));
});

test('period list validates canonical time, filters, full page counts, duplicate IDs and primitive state', () => {
  const q = parseClosingReadQuery(new URLSearchParams('year=2026&status=open'), 'list'), page = { items: [period()], total: 1, offset: 0, limit: 25 };
  assert.equal(parseClosingPeriods(page, q, view).items.length, 1);
  for (const patch of [{ items: [{ ...period(), status: ['open'] }] }, { items: [{ ...period(), month: '2025-10' }] }, { total: 2 }, { items: [{ ...period(), recordedAt: '2026-10-27 00:00:00+00' }] }, { cost: '100' }]) assert.throws(() => parseClosingPeriods({ ...page, ...patch }, q, view));
});

test('detail preserves independent exact currency buckets, zero work and restricted free-text rules', () => {
  const q = parseClosingReadQuery(new URLSearchParams(), 'period'), d = detail(); assert.equal(parseClosingDetail(d, id(3), q, view).items.length, 1);
  for (const visible of [hidden, { sale: true, work: false }, { sale: false, work: true }]) {
    const value = detail(visible); assert.equal(parseClosingDetail(value, id(3), q, visible).items.length, 1);
    const row = value.items[0]; assert.equal(Object.hasOwn(row.snapshot, 'remark'), false);
    assert.throws(() => parseClosingDetail({ ...value, items: [{ ...row, reason: 'HIDDEN' }] }, id(3), q, visible));
  }
  for (const change of [{ ...d, automaticMonthAllocation: true }, { ...d, summary: { ...d.summary, garmentSalesCny: { visibility: 'allowed', currency: 'USD', amount: amount() } } },
    { ...d, summary: { ...d.summary, totalAmount: '100' } }, { ...d, items: [{ ...d.items[0], periodId: id(11) }] }]) assert.throws(() => parseClosingDetail(change, id(3), q, view));
  assert.throws(() => parseClosingDetail(d, id(3), q, hidden));
});

test('processing snapshot contains only service USD output, never garment sales or duplicated totals', () => {
  const raw = snapshot({ sales: false, work: true }); raw.order.businessType = 'processing'; raw.colorId = null; raw.colorName = null;
  const value = detail(); value.items[0].snapshot = projectClosingSnapshot(raw, actor()); value.summary.salesQuantity = '0';
  assert.equal(parseClosingDetail(value, id(3), parseClosingReadQuery(new URLSearchParams(), 'period'), view).items[0].snapshot.outputs.work?.visibility, 'allowed');
  assert.equal(Object.hasOwn(value.items[0].snapshot.outputs, 'garmentSale'), false);
});

test('preview is bound to original manual quantity, period, intent and no freely supplied prices', () => {
  const intent = parseClosingIntent({ action: 'create_allocation', periodId: id(3), expectedPeriodVersion: 1, orderId: id(5), data: { quantity: '1', colorId: id(7), channels: { sales: true, work: true }, assignmentId: null, executor: null, remark: '' } });
  const value = { intent, previewHash: 'a'.repeat(64), period: { id: id(3), month: '2026-10', version: 1, status: 'open', taxRatePercent: '13' }, before: null,
    after: { status: 'active', snapshot: projectClosingSnapshot(snapshot(), actor()) }, nextStatus: 'open', allocationCount: 0, warnings: [], quantityConfirmation: 'manual', productionAndShipments: 'reference_only' };
  assert.equal(parseClosingPreview(value, intent, view).quantityConfirmation, 'manual');
  for (const change of [{ intent: { ...intent, orderId: id(11) } }, { period: { ...value.period, version: 2 } }, { after: { ...value.after, snapshot: { ...value.after.snapshot, quantity: '2' } } }, { quantityConfirmation: 'automatic' }, { quotedPrice: '100' }]) assert.throws(() => parseClosingPreview({ ...value, ...change }, intent, view));
});

test('history binds kind, entity, stable version anchor and page; an empty page cannot impersonate another target', () => {
  const q = parseClosingReadQuery(new URLSearchParams('version=1'), 'history'), value = { entityType: 'period', entityId: id(3), asOfVersion: 1, items: [period()], hasMore: false, offset: 0, limit: 25 };
  assert.equal(parseClosingHistory(value, 'period', id(3), q, view).items.length, 1);
  for (const patch of [{ entityId: id(11), items: [] }, { entityType: ['period'] }, { asOfVersion: 2 }, { items: [{ ...period(), version: 2 }] }, { items: [period(), period()] }]) assert.throws(() => parseClosingHistory({ ...value, ...patch }, 'period', id(3), q, view));
});

test('basis keeps CNY work blocked, rejects eligible currency relabelling and does not invent monthly production', () => {
  const price = { visibility: 'allowed', value: { price: '0', currency: 'CNY' }, requiredCurrency: 'USD', eligibility: { state: 'blocked', reason: 'usd_labor_version_required' }, bucket: 'processing_service_usd' };
  const value = { schemaVersion: 'server-closing-basis.v1', readOnly: true, order: { id: id(5), orderNo: 'SO', businessType: 'processing', version: 1, lifecycleState: 'draft', quantity: '100.000', attributionVersion: 0 },
    commercial: { id: id(6), version: 1, quoteId: 'q', revisionId: 'r', scope: 'legacy_uniform', processingBatchId: id(12) }, priceLines: [{ colorId: null, colorName: null, quantity: null, scope: 'order_wide', commercialVersionId: id(6), priceVersionId: 'pv', workPrice: price }],
    executionReferences: [], executionFingerprint: 'b'.repeat(64), executionFactsMeaning: 'cumulative_actual_not_monthly_events', unperformed: ['period_assignment', 'tax_calculation', 'foreign_exchange', 'output_recognition', 'closing_confirmation', 'closing_lock'] };
  assert.equal(parseClosingBasis(value, id(5), view).priceLines[0].workPrice.visibility, 'allowed');
  const changed = structuredClone(value); changed.priceLines[0].workPrice.eligibility = { state: 'eligible', reason: null as unknown as string };
  assert.throws(() => parseClosingBasis(changed, id(5), view)); assert.throws(() => parseClosingBasis({ ...value, readOnly: false }, id(5), view)); assert.throws(() => parseClosingBasis(value, id(11), view));
});

test('actual Server price projection retains the color/commercial union and ambiguous read-only diagnostics', () => {
  const commercial: ClosingCommercialBasis = { id: id(6), version: 1, quoteId: 'q', revisionId: 'r', quoteType: 'distribution', scope: 'line_items',
    lines: [{ colorId: id(2001), colorName: 'Removed', priceVersionId: 'pv', salePrice: '113', laborPrice: '0', laborCurrency: 'USD' }] };
  const wrap = (priceLines: ReturnType<typeof projectClosingPriceBasis>) => ({ schemaVersion: 'server-closing-basis.v1', readOnly: true,
    order: { id: id(5), orderNo: 'SO', businessType: 'ainuoke_contract', version: 1, lifecycleState: 'draft', quantity: '100', attributionVersion: 0 },
    commercial: { id: commercial.id, version: 1, quoteId: 'q', revisionId: 'r', scope: 'line_items', processingBatchId: null }, priceLines, executionReferences: [], executionFingerprint: 'b'.repeat(64),
    executionFactsMeaning: 'cumulative_actual_not_monthly_events', unperformed: ['period_assignment', 'tax_calculation', 'foreign_exchange', 'output_recognition', 'closing_confirmation', 'closing_lock'] });
  const colors = Array.from({ length: 1000 }, (_, i) => ({ id: id(100 + i), colorName: 'Color ' + i, quantity: '1', ambiguous: false }));
  const union = wrap(projectClosingPriceBasis('ainuoke_contract', colors, commercial, actor().permissions)); assert.equal(union.priceLines.length, 1001);
  assert.ok(new TextEncoder().encode(JSON.stringify(union)).byteLength < CLOSING_RESPONSE_LIMIT); assert.equal(parseClosingBasis(union, id(5), view).priceLines.length, 1001);
  commercial.lines[0].colorId = id(7);
  const ambiguous = wrap(projectClosingPriceBasis('ainuoke_contract', [{ id: id(7), colorName: '蓝', quantity: '1', ambiguous: true }, { id: id(7), colorName: '蓝 ', quantity: '2', ambiguous: true }], commercial, actor().permissions));
  assert.equal(parseClosingBasis(ambiguous, id(5), view).priceLines.length, 2);
  const sale = ambiguous.priceLines[0].garmentSale!; if (sale.visibility !== 'allowed') assert.fail(); sale.eligibility = { state: 'eligible', reason: null };
  assert.throws(() => parseClosingBasis(ambiguous, id(5), view));
});

test('transport is bounded, session-only, no-store and never automatically retries an uncertain command', async () => {
  const calls: RequestInit[] = [], client = createClosingClient({ visibility: () => view, fetchImpl: (async (_url, init) => { calls.push(init!); throw Error('lost'); }) as typeof fetch });
  await assert.rejects(() => client.submit(command(), () => true)); assert.equal(calls.length, 1); assert.equal(calls[0].credentials, 'include'); assert.equal(calls[0].cache, 'no-store'); assert.deepEqual(JSON.parse(String(calls[0].body)), command());
  const restore = createClosingClient({ visibility: () => view, fetchImpl: (async (_url, init) => { assert.equal(init?.method, 'GET'); return response(await receipt()); }) as typeof fetch });
  assert.equal((await restore.receipt(command(), () => true)).state, 'recorded');
});

test('invalid queries and old owners fail before fetching; mid-response owner changes retain pending bytes', async () => {
  let live = false, calls = 0; const storage = new MemoryStorage(); saveClosingPending(storage, scope, command());
  const client = createClosingClient({ visibility: () => view, fetchImpl: (async () => { calls++; live = false; return response(await receipt()); }) as typeof fetch });
  await assert.rejects(() => client.receipt(command(), () => live)); assert.equal(calls, 0);
  await assert.rejects(() => client.periods(new URLSearchParams('offset=-1'), () => true)); assert.equal(calls, 0);
  live = true; await assert.rejects(() => client.receipt(command(), () => live)); assert.equal(calls, 1); assert.deepEqual(readClosingPending(storage, scope), command());
});

test('malformed, oversized and unauthorized receipts cannot establish a terminal outcome', async () => {
  for (const r of [new Response('{bad'), new Response(' '.repeat(CLOSING_RESPONSE_LIMIT + 1)), response({ error: { code: 'not_a_trusted_message' } }, 403)]) {
    const client = createClosingClient({ visibility: () => hidden, fetchImpl: (async () => r) as typeof fetch }); await assert.rejects(() => client.receipt(command(), () => true));
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { LABOR_ADOPTION_PERMISSIONS, laborProductComparison, laborSourceIdentity, parseLaborAdoptionCommand, parseLaborAdoptionIntent, type LaborConfirmationSource } from './labor-adoption-model.js';
import type { ProductSnapshot } from './product-snapshot.js';

const a = randomUUID(), b = randomUUID();
const intent = () => ({ orderId: a, expectedVersion: 1, targetRevisionId: 'revision-2', colorIds: [b, null], productUnchangedConfirmed: true as const, reason: 'Explicit USD confirmation' });
const product = (): ProductSnapshot => ({ schemaVersion: 'order-product.v1', quoteCode: 'QT-SYN', revision: { revisionId: 'revision-1', createdAt: '2026-01-01', createdBy: 'A', readOnly: true,
  note: '', baseInfo: { quoteType: 'distribution', quoteStyleNo: 'SYN', brandId: 'brand', garmentLeadDate: '2026-10-01' }, confirmationSummary: { confirmedCount: 1 } },
priceVersion: { id: 'same-price-version', quantity: '50', name: 'Base', description: 'Same specification', pricingParameters: { laborCurrency: 'CNY', usdCnyRate: '7', manufacturingCountry: 'KH' },
  labor: { value: '20', description: 'Same process' }, fabrics: [{ id: 'f', unitPrice: '2', gsm: '150' }], trims: [], otherCosts: [], confirmation: { confirmedLaborPrice: '20' } } });
test('labor adoption requires an existing order version, explicit colors and unchanged-product confirmation', () => {
  const parsed = parseLaborAdoptionIntent(intent()); assert.equal(parsed.orderId, a); assert.deepEqual(parsed.colorIds, [null, b]);
  for (const patch of [{ expectedVersion: 0 }, { productUnchangedConfirmed: false }, { colorIds: [] }, { colorIds: [b, b.toUpperCase()] }, { colorIds: [null, null] }, { targetRevisionId: '' }, { reason: '' }]) assert.throws(() => parseLaborAdoptionIntent({ ...intent(), ...patch }));
});
test('the quote context cannot inject price, currency, another quote/PV, actor or a creation owner', () => {
  for (const patch of [{ price: '1' }, { currency: 'USD' }, { quoteId: 'other' }, { priceVersionId: 'other' }, { actorId: a }, { ownerId: a }]) assert.throws(() => parseLaborAdoptionIntent({ ...intent(), ...patch }));
});
test('canonical request identity and color ordering are stable before hashing', () => {
  const command = { requestId: randomUUID(), intent: intent(), previewHash: 'a'.repeat(64) };
  assert.deepEqual(parseLaborAdoptionCommand({ ...command, requestId: command.requestId.toUpperCase(), intent: { ...command.intent, orderId: a.toUpperCase(), colorIds: [null, b.toUpperCase()] } }), parseLaborAdoptionCommand(command));
  assert.throws(() => parseLaborAdoptionCommand({ ...command, expectedVersion: 1 }));
});
test('PostgreSQL-unrepresentable or oversized identifiers/reasons are rejected without truncation', () => {
  for (const reason of ['\0', '\ud800', 'x'.repeat(2001)]) assert.throws(() => parseLaborAdoptionIntent({ ...intent(), reason }));
  assert.equal(parseLaborAdoptionIntent({ ...intent(), reason: '中文确认\u0001' }).reason, '中文确认\u0001');
});
test('adoption requires labor grants and domain authority, never sale or cost grants', () => {
  assert.ok(LABOR_ADOPTION_PERMISSIONS.includes('commercial.labor.edit'));
  assert.equal(LABOR_ADOPTION_PERMISSIONS.some(permission => permission.startsWith('commercial.sale.') || permission === 'quote.cost.view' as string), false);
});
test('a copied successor Revision may confirm USD without replacing the stored product', () => {
  const old = product(), next = structuredClone(old); next.revision.revisionId = 'revision-2'; next.revision.createdBy = 'B'; next.revision.note = 'USD confirmation'; next.revision.readOnly = false;
  (next.priceVersion.pricingParameters as Record<string, unknown>).laborCurrency = 'USD'; next.priceVersion.confirmation = { confirmedLaborPrice: '2.5' };
  const before = structuredClone(old); assert.deepEqual(laborProductComparison(old, next), { compatible: true, revisionNoteChanged: true }); assert.deepEqual(old, before);
});
test('material, process, quantity, dates, FX and unknown business changes are never silently ignored', () => {
  const mutations = [(p: ProductSnapshot) => { p.priceVersion.fabrics = [{ id: 'f', unitPrice: '2', gsm: '151' }]; },
    (p: ProductSnapshot) => { p.priceVersion.labor = { value: '20', description: 'Changed process' }; },
    (p: ProductSnapshot) => { p.priceVersion.quantity = '51'; },
    (p: ProductSnapshot) => { (p.revision.baseInfo as Record<string, unknown>).garmentLeadDate = '2026-10-02'; },
    (p: ProductSnapshot) => { (p.priceVersion.pricingParameters as Record<string, unknown>).usdCnyRate = '8'; },
    (p: ProductSnapshot) => { p.priceVersion.futureSpecification = 'not understood'; },
    (p: ProductSnapshot) => { p.priceVersion.id = 'another-plan'; }];
  for (const mutate of mutations) { const next = product(); mutate(next); assert.equal(laborProductComparison(product(), next).compatible, false); }
});
test('public source identity contains no hidden amount, cost or product digest', () => {
  const source: LaborConfirmationSource = { schemaVersion: 'quote-labor-confirmation.v1', quoteId: 'q', revisionId: 'r', priceVersionId: 'p', quoteVersion: 2, sourceKind: 'cct', sourceCctId: a,
    sourceCctVersion: 3, confirmedAt: '2026-10-27T00:00:00Z', price: '12345.6789', currency: 'USD', productHash: 'b'.repeat(64) };
  const result = JSON.stringify(laborSourceIdentity(source)); assert.equal(result.includes(source.price), false); assert.equal(result.includes(source.productHash), false);
});

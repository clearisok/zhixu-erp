import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMaterialCommercialContext } from '../features/ainuoke-material-progress/__tests__/historical-commercial-read-policy.ts';
const actor = { permissions: ['order.view', 'style_progress.read'] };
const terms = { linkage: 'linked', current: { customerConfirmedPrice: '987654.123', confirmedLaborPrice: '876543.12', laborCurrency: 'USD' } };
test('historical helper: absent commercial policy denies protected fields in response/export/cache bytes', () => {
  const result = projectMaterialCommercialContext(actor, terms);
  for (const bytes of [JSON.stringify(result), JSON.stringify([result]), JSON.stringify(new Map([['scope', result]]), (_k,v) => v instanceof Map ? [...v] : v)]) {
    assert.ok(!bytes.includes('987654')); assert.ok(!bytes.includes('876543')); assert.ok(!bytes.includes('USD'));
  }
  assert.equal(result.commercialVisibility.salesPrice, 'restricted'); assert.ok(!Object.hasOwn(result, 'salesPrice'));
});
test('historical helper: explicit independently granted field policy preserves null/zero and currency without mutation', () => {
  const before = structuredClone(terms);
  const result = projectMaterialCommercialContext(actor, terms, () => ({ salesPrice: false, laborPrice: true }));
  assert.ok(!Object.hasOwn(result, 'salesPrice')); assert.equal(result.laborPrice, '876543.12'); assert.equal(result.laborCurrency, 'USD');
  assert.deepEqual(terms, before);
  assert.equal(projectMaterialCommercialContext(actor, { ...terms, current: { ...terms.current, customerConfirmedPrice: '0' } }, () => ({ salesPrice: true, laborPrice: false })).salesPrice, '0');
});

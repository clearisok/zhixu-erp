import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalUnitConfirmations } from './local-unit-confirmations.js';

const sourceKey = 'synthetic-units', fingerprint = 'a'.repeat(64), id = '00000000-0000-4000-8000-000000000001';
const fixture = () => ({ schemaVersion: 'local-material-unit-confirmations.v1', sourceKey, accountFingerprint: fingerprint,
  orders: [{ salesOrderId: id, receipts: [{ id: 'synthetic-receipt', salesContractNo: 'SYN-UNIT', demandId: 'synthetic-demand',
    evidenceKey: 'synthetic-exact-evidence', confirmedBy: 'synthetic-human', confirmedAt: '2026-11-07T10:00:00Z',
    evidenceReference: 'synthetic-user-answer', unit: { value: '千克', acceptedSourceUnits: [null], ratio: 1 } }] }] });

test('local receipt is bound to one order, source and account and cloned before use', () => {
  const raw = fixture(), result = parseLocalUnitConfirmations(raw, sourceKey, fingerprint);
  raw.orders[0].receipts[0].unit.value = 'changed';
  assert.equal(result.byOrder.get(id)?.[0].unit?.value, '千克');
  assert.equal(result.byOrder.size, 1);
  assert.throws(() => parseLocalUnitConfirmations(fixture(), 'wrong-source', fingerprint), /local_unit_confirmation_invalid/);
  assert.throws(() => parseLocalUnitConfirmations(fixture(), sourceKey, 'b'.repeat(64)), /local_unit_confirmation_invalid/);
});
test('unknown fields, duplicate orders and conversion factors cannot introduce implicit unit or responsibility changes', () => {
  const extra = fixture(); Object.assign(extra.orders[0].receipts[0], { procurementResponsibility: 'factory' });
  assert.throws(() => parseLocalUnitConfirmations(extra, sourceKey, fingerprint));
  const duplicate = fixture(); duplicate.orders.push(structuredClone(duplicate.orders[0]));
  assert.throws(() => parseLocalUnitConfirmations(duplicate, sourceKey, fingerprint));
  const factor = fixture(); factor.orders[0].receipts[0].unit.ratio = 2;
  assert.throws(() => parseLocalUnitConfirmations(factor, sourceKey, fingerprint));
});

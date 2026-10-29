import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClosingMonthDisplay } from '../closing-month-display-projection';
import { parseClosingMonthState } from '../closing-month-projection';
import { createClosingClient } from '../closing-client';

const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
function payload() {
  return { plan: { orderId: id(1), defaultMonth: '2027-02', sourceDeliveryDate: '2027-02-01', versionId: id(4), version: 1,
    sourceQuantity: '10', quantityState: 'ready', sourceFingerprint: 'a'.repeat(64), executorBasis: [],
    lines: [{ id: id(5), colorId: id(2), assignmentId: null, month: '2027-12', quantity: '10' }] }, currentDeliveryDate: '2027-02-01', sourceChanged: false,
    observedSource: { fingerprint: 'a'.repeat(64), quantity: '10', quantityState: 'ready', businessType: 'ainuoke_contract', colors: [{ id: id(2), quantity: '10', ambiguous: false }] },
    executorChanges: [], executorWarnings: [], executorCandidates: [], meaning: 'unpriced_quantity_month_plan',
    display: { schemaVersion: 'server-closing-month-display.v1', meaning: 'non_monetary_reference_not_financial_snapshot',
      colors: [{ colorId: id(2), identityName: 'Blue', currentSourceName: ' BLUE ', currentSourceAmbiguous: false }], executors: [],
      periods: [{ month: '2027-02', periodId: null, version: null, status: 'not_created' }, { month: '2027-12', periodId: id(9), version: 3, status: 'locked' }] } };
}
test('opt-in display strictly covers the same order and all referenced months without changing the old payload', () => {
  const p = payload(); assert.equal(parseClosingMonthDisplay(p, id(1)).display.colors[0].identityName, 'Blue');
  const { display, ...old } = p; void display;
  assert.doesNotThrow(() => parseClosingMonthState(old, id(1)));
  assert.throws(() => parseClosingMonthState(p, id(1))); assert.throws(() => parseClosingMonthDisplay(old, id(1)));
  for (const mutate of [
    (x: ReturnType<typeof payload>) => { x.display.colors[0].colorId = id(99); },
    (x: ReturnType<typeof payload>) => { x.display.colors.push(x.display.colors[0]); },
    (x: ReturnType<typeof payload>) => { x.display.periods.pop(); },
    (x: ReturnType<typeof payload>) => { x.display.periods[0].periodId = id(9); },
    (x: ReturnType<typeof payload>) => { Object.assign(x.display.colors[0], { salePrice: '8' }); },
    (x: ReturnType<typeof payload>) => { Object.assign(x.display.periods[1], { taxRatePercent: '13' }); },
    (x: ReturnType<typeof payload>) => { x.display.colors[0].currentSourceAmbiguous = true; },
  ]) { const copy = structuredClone(p); mutate(copy); assert.throws(() => parseClosingMonthDisplay(copy, id(1))); }
});
test('the display client performs one bounded GET without amount permissions, storage or a mutation', async () => {
  const calls: string[] = [];
  const client = createClosingClient({ visibility: () => ({ sale: false, work: false }), fetchImpl: (async (url, init) => {
    calls.push(String(url)); assert.equal(init?.method, 'GET'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.body, undefined);
    return new Response(JSON.stringify(payload()));
  }) as typeof fetch });
  assert.equal((await client.monthDisplay(id(1), () => true)).display.periods[1].status, 'locked');
  assert.deepEqual(calls, ['/api/v1/closing/orders/' + id(1) + '/month-plan?view=display']);
  await assert.rejects(client.monthDisplay(id(1), () => false), { code: 'closing_owner_changed' }); assert.equal(calls.length, 1);
});

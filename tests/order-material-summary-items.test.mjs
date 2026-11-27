import test from 'node:test';
import assert from 'node:assert/strict';
import { materialSummaryItems } from '../features/ainuoke-material-progress/material-summary-items.ts';

function row(id, status, purchaseShortfall, unit = '千克', extra = {}) {
  return { demand: { id, supplyMethod: '自购', materialType: 'fabric' }, status, purchaseShortfall, unit,
    procurementResponsibility: 'guomao', purchases: [], inbounds: [],
    business: { pendingInbound: { reason: 'not_started', quantity: null, unit: null } }, ...extra };
}
function model(rows, sourceStatus = 'ready') {
  const eligible = rows.filter(r => r.demand.supplyMethod === '自购');
  return { provenance: 'server_snapshot', progress: { sourceStatus, rows, summary: { basis: 'demand_items',
    fabric: { demands: eligible.filter(r => r.demand.materialType === 'fabric').length },
    trim: { demands: eligible.filter(r => r.demand.materialType === 'trim').length } } } };
}
test('item rates use existing procurement gaps and readiness, never add KG/metres/pieces', () => {
  const result = materialSummaryItems(model([
    row('kg', 'pending_inbound', 0, '千克'), row('metre', 'purchasing', 9, '米'),
    row('piece', 'ready', 0, '个', { demand: { id: 'piece', supplyMethod: '自购', materialType: 'trim' } }),
  ]));
  assert.equal(result.demands, 3); assert.equal(result.procurementComplete, 2);
  assert.equal(result.procurementRate, 2 / 3); assert.equal(result.inboundRate, 1 / 3);
  assert.equal(result.pendingPurchase, 1);
});
test('inbound readiness does not prove procurement completion', () => {
  const result = materialSummaryItems(model([row('independent', 'ready', 2)]));
  assert.equal(result.procurementRate, 0); assert.equal(result.inboundRate, 1);
});
test('records and pending purchased inbound are independent from completion; unknown blocks rates', () => {
  const result = materialSummaryItems(model([
    row('unknown', null, null, null, { purchases: [{id:'p'}], inbounds: [{id:'i'}], business: {pendingInbound:{reason:'known',quantity:5,unit:'米'}} }),
    row('uncertain', null, null, null, { unverifiedEvents: [{flow:'purchase'}], business: {pendingInbound:{reason:'association_pending',quantity:null,unit:null}} }),
  ]));
  assert.equal(result.purchaseRecords, 2); assert.equal(result.inboundRecords, 1);
  assert.equal(result.procurementRate, null); assert.equal(result.inboundRate, null);
  assert.equal(result.procurementUnknown, 2); assert.equal(result.reviewItems, 2);
  assert.equal(result.pendingInbound.length, 1); assert.equal(result.pendingInboundUnknown, 1);
});
test('factory and other supplies are preserved but excluded from Server self-purchase denominator', () => {
  const rows = [row('self','ready',0), ...['厂供','客供',''].map((supplyMethod,i) => row('other'+i,null,null,null,{demand:{id:'other'+i,supplyMethod,materialType:'trim'}}))];
  const result = materialSummaryItems(model(rows));
  assert.equal(result.demands, 1); assert.equal(result.otherSupply, 3); assert.equal(result.procurementRate, 1);
});
test('stale, failed, incomplete, absent and inconsistent sources never become zero or a percentage', () => {
  assert.equal(materialSummaryItems(null), null);
  for (const status of ['incomplete','not_connected','identity_mismatch']) assert.equal(materialSummaryItems(model([row('a','ready',0)],status)), null);
  const inconsistent = model([row('a','ready',0)]); inconsistent.progress.summary.fabric.demands = 2;
  assert.equal(materialSummaryItems(inconsistent), null);
  assert.equal(materialSummaryItems(model([row('duplicate','ready',0),row('duplicate','ready',0)])), null);
});
test('a valid empty source has zero demand items but no zero-denominator rate', () => {
  const result = materialSummaryItems(model([]));
  assert.equal(result.demands, 0); assert.equal(result.purchaseRecords, 0);
  assert.equal(result.procurementRate, null); assert.equal(result.inboundRate, null);
});

test('retained old sources show labelled record counts without current completion or rates', () => {
  for (const status of ['stale','source_failed']) {
    const result = materialSummaryItems(model([row('old','ready',0,'米',{purchases:[{id:'p'}]})],status));
    assert.equal(result.historical, true); assert.equal(result.demands, 1); assert.equal(result.purchaseRecords, 1);
    assert.equal(result.procurementRate, null); assert.equal(result.inboundRate, null);
    assert.equal(result.reviewItems, 1); assert.equal(result.procurementUnknown, 1);
    assert.equal(materialSummaryItems(model([],status)), null);
  }
});

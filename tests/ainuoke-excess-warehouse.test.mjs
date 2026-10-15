import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMaterialProgress } from '../features/ainuoke-material-progress/projection.ts';
import { createSyntheticMaterialSource, syntheticOrder } from '../features/ainuoke-material-progress/synthetic-source.ts';

function source(value, { unit = '条', omitted = false } = {}) {
  const pages = createSyntheticMaterialSource();
  const row = pages[0].rows.find(item => item.values.GoodsNo === 'SYNTHETIC-MAT-ready');
  row.sourceRowIdentity = '6087050:sha256:synthetic-excess-main';
  Object.assign(row.values, { TotalNum: 32, cgnum: 32, rknum: 31, QtyUnit: unit });
  if (!omitted) row.values.num_dyc = value;
  pages[0].rows = [row]; pages[0].total = 1;
  return pages;
}
const project = pages => {
  const view = projectMaterialProgress(syntheticOrder, pages);
  assert.equal(view.sourceStatus, 'ready');
  assert.equal(view.rows.length, 1);
  return view.rows[0];
};
function joinRow(pages, changes = {}, suffix = 'second') {
  const next = structuredClone(pages[0].rows[0]);
  next.sourceRowIdentity = '6087050:sha256:synthetic-excess-' + suffix;
  Object.assign(next.values, changes);
  pages[0].rows.push(next); pages[0].total++;
  return next;
}

test('source excess warehouse stays separate: 31 inbound plus 1 extra never makes readiness 32', () => {
  const row = project(source(1));
  assert.equal(row.inbounds[0].quantity, 31);
  assert.deepEqual(row.inbounds[0].excessWarehouse, {
    sourceField: 'num_dyc', quantity: 1, unit: '条', status: 'known', includedInInbound: false,
  });
  assert.equal(row.inbound, 31); assert.equal(row.pendingInbound, 1);
  assert.equal(row.purchased, 32); assert.equal(row.demand.requiredQuantity, 32);
  assert.equal(row.status, 'pending_inbound');
});

test('absent null and blank excess remain unknown while explicit numeric zero is known', () => {
  for (const pages of [source(null, { omitted: true }), source(null), source(''), source('   ')]) {
    const row = project(pages);
    assert.equal(row.inbounds[0].excessWarehouse.status, 'missing');
    assert.equal(row.inbounds[0].excessWarehouse.quantity, null);
    assert.equal(row.inbound, 31);
  }
  for (const value of [0, '0', '0.00']) {
    const fact = project(source(value)).inbounds[0].excessWarehouse;
    assert.equal(fact.status, 'known'); assert.equal(fact.quantity, 0);
  }
});

test('malformed negative non-finite boolean and nondecimal quantities do not become zero', () => {
  for (const value of [-1, '-0.1', false, true, 'invalid', '0x10', '1,2', 'Infinity', Number.NaN, Number.POSITIVE_INFINITY]) {
    const row = project(source(value));
    assert.equal(row.inbounds[0].excessWarehouse.status, 'invalid', String(value));
    assert.equal(row.inbounds[0].excessWarehouse.quantity, null);
    assert.equal(row.inbound, 31);
  }
});

test('valid decimal source text is normalized without rounding or unit conversion', () => {
  for (const [value, expected] of [['1.60', 1.6], [' 1,234.500 ', 1234.5], ['.25', 0.25]]) {
    const fact = project(source(value)).inbounds[0].excessWarehouse;
    assert.equal(fact.status, 'known'); assert.equal(fact.quantity, expected); assert.equal(fact.unit, '条');
  }
});

test('missing unit keeps the source value qualified as unit unknown, never defaults to 个', () => {
  for (const unit of [null, '', '   ', 42]) {
    const fact = project(source(1, { unit })).inbounds[0].excessWarehouse;
    assert.equal(fact.status, 'unit_unknown'); assert.equal(fact.quantity, 1); assert.equal(fact.unit, null);
  }
});

test('conflicting units block an unqualified excess quantity even if numbers agree', () => {
  const pages = source(1); joinRow(pages, { QtyUnit: '米' });
  const row = project(pages);
  assert.equal(row.unitStatus, 'conflict'); assert.equal(row.inbound, null);
  assert.equal(row.inbounds[0].excessWarehouse.status, 'unit_conflict');
  assert.equal(row.inbounds[0].excessWarehouse.quantity, null);
  assert.equal(row.inbounds[0].quantity, 31);
});

test('joined and exact duplicate rows retain one inbound and one extra quantity, not a sum', () => {
  const pages = source(1); joinRow(pages, { num_dyc: '1.00' });
  pages[0].rows.push(structuredClone(pages[0].rows[0])); pages[0].total++;
  const row = project(pages);
  assert.equal(row.inbounds.length, 1); assert.equal(row.inbound, 31);
  assert.equal(row.inbounds[0].excessWarehouse.quantity, 1);
});

test('different extra values on the same inbound event fail closed without losing original inbound', () => {
  const pages = source(1); joinRow(pages, { num_dyc: 2 });
  const row = project(pages);
  assert.equal(row.inbounds.length, 1); assert.equal(row.inbound, 31);
  assert.equal(row.inbounds[0].excessWarehouse.status, 'conflict');
  assert.equal(row.inbounds[0].excessWarehouse.quantity, null);
});

test('partially missing joined evidence stays incomplete instead of taking the one available value', () => {
  const pages = source(1); const added = joinRow(pages); delete added.values.num_dyc;
  const row = project(pages);
  assert.equal(row.inbounds[0].excessWarehouse.status, 'incomplete');
  assert.equal(row.inbounds[0].excessWarehouse.quantity, null);
});

test('one invalid joined row prevents a known extra value', () => {
  const pages = source(1); joinRow(pages, { num_dyc: -1 });
  assert.equal(project(pages).inbounds[0].excessWarehouse.status, 'invalid');
});

test('source value changes and removals replace only the extra fact while event and purchase identity remain', () => {
  const pages = source(1); const first = project(pages); const original = structuredClone(pages);
  pages[0].rows[0].values.num_dyc = 3;
  pages[0].rows[0].sourceRowIdentity = '6087050:sha256:synthetic-excess-changed';
  const changed = project(pages);
  delete pages[0].rows[0].values.num_dyc;
  const missing = project(pages);
  assert.equal(changed.inbounds[0].excessWarehouse.quantity, 3);
  assert.equal(missing.inbounds[0].excessWarehouse.quantity, null);
  assert.equal(missing.inbounds[0].excessWarehouse.status, 'missing');
  for (const row of [changed, missing]) {
    assert.equal(row.demand.id, first.demand.id); assert.equal(row.inbounds[0].id, first.inbounds[0].id);
    assert.deepEqual(row.purchases, first.purchases); assert.equal(row.inbound, first.inbound); assert.equal(row.status, first.status);
  }
  assert.equal(original[0].rows[0].values.num_dyc, 1);
});

test('an extra field without a valid inbound event never fabricates a warehouse event', () => {
  const pages = source(1); Object.assign(pages[0].rows[0].values, { rknum: 0, rkdh: null });
  const row = project(pages); assert.equal(row.inbounds.length, 0); assert.equal(row.inbound, 0);
});

test('separate demands retain their own units and extra values without a material group total', () => {
  const pages = source(1); joinRow(pages, { GoodsNo: 'SYNTHETIC-EXCESS-OTHER', CnColor: '蓝色', QtyUnit: '米', num_dyc: 2 });
  const view = projectMaterialProgress(syntheticOrder, pages);
  assert.equal(view.sourceStatus, 'ready'); assert.equal(view.groups.length, 1); assert.equal(view.rows.length, 2);
  assert.deepEqual(new Set(view.rows.map(row => row.inbounds[0].excessWarehouse.unit)), new Set(['条', '米']));
  assert.deepEqual(new Set(view.rows.map(row => row.inbounds[0].excessWarehouse.quantity)), new Set([1, 2]));
  assert.equal(view.summary.quantitiesAggregatedAcrossDemands, false);
  assert.equal('excessWarehouse' in view.groups[0], false);
});

test('similar field names cannot impersonate the exact upstream num_dyc mapping', () => {
  const pages = source(null, { omitted: true }); Object.assign(pages[0].rows[0].values, { Num_dyc: 7, excessWarehouse: 8 });
  assert.equal(project(pages).inbounds[0].excessWarehouse.status, 'missing');
});

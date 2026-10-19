import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMaterialSourceRows as normalize } from '../features/style-progress/parser/material-normalization-pipeline.ts';
import { buildAinuokeMaterialApiPreview } from '../features/style-progress/service/ainuoke-material-api-preview.ts';
import { projectMaterialProgress } from '../features/ainuoke-material-progress/projection.ts';

const now = '2026-10-15T00:00:00Z';
const base = {
  salesContractNo: 'SYN-IDENTITY', materialType: '辅料', materialCode: 'SYN-CODE',
  materialName: 'SYN-MATERIAL', materialColor: 'SYN-COLOR', specification: 'SYN-SPEC',
  supplyMethod: '采购', requiredQuantity: 100,
};
const row = (values = {}, index = 1, sourceRowIdentity) => ({
  trace: {
    sourceKind: 'api', reportId: '6087050',
    sourceRowIdentity: sourceRowIdentity ?? '6087050:sha256:' + String(index).repeat(64),
    snapshotHash: 'a'.repeat(64), fetchedAt: now,
    queryContext: { insideOrderNo: 'SYN-FACTORY' }, sourceSchemaVersion: 'ainuoke-direct-read.v2',
  },
  rawFields: {}, values: { ...base, ...values },
});
const excelRow = (values = {}, index = 1, trace = {}) => ({
  trace: { sourceKind: 'excel', fileHash: 'synthetic-file', fileName: 'synthetic.xlsx', sheetName: 'Sheet1', sourceRow: index, ...trace },
  rawFields: {}, values: { ...base, ...values },
});
const run = rows => normalize({ rows, batchId: 'synthetic-collision-guard', sourceArtifactHash: 'frozen-source', now });
// Frozen real hash collisions, found using synthetic values against the unmodified pipeline.
const demandCollision = [
  { salesContractNo: 'SYN-G5-COLLISION', materialCode: 'SYN-CODE-38498', materialName: 'SYN-556y82-38498' },
  { salesContractNo: 'SYN-G5-COLLISION', materialCode: 'SYN-CODE-104406', materialName: 'SYN-wf4hkm-104406' },
];
function rejects(rows, kind) {
  const before = JSON.stringify(rows);
  assert.throws(() => run(rows), error => error.code === 'material_identity_hash_collision'
    && error.kind === kind && error.message === 'material_identity_hash_collision');
  assert.equal(JSON.stringify(rows), before);
}

test('different material codes with the same legacy demand hash reject instead of merging', () => {
  rejects(demandCollision.map((values, index) => row(values, index + 1)), 'demand');
});
test('separator-ambiguous full tuples are compared structurally rather than by joined text', () => {
  rejects([row({ materialCode: 'A\u001fB', materialName: 'C' }), row({ materialCode: 'A', materialName: 'B\u001fC' }, 2)], 'demand');
});
test('different supplementary Unicode material names cannot merge through the legacy hash', () => {
  rejects([row({ materialName: 'SYN-\u{20000}' }), row({ materialName: 'SYN-\u{20001}' }, 2)], 'demand');
});
test('different SHA256 source identities with a colliding legacy raw ID cannot overwrite traces', () => {
  const ids = [
    '6087050:sha256:d0ebf9b8633a6d015d71b6d865e295490a03c4981213154222312012265ed80e',
    '6087050:sha256:8aeba1d980a8b98ae9ea5578a2481030f29f0914a4b933bf4ac5dc467b550779',
  ];
  rejects(ids.map((id, index) => row({}, index + 1, id)), 'raw');
});
test('Excel uses the same full demand identity guard before preview or persistence', () => {
  rejects(demandCollision.map((values, index) => excelRow(values, index + 1)), 'demand');
});
test('Excel source identity guards delimiter-ambiguous file and sheet tuples', () => {
  rejects([
    excelRow({}, 1, { fileHash: 'A\u001fB', sheetName: 'C' }),
    excelRow({}, 1, { fileHash: 'A', sheetName: 'B\u001fC' }),
  ], 'raw');
});

const eventPairs = {
  purchase: [['SYN-EVENT-1by68g5-3797', 16], ['SYN-EVENT-19l8gkj-25299', 13]],
  inbound: [['SYN-EVENT-xzy29f-12259', 12], ['SYN-EVENT-kpjn5d-20289', 18]],
  outbound: [['SYN-EVENT-xzy29f-12259', 12], ['SYN-EVENT-kpjn5d-20289', 18]],
  shipment: [['SYN-EVENT-12969v1-7549', 11], ['SYN-EVENT-1avq2ni-25422', 17]],
};
for (const kind of Object.keys(eventPairs)) {
  test(kind + ' event hash collision cannot silently discard another document or quantity', () => {
    const fields = {
      purchase: ['purchaseOrderNo', 'purchaseDate', 'purchaseQuantity'],
      inbound: ['inboundDocumentNo', 'inboundDate', 'inboundQuantity'],
      outbound: ['outboundDocumentNo', 'outboundDate', 'outboundQuantity'],
      shipment: ['shipmentDocumentNo', 'shipmentDate', 'shipmentQuantity'],
    }[kind];
    rejects(eventPairs[kind].map(([document, quantity], index) => row({
      [fields[0]]: document, [fields[1]]: '2026-10-15', [fields[2]]: quantity,
      ...(kind === 'shipment' ? { transportMode: 'SYN-ROAD' } : {}),
    }, index + 1)), kind);
  });
}

function splitPurchaseRows(makeRow = row) {
  return [200, 156].map((quantity, index) => makeRow({
    purchaseOrderNo: 'SYN-PUR-356', purchaseDate: '2026-10-15', purchaseQuantity: 356,
    purchaseUnitPrice: 1.25, purchaseAmount: 445, inboundDocumentNo: 'SYN-IN-' + (index + 1),
    inboundDate: '2026-10-15', inboundQuantity: quantity,
  }, index + 1));
}
test('356 two-source purchase remains one event with both references and frozen IDs unchanged', () => {
  const preview = run(splitPurchaseRows());
  assert.deepEqual(preview.demands.map(value => value.id), ['material-demand-ju4grv']);
  assert.deepEqual(preview.purchaseEvents.map(value => value.id), ['material-purchase-1im86r0']);
  assert.deepEqual(preview.inboundEvents.map(value => value.id), ['material-inbound-1lrqpul', 'material-inbound-19fa7iw']);
  assert.deepEqual(preview.rawRows.map(value => value.id), ['material-raw-api-15l5o81', 'material-raw-api-bwvbtt']);
  assert.equal(preview.purchaseEvents[0].quantity, 356);
  assert.equal(preview.purchaseEvents[0].sourceReferences.length, 2);
});
test('Excel legitimate repeated purchase remains one event with both source rows', () => {
  const preview = run(splitPurchaseRows(excelRow));
  assert.equal(preview.demands.length, 1);
  assert.equal(preview.purchaseEvents.length, 1);
  assert.equal(preview.purchaseEvents[0].quantity, 356);
  assert.deepEqual(preview.purchaseEvents[0].sourceRows, [1, 2]);
  assert.equal(preview.inboundEvents.reduce((sum, event) => sum + event.quantity, 0), 356);
});
test('theoretical 115.50 and purchased 118 remain separate valid facts', () => {
  const preview = run([row({ requiredQuantity: 115.5, purchaseOrderNo: 'SYN-PUR-118', purchaseDate: '2026-10-15', purchaseQuantity: 118 })]);
  assert.equal(preview.demands[0].requiredQuantity, 115.5);
  assert.equal(preview.purchaseEvents[0].quantity, 118);
});
test('existing NFKC, trim and numeric-equivalence normalization is not falsely rejected', () => {
  const preview = run([row({}), row({ materialCode: 'ＳＹＮ－ＣＯＤＥ', materialName: ' SYN-MATERIAL ', requiredQuantity: '100.00' }, 2)]);
  assert.equal(preview.demands.length, 1);
  assert.equal(preview.stats.duplicateDemandRows, 1);
});

function snapshots() {
  return [{
    schemaVersion: 'ainuoke-direct-read.v2', reportId: '6087050', fetchedAt: now,
    queryContext: { kind: 'inside_order', insideOrderNo: 'SYN-FACTORY' },
    page: 1, pageSize: 50, total: 2, snapshotHash: 'b'.repeat(64),
    rows: demandCollision.map((values, index) => ({
      sourceRowIdentity: '6087050:sha256:' + String(index + 1).repeat(64),
      values: { id: index + 1, lx: '辅料', ExpContractNo: values.salesContractNo,
        insideorderno: 'SYN-FACTORY', GoodsNo: values.materialCode, CnName: values.materialName,
        CnColor: 'SYN-COLOR', CnComposition: 'SYN-SPEC', SupplyType: '采购', TotalNum: 100,
        QtyUnit: '个', cgdh: 'SYN-PUR-' + index, cgrq: '2026-10-15', cgnum: 10 + index },
    })),
  }];
}
test('API preview rejects a colliding source before any import command can consume it', () => {
  assert.throws(() => buildAinuokeMaterialApiPreview({ snapshots: snapshots() }),
    error => error.code === 'material_identity_hash_collision' && error.kind === 'demand');
});
test('Server read projection clears all material facts and does not leak parser/source values', () => {
  const view = projectMaterialProgress({ salesContractNo: 'SYN-G5-COLLISION', styleNo: 'SYN-STYLE', insideOrderNo: 'SYN-FACTORY' }, snapshots());
  assert.equal(view.sourceStatus, 'incomplete');
  assert.deepEqual(view.rows, []);
  assert.deepEqual(view.groups, []);
  assert.equal(view.message.includes('SYN-CODE'), false);
  assert.equal(view.message.includes('1rwqpji'), false);
});
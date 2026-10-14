import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../http/errors.js';
import { parseProcessingBatchDraft, parseProcessingBatchConfirmation, parseProcessingBatchCancellation, parseProcessingBatchConsumption, processingDraftHash } from './processing-batch-model.js';
const draft = () => ({requestId: randomUUID(), quoteId: 'synthetic-quote', revisionId: 'revision-1', priceVersionId: 'price-1', customerName: 'Synthetic Customer', businessStyleNo: 'SYN-001', quantity: '120.50', orderDate: '2026-10-14', deliveryDate: '2026-11-01', customerReference: '', deliveryRequirements: '', referenceOrderId: null});
const rejects = (run: () => unknown) => assert.throws(run, (e: unknown) => e instanceof HttpError && e.status === 400);

test('processing draft preserves exact version and decimal, with independent repeated order requests', () => {
  const a = parseProcessingBatchDraft(draft());
  const b = parseProcessingBatchDraft({...a, requestId: randomUUID()});
  assert.notEqual(a.requestId, b.requestId);
  assert.equal(a.quantity, '120.5');
  assert.equal(processingDraftHash(a), processingDraftHash(b));
  assert.equal(a.referenceOrderId, null);
});
test('unknown fields cannot supply creation source, prices, owner, status or an SO', () => {
  for (const key of ['creationSource','salePrice','laborPrice','ownerId','status','salesOrderId','businessType']) rejects(() => parseProcessingBatchDraft({...draft(), [key]: 'forged'}));
});
test('positive decimal quantity has no exponent, precision loss, negative, zero or default', () => {
  for (const quantity of [null, undefined, 1, '', '0', '000.000000', '-1', '1e3', 'NaN', 'Infinity', '1000000000000', '1.1234567']) rejects(() => parseProcessingBatchDraft({...draft(), quantity}));
  assert.equal(parseProcessingBatchDraft({...draft(), quantity: '0.000001'}).quantity, '0.000001');
  assert.equal(parseProcessingBatchDraft({...draft(), quantity: '999999999999.999999'}).quantity, '999999999999.999999');
});
test('calendar dates and delivery ordering are strict; delivery may be unspecified', () => {
  for (const orderDate of ['2026-02-29','2026-13-01','0000-01-01','2026-2-01','2026-01-01T00:00:00Z',null]) rejects(() => parseProcessingBatchDraft({...draft(), orderDate}));
  rejects(() => parseProcessingBatchDraft({...draft(), deliveryDate: '2026-10-13'}));
  assert.equal(parseProcessingBatchDraft({...draft(), deliveryDate: null}).deliveryDate, null);
});
test('customer, business style, provenance and reference identity must be explicit', () => {
  for (const field of ['customerName','businessStyleNo','quoteId','revisionId','priceVersionId']) rejects(() => parseProcessingBatchDraft({...draft(), [field]: ' '}));
  rejects(() => parseProcessingBatchDraft({...draft(), referenceOrderId: 'quote-id'}));
  const id = randomUUID();
  assert.equal(parseProcessingBatchDraft({...draft(), referenceOrderId: id.toUpperCase()}).referenceOrderId, id);
  rejects(() => parseProcessingBatchDraft({...draft(), customerName: 'x\u0000y'}));
});
test('idempotency hash captures all business changes but is independent of property order', () => {
  const a = parseProcessingBatchDraft(draft());
  const reversed = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(processingDraftHash(a), processingDraftHash(parseProcessingBatchDraft(reversed)));
  for (const patch of [{quantity:'121'}, {customerReference:'PO-1'}, {deliveryRequirements:'Pack separately'}, {priceVersionId:'price-2'}, {referenceOrderId:randomUUID()}]) assert.notEqual(processingDraftHash(a), processingDraftHash(parseProcessingBatchDraft({...a,...patch})));
});
test('confirmation requires exact source fingerprint and optimistic version; cancellation requires reason', () => {
  const command = {requestId: randomUUID(), expectedVersion: 1, sourceFingerprint: 'a'.repeat(64)};
  assert.equal(parseProcessingBatchConfirmation(command).expectedVersion, 1);
  for (const expectedVersion of [0,-1,1.5,'1',null,Number.MAX_SAFE_INTEGER+1]) rejects(() => parseProcessingBatchConfirmation({...command, expectedVersion}));
  rejects(() => parseProcessingBatchConfirmation({...command, sourceFingerprint:'abc'}));
  rejects(() => parseProcessingBatchCancellation({requestId:randomUUID(),expectedVersion:1,reason:' '}));
  assert.equal(parseProcessingBatchCancellation({requestId:randomUUID(),expectedVersion:1,reason:' Customer cancelled '}).reason, 'Customer cancelled');
});
test('bulk consumption bounded and rejects same batch twice including UUID case variants', () => {
  const requestId = randomUUID(), batchId = randomUUID();
  assert.equal(parseProcessingBatchConsumption({requestId,items:[{batchId,expectedVersion:1}]}).items.length,1);
  rejects(() => parseProcessingBatchConsumption({requestId,items:[]}));
  rejects(() => parseProcessingBatchConsumption({requestId,items:Array.from({length:26},()=>({batchId:randomUUID(),expectedVersion:1}))}));
  rejects(() => parseProcessingBatchConsumption({requestId,items:[{batchId,expectedVersion:1},{batchId:batchId.toUpperCase(),expectedVersion:1}]}));
  rejects(() => parseProcessingBatchConsumption({requestId,items:[{batchId,expectedVersion:1,quoteId:'forged'}]}));
});
test('parsers reject malformed JSON types without unexpected runtime errors', () => {
  for (const raw of [null,undefined,[],true,'',1]) for (const parse of [parseProcessingBatchDraft,parseProcessingBatchConfirmation,parseProcessingBatchCancellation,parseProcessingBatchConsumption]) rejects(() => parse(raw));
});

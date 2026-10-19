import { createHash } from 'node:crypto';
import { HttpError } from '../http/errors.js';
import { canonicalDecimal } from '../quotes/model.js';
import { identityUuid } from './identity-model.js';
import { parseCommercialProvenance } from './commercial-source.js';
import type { QuoteProvenance } from '../confirmed-commercial-terms/repository.js';

export const MAX_PROCESSING_BATCH_CONSUMPTION = 25;
export type ProcessingBatchDraft = QuoteProvenance & {
  requestId: string;
  customerName: string;
  businessStyleNo: string;
  quantity: string;
  orderDate: string;
  deliveryDate: string | null;
  customerReference: string;
  deliveryRequirements: string;
  referenceOrderId: string | null;
};
export type ProcessingBatchConfirmation = {
  requestId: string; expectedVersion: number; sourceFingerprint: string;
};
export type ProcessingBatchCancellation = {
  requestId: string; expectedVersion: number; reason: string;
};
export type ProcessingBatchConsumption = {
  requestId: string;
  items: Array<{batchId: string; expectedVersion: number}>;
};
function invalid(): never {
  throw new HttpError(400, 'invalid_processing_batch_command', 'Invalid processing batch command');
}
function object(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  return raw as Record<string, unknown>;
}
function shape(raw: unknown, keys: string[]): Record<string, unknown> {
  const value = object(raw);
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
  return value;
}
function text(value: unknown, limit: number, required = true): string {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) invalid();
  const result = value.trim();
  if (required && !result) invalid();
  return result;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !identityUuid.test(value)) invalid();
  return value.toLowerCase();
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) invalid();
  return value as number;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value < '0001-01-01' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid();
  return value;
}
/** A draft represents one customer order, not one quote. It never allocates an SO. */
export function parseProcessingBatchDraft(raw: unknown): ProcessingBatchDraft {
  const value = shape(raw, ['requestId','quoteId','revisionId','priceVersionId','customerName','businessStyleNo','quantity','orderDate','deliveryDate','customerReference','deliveryRequirements','referenceOrderId']);
  const provenance = parseCommercialProvenance({quoteId: value.quoteId, revisionId: value.revisionId, priceVersionId: value.priceVersionId});
  if (typeof value.quantity !== 'string' || !/^\d{1,12}(?:\.\d{1,6})?$/u.test(value.quantity) || !/[1-9]/u.test(value.quantity)) invalid();
  const orderDate = date(value.orderDate);
  const deliveryDate = value.deliveryDate === null ? null : date(value.deliveryDate);
  if (deliveryDate && deliveryDate < orderDate) invalid();
  return {...provenance, requestId: uuid(value.requestId), customerName: text(value.customerName, 300), businessStyleNo: text(value.businessStyleNo, 256), quantity: canonicalDecimal(value.quantity), orderDate, deliveryDate, customerReference: text(value.customerReference, 256, false), deliveryRequirements: text(value.deliveryRequirements, 4000, false), referenceOrderId: value.referenceOrderId === null ? null : uuid(value.referenceOrderId)};
}
export function parseProcessingBatchConfirmation(raw: unknown): ProcessingBatchConfirmation {
  const value = shape(raw, ['requestId','expectedVersion','sourceFingerprint']);
  if (typeof value.sourceFingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(value.sourceFingerprint)) invalid();
  return {requestId: uuid(value.requestId), expectedVersion: version(value.expectedVersion), sourceFingerprint: value.sourceFingerprint};
}
export function parseProcessingBatchCancellation(raw: unknown): ProcessingBatchCancellation {
  const value = shape(raw, ['requestId','expectedVersion','reason']);
  return {requestId: uuid(value.requestId), expectedVersion: version(value.expectedVersion), reason: text(value.reason, 2000)};
}
/** The two UI entrypoints submit the same command. Client-selected creation source/price is forbidden. */
export function parseProcessingBatchConsumption(raw: unknown): ProcessingBatchConsumption {
  const value = shape(raw, ['requestId','items']);
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_PROCESSING_BATCH_CONSUMPTION) invalid();
  const items = value.items.map(item => {
    const row = shape(item, ['batchId','expectedVersion']);
    return {batchId: uuid(row.batchId), expectedVersion: version(row.expectedVersion)};
  });
  if (new Set(items.map(item => item.batchId)).size !== items.length) invalid();
  return {requestId: uuid(value.requestId), items};
}
/** Hash parsed business data only; request identity is scoped separately by authenticated actor. */
export function processingDraftHash(command: ProcessingBatchDraft): string {
  return createHash('sha256').update(JSON.stringify([
    command.quoteId, command.revisionId, command.priceVersionId, command.customerName,
    command.businessStyleNo, command.quantity, command.orderDate, command.deliveryDate,
    command.customerReference, command.deliveryRequirements, command.referenceOrderId,
  ])).digest('hex');
}

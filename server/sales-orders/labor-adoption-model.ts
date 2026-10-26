import { HttpError } from '../http/errors.js';
import { identityUuid } from './identity-model.js';
import { productHash, type ProductSnapshot } from './product-snapshot.js';
import type { PermissionKey } from '../../features/permissions/model/permissions.js';

export const LABOR_ADOPTION_PERMISSIONS = ['order.view', 'quote.view', 'order.commercial.adopt', 'commercial.labor.view', 'commercial.labor.edit'] as const satisfies readonly PermissionKey[];
export type LaborAdoptionIntent = { orderId: string; expectedVersion: number; targetRevisionId: string; colorIds: (string | null)[]; productUnchangedConfirmed: true; reason: string };
export type LaborAdoptionCommand = { requestId: string; intent: LaborAdoptionIntent; previewHash: string };
export type LaborConfirmationSource = {
  schemaVersion: 'quote-labor-confirmation.v1'; quoteId: string; revisionId: string; priceVersionId: string; quoteVersion: number;
  sourceKind: 'cct' | 'quote_confirmation'; sourceCctId: string | null; sourceCctVersion: number | null; confirmedAt: string;
  price: string; currency: 'USD'; productHash: string;
};
export function laborAdoptionFail(status: number, code: string): never { throw new HttpError(status, code, code); }
function invalid(): never { return laborAdoptionFail(400, 'invalid_labor_adoption'); }
function object(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) invalid();
  return value as Record<string, unknown>;
}
export function laborAdoptionUuid(value: unknown) {
  if (typeof value !== 'string' || !identityUuid.test(value)) invalid(); return value.toLowerCase();
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0') || Buffer.from(value).toString('utf8') !== value) invalid();
  return value.trim();
}
export function parseLaborAdoptionIntent(value: unknown): LaborAdoptionIntent {
  const raw = object(value, ['orderId', 'expectedVersion', 'targetRevisionId', 'colorIds', 'productUnchangedConfirmed', 'reason']);
  if (!Number.isSafeInteger(raw.expectedVersion) || Number(raw.expectedVersion) < 1 || Number(raw.expectedVersion) >= 2147483647 || raw.productUnchangedConfirmed !== true
    || !Array.isArray(raw.colorIds) || raw.colorIds.length < 1 || raw.colorIds.length > 1000) invalid();
  const colorIds = raw.colorIds.map(id => id === null ? null : laborAdoptionUuid(id));
  if (new Set(colorIds).size !== colorIds.length) invalid(); colorIds.sort((a, b) => (a ?? '').localeCompare(b ?? ''));
  return { orderId: laborAdoptionUuid(raw.orderId), expectedVersion: Number(raw.expectedVersion), targetRevisionId: text(raw.targetRevisionId, 256),
    colorIds, productUnchangedConfirmed: true, reason: text(raw.reason, 2000) };
}
export function parseLaborAdoptionCommand(value: unknown): LaborAdoptionCommand {
  const raw = object(value, ['requestId', 'intent', 'previewHash']);
  if (typeof raw.previewHash !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.previewHash)) invalid();
  return { requestId: laborAdoptionUuid(raw.requestId), intent: parseLaborAdoptionIntent(raw.intent), previewHash: raw.previewHash };
}
/** Compare all saved business fields, including unknown future fields. Only
 * revision bookkeeping and explicit confirmation/currency metadata are omitted.
 * The command never adopts the candidate product or recalculates its costs. */
export function laborProductComparison(before: ProductSnapshot, candidate: ProductSnapshot) {
  const normalize = (value: ProductSnapshot) => {
    if (value.schemaVersion !== 'order-product.v1' || !value.revision || !value.priceVersion || !value.priceVersion.pricingParameters) laborAdoptionFail(409, 'labor_product_evidence_required');
    const revision = structuredClone(value.revision), priceVersion = structuredClone(value.priceVersion);
    for (const key of ['revisionId', 'revisionLabel', 'parentRevisionId', 'mainlineVersion', 'branchSequence', 'basedOnConfirmedRevisionId', 'createdAt', 'createdBy', 'reason', 'note', 'revisionNote', 'readOnly', 'confirmationSummary']) delete revision[key];
    delete priceVersion.confirmation;
    const pricing = { ...priceVersion.pricingParameters as Record<string, unknown> };
    // Exchange-rate metadata is deliberately compared. No permissive stripping
    // of unknown pricing, cost, material or technical fields is allowed.
    delete pricing.laborCurrency;
    const configuration = pricing.configuration as { schemaVersion?: unknown; status?: unknown; sources?: unknown } | undefined;
    if (configuration && Object.keys(configuration).sort().join(',') === 'schemaVersion,sources,status' && configuration.schemaVersion === 1
      && ['incomplete', 'configured'].includes(String(configuration.status)) && Array.isArray(configuration.sources)
      && configuration.sources.every(row => row && typeof row === 'object' && Object.keys(row).sort().join(',') === 'field,source'
        && typeof row.field === 'string' && ['unset', 'technical_default', 'explicit', 'preset', 'accepted_default'].includes(row.source))) delete pricing.configuration;
    priceVersion.pricingParameters = pricing;
    return { quoteCode: value.quoteCode, revision, priceVersion };
  };
  return { compatible: productHash(normalize(before)) === productHash(normalize(candidate)),
    revisionNoteChanged: before.revision.note !== candidate.revision.note };
}
/** No amount, cost or product hash in the public concurrency fingerprint. */
export function laborSourceIdentity(source: LaborConfirmationSource) {
  return { quoteId: source.quoteId, revisionId: source.revisionId, priceVersionId: source.priceVersionId, quoteVersion: source.quoteVersion,
    sourceKind: source.sourceKind, sourceCctId: source.sourceCctId, sourceCctVersion: source.sourceCctVersion, confirmedAt: source.confirmedAt };
}

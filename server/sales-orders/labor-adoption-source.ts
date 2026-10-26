import type { PoolClient } from 'pg';
import type { ServerQuote } from '../quotes/model.js';
import { canonicalDecimal } from '../quotes/model.js';
import { readQuoteAggregateInTransaction } from '../quotes/repository.js';
import { findTermsByQuoteProvenance, lockQuoteTermsContext } from '../confirmed-commercial-terms/repository.js';
import { requireVerifiedOrderBusiness } from './identity-service.js';
import { freezePhysicalOrderGroups, requireEffectiveOrderForWrite, resolveEffectiveOrder } from './effective-attribution.js';
import { readOrderCommercialState } from './commercial-version-service.js';
import { readPricingColors } from './color-commercial.js';
import { productHash, type ProductSnapshot } from './product-snapshot.js';
import { laborAdoptionFail as fail, laborProductComparison, laborSourceIdentity, type LaborAdoptionIntent, type LaborConfirmationSource } from './labor-adoption-model.js';

/** A successor must have exactly one server-created, immutable creation event.
 * Client-built legacy revisions remain readable but are not new USD evidence. */
async function requireSuccessor(client: PoolClient, quote: ServerQuote, quoteVersion: number, origin: string, target: string) {
  const seen = new Set<string>(); let id = target;
  for (let depth = 0; depth < 256; depth++) {
    if (id === origin) return;
    if (seen.has(id)) fail(409, 'labor_revision_chain_invalid'); seen.add(id);
    const revision = quote.revisions.find(row => row.revisionId === id);
    if (!revision?.parentRevisionId) fail(409, 'labor_revision_not_successor');
    const events = (await client.query<{ metadata: { revisionCreation?: { schemaVersion: string; revisionId: string; parentRevisionId: string; quoteVersion: number } }; after_data: { values?: { aggregateVersion?: number } } }>(
      `SELECT metadata,after_data FROM operation_logs WHERE quote_id=$1 AND entity_type='Quote' AND entity_id=$1
       AND metadata->>'workflowAction'='revision.create' AND context->>'revisionId'=$2 ORDER BY created_at,id LIMIT 3`, [quote.id, id])).rows;
    const proof = events[0]?.metadata.revisionCreation;
    if (events.length !== 1 || !proof || proof.schemaVersion !== 'quote-revision-creation.v1' || proof.revisionId !== id
      || proof.parentRevisionId !== revision.parentRevisionId || !Number.isSafeInteger(proof.quoteVersion) || proof.quoteVersion < 2
      || proof.quoteVersion > quoteVersion || events[0].after_data?.values?.aggregateVersion !== proof.quoteVersion) fail(409, 'labor_revision_creation_evidence_required');
    id = revision.parentRevisionId;
  }
  fail(409, 'labor_revision_chain_limit');
}
async function currentLaborLines(client: PoolClient, intent: LaborAdoptionIntent, freeze: boolean) {
  if (freeze) { await requireEffectiveOrderForWrite(client, intent.orderId); await freezePhysicalOrderGroups(client, [intent.orderId]); }
  else if ((await resolveEffectiveOrder(client, intent.orderId)).historicalDuplicate) fail(409, 'historical_duplicate_order_read_only');
  const business = await requireVerifiedOrderBusiness(client, intent.orderId, freeze);
  if (['completed', 'cancelled'].includes(business.lifecycle_state)) fail(409, 'order_commercial_frozen');
  const state = await readOrderCommercialState(client, intent.orderId), current = state.current;
  if (!current) fail(409, 'order_commercial_basis_required');
  if (state.version !== intent.expectedVersion) fail(409, 'order_commercial_version_conflict');
  const colors = await readPricingColors(client, intent.orderId);
  if (colors.length > 1000 || colors.some(color => color.ambiguous)) fail(409, 'order_color_identity_ambiguous');
  let lines = current.lines;
  if (!lines) {
    // Do not invent historical contract color mappings. Processing's original
    // consumption is the exact identity evidence for its one order-wide line.
    if (business.businessType !== 'processing' || colors.length) fail(409, 'labor_color_mapping_required');
    const row = (await client.query(`SELECT s.product_snapshot,s.product_hash,v.source_fingerprint FROM sales_order_commercial_versions v
      JOIN processing_order_batch_consumptions b ON b.sales_order_id=v.sales_order_id AND b.commercial_version_id=v.id
      JOIN sales_order_business_source_snapshots s ON s.commercial_version_id=v.id AND s.sales_order_id=v.sales_order_id AND s.kind='quote'
      WHERE v.id=$1 AND v.sales_order_id=$2`, [current.id, intent.orderId])).rows[0];
    const product = row?.product_snapshot as ProductSnapshot | undefined;
    if (!product || product.schemaVersion !== 'order-product.v1' || !product.priceVersion || productHash(product) !== row.product_hash
      || !['cct', 'quote_confirmation'].includes(current.sourceKind)) fail(409, 'labor_product_evidence_required');
    const source = { quoteId: current.quoteId, revisionId: current.revisionId, priceVersionId: current.priceVersionId, quoteVersion: current.quoteVersion,
      quoteType: 'processing' as const, sourceKind: current.sourceKind as 'cct' | 'quote_confirmation', sourceCctId: current.sourceCctId,
      sourceCctVersion: current.sourceCctVersion, sourceConfirmedAt: current.sourceConfirmedAt, fingerprint: row.source_fingerprint,
      salePrice: null, saleCurrency: 'CNY' as const, laborPrice: current.laborPrice, laborCurrency: current.laborCurrency };
    lines = [{ colorId: null, colorName: null, quantity: null, priceVersionId: current.priceVersionId, priceVersionName: String(product.priceVersion.name ?? ''),
      source, product, productHash: row.product_hash, baseSalePrice: null, salePrice: null, laborPrice: current.laborPrice, laborCurrency: current.laborCurrency }];
  }
  if (!lines.length || lines.length > 1000 || lines.some(line => productHash(line.product) !== line.productHash
    || line.source.quoteId !== current.quoteId || line.source.revisionId !== current.revisionId)) fail(409, 'labor_product_evidence_required');
  if (colors.length ? lines.length !== colors.length || lines.some(line => !colors.some(color => color.id === line.colorId))
    : lines.length !== 1 || lines[0].colorId !== null || business.businessType !== 'processing') fail(409, 'labor_color_mapping_required');
  if (intent.colorIds.some(id => !lines.some(line => line.colorId === id))) fail(409, 'labor_selected_color_unavailable');
  return { business, state, current, lines, colors };
}
function confirmedAmount(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000 || !/^\d+(?:\.\d+)?$/u.test(value)) fail(409, 'labor_usd_confirmation_required');
  return canonicalDecimal(value);
}
export async function buildLaborAdoption(client: PoolClient, intent: LaborAdoptionIntent, freeze: boolean) {
  const basis = await currentLaborLines(client, intent, freeze), { current, lines } = basis;
  const selected = lines.filter(line => intent.colorIds.includes(line.colorId));
  const ids = [...new Set(selected.map(line => line.priceVersionId))].sort();
  if (freeze) {
    for (const priceVersionId of ids) await lockQuoteTermsContext(client, { quoteId: current.quoteId, revisionId: intent.targetRevisionId, priceVersionId });
    await client.query('SELECT id FROM quote_center_quotes WHERE id=$1 FOR SHARE', [current.quoteId]);
  }
  const record = await readQuoteAggregateInTransaction(client, current.quoteId);
  if (!record || record.quote.deletedAt) fail(409, 'labor_quote_unavailable');
  await requireSuccessor(client, record.quote, record.version, current.revisionId, intent.targetRevisionId);
  const revision = record.quote.revisions.find(row => row.revisionId === intent.targetRevisionId);
  if (!revision || (revision.baseInfo.quoteType === 'processing') !== (basis.business.businessType === 'processing')) fail(409, 'order_quote_business_type_conflict');
  const sources = new Map<string, LaborConfirmationSource>(); const warnings: string[] = [];
  for (const priceVersionId of ids) {
    const priceVersion = revision.priceVersions.find(row => row.id === priceVersionId);
    if (!priceVersion) fail(409, 'labor_price_version_required');
    if (priceVersion.pricingParameters.laborCurrency !== 'USD') fail(409, 'labor_usd_confirmation_required');
    const { priceVersions: omitted, ...productRevision } = revision; void omitted;
    const product: ProductSnapshot = { schemaVersion: 'order-product.v1', quoteCode: record.quote.quoteCode, revision: productRevision, priceVersion };
    for (const line of selected.filter(row => row.priceVersionId === priceVersionId)) {
      const comparison = laborProductComparison(line.product, product);
      if (!comparison.compatible) fail(409, 'labor_product_changed');
      if (comparison.revisionNoteChanged) warnings.push('revision_note_changed_confirm_product_unchanged');
    }
    const terms = await findTermsByQuoteProvenance(client, { quoteId: current.quoteId, revisionId: revision.revisionId, priceVersionId });
    const confirmation = priceVersion.confirmation;
    // An existing CCT (including null) is authoritative. Never fall back from it.
    if (terms ? terms.labor_currency !== 'USD' : confirmation?.laborCurrencyAtConfirmation !== 'USD') fail(409, 'labor_confirmation_currency_evidence_required');
    const price = confirmedAmount(terms ? terms.confirmed_labor_price : confirmation?.confirmedLaborPrice);
    const confirmedAt = terms ? terms.updated_at.toISOString() : confirmation?.confirmedAt;
    if (!confirmedAt || !Number.isFinite(Date.parse(confirmedAt))) fail(409, 'labor_confirmation_time_required');
    const source: LaborConfirmationSource = { schemaVersion: 'quote-labor-confirmation.v1', quoteId: current.quoteId, revisionId: revision.revisionId,
      priceVersionId, quoteVersion: record.version, sourceKind: terms ? 'cct' : 'quote_confirmation', sourceCctId: terms?.id ?? null,
      sourceCctVersion: terms?.version ?? null, confirmedAt, price, currency: 'USD', productHash: productHash(product) };
    const bytes = (await client.query<{ bytes: number }>('SELECT octet_length($1::jsonb::text)::int AS bytes', [JSON.stringify(source)])).rows[0].bytes;
    if (bytes > 4096) fail(422, 'labor_confirmation_evidence_too_large'); sources.set(priceVersionId, source);
  }
  const after = lines.map(line => intent.colorIds.includes(line.colorId) ? { ...line, laborPrice: sources.get(line.priceVersionId)!.price,
    laborCurrency: 'USD' as const, laborConfirmationSource: sources.get(line.priceVersionId)! } : line);
  const changed = after.some((line, index) => productHash([line.laborPrice, line.laborCurrency, line.laborConfirmationSource ?? null])
    !== productHash([lines[index].laborPrice, lines[index].laborCurrency, lines[index].laborConfirmationSource ?? null]));
  const previewHash = productHash({ intent, current: { id: current.id, version: current.version },
    colors: basis.colors.map(color => ({ id: color.id, name: color.colorName, quantity: color.quantity })),
    sources: [...sources.values()].map(laborSourceIdentity), quoteVersion: record.version });
  return { ...basis, after, changed, sources, previewHash, warnings: [...new Set(warnings)], quoteCode: record.quote.quoteCode, revisionLabel: revision.revisionLabel };
}

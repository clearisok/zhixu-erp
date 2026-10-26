import type { Pool } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { HttpError } from '../http/errors.js';
import { readQuoteAggregateInTransaction } from '../quotes/repository.js';
import { readOrderCommercialState } from './commercial-version-service.js';
import { laborAdoptionFail as fail, laborAdoptionUuid, laborSourceIdentity } from './labor-adoption-model.js';
import { readLaborAdoptionActor } from './labor-adoption-service.js';
import { readLaborAdoptionOrderBasis, resolveUsdLaborConfirmation, type LaborTermsEvidence } from './labor-adoption-source.js';

function query(params: URLSearchParams, basis = false) {
  const allowed = basis ? ['quoteId', 'revisionOffset'] : ['quoteId', 'search', 'offset'];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) fail(400, 'invalid_labor_orders_query');
  const quoteId = params.get('quoteId'), search = params.get('search') ?? '', rawOffset = params.get(basis ? 'revisionOffset' : 'offset') ?? '0';
  if (!quoteId || quoteId.length > 256 || quoteId !== quoteId.trim() || !/^(0|[1-9]\d*)$/u.test(rawOffset) || Number(rawOffset) > 100000
    || search.length > 200 || [quoteId, search].some(value => value.includes('\0') || Buffer.from(value).toString('utf8') !== value)) fail(400, 'invalid_labor_orders_query');
  return { quoteId, search: search.trim(), offset: Number(rawOffset) };
}
function bounded<T>(result: T): T {
  if (Buffer.byteLength(JSON.stringify(result)) > 1048576) fail(422, 'labor_orders_response_too_large'); return result;
}
function line(line: { colorId: string | null; colorName: string | null; quantity: string | null; priceVersionId: string; priceVersionName: string; laborPrice: string; laborCurrency: string }) {
  return { colorId: line.colorId, colorName: line.colorName, quantity: line.quantity, priceVersionId: line.priceVersionId,
    priceVersionName: line.priceVersionName, laborPrice: line.laborPrice, laborCurrency: line.laborCurrency };
}
/** Physical SOs under this exact adopted Quote. No source inference or writes. */
export async function listLaborAdoptionOrders(pool: Pool, identity: TrustedIdentity, params: URLSearchParams) {
  const input = query(params), client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await readLaborAdoptionActor(client, identity);
    const rows = (await client.query<{ id: string; orderNo: string; lifecycle: string; businessType: string; contractNo: string | null; styleNo: string | null; historical: boolean }>(
      `SELECT o.id::text,o.order_no AS "orderNo",o.lifecycle_state AS lifecycle,v.quote_type AS "businessType",
       m.sales_contract_no AS "contractNo",coalesce(p.business_style_no,m.style_no) AS "styleNo",
       (a.effective_order_id IS NOT NULL AND a.effective_order_id<>o.id) AS historical
       FROM sales_orders o JOIN sales_order_commercial_heads h ON h.sales_order_id=o.id
       JOIN sales_order_commercial_versions v ON v.id=h.current_version_id AND v.sales_order_id=o.id
       LEFT JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=o.id
       LEFT JOIN processing_order_batch_consumptions b ON b.sales_order_id=o.id
       LEFT JOIN processing_order_batches p ON p.id=b.batch_id
       LEFT JOIN sales_order_effective_identities a ON a.original_order_id=o.id
       WHERE v.quote_id=$1 AND ($2='' OR concat_ws(' ',o.order_no,m.sales_contract_no,m.style_no,p.business_style_no) ILIKE $3)
       ORDER BY o.order_no DESC,o.id DESC LIMIT 21 OFFSET $4`,
      [input.quoteId, input.search, '%' + input.search.replace(/[\\%_]/gu, '\\$&') + '%', input.offset])).rows;
    const items = [];
    for (const row of rows.slice(0, 20)) {
      const current = (await readOrderCommercialState(client, row.id)).current;
      if (!current || current.quoteId !== input.quoteId) fail(409, 'order_commercial_version_conflict');
      const work = current.lines ? current.lines.map(value => ({ price: value.laborPrice, currency: value.laborCurrency }))
        : [{ price: current.laborPrice, currency: current.laborCurrency }];
      const unique = [...new Map(work.map(value => [JSON.stringify(value), value])).values()];
      items.push({ ...row, version: current.version, work: unique, editable: !row.historical && !['completed', 'cancelled'].includes(row.lifecycle) });
    }
    const result = bounded({ quoteId: input.quoteId, items, offset: input.offset, hasMore: rows.length > 20 });
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}
/** Suggestions expose confirmed work only, never costs, sale or full products.
 * A match is not approval: authoritative preview still verifies all invariants. */
export async function readLaborAdoptionOptions(pool: Pool, identity: TrustedIdentity, value: unknown, params: URLSearchParams) {
  const orderId = laborAdoptionUuid(value), input = query(params, true), client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await readLaborAdoptionActor(client, identity);
    const basis = await readLaborAdoptionOrderBasis(client, orderId);
    if (basis.current.quoteId !== input.quoteId) fail(404, 'labor_order_quote_mismatch');
    const record = await readQuoteAggregateInTransaction(client, input.quoteId);
    if (!record || record.quote.deletedAt) fail(409, 'labor_quote_unavailable');
    const page = [...record.quote.revisions].reverse().slice(input.offset, input.offset + 21), visible = page.slice(0, 20);
    const terms = (await client.query<LaborTermsEvidence & { revision_id: string; price_version_id: string }>(
      `SELECT id::text,version,labor_currency,confirmed_labor_price::text,updated_at,revision_id,price_version_id
       FROM confirmed_commercial_terms WHERE ownership_scope='quote' AND quote_id=$1 AND revision_id=ANY($2::text[])`,
      [input.quoteId, visible.map(revision => revision.revisionId)])).rows;
    const termsByKey = new Map(terms.map(value => [JSON.stringify([value.revision_id, value.price_version_id]), value]));
    const ids = new Set(basis.lines.filter(value => value.laborCurrency === 'CNY').map(value => value.priceVersionId));
    const revisions = visible.map(revision => ({ revisionId: revision.revisionId, label: revision.revisionLabel,
      priceVersions: revision.priceVersions.filter(value => ids.has(value.id)).map(priceVersion => {
        try {
          if ((revision.baseInfo.quoteType === 'processing') !== (basis.business.businessType === 'processing')) fail(409, 'order_quote_business_type_conflict');
          const source = resolveUsdLaborConfirmation(record, revision, priceVersion, termsByKey.get(JSON.stringify([revision.revisionId, priceVersion.id])) ?? null);
          return { priceVersionId: priceVersion.id, name: priceVersion.name, available: true as const, laborPrice: source.price,
            confirmation: laborSourceIdentity(source) };
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 409) throw error;
          return { priceVersionId: priceVersion.id, name: priceVersion.name, available: false as const, code: error.code };
        }
      }) }));
    const row = (await client.query<{ orderNo: string }>('SELECT order_no AS "orderNo" FROM sales_orders WHERE id=$1', [orderId])).rows[0];
    const result = bounded({ quoteId: input.quoteId, quoteCode: record.quote.quoteCode, orderId, orderNo: row.orderNo,
      version: basis.current.version, currentVersionId: basis.current.id, businessType: basis.business.businessType,
      lines: basis.lines.map(line), revisions, revisionOffset: input.offset, hasMoreRevisions: page.length > 20 });
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}

import type { Pool } from "pg";
import { businessValues, type BusinessColumn, type BusinessSource } from "../../features/quote-center/model/quote-business-view.js";
import { authorizeBusinessColumns, parseBusinessColumns, readBusinessSources } from "./business-source.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { UnsafeServerQuoteDecimalError } from "../../features/quote-center/model/exact-decimal-view.js";
export type QuoteSummaryQuery = { limit: number; offset: number; search?: string; type?: string; status?: string; columns?: BusinessColumn[] };
export async function listQuoteSummaries(pool: Pool, query: QuoteSummaryQuery, actor?: TrustedIdentity) {
  if (query.columns) {
    parseBusinessColumns(query.columns);
    if (!actor) throw new HttpError(401, "authentication_required", "Authentication is required");
    authorizeBusinessColumns(actor, query.columns);
  }
  const client = await pool.connect();
  const search = `%${(query.search ?? "").replace(/[\\%_]/gu, "\\$&")}%`;
  const from = `FROM quote_center_quotes q JOIN quote_center_revisions r ON r.quote_id=q.id AND r.id=q.default_revision_id`;
  const where = `WHERE q.metadata->>'deletedAt' IS NULL
    AND ($1='%%' OR concat_ws(' ',q.quote_code,r.metadata->'baseInfo'->>'quoteStyleNo',r.metadata->'baseInfo'->>'styleName',r.metadata->'baseInfo'->>'brandName',r.metadata->'baseInfo'->>'salespersonName') ILIKE $1)
    AND ($2::text IS NULL OR r.metadata->'baseInfo'->>'quoteType'=$2)
    AND ($3::text IS NULL OR q.metadata->>'aggregateStatus'=$3)`;
  const params = [search, query.type ?? null, query.status ?? null];
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const total = (await client.query<{ n: number }>(`SELECT count(*)::int AS n ${from} ${where}`, params)).rows[0].n;
    const rows = await client.query(`SELECT q.id,q.quote_code,q.default_revision_id,q.version,q.metadata->>'aggregateStatus' AS status,
      r.metadata->>'revisionLabel' AS revision_label,r.metadata->'baseInfo' AS base_info,
      (SELECT count(*)::int FROM quote_center_price_versions p WHERE p.quote_id=q.id AND p.revision_id=r.id) AS price_versions
      ${from} ${where} ORDER BY q.quote_code DESC,q.id ASC LIMIT $4 OFFSET $5`, [...params, query.limit, query.offset]);
    const sources = query.columns ? (await readBusinessSources(client, rows.rows.map(row => ({ id: row.id, quoteCode: row.quote_code, revisionId: row.default_revision_id, version: row.version, status: row.status, revisionLabel: row.revision_label, baseInfo: row.base_info } as Omit<BusinessSource, "versions">)), query.columns)).sources : [];
    const quotes = rows.rows.map((row) => ({ id: row.id as string, quoteCode: row.quote_code as string, defaultRevisionId: row.default_revision_id as string, version: row.version as number,
      ...(query.columns ? { business: businessValues(sources.find(s => s.id === row.id)!, query.columns) } : {}),
      ...(sources.find(s => s.id === row.id)?.versions.some(v => v.confirmation) ? { confirmationSources: sources.find(s => s.id === row.id)!.versions.map(v => ({ priceVersionId: v.id, linkage: v.confirmation!.linkage, termsVersion: v.confirmation!.termsVersion })) } : {}),
      summary: { status: row.status as string, revisionLabel: row.revision_label as string, quoteStyleNo: String(row.base_info.quoteStyleNo), styleName: String(row.base_info.styleName), brandName: String(row.base_info.brandName), salespersonName: String(row.base_info.salespersonName), quoteType: String(row.base_info.quoteType), quoteDate: row.base_info.quoteDate as string | null, priceVersionCount: row.price_versions as number } }));
    await client.query("COMMIT");
    return { quotes, page: { limit: query.limit, offset: query.offset, count: quotes.length, total } };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof UnsafeServerQuoteDecimalError) throw new HttpError(409, "unsafe_quote_business_decimal", "Selected business value cannot be represented safely");
    throw error;
  } finally { client.release(); }
}

import type { Pool, PoolClient } from "pg";
import type {
  ConfirmedCommercialTermsCurrentDto,
  ConfirmedCommercialTermsDto,
  ConfirmedCommercialTermsScope,
  ConfirmedLaborCurrency,
} from "../../features/confirmed-commercial-terms/model.js";

type Queryable = Pick<Pool | PoolClient, "query">;

/** All paths needing both locks acquire sorted terms contexts, then Quote row. */
export async function lockQuoteTermsContext(client: Queryable, provenance: QuoteProvenance): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `commercial-terms:quote:${provenance.quoteId}:${provenance.revisionId}:${provenance.priceVersionId}`,
  ]);
}

export type QuoteProvenance = {
  quoteId: string;
  revisionId: string;
  priceVersionId: string;
};

export type SalesOrderCommercialTarget = {
  id: string;
  provenance: QuoteProvenance | null;
  hasPartialProvenance: boolean;
};

type TermsRow = {
  id: string;
  ownership_scope: ConfirmedCommercialTermsScope;
  quote_id: string | null;
  revision_id: string | null;
  price_version_id: string | null;
  customer_confirmed_price: string | null;
  confirmed_labor_price: string | null;
  labor_currency: ConfirmedLaborCurrency | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

function mapCurrent(row: TermsRow): ConfirmedCommercialTermsCurrentDto {
  return {
    id: row.id,
    customerConfirmedPrice: row.customer_confirmed_price,
    customerConfirmedPriceCurrency: "CNY",
    confirmedLaborPrice: row.confirmed_labor_price,
    laborCurrency: row.labor_currency,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function findSalesOrderCommercialTarget(
  client: Queryable,
  salesOrderId: string,
): Promise<SalesOrderCommercialTarget | null> {
  try {
    const result = await client.query<{
      id: string;
      source_quote_id: string | null;
      source_revision_id: string | null;
      source_price_version_id: string | null;
    }>(
      `SELECT id::text, source_quote_id, source_revision_id, source_price_version_id
       FROM sales_orders WHERE id = $1::uuid`,
      [salesOrderId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const values = [row.source_quote_id, row.source_revision_id, row.source_price_version_id];
    const populated = values.filter((value) => value !== null).length;
    return {
      id: row.id,
      provenance: populated === 3 ? {
        quoteId: row.source_quote_id!,
        revisionId: row.source_revision_id!,
        priceVersionId: row.source_price_version_id!,
      } : null,
      hasPartialProvenance: populated > 0 && populated < 3,
    };
  } catch (error) {
    if ((error as { code?: string }).code === "22P02") return null;
    throw error;
  }
}

export async function findCreationOrderIdsByQuoteProvenance(
  client: Queryable,
  provenance: QuoteProvenance,
): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `SELECT id::text FROM sales_orders
     WHERE source_quote_id = $1 AND source_revision_id = $2 AND source_price_version_id = $3
     ORDER BY id`,
    [provenance.quoteId, provenance.revisionId, provenance.priceVersionId],
  );
  return result.rows.map((row) => row.id);
}

/** Commercial usage is separate from immutable creation provenance. Historical adoptions keep the quote confirmation authority stable. */
export async function findSalesOrderIdsByQuoteProvenance(client:Queryable,provenance:QuoteProvenance):Promise<string[]>{
 const colorLines=(await client.query("SELECT to_regclass('sales_order_commercial_lines') IS NOT NULL AS ready")).rows[0].ready;
 const rows=await client.query<{id:string}>(`SELECT id::text FROM sales_orders WHERE source_quote_id=$1 AND source_revision_id=$2 AND source_price_version_id=$3
 UNION SELECT sales_order_id::text FROM sales_order_commercial_versions WHERE quote_id=$1 AND revision_id=$2 AND price_version_id=$3 ${colorLines?"UNION SELECT v.sales_order_id::text FROM sales_order_commercial_versions v JOIN sales_order_commercial_lines l ON l.commercial_version_id=v.id WHERE v.quote_id=$1 AND v.revision_id=$2 AND l.price_version_id=$3":""} ORDER BY 1`,[provenance.quoteId,provenance.revisionId,provenance.priceVersionId]);
 return rows.rows.map(row=>row.id);
}

export async function findTermsByQuoteProvenance(
  client: Queryable,
  provenance: QuoteProvenance,
): Promise<TermsRow | null> {
  const result = await client.query<TermsRow>(
    `SELECT * FROM confirmed_commercial_terms
     WHERE ownership_scope = 'quote'
       AND quote_id = $1 AND revision_id = $2 AND price_version_id = $3`,
    [provenance.quoteId, provenance.revisionId, provenance.priceVersionId],
  );
  return result.rows[0] ?? null;
}

export async function findTermsBySalesOrder(
  client: Queryable,
  salesOrderId: string,
): Promise<TermsRow | null> {
  const result = await client.query<TermsRow>(
    `SELECT terms.*
     FROM confirmed_commercial_terms_sales_orders association
     JOIN confirmed_commercial_terms terms ON terms.id = association.confirmed_commercial_terms_id
     WHERE association.sales_order_id = $1::uuid`,
    [salesOrderId],
  );
  return result.rows[0] ?? null;
}

export async function createTerms(
  client: Queryable,
  input: {
    scope: ConfirmedCommercialTermsScope;
    provenance: QuoteProvenance | null;
    customerConfirmedPrice: string | null;
    confirmedLaborPrice: string | null;
    laborCurrency: ConfirmedLaborCurrency | null;
  },
): Promise<TermsRow> {
  const result = await client.query<TermsRow>(
    `INSERT INTO confirmed_commercial_terms(
       ownership_scope, quote_id, revision_id, price_version_id,
       customer_confirmed_price, confirmed_labor_price, labor_currency
     ) VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7)
     RETURNING *`,
    [
      input.scope,
      input.provenance?.quoteId ?? null,
      input.provenance?.revisionId ?? null,
      input.provenance?.priceVersionId ?? null,
      input.customerConfirmedPrice,
      input.confirmedLaborPrice,
      input.laborCurrency,
    ],
  );
  return result.rows[0];
}

export async function updateTerms(
  client: Queryable,
  input: {
    id: string;
    expectedVersion: number;
    customerConfirmedPrice: string | null;
    confirmedLaborPrice: string | null;
    laborCurrency: ConfirmedLaborCurrency | null;
  },
): Promise<TermsRow | null> {
  const result = await client.query<TermsRow>(
    `UPDATE confirmed_commercial_terms SET
       customer_confirmed_price = $3::numeric,
       confirmed_labor_price = $4::numeric,
       labor_currency = $5,
       version = version + 1
     WHERE id = $1::uuid AND version = $2
     RETURNING *`,
    [input.id, input.expectedVersion, input.customerConfirmedPrice, input.confirmedLaborPrice, input.laborCurrency],
  );
  return result.rows[0] ?? null;
}

export async function associateSalesOrders(
  client: Queryable,
  termsId: string,
  salesOrderIds: readonly string[],
): Promise<void> {
  for (const salesOrderId of salesOrderIds) {
    await client.query(
      `INSERT INTO confirmed_commercial_terms_sales_orders(sales_order_id, confirmed_commercial_terms_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (sales_order_id) DO NOTHING`,
      [salesOrderId, termsId],
    );
    const association = await client.query<{ confirmed_commercial_terms_id: string }>(
      `SELECT confirmed_commercial_terms_id::text
       FROM confirmed_commercial_terms_sales_orders WHERE sales_order_id = $1::uuid`,
      [salesOrderId],
    );
    if (association.rows[0]?.confirmed_commercial_terms_id !== termsId) {
      throw new Error("SalesOrder is already associated with a different ConfirmedCommercialTerms context");
    }
  }
}

export function composeTermsDto(input: {
  linkage: "linked" | "unlinked";
  scope: ConfirmedCommercialTermsScope | null;
  provenance: QuoteProvenance | null;
  salesOrderIds: string[];
  terms: TermsRow | null;
}): ConfirmedCommercialTermsDto {
  return {
    linkage: input.linkage,
    scope: input.scope,
    quoteProvenance: input.provenance,
    associatedSalesOrderIds: input.salesOrderIds,
    current: input.terms ? mapCurrent(input.terms) : null,
  };
}

export type ConfirmedCommercialTermsRow = TermsRow;

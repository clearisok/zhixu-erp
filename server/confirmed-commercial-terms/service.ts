import type { Pool, PoolClient } from "pg";
import type {
  ConfirmedCommercialTermsDto,
  ConfirmedLaborCurrency,
  UpdateConfirmedCommercialTermsInput,
} from "../../features/confirmed-commercial-terms/model.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import {
  associateSalesOrders,
  composeTermsDto,
  createTerms,
  findSalesOrderCommercialTarget,
  findSalesOrderIdsByQuoteProvenance,
  findTermsByQuoteProvenance,
  findTermsBySalesOrder,
  updateTerms,
  type ConfirmedCommercialTermsRow,
  type QuoteProvenance,
} from "./repository.js";

export type ConfirmedCommercialTermsMutationSurface = "order" | "quote";

function sameTerms(
  current: ConfirmedCommercialTermsRow,
  input: UpdateConfirmedCommercialTermsInput,
): boolean {
  return current.customer_confirmed_price === input.customerConfirmedPrice
    && current.confirmed_labor_price === input.confirmedLaborPrice
    && current.labor_currency === input.laborCurrency;
}

function auditData(
  row: ConfirmedCommercialTermsRow | null,
  provenance: QuoteProvenance | null,
): {
  sourceQuoteId?: string;
  sourceRevisionId?: string;
  sourcePriceVersionId?: string;
  objectSource: "quote" | "order";
  objectType: string;
  objectId: string;
  values: Record<string, string | number | null>;
} | null {
  if (!row) return null;
  return {
    ...(provenance ? {
      sourceQuoteId: provenance.quoteId,
      sourceRevisionId: provenance.revisionId,
      sourcePriceVersionId: provenance.priceVersionId,
    } : {}),
    objectSource: provenance ? "quote" : "order",
    objectType: "ConfirmedCommercialTerms",
    objectId: row.id,
    values: {
      customerConfirmedPrice: row.customer_confirmed_price,
      customerConfirmedPriceCurrency: "CNY",
      confirmedLaborPrice: row.confirmed_labor_price,
      laborCurrency: row.labor_currency,
      version: row.version,
    },
  };
}

async function appendTermsLog(
  client: PoolClient,
  actor: TrustedIdentity,
  input: {
    before: ConfirmedCommercialTermsRow | null;
    after: ConfirmedCommercialTermsRow;
    provenance: QuoteProvenance | null;
    salesOrderIds: string[];
    surface: ConfirmedCommercialTermsMutationSurface;
  },
): Promise<void> {
  await appendOperationLog(client, actor, {
    module: input.surface === "quote" ? "报价中心" : "订单中心",
    action: input.before ? "修改确认商业条款" : "确认商业条款",
    entityType: "ConfirmedCommercialTerms",
    entityId: input.after.id,
    quoteId: input.provenance?.quoteId ?? null,
    beforeData: auditData(input.before, input.provenance),
    afterData: auditData(input.after, input.provenance),
    context: {
      mutationSurface: input.surface,
      salesOrderIds: input.salesOrderIds,
      quoteId: input.provenance?.quoteId ?? null,
      revisionId: input.provenance?.revisionId ?? null,
      priceVersionId: input.provenance?.priceVersionId ?? null,
    },
    metadata: { domain: "ConfirmedCommercialTerms", mutationSurface: input.surface },
  });
}

function assertExpectedVersion(current: ConfirmedCommercialTermsRow | null, expectedVersion: number): void {
  const actual = current?.version ?? 0;
  if (expectedVersion !== actual) {
    throw new HttpError(409, "confirmed_commercial_terms_version_conflict", "ConfirmedCommercialTerms version is stale");
  }
}

function assertOrderPreservesLinkedLaborCurrency(
  current: ConfirmedCommercialTermsRow | null,
  input: UpdateConfirmedCommercialTermsInput,
): void {
  const establishedCurrency = current?.labor_currency ?? null;
  if (establishedCurrency === null) {
    if (input.confirmedLaborPrice !== null || input.laborCurrency !== null) {
      throw new HttpError(
        409,
        "linked_labor_currency_not_established",
        "Linked labor currency must first be established from the Quote PriceVersion",
      );
    }
    return;
  }
  if (input.laborCurrency !== establishedCurrency) {
    throw new HttpError(
      409,
      "linked_labor_currency_order_conflict",
      "Order mutation must preserve the linked Quote PriceVersion labor currency",
    );
  }
}

async function readOrderWithClient(
  client: Pool | PoolClient,
  salesOrderId: string,
): Promise<ConfirmedCommercialTermsDto> {
  const target = await findSalesOrderCommercialTarget(client, salesOrderId);
  if (!target) throw new HttpError(404, "sales_order_not_found", "SalesOrder was not found");
  if (target.hasPartialProvenance) {
    throw new HttpError(409, "incomplete_quote_provenance", "SalesOrder Quote provenance is incomplete");
  }
  if (target.provenance) {
    const salesOrderIds = await findSalesOrderIdsByQuoteProvenance(client, target.provenance);
    const terms = await findTermsByQuoteProvenance(client, target.provenance);
    return composeTermsDto({ linkage: "linked", scope: terms?.ownership_scope ?? "quote", provenance: target.provenance, salesOrderIds, terms });
  }
  const terms = await findTermsBySalesOrder(client, target.id);
  return composeTermsDto({ linkage: "unlinked", scope: terms?.ownership_scope ?? null, provenance: null, salesOrderIds: [target.id], terms });
}

export async function readConfirmedCommercialTermsBySalesOrder(
  pool: Pool,
  salesOrderId: string,
): Promise<ConfirmedCommercialTermsDto> {
  return readOrderWithClient(pool, salesOrderId);
}

export async function readConfirmedCommercialTermsByQuote(
  pool: Pool,
  provenance: QuoteProvenance,
): Promise<ConfirmedCommercialTermsDto> {
  const salesOrderIds = await findSalesOrderIdsByQuoteProvenance(pool, provenance);
  if (salesOrderIds.length === 0) {
    return composeTermsDto({ linkage: "unlinked", scope: null, provenance, salesOrderIds: [], terms: null });
  }
  const terms = await findTermsByQuoteProvenance(pool, provenance);
  return composeTermsDto({ linkage: "linked", scope: terms?.ownership_scope ?? "quote", provenance, salesOrderIds, terms });
}

async function mutate(
  pool: Pool,
  actor: TrustedIdentity,
  input: {
    salesOrderId?: string;
    provenance?: QuoteProvenance;
    values: UpdateConfirmedCommercialTermsInput;
    surface: ConfirmedCommercialTermsMutationSurface;
  },
): Promise<ConfirmedCommercialTermsDto> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let provenance: QuoteProvenance | null = input.provenance ?? null;
    let salesOrderIds: string[];
    let current: ConfirmedCommercialTermsRow | null;
    let scope: "quote" | "sales_order";

    if (input.salesOrderId) {
      const target = await findSalesOrderCommercialTarget(client, input.salesOrderId);
      if (!target) throw new HttpError(404, "sales_order_not_found", "SalesOrder was not found");
      if (target.hasPartialProvenance) {
        throw new HttpError(409, "incomplete_quote_provenance", "SalesOrder Quote provenance is incomplete");
      }
      provenance = target.provenance;
      scope = provenance ? "quote" : "sales_order";
      const lockKey = provenance
        ? `commercial-terms:quote:${provenance.quoteId}:${provenance.revisionId}:${provenance.priceVersionId}`
        : `commercial-terms:order:${target.id}`;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
      salesOrderIds = provenance
        ? await findSalesOrderIdsByQuoteProvenance(client, provenance)
        : [target.id];
      current = provenance
        ? await findTermsByQuoteProvenance(client, provenance)
        : await findTermsBySalesOrder(client, target.id);
    } else if (provenance) {
      scope = "quote";
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `commercial-terms:quote:${provenance.quoteId}:${provenance.revisionId}:${provenance.priceVersionId}`,
      ]);
      salesOrderIds = await findSalesOrderIdsByQuoteProvenance(client, provenance);
      if (salesOrderIds.length === 0) {
        throw new HttpError(409, "quote_commercial_terms_not_linked", "Quote PriceVersion is not linked to a formal SalesOrder");
      }
      current = await findTermsByQuoteProvenance(client, provenance);
    } else {
      throw new Error("ConfirmedCommercialTerms mutation target is required");
    }

    assertExpectedVersion(current, input.values.expectedVersion);
    if (input.surface === "order" && provenance) {
      assertOrderPreservesLinkedLaborCurrency(current, input.values);
    }
    if (current && sameTerms(current, input.values)) {
      await client.query("COMMIT");
      return composeTermsDto({ linkage: provenance ? "linked" : "unlinked", scope, provenance, salesOrderIds, terms: current });
    }
    if (!current
      && input.values.customerConfirmedPrice === null
      && input.values.confirmedLaborPrice === null
      && input.values.laborCurrency === null) {
      await client.query("COMMIT");
      return composeTermsDto({ linkage: provenance ? "linked" : "unlinked", scope, provenance, salesOrderIds, terms: null });
    }

    const after = current
      ? await updateTerms(client, { id: current.id, ...input.values })
      : await createTerms(client, {
        scope,
        provenance,
        customerConfirmedPrice: input.values.customerConfirmedPrice,
        confirmedLaborPrice: input.values.confirmedLaborPrice,
        laborCurrency: input.values.laborCurrency,
      });
    if (!after) {
      throw new HttpError(409, "confirmed_commercial_terms_version_conflict", "ConfirmedCommercialTerms version is stale");
    }
    await associateSalesOrders(client, after.id, salesOrderIds);
    await appendTermsLog(client, actor, { before: current, after, provenance, salesOrderIds, surface: input.surface });
    await client.query("COMMIT");
    return composeTermsDto({ linkage: provenance ? "linked" : "unlinked", scope, provenance, salesOrderIds, terms: after });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateConfirmedCommercialTermsBySalesOrder(
  pool: Pool,
  actor: TrustedIdentity,
  salesOrderId: string,
  values: UpdateConfirmedCommercialTermsInput,
): Promise<ConfirmedCommercialTermsDto> {
  return mutate(pool, actor, { salesOrderId, values, surface: "order" });
}

export async function updateConfirmedCommercialTermsByQuote(
  pool: Pool,
  actor: TrustedIdentity,
  provenance: QuoteProvenance,
  values: UpdateConfirmedCommercialTermsInput,
): Promise<ConfirmedCommercialTermsDto> {
  return mutate(pool, actor, { provenance, values, surface: "quote" });
}

export function isConfirmedLaborCurrency(value: unknown): value is ConfirmedLaborCurrency {
  return value === "CNY" || value === "USD";
}

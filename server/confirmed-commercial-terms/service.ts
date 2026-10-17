import {readOrderCommercialState} from '../sales-orders/commercial-version-service.js';
import type { Pool, PoolClient } from "pg";
import type {
  ConfirmedCommercialTermsDto,
  ConfirmedLaborCurrency,
  UpdateConfirmedCommercialTermsInput,
  UpdateQuoteConfirmedCommercialTermsInput,
} from "../../features/confirmed-commercial-terms/model.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../auth/permissions.js";
import { requireCommercialEdit } from "./permissions.js";
import { canonicalDecimal, isWritableDefaultRevision } from "../quotes/model.js";
import { readQuoteAggregateInTransaction } from "../quotes/repository.js";
import { validateCustomerConfirmation } from "../../features/quote-center/model/quote-validation.js";
import type { QuoteRevision } from "../../features/quote-center/model/quote-view-model.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import {
  associateSalesOrders,
  findCreationOrderIdsByQuoteProvenance,
  composeTermsDto,
  createTerms,
  findSalesOrderCommercialTarget,
  findSalesOrderIdsByQuoteProvenance,
  findTermsByQuoteProvenance,
  findTermsBySalesOrder,
  updateTerms,
  lockQuoteTermsContext,
  type ConfirmedCommercialTermsRow,
  type QuoteProvenance,
} from "./repository.js";

export type ConfirmedCommercialTermsMutationSurface = "order" | "quote";
type CompleteTermsInput = Required<UpdateConfirmedCommercialTermsInput>;

function sameTerms(
  current: ConfirmedCommercialTermsRow,
  input: CompleteTermsInput,
): boolean {
  const normalized = (value: string | null) => value === null ? null : canonicalDecimal(value);
  return normalized(current.customer_confirmed_price) === normalized(input.customerConfirmedPrice)
    && normalized(current.confirmed_labor_price) === normalized(input.confirmedLaborPrice)
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
  input: CompleteTermsInput,
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

/** Historical evidence only. Never use as the live order price or expose without field projection. */
export async function readLegacyOrderCommercialEvidence(
  client: Pool | PoolClient,
  salesOrderId: string,
): Promise<ConfirmedCommercialTermsDto> {
  const target = await findSalesOrderCommercialTarget(client, salesOrderId);
  if (!target) throw new HttpError(404, "sales_order_not_found", "SalesOrder was not found");
  if (target.hasPartialProvenance) {
    throw new HttpError(409, "incomplete_quote_provenance", "SalesOrder Quote provenance is incomplete");
  }
  if (target.provenance) {
    const salesOrderIds = await findCreationOrderIdsByQuoteProvenance(client, target.provenance);
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
  const state=await readOrderCommercialState(pool,salesOrderId),c=state.current;
  return {linkage:c?'linked':'unlinked',scope:c?'sales_order':null,quoteProvenance:c?{quoteId:c.quoteId,revisionId:c.revisionId,priceVersionId:c.priceVersionId}:null,associatedSalesOrderIds:[salesOrderId],current:c?{id:c.id,customerConfirmedPrice:c.salePrice,customerConfirmedPriceCurrency:'CNY',confirmedLaborPrice:c.laborPrice,laborCurrency:c.laborCurrency,version:c.version,createdAt:c.adoptedAt,updatedAt:c.adoptedAt}:null};
}

export async function readConfirmedCommercialTermsByQuote(
  pool: Pool,
  provenance: QuoteProvenance,
): Promise<ConfirmedCommercialTermsDto> {
  const partial = await pool.query("SELECT 1 FROM sales_orders WHERE source_quote_id=$1 AND (source_revision_id IS NULL OR source_price_version_id IS NULL) LIMIT 1", [provenance.quoteId]);
  if (partial.rowCount) throw new HttpError(409, "incomplete_quote_provenance", "Quote linkage cannot be proved exactly");
  const salesOrderIds = await findSalesOrderIdsByQuoteProvenance(pool, provenance);
  const terms = await findTermsByQuoteProvenance(pool, provenance);
  if (!terms) {
    return composeTermsDto({ linkage: "unlinked", scope: null, provenance, salesOrderIds: [], terms: null });
  }
  return composeTermsDto({ linkage: "linked", scope: terms?.ownership_scope ?? "quote", provenance, salesOrderIds, terms });
}

async function mutate(
  pool: Pool,
  actor: TrustedIdentity,
  input: {
    salesOrderId?: string;
    provenance?: QuoteProvenance;
    values: UpdateConfirmedCommercialTermsInput & { expectedQuoteVersion?: number };
    surface: ConfirmedCommercialTermsMutationSurface;
  },
): Promise<ConfirmedCommercialTermsDto> {
  const client = await pool.connect();
  try {
    requirePermission(actor.permissions, input.surface === "quote" ? "quote.view" : "order.view");
    requirePermission(actor.permissions, input.surface === "quote" ? "quote.confirm" : "order.edit");
    const allowed = ["expectedVersion", "customerConfirmedPrice", "confirmedLaborPrice", "laborCurrency", ...(input.surface === "quote" ? ["expectedQuoteVersion"] : [])];
    const saleSubmitted = Object.hasOwn(input.values, "customerConfirmedPrice");
    const laborSubmitted = Object.hasOwn(input.values, "confirmedLaborPrice") || Object.hasOwn(input.values, "laborCurrency");
    const amount = (value: unknown) => value === null || typeof value === "string" && value.length <= 128 && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
    if (Object.keys(input.values).some(key => !allowed.includes(key)) || !Number.isSafeInteger(input.values.expectedVersion) || input.values.expectedVersion < 0
      || (!saleSubmitted && !laborSubmitted)
      || (saleSubmitted && !amount(input.values.customerConfirmedPrice))
      || (Object.hasOwn(input.values, "confirmedLaborPrice") && !amount(input.values.confirmedLaborPrice))
      || (Object.hasOwn(input.values, "laborCurrency") && !(input.values.laborCurrency === null || isConfirmedLaborCurrency(input.values.laborCurrency)))
      || (input.surface === "quote" && (!Number.isSafeInteger(input.values.expectedQuoteVersion) || input.values.expectedQuoteVersion! < 1)))
      throw new HttpError(400, "invalid_confirmed_commercial_terms", "Invalid terms command; Quote surface requires expectedQuoteVersion");
    if (saleSubmitted) requireCommercialEdit(actor, "sale");
    if (laborSubmitted) requireCommercialEdit(actor, "labor");
    await client.query("BEGIN");
    let verifiedQuoteVersion: number | undefined;
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
      await lockQuoteTermsContext(client, provenance);
      salesOrderIds = await findSalesOrderIdsByQuoteProvenance(client, provenance);
      current = await findTermsByQuoteProvenance(client, provenance);
      if (salesOrderIds.length === 0 && !current) {
        throw new HttpError(409, "quote_commercial_terms_not_linked", "Quote PriceVersion is not linked to a formal SalesOrder");
      }
    } else {
      throw new Error("ConfirmedCommercialTerms mutation target is required");
    }

    // All writers share the context lock; row lock also protects preservation
    // of omitted values. Never interpret missing client fields as clearing.
    if (current) {
      await client.query("SELECT id FROM confirmed_commercial_terms WHERE id=$1 FOR UPDATE", [current.id]);
      current = provenance ? await findTermsByQuoteProvenance(client, provenance) : await findTermsBySalesOrder(client, input.salesOrderId!);
    }
    assertExpectedVersion(current, input.values.expectedVersion);
    const values: CompleteTermsInput = {
      expectedVersion: input.values.expectedVersion,
      customerConfirmedPrice: saleSubmitted ? input.values.customerConfirmedPrice! : current?.customer_confirmed_price ?? null,
      confirmedLaborPrice: Object.hasOwn(input.values,"confirmedLaborPrice") ? input.values.confirmedLaborPrice! : current?.confirmed_labor_price ?? null,
      laborCurrency: Object.hasOwn(input.values,"laborCurrency") ? input.values.laborCurrency! : current?.labor_currency ?? null,
    };
    if (input.surface === "quote" && provenance) {
      const locked = await client.query("SELECT version FROM quote_center_quotes WHERE id=$1 FOR UPDATE", [provenance.quoteId]);
      if (!locked.rowCount) throw new HttpError(404, "quote_not_found", "Saved Server Quote not found; legacy provenance is not a writable Server source");
      if (locked.rows[0].version !== input.values.expectedQuoteVersion) throw new HttpError(409, "quote_version_conflict", "Saved Quote source changed");
      verifiedQuoteVersion = locked.rows[0].version;
      const record = (await readQuoteAggregateInTransaction(client, provenance.quoteId))!;
      const revision = record.quote.revisions.find(r => r.revisionId === provenance!.revisionId);
      if (!revision) throw new HttpError(404, "quote_revision_not_found", "Revision does not belong to Quote");
      if (!isWritableDefaultRevision(record.quote, revision.revisionId)) throw new HttpError(409, "quote_revision_read_only", "Quote surface requires current writable default Revision");
      const pv = revision.priceVersions.find(p => p.id === provenance!.priceVersionId);
      if (!pv) throw new HttpError(404, "quote_price_version_not_found", "PriceVersion does not belong to Revision");
      const currency = pv.pricingParameters.laborCurrency;
      // The first CCT write must preserve the other already confirmed PV field.
      if(!current&&pv.confirmation){
        if(!saleSubmitted)values.customerConfirmedPrice=pv.confirmation.confirmedGarmentPrice;
        if(!Object.hasOwn(input.values,'confirmedLaborPrice'))values.confirmedLaborPrice=pv.confirmation.confirmedLaborPrice;
        if(!Object.hasOwn(input.values,'laborCurrency')&&values.confirmedLaborPrice!==null)values.laborCurrency=currency;
      }
      if (laborSubmitted && !Object.hasOwn(input.values,"laborCurrency") && !current) values.laborCurrency = currency;
      if (laborSubmitted && (!isConfirmedLaborCurrency(currency) || values.laborCurrency !== currency))
        throw new HttpError(409, "saved_quote_labor_currency_conflict", "Compare saved PV currency with shared current; no automatic conversion");
      const partial = await client.query("SELECT 1 FROM sales_orders WHERE source_quote_id=$1 AND (source_revision_id IS NULL OR source_price_version_id IS NULL) LIMIT 1", [provenance.quoteId]);
      if (partial.rowCount) throw new HttpError(409, "incomplete_quote_provenance", "Quote linkage is incomplete");
      // Validate the saved Quote prerequisites, not completeness of the other
      // commercial field. Each authorized scalar may explicitly be cleared.
      const view = revision as unknown as QuoteRevision;
      const validation = validateCustomerConfirmation(view, view.priceVersions.find(p => p.id === pv.id)!, {
        labor: 0, garment: revision.baseInfo.quoteType === "processing" ? null : 0,
      });
      if (!validation.valid || revision.baseInfo.quoteType === "processing" && values.customerConfirmedPrice !== null)
        throw new HttpError(400, "quote_confirmation_incomplete", "Complete required saved Quote fields and confirmation amounts");
    }
    if (values.confirmedLaborPrice !== null && values.laborCurrency === null)
      throw new HttpError(400,"invalid_confirmed_commercial_terms","Labor currency is required for a labor amount");
    if (input.surface === "order" && provenance && laborSubmitted) {
      assertOrderPreservesLinkedLaborCurrency(current, values);
    }
    if (current && sameTerms(current, values)) {
      await client.query("COMMIT");
      return { ...composeTermsDto({ linkage: provenance ? "linked" : "unlinked", scope, provenance, salesOrderIds, terms: current }), ...(verifiedQuoteVersion ? { verifiedQuoteVersion } : {}) };
    }
    if (!current
      && values.customerConfirmedPrice === null
      && values.confirmedLaborPrice === null
      && values.laborCurrency === null) {
      await client.query("COMMIT");
      return composeTermsDto({ linkage: provenance ? "linked" : "unlinked", scope, provenance, salesOrderIds, terms: null });
    }

    const after = current
      ? await updateTerms(client, { id: current.id, ...values })
      : await createTerms(client, {
        scope,
        provenance,
        customerConfirmedPrice: values.customerConfirmedPrice,
        confirmedLaborPrice: values.confirmedLaborPrice,
        laborCurrency: values.laborCurrency,
      });
    if (!after) {
      throw new HttpError(409, "confirmed_commercial_terms_version_conflict", "ConfirmedCommercialTerms version is stale");
    }
    // Legacy association is creation-only and immutable. New adoption history lives in its own table.
    await associateSalesOrders(client, after.id, provenance?await findCreationOrderIdsByQuoteProvenance(client,provenance):salesOrderIds);
    await appendTermsLog(client, actor, { before: current, after, provenance, salesOrderIds, surface: input.surface });
    await client.query("COMMIT");
    return { ...composeTermsDto({ linkage: provenance ? "linked" : "unlinked", scope, provenance, salesOrderIds, terms: after }), ...(verifiedQuoteVersion ? { verifiedQuoteVersion } : {}) };
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
  // Keep the exported compatibility command fail-closed for internal callers too.
  void pool;void actor;void salesOrderId;void values;
  throw new HttpError(409,"order_commercial_adoption_required","Order prices must be adopted as an independent commercial version");
}

export async function updateConfirmedCommercialTermsByQuote(
  pool: Pool,
  actor: TrustedIdentity,
  provenance: QuoteProvenance,
  values: UpdateQuoteConfirmedCommercialTermsInput,
): Promise<ConfirmedCommercialTermsDto> {
  return mutate(pool, actor, { provenance, values, surface: "quote" });
}

export function isConfirmedLaborCurrency(value: unknown): value is ConfirmedLaborCurrency {
  return value === "CNY" || value === "USD";
}

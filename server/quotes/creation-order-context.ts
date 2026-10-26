import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpError } from "../http/errors.js";
import { requireEffectiveOrderForWrite, supportsEffectiveAttribution } from "../sales-orders/effective-attribution.js";
import { effectiveOrderJoins, sourceOwnerSql } from "../sales-orders/effective-order-sql.js";
import { requireVerifiedOrderBusiness } from "../sales-orders/identity-service.js";
import { canonicalDecimal } from "./model.js";
import { creationId } from "./creation-contract.js";

export type CreationOrderSelection = { salesOrderId: string; fingerprint: string };
export type CreationOrderSnapshot = {
  schemaVersion: 1;
  salesOrderId: string;
  orderNo: string;
  orderVersion: number;
  attributionVersion: number;
  attributionChangeId: string | null;
  businessType: "ainuoke_contract";
  quoteType: "distribution";
  contract: { linkId: string; sourceId: string; salesContractNo: string; sourceOwnerOrderId: string };
  fields: { styleNo: string; quantity: string; garmentLeadDate: string | null; insideOrderNo: string; customerName: string; brandName: string };
  evidence: { sourceHash: string; savedAt: string };
};
export type CreationOrderContext = { fingerprint: string; snapshot: CreationOrderSnapshot };

function fail(status: number, code: string): never { throw new HttpError(status, code, code); }
export function parseCreationOrderSelection(value: unknown): CreationOrderSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "fingerprint,salesOrderId") fail(400, "invalid_creation_order_context");
  const body = value as Record<string, unknown>;
  if (typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(body.fingerprint)) fail(400, "invalid_creation_order_context");
  return { salesOrderId: creationId(body.salesOrderId), fingerprint: body.fingerprint };
}
export const creationOrderFingerprint = (snapshot: CreationOrderSnapshot) =>
  createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

/** Caller owns transaction, fresh grants and the effective-attribution lock.
 * The root lock is shared with source refresh and commercial adoption. No source
 * network operation or order mutation is performed here. */
export async function readCreationOrderContext(client: PoolClient, rawId: string): Promise<CreationOrderContext> {
  const id = creationId(rawId);
  const identity = await requireEffectiveOrderForWrite(client, id);
  const business = await requireVerifiedOrderBusiness(client, id, true);
  if (business.businessType === "processing") fail(409, "processing_order_source_fixed_by_batch");
  if (["completed", "cancelled"].includes(business.lifecycle_state)) fail(409, "creation_order_frozen");
  if ((await client.query("SELECT 1 FROM sales_order_commercial_heads WHERE sales_order_id=$1", [id])).rowCount)
    fail(409, "creation_order_already_adopted");
  const attributed = await supportsEffectiveAttribution(client);
  const rows = (await client.query(`SELECT so.order_no,so.version,m.sales_order_id::text AS source_owner_order_id,
    l.id::text AS link_id,m.source_id,m.sales_contract_no,m.inside_order_no,m.style_no,m.quantity::text,
    to_char(m.contract_delivery_date,'YYYY-MM-DD') AS delivery_date,m.customer_name_snapshot,m.brand_name_snapshot,m.source_hash,m.fetched_at
    FROM sales_orders so ${effectiveOrderJoins(attributed)}
    JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=${sourceOwnerSql(attributed)}
    JOIN sales_order_source_links l ON l.sales_order_id=m.sales_order_id AND l.source_system='ainuoke'
      AND l.source_entity_type='sales_contract' AND l.external_id=m.source_id AND l.sales_contract_no=m.sales_contract_no
    WHERE so.id=$1 FOR SHARE OF m,l`, [id])).rows;
  if (rows.length !== 1) fail(409, "trusted_contract_required");
  const row = rows[0];
  // Do not silently truncate a proven source value to fit the Quote contract.
  if (row.style_no.length > 200 || row.quantity.length > 128) fail(409, "creation_order_fields_unsupported");
  const snapshot: CreationOrderSnapshot = {
    schemaVersion: 1, salesOrderId: id, orderNo: row.order_no, orderVersion: row.version,
    attributionVersion: identity.attributionVersion, attributionChangeId: identity.attributionChangeId,
    businessType: "ainuoke_contract", quoteType: "distribution",
    contract: { linkId: row.link_id, sourceId: row.source_id, salesContractNo: row.sales_contract_no, sourceOwnerOrderId: row.source_owner_order_id },
    fields: { styleNo: row.style_no, quantity: canonicalDecimal(row.quantity), garmentLeadDate: row.delivery_date,
      insideOrderNo: row.inside_order_no, customerName: row.customer_name_snapshot, brandName: row.brand_name_snapshot },
    evidence: { sourceHash: row.source_hash, savedAt: row.fetched_at.toISOString() },
  };
  return { fingerprint: creationOrderFingerprint(snapshot), snapshot };
}

/** Immutable creation reference, independent of Quote revisions and SO adoption. */
export async function saveCreationOrderContext(client: PoolClient, quoteId: string, actorId: string,
  requestId: string, context: CreationOrderContext): Promise<void> {
  await client.query(`INSERT INTO quote_creation_order_contexts(quote_id,sales_order_id,actor_id,client_request_id,snapshot,snapshot_hash)
    VALUES($1,$2,$3,$4,$5,$6)`, [quoteId, context.snapshot.salesOrderId, actorId, requestId, context.snapshot, context.fingerprint]);
}

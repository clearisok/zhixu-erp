import type { PoolClient } from "pg";
import { businessColumns, calculatedColumns, columnPermissions, type BusinessColumn, type BusinessSource, type ConfirmationFact } from "../../features/quote-center/model/quote-business-view.js";
import { isQuoteConfirmationComplete } from "../../features/quote-center/model/quote-workflows.js";
import { canonicalDecimal } from "./decimal-projection.js";
import { readCostSnapshots } from "./repository.js";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import {resolveConfirmationSource} from '../confirmed-commercial-terms/confirmation-source.js';

const confirmationColumns: BusinessColumn[] = ["confirmedLabor", "confirmedGarment", "confirmationStatus"];
export function parseBusinessColumns(value: unknown): BusinessColumn[] {
  if (!Array.isArray(value) || !value.length || value.length > businessColumns.length
    || value.some(key => typeof key !== "string" || !businessColumns.some(c => c.key === key))
    || new Set(value).size !== value.length) throw new HttpError(400, "invalid_quote_columns", "Invalid or duplicate business columns");
  return value as BusinessColumn[];
}
export function authorizeBusinessColumns(actor: TrustedIdentity, keys: BusinessColumn[]): void {
  for (const key of keys) for (const permission of columnPermissions(key)) requirePermission(actor.permissions, permission);
}
type Root = Omit<BusinessSource, "versions">;
export type CurrentBinding = { orderIds: string[]; partial: boolean; terms: { id: string; version: number; labor: string | null; garment: string | null; currency: "CNY" | "USD" | null } | null };
export const provenanceKey = (quoteId: string, revisionId: string, priceVersionId: string) => JSON.stringify([quoteId, revisionId, priceVersionId]);
const decimal = (value: string | null) => value === null ? null : canonicalDecimal(value);

/** Exact provenance, same rules as the linked current reader. Fixed two queries, bounded roots. */
export async function readCurrentBindings(client: PoolClient, roots: Root[], versions: Array<{ quote_id: string; revision_id: string; id: string }>) {
  const ids = roots.map(r => r.id);
  const colorLines=(await client.query("SELECT to_regclass('sales_order_commercial_lines') IS NOT NULL AS ready")).rows[0].ready;
  const orders = (await client.query<{ id: string; source_quote_id: string; source_revision_id: string | null; source_price_version_id: string | null }>(
    `SELECT id::text,source_quote_id,source_revision_id,source_price_version_id FROM sales_orders WHERE source_quote_id=ANY($1::text[])
     UNION SELECT sales_order_id::text,quote_id,revision_id,price_version_id FROM sales_order_commercial_versions WHERE quote_id=ANY($1::text[]) AND price_version_id IS NOT NULL
     ${colorLines?"UNION SELECT v.sales_order_id::text,v.quote_id,v.revision_id,l.price_version_id FROM sales_order_commercial_versions v JOIN sales_order_commercial_lines l ON l.commercial_version_id=v.id WHERE v.quote_id=ANY($1::text[])":""} ORDER BY id`, [ids])).rows;
  const terms = (await client.query<{ id: string; quote_id: string; revision_id: string; price_version_id: string; version: number; labor: string | null; garment: string | null; currency: "CNY" | "USD" | null }>(
    `SELECT t.id::text,t.quote_id,t.revision_id,t.price_version_id,t.version,t.confirmed_labor_price::text AS labor,t.customer_confirmed_price::text AS garment,t.labor_currency AS currency
     FROM confirmed_commercial_terms t JOIN quote_center_quotes q ON q.id=t.quote_id AND q.default_revision_id=t.revision_id
     WHERE t.ownership_scope='quote' AND t.quote_id=ANY($1::text[])`, [ids])).rows;
  const result = new Map<string, CurrentBinding>();
  for (const v of versions) {
    const matches = orders.filter(o => o.source_quote_id === v.quote_id && o.source_revision_id === v.revision_id && o.source_price_version_id === v.id);
    const term = terms.find(t => t.quote_id === v.quote_id && t.revision_id === v.revision_id && t.price_version_id === v.id);
    result.set(provenanceKey(v.quote_id, v.revision_id, v.id), { orderIds: matches.map(o => o.id), partial: orders.some(o => o.source_quote_id === v.quote_id && (o.source_revision_id === null || o.source_price_version_id === null)),
      terms: term ? { id: term.id, version: term.version, labor: decimal(term.labor), garment: decimal(term.garment), currency: term.currency } : null });
  }
  return result;
}

/** Only the selected default revisions; no aggregate/history/Estimate read or per-PV SQL. */
export async function readBusinessSources(client: PoolClient, roots: Root[], columns: BusinessColumn[]) {
  const sources = roots.map(root => ({ ...root, versions: [] } as BusinessSource));
  if (!roots.length) return { sources, bindings: new Map<string, CurrentBinding>() };
  const rows = (await client.query<{ quote_id: string; revision_id: string; id: string; name: string; quantity: string | null }>(
    `SELECT p.quote_id,p.revision_id,p.id,p.metadata->>'name' AS name,p.quantity::text FROM quote_center_price_versions p
     JOIN quote_center_quotes q ON q.id=p.quote_id AND q.default_revision_id=p.revision_id
     WHERE p.quote_id=ANY($1::text[]) ORDER BY p.quote_id,p.position`, [roots.map(r => r.id)])).rows;
  const snapshots = rows.map(v => JSON.stringify([v.quote_id, "price", v.revision_id, v.id]));
  const costs = columns.some(c => calculatedColumns.includes(c)) ? await readCostSnapshots(client, snapshots) : new Map();
  const wantsConfirmation = columns.some(c => confirmationColumns.includes(c));
  const bindings = wantsConfirmation ? await readCurrentBindings(client, roots, rows) : new Map<string, CurrentBinding>();
  const confirmations = wantsConfirmation ? (await client.query<{ id: string; confirmation_metadata: unknown; labor: string | null; garment: string | null; currency: "CNY" | "USD" }>(
    `SELECT id,confirmation_metadata,confirmed_labor_price::text AS labor,confirmed_garment_price::text AS garment,pricing_metadata->>'laborCurrency' AS currency
     FROM quote_center_cost_snapshots WHERE id=ANY($1::text[])`, [snapshots])).rows : [];
  for (const v of rows) {
    const root = sources.find(r => r.id === v.quote_id)!;
    const id = JSON.stringify([v.quote_id, "price", v.revision_id, v.id]);
    let confirmation: ConfirmationFact | undefined;
    if (wantsConfirmation) {
      const binding = bindings.get(provenanceKey(v.quote_id, v.revision_id, v.id))!;
      const snap = confirmations.find(c => c.id === id);
      if (!snap) throw new HttpError(409, "quote_business_source_missing", "Selected pricing source is incomplete");
      const resolved=resolveConfirmationSource({terms:binding.terms?{id:binding.terms.id,version:binding.terms.version,labor:binding.terms.labor,sale:binding.terms.garment,currency:binding.terms.currency,confirmedAt:''}:null,
        snapshot:snap.confirmation_metadata?{labor:snap.labor,sale:snap.garment,currency:snap.currency,confirmedAt:''}:null});
      const linked = resolved.source === 'cct';
      const labor = binding.partial ? null : resolved.labor;
      const garment = binding.partial ? null : resolved.sale;
      confirmation = { linkage: binding.partial ? "unknown" : linked ? "linked" : "unlinked", labor, garment,
        currency: resolved.currency,
        confirmed: !binding.partial && isQuoteConfirmationComplete(root.baseInfo.quoteType, labor, garment), termsVersion: linked ? binding.terms?.version ?? null : null };
    }
    root.versions.push({ id: v.id, name: v.name, quantity: decimal(v.quantity), ...(costs.has(id) ? { cost: costs.get(id) } : {}), ...(confirmation ? { confirmation } : {}) });
  }
  return { sources, bindings };
}

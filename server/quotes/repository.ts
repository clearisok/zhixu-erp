import { isDeepStrictEqual } from "node:util";
import type { Pool, PoolClient } from "pg";
import { canonicalDecimal, normalizeServerQuote, QuoteConflictError, validateQuote, validateQuoteReplacement, type QuoteRecord, type ServerQuote } from "./model.js";

type ObjectData = Record<string, unknown>;
type Snapshot = ServerQuote["revisions"][number]["priceVersions"][number] | NonNullable<ServerQuote["activeEstimateCost"]>;
type NumericFields = Readonly<Record<string, string>>;
export type QuoteMutation = {
  kind: "create" | "save";
  before: QuoteRecord | null;
  after: QuoteRecord;
};
export type QuoteMutationHook = (client: PoolClient, mutation: QuoteMutation) => Promise<void>;
const pricingFields = { usdCnyRate: "usd_cny_rate", markupRate: "markup_rate", freightAmount: "freight_amount" };
const confirmationFields = { quotedGarmentPrice: "quoted_garment_price", confirmedGarmentPrice: "confirmed_garment_price", quotedLaborPrice: "quoted_labor_price", confirmedLaborPrice: "confirmed_labor_price" };
const lineSpecs = [
  { key: "fabrics", table: "quote_center_fabric_lines", fields: { segmentLengthCm: "segment_length_cm", netWidthCm: "net_width_cm", gsm: "gsm", lossRate: "loss_rate", unitPrice: "unit_price" } },
  { key: "trims", table: "quote_center_trim_lines", fields: { usage: "usage", lossRate: "loss_rate", unitPrice: "unit_price" } },
  { key: "otherCosts", table: "quote_center_other_cost_lines", fields: { usage: "usage", lossRate: "loss_rate", unitPrice: "unit_price", amount: "amount" } },
] as const;
function omit(data: object, keys: string[]): ObjectData { return Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key))); }
function decimals(data: object, fields: NumericFields): ObjectData {
  return Object.fromEntries(Object.entries(fields).map(([key, column]) => [column, (data as ObjectData)[key]]));
}
function restore(row: ObjectData, metadataKey: string, fields: NumericFields): ObjectData {
  return { ...(row[metadataKey] as ObjectData), ...Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[column] === null ? null : canonicalDecimal(String(row[column]))])) };
}
function numericProjection(fields: NumericFields): string { return Object.values(fields).map((column) => `${column}::text AS ${column}`).join(","); }
const snapshotProjection = `*,${numericProjection({ ...pricingFields, ...confirmationFields, labor: "labor_value" })}`;
async function insert(client: PoolClient, table: string, row: ObjectData): Promise<void> {
  // Identifiers originate only from the fixed table/column definitions in this module.
  const entries = Object.entries(row);
  await client.query(`INSERT INTO ${table} (${entries.map(([k]) => k).join(",")}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(",")})`, entries.map(([, value]) => value));
}
async function writeSnapshot(client: PoolClient, quoteId: string, snapshot: Snapshot, revisionId: string | null) {
  const id = JSON.stringify([quoteId, revisionId === null ? "estimate" : "price", revisionId, snapshot.id]);
  const confirmation = "confirmation" in snapshot ? snapshot.confirmation : null;
  await insert(client, "quote_center_cost_snapshots", {
    id, quote_id: quoteId, revision_id: revisionId, price_version_id: revisionId === null ? null : snapshot.id, estimate_id: revisionId === null ? snapshot.id : null,
    pricing_metadata: omit(snapshot.pricingParameters, Object.keys(pricingFields)), ...decimals(snapshot.pricingParameters, pricingFields),
    labor_metadata: omit(snapshot.labor, ["value"]), labor_value: snapshot.labor.value,
    confirmation_metadata: confirmation ? omit(confirmation, Object.keys(confirmationFields)) : null,
    ...Object.fromEntries(Object.values(confirmationFields).map((column) => [column, null])), ...(confirmation ? decimals(confirmation, confirmationFields) : {}),
  });
  for (const spec of lineSpecs) for (const [position, line] of snapshot[spec.key].entries()) {
    await insert(client, spec.table, { snapshot_id: id, id: line.id, position, metadata: omit(line, ["id", ...Object.keys(spec.fields)]), ...decimals(line, spec.fields) });
  }
}
async function clearSnapshot(client: PoolClient, quoteId: string, revisionId: string | null, estimateId?: string) {
  const condition = revisionId === null ? "quote_id=$1 AND estimate_id=$2" : "quote_id=$1 AND revision_id=$2";
  const values = [quoteId, revisionId ?? estimateId];
  for (const spec of lineSpecs) await client.query(`DELETE FROM ${spec.table} WHERE snapshot_id IN (SELECT id FROM quote_center_cost_snapshots WHERE ${condition})`, values);
  await client.query(`DELETE FROM quote_center_cost_snapshots WHERE ${condition}`, values);
}
async function writeRevision(client: PoolClient, quoteId: string, revision: ServerQuote["revisions"][number], position: number, exists: boolean) {
  const metadata = omit(revision, ["revisionId", "priceVersions"]);
  if (exists) {
    await clearSnapshot(client, quoteId, revision.revisionId);
    await client.query("DELETE FROM quote_center_price_versions WHERE quote_id=$1 AND revision_id=$2", [quoteId, revision.revisionId]);
    await client.query("UPDATE quote_center_revisions SET metadata=$3 WHERE quote_id=$1 AND id=$2", [quoteId, revision.revisionId, metadata]);
  } else await insert(client, "quote_center_revisions", { quote_id: quoteId, id: revision.revisionId, position, metadata });
  for (const [versionPosition, version] of revision.priceVersions.entries()) {
    await insert(client, "quote_center_price_versions", { quote_id: quoteId, revision_id: revision.revisionId, id: version.id, position: versionPosition, quantity: version.quantity,
      metadata: omit(version, ["id", "quantity", "pricingParameters", "fabrics", "trims", "labor", "otherCosts", "confirmation"]) });
    await writeSnapshot(client, quoteId, version, revision.revisionId);
  }
}
async function writeChildren(client: PoolClient, quote: ServerQuote, previous?: ServerQuote) {
  for (const [position, revision] of quote.revisions.entries()) {
    const old = previous?.revisions.find((r) => r.revisionId === revision.revisionId);
    if (isDeepStrictEqual(old, revision)) continue;
    if (old && isDeepStrictEqual({ ...old, readOnly: true }, revision)) {
      await client.query("UPDATE quote_center_revisions SET metadata=$3 WHERE quote_id=$1 AND id=$2", [quote.id, revision.revisionId, omit(revision, ["revisionId", "priceVersions"])]);
    } else await writeRevision(client, quote.id, revision, position, Boolean(old));
  }
  // Archive the old active before inserting its replacement (partial unique index).
  const entries = [...quote.estimateCostHistory.map((e, position) => ({ e, position, active: false })), ...(quote.activeEstimateCost ? [{ e: quote.activeEstimateCost, position: 0, active: true }] : [])];
  for (const { e, position, active } of entries) {
    const old = previous?.estimateCostHistory.find((item) => item.id === e.id) ?? (previous?.activeEstimateCost?.id === e.id ? previous.activeEstimateCost : undefined);
    if (old) {
      await client.query("UPDATE quote_center_estimates SET is_active=$3,position=$4 WHERE quote_id=$1 AND id=$2", [quote.id, e.id, active, position]);
      if (isDeepStrictEqual(old, e)) continue;
      await clearSnapshot(client, quote.id, null, e.id);
      await client.query("UPDATE quote_center_estimates SET metadata=$3 WHERE quote_id=$1 AND id=$2", [quote.id, e.id, omit(e, ["id", "pricingParameters", "fabrics", "trims", "labor", "otherCosts"])]);
    } else await insert(client, "quote_center_estimates", { quote_id: quote.id, id: e.id, position, is_active: active, metadata: omit(e, ["id", "pricingParameters", "fabrics", "trims", "labor", "otherCosts"]) });
    await writeSnapshot(client, quote.id, e, null);
  }
}
async function readSnapshot(client: PoolClient, row: ObjectData): Promise<ObjectData> {
  const output: ObjectData = { pricingParameters: restore(row, "pricing_metadata", pricingFields), labor: { ...(row.labor_metadata as ObjectData), value: row.labor_value === null ? null : canonicalDecimal(String(row.labor_value)) } };
  if (row.price_version_id !== null) output.confirmation = row.confirmation_metadata === null ? null : restore(row, "confirmation_metadata", confirmationFields);
  for (const spec of lineSpecs) {
    const lines = await client.query(`SELECT *,${numericProjection(spec.fields)} FROM ${spec.table} WHERE snapshot_id=$1 ORDER BY position`, [row.id]);
    output[spec.key] = lines.rows.map((line) => ({ ...restore(line, "metadata", spec.fields), id: line.id }));
  }
  return output;
}
async function readAggregate(client: PoolClient, id: string): Promise<QuoteRecord | null> {
  const roots = await client.query("SELECT * FROM quote_center_quotes WHERE id=$1", [id]);
  if (!roots.rowCount) return null;
  const root = roots.rows[0];
  const revisions: ObjectData[] = [];
  for (const revision of (await client.query("SELECT * FROM quote_center_revisions WHERE quote_id=$1 ORDER BY position", [id])).rows) {
    const priceVersions: ObjectData[] = [];
    for (const version of (await client.query("SELECT *,quantity::text AS quantity FROM quote_center_price_versions WHERE quote_id=$1 AND revision_id=$2 ORDER BY position", [id, revision.id])).rows) {
      const snapshot = (await client.query(`SELECT ${snapshotProjection} FROM quote_center_cost_snapshots WHERE quote_id=$1 AND revision_id=$2 AND price_version_id=$3`, [id, revision.id, version.id])).rows[0];
      if (!snapshot) throw new Error("Incomplete Quote cost snapshot");
      priceVersions.push({ ...version.metadata, id: version.id, quantity: version.quantity === null ? null : canonicalDecimal(version.quantity), ...await readSnapshot(client, snapshot) });
    }
    revisions.push({ ...revision.metadata, revisionId: revision.id, priceVersions });
  }
  let activeEstimateCost: ObjectData | null = null;
  const estimateCostHistory: ObjectData[] = [];
  for (const e of (await client.query("SELECT * FROM quote_center_estimates WHERE quote_id=$1 ORDER BY position", [id])).rows) {
    const snapshot = (await client.query(`SELECT ${snapshotProjection} FROM quote_center_cost_snapshots WHERE quote_id=$1 AND estimate_id=$2`, [id, e.id])).rows[0];
    if (!snapshot) throw new Error("Incomplete Estimate cost snapshot");
    const estimate = { ...e.metadata, id: e.id, ...await readSnapshot(client, snapshot) };
    if (e.is_active) activeEstimateCost = estimate; else estimateCostHistory.push(estimate);
  }
  return { version: root.version, quote: { ...root.metadata, id: root.id, quoteCode: root.quote_code, defaultRevisionId: root.default_revision_id, revisions, activeEstimateCost, estimateCostHistory } as ServerQuote };
}
async function transaction<T>(pool: Pool, readOnly: boolean, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
/** Internal Q1 persistence only. No HTTP routes, authentication or Browser writer. */
export function createQuoteRepository(pool: Pool) {
  return {
    getById(id: string) { return transaction(pool, true, (client) => readAggregate(client, id)); },
    async list(limit = 50, offset = 0): Promise<Array<{ id: string; quoteCode: string; defaultRevisionId: string; version: number }>> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) throw new Error("Invalid Quote pagination");
      const rows = await pool.query("SELECT id,quote_code,default_revision_id,version FROM quote_center_quotes ORDER BY id LIMIT $1 OFFSET $2", [limit, offset]);
      return rows.rows.map((r) => ({ id: r.id, quoteCode: r.quote_code, defaultRevisionId: r.default_revision_id, version: r.version }));
    },
    create(input: ServerQuote, afterWrite?: QuoteMutationHook): Promise<QuoteRecord> {
      const quote = normalizeServerQuote(input); validateQuote(quote);
      return transaction(pool, false, async (client) => {
        await insert(client, "quote_center_quotes", { id: quote.id, quote_code: quote.quoteCode, default_revision_id: quote.defaultRevisionId, metadata: omit(quote, ["id", "quoteCode", "defaultRevisionId", "revisions", "activeEstimateCost", "estimateCostHistory"]) });
        await writeChildren(client, quote);
        const result = { quote, version: 1 };
        await afterWrite?.(client, { kind: "create", before: null, after: result });
        return result;
      });
    },
    save(input: ServerQuote, expectedVersion: number, afterWrite?: QuoteMutationHook): Promise<QuoteRecord> {
      const quote = normalizeServerQuote(input); validateQuote(quote);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new QuoteConflictError();
      return transaction(pool, false, async (client) => {
        const locked = await client.query("SELECT version FROM quote_center_quotes WHERE id=$1 FOR UPDATE", [quote.id]);
        if (locked.rows[0]?.version !== expectedVersion) throw new QuoteConflictError();
        const previous = await readAggregate(client, quote.id);
        if (!previous) throw new QuoteConflictError();
        validateQuoteReplacement(previous.quote, quote);
        await writeChildren(client, quote, previous.quote);
        await client.query("UPDATE quote_center_quotes SET quote_code=$2,default_revision_id=$3,metadata=$4,version=version+1 WHERE id=$1", [quote.id, quote.quoteCode, quote.defaultRevisionId, omit(quote, ["id", "quoteCode", "defaultRevisionId", "revisions", "activeEstimateCost", "estimateCostHistory"])]);
        const result = { quote, version: expectedVersion + 1 };
        await afterWrite?.(client, { kind: "save", before: previous, after: result });
        return result;
      });
    },
  };
}

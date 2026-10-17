import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Pool, PoolClient } from "pg";
import { buildQuoteSummaryTable, type SummaryTable } from "../../features/quote-center/export/quote-summary-core.js";
import { businessColumns, businessValues, processingHiddenColumns, calculatedColumns, columnPermissions, estimateColumns, type BusinessColumn, type BusinessSource, type BusinessValues, type CostSlice, type EstimateColumn } from "../../features/quote-center/model/quote-business-view.js";
import { projectForBrowser, UnsafeServerQuoteDecimalError } from "../../features/quote-center/model/exact-decimal-view.js";
import { nullablePriceVersionMetrics } from "../../features/quote-center/model/quote-presentation.js";
import { estimateCostIsStale } from "../../features/quote-center/model/estimate-cost.js";
import { authorizeBusinessColumns, parseBusinessColumns, provenanceKey, readBusinessSources, readCurrentBindings } from "./business-source.js";
import { readCostSnapshots } from "./repository.js";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { lockQuoteTermsContext } from "../confirmed-commercial-terms/repository.js";
import { appendOperationLog } from "../operation-logs/repository.js";

export const SUMMARY_MAX_QUOTES = 25, SUMMARY_MAX_ROWS = 500, SUMMARY_MAX_BYTES = 20 * 1024 * 1024;
export type InternalSummarySelection = { items: Array<{ quoteId: string; expectedVersion: number }>; columns: BusinessColumn[]; rowMode: "quote" | "price-version"; estimateColumns: EstimateColumn[] };
export function parseInternalSummary(body: Record<string, unknown>): InternalSummarySelection {
  const invalid = () => new HttpError(400, "invalid_internal_summary", "Invalid summary selection");
  if (Object.keys(body).some(k => !["items", "columns", "rowMode", "estimateColumns"].includes(k))
    || !["quote", "price-version"].includes(String(body.rowMode)) || !Array.isArray(body.items) || !body.items.length || body.items.length > SUMMARY_MAX_QUOTES
    || body.items.some(item => !item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(k => !["quoteId", "expectedVersion"].includes(k)) || typeof item.quoteId !== "string" || !item.quoteId || item.quoteId.length > 200 || !Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 1)
    || new Set(body.items.map(item => item.quoteId)).size !== body.items.length) throw invalid();
  const columns = parseBusinessColumns(body.columns);
  const selected = body.estimateColumns ?? [];
  if (!Array.isArray(selected) || selected.length > 3 || selected.some(k => !estimateColumns.includes(k)) || new Set(selected).size !== selected.length) throw invalid();
  return { items: body.items, columns, rowMode: body.rowMode as InternalSummarySelection["rowMode"], estimateColumns: selected };
}
const estimateLabels = { estimateTotal: "估算总成本", estimateRevision: "估算成本来源报价版本", estimateDifference: "销售价与估算成本差额" };
async function readRoots(client: PoolClient, ids: string[]) {
  return (await client.query(`SELECT q.id,q.quote_code AS "quoteCode",q.version,q.default_revision_id AS "revisionId",q.metadata->>'aggregateStatus' AS status,r.metadata->>'revisionLabel' AS "revisionLabel",r.metadata->'baseInfo' AS "baseInfo"
    FROM quote_center_quotes q JOIN quote_center_revisions r ON r.quote_id=q.id AND r.id=q.default_revision_id WHERE q.id=ANY($1::text[]) AND q.metadata->>'deletedAt' IS NULL`, [ids])).rows as Array<Omit<BusinessSource, "versions">>;
}
async function readEstimates(client: PoolClient, sources: BusinessSource[], keys: EstimateColumn[]) {
  const output = new Map<string, BusinessValues>();
  if (!keys.length) return output; // No Estimate query, conversion, cache or builder input.
  const rows = (await client.query(`SELECT e.quote_id,e.id,e.metadata->>'basedOnRevisionId' AS revision_id,e.metadata->>'sourcePriceVersionId' AS source_pv,e.metadata->>'ignoredForRevisionId' AS ignored,r.metadata->>'revisionLabel' AS label
    FROM quote_center_estimates e LEFT JOIN quote_center_revisions r ON r.quote_id=e.quote_id AND r.id=e.metadata->>'basedOnRevisionId'
    WHERE e.is_active=true AND e.quote_id=ANY($1::text[])`, [sources.map(s => s.id)])).rows;
  const numeric = keys.some(k => k !== "estimateRevision");
  const costs = numeric ? await readCostSnapshots(client, rows.map(e => JSON.stringify([e.quote_id, "estimate", null, e.id]))) : new Map();
  for (const source of sources) {
    const e = rows.find(row => row.quote_id === source.id);
    const values: BusinessValues = {};
    const cost = e && numeric ? costs.get(JSON.stringify([e.quote_id, "estimate", null, e.id])) : undefined;
    if (e && numeric && !cost) throw new HttpError(409, "quote_business_source_missing", "Selected Estimate source is incomplete");
    const total = cost ? nullablePriceVersionMetrics(projectForBrowser(cost) as CostSlice).preMarkupTotal : null;
    if (total !== null && !Number.isFinite(total)) throw new HttpError(409, "unsafe_summary_value", "Estimate value cannot be represented safely");
    for (const key of keys) {
      let value: string | number | null = null;
      if (e && key === "estimateRevision") {
        const stale = estimateCostIsStale({ defaultRevisionId: source.revisionId }, { basedOnRevisionId: e.revision_id, ignoredForRevisionId: e.ignored });
        value = `${e.label ?? e.revision_id}${stale ? "（旧来源）" : e.revision_id !== source.revisionId ? "（已忽略旧来源）" : ""}`;
      }
      if (key === "estimateTotal") value = total;
      // Difference is resolved against each actual PV below, not a made-up Estimate per PV.
      values[key] = { value, display: value === null ? "—" : String(value), ...(key === "estimateTotal" ? { numberFormat: '"¥"#,##0.00' } : {}) };
    }
    if (numeric) values.estimateTotal = { value: total, display: total === null ? "—" : String(total), numberFormat: '"¥"#,##0.00' };
    output.set(source.id, values);
  }
  return output;
}
export function createInternalSummaryService(pool: Pool, build: typeof buildQuoteSummaryTable = buildQuoteSummaryTable) {
  return { async generate(actor: TrustedIdentity, selection: InternalSummarySelection) {
    // Also validate internal callers; client-supplied flags never establish authorization.
    selection = parseInternalSummary(selection);
    requirePermission(actor.permissions, "quote.export"); authorizeBusinessColumns(actor, selection.columns);
    for (const key of selection.estimateColumns) for (const permission of columnPermissions(key)) requirePermission(actor.permissions, permission);
    const needsDifference = selection.estimateColumns.includes("estimateDifference");
    const needed: BusinessColumn[] = [...selection.columns];
    if (needsDifference && !needed.some(k => calculatedColumns.includes(k))) needed.push("garmentPrice");
    const reader = await pool.connect();
    let loaded: Awaited<ReturnType<typeof readBusinessSources>>, estimates: Map<string, BusinessValues>;
    try {
      await reader.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const roots = await readRoots(reader, selection.items.map(i => i.quoteId));
      for (const item of selection.items) {
        const root = roots.find(r => r.id === item.quoteId);
        if (!root) throw new HttpError(404, "quote_not_found", `Selected Quote not found: ${item.quoteId}`);
        if (root.version !== item.expectedVersion) throw new HttpError(409, "quote_version_conflict", `Saved Quote changed: ${item.quoteId}`);
      }
      loaded = await readBusinessSources(reader, selection.items.map(i => roots.find(r => r.id === i.quoteId)!), needed);
      if ([...loaded.bindings.values()].some(b => b.partial)) throw new HttpError(409, "incomplete_quote_provenance", "Selected current source cannot be resolved exactly");
      const count = selection.rowMode === "quote" ? loaded.sources.length : loaded.sources.reduce((n, s) => n + s.versions.length, 0);
      if (count > SUMMARY_MAX_ROWS) throw new HttpError(413, "internal_summary_row_limit", "Summary exceeds 500 rows; selection was not truncated");
      estimates = await readEstimates(reader, loaded.sources.filter(s=>s.baseInfo.quoteType!=='processing'), selection.estimateColumns);
      await reader.query("COMMIT");
    } catch (error) {
      await reader.query("ROLLBACK");
      if (error instanceof UnsafeServerQuoteDecimalError) throw new HttpError(409, "unsafe_quote_business_decimal", "Selected business value cannot be represented safely");
      throw error;
    } finally { reader.release(); }
    const onlyProcessing=loaded.sources.every(s=>s.baseInfo.quoteType==='processing');
    const columns=onlyProcessing?selection.columns.filter(k=>!processingHiddenColumns.includes(k)):selection.columns;
    const selectedEstimates=onlyProcessing?[]:selection.estimateColumns;
    const headers = columns.map(key => selection.rowMode === "price-version" && key === "quantity" ? "数量" : businessColumns.find(c => c.key === key)!.label);
    if (selection.rowMode === "price-version") headers.splice(1, 0, "价格版本");
    headers.push(...selectedEstimates.map(k => estimateLabels[k]));
    const rows: SummaryTable["rows"] = [];
    try {
      for (const source of loaded.sources) for (const pv of selection.rowMode === "quote" ? [undefined] : source.versions) {
        const values = businessValues(source, columns, pv);
        const row = columns.map(key => ({ ...values[key]!, ...(["confirmedLabor", "confirmedGarment", "confirmationStatus"].includes(key) ? {
          note: (pv ? [pv] : source.versions).map(v => `${v.name} / ${v.id}: ${v.confirmation?.linkage === "linked" ? `CCT current v${v.confirmation.termsVersion ?? "empty"}` : v.confirmation?.linkage === "unlinked" ? "saved PV confirmation snapshot" : "unknown provenance"}`).join("\n")
        } : {}) }));
        if (selection.rowMode === "price-version") row.splice(1, 0, { value: pv!.name, display: pv!.name });
        for (const key of selectedEstimates) {
          if(source.baseInfo.quoteType==='processing'){row.push({value:null,display:'—'});continue;}
          const estimate = estimates.get(source.id)!;
          if (key !== "estimateDifference") { row.push(estimate[key]!); continue; }
          // When only difference was requested, readEstimates still calculates active total without exposing another column.
          const total = estimate.estimateTotal?.value;
          const actualTotal = total === undefined ? null : total as number | null;
          const sales = actualTotal === null ? [] : (pv ? [pv] : source.versions).map(v => nullablePriceVersionMetrics(projectForBrowser(v.cost) as CostSlice).garmentSellingPrice).filter((n): n is number => n !== null).map(n => n - actualTotal);
          const value = !sales.length ? null : Math.min(...sales) === Math.max(...sales) ? sales[0] : `${Math.min(...sales).toFixed(2)} - ${Math.max(...sales).toFixed(2)}`;
          row.push({ value, display: value === null ? "—" : String(value), numberFormat: '"¥"#,##0.00' });
        }
        rows.push(row);
      }
    } catch (error) {
      if (error instanceof UnsafeServerQuoteDecimalError) throw new HttpError(409, "unsafe_quote_business_decimal", "Selected business value cannot be represented safely");
      throw error;
    }
    const result = await build({ headers, rows, wrapBody: true });
    const bytes = Buffer.from(result.buffer);
    if (!bytes.length || bytes.length > SUMMARY_MAX_BYTES) throw new HttpError(413, "internal_summary_size_limit", "Summary exceeds technical file limit");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      const contexts = loaded.sources.flatMap(source => source.versions.filter(v => loaded.bindings.has(provenanceKey(source.id, source.revisionId, v.id))).map(v => ({ quoteId: source.id, revisionId: source.revisionId, priceVersionId: v.id })));
      contexts.sort((a, b) => provenanceKey(a.quoteId, a.revisionId, a.priceVersionId).localeCompare(provenanceKey(b.quoteId, b.revisionId, b.priceVersionId)));
      for (const context of contexts) await lockQuoteTermsContext(writer, context);
      // Canonical order: all terms contexts first, then sorted Quote rows. No locks during Excel construction.
      for (const source of [...loaded.sources].sort((a, b) => a.id.localeCompare(b.id))) {
        const locked = await writer.query("SELECT version FROM quote_center_quotes WHERE id=$1 FOR UPDATE", [source.id]);
        if (locked.rows[0]?.version !== source.version) throw new HttpError(409, "quote_version_conflict", `Source changed while generating: ${source.id}`);
      }
      if (loaded.bindings.size) {
        const current = await readCurrentBindings(writer, loaded.sources, contexts.map(c => ({ quote_id: c.quoteId, revision_id: c.revisionId, id: c.priceVersionId })));
        if (!isDeepStrictEqual(current, loaded.bindings)) throw new HttpError(409, "commercial_terms_version_conflict", "Current confirmation changed during generation");
      }
      await appendOperationLog(writer, actor, { module: "报价中心", action: "导出报价汇总表", entityType: "Export", entityId: loaded.sources[0].id,
        metadata: { workflowAction: "quote.summary.generated", rowMode: selection.rowMode, columns: selection.columns, estimateColumns: selection.estimateColumns,
          sources: loaded.sources.map(s => ({ quoteId: s.id, revisionId: s.revisionId, priceVersionIds: s.versions.map(v => v.id), version: s.version })), rowCount: rows.length, fileName: result.fileName, byteSize: bytes.length, sha256 } });
      await writer.query("COMMIT");
    } catch (error) { await writer.query("ROLLBACK"); throw error; } finally { writer.release(); }
    return { bytes, fileName: result.fileName, sha256, rowCount: rows.length };
  } };
}

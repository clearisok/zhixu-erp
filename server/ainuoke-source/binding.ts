import type { Pool } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { requirePermission } from "../auth/permissions.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { createAinuokeSalesOrderInTransaction } from "../sales-orders/service.js";
import { adaptAinuokeOrderDiscoverySnapshots } from "../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js";
import { adaptAinuokeGarmentColorSizeSnapshots, normalizeAinuokeSalesContractNo } from "../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js";
import { buildFinalSalesOrderBootstrapPreview } from "../../features/ainuoke-sync/service/sales-order-final-bootstrap-preview.js";
import type { AinuokeOrderDiscoveryQuery, AinuokeSalesContractQuery, AinuokeReportSnapshot } from "../../features/ainuoke-api/model/ainuoke-api.js";
import { SourceError, hash, sourceKeyValid, inspect, pagesValid, discoveryContentHash } from "./contract.js";
import { boundOrders, sourceActor } from "./service.js";
import { previewAdditions, selectContracts, assertStoredAdditionMatches } from "./additions.js";

export type BindingBundle = {
  schemaVersion: "ainuoke-order-binding.v1";
  discoveryBefore: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  discoveryAfter: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  colors: Record<string, AinuokeReportSnapshot<AinuokeSalesContractQuery>[]>;
};
/** No DB/source reads or writes. All facts pass the existing formal bootstrap mapper. */
export async function previewBindings(input: unknown, now = Date.now(), maxAgeMs = 600000) {
  try {
    if (!Number.isFinite(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1
      || !input || typeof input !== "object" || Buffer.byteLength(JSON.stringify(input)) > 32 * 1024 * 1024) throw new SourceError("binding_invalid");
    inspect(input);
    const b = structuredClone(input) as BindingBundle;
    if (b.schemaVersion !== "ainuoke-order-binding.v1" || Object.keys(b).sort().join(",") !== "colors,discoveryAfter,discoveryBefore,schemaVersion"
      || !b.colors || typeof b.colors !== "object" || Array.isArray(b.colors)) throw new SourceError("binding_invalid");
    pagesValid(b.discoveryBefore, now, maxAgeMs); pagesValid(b.discoveryAfter, now, maxAgeMs);
    const before = await adaptAinuokeOrderDiscoverySnapshots(b.discoveryBefore);
    const after = await adaptAinuokeOrderDiscoverySnapshots(b.discoveryAfter);
    if (before.snapshotHash !== after.snapshotHash || discoveryContentHash(b.discoveryBefore) !== discoveryContentHash(b.discoveryAfter)) throw new SourceError("discovery_changed");
    if (!before.rows.length || before.rows.length > 1000) throw new SourceError("binding_scope_limit");
    const contracts = before.rows.map(r => normalizeAinuokeSalesContractNo(r.salesContractNo));
    if (new Set(contracts).size !== contracts.length || Object.keys(b.colors).length !== contracts.length
      || Object.keys(b.colors).some(k => !contracts.includes(k))) throw new SourceError("binding_scope_mismatch");
    // Existing historical mapper accepts blank Num as zero: reject unknown quantity here.
    for (const row of b.discoveryBefore.flatMap(p => p.rows)) {
      const value = row.values.Num;
      if (value === null || value === undefined || typeof value === "boolean" || String(value).trim() === "") throw new SourceError("binding_quantity_missing");
      for (const key of ["ContractDate", "DeliveryDate"]) {
        const value = row.values[key];
        if (value === null || value === undefined || value === "") continue;
        const date = String(value).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new SourceError("binding_date_invalid");
      }
    }
    const details = [];
    for (const row of before.rows) {
      const pages = b.colors[normalizeAinuokeSalesContractNo(row.salesContractNo)];
      pagesValid(pages, now, maxAgeMs);
      const source = await adaptAinuokeGarmentColorSizeSnapshots({snapshots: pages, requestedSalesContractNo: row.salesContractNo, discoveryInsideOrderNo: row.insideOrderNo, expectedStyleNo: row.styleNo});
      details.push({salesContractNo: row.salesContractNo, pages: pages.length, source});
    }
    const preview = await buildFinalSalesOrderBootstrapPreview({discoveryBefore: before, discoveryAfter: after, discoveryRawSnapshots: b.discoveryBefore, details});
    if (!preview.snapshot.stable || !preview.readyForDisposablePostgres) throw new SourceError("binding_incomplete");
    // Review digest includes all mapped facts, including customer/brand/color metadata.
    const reviewHash = hash(preview.candidates.map(c => ({...c, source: {...c.source, fetchedAt: undefined}})));
    return {preview, reviewHash};
  } catch (error) { throw error instanceof SourceError ? error : new SourceError("binding_invalid"); }
}
/** Explicit small first binding: full discovery, selected color details, separate review domain. */
function validatedSelection(selected: readonly string[]): string[] {
  if (!Array.isArray(selected) || selected.some(value => typeof value !== "string" || value.includes(",")))
    throw new SourceError("binding_selection_invalid");
  return selectContracts(selected.join(","));
}
export async function previewSelectedBindings(input: unknown, selected: readonly string[], now = Date.now(), maxAgeMs = 600000) {
  const selection = validatedSelection(selected);
  const result = await previewAdditions(input, selection, [], now, maxAgeMs);
  return {preview: {candidates: result.candidates}, visibleContracts: result.visibleContracts,
    selectedContracts: selection, colorCoverage: result.colorCoverage,
    reviewHash: hash({kind: "selected-first-binding.v1", selection, candidateReview: result.reviewHash})};
}
export async function bindOrders(pool: Pool, identity: Pick<TrustedIdentity,"internalUserId"|"userId">, options: {
  sourceKey: string; accountFingerprint: string; expectedPreview: string; collect: () => Promise<unknown>; now?: () => number; selected?: readonly string[];
}) {
  if (!sourceKeyValid(options.sourceKey) || !/^[a-f0-9]{64}$/u.test(options.accountFingerprint) || !/^[a-f0-9]{64}$/u.test(options.expectedPreview)) throw new SourceError("binding_confirmation_required");
  // Copy selection before any await; the caller cannot widen it while collecting.
  const selected = options.selected === undefined ? undefined : validatedSelection(options.selected);
  const review = (data: unknown) => selected === undefined
    ? previewBindings(data, (options.now ?? Date.now)())
    : previewSelectedBindings(data, selected, (options.now ?? Date.now)());
  const actor = await sourceActor(pool, identity, true); requirePermission(actor.permissions, "ainuoke.bind");
  const data=await options.collect();
  const {preview, reviewHash} = await review(data);
  if (reviewHash !== options.expectedPreview) throw new SourceError("binding_preview_changed");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    // Serializes all binding commands; same source lock also excludes snapshot capture.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ainuoke-first-binding',0))");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked", ["ainuoke-source:" + options.sourceKey]);
    if (!lock.rows[0].locked) throw new SourceError("source_capture_busy");
    if ((await review(data)).reviewHash !== reviewHash) throw new SourceError("binding_preview_changed");
    const currentActor = await sourceActor(client, identity, true); requirePermission(currentActor.permissions, "ainuoke.bind");
    const profiles = (await client.query("SELECT source_key,account_fingerprint,enabled FROM ainuoke_source_profiles FOR UPDATE")).rows;
    if (profiles.some(p => p.source_key !== options.sourceKey || p.account_fingerprint !== options.accountFingerprint || !p.enabled)) throw new SourceError("source_account_mismatch");
    const existing = (await client.query("SELECT o.id::text,l.external_id,l.sales_contract_no FROM sales_orders o LEFT JOIN sales_order_source_links l ON l.sales_order_id=o.id AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract' FOR SHARE OF o")).rows;
    const candidates = preview.candidates;
    // Empty first binding, or exact re-run only. Never silently attach a new source to old orders.
    if (existing.length && (existing.length !== candidates.length || existing.some(row => !candidates.some(c => c.source.sourceId === row.external_id && normalizeAinuokeSalesContractNo(c.source.salesContractNo) === normalizeAinuokeSalesContractNo(row.sales_contract_no))))) throw new SourceError("binding_requires_empty_or_exact_scope");
    if(existing.length){
      const receipt=(await client.query("SELECT metadata FROM operation_logs WHERE entity_type='AinuokeSourceBinding' AND entity_id=$1 ORDER BY id DESC LIMIT 1",[options.sourceKey])).rows[0];
      const bound=await boundOrders(client,true);
      if(!profiles.length || receipt?.metadata?.reviewHash!==reviewHash || bound.length!==existing.length || existing.some(row=>!bound.some(order=>order.id===row.id&&normalizeAinuokeSalesContractNo(order.salesContractNo)===normalizeAinuokeSalesContractNo(row.sales_contract_no))))throw new SourceError("binding_not_exact_retry");
      // The audit hash alone does not prove that persisted mirrors are still intact.
      await assertStoredAdditionMatches(client, candidates, existing.map(row => ({id: row.id,
        sourceId: row.external_id, salesContractNo: normalizeAinuokeSalesContractNo(row.sales_contract_no)})));
    }
    const ids: string[] = []; let created = 0;
    for (const candidate of candidates) {
      const result = await createAinuokeSalesOrderInTransaction(client, currentActor, candidate);
      ids.push(result.salesOrder.id); if (result.created) created++;
    }
    await client.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2) ON CONFLICT DO NOTHING", [options.sourceKey,options.accountFingerprint]);
    if (created) await appendOperationLog(client,currentActor,{module:"艾诺科同步",action:"首次绑定艾诺科订单",entityType:"AinuokeSourceBinding",entityId:options.sourceKey,metadata:{sourceKey:options.sourceKey,reviewHash,orderCount:created,scope:selected === undefined ? "current_account_visible" : "explicit_selected_first_binding",...(selected === undefined ? {} : {selectedContracts: preview.candidates.map(c => c.source.salesContractNo)})}});
    await client.query("COMMIT");
    return {created,replayed:created===0,orderIds:ids,reviewHash};
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error instanceof SourceError ? error : new SourceError("binding_failed");
  } finally { client.release(); }
}

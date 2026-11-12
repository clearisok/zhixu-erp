import {randomUUID} from 'node:crypto';
import {withSyncAudit,auditPublished,commitWithSyncAudit} from './sync-audit.js';
import {orderCommandControlError} from '../sales-orders/command-control.js';
import {lockEffectiveAttribution,resolveEffectiveOrder,supportsEffectiveAttribution} from '../sales-orders/effective-attribution.js';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { createAinuokeSalesOrderInTransaction } from '../sales-orders/service.js';
import { adaptAinuokeOrderDiscoverySnapshots } from '../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js';
import { adaptAinuokeGarmentColorSizeSnapshots, isAinuokeBlankColorPlaceholder, normalizeAinuokeSalesContractNo } from '../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js';
import { mapSelectedFinalSalesOrderCandidates } from '../../features/ainuoke-sync/service/sales-order-final-bootstrap-preview.js';
import type { AinuokeOrderDiscoveryQuery, AinuokeSalesContractQuery, AinuokeReportSnapshot } from '../../features/ainuoke-api/model/ainuoke-api.js';
import { SourceError, hash, sourceKeyValid, inspect, pagesValid, discoveryContentHash } from './contract.js';
import { boundOrders, sourceActor } from './service.js';

export type BoundIdentity = { id: string; sourceId: string; salesContractNo: string };
export type AdditionDiscoveryBundle = {
  schemaVersion: 'ainuoke-order-addition-discovery.v1';
  discoveryBefore: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  discoveryAfter: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
};
export type AdditionBundle = {
  schemaVersion: 'ainuoke-order-addition.v1';
  discoveryBefore: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  discoveryAfter: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  colors: Record<string, AinuokeReportSnapshot<AinuokeSalesContractQuery>[]>;
};

const normalized = (value: string) => normalizeAinuokeSalesContractNo(value);
const hex = (value: string) => /^[a-f0-9]{64}$/u.test(value);

/** A complete empty response, including the already approved blank placeholder,
 * is valid initial enrichment. Explicit zero or malformed colour facts are not
 * blank; callers must also prevent an empty result clearing accepted colours. */
export function hasCompleteEmptyColorEvidence(pages:readonly AinuokeReportSnapshot<AinuokeSalesContractQuery>[],contract:string):boolean {
  const first=pages[0];
  if(!first||!Number.isSafeInteger(first.total)||first.total<0||!Number.isSafeInteger(first.pageSize)||first.pageSize<1
    ||pages.length!==Math.max(1,Math.ceil(first.total/first.pageSize)))return false;
  return pages.every((page,index)=>page.reportId==='6087105'&&page.page===index+1&&page.pageSize===first.pageSize&&page.total===first.total
    &&normalized(page.queryContext.salesContractNo)===contract
    &&page.rows.length===Math.min(first.pageSize,Math.max(0,first.total-index*first.pageSize))
    &&page.rows.every(row=>normalized(String(row.values.BillNo??''))===contract&&isAinuokeBlankColorPlaceholder(row.values)));
}

export function selectContracts(value: string): string[] {
  const selected = value.split(',').map(normalized);
  if (!selected.length || selected.length > 25 || selected.some(x => !x || x.length > 80)
    || new Set(selected).size !== selected.length) throw new SourceError('addition_selection_invalid');
  return selected.sort();
}

export async function readBoundIdentities(client: Pool | PoolClient, lock = false): Promise<BoundIdentity[]> {
  const visible = await boundOrders(client, lock);
  const rows = (await client.query<{
    id: string; source_id: string; sales_contract_no: string;
    mirror_source_id: string | null; mirror_bill_no: string | null;
  }>(`SELECT l.sales_order_id::text AS id,l.external_id AS source_id,l.sales_contract_no,
    m.source_id AS mirror_source_id,m.sales_contract_no AS mirror_bill_no
    FROM sales_order_source_links l LEFT JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id
    WHERE l.source_system='ainuoke' AND l.source_entity_type='sales_contract'
    ORDER BY l.sales_order_id LIMIT 1001 ${lock ? 'FOR SHARE OF l' : ''}`)).rows;
  if (!rows.length || rows.length > 1000) throw new SourceError('addition_requires_first_binding');
  const keys = new Set<string>(); const ids = new Set<string>();
  for (const row of rows) {
    const key = normalized(row.sales_contract_no);
    if (!key || !row.source_id || row.source_id !== row.mirror_source_id
      || key !== normalized(row.mirror_bill_no ?? '') || keys.has(key) || ids.has(row.source_id))
      throw new SourceError('addition_bound_identity_invalid');
    keys.add(key); ids.add(row.source_id);
  }
  if (visible.length !== rows.length || rows.some(row => !visible.some(order => order.sourceOwnerOrderId === row.id)))
    throw new SourceError('addition_bound_identity_invalid');
  return rows.map(row => ({id: row.id, sourceId: row.source_id, salesContractNo: normalized(row.sales_contract_no)}));
}

export async function requireAdditionProfile(client: Pool | PoolClient, sourceKey: string, accountFingerprint: string, lock = false) {
  if (!sourceKeyValid(sourceKey) || !hex(accountFingerprint)) throw new SourceError('invalid_source_configuration');
  const profile = (await client.query<{account_fingerprint: string; enabled: boolean}>(
    `SELECT account_fingerprint,enabled FROM ainuoke_source_profiles WHERE source_key=$1 ${lock ? 'FOR UPDATE' : ''}`, [sourceKey])).rows[0];
  if (!profile || !profile.enabled || profile.account_fingerprint !== accountFingerprint) throw new SourceError('source_account_mismatch');
  const receipt = (await client.query(`SELECT 1 FROM operation_logs WHERE entity_type='AinuokeSourceBinding' AND entity_id=$1 LIMIT 1`,[sourceKey])).rows[0];
  if (!receipt) throw new SourceError('addition_requires_first_binding');
}

async function stableDiscovery(input: unknown, expectedSchema: string, now: number, maxAgeMs: number) {
  try {
    if (!Number.isFinite(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 || !input || typeof input !== 'object'
      || Buffer.byteLength(JSON.stringify(input)) > 32 * 1024 * 1024) throw new SourceError('addition_invalid');
    inspect(input);
    const bundle = structuredClone(input) as AdditionDiscoveryBundle | AdditionBundle;
    const keys = Object.keys(bundle).sort().join(',');
    if (bundle.schemaVersion !== expectedSchema || keys !== (expectedSchema === 'ainuoke-order-addition.v1'
      ? 'colors,discoveryAfter,discoveryBefore,schemaVersion' : 'discoveryAfter,discoveryBefore,schemaVersion'))
      throw new SourceError('addition_invalid');
    pagesValid(bundle.discoveryBefore, now, maxAgeMs); pagesValid(bundle.discoveryAfter, now, maxAgeMs);
    const before = await adaptAinuokeOrderDiscoverySnapshots(bundle.discoveryBefore);
    const after = await adaptAinuokeOrderDiscoverySnapshots(bundle.discoveryAfter);
    if (!before.rows.length || before.rows.length > 1000 || before.snapshotHash !== after.snapshotHash
      || discoveryContentHash(bundle.discoveryBefore) !== discoveryContentHash(bundle.discoveryAfter))
      throw new SourceError('discovery_changed');
    return {bundle, discovery: before};
  } catch (error) { throw error instanceof SourceError ? error : new SourceError('addition_invalid'); }
}

function reconcileBound(discovery: Awaited<ReturnType<typeof adaptAinuokeOrderDiscoverySnapshots>>, bound: BoundIdentity[]) {
  const byBill = new Map(discovery.rows.map(row => [normalized(row.salesContractNo), row]));
  const keys = new Set<string>(); const ids = new Set<string>();
  for (const item of bound) {
    const key = normalized(item.salesContractNo);
    if (!key || keys.has(key) || ids.has(item.sourceId)) throw new SourceError('addition_bound_identity_invalid');
    keys.add(key); ids.add(item.sourceId);
    const current = byBill.get(key);
    if (!current) throw new SourceError('source_visibility_changed');
    if (current.sourceId !== item.sourceId) throw new SourceError('source_identity_changed');
  }
  for (const row of discovery.rows) if (!keys.has(normalized(row.salesContractNo)) && ids.has(row.sourceId))
    throw new SourceError('source_identity_changed');
  return keys;
}

export async function discoverAdditions(input: unknown, bound: BoundIdentity[], now = Date.now(), maxAgeMs = 600000) {
  const {discovery} = await stableDiscovery(input, 'ainuoke-order-addition-discovery.v1', now, maxAgeMs);
  const boundKeys = reconcileBound(discovery, bound);
  const additions = discovery.rows.filter(row => !boundKeys.has(normalized(row.salesContractNo)))
    .map(row => ({salesContractNo: row.salesContractNo, sourceId: row.sourceId, styleNo: row.styleNo,
      lifecycleStatusRaw: row.lifecycleStatusRaw})).sort((a,b) => normalized(a.salesContractNo).localeCompare(normalized(b.salesContractNo)));
  return {discoveryHash: discovery.snapshotHash, visibleContracts: discovery.rows.length, boundContracts: bound.length,
    unboundContracts: additions.length, additions};
}

export async function previewAdditions(input: unknown, selected: readonly string[], bound: BoundIdentity[], now = Date.now(), maxAgeMs = 600000,options:{allowIncompleteHeader?:boolean}={}) {
  if (!selected.length || selected.length > 25 || new Set(selected.map(normalized)).size !== selected.length)
    throw new SourceError('addition_selection_invalid');
  const {bundle, discovery} = await stableDiscovery(input, 'ainuoke-order-addition.v1', now, maxAgeMs);
  if (!('colors' in bundle) || !bundle.colors || typeof bundle.colors !== 'object' || Array.isArray(bundle.colors))
    throw new SourceError('addition_invalid');
  const boundKeys = reconcileBound(discovery, bound);
  const selection = selected.map(normalized).sort();
  if (Object.keys(bundle.colors).sort().join('\0') !== selection.join('\0')) throw new SourceError('addition_color_scope_mismatch');
  const existing = selection.filter(key => boundKeys.has(key));
  if (existing.length && existing.length !== selection.length) throw new SourceError('addition_partial_retry');
  const byBill = new Map(discovery.rows.map(row => [normalized(row.salesContractNo), row]));
  const details = [];
  for (const key of selection) {
    const row = byBill.get(key);
    if (!row) throw new SourceError('addition_not_visible');
    const pages = bundle.colors[key]; pagesValid(pages, now, maxAgeMs);
    const source = await adaptAinuokeGarmentColorSizeSnapshots({snapshots: pages,
      requestedSalesContractNo: row.salesContractNo, discoveryInsideOrderNo: row.insideOrderNo,
      expectedStyleNo: row.styleNo});
    details.push({salesContractNo: row.salesContractNo, pages: pages.length, source});
  }
  // A blank Num or invalid calendar date must never become a believable order fact.
  const sourceRows = bundle.discoveryBefore.flatMap(page => page.rows);
  for (const key of selection) {
    const row = sourceRows.find(item => normalized(String(item.values.BillNo ?? '')) === key);
    if (!row || !options.allowIncompleteHeader && (row.values.Num === null || row.values.Num === undefined || typeof row.values.Num === 'boolean'
      || String(row.values.Num).trim() === '')) throw new SourceError('binding_quantity_missing');
    for (const field of ['ContractDate','DeliveryDate'] as const) {
      const value = row.values[field]; if (value === null || value === undefined || value === '') continue;
      const date = String(value).slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(Date.parse(date))
        || new Date(date).toISOString().slice(0,10) !== date) throw new SourceError('binding_date_invalid');
    }
  }
  let candidates: Awaited<ReturnType<typeof mapSelectedFinalSalesOrderCandidates>>;
  try { candidates = await mapSelectedFinalSalesOrderCandidates({discovery, discoveryRawSnapshots: bundle.discoveryBefore,
    details, selectedBillNos: selection}); }
  catch { throw new SourceError('addition_mapping_invalid'); }
  const baseBindings = bound.filter(item => !selection.includes(normalized(item.salesContractNo)))
    .map(item => ({sourceId: item.sourceId, salesContractNo: normalized(item.salesContractNo)}))
    .sort((a,b) => a.salesContractNo.localeCompare(b.salesContractNo));
  const reviewed = candidates.map(candidate => {
    const s = candidate.source;
    const source = {sourceId:s.sourceId,sourceRowIdentity:s.sourceRowIdentity,salesContractNo:s.salesContractNo,
      insideOrderNo:s.insideOrderNo,lifecycleStatusRaw:s.lifecycleStatusRaw,contractDate:s.contractDate,
      contractDeliveryDate:s.contractDeliveryDate,styleNo:s.styleNo,companyNameSnapshot:s.companyNameSnapshot,
      customerNameSnapshot:s.customerNameSnapshot,brandNameSnapshot:s.brandNameSnapshot,quantity:s.quantity,
      sourceHash:s.sourceHash};
    return {source, colors: candidate.colors.map(color => ({sourceLineIdentity: color.sourceLineIdentity,
      colorName: color.colorName, quantity: color.quantity, deliveryDate: color.deliveryDate, sourceHash: color.sourceHash})),
      colorDetailStatus: candidate.colorDetailStatus};
  });
  const reviewHash = hash({baseBindings, reviewed});
  return {candidates, reviewHash, alreadyBound: existing.length === selection.length, discoveryHash: discovery.snapshotHash,
    visibleContracts: discovery.rows.length, selectedContracts: selection.length,
    colorCoverage: candidates.map(candidate => ({salesContractNo: candidate.source.salesContractNo,
      colorDetailStatus: candidate.colorDetailStatus, colorLines: candidate.colors.length}))};
}

export async function assertStoredAdditionMatches(client: PoolClient, candidates: Awaited<ReturnType<typeof mapSelectedFinalSalesOrderCandidates>>,
  bound: BoundIdentity[]) {
  for (const candidate of candidates) {
    const identity = bound.find(item => item.sourceId === candidate.source.sourceId
      && item.salesContractNo === normalized(candidate.source.salesContractNo));
    if (!identity) throw new SourceError('addition_not_exact_retry');
    const mirror = (await client.query(`SELECT source_id,source_row_identity,sales_contract_no,inside_order_no,
      lifecycle_status_raw,contract_date::text,contract_delivery_date::text,style_no,company_name_snapshot,
      customer_name_snapshot,brand_name_snapshot,quantity::text,source_hash,
      source_metadata #>> '{colorDetail,status}' AS color_status,source_metadata->'colorDetail' AS color_detail
      FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1 FOR SHARE`,[identity.id])).rows[0];
    const source = candidate.source;
    if (!mirror || mirror.source_id !== source.sourceId || mirror.source_row_identity !== source.sourceRowIdentity
      || normalized(mirror.sales_contract_no) !== normalized(source.salesContractNo)
      || mirror.inside_order_no !== source.insideOrderNo || mirror.lifecycle_status_raw !== source.lifecycleStatusRaw
      || mirror.contract_date !== source.contractDate || mirror.contract_delivery_date !== source.contractDeliveryDate
      || mirror.style_no !== source.styleNo || mirror.company_name_snapshot !== source.companyNameSnapshot
      || mirror.customer_name_snapshot !== source.customerNameSnapshot || mirror.brand_name_snapshot !== source.brandNameSnapshot
      || (mirror.quantity===null?null:Number(mirror.quantity)) !== source.quantity || mirror.source_hash !== source.sourceHash
      || mirror.color_status !== candidate.colorDetailStatus
      || hash(mirror.color_detail) !== hash(source.sourceMetadata?.colorDetail)) throw new SourceError('addition_not_exact_retry');
    const colors = (await client.query(`SELECT source_line_identity,color_name,quantity::text,delivery_date::text,source_hash,source_metadata
      FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 ORDER BY source_line_identity FOR SHARE`,[identity.id])).rows;
    const expected = [...candidate.colors].sort((a,b)=>a.sourceLineIdentity.localeCompare(b.sourceLineIdentity));
    if (colors.length !== expected.length || colors.some((row,index) => row.source_line_identity !== expected[index].sourceLineIdentity
      || row.color_name !== expected[index].colorName || Number(row.quantity) !== expected[index].quantity
      || row.delivery_date !== expected[index].deliveryDate || row.source_hash !== expected[index].sourceHash
      || hash(row.source_metadata) !== hash(expected[index].sourceMetadata ?? {})))
      throw new SourceError('addition_not_exact_retry');
  }
}

async function addOrdersImplementation(pool: Pool, identity: Pick<TrustedIdentity,'internalUserId'|'userId'>, options: {
  sourceKey: string; accountFingerprint: string; selected: string[]; expectedPreview: string;
  collect: () => Promise<unknown>; now?: () => number;
  receipt?: {requestId:string;observationId:string};
}) {
  if (!sourceKeyValid(options.sourceKey) || !hex(options.accountFingerprint) || !hex(options.expectedPreview))
    throw new SourceError('addition_confirmation_required');
  const actor = await sourceActor(pool, identity, true); requirePermission(actor.permissions, 'ainuoke.bind');
  const receiptHash=options.receipt?hash({sourceKey:options.sourceKey,accountFingerprint:options.accountFingerprint,selected:options.selected,expectedPreview:options.expectedPreview,receipt:options.receipt}):null;
  if(options.receipt){
    const prior=(await pool.query('SELECT payload_hash,result FROM ainuoke_catalog_intake_receipts WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,options.receipt.requestId])).rows[0];
    if(prior){if(prior.payload_hash!==receiptHash)throw new SourceError('catalog_intake_request_conflict');return {...prior.result,replayed:true};}
  }
  await requireAdditionProfile(pool, options.sourceKey, options.accountFingerprint);
  const before = await readBoundIdentities(pool);
  const data = await options.collect();
  const reviewed = await previewAdditions(data, options.selected, before, (options.now ?? Date.now)());
  if (reviewed.reviewHash !== options.expectedPreview) throw new SourceError('addition_preview_changed');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    if(options.receipt){
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['catalog-intake:'+actor.internalUserId+':'+options.receipt.requestId]);
      const prior=(await client.query('SELECT payload_hash,result FROM ainuoke_catalog_intake_receipts WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,options.receipt.requestId])).rows[0];
      if(prior){if(prior.payload_hash!==receiptHash)throw new SourceError('catalog_intake_request_conflict');await commitWithSyncAudit(client);return {...prior.result,replayed:true};}
    }
    await lockEffectiveAttribution(client);
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ainuoke-first-binding',0))");
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked', ['ainuoke-source:' + options.sourceKey]);
    if (!lock.rows[0].locked) throw new SourceError('source_capture_busy');
    const currentActor = await sourceActor(client, identity, true); requirePermission(currentActor.permissions, 'ainuoke.bind');
    await requireAdditionProfile(client, options.sourceKey, options.accountFingerprint, true);
    const currentBound = await readBoundIdentities(client, true);
    const current = await previewAdditions(data, options.selected, currentBound, (options.now ?? Date.now)());
    if (current.reviewHash !== options.expectedPreview || currentBound.length + (current.alreadyBound ? 0 : current.candidates.length) > 1000)
      throw new SourceError('addition_preview_changed');
    if (current.alreadyBound) {
      const receipt = (await client.query(`SELECT 1 FROM operation_logs WHERE entity_type='AinuokeSourceAddition'
        AND entity_id=$1 AND metadata->>'reviewHash'=$2 LIMIT 1`,[options.sourceKey,current.reviewHash])).rows[0];
      if (!receipt) throw new SourceError('addition_not_exact_retry');
      await assertStoredAdditionMatches(client,current.candidates,currentBound);
      await commitWithSyncAudit(client);
      return {created: 0, replayed: true, orderIds: await Promise.all(current.candidates.map(async c => {const original=currentBound.find(b => b.sourceId===c.source.sourceId&&b.salesContractNo===normalized(c.source.salesContractNo))!.id;return await supportsEffectiveAttribution(client)?(await resolveEffectiveOrder(client,original)).effectiveOrderId:original;})), reviewHash: current.reviewHash};
    }
    const ids: string[] = [];
    for (const candidate of current.candidates) {
      const result = await createAinuokeSalesOrderInTransaction(client, currentActor, candidate);
      if (!result.created) throw new SourceError('addition_existing_identity');
      ids.push(result.salesOrder.id);
    }
    await appendOperationLog(client,currentActor,{module:'艾诺科同步',action:'受控接纳新增合同',entityType:'AinuokeSourceAddition',
      entityId:options.sourceKey,metadata:{sourceKey:options.sourceKey,reviewHash:current.reviewHash,
        orderCount:ids.length,scope:'current_account_visible',salesContractNos:current.candidates.map(c=>c.source.salesContractNo)}});
    if(options.receipt)await client.query('INSERT INTO ainuoke_catalog_intake_receipts(actor_id,request_id,payload_hash,result) VALUES($1,$2,$3,$4::jsonb)',
      [actor.internalUserId,options.receipt.requestId,receiptHash,JSON.stringify({created:ids.length,replayed:false,orderIds:ids,reviewHash:current.reviewHash})]);
    await auditPublished(client,options.sourceKey,randomUUID(),data,'',['sales_orders','sales_order_source_links','ainuoke_sales_order_contract_mirrors','ainuoke_sales_order_color_mirrors']);
    await commitWithSyncAudit(client);
    return {created: ids.length, replayed: false, orderIds: ids, reviewHash: current.reviewHash};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    const control=orderCommandControlError(error) as {code?:string};
    throw error instanceof SourceError ? error : new SourceError(['order_commands_frozen','order_command_control_unavailable'].includes(control?.code??'')?control.code!:'addition_failed');
  } finally { client.release(); }
}

export async function addOrders(...args:Parameters<typeof addOrdersImplementation>){return withSyncAudit(args[0],{sourceKey:args[2].sourceKey,type:'manual'},()=>addOrdersImplementation(...args));}

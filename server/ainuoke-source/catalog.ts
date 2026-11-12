import {withSyncAudit,auditPublished,commitWithSyncAudit,pinSyncCall} from './sync-audit.js';
import {effectiveSyncDeliverySql} from './sync-dates.js';
import { DEFAULT_SYNC_POLICY, syncSchedule, syncScheduleLabel } from './sync-schedule.js';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { adaptAinuokeOrderDiscoverySnapshots } from '../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js';
import { sourceActor } from './service.js';
import { requireAdditionProfile, type AdditionDiscoveryBundle } from './additions.js';
import { SourceError, inspect, pagesValid, discoveryContentHash, hash } from './contract.js';
import { saveCatalogEvidence } from './catalog-evidence.js';
import {mapDirectorySalesOrderCandidate} from '../../features/ainuoke-sync/service/sales-order-final-bootstrap-preview.js';
import {createAinuokeSalesOrderInTransaction} from '../sales-orders/service.js';
import {lockEffectiveAttribution} from '../sales-orders/effective-attribution.js';
import {HttpError} from '../http/errors.js';
import {CatalogConsistencyError,catalogChangeEvidence,mutableCatalogFields} from './catalog-consistency.js';

const text = (v:unknown) => typeof v==='string' && v.trim() ? v.normalize('NFKC').trim() : null;
const date = (v:unknown) => {
 const s=text(v)?.slice(0,10);
 return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s ? s : null;
};
const quantity = (v:unknown) => {
 if(v===null||v===undefined||typeof v==='boolean'||String(v).trim()==='')return null;
 const n=Number(v); return Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER?n:null;
};
// D180's approved narrow exception: a changed directory is still rejected, never
// published. Only these business fields may qualify for a new bounded capture.
function onlyCatalogBusinessChanged(b:AdditionDiscoveryBundle):boolean {
 if(b.discoveryBefore.length!==b.discoveryAfter.length)return false;
 for(const [i,page] of b.discoveryBefore.entries()){
  const metadata=({rows:ignoredRows,fetchedAt:ignoredTime,snapshotHash:ignoredContent,...rest}:typeof page)=>{void ignoredRows;void ignoredTime;void ignoredContent;return rest;};
  if(hash(metadata(page))!==hash(metadata(b.discoveryAfter[i])))return false;
 }
 const before=b.discoveryBefore.flatMap(p=>p.rows),after=b.discoveryAfter.flatMap(p=>p.rows);
 if(before.length!==after.length)return false;
 const byId=new Map(after.map(r=>[String(r.values.id).trim(),r]));let changed=false;
 for(const row of before){
  const next=byId.get(String(row.values.id).trim());
  if(!next||[row,next].some(r=>Object.keys(r).sort().join(',')!=='sourceRowIdentity,values'))return false;
  const fixed=(values:typeof row.values)=>Object.fromEntries(Object.entries(values).filter(([key])=>!mutableCatalogFields.has(key)));
  // Includes exact id/BillNo/InsideOrderNo and every unknown field. The SDK row
  // fingerprint hashes the whole row and is not the stable contract identity.
  if(hash(fixed(row.values))!==hash(fixed(next.values)))return false;
  if(hash(row.values)!==hash(next.values))changed=true;
  else if(row.sourceRowIdentity!==next.sourceRowIdentity)return false;
 }
 return changed;
}
export async function previewCatalog(input:unknown,now=Date.now()) {
 inspect(input);
 if(!input||typeof input!=='object'||Buffer.byteLength(JSON.stringify(input))>32*1024*1024)throw new SourceError('catalog_invalid');
 const b=structuredClone(input) as AdditionDiscoveryBundle;
 if(b.schemaVersion!=='ainuoke-order-addition-discovery.v1'||Object.keys(b).sort().join(',')!=='discoveryAfter,discoveryBefore,schemaVersion')throw new SourceError('catalog_invalid');
 pagesValid(b.discoveryBefore,now,600000);pagesValid(b.discoveryAfter,now,600000);
 const before=await adaptAinuokeOrderDiscoverySnapshots(b.discoveryBefore),after=await adaptAinuokeOrderDiscoverySnapshots(b.discoveryAfter);
 if(before.total>1400||after.total>1400)throw new SourceError('catalog_row_limit_exceeded');
 if(before.snapshotHash!==after.snapshotHash||discoveryContentHash(b.discoveryBefore)!==discoveryContentHash(b.discoveryAfter)){
  const change=catalogChangeEvidence(b);
  throw new CatalogConsistencyError(change.additionsOnly?'catalog_additions_observed':onlyCatalogBusinessChanged(b)?'catalog_business_content_changed':change.nonIdentityOnly?'catalog_non_identity_content_changed':'catalog_identity_or_scope_changed',change.diagnostic);
 }
 const raw=new Map(b.discoveryAfter.flatMap(p=>p.rows).map(r=>[String(r.values.id).trim(),r.values]));
 const rows=after.rows.map(r=>{const v=raw.get(r.sourceId)!;return {...r,contractDate:date(r.contractDate),deliveryDate:date(r.deliveryDate),
  customerName:text(v.CustomerName),brandName:text(v.Brand),quantity:quantity(v.Num)};});
 return {rows,bundle:b,contentHash:discoveryContentHash(b.discoveryAfter),capturedAt:after.fetchedAt};
}

/** A complete two-pass directory updates only its Source mirror, never business facts. */
async function publishCatalogImplementation(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,options:{
 sourceKey:string;accountFingerprint:string;requestId:string;input:unknown;expectedHash:string;adoptNewOrders?:boolean;
 historicalEvidence?:{capturedAt:string;bundleHash:string};
}) {
 if(!/^[0-9a-f-]{36}$/i.test(options.requestId))throw new SourceError('catalog_request_invalid');
 const historical=options.historicalEvidence;
 const validationAt=historical?Date.parse(historical.capturedAt):Date.now();
 if(historical&&(!Number.isFinite(validationAt)||validationAt>Date.now()||hash(options.input)!==historical.bundleHash))throw new SourceError('historical_material_evidence_invalid');
 const checked=await previewCatalog(options.input,validationAt);
 if(checked.contentHash!==options.expectedHash)throw new SourceError('catalog_preview_changed');
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  if(options.adoptNewOrders)await lockEffectiveAttribution(c);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['ainuoke-source:'+options.sourceKey]);
  const actor=await sourceActor(c,identity,true);requirePermission(actor.permissions,'ainuoke.bind');
  await requireAdditionProfile(c,options.sourceKey,options.accountFingerprint,true);
  const old=(await c.query('SELECT id,content_hash FROM ainuoke_catalog_runs WHERE source_key=$1 AND request_id=$2',[options.sourceKey,options.requestId])).rows[0];
  if(old){if(old.content_hash!==checked.contentHash)throw new SourceError('catalog_request_conflict');await auditPublished(c,options.sourceKey,old.id,checked.bundle,'',undefined,true);await commitWithSyncAudit(c);return {runId:old.id,replayed:true,contracts:checked.rows.length};}
  const saved=(await c.query('SELECT source_id,sales_contract_no FROM ainuoke_catalog_entries WHERE source_key=$1',[options.sourceKey])).rows;
  for(const r of checked.rows)if(saved.some(s=>(s.source_id===r.sourceId)!==(s.sales_contract_no===r.salesContractNo)))throw new SourceError('catalog_identity_changed');
  const links=(await c.query("SELECT external_id,sales_contract_no FROM sales_order_source_links WHERE source_system='ainuoke' AND source_entity_type='sales_contract'")).rows;
  for(const r of checked.rows)if(links.some(s=>(s.external_id===r.sourceId)!==(s.sales_contract_no===r.salesContractNo)))throw new SourceError('catalog_identity_changed');
  const id=randomUUID();
  const captureId=await saveCatalogEvidence(c,options.sourceKey,options.accountFingerprint,checked.bundle);
  await c.query("INSERT INTO ainuoke_catalog_runs(id,source_key,account_fingerprint,request_id,actor_user_id,captured_at,discovery,content_hash,capture_evidence_id) VALUES($1,$2,$3,$4,$5,$6,'[]'::jsonb,$7,$8)",
   [id,options.sourceKey,options.accountFingerprint,options.requestId,actor.internalUserId,checked.capturedAt,checked.contentHash,captureId]);
  await c.query('UPDATE ainuoke_catalog_entries SET visible=false WHERE source_key=$1',[options.sourceKey]);
  for(const r of checked.rows)await c.query(`INSERT INTO ainuoke_catalog_entries(source_key,source_id,sales_contract_no,inside_order_no,style_no,customer_name,brand_name,quantity,contract_date,delivery_date,lifecycle_status_raw,observed_run_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(source_key,source_id) DO UPDATE SET
   inside_order_no=excluded.inside_order_no,style_no=excluded.style_no,customer_name=excluded.customer_name,brand_name=excluded.brand_name,
   quantity=excluded.quantity,contract_date=excluded.contract_date,delivery_date=excluded.delivery_date,lifecycle_status_raw=excluded.lifecycle_status_raw,observed_run_id=excluded.observed_run_id,visible=true`,
   [options.sourceKey,r.sourceId,r.salesContractNo,r.insideOrderNo,r.styleNo,r.customerName,r.brandName,r.quantity,r.contractDate,r.deliveryDate,r.lifecycleStatusRaw,id]);
  await c.query('UPDATE ainuoke_source_profiles SET catalog_run_id=$2 WHERE source_key=$1',[options.sourceKey,id]);
  let createdOrders=0,pendingOrders=0;
  if(options.adoptNewOrders){
   for(const row of checked.rows){
    if(links.some(link=>link.external_id===row.sourceId&&link.sales_contract_no===row.salesContractNo))continue;
    await c.query('SAVEPOINT catalog_order_intake');
    try{
     const candidate=await mapDirectorySalesOrderCandidate(row,checked.bundle.discoveryAfter);
     const result=await createAinuokeSalesOrderInTransaction(c,actor,candidate);
     await c.query('RELEASE SAVEPOINT catalog_order_intake');
     if(result.created)createdOrders++;
    }catch(error){
     // Identity conflicts are unsafe for the whole source, never soft failures.
     if(error instanceof HttpError&&['source_contract_identity_conflict','source_binding_conflict'].includes(error.code))throw error;
     await c.query('ROLLBACK TO SAVEPOINT catalog_order_intake');
     await c.query('RELEASE SAVEPOINT catalog_order_intake');
     pendingOrders++;
     await appendOperationLog(c,actor,{module:'艾诺科同步',action:'更新合同目录',entityType:'AinuokeCatalogRun',entityId:id,
      afterData:{objectName:row.salesContractNo,values:{result:'待建档'}},metadata:{code:'catalog_order_intake_failed',requestId:options.requestId}});
    }
    // Both initial creation and a failed intake use the same durable per-order
    // worker. A single business failure cannot discard other new contracts.
    await c.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by)
     VALUES($1,$2,$3,$4,'automatic','queued',$5) ON CONFLICT DO NOTHING`,[randomUUID(),options.sourceKey,row.sourceId,row.salesContractNo,actor.internalUserId]);
    await c.query("UPDATE ainuoke_sync_jobs SET kind='automatic' WHERE source_key=$1 AND source_id=$2 AND status='queued' AND requested_by=$3",[options.sourceKey,row.sourceId,actor.internalUserId]);
   }
  }
  await appendOperationLog(c,actor,{module:'艾诺科同步',action:'更新合同目录',entityType:'AinuokeCatalogRun',entityId:id,metadata:{sourceOnly:true,contractCount:checked.rows.length,requestId:options.requestId,
   ...(historical?{historicalPublication:true,sourceRequests:0,originalCapturedAt:historical.capturedAt}:{})}});
  await auditPublished(c,options.sourceKey,id,checked.bundle);
  await commitWithSyncAudit(c);return {runId:id,replayed:false,contracts:checked.rows.length,createdOrders,pendingOrders};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

export async function readCatalog(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,query:{search:string;scope:'all'|'active'|'history';offset:number;limit:number}) {
 const c=await pool.connect();
 try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await sourceActor(c,identity,false,false);
  const args:unknown[]=[],where=['p.enabled=true'];
  const val=(v:unknown)=>{args.push(v);return '$'+args.length;};
  const active="(mapping.effective_order_id IS NOT NULL AND coalesce(f.mode,'active')='active')";
  if(query.scope!=='all')where.push(query.scope==='active'?active:'NOT '+active);
  const words=query.search.normalize('NFKC').trim().split(/\s+/u).filter(Boolean);
  if(words.length>12||query.search.length>200||!Number.isSafeInteger(query.offset)||query.offset<0||!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>100)throw new SourceError('catalog_query_invalid');
  for(const word of words)where.push(`strpos(lower(concat_ws(' ',e.sales_contract_no,e.inside_order_no,e.style_no,e.customer_name,e.brand_name)),lower(${val(word)}))>0`);
  const from=`FROM ainuoke_catalog_entries e JOIN ainuoke_source_profiles p ON p.source_key=e.source_key
   JOIN ainuoke_catalog_runs r ON r.id=e.observed_run_id
   LEFT JOIN sales_order_source_links l ON l.source_system='ainuoke' AND l.source_entity_type='sales_contract' AND l.external_id=e.source_id AND l.sales_contract_no=e.sales_contract_no
   LEFT JOIN sales_order_effective_identities mapping ON mapping.original_order_id=l.sales_order_id
   LEFT JOIN ainuoke_order_followups f ON f.sales_order_id=mapping.effective_order_id
   LEFT JOIN ainuoke_sync_controls control ON control.source_key=e.source_key
   LEFT JOIN ainuoke_contract_sync_state state ON state.source_key=e.source_key AND state.source_id=e.source_id
   LEFT JOIN LATERAL(SELECT status,available_at,retry_of,attempt_number FROM ainuoke_sync_jobs j WHERE j.source_key=e.source_key AND j.source_id=e.source_id ORDER BY j.requested_at DESC,j.attempt_number DESC LIMIT 1) job ON true WHERE ${where.join(' AND ')}`;
  const total=Number((await c.query('SELECT count(*) '+from,args)).rows[0].count);
  const rows=(await c.query(`SELECT e.source_key AS "sourceKey",e.source_id AS "sourceId",e.sales_contract_no AS "salesContractNo",e.inside_order_no AS "insideOrderNo",
   e.style_no AS "styleNo",e.customer_name AS "customerName",e.brand_name AS "brandName",e.quantity::text,e.delivery_date AS "deliveryDate",e.contract_date AS "contractDate",${effectiveSyncDeliverySql()} AS "scheduleDeliveryDate",
   e.lifecycle_status_raw AS "sourceStatus",e.visible,r.captured_at AS "observedAt",mapping.effective_order_id::text AS "orderId",state.last_success_at AS "lastSuccessAt",state.last_automatic_attempt_at AS "lastAutomaticAttemptAt",
   state.last_error_code AS "lastErrorCode",state.last_diagnostic AS "lastDiagnostic",state.last_attempt_at AS "lastAttemptAt",control.policy,coalesce(control.enabled,false) AND control.paused_reason IS NULL AS "syncEnabled",job.status AS "syncStatus",
   CASE WHEN job.status='queued' AND job.retry_of IS NOT NULL THEN job.available_at ELSE NULL END AS "retryAt",job.attempt_number AS "attemptNumber",
   ${active} AS active,coalesce(f.version,0) AS "followupVersion" ${from} ORDER BY e.sales_contract_no,e.source_key LIMIT ${val(query.limit)} OFFSET ${val(query.offset)}`,args)).rows;
  const state=(await c.query('SELECT source_key AS "sourceKey",catalog_run_id::text AS "runId" FROM ainuoke_source_profiles WHERE enabled=true')).rows;
  const projected=rows.map(({policy,lastAutomaticAttemptAt,scheduleDeliveryDate,...row})=>{
    const schedule=syncSchedule({deliveryDate:scheduleDeliveryDate,contractDate:row.contractDate,now:Date.now(),lastSuccessAt:row.lastSuccessAt?new Date(row.lastSuccessAt).toISOString():null,
      lastAutomaticAttemptAt:lastAutomaticAttemptAt?new Date(lastAutomaticAttemptAt).toISOString():null},policy??DEFAULT_SYNC_POLICY);
    return {...row,...schedule,scheduleLabel:syncScheduleLabel(schedule.tier,policy??DEFAULT_SYNC_POLICY)};
  });
  const syncSummary=(await c.query(`SELECT count(*)::int AS contracts,count(s.last_success_at)::int AS observed,
   count(*) FILTER(WHERE s.last_success_at IS NULL)::int AS "neverObserved",
   count(*) FILTER(WHERE j.status IN ('queued','running','unknown'))::int AS pending,
   count(*) FILTER(WHERE j.status='queued' AND j.retry_of IS NOT NULL)::int AS retrying,
   count(*) FILTER(WHERE j.status IN ('failed','unknown'))::int AS failed,
   min(j.requested_at) FILTER(WHERE j.status='queued') AS "oldestPendingAt"
   FROM ainuoke_catalog_entries e JOIN ainuoke_source_profiles p ON p.source_key=e.source_key AND p.enabled=true
   LEFT JOIN ainuoke_contract_sync_state s ON s.source_key=e.source_key AND s.source_id=e.source_id
   LEFT JOIN LATERAL(SELECT status,retry_of,requested_at FROM ainuoke_sync_jobs j WHERE j.source_key=e.source_key AND j.source_id=e.source_id ORDER BY j.requested_at DESC,j.attempt_number DESC LIMIT 1) j ON true
   WHERE e.visible=true`)).rows[0];
  await c.query('COMMIT');return {rows:projected,total,offset:query.offset,limit:query.limit,sources:state,syncSummary};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

export async function publishCatalog(...args:Parameters<typeof publishCatalogImplementation>){const pinned=pinSyncCall(args);return withSyncAudit(pinned[0],{sourceKey:pinned[2].sourceKey,type:'historical',historical:true,reports:['6086103']},()=>publishCatalogImplementation(...pinned));}

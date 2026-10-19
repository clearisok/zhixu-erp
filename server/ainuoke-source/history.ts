import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {HttpError} from '../http/errors.js';
import type {SourceReadConfig} from './reader.js';
import {sourceActor,supportsSourceAttribution,supportsMaterialCaptureContext} from './service.js';
import {hash,inspect,sourceKeyValid} from './contract.js';
import {resolveEffectiveOrder} from '../sales-orders/effective-attribution.js';
import {adaptAinuokeOrderDiscoverySnapshots} from '../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js';
import type {AinuokeOrderDiscoveryQuery,AinuokeReportSnapshot} from '../../features/ainuoke-api/model/ainuoke-api.js';
import {normalizeAinuokeInsideOrderNo,normalizeAinuokeSalesContractNo} from '../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js';
import {projectMaterialProgress,type MaterialProgressView} from '../../features/ainuoke-material-progress/projection.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxBytes=32*1024*1024;
function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
export type MaterialHistoryQuery={limit:number;cursor:string|null};
export function parseMaterialHistoryQuery(query:URLSearchParams):MaterialHistoryQuery{
 for(const key of query.keys())if(!['limit','cursor'].includes(key)||query.getAll(key).length!==1)fail(400,'invalid_material_history_query');
 const value=query.get('limit')??'20';if(!/^[1-9][0-9]?$/.test(value)||Number(value)>50)fail(400,'invalid_material_history_query');
 const cursor=query.get('cursor');if(cursor!==null&&!uuid.test(cursor))fail(400,'invalid_material_history_query');return {limit:Number(value),cursor:cursor?.toLowerCase()??null};
}
export type MaterialHistoryRecord={runId:string;capturedAt:string;recordedAt:string;capturedTargetOrderId:string;salesContractNo:string;capturedAttributionChangeId:string|null;capturedOrderVersion:number|null;capturedSourceOwnerOrderId:string|null;identityEvidence:'recorded_context'|'legacy_context_unavailable'};
export type MaterialHistoryPage={schemaVersion:'order-material-history-list.v1';originalOrderId:string;originalOrderNo:string;currentEffectiveOrderId:string;items:MaterialHistoryRecord[];nextCursor:string|null;hasMore:boolean};
export type HistoricalMaterialProgress=Omit<MaterialProgressView,'sourceStatus'|'schemaVersion'> & {schemaVersion:'order-material-history-progress.v1';sourceStatus:'historical'};
export type MaterialHistoryDetail={schemaVersion:'order-material-history.v1';usage:'historical_only';currentStatusApplicable:false;originalOrderId:string;originalOrderNo:string;currentEffectiveOrderId:string;record:MaterialHistoryRecord;projectionBasis:'current-parser-on-captured-source';progress:HistoricalMaterialProgress};
export type MaterialHistoryReader={list:(identity:TrustedIdentity,id:string,query:MaterialHistoryQuery)=>Promise<MaterialHistoryPage>;read:(identity:TrustedIdentity,id:string,runId:string)=>Promise<MaterialHistoryDetail>};

type StoredMeta={run_id:string;captured_at:Date;created_at:Date;sales_order_id:string;sales_contract_no:string;attribution_change_id:string|null;captured_order_version:number|null;source_link_id:string|null;source_owner_order_id:string|null;source_external_id:string|null;link_contract_no:string|null;bytes:number};
const record=(row:StoredMeta):MaterialHistoryRecord=>({runId:row.run_id,capturedAt:row.captured_at.toISOString(),recordedAt:row.created_at.toISOString(),capturedTargetOrderId:row.sales_order_id,salesContractNo:row.sales_contract_no,capturedAttributionChangeId:row.attribution_change_id,capturedOrderVersion:row.captured_order_version,capturedSourceOwnerOrderId:row.source_owner_order_id,identityEvidence:row.source_link_id&&row.captured_order_version!==null?'recorded_context':'legacy_context_unavailable'});

/** Exact original captured target only. No current-root redirect, aggregation,
 * network, credentials, cache, CCT query or business mutation. */
export function createPersistedMaterialHistoryReader(pool:Pool,config:SourceReadConfig,now:()=>number=Date.now):MaterialHistoryReader{
 if(!sourceKeyValid(config.sourceKey))throw new Error('invalid_source_read_configuration');
 const scope=async<T>(identity:TrustedIdentity,id:string,run:(client:PoolClient,context:{orderNo:string;effectiveId:string;attributed:boolean;recorded:boolean})=>Promise<T>)=>{
  if(!uuid.test(id))fail(400,'invalid_order_request');id=id.toLowerCase();const client=await pool.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await sourceActor(client,identity,false,false);
   const order=(await client.query('SELECT order_no FROM sales_orders WHERE id=$1',[id])).rows[0];if(!order)fail(404,'order_not_available');
   const profile=(await client.query('SELECT enabled FROM ainuoke_source_profiles WHERE source_key=$1',[config.sourceKey])).rows[0];if(!profile?.enabled)fail(503,'material_history_not_connected');
   const attributed=await supportsSourceAttribution(client),recorded=await supportsMaterialCaptureContext(client),mapping=await resolveEffectiveOrder(client,id);
   const result=await run(client,{orderNo:order.order_no,effectiveId:mapping.effectiveOrderId,attributed,recorded});await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);if(error instanceof HttpError)throw error;fail(503,'material_history_unavailable');}finally{client.release();}
 };
 const sql=(context:{attributed:boolean;recorded:boolean})=>`SELECT r.id::text AS run_id,r.captured_at,r.created_at,s.sales_order_id::text,s.sales_contract_no,
  ${context.attributed?'s.attribution_change_id::text':'NULL::text'} AS attribution_change_id,
  ${context.recorded?'s.captured_order_version':'NULL::integer'} AS captured_order_version,
  ${context.recorded?'s.source_link_id::text':'NULL::text'} AS source_link_id,
  ${context.recorded?'l.sales_order_id::text':'NULL::text'} AS source_owner_order_id,
  ${context.recorded?'l.external_id':'NULL::text'} AS source_external_id,
  ${context.recorded?'l.sales_contract_no':'NULL::text'} AS link_contract_no,
  (octet_length(r.discovery::text)::bigint+octet_length(s.snapshots::text)::bigint${context.recorded?'+COALESCE(octet_length(r.order_scope::text),0)':''})::integer AS bytes
  FROM ainuoke_source_runs r JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id
  ${context.recorded?'LEFT JOIN sales_order_source_links l ON l.id=s.source_link_id':''}
  WHERE r.source_key=$1 AND s.sales_order_id=$2::uuid`;
 return {
  list:async(identity,id,query)=>scope(identity,id,async(client,context)=>{
   if(!Number.isInteger(query.limit)||query.limit<1||query.limit>50||query.cursor!==null&&!uuid.test(query.cursor))fail(400,'invalid_material_history_query');
   let boundary='';const values:unknown[]=[config.sourceKey,id.toLowerCase()];
   if(query.cursor){const cursor=(await client.query<{created_at:Date}>('SELECT r.created_at FROM ainuoke_source_runs r JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id WHERE r.source_key=$1 AND s.sales_order_id=$2 AND r.id=$3',[...values,query.cursor])).rows[0];if(!cursor)fail(400,'invalid_material_history_cursor');values.push(query.cursor);boundary=' AND (r.created_at,r.id)<(SELECT created_at,id FROM ainuoke_source_runs WHERE id=$3::uuid)';}
   values.push(query.limit+1);const rows=(await client.query<StoredMeta>(sql(context)+boundary+` ORDER BY r.created_at DESC,r.id DESC LIMIT $${values.length}`,values)).rows;
   const visible=rows.slice(0,query.limit);return {schemaVersion:'order-material-history-list.v1',originalOrderId:id.toLowerCase(),originalOrderNo:context.orderNo,currentEffectiveOrderId:context.effectiveId,items:visible.map(record),hasMore:rows.length>query.limit,nextCursor:rows.length>query.limit?visible.at(-1)!.run_id:null};
  }),
  read:async(identity,id,runId)=>{
   if(!uuid.test(runId))fail(400,'invalid_material_history_request');
   return scope(identity,id,async(client,context)=>{
    const metadata=(await client.query<StoredMeta>(sql(context)+' AND r.id=$3::uuid',[config.sourceKey,id.toLowerCase(),runId])).rows[0];if(!metadata)fail(404,'material_history_not_found');if(metadata.bytes>maxBytes)fail(413,'material_history_limit');
    const payload=(await client.query<{discovery:AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];snapshots:AinuokeReportSnapshot[];discovery_hash:string;content_hash:string;order_scope:unknown[]|null;order_scope_hash:string|null}>(`SELECT r.discovery,r.discovery_hash,s.snapshots,s.content_hash,${context.recorded?'r.order_scope':'NULL::jsonb'} AS order_scope,${context.attributed?'r.order_scope_hash':'NULL::text'} AS order_scope_hash FROM ainuoke_source_runs r JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id WHERE r.id=$1 AND s.sales_order_id=$2`,[runId,id.toLowerCase()])).rows[0];
    if(hash(payload.discovery)!==payload.discovery_hash||hash(payload.snapshots)!==payload.content_hash)fail(503,'material_history_integrity_failed');
    inspect(payload.discovery);inspect(payload.snapshots);
    const captured=metadata.captured_at.getTime(),clock=now();if(!Number.isFinite(clock)||captured>clock||!payload.discovery.length||!payload.snapshots.length)fail(503,'material_history_integrity_failed');
    const pages=[...payload.discovery,...payload.snapshots];if(pages.length>400||pages.some(page=>!Number.isSafeInteger(page.total)||page.total<0||!Number.isSafeInteger(page.pageSize)||page.pageSize<1||!Number.isFinite(Date.parse(page.fetchedAt))||Date.parse(page.fetchedAt)>captured)||pages.reduce((count,page)=>count+page.rows.length,0)>100000)fail(503,'material_history_integrity_failed');
    const discovery=await adaptAinuokeOrderDiscoverySnapshots(payload.discovery);const contract=normalizeAinuokeSalesContractNo(metadata.sales_contract_no),capturedOrder=discovery.rows.find(row=>row.salesContractNo===contract);if(!capturedOrder)fail(503,'material_history_integrity_failed');
    if(payload.snapshots.some(page=>page.reportId!=='6087050'||Object.keys(page.queryContext).length!==1||normalizeAinuokeInsideOrderNo(page.queryContext.insideOrderNo)!==capturedOrder.insideOrderNo))fail(503,'material_history_integrity_failed');
    if(metadata.source_link_id!==null){
     if(!payload.order_scope||hash(payload.order_scope)!==payload.order_scope_hash)fail(503,'material_history_integrity_failed');
     const target=payload.order_scope.find(value=>typeof value==='object'&&value!==null&&(value as {id?:string}).id===id.toLowerCase()) as Record<string,unknown>|undefined;
     if(!target||target.sourceLinkId!==metadata.source_link_id||target.sourceOwnerOrderId!==metadata.source_owner_order_id||target.version!==metadata.captured_order_version||target.attributionChangeId!==metadata.attribution_change_id||target.salesContractNo!==metadata.sales_contract_no||metadata.source_external_id!==capturedOrder.sourceId||normalizeAinuokeSalesContractNo(metadata.link_contract_no)!==contract)fail(503,'material_history_integrity_failed');
     if(metadata.attribution_change_id){if(!(await client.query('SELECT 1 FROM sales_order_attribution_members WHERE change_id=$1 AND sales_order_id=$2 AND effective_order_id=$3',[metadata.attribution_change_id,metadata.source_owner_order_id,id.toLowerCase()])).rowCount)fail(503,'material_history_integrity_failed');}
     else if(metadata.source_owner_order_id!==id.toLowerCase())fail(503,'material_history_integrity_failed');
    }else if(metadata.captured_order_version!==null||payload.order_scope!==null)fail(503,'material_history_integrity_failed');
    const projected=projectMaterialProgress({salesContractNo:contract,styleNo:capturedOrder.styleNo,insideOrderNo:capturedOrder.insideOrderNo},payload.snapshots);if(projected.sourceStatus!=='ready')fail(503,'material_history_integrity_failed');
    // Quantities remain captured source facts. No historical or current readiness
    // verdict is asserted by a parser which may have changed since capture.
    const progress:HistoricalMaterialProgress={...projected,schemaVersion:'order-material-history-progress.v1',sourceStatus:'historical',message:'历史来源快照，按当前解析规则展示；不代表当前采购、库存或齐套状态。',rows:projected.rows.map(row=>({...row,status:null})),groups:projected.groups.map(group=>({...group,rows:group.rows.map(row=>({...row,status:null}))})),summary:{...projected.summary,fabric:{...projected.summary.fabric,unknown:projected.summary.fabric.demands,states:{not_purchased:0,purchasing:0,pending_inbound:0,ready:0}},trim:{...projected.summary.trim,unknown:projected.summary.trim.demands,states:{not_purchased:0,purchasing:0,pending_inbound:0,ready:0}}}};
    return {schemaVersion:'order-material-history.v1',usage:'historical_only',currentStatusApplicable:false,originalOrderId:id.toLowerCase(),originalOrderNo:context.orderNo,currentEffectiveOrderId:context.effectiveId,record:record(metadata),projectionBasis:'current-parser-on-captured-source',progress};
   });
  }
 };
}

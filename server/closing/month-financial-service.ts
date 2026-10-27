import type {PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {planHash} from '../production-scheduling/repository.js';
import {closingFail,type ClosingChannels,type ClosingIntent} from './contract.js';
import {validateMonthLines,type ClosingMonthLine} from './month-plan-model.js';
import {readClosingMonthFinancialBasis} from './month-plan-service.js';
import {appendClosingAllocationVersion,CLOSING_ALLOCATION_LIMIT,type ClosingAllocationRecord,type ClosingPeriodRecord} from './repository.js';
import {closingSnapshotIdentity,createClosingSnapshotFromBasis,prepareClosingSnapshotBasis,projectClosingSnapshot,type ClosingSnapshot} from './snapshot.js';

type Channel='sales'|'work';
export type MonthFinancialLink={allocationId:string;periodId:string;orderId:string;planVersionId:string;planVersion:number;lineId:string;channel:Channel;line:ClosingMonthLine};
type Change={kind:'create'|'update'|'keep'|'void';old:ClosingAllocationRecord|null;link:Omit<MonthFinancialLink,'allocationId'|'periodId'>;snapshot:ClosingSnapshot};
export type BuiltMonthSync={changes:Change[];plans:{orderId:string;versionId:string;version:number;sourceFingerprint:string}[];warnings:string[]};
export async function monthFinancialLinksAvailable(client:PoolClient){
 return (await client.query<{ready:boolean}>("SELECT to_regclass('public.server_closing_month_financial_links') IS NOT NULL AS ready")).rows[0].ready;
}
export async function guardLegacyClosingWrite(client:PoolClient,orderId:string,allocationId:string|null,action:'create_allocation'|'update_allocation'|'void_allocation'){
 if(!await monthFinancialLinksAvailable(client))return;
 const linked=(await client.query('SELECT 1 FROM server_closing_month_financial_links WHERE sales_order_id=$1 LIMIT 1',[orderId])).rowCount;
 if(!linked)return;
 if(action!=='void_allocation'||allocationId!==null&&(await client.query('SELECT 1 FROM server_closing_month_financial_links WHERE allocation_id=$1',[allocationId])).rowCount)
  closingFail(409,'closing_month_financial_command_required');
}
async function requireSchema(client:PoolClient){if(!await monthFinancialLinksAvailable(client))closingFail(503,'closing_month_financial_schema_unavailable');}
export async function readMonthFinancialLinks(client:PoolClient,periodId:string):Promise<MonthFinancialLink[]>{
 await requireSchema(client);
 const rows=(await client.query<MonthFinancialLink>(`SELECT l.allocation_id::text AS "allocationId",l.period_id::text AS "periodId",l.sales_order_id::text AS "orderId",
  l.month_plan_version_id::text AS "planVersionId",l.month_plan_version AS "planVersion",l.line_id::text AS "lineId",l.channel,
  (SELECT value FROM jsonb_array_elements(v.lines) WHERE value->>'id'=l.line_id::text) AS line
  FROM server_closing_month_financial_links l JOIN server_closing_month_plan_versions v ON v.id=l.month_plan_version_id
  WHERE l.period_id=$1 ORDER BY l.allocation_id LIMIT 5001`,[periodId])).rows;
 if(rows.length>CLOSING_ALLOCATION_LIMIT)closingFail(422,'closing_period_allocation_limit');
 for(const row of rows){try{validateMonthLines([row.line],row.line.quantity);if(row.line.id!==row.lineId)throw Error();}catch{closingFail(503,'closing_month_financial_link_invalid');}}
 return rows;
}
/** Explicitly adopted dimensions, including empty/now-voided months. No price data. */
export async function adoptedMonthChannels(client:PoolClient,periodId:string,asOfVersion:number|null=null):Promise<ClosingChannels>{
 const row=(await client.query<{sales:boolean;work:boolean}>(`SELECT coalesce(bool_or(command->'intent'->'channels'->'sales'='true'::jsonb),false) AS sales,
  coalesce(bool_or(command->'intent'->'channels'->'work'='true'::jsonb),false) AS work FROM server_closing_commands
  WHERE action='sync_month_outputs' AND result->>'status'='applied' AND result->>'periodId'=$1
  AND ($2::int IS NULL OR (result->>'periodVersion')::int<=$2)`,[periodId,asOfVersion])).rows[0];
 return row;
}
async function orderIdsForMonth(client:PoolClient,month:string,channels:ClosingChannels){
 const rows=(await client.query<{id:string}>(`SELECT p.sales_order_id::text AS id FROM server_closing_month_plans p
  JOIN server_closing_month_plan_heads h ON h.sales_order_id=p.sales_order_id JOIN server_closing_month_plan_versions v ON v.id=h.current_version_id
  WHERE (v.lines @> jsonb_build_array(jsonb_build_object('month',$1::text)) OR (p.default_month=$1 AND v.quantity_state<>'ready'))
  AND ($2::boolean OR NOT EXISTS(SELECT 1 FROM sales_order_identity_profiles i
    JOIN processing_order_batch_consumptions c ON c.sales_order_id=i.sales_order_id JOIN processing_order_batches b ON b.id=c.batch_id
    WHERE i.sales_order_id=p.sales_order_id AND i.business_type='processing'))
  ORDER BY p.sales_order_id LIMIT 501`,[month,channels.work])).rows;
 if(rows.length>500)closingFail(422,'closing_month_order_limit');return rows.map(row=>row.id);
}
const key=(orderId:string,lineId:string,channel:Channel)=>JSON.stringify([orderId,lineId,channel]);
const sameLine=(a:ClosingMonthLine,b:ClosingMonthLine)=>planHash(a)===planHash(b);
function selected(channel:Channel,channels:ClosingChannels){return channels[channel];}

/** Server-owned quantity set. Callers cannot submit SOs, colors, quantities or money. */
export async function buildMonthFinancialSync(client:PoolClient,actor:TrustedIdentity,period:ClosingPeriodRecord,
 intent:Extract<ClosingIntent,{action:'sync_month_outputs'}>,allocations:ClosingAllocationRecord[],freeze:boolean):Promise<BuiltMonthSync>{
 await requireSchema(client);if(period.status!=='open')closingFail(409,'closing_period_not_open');
 const links=await readMonthFinancialLinks(client,period.id),linkById=new Map(links.map(link=>[link.allocationId,link]));
 const active=allocations.filter(row=>row.status==='active'&&linkById.has(row.id)&&selected(linkById.get(row.id)!.channel,intent.channels));
 const existing=new Map<string,{row:ClosingAllocationRecord;link:MonthFinancialLink}>();
 for(const row of active){const link=linkById.get(row.id)!,id=key(row.orderId,link.lineId,link.channel);if(existing.has(id))closingFail(503,'closing_month_financial_link_invalid');existing.set(id,{row,link});}
 const ids=[...new Set([...await orderIdsForMonth(client,period.month,intent.channels),...active.map(row=>row.orderId)])].sort();
 if(ids.length>500)closingFail(422,'closing_month_order_limit');
 if(freeze&&ids.length)await client.query('SELECT id FROM sales_orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',[ids]);
 if(ids.length&&(await client.query(`SELECT 1 FROM server_closing_allocations a JOIN server_closing_allocation_heads h ON h.allocation_id=a.id
  JOIN server_closing_allocation_versions v ON v.id=h.current_version_id WHERE a.sales_order_id=ANY($1::uuid[]) AND v.status='active'
  AND NOT EXISTS(SELECT 1 FROM server_closing_month_financial_links l WHERE l.allocation_id=a.id) LIMIT 1`,[ids])).rowCount)closingFail(409,'closing_month_legacy_allocations_require_review');
 const changes:Change[]=[],plans:BuiltMonthSync['plans']=[],warnings=new Set<string>();let created=0,previewBytes=0;
 const add=(change:Change)=>{previewBytes+=Buffer.byteLength(JSON.stringify(projectMonthChange(change,actor)))+1;
  if(previewBytes>1048576)closingFail(422,'closing_preview_too_large');changes.push(change);};
 for(const orderId of ids){
  const owner=await readClosingMonthFinancialBasis(client,orderId,freeze),lines=owner.plan.lines.filter(line=>line.month===period.month);
  plans.push({orderId,versionId:owner.plan.versionId,version:owner.plan.version,sourceFingerprint:owner.plan.sourceFingerprint});
  if(!lines.length)continue;
  const prepared=await prepareClosingSnapshotBasis(client,actor,orderId);
  for(const line of lines)for(const channel of ['sales','work'] as const){
   if(!selected(channel,intent.channels)||channel==='sales'&&prepared.basis.order.businessType==='processing')continue;
   const id=key(orderId,line.id,channel),old=existing.get(id),reusable=old&&sameLine(old.link.line,line);
   if(!reusable&&allocations.length+(++created)>CLOSING_ALLOCATION_LIMIT)closingFail(422,'closing_period_allocation_limit');
   const snapshot=await createClosingSnapshotFromBasis(client,actor,prepared,{quantity:line.quantity,colorId:line.colorId,assignmentId:line.assignmentId,
    executor:null,channels:{sales:channel==='sales',work:channel==='work'},remark:''},period.taxRatePercent,freeze);
   if(!snapshot.executor)warnings.add('executor_unassigned');
   existing.delete(id);
   const link={orderId,planVersionId:owner.plan.versionId,planVersion:owner.plan.version,lineId:line.id,channel,line};
   if(old&&reusable){
    const identical=planHash(closingSnapshotIdentity(old.row.snapshot))===planHash(closingSnapshotIdentity(snapshot));
    add({kind:identical?'keep':'update',old:old.row,link:old.link,snapshot});
   }else{
    if(old)add({kind:'void',old:old.row,link:old.link,snapshot:old.row.snapshot});
    add({kind:'create',old:null,link,snapshot});
   }
  }
 }
 for(const {row,link} of existing.values())add({kind:'void',old:row,link,snapshot:row.snapshot});
 if(allocations.length+changes.filter(change=>change.kind==='create').length>CLOSING_ALLOCATION_LIMIT)closingFail(422,'closing_period_allocation_limit');
 if(!changes.length)warnings.add('no_applicable_month_portions');
 return {changes,plans,warnings:[...warnings].sort()};
}
function projectMonthChange(change:Change,actor:TrustedIdentity){
 return {kind:change.kind,lineId:change.link.lineId,channel:change.link.channel,
  before:change.old?projectClosingSnapshot(change.old.snapshot,actor):null,after:change.kind==='void'?null:projectClosingSnapshot(change.snapshot,actor)};
}
export function monthFinancialSyncIdentity(build:BuiltMonthSync){
 return {plans:build.plans,changes:build.changes.map(change=>({kind:change.kind,old:change.old?{id:change.old.id,version:change.old.version,versionId:change.old.versionId}:null,
  link:change.link,snapshot:closingSnapshotIdentity(change.snapshot)})),warnings:build.warnings};
}
export function projectMonthFinancialSync(build:BuiltMonthSync,actor:TrustedIdentity){
 return {meaning:'explicit_month_plan_adoption' as const,channelsAreNotAddedToPhysicalQuantity:true,
  counts:{created:build.changes.filter(c=>c.kind==='create').length,updated:build.changes.filter(c=>c.kind==='update').length,
   voided:build.changes.filter(c=>c.kind==='void').length,unchanged:build.changes.filter(c=>c.kind==='keep').length},
  items:build.changes.map(change=>projectMonthChange(change,actor))};
}
export async function applyMonthFinancialSync(client:PoolClient,actor:TrustedIdentity,requestId:string,operationId:string,periodId:string,
 reason:string,build:BuiltMonthSync){
 await client.query("SELECT set_config('zhixu.closing_month_financial_command','on',true)");
 for(const change of build.changes){
  if(change.kind==='keep')continue;
  const id=change.old?.id??(await client.query<{id:string}>('INSERT INTO server_closing_allocations(period_id,sales_order_id,created_by) VALUES($1,$2,$3) RETURNING id::text',
   [periodId,change.snapshot.order.id,actor.internalUserId])).rows[0].id;
  await appendClosingAllocationVersion(client,actor,requestId,operationId,id,periodId,change.old?.version??0,change.snapshot,
   change.kind==='void'?'void_allocation':change.kind==='update'?'update_allocation':'create_allocation',reason);
  if(change.kind==='create')await client.query(`INSERT INTO server_closing_month_financial_links(allocation_id,period_id,sales_order_id,month_plan_version_id,month_plan_version,line_id,channel)
   VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,periodId,change.link.orderId,change.link.planVersionId,change.link.planVersion,change.link.lineId,change.link.channel]);
 }
}

/** Never confirm/lock stale month quantities through the old period endpoint. */
export async function validateMonthFinancialCoverage(client:PoolClient,period:ClosingPeriodRecord,allocations:ClosingAllocationRecord[],freeze:boolean){
 await requireSchema(client);
 const channels=await adoptedMonthChannels(client,period.id),ids=await orderIdsForMonth(client,period.month,
  channels.sales||channels.work?channels:{sales:true,work:true}),links=await readMonthFinancialLinks(client,period.id);
 const active=allocations.filter(row=>row.status==='active'),byKey=new Map<string,MonthFinancialLink>();
 for(const row of active)if(!links.some(link=>link.allocationId===row.id))
  closingFail(409,'closing_month_legacy_allocations_require_review');
 if(!channels.sales&&!channels.work){if(ids.length)closingFail(409,'closing_month_financial_sync_required');return;}
 const owners=new Map<string,Awaited<ReturnType<typeof readClosingMonthFinancialBasis>>>();
 const ownerFor=async(id:string)=>{if(!owners.has(id))owners.set(id,await readClosingMonthFinancialBasis(client,id,freeze));return owners.get(id)!;};
 for(const row of active){
  const link=links.find(link=>link.allocationId===row.id);if(!link)continue;
  const basis=await ownerFor(row.orderId),current=basis.plan.lines.find(line=>line.id===link.lineId);
  if(!current||!sameLine(current,link.line)||current.month!==period.month)closingFail(409,'closing_month_financial_sync_required');
  byKey.set(key(row.orderId,link.lineId,link.channel),link);
 }
 for(const orderId of ids){
  const owner=await ownerFor(orderId);
  for(const line of owner.plan.lines.filter(line=>line.month===period.month))for(const channel of ['sales','work'] as const){
   if(!channels[channel]||channel==='sales'&&owner.order.businessType==='processing')continue;
   if(!byKey.has(key(orderId,line.id,channel)))closingFail(409,'closing_month_financial_sync_required');
  }
 }
}

import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {readCurrentActor} from '../auth/current-actor.js';
import {requirePermission} from '../auth/permissions.js';
import {readPlanOrderSummaries,type PlanOrderSummary} from '../production-scheduling/read-model.js';
import {assignmentsForOrder} from '../production-scheduling/repository.js';
import {CLOSING_READ_PERMISSIONS,closingAmount,closingFail} from './contract.js';
import {parseClosingYearQuery,type ClosingYearQuery} from './annual-contract.js';
import {closingReferenceStatus,summarizeYearAmounts,type ClosingYearAmount} from './annual-model.js';
import {readClosingMonthStateInTransaction} from './month-plan-service.js';
import {currentClosingExecutionReferences,prepareClosingSnapshotBasis} from './snapshot.js';
import {readClosingPeriod,readClosingAllocations,type ClosingPeriodRecord} from './repository.js';
import {monthFinancialLinksAvailable,readMonthFinancialLinks} from './month-financial-service.js';
import {compareClosingExecutionReferences,type ClosingBusinessType,type ClosingPriceView,type ClosingExecutionReference} from './basis-model.js';
import type {ClosingMonthLine} from './month-plan-model.js';

type Item={id:string;order:{id:string;orderNo:string;businessType:ClosingBusinessType;styleNo:string|null;factoryStyleNo:string|null;customerName:string|null;brandName:string|null;
 quantity:string|null;completedQuantity:string;deliveryDate:string|null;productionStatus:Exclude<ClosingYearQuery['production'],'all'>};
 month:string|null;quantity:string|null;colorId:string|null;colorName:string|null;executor:{type:'internal'|'outsource';id:string;name:string|null}|null;
 basis:{kind:'current_adopted_order_reference'|'frozen_financial_snapshot';monthVersion:number|null;financialVersions:{id:string;version:number;versionId:string;channel:'sales'|'work'}[]};
 issues:string[];executionReview:{requiresReview:boolean;laterCorrection:boolean;lockedSnapshotPreserved:boolean;changes:{assignmentId:string;reasons:string[]}[]}|null;
 garmentSale:ClosingYearAmount;processing:ClosingYearAmount};
const blocked=(currency:'CNY'|'USD',reason:string,allowed:boolean):ClosingYearAmount=>allowed?{visibility:'allowed',currency,state:'blocked',reason}:{visibility:'restricted'};
const known=(currency:'CNY'|'USD',quantity:string,price:string,tax:string|null,allowed:boolean):ClosingYearAmount=>allowed?
 {visibility:'allowed',currency,state:'known',price,amount:closingAmount(quantity,price,tax)}:{visibility:'restricted'};
function livePrice(view:ClosingPriceView['workPrice']|ClosingPriceView['garmentSale'],currency:'CNY'|'USD',quantity:string|null,tax:string|null,issues:readonly string[],allowed:boolean):ClosingYearAmount{
 if(!allowed)return {visibility:'restricted'};
 if(issues.length)return blocked(currency,issues[0],true);
 if(quantity===null)return blocked(currency,'quantity_unknown',true);
 if(!view||view.visibility!=='allowed'||view.eligibility.state!=='eligible'||!view.value||view.value.price===null)
  return blocked(currency,view?.visibility==='allowed'&&view.eligibility.state==='blocked'?view.eligibility.reason:'color_price_mapping_required',true);
 if(currency==='CNY'&&tax===null)return blocked(currency,'period_tax_required',true);
 return known(currency,quantity,view.value.price,tax,true);
}
const withinScope=(item:Item,scope:ClosingYearQuery['scope'])=>scope==='all'||scope==='unassigned'?scope==='all'||item.executor===null:item.executor?.type===scope;
function orderLabel(order:PlanOrderSummary,status:Item['order']['productionStatus']):Item['order']{
 if(order.businessType==='unclassified')closingFail(409,'closing_trusted_order_required');
 return {id:order.id,orderNo:order.orderNo,businessType:order.businessType,styleNo:order.styleNo,factoryStyleNo:order.factoryStyleNo,customerName:order.customerName,
  brandName:order.brandName,quantity:order.quantity,completedQuantity:order.completedQuantity,deliveryDate:order.deliveryDate,productionStatus:status};
}
async function candidateIds(client:PoolClient,query:ClosingYearQuery){
 const args:unknown[]=[query.year],tokens=query.search.toLowerCase().split(' ').filter(Boolean),filters=tokens.map(token=>{args.push(token);
  return `strpos(lower(concat_ws(' ',o.order_no,m.style_no,m.inside_order_no,m.customer_name_snapshot,m.brand_name_snapshot,m.sales_contract_no,b.business_style_no,b.customer_name,b.customer_reference)),$${args.length})>0`;});
 const rows=(await client.query<{id:string}>(`WITH candidates AS (
  SELECT p.sales_order_id FROM server_closing_month_plans p JOIN server_closing_month_plan_heads h ON h.sales_order_id=p.sales_order_id
   JOIN server_closing_month_plan_versions v ON v.id=h.current_version_id
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v.lines) line WHERE left(line->>'month',4)=$1 OR line->>'month' IS NULL)
    OR v.quantity_state<>'ready' AND (left(p.default_month,4)=$1 OR p.default_month IS NULL)
  UNION SELECT a.sales_order_id FROM server_closing_periods p JOIN server_closing_period_heads h ON h.period_id=p.id
   JOIN server_closing_period_versions v ON v.id=h.current_version_id JOIN server_closing_allocations a ON a.period_id=p.id
   WHERE left(p.month,4)=$1 AND v.status IN ('confirmed','locked'))
  SELECT o.id::text FROM candidates c JOIN sales_orders o ON o.id=c.sales_order_id
   LEFT JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=o.id
   LEFT JOIN processing_order_batch_consumptions bc ON bc.sales_order_id=o.id LEFT JOIN processing_order_batches b ON b.id=bc.batch_id
   ${filters.length?'WHERE '+filters.join(' AND '):''} ORDER BY o.order_no,o.id LIMIT 501`,args)).rows;
 if(rows.length>500)closingFail(422,'closing_year_order_limit');return rows.map(row=>row.id);
}
/** Planning reference and frozen financial history are deliberately distinct. */
export async function readClosingYear(pool:Pool,identity:TrustedIdentity,params:URLSearchParams){
 const query=parseClosingYearQuery(params),client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='15s'");
  const actor=await readCurrentActor(client,identity);for(const permission of CLOSING_READ_PERMISSIONS)requirePermission(actor.permissions,permission);
  if(!await monthFinancialLinksAvailable(client))closingFail(503,'closing_month_financial_schema_unavailable');
  const sale=actor.permissions.includes('commercial.sale.view'),work=actor.permissions.includes('commercial.labor.view');
  const periods=new Map<string,ClosingPeriodRecord>();
  for(const row of (await client.query<{id:string}>('SELECT id::text FROM server_closing_periods WHERE left(month,4)=$1 ORDER BY month',[query.year])).rows){
   const period=await readClosingPeriod(client,row.id);periods.set(period.month,period);}
  const ids=await candidateIds(client,query),summaries=await readPlanOrderSummaries(client,ids),items:Item[]=[],statuses=new Map<string,Item['order']['productionStatus']>(),productionReferences=new Map<string,ClosingExecutionReference[]>();
  const frozenMonths=[...periods.values()].filter(period=>period.status!=='open').map(period=>period.month);
  const liveIds=new Set((await client.query<{id:string}>(`SELECT p.sales_order_id::text AS id FROM server_closing_month_plans p
   JOIN server_closing_month_plan_heads h ON h.sales_order_id=p.sales_order_id JOIN server_closing_month_plan_versions v ON v.id=h.current_version_id
   WHERE p.sales_order_id=ANY($1::uuid[]) AND (EXISTS(SELECT 1 FROM jsonb_array_elements(v.lines) line
     WHERE line->>'month' IS NULL OR left(line->>'month',4)=$2 AND NOT(line->>'month'=ANY($3::text[])))
    OR v.quantity_state<>'ready' AND (p.default_month IS NULL OR left(p.default_month,4)=$2))`,[ids,query.year,frozenMonths])).rows.map(row=>row.id));
  const add=(item:Item)=>{if(items.length>=5000)closingFail(422,'closing_year_portion_limit');items.push(item);};
  for(const id of ids){
   const order=summaries[id];if(!order)closingFail(503,'closing_year_order_unavailable');
   if(!liveIds.has(id)){
    const assignments=await assignmentsForOrder(client,id),references=await currentClosingExecutionReferences(client,id,assignments.map(row=>row.id));
    statuses.set(id,closingReferenceStatus(order.quantity,order.completedQuantity,references));productionReferences.set(id,references);continue;
   }
   const state=await readClosingMonthStateInTransaction(client,actor,id);
   productionReferences.set(id,state.executorCandidates);
   const status=closingReferenceStatus(order.quantity,order.completedQuantity,state.executorCandidates);statuses.set(id,status);
   if(query.production!=='all'&&status!==query.production)continue;
   const p=state.plan;if(!p)continue;
   const lines:(Omit<ClosingMonthLine,'quantity'>&{quantity:string|null})[]=p.lines.filter(line=>(line.month===null||line.month.startsWith(query.year+'-'))&&!frozenMonths.includes(line.month??''));
   if(p.quantityState!=='ready')lines.push({id:p.versionId,colorId:null,assignmentId:null,month:frozenMonths.includes(p.defaultMonth??'')?null:p.defaultMonth,quantity:null});
   if(!lines.length)continue;
   const prepared=await prepareClosingSnapshotBasis(client,actor,id),issues=[...(state.sourceChanged?['month_source_changed']:[]),...(state.executorChanges.length?['month_executor_review_required']:[]),
    ...(p.quantityState!=='ready'?['quantity_'+p.quantityState]:[])];
   for(const line of lines){
    const prices=prepared.basis.priceLines.filter(price=>price.colorId===line.colorId),price=prices.length===1?prices[0]:undefined;
    const ref=p.executorBasis.find(ref=>ref.assignmentId===line.assignmentId),assignment=prepared.assignments.find(row=>row.id===line.assignmentId),tax=periods.get(line.month??'')?.taxRatePercent??null;
    const name=assignment&&assignment.resourceSnapshotHash===ref?.resourceSnapshotHash?(assignment.resourceFacts.executionType==='internal'?assignment.resourceFacts.group.name:assignment.resourceFacts.factory.name):null;
    const quantity=p.quantityState==='ready'?line.quantity:null;
    add({id:line.id,order:orderLabel(order,status),month:line.month,quantity,colorId:line.colorId,colorName:price?.colorName??null,
     executor:ref?{type:ref.executionType,id:ref.executorId,name}:null,basis:{kind:'current_adopted_order_reference',monthVersion:p.version,financialVersions:[]},issues,executionReview:null,
     garmentSale:order.businessType==='processing'?{visibility:'allowed',currency:'CNY',state:'not_applicable'}:livePrice(price?.garmentSale,'CNY',quantity,tax,issues,sale),
     processing:livePrice(price?.workPrice,'USD',quantity,null,issues,work)});
   }
  }
  for(const period of periods.values())if(period.status!=='open'){
   const allocations=(await readClosingAllocations(client,period.id,period.allocationManifest)).filter(row=>row.status==='active'&&ids.includes(row.orderId));
   const links=new Map((await readMonthFinancialLinks(client,period.id)).map(link=>[link.allocationId,link]));
   const grouped=new Map<string,Item>();
   for(const row of allocations){const order=summaries[row.orderId],status=statuses.get(row.orderId);if(!order||!status)closingFail(503,'closing_year_order_unavailable');
    if(query.production!=='all'&&status!==query.production)continue;
    const s=row.snapshot,link=links.get(row.id),key=link?JSON.stringify([row.orderId,link.lineId]):row.id;
    let item=grouped.get(key);
    if(!item){item={id:link?.lineId??row.id,order:orderLabel({...order,orderNo:s.order.orderNo,businessType:s.order.businessType},status),month:period.month,quantity:s.quantity,colorId:s.colorId,colorName:s.colorName,
     executor:s.executor?{type:s.executor.type,id:s.executor.id,name:s.executor.name}:null,
     basis:{kind:'frozen_financial_snapshot',monthVersion:link?.planVersion??null,financialVersions:[]},issues:[],executionReview:{requiresReview:false,laterCorrection:false,lockedSnapshotPreserved:false,changes:[]},
     garmentSale:s.order.businessType==='processing'?{visibility:'allowed',currency:'CNY',state:'not_applicable'}:blocked('CNY','financial_channel_not_adopted',sale),
     processing:blocked('USD','financial_channel_not_adopted',work)};grouped.set(key,item);}
    if(item.quantity!==s.quantity||item.colorId!==s.colorId||item.executor?.id!==s.executor?.id)closingFail(503,'closing_frozen_portion_conflict');
    const review=compareClosingExecutionReferences(s.reviewBasis,productionReferences.get(row.orderId)??[],period.status),combined=item.executionReview!;
    combined.requiresReview ||= review.requiresReview;combined.laterCorrection ||= review.changes.length>0;combined.lockedSnapshotPreserved ||= review.lockedSnapshotPreserved;
    for(const change of review.changes){const existing=combined.changes.find(row=>row.assignmentId===change.assignmentId);
     if(existing)existing.reasons=[...new Set([...existing.reasons,...change.reasons])].sort();else combined.changes.push(change);}
    item.issues=[...(combined.requiresReview?['production_review_required']:[]),...(combined.lockedSnapshotPreserved&&combined.laterCorrection?['locked_snapshot_with_later_correction']:[])];
    for(const channel of ['sales','work'] as const)if(s.channels[channel]){
     if(item.basis.financialVersions.some(ref=>ref.channel===channel))closingFail(503,'closing_frozen_portion_conflict');
     item.basis.financialVersions.push({id:row.id,version:row.version,versionId:row.versionId,channel});
     if(channel==='sales')item.garmentSale=known('CNY',s.quantity,s.prices.sale!.price,s.taxRatePercent,sale);
     else item.processing=known('USD',s.quantity,s.prices.work!.price,null,work);
    }
   }
   for(const item of grouped.values())add(item);
  }
  const filtered=items.filter(item=>withinScope(item,query.scope)).sort((a,b)=>(a.month??'9999-99').localeCompare(b.month??'9999-99')||a.order.orderNo.localeCompare(b.order.orderNo)||a.id.localeCompare(b.id));
  const months=Array.from({length:12},(_,i)=>{const month=query.year+'-'+String(i+1).padStart(2,'0'),period=periods.get(month),rows=filtered.filter(row=>row.month===month);
   return {month,period:period?{id:period.id,version:period.version,status:period.status,taxRatePercent:period.taxRatePercent}:null,
    basis:period&&period.status!=='open'?'frozen_financial_snapshot' as const:'current_adopted_order_reference' as const,portions:rows.length,
    garmentSalesCny:summarizeYearAmounts(rows.map(row=>row.garmentSale),'CNY',sale),processingUsd:summarizeYearAmounts(rows.map(row=>row.processing),'USD',work)};});
  const assigned=filtered.filter(row=>row.month!==null),result={schemaVersion:'server-closing-year.v1' as const,readOnly:true,query,months,
   totals:{garmentSalesCny:summarizeYearAmounts(assigned.map(row=>row.garmentSale),'CNY',sale),processingUsd:summarizeYearAmounts(assigned.map(row=>row.processing),'USD',work)},
   pendingPortions:filtered.filter(row=>row.month===null).length,pendingNotAssignedToYear:true,productionReference:'current_cumulative_not_monthly_recognition' as const,
   orderMetadata:'current_reference_except_frozen_identity' as const,summaryScope:'same_filtered_portions_before_pagination' as const,
   total:filtered.length,offset:query.offset,limit:query.limit,items:filtered.slice(query.offset,query.offset+query.limit)};
  if(Buffer.byteLength(JSON.stringify(result))>1048576)closingFail(422,'closing_year_response_too_large');
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
}

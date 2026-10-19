import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {canonicalDecimal} from '../quotes/model.js';
import {readOrderCommercialState} from './commercial-version-service.js';
import {readCommercialLines,readPricingColors,pricingActor,pricingTarget,pricingFail,appendLineCommercialVersion,projectPricingLines} from './color-commercial.js';
import {productHash,type ProductSnapshot} from './product-snapshot.js';
import {lockEffectiveAttribution} from './effective-attribution.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {identityUuid} from './identity-model.js';
import {requireOrderCommandActor} from './identity-service.js';

export type SaleRule={kind:'amount'|'percent'|'set';value:string};
type Override={colorId:string|null;price:string};
type Item={salesOrderId:string;expectedVersion?:number;fingerprint?:string;overrides?:Override[]};
type Command={requestId:string;reason:string;rule:SaleRule;items:Item[]};
type PriceReceipt={salesOrderId:string;status:string;code?:string;commercialVersionId?:string;replayed?:boolean};
export type QuoteOrderPriceRow={id:string;orderNo:string;lifecycle:string;quoteId:string;revisionId:string;version:number;pricing:ReturnType<typeof projectPricingLines>;sale?:string|null;editable:boolean};
type PriceHistoryRow={operationId:string;createdAt:string;actor:string;salesOrderId:string;orderNo:string;status:string;beforeVersionId:string|null;afterVersionId:string|null;quoteId:string;reason?:string;rule?:SaleRule;before:ReturnType<typeof projectPricingLines>;after:ReturnType<typeof projectPricingLines>};
const decimal=(v:unknown,signed=false)=>typeof v==='string'&&v.length<=128&&(signed?/^-?\d+(?:\.\d+)?$/u:/^\d+(?:\.\d+)?$/u).test(v);
function parts(value:string){const negative=value.startsWith('-'),[a,b='']=value.replace(/^-/u,'').split('.');return {n:BigInt(a+b)*(negative?-BigInt(1):BigInt(1)),scale:b.length};}
function render(n:bigint,scale:number){const sign=n<BigInt(0)?'-':'',s=(n<BigInt(0)?-n:n).toString().padStart(scale+1,'0');return canonicalDecimal(sign+(scale?s.slice(0,-scale)+'.'+s.slice(-scale):s));}
export function applySaleRule(price:string,rule:SaleRule):string{
 if(rule.kind==='set'){if(!decimal(rule.value))pricingFail(400,'invalid_adjusted_sale_price');return canonicalDecimal(rule.value);}
 const a=parts(price),b=parts(rule.value);let value:string;
 if(rule.kind==='amount'){const scale=Math.max(a.scale,b.scale);value=render(a.n*BigInt(10)**BigInt(scale-a.scale)+b.n*BigInt(10)**BigInt(scale-b.scale),scale);}
 else value=render(a.n*(BigInt(100)*BigInt(10)**BigInt(b.scale)+b.n),a.scale+b.scale+2);
 if(value.startsWith('-')||value.length>2000)pricingFail(400,'invalid_adjusted_sale_price');return value;
}
function parseRule(raw:unknown):SaleRule{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))pricingFail(400,'invalid_sale_rule');const r=raw as Record<string,unknown>;
 if(Object.keys(r).sort().join(',')!=='kind,value'||!['amount','percent','set'].includes(String(r.kind))||!decimal(r.value,r.kind!=='set'))pricingFail(400,'invalid_sale_rule');
 return {kind:r.kind as SaleRule['kind'],value:canonicalDecimal(r.value as string)};
}
function parseItems(raw:unknown,commit=false):Item[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>25)pricingFail(400,'invalid_sale_adjustment_items');
 const items=raw.map((v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))pricingFail(400,'invalid_sale_adjustment_items');const r=v as Record<string,unknown>;
 if(Object.keys(r).some(k=>!['salesOrderId','expectedVersion','fingerprint','overrides'].includes(k))||!identityUuid.test(String(r.salesOrderId))||(commit&&(!Number.isSafeInteger(r.expectedVersion)||Number(r.expectedVersion)<1||typeof r.fingerprint!=='string'||!/^([a-f0-9]{64})$/u.test(r.fingerprint))))pricingFail(400,'invalid_sale_adjustment_items');
 if(r.overrides!==undefined&&(!Array.isArray(r.overrides)||r.overrides.length>1000||r.overrides.some(o=>!o||typeof o!=='object'||Object.keys(o).sort().join(',')!=='colorId,price'||!(o.colorId===null||identityUuid.test(o.colorId))||!decimal(o.price))))pricingFail(400,'invalid_sale_adjustment_items');
 const overrides=(r.overrides as Override[]|undefined)?.map(o=>({colorId:o.colorId,price:canonicalDecimal(o.price)}));if(overrides&&new Set(overrides.map(o=>o.colorId)).size!==overrides.length)pricingFail(400,'duplicate_sale_override');
 return {salesOrderId:String(r.salesOrderId).toLowerCase(),...(r.expectedVersion!==undefined?{expectedVersion:Number(r.expectedVersion)}:{}),...(r.fingerprint!==undefined?{fingerprint:String(r.fingerprint)}:{}),...(overrides?{overrides}: {})};});
 if(new Set(items.map(i=>i.salesOrderId)).size!==items.length)pricingFail(400,'duplicate_sale_adjustment_order');return items;
}
async function currentLines(c:PoolClient,id:string){
 const business=await pricingTarget(c,id);if(business.businessType!=='ainuoke_contract')pricingFail(409,'processing_sale_adjustment_not_applicable');
 const state=await readOrderCommercialState(c,id),v=state.current;if(!v)pricingFail(409,'order_commercial_basis_required');
 let lines=v.lines;
 if(!lines){
  const row=(await c.query('SELECT v.source_fingerprint,v.quote_type,s.product_snapshot,s.product_hash FROM sales_order_commercial_versions v LEFT JOIN sales_order_business_source_snapshots s ON s.commercial_version_id=v.id WHERE v.id=$1',[v.id])).rows[0];
  if(!row.product_snapshot)pricingFail(409,'order_product_evidence_required');
  const product=row.product_snapshot as ProductSnapshot;if(!product.priceVersion)pricingFail(409,'order_product_evidence_required');
  const source={quoteId:v.quoteId,revisionId:v.revisionId,priceVersionId:v.priceVersionId,quoteVersion:v.quoteVersion,quoteType:'distribution' as const,sourceKind:v.sourceKind as 'cct'|'quote_confirmation',sourceCctId:v.sourceCctId,sourceCctVersion:v.sourceCctVersion,sourceConfirmedAt:v.sourceConfirmedAt,fingerprint:row.source_fingerprint,salePrice:v.salePrice,saleCurrency:'CNY' as const,laborPrice:v.laborPrice,laborCurrency:v.laborCurrency};
  const colors=await readPricingColors(c,id);if(colors.some(v=>v.ambiguous))pricingFail(409,'order_color_identity_ambiguous');
  lines=(colors.length?colors:[null]).map(color=>({colorId:color?.id??null,colorName:color?.colorName??null,quantity:color?.quantity??null,priceVersionId:v.priceVersionId,priceVersionName:String(product.priceVersion.name??'历史方案'),source,product,productHash:row.product_hash,baseSalePrice:v.salePrice,salePrice:v.salePrice,laborPrice:v.laborPrice,laborCurrency:v.laborCurrency}));
 }else{
  const colors=await readPricingColors(c,id);if(colors.some(v=>v.ambiguous)||colors.some(color=>!lines!.some(l=>l.colorId===color.id)))pricingFail(409,'order_color_price_mapping_required');
  if(lines.some(l=>l.colorId!==null))lines=lines.filter(l=>colors.some(c=>c.id===l.colorId)).map(l=>({...l,quantity:colors.find(c=>c.id===l.colorId)!.quantity}));
 }
 if(!lines.length||lines.some(l=>l.salePrice===null))pricingFail(409,'order_commercial_basis_required');return {state,lines};
}
async function previewOne(c:PoolClient,actor:TrustedIdentity,item:Item,rule:SaleRule){
 const {state,lines}=await currentLines(c,item.salesOrderId);
 if(item.expectedVersion!==undefined&&item.expectedVersion!==state.version)pricingFail(409,'order_commercial_version_conflict');
 if(item.overrides?.some(o=>!lines.some(l=>l.colorId===o.colorId)))pricingFail(409,'order_colors_changed');
 const after=lines.map(l=>({...l,salePrice:item.overrides?.find(o=>o.colorId===l.colorId)?.price??applySaleRule(l.salePrice!,rule)}));
 const fingerprint=productHash({salesOrderId:item.salesOrderId,version:state.version,versionId:state.current!.id,rule,before:lines,after});
 if(item.fingerprint!==undefined&&item.fingerprint!==fingerprint)pricingFail(409,'sale_adjustment_preview_changed');
 return {state,before:lines,after,fingerprint,public:{salesOrderId:item.salesOrderId,expectedVersion:state.version,fingerprint,before:projectPricingLines(actor,lines),after:projectPricingLines(actor,after)}};
}
export async function previewSaleAdjustment(pool:Pool,actor:TrustedIdentity,raw:Record<string,unknown>){
 if(Object.keys(raw).sort().join(',')!=='items,rule')pricingFail(400,'invalid_sale_adjustment_preview');const rule=parseRule(raw.rule),items=parseItems(raw.items),c=await pool.connect();try{await c.query('BEGIN');await lockEffectiveAttribution(c);const a=await pricingActor(c,actor,'quote.order_price.adjust');const results=[];
 for(const item of [...items].sort((a,b)=>a.salesOrderId.localeCompare(b.salesOrderId)))try{results.push({status:'ready' as const,...(await previewOne(c,a,item,rule)).public});}catch(e){if(!(e instanceof HttpError))throw e;results.push({status:'failed' as const,salesOrderId:item.salesOrderId,code:e.code});}
 await c.query('ROLLBACK');return {rule,items:results};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function createOperation(pool:Pool,actor:TrustedIdentity,raw:Record<string,unknown>){
 if(Object.keys(raw).sort().join(',')!=='items,reason,requestId,rule'||!identityUuid.test(String(raw.requestId))||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>2000)pricingFail(400,'invalid_sale_adjustment');
 const command:Command={requestId:String(raw.requestId).toLowerCase(),reason:String(raw.reason).trim(),rule:parseRule(raw.rule),items:parseItems(raw.items,true)},hash=productHash(command),c=await pool.connect();try{
  await c.query('BEGIN');const a=await pricingActor(c,actor,'quote.order_price.adjust');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['sale-adjustment:'+a.internalUserId+':'+command.requestId]);
  const old=(await c.query('SELECT id::text,payload_hash FROM order_sale_adjustment_operations WHERE actor_id=$1 AND request_id=$2',[a.internalUserId,command.requestId])).rows[0];
  if(old&&old.payload_hash!==hash)pricingFail(409,'sale_adjustment_retry_mismatch');const id=old?.id??(await c.query('INSERT INTO order_sale_adjustment_operations(actor_id,request_id,payload_hash,reason,rule,command_plan) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text',[a.internalUserId,command.requestId,hash,command.reason,command.rule,JSON.stringify(command.items)])).rows[0].id;await c.query('COMMIT');return {id:id as string,command};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function consumeAdjustment(pool:Pool,actor:TrustedIdentity,operationId:string,command:Command,item:Item){
 const c=await pool.connect();let committing=false;try{await c.query('BEGIN');await lockEffectiveAttribution(c);const a=await pricingActor(c,actor,'quote.order_price.adjust');
  await c.query('SELECT id FROM order_sale_adjustment_operations WHERE id=$1 FOR UPDATE',[operationId]);
  const done=(await c.query("SELECT status,after_version_id::text AS \"commercialVersionId\" FROM order_sale_adjustment_receipts WHERE operation_id=$1 AND sales_order_id=$2 AND status IN ('updated','unchanged') ORDER BY attempt DESC LIMIT 1",[operationId,item.salesOrderId])).rows[0];
  if(done){await c.query('COMMIT');return {salesOrderId:item.salesOrderId,...done,replayed:true};}
  const preview=await previewOne(c,a,item,command.rule);for(const color of await readPricingColors(c,item.salesOrderId))await c.query('INSERT INTO sales_order_color_identities(id,sales_order_id,business_key,color_name) VALUES($1,$2,$3,$4) ON CONFLICT(sales_order_id,business_key) DO NOTHING',[color.id,item.salesOrderId,color.businessKey,color.colorName]);
  const unchanged=preview.after.every((l,i)=>l.salePrice===preview.before[i].salePrice);
  const requestHash=productHash([operationId,item.salesOrderId]);const itemRequestId=`${requestHash.slice(0,8)}-${requestHash.slice(8,12)}-5${requestHash.slice(13,16)}-a${requestHash.slice(17,20)}-${requestHash.slice(20,32)}`;
  const next=unchanged?{id:preview.state.current!.id}:await appendLineCommercialVersion(c,{orderId:item.salesOrderId,version:preview.state.version+1,previousVersionId:preview.state.current!.id,actorId:a.internalUserId,requestId:itemRequestId,payloadHash:productHash({operationId,item}),reason:command.reason,lines:preview.after,changeKind:'sale_adjustment'});
  const attempt=Number((await c.query('SELECT coalesce(max(attempt),0)+1 n FROM order_sale_adjustment_receipts WHERE operation_id=$1 AND sales_order_id=$2',[operationId,item.salesOrderId])).rows[0].n);
  await c.query('INSERT INTO order_sale_adjustment_receipts(operation_id,sales_order_id,attempt,status,before_version_id,after_version_id) VALUES($1,$2,$3,$4,$5,$6)',[operationId,item.salesOrderId,attempt,unchanged?'unchanged':'updated',preview.state.current!.id,next.id]);
  await appendOperationLog(c,a,{module:'报价中心',action:'调整订单成交价',entityType:'OrderCommercialVersion',entityId:next.id,quoteId:preview.state.current!.quoteId,beforeData:{values:{commercialVersionId:preview.state.current!.id}},afterData:{values:{salesOrderId:item.salesOrderId,commercialVersionId:next.id}},metadata:{operationId,unchanged}});
  committing=true;await c.query('COMMIT');return {salesOrderId:item.salesOrderId,status:unchanged?'unchanged':'updated',commercialVersionId:next.id,replayed:false};
 }catch(e){let rollbackKnown=true;await c.query('ROLLBACK').catch(()=>{rollbackKnown=false;});
  const unverified=committing||!rollbackKnown,code=e instanceof HttpError?e.code:unverified?'commit_result_unverified':'sale_adjustment_failed';
  if(!unverified&&code!=='permission_denied')try{await pricingActor(c,actor,'quote.order_price.adjust');await c.query(`INSERT INTO order_sale_adjustment_receipts(operation_id,sales_order_id,attempt,status,code,before_version_id) SELECT $1,$2,coalesce(max(attempt),0)+1,'failed',$3,(SELECT current_version_id FROM sales_order_commercial_heads WHERE sales_order_id=$2) FROM order_sale_adjustment_receipts WHERE operation_id=$1 AND sales_order_id=$2`,[operationId,item.salesOrderId,code]);}catch{/* Unknown/unauthorized receipt writes never imply the price command committed. */}
  return {salesOrderId:item.salesOrderId,status:unverified?'unverified':'failed',code};
 }finally{c.release();}
}
export async function commitSaleAdjustment(pool:Pool,actor:TrustedIdentity,raw:Record<string,unknown>){
 const op=await createOperation(pool,actor,raw),items=[];for(const item of op.command.items)items.push(await consumeAdjustment(pool,actor,op.id,op.command,item));return {operationId:op.id,items};
}
export async function readSaleAdjustmentReceipt(pool:Pool,actor:TrustedIdentity,requestId:string){
 if(!identityUuid.test(requestId))pricingFail(400,'invalid_price_request_id');const c=await pool.connect();try{const a=await requireOrderCommandActor(c,actor,'order.view');requirePermission(a.permissions,'quote.view');
 const op=(await c.query('SELECT id::text,command_plan FROM order_sale_adjustment_operations WHERE actor_id=$1 AND request_id=$2',[a.internalUserId,requestId])).rows[0];if(!op)return {state:'not_found' as const,requestId,items:[] as PriceReceipt[]};
 const receipts=(await c.query<PriceReceipt>('SELECT DISTINCT ON(sales_order_id) sales_order_id::text AS "salesOrderId",status,code,after_version_id::text AS "commercialVersionId" FROM order_sale_adjustment_receipts WHERE operation_id=$1 ORDER BY sales_order_id,attempt DESC',[op.id])).rows;
 const items:PriceReceipt[]=(op.command_plan as Item[]).map(item=>receipts.find(r=>r.salesOrderId===item.salesOrderId)??{salesOrderId:item.salesOrderId,status:'pending'});
 return {state:items.some(i=>i.status==='pending')?'pending' as const:'recorded' as const,operationId:op.id,requestId,items};
 }finally{c.release();}
}
export async function resumeSaleAdjustment(pool:Pool,actor:TrustedIdentity,requestId:string){
 if(!identityUuid.test(requestId))pricingFail(400,'invalid_price_request_id');const c=await pool.connect();let op;
 try{const a=await pricingActor(c,actor,'quote.order_price.adjust');op=(await c.query('SELECT reason,rule,command_plan FROM order_sale_adjustment_operations WHERE actor_id=$1 AND request_id=$2',[a.internalUserId,requestId])).rows[0];}finally{c.release();}
 if(!op)pricingFail(404,'price_request_not_found');return commitSaleAdjustment(pool,actor,{requestId,reason:op.reason,rule:op.rule,items:op.command_plan});
}
export async function listQuoteOrderPrices(pool:Pool,actor:TrustedIdentity,params:URLSearchParams){
 requirePermission(actor.permissions,'quote.view');requirePermission(actor.permissions,'order.view');const quoteId=params.get('quoteId')??'',search=params.get('search')??'',offset=Number(params.get('offset')??0);
 if([...params.keys()].some(k=>!['quoteId','search','offset'].includes(k)||params.getAll(k).length!==1)||!Number.isSafeInteger(offset)||offset<0||search.length>200||quoteId.length>256)pricingFail(400,'invalid_quote_order_query');
 const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const rows=(await c.query(`SELECT o.id::text,o.order_no AS "orderNo",o.lifecycle_state AS lifecycle,v.quote_id AS "quoteId",v.revision_id AS "revisionId",v.version,(attribution.effective_order_id IS NOT NULL AND attribution.effective_order_id<>o.id) AS "historicalDuplicate" FROM sales_orders o LEFT JOIN sales_order_effective_identities attribution ON attribution.original_order_id=o.id JOIN sales_order_commercial_heads h ON h.sales_order_id=o.id JOIN sales_order_commercial_versions v ON v.id=h.current_version_id WHERE v.quote_type='distribution' AND ($1='' OR v.quote_id=$1) AND ($2='' OR concat_ws(' ',o.order_no,o.id::text,(SELECT m.style_no FROM ainuoke_sales_order_contract_mirrors m WHERE m.sales_order_id=o.id),(SELECT m.sales_contract_no FROM ainuoke_sales_order_contract_mirrors m WHERE m.sales_order_id=o.id)) ILIKE $3) ORDER BY o.order_no DESC LIMIT 21 OFFSET $4`,[quoteId,search,'%'+search.replace(/[\\%_]/gu,'\\$&')+'%',offset])).rows;
 const items:QuoteOrderPriceRow[]=[];for(const row of rows.slice(0,20)){const state=await readOrderCommercialState(c,row.id);items.push({...row,pricing:state.current?.lines?projectPricingLines(actor,state.current.lines):[],sale:actor.permissions.includes('commercial.sale.view')?state.current?.salePrice:undefined,editable:!row.historicalDuplicate&&!['completed','cancelled'].includes(row.lifecycle)});}await c.query('COMMIT');return {items,hasMore:rows.length>20,offset};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

/** Read this exact historical version; never reconstruct old colors from today's source. */
async function readHistoricalPricing(pool:Pool,actor:TrustedIdentity,orderId:string,versionId:string|null):Promise<ReturnType<typeof projectPricingLines>>{
 if(!versionId)return [];
 const lines=await readCommercialLines(pool,orderId,versionId);if(lines.length)return projectPricingLines(actor,lines);
 const row=(await pool.query('SELECT price_version_id,confirmed_sale_price::text sale,confirmed_labor_price::text labor,labor_currency FROM sales_order_commercial_versions WHERE id=$1 AND sales_order_id=$2',[versionId,orderId])).rows[0];if(!row)return [];
 return [{colorId:null,colorName:'历史统一价',quantity:null,priceVersionId:row.price_version_id,priceVersionName:'历史方案',sale:actor.permissions.includes('commercial.sale.view')?{visibility:'allowed',value:{price:row.sale,basePrice:row.sale,currency:'CNY'}}:{visibility:'restricted'},labor:actor.permissions.includes('commercial.labor.view')?{visibility:'allowed',value:{price:row.labor,currency:row.labor_currency}}:{visibility:'restricted'}}];
}

export async function readSaleAdjustmentHistory(pool:Pool,actor:TrustedIdentity,params:URLSearchParams){
 requirePermission(actor.permissions,'quote.view');requirePermission(actor.permissions,'order.view');const orderId=params.get('salesOrderId')??'',quoteId=params.get('quoteId')??'',operationId=params.get('operationId')??'',offset=Number(params.get('offset')??0);
 if([...params.keys()].some(k=>!['salesOrderId','quoteId','operationId','offset'].includes(k)||params.getAll(k).length!==1)||(orderId&&!identityUuid.test(orderId))||(operationId&&!identityUuid.test(operationId))||quoteId.length>256||!Number.isSafeInteger(offset)||offset<0)pricingFail(400,'invalid_price_history_query');
 const rows=(await pool.query(`SELECT op.id::text AS "operationId",op.created_at::text AS "createdAt",op.reason,op.rule,u.display_name AS actor,r.sales_order_id::text AS "salesOrderId",o.order_no AS "orderNo",r.status,r.before_version_id::text AS "beforeVersionId",r.after_version_id::text AS "afterVersionId",v.quote_id AS "quoteId" FROM order_sale_adjustment_operations op JOIN app_users u ON u.id=op.actor_id JOIN order_sale_adjustment_receipts r ON r.operation_id=op.id JOIN sales_orders o ON o.id=r.sales_order_id LEFT JOIN sales_order_commercial_versions v ON v.id=coalesce(r.after_version_id,r.before_version_id) WHERE ($1='' OR r.sales_order_id::text=$1) AND ($2='' OR v.quote_id=$2) AND ($3='' OR op.id::text=$3) ORDER BY op.created_at DESC,op.id,r.sales_order_id LIMIT 51 OFFSET $4`,[orderId,quoteId,operationId,offset])).rows;
 const items:PriceHistoryRow[]=[];for(const row of rows.slice(0,50)){
  const before=await readHistoricalPricing(pool,actor,row.salesOrderId,row.beforeVersionId),after=await readHistoricalPricing(pool,actor,row.salesOrderId,row.afterVersionId);
  items.push({...row,reason:actor.permissions.includes('commercial.sale.view')&&actor.permissions.includes('commercial.labor.view')?row.reason:undefined,rule:actor.permissions.includes('commercial.sale.view')?row.rule:undefined,before,after});
 }return {items,hasMore:rows.length>50,offset};
}

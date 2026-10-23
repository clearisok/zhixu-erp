import {readStableOrderColors} from './color-identities.js';
import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {HttpError} from '../http/errors.js';
import {requirePermission} from '../auth/permissions.js';
import {readCommercialCandidate,type CommercialCandidate} from './commercial-source.js';
import {quoteProductSnapshot,productHash,type ProductSnapshot} from './product-snapshot.js';
import {requireOrderCommandActor,requireVerifiedOrderBusiness} from './identity-service.js';
import {lockEffectiveAttribution,requireEffectiveOrderForWrite,freezePhysicalOrderGroups} from './effective-attribution.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {orderCommandControlError} from './command-control.js';
import {identityUuid} from './identity-model.js';

type Queryable=Pick<Pool|PoolClient,'query'>;
export function pricingFail(status:number,code:string):never{throw new HttpError(status,code,code);}
export async function readPricingColors(c:Queryable,orderId:string){
 return readStableOrderColors(c,orderId);
}
export type CommercialLine={colorId:string|null;colorName:string|null;quantity:string|null;priceVersionId:string;priceVersionName:string;source:CommercialCandidate;product:ProductSnapshot;productHash:string;baseSalePrice:string|null;salePrice:string|null;laborPrice:string;laborCurrency:'CNY'|'USD'};
export async function readCommercialLines(c:Queryable,orderId:string,versionId:string):Promise<CommercialLine[]>{
 const rows=(await c.query(`SELECT color_id::text AS "colorId",color_name AS "colorName",quantity_snapshot::text AS quantity,price_version_id AS "priceVersionId",price_version_name AS "priceVersionName",source_snapshot AS source,product_snapshot AS product,product_hash AS "productHash",base_sale_price::text AS "baseSalePrice",actual_sale_price::text AS "salePrice",labor_price::text AS "laborPrice",labor_currency AS "laborCurrency" FROM sales_order_commercial_lines WHERE sales_order_id=$1 AND commercial_version_id=$2 ORDER BY position`,[orderId,versionId])).rows;
 return rows as CommercialLine[];
}
export function projectPricingLines(actor:TrustedIdentity,lines:CommercialLine[]){
 return lines.map(l=>({colorId:l.colorId,colorName:l.colorName,quantity:l.quantity,priceVersionId:l.priceVersionId,priceVersionName:l.priceVersionName,
  sale:actor.permissions.includes('commercial.sale.view')?{visibility:'allowed' as const,value:{price:l.salePrice,basePrice:l.baseSalePrice,currency:'CNY' as const}}:{visibility:'restricted' as const},
  labor:actor.permissions.includes('commercial.labor.view')?{visibility:'allowed' as const,value:{price:l.laborPrice,currency:l.laborCurrency}}:{visibility:'restricted' as const}}));
}
export function pricingMode(lines:CommercialLine[]){return new Set(lines.map(l=>l.salePrice)).size<=1?'uniform' as const:'by_color' as const;}
const sameValue=(values:(string|null)[])=>new Set(values).size===1?values[0]:null;
export async function appendLineCommercialVersion(c:PoolClient,input:{orderId:string;version:number;previousVersionId:string|null;actorId:string;requestId:string;payloadHash:string;reason:string;lines:CommercialLine[];changeKind:'source_adoption'|'sale_adjustment'|'source_replacement'}){
 const {lines,orderId}=input;if(!lines.length)pricingFail(409,'commercial_lines_required');
 const first=lines[0].source;
 if(lines.some(l=>l.source.quoteId!==first.quoteId||l.source.revisionId!==first.revisionId||l.source.quoteType!==first.quoteType))pricingFail(409,'commercial_line_provenance_conflict');
 const id=(await c.query(`INSERT INTO sales_order_commercial_versions(sales_order_id,version,actor_id,request_id,payload_hash,quote_id,revision_id,price_version_id,source_quote_version,source_kind,source_confirmed_at,source_fingerprint,quote_type,confirmed_sale_price,confirmed_labor_price,labor_currency,reason,pricing_scope,change_kind,previous_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'line_items',NULL,$10,$11,$12,$13,$14,$15,'line_items',$16,$17) RETURNING id::text`,[orderId,input.version,input.actorId,input.requestId,input.payloadHash,first.quoteId,first.revisionId,sameValue(lines.map(l=>l.priceVersionId)),first.quoteVersion,productHash(lines),first.quoteType,sameValue(lines.map(l=>l.salePrice)),(new Set(lines.map(l=>l.laborCurrency)).size===1?sameValue(lines.map(l=>l.laborPrice)):null),first.laborCurrency,input.reason,input.changeKind,input.previousVersionId])).rows[0].id as string;
 for(const [position,l] of lines.entries())await c.query(`INSERT INTO sales_order_commercial_lines(sales_order_id,commercial_version_id,position,color_id,color_name,quantity_snapshot,price_version_id,price_version_name,source_snapshot,product_snapshot,product_hash,base_sale_price,actual_sale_price,labor_price,labor_currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[orderId,id,position,l.colorId,l.colorName,l.quantity,l.priceVersionId,l.priceVersionName,l.source,l.product,l.productHash,l.baseSalePrice,l.salePrice,l.laborPrice,l.laborCurrency]);
 const productSnapshot={schemaVersion:'order-product.v2',quoteCode:lines[0].product.quoteCode,revision:lines[0].product.revision,priceVersions:lines.map(l=>({colorId:l.colorId,product:l.product}))};
 await c.query(`INSERT INTO sales_order_business_source_snapshots(commercial_version_id,sales_order_id,kind,product_snapshot,product_hash) VALUES($1,$2,'quote',$3,$4)`,[id,orderId,productSnapshot,productHash(productSnapshot)]);
 await c.query('INSERT INTO sales_order_commercial_heads(sales_order_id,current_version_id,version) VALUES($1,$2,$3) ON CONFLICT(sales_order_id) DO UPDATE SET current_version_id=EXCLUDED.current_version_id,version=EXCLUDED.version',[orderId,id,input.version]);
 return {id};
}
export async function pricingTarget(c:PoolClient,id:string){
 if(!identityUuid.test(id))pricingFail(400,'invalid_order_id');await requireEffectiveOrderForWrite(c,id);await freezePhysicalOrderGroups(c,[id]);
 const business=await requireVerifiedOrderBusiness(c,id,true);if(['completed','cancelled'].includes(business.lifecycle_state))pricingFail(409,'order_commercial_frozen');return business;
}
export async function pricingActor(c:PoolClient,actor:TrustedIdentity,permission:'order.commercial.adopt'|'quote.order_price.adjust'){
 const a=await requireOrderCommandActor(c,actor,permission);requirePermission(a.permissions,'quote.view');
 if(permission==='order.commercial.adopt')requirePermission(a.permissions,'commercial.labor.view');
 requirePermission(a.permissions,'commercial.sale.view');if(permission==='quote.order_price.adjust')requirePermission(a.permissions,'commercial.sale.edit');return a;
}
type Selection={kind:'quote';quoteId:string;revisionId:string;priceVersionId?:string;assignments?:{colorId:string;priceVersionId:string}[]};
export function parseColorSelection(raw:Record<string,unknown>):Selection{
 if(raw.kind==='reorder')pricingFail(410,'reorder_source_retired');
 const allowed=['kind','quoteId','revisionId','priceVersionId','assignments'];
 if(raw.kind!=='quote'||Object.keys(raw).some(k=>!allowed.includes(k))||['quoteId','revisionId'].some(k=>typeof raw[k]!=='string'||!(raw[k] as string).trim()||(raw[k] as string).length>256))pricingFail(400,'invalid_business_source_selection');
 if(raw.assignments!==undefined&&(!Array.isArray(raw.assignments)||raw.assignments.length>1000||raw.assignments.some(v=>!v||typeof v!=='object'||Object.keys(v).sort().join(',')!=='colorId,priceVersionId'||!identityUuid.test(v.colorId)||typeof v.priceVersionId!=='string'||!v.priceVersionId||v.priceVersionId.length>256)))pricingFail(400,'invalid_color_assignments');
 if(raw.priceVersionId!==undefined&&(typeof raw.priceVersionId!=='string'||!raw.priceVersionId||raw.priceVersionId.length>256))pricingFail(400,'invalid_business_source_selection');
 if(raw.priceVersionId!==undefined&&raw.assignments!==undefined)pricingFail(400,'invalid_business_source_selection');
 return raw as Selection;
}
async function selectedLines(c:PoolClient,id:string,selection:Selection){
 const colors=await readPricingColors(c,id);if(colors.some(v=>v.ambiguous))pricingFail(409,'order_color_identity_ambiguous');
 const assignments=colors.length?colors.map(color=>({color,priceVersionId:selection.assignments?.find(a=>a.colorId===color.id)?.priceVersionId??selection.priceVersionId})): [{color:null,priceVersionId:selection.priceVersionId}];
 if(selection.assignments&&(new Set(selection.assignments.map(a=>a.colorId)).size!==selection.assignments.length||selection.assignments.length!==colors.length||selection.assignments.some(a=>!colors.some(c=>c.id===a.colorId))))pricingFail(409,'order_colors_changed');
 if(assignments.some(a=>!a.priceVersionId))pricingFail(409,'order_color_price_mapping_required');
 const candidates=new Map<string,{source:CommercialCandidate;product:ProductSnapshot;hash:string}>();
 for(const pv of [...new Set(assignments.map(a=>a.priceVersionId!))].sort()){
  const source=await readCommercialCandidate(c,{quoteId:selection.quoteId,revisionId:selection.revisionId,priceVersionId:pv}),product=await quoteProductSnapshot(c,source);candidates.set(pv,{source,product:product.productSnapshot,hash:product.productHash});
 }
 return assignments.map(({color,priceVersionId}):CommercialLine=>{const v=candidates.get(priceVersionId!)!;return {colorId:color?.id??null,colorName:color?.colorName??null,quantity:color?.quantity??null,priceVersionId:priceVersionId!,priceVersionName:String(v.product.priceVersion.name??''),source:v.source,product:v.product,productHash:v.hash,baseSalePrice:v.source.salePrice,salePrice:v.source.salePrice,laborPrice:v.source.laborPrice,laborCurrency:v.source.laborCurrency};});
}
function requireSourceContext(actor:TrustedIdentity,businessType:string,head:{quote_id:string}|undefined,quoteContextId?:string){
 if(quoteContextId){
  if(businessType==='processing')pricingFail(409,'processing_order_source_fixed_by_batch');
  requirePermission(actor.permissions,'quote.order_price.adjust');
  requirePermission(actor.permissions,'commercial.sale.edit');
  if(head?.quote_id!==quoteContextId)pricingFail(409,'quote_order_context_changed');
 }else if(head)pricingFail(409,'source_change_requires_quote_center');
}
export async function previewColorSource(pool:Pool,actor:TrustedIdentity,id:string,raw:Record<string,unknown>,quoteContextId?:string){
 const selection=parseColorSelection(raw),c=await pool.connect();try{await c.query('BEGIN');await lockEffectiveAttribution(c);const a=await pricingActor(c,actor,'order.commercial.adopt');const business=await pricingTarget(c,id);
 const head=(await c.query('SELECT h.version,h.current_version_id::text,v.quote_id FROM sales_order_commercial_heads h JOIN sales_order_commercial_versions v ON v.id=h.current_version_id WHERE h.sales_order_id=$1',[id])).rows[0];
 requireSourceContext(a,business.businessType,head,quoteContextId);
 const lines=await selectedLines(c,id,selection);if((business.businessType==='processing')!==(lines[0].source.quoteType==='processing'))pricingFail(409,'order_quote_business_type_conflict');
 const fingerprint=productHash({selection,lines});await c.query('ROLLBACK');return {version:Number(head?.version??0),selection,fingerprint,pricingMode:pricingMode(lines),lines:projectPricingLines(a,lines),quoteCode:lines[0].product.quoteCode,revisionLabel:String(lines[0].product.revision.revisionLabel??'')};
 }catch(e){await c.query('ROLLBACK');throw orderCommandControlError(e);}finally{c.release();}
}
export async function adoptColorSource(pool:Pool,actor:TrustedIdentity,id:string,raw:Record<string,unknown>,quoteContextId?:string){
 const keys=['selection','requestId','expectedVersion','fingerprint','reason'];if(Object.keys(raw).sort().join(',')!==keys.sort().join(',')||!raw.selection||typeof raw.selection!=='object'||Array.isArray(raw.selection)||!identityUuid.test(String(raw.requestId))||!Number.isSafeInteger(raw.expectedVersion)||Number(raw.expectedVersion)<0||(!quoteContextId&&raw.expectedVersion!==0)||typeof raw.fingerprint!=='string'||!/^([a-f0-9]{64})$/u.test(raw.fingerprint)||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>2000)pricingFail(400,'invalid_business_source_command');
 const selection=parseColorSelection(raw.selection as Record<string,unknown>),hash=productHash({orderId:id,raw,...(quoteContextId?{quoteContextId}:{})}),c=await pool.connect();try{
  await c.query('BEGIN');await lockEffectiveAttribution(c);const a=await pricingActor(c,actor,'order.commercial.adopt');
  if(quoteContextId){requirePermission(a.permissions,'quote.order_price.adjust');requirePermission(a.permissions,'commercial.sale.edit');}
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['order-commercial-request:'+a.internalUserId+':'+raw.requestId]);
  const old=(await c.query('SELECT id::text,payload_hash FROM sales_order_commercial_versions WHERE actor_id=$1 AND request_id=$2',[a.internalUserId,raw.requestId])).rows[0];if(old){if(old.payload_hash!==hash)pricingFail(409,'business_source_retry_mismatch');await c.query('COMMIT');return {commercialVersionId:old.id,replayed:true};}
  const business=await pricingTarget(c,id),head=(await c.query('SELECT h.version,h.current_version_id::text,v.quote_id FROM sales_order_commercial_heads h JOIN sales_order_commercial_versions v ON v.id=h.current_version_id WHERE h.sales_order_id=$1',[id])).rows[0];
  requireSourceContext(a,business.businessType,head,quoteContextId);
  if(Number(head?.version??0)!==raw.expectedVersion)pricingFail(409,'order_commercial_version_conflict');
  const lines=await selectedLines(c,id,selection);if(productHash({selection,lines})!==raw.fingerprint)pricingFail(409,'business_source_changed');if((business.businessType==='processing')!==(lines[0].source.quoteType==='processing'))pricingFail(409,'order_quote_business_type_conflict');
  for(const color of await readPricingColors(c,id))await c.query('INSERT INTO sales_order_color_identities(id,sales_order_id,business_key,color_name) VALUES($1,$2,$3,$4) ON CONFLICT(sales_order_id,business_key) DO NOTHING',[color.id,id,color.businessKey,color.colorName]);
  const version=Number(raw.expectedVersion)+1,next=await appendLineCommercialVersion(c,{orderId:id,version,previousVersionId:head?.current_version_id??null,actorId:a.internalUserId,requestId:String(raw.requestId),payloadHash:hash,reason:String(raw.reason),lines,changeKind:quoteContextId?'source_replacement':'source_adoption'});
  await appendOperationLog(c,a,{module:quoteContextId?'报价中心':'订单中心',action:'维护订单业务来源',entityType:'OrderCommercialVersion',entityId:next.id,quoteId:selection.quoteId,afterData:{values:{salesOrderId:id,version}},metadata:{businessSource:'quote',colorCount:lines.length}});await c.query('COMMIT');return {commercialVersionId:next.id,replayed:false};
 }catch(e){await c.query('ROLLBACK');throw orderCommandControlError(e);}finally{c.release();}
}


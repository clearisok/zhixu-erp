import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {readBusinessSources} from './business-source.js';
import {businessValues,type BusinessColumn,type BusinessSource} from '../../features/quote-center/model/quote-business-view.js';
import {readQuoteAggregateInTransaction} from './repository.js';
import {readCommercialCandidate} from '../sales-orders/commercial-source.js';

export async function listOrderSourceQuotes(pool:Pool,actor:TrustedIdentity,params:URLSearchParams){
 requirePermission(actor.permissions,'quote.view');
 for(const k of params.keys())if(!['search','offset','type'].includes(k)||params.getAll(k).length!==1)throw new HttpError(400,'invalid_source_candidates','Invalid query');
 const search=params.get('search')??'',type=params.get('type')??'distribution',offset=Number(params.get('offset')??0);
 if(search.length>200||!Number.isSafeInteger(offset)||offset<0||offset>100000||!['distribution','processing'].includes(type))throw new HttpError(400,'invalid_source_candidates','Invalid query');
 const tokens=search.trim().split(/\s+/u).filter(Boolean).map(t=>'%'+t.replace(/[\\%_]/gu,'\\$&')+'%');
 const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const rows=(await c.query(`SELECT q.id,q.quote_code AS "quoteCode",q.default_revision_id AS "revisionId",q.version,q.metadata->>'aggregateStatus' AS status,r.metadata->>'revisionLabel' AS "revisionLabel",r.metadata->'baseInfo' AS "baseInfo" FROM quote_center_quotes q JOIN quote_center_revisions r ON r.quote_id=q.id AND r.id=q.default_revision_id WHERE q.metadata->>'deletedAt' IS NULL AND r.metadata->'baseInfo'->>'quoteType'=$2 AND NOT EXISTS(SELECT 1 FROM unnest($1::text[]) token WHERE concat_ws(' ',q.quote_code,r.metadata->'baseInfo'->>'quoteStyleNo',r.metadata->'baseInfo'->>'styleName',r.metadata->'baseInfo'->>'brandName',r.metadata->'baseInfo'->>'salespersonName') NOT ILIKE token) ORDER BY q.quote_code DESC,q.id LIMIT 21 OFFSET $3`,[tokens,type,offset])).rows;
 const keys:BusinessColumn[]=['quantity'];if(actor.permissions.includes('commercial.labor.view'))keys.push('confirmedLabor');if(actor.permissions.includes('commercial.sale.view'))keys.push('confirmedGarment');if(actor.permissions.includes('commercial.sale.view')&&actor.permissions.includes('quote.cost.view'))keys.push('garmentPrice');
 const loaded=await readBusinessSources(c,rows as Omit<BusinessSource,'versions'>[],keys);
 const items=loaded.sources.slice(0,20).map(s=>({id:s.id,quoteCode:s.quoteCode,version:s.version,revisionId:s.revisionId,revisionLabel:s.revisionLabel,styleNo:s.baseInfo.quoteStyleNo,styleName:s.baseInfo.styleName,brand:s.baseInfo.brandName,deliveryDate:s.baseInfo.garmentLeadDate,business:businessValues(s,keys)}));
 await c.query('COMMIT');return {items,hasMore:rows.length>20,offset};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function readOrderSourceOptions(pool:Pool,actor:TrustedIdentity,quoteId:string){
 requirePermission(actor.permissions,'quote.view');const c=await pool.connect();try{await c.query('BEGIN');
 const record=await readQuoteAggregateInTransaction(c,quoteId);if(!record||record.quote.deletedAt)throw new HttpError(404,'quote_not_available','Quote unavailable');
 const revisions=[];
 for(const r of record.quote.revisions){if(r.readOnly&&!actor.permissions.includes('quote.revision.view'))continue;
  const versions=[];for(const pv of [...r.priceVersions].sort((a,b)=>a.id.localeCompare(b.id))){
   let confirmed=false;let sale:string|null=null,labor:string|null=null;
   try{const candidate=await readCommercialCandidate(c,{quoteId,revisionId:r.revisionId,priceVersionId:pv.id});confirmed=true;if(actor.permissions.includes('commercial.sale.view'))sale=candidate.salePrice;if(actor.permissions.includes('commercial.labor.view'))labor=candidate.laborPrice;}catch(e){if(!(e instanceof HttpError)||e.status!==409)throw e;}
   versions.push({id:pv.id,name:pv.name,confirmed,salePrice:sale,laborPrice:labor,laborCurrency:actor.permissions.includes('commercial.labor.view')?pv.pricingParameters.laborCurrency:null});
  }revisions.push({id:r.revisionId,label:r.revisionLabel,type:r.baseInfo.quoteType,versions});
 }
 await c.query('ROLLBACK');return {quoteId,quoteCode:record.quote.quoteCode,version:record.version,defaultRevisionId:record.quote.defaultRevisionId,revisions};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

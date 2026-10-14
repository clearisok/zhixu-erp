import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { HttpError } from '../http/errors.js';
import { canonicalDecimal } from '../quotes/model.js';
import { readQuoteAggregateInTransaction } from '../quotes/repository.js';
import { findTermsByQuoteProvenance, lockQuoteTermsContext, type QuoteProvenance } from '../confirmed-commercial-terms/repository.js';

export type CommercialCandidate = QuoteProvenance & {
 quoteVersion:number;quoteType:'distribution'|'processing';sourceKind:'cct'|'quote_confirmation';
 sourceCctId:string|null;sourceCctVersion:number|null;sourceConfirmedAt:string;
 salePrice:string|null;saleCurrency:'CNY';laborPrice:string;laborCurrency:'CNY'|'USD';fingerprint:string;
};
function invalid(code:string):never{throw new HttpError(409,code,code);}
function amount(value:unknown):string{
 if(typeof value!=='string'||value.length>2000||!/^\d+(?:\.\d+)?$/u.test(value))invalid('commercial_confirmation_required');
 return canonicalDecimal(value);
}
export function parseCommercialProvenance(raw:Record<string,unknown>):QuoteProvenance {
 const keys=['quoteId','revisionId','priceVersionId'];
 if(Object.keys(raw).length!==3||keys.some(key=>typeof raw[key]!=='string'||!(raw[key] as string).trim()||(raw[key] as string).length>256))throw new HttpError(400,'invalid_quote_provenance','Invalid quote identity');
 return {quoteId:raw.quoteId as string,revisionId:raw.revisionId as string,priceVersionId:raw.priceVersionId as string};
}
/** Caller owns a transaction and authorization. Terms lock then Quote row, matching existing writers. */
export async function readCommercialCandidate(client:PoolClient,provenance:QuoteProvenance):Promise<CommercialCandidate>{
 provenance=parseCommercialProvenance(provenance);
 await lockQuoteTermsContext(client,provenance);
 const locked=await client.query('SELECT version FROM quote_center_quotes WHERE id=$1 FOR SHARE',[provenance.quoteId]);
 if(!locked.rowCount)invalid('quote_not_found');
 const record=await readQuoteAggregateInTransaction(client,provenance.quoteId);
 if(!record)invalid('quote_not_found');
 if(record.quote.deletedAt)invalid('quote_not_available');
 const revision=record.quote.revisions.find(r=>r.revisionId===provenance.revisionId);
 if(!revision)invalid('quote_revision_not_found');
 const pv=revision.priceVersions.find(p=>p.id===provenance.priceVersionId);
 if(!pv)invalid('quote_price_version_not_found');
 const terms=await findTermsByQuoteProvenance(client,provenance);
 // A missing source value never falls back to the other source or to a calculated quote price.
 const confirmation=pv.confirmation;
 if(!terms&&!confirmation)invalid('commercial_confirmation_required');
 const laborPrice=amount(terms?terms.confirmed_labor_price:confirmation?.confirmedLaborPrice);
 const rawSale=terms?terms.customer_confirmed_price:confirmation?.confirmedGarmentPrice;
 const laborCurrency=terms?terms.labor_currency:pv.pricingParameters.laborCurrency;
 if(laborCurrency!=='CNY'&&laborCurrency!=='USD')invalid('commercial_currency_required');
 if(laborCurrency!==pv.pricingParameters.laborCurrency)invalid('commercial_source_currency_conflict');
 const quoteType=revision.baseInfo.quoteType;
 if(quoteType!=='distribution'&&quoteType!=='processing')invalid('unsupported_quote_type');
 if(quoteType==='processing'&&rawSale!==null)invalid('processing_sale_price_not_applicable');
 const sourceConfirmedAt=terms?terms.updated_at.toISOString():confirmation!.confirmedAt;
 if(!sourceConfirmedAt||!Number.isFinite(Date.parse(sourceConfirmedAt)))invalid('commercial_confirmation_time_required');
 const values={...provenance,quoteVersion:record.version,quoteType,sourceKind:terms?'cct' as const:'quote_confirmation' as const,
 sourceCctId:terms?.id??null,sourceCctVersion:terms?.version??null,sourceConfirmedAt,
 salePrice:quoteType==='distribution'?amount(rawSale):null,saleCurrency:'CNY' as const,laborPrice,laborCurrency};
 return {...values,fingerprint:createHash('sha256').update(JSON.stringify(values)).digest('hex')};
}

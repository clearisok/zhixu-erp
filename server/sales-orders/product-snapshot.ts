import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {HttpError} from '../http/errors.js';
import {readQuoteAggregateInTransaction} from '../quotes/repository.js';
import type {CommercialCandidate} from './commercial-source.js';

export type ProductSnapshot={schemaVersion:'order-product.v1';quoteCode:string;revision:Record<string,unknown>;priceVersion:Record<string,unknown>};
export type BusinessSourceSnapshot={kind:'quote'|'reorder';referenceOrderId:string|null;referenceCommercialVersionId:string|null;productSnapshot:ProductSnapshot;productHash:string};
export const productHash=(value:unknown):string=>{
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])):v;
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
};
/** Internal snapshot only. Cost fields must never be returned without projection. */
export async function quoteProductSnapshot(client:PoolClient,candidate:CommercialCandidate):Promise<BusinessSourceSnapshot>{
 const record=await readQuoteAggregateInTransaction(client,candidate.quoteId);
 const revision=record?.quote.revisions.find(r=>r.revisionId===candidate.revisionId);
 const priceVersion=revision?.priceVersions.find(p=>p.id===candidate.priceVersionId);
 if(!record||record.version!==candidate.quoteVersion||!revision||!priceVersion)throw new HttpError(409,'commercial_source_changed','Quote changed');
 const {priceVersions:omitted,...product}=revision;void omitted;
 const productSnapshot:ProductSnapshot={schemaVersion:'order-product.v1',quoteCode:record.quote.quoteCode,revision:structuredClone(product),priceVersion:structuredClone(priceVersion)};
 return {kind:'quote',referenceOrderId:null,referenceCommercialVersionId:null,productSnapshot,productHash:productHash(productSnapshot)};
}
export async function appendBusinessSourceSnapshot(client:PoolClient,orderId:string,commercialId:string,source:BusinessSourceSnapshot){
 await client.query(`INSERT INTO sales_order_business_source_snapshots(commercial_version_id,sales_order_id,kind,reference_order_id,reference_commercial_version_id,product_snapshot,product_hash) VALUES($1,$2,$3,$4,$5,$6,$7)`,[commercialId,orderId,source.kind,source.referenceOrderId,source.referenceCommercialVersionId,source.productSnapshot,source.productHash]);
}

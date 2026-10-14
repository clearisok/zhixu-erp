import type {Pool,PoolClient} from 'pg';
import {HttpError} from '../http/errors.js';
import {readQuoteAggregateInTransaction} from '../quotes/repository.js';
import {parseCommercialProvenance} from './commercial-source.js';
import type {QuoteProvenance} from '../confirmed-commercial-terms/repository.js';
type Queryable=Pick<Pool|PoolClient,'query'>;
export async function supportsPreparationAdoption(client:Queryable){return !!(await client.query("SELECT to_regclass('public.sales_order_preparation_adoptions') IS NOT NULL AS ready")).rows[0]?.ready;}
/** Intent records do not read CCT, confirmations or any amount. Root share lock follows existing aggregate writers. */
export async function readPreparationQuoteIntent(client:PoolClient,raw:QuoteProvenance){
 const source=parseCommercialProvenance(raw);
 const locked=(await client.query('SELECT version FROM quote_center_quotes WHERE id=$1 FOR SHARE',[source.quoteId])).rows[0];
 const record=locked?await readQuoteAggregateInTransaction(client,source.quoteId):null;
 if(!record||record.quote.deletedAt)throw new HttpError(409,'preparation_quote_unavailable','Proposed Quote unavailable');
 const revision=record.quote.revisions.find(r=>r.revisionId===source.revisionId);
 if(!revision?.priceVersions.some(p=>p.id===source.priceVersionId))throw new HttpError(409,'preparation_quote_context_mismatch','Exact proposed Quote context unavailable');
 if(revision.baseInfo.quoteType!=='distribution')throw new HttpError(409,'preparation_quote_type_conflict','Contract preparation requires distribution quote intent');
 return {...source,observedQuoteVersion:record.version};
}

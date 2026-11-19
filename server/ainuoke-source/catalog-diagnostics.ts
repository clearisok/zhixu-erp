import type {Pool} from 'pg';
import {currentSyncAudit} from './sync-audit.js';
import {hash,SourceError} from './contract.js';
import type {CatalogFieldDifference} from './catalog-consistency.js';
import {validateCatalogCheckpointPage} from './catalog-checkpoints.js';
import type {RequestDiagnostic} from './sync-diagnostics.js';

/** A retry is diagnostic + a NEW complete capture. Targeted pages alone can
 * never replace historical pages. They belong to the NEW before pass, whose
 * entire result must match a new complete after pass (offsets can move rows). */
export function recapturePagesFor(differences:readonly CatalogFieldDifference[]):number[]{
 return [...new Set(differences.flatMap(d=>[d.page,d.afterPage]))].sort((a,b)=>a-b);
}
export async function appendCatalogDiagnostic(pool:Pool,kind:'difference'|'recapture_page'|'decision',retry:number,decision:string,
 evidence:Record<string,unknown>,locator:{page?:number;rowId?:string;salesContractNo?:string;field?:string}={}){
 const ctx=currentSyncAudit();if(!ctx)throw new SourceError('catalog_diagnostic_context_missing');
 const inserted=await pool.query(`INSERT INTO ainuoke_catalog_diagnostics(batch_id,source_key,report_id,kind,page,row_id,sales_contract_no,field,retry_count,final_decision,evidence)
 VALUES($1,$2,'6086103',$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT DO NOTHING RETURNING id`,[ctx.id,ctx.sourceKey,kind,locator.page??null,locator.rowId??null,
 locator.salesContractNo??null,locator.field??null,retry,decision,JSON.stringify(evidence)]);
 if(kind==='recapture_page'&&!inserted.rowCount){
  const old=(await pool.query("SELECT evidence FROM ainuoke_catalog_diagnostics WHERE batch_id=$1 AND page=$2 AND kind='recapture_page'",[ctx.id,locator.page])).rows[0];
  if(!old||hash(old.evidence)!==hash(evidence))throw new SourceError('catalog_recapture_evidence_changed');
 }
}
export async function loadRecapturePages(pool:Pool,sourceKey:string,priorJobs:readonly string[]){
 if(!priorJobs.length)return [];
 const rows=(await pool.query('SELECT result FROM ainuoke_sync_jobs WHERE source_key=$1 AND id=ANY($2::uuid[]) AND status=\'failed\'',[sourceKey,priorJobs])).rows;
 return validatedRecapturePages(rows.flatMap(r=>r.result?.recapturePages??[]));
}
export function validatedRecapturePages(pages:unknown):number[]{
 if(!Array.isArray(pages)||pages.some(p=>!Number.isSafeInteger(p)||p<1||p>28))throw new SourceError('catalog_recapture_plan_invalid');
 const targets=[...new Set(pages)] as number[];if(targets.length>28)throw new SourceError('catalog_recapture_plan_invalid');
 return targets.sort((a,b)=>a-b);
}
/** Diagnostic write failure is secondary: NEVER replace the primary rejection
 * or permit publication. Caller records persistence=false in its main receipt. */
export async function retainCatalogDifferences(pool:Pool,differences:readonly CatalogFieldDifference[],trace:RequestDiagnostic[]|null,retry:number,decision:string){
 try{
  for(const d of differences){
   const reads=trace?.filter(t=>t.kind==='report'&&t.reportId===6086103&&(t.page===d.page||t.page===d.afterPage))??[];
   await appendCatalogDiagnostic(pool,'difference',retry,decision,{
    before_exists:d.beforeExists,after_exists:d.afterExists,before_type:d.beforeType,after_type:d.afterType,
    before_value:d.beforeValue,after_value:d.afterValue,before_hash:d.beforeHash,after_hash:d.afterHash,
    after_page:d.afterPage,classification:d.classification,values_redacted:d.valuesRedacted,
    before_fetched_at:d.beforeFetchedAt,after_fetched_at:d.afterFetchedAt,
    request_started_at:reads[0]?.startedAt??null,request_finished_at:reads.at(-1)?.finishedAt??null,
    requests:reads.map(t=>({page:t.page,started_at:t.startedAt??null,finished_at:t.finishedAt??null,
     outcome:t.outcome,http_status:t.httpStatus,response_is_ok:t.responseIsOk??null}))},d);
  }
  return true;
 }catch{return false;}
}
export function recapturePageHandler(pool:Pool,retry:number,now:()=>number=Date.now){
 return async(value:unknown)=>{
  const page=validateCatalogCheckpointPage(value,now());
  const rows=page.rows.map(row=>({row_id:String(row.values.id),sales_contract_no:row.values.BillNo,row_hash:hash(row.values),
   // Keep exact approved business field states; do not store names or unknown
   // fields that could contain PII. Hashes still bind the original response.
   values:Object.fromEntries(Object.entries(row.values).filter(([k])=>['Price','Num','Status','DeliveryDate','ContractDate','hsid'].includes(k)))}));
  await appendCatalogDiagnostic(pool,'recapture_page',retry,'targeted_read_not_publishable',{
   fetched_at:page.fetchedAt,total:page.total,page_size:page.pageSize,response_hash:hash(page),rows}, {page:page.page});
 };
}

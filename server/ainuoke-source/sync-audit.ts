import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {hash,sourceKeyValid,SourceError} from './contract.js';
import {SYNC_AUDIT_SOURCES} from './audit-sources.js';
import type {RequestDiagnostic} from './sync-diagnostics.js';
import {validateSyncPolicy} from './sync-schedule.js';

type DB=Pick<Pool|PoolClient,'query'>;
type Page={reportId:string;fetchedAt:string;page:number;total:number;queryContext:Record<string,unknown>;rows:{values:Record<string,unknown>}[]};
type Context={id:string;sourceKey:string};
const context=new AsyncLocalStorage<Context>();
/** Public operations must pin caller-owned input BEFORE the audit's first
 * await, preserving their original mutation/CAS boundary. Pool and callback
 * functions keep their identity; data objects are copied synchronously. */
export function pinSyncCall<T extends unknown[]>(args:T):T{
 const seen=new WeakMap<object,unknown>();
 const copy=(value:unknown):unknown=>{
  if(!value||typeof value!=='object')return value;
  if(seen.has(value))return seen.get(value);
  if(value instanceof Date)return new Date(value);
  if(Array.isArray(value)){const out:unknown[]=[];seen.set(value,out);for(const item of value)out.push(copy(item));return out;}
  if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return structuredClone(value);
  const out:Record<string,unknown>={};seen.set(value,out);
  for(const [key,item]of Object.entries(value))Object.defineProperty(out,key,{value:copy(item),enumerable:true,configurable:true,writable:true});
  return out;
 };
 return args.map((value,index)=>index===0?value:copy(value)) as T;
}
const safeCode=(e:unknown)=>e&&typeof e==='object'&&'code' in e&&typeof e.code==='string'&&/^[a-z0-9_]{1,100}$/.test(e.code)?e.code:'sync_result_unknown';
const safeRequest=(d:RequestDiagnostic)=>({kind:d.kind,reportId:d.reportId,page:d.page,elapsedMs:d.elapsedMs,outcome:d.outcome,httpStatus:d.httpStatus,
 ...(d.startedAt?{startedAt:d.startedAt}:{}),...(d.finishedAt?{finishedAt:d.finishedAt}:{}),
 ...(d.responseIsOk!==undefined?{responseIsOk:d.responseIsOk}:{}),...(d.receivedRows!==undefined?{receivedRows:d.receivedRows}:{}),
 ...(d.loginEvidence?{authenticationHint:d.loginEvidence.serverHint}:{}),
 ...(d.loginDetails?.text1&&/^-?\d{1,8}$/.test(d.loginDetails.text1)?{businessCode:d.loginDetails.text1}:{})});
export function auditPages(input:unknown):Page[]{
 const pages:Page[]=[];
 const visit=(x:unknown,depth:number)=>{
  if(depth>16||!x||typeof x!=='object')return;
  if(Array.isArray(x)){for(const child of x)visit(child,depth+1);return;}
  const v=x as Record<string,unknown>;
  const captured=v.fetchedAt??v.capturedAt;
  if(/^[0-9]{7}$/.test(String(v.reportId))&&Array.isArray(v.rows)&&typeof captured==='string'){
   pages.push({reportId:String(v.reportId),fetchedAt:captured,page:Number(v.page),total:Number(v.total??v.reportedTotal),
    queryContext:(v.queryContext??{}) as Record<string,unknown>,rows:v.rows.map(row=>({values:row.values??row}))});return;
  }
  for(const child of Object.values(v))visit(child,depth+1);
 };
 visit(input,0);return pages;
}
/** Audit identities are only for counting source records, never order matching.
 * A join without a unique stable tuple is reported as unknown, not guessed. */
export function auditRecordSet(pages:readonly Page[]){
 const records=new Map<string,string>();let duplicates=0,ambiguous=false;
 for(const page of pages)for(const row of page.rows){
  const values=row.values;
  const ownId=Object.keys(values).find(k=>k.toLowerCase()==='id');
  if(!ownId||values[ownId]===null||values[ownId]===''){ambiguous=true;continue;}
  const keys=String(page.reportId)==='6087051'?[ownId,'lx','cgmxid','rkmxid','cymxid','ckmxid']:[ownId];
  const ids=keys.filter(k=>Object.hasOwn(values,k)).map(k=>[k,values[k]===null?null:String(values[k]).normalize('NFKC').trim()] as const);
  const key=hash({query:page.queryContext,ids:Object.fromEntries(ids.sort(([a],[b])=>a.localeCompare(b)))}),content=hash(values);
  if(records.has(key)){if(records.get(key)!==content)ambiguous=true;else duplicates++;}else records.set(key,content);
 }
 return {records,duplicates,ambiguous};
}
export async function withSyncAudit<T>(pool:Pool,scope:{id?:string;sourceKey:string;type:string;contracts?:string[];jobIds?:string[];retries?:number;historical?:boolean;frequencies?:string[];reports?:string[]},fn:()=>Promise<T>):Promise<T>{
 if(!sourceKeyValid(scope.sourceKey))throw new SourceError('invalid_source_configuration');
 if(context.getStore()?.sourceKey===scope.sourceKey)return fn();
 // Never spend a source request when its durable ledger is unavailable.
 if(!(await pool.query("SELECT to_regclass('public.ainuoke_sync_audit_batches') IS NOT NULL AS enabled")).rows[0].enabled)throw new SourceError('sync_audit_migration_required');
 const id=scope.id??randomUUID();
 let policy=null;
 const configured=(await pool.query('SELECT policy FROM ainuoke_sync_controls WHERE source_key=$1',[scope.sourceKey])).rows[0];
 if(configured)try{policy=validateSyncPolicy(configured.policy);}catch{/* Do not copy unvalidated configuration into audit data. */}
 const inserted=await pool.query(`INSERT INTO ainuoke_sync_audit_batches(id,source_key,sync_type,contracts,job_ids,retry_count,origin,frequencies,policy_snapshot,api_requests,login_requests)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,CASE WHEN $7='historical' THEN 0 END,CASE WHEN $7='historical' THEN 0 END) ON CONFLICT DO NOTHING RETURNING id`,[id,scope.sourceKey,scope.type,scope.contracts??[],scope.jobIds??[],scope.retries??0,scope.historical?'historical':'live',scope.frequencies??[],policy?JSON.stringify(policy):null]);
 if(!inserted.rowCount)return fn(); // Existing request receipts are not overwritten.
 for(const report of scope.reports??[]){
  const definition=SYNC_AUDIT_SOURCES[report];
  if(!/^[0-9]{7}$/.test(report))throw new SourceError('sync_audit_report_invalid');
  await pool.query(`INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name,target_tables,api_requests,page_count,cursor_info)
   VALUES($1,$2,$3,$4,0,0,'{"planned":true,"complete":false}')`,[id,report,definition?.name??'未登记报表 '+report,definition?.targets??[]]);
 }
 return context.run({id,sourceKey:scope.sourceKey},async()=>{
  try{const result=await fn();await finishBatch(pool,id);return result;}
  catch(e){await pool.query(`UPDATE ainuoke_sync_audit_tables SET status='failed',error_code=coalesce(error_code,$2),failed_count=fetched_count
   WHERE batch_id=$1 AND status IN ('reading','acquired')`,[id,safeCode(e)]);
   await finishBatch(pool,id,safeCode(e));throw e;}
 });
}
async function finishBatch(db:DB,id:string,error?:string){
 await db.query("UPDATE ainuoke_sync_audit_tables SET error_code=coalesce(error_code,'commit_acknowledgement_missing') WHERE batch_id=$1 AND status='write_pending'",[id]);
 await db.query(`UPDATE ainuoke_sync_audit_tables t SET status='failed',error_code=coalesce(t.error_code,$2,b.error_code,'publication_not_completed')
  FROM ainuoke_sync_audit_batches b WHERE t.batch_id=b.id AND b.id=$1 AND t.status IN ('reading','acquired')`,[id,error??null]);
 await db.query(`WITH rollup AS (
  SELECT batch_id,report_id,min(source_name) AS source_name,jsonb_agg(target_tables) AS target_sets,jsonb_agg(publication_ids) AS publication_sets,
   min(read_started_at) AS read_start,max(read_completed_at) AS read_end,max(write_completed_at) AS write_end,
   CASE WHEN count(fetched_count)=count(*) THEN sum(fetched_count)::int END AS fetched,
   CASE WHEN count(inserted_count)=count(*) THEN sum(inserted_count)::int END AS inserted,
   CASE WHEN count(updated_count)=count(*) THEN sum(updated_count)::int END AS updated,
   CASE WHEN count(unchanged_count)=count(*) THEN sum(unchanged_count)::int END AS unchanged,
   CASE WHEN count(failed_count)=count(*) THEN sum(failed_count)::int END AS failed,
   CASE WHEN count(duplicate_count)=count(*) THEN sum(duplicate_count)::int END AS duplicates,sum(page_count)::int AS pages,
   CASE WHEN bool_and(status='success') THEN 'success' WHEN bool_or(status IN ('success','write_pending','partial')) THEN 'partial' ELSE 'failed' END AS status,
   min(error_code) AS error_code,jsonb_agg(contract_no) AS contracts,bool_and(status='success') AS complete
  FROM ainuoke_sync_audit_tables WHERE batch_id=$1 AND contract_no<>'' GROUP BY batch_id,report_id)
  INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name,target_tables,contract_no,read_started_at,read_completed_at,
   write_completed_at,read_time_basis,fetched_count,inserted_count,updated_count,unchanged_count,failed_count,duplicate_count,page_count,status,error_code,cursor_info,publication_ids)
  SELECT batch_id,report_id,source_name,ARRAY(SELECT DISTINCT v FROM jsonb_array_elements(target_sets) a CROSS JOIN LATERAL jsonb_array_elements_text(a.value) b(v)),
   '',read_start,read_end,write_end,'batch_report_span',fetched,inserted,updated,unchanged,failed,duplicates,pages,status,error_code,
   jsonb_build_object('scope','batch_report','contracts',contracts,'complete',complete),
   ARRAY(SELECT DISTINCT v FROM jsonb_array_elements(publication_sets) a CROSS JOIN LATERAL jsonb_array_elements_text(a.value) b(v)) FROM rollup
  ON CONFLICT(batch_id,report_id,contract_no) DO UPDATE SET read_started_at=coalesce(ainuoke_sync_audit_tables.read_started_at,excluded.read_started_at),
   read_completed_at=excluded.read_completed_at,write_completed_at=excluded.write_completed_at,read_time_basis='batch_report_span',
   fetched_count=excluded.fetched_count,inserted_count=excluded.inserted_count,updated_count=excluded.updated_count,unchanged_count=excluded.unchanged_count,
   failed_count=excluded.failed_count,duplicate_count=excluded.duplicate_count,page_count=excluded.page_count,status=excluded.status,error_code=excluded.error_code,
   cursor_info=ainuoke_sync_audit_tables.cursor_info||excluded.cursor_info,publication_ids=excluded.publication_ids,target_tables=excluded.target_tables`,[id]);
 await db.query(`WITH counts AS (
  SELECT d->>'reportId' AS report_id,count(*)::int AS requests,
   count(*) FILTER(WHERE d->>'outcome'='complete')::int AS completed,
   count(*) FILTER(WHERE d->>'outcome'='complete' AND d ? 'receivedRows')::int AS counted,
   sum((d->>'receivedRows')::int) FILTER(WHERE d->>'outcome'='complete')::int AS fetched
  FROM ainuoke_sync_audit_batches b CROSS JOIN LATERAL jsonb_array_elements(b.requests) d
  WHERE b.id=$1 AND d->>'kind'='report' GROUP BY d->>'reportId')
  UPDATE ainuoke_sync_audit_tables t SET api_requests=c.requests,page_count=c.completed,
   fetched_count=CASE WHEN c.counted>0 AND c.counted=c.completed THEN c.fetched ELSE t.fetched_count END,
   cursor_info=t.cursor_info||jsonb_build_object('fetchedCountBasis',CASE WHEN c.counted>0 AND c.counted=c.completed THEN 'actual_response_rows' ELSE 'verified_snapshot_rows' END)
  FROM counts c WHERE t.batch_id=$1 AND t.contract_no='' AND t.report_id=c.report_id`,[id]);
 await db.query(`UPDATE ainuoke_sync_audit_batches b SET finished_at=clock_timestamp(),error_code=coalesce($2,error_code),
  status=CASE WHEN EXISTS(SELECT 1 FROM ainuoke_sync_audit_tables t WHERE t.batch_id=b.id AND t.status IN ('partial','write_pending')) THEN 'partial' WHEN EXISTS(SELECT 1 FROM ainuoke_sync_audit_tables t WHERE t.batch_id=b.id AND t.status='success')
    THEN CASE WHEN $2::text IS NOT NULL OR EXISTS(SELECT 1 FROM ainuoke_sync_audit_tables t WHERE t.batch_id=b.id AND t.status<>'success') THEN 'partial' ELSE 'success' END
   ELSE 'failed' END WHERE b.id=$1`,[id,error??null]);
}
/** Called only after validated complete captures. Page fetchedAt is a read
 * completion timestamp, never a source modification time or a commit time. */
export async function auditAcquired(db:DB,input:unknown,diagnostics:RequestDiagnostic[]|null=null,contract=''){
 const ctx=context.getStore();if(!ctx)return;
 const pages=auditPages(input);
 for(const reportId of new Set(pages.map(p=>String(p.reportId)))){
  const selected=pages.filter(p=>String(p.reportId)===reportId),definition=SYNC_AUDIT_SOURCES[reportId];
  const trace=diagnostics?.filter(d=>d.kind==='report'&&String(d.reportId)===reportId)??[];
  const starts=contract?[]:trace.flatMap(d=>d.startedAt?[d.startedAt]:[]),ends=selected.map(p=>p.fetchedAt).sort();
  await db.query(`INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name,target_tables,read_started_at,read_completed_at,read_time_basis,fetched_count,page_count,api_requests,cursor_info,contract_no,status)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'acquired') ON CONFLICT(batch_id,report_id,contract_no) DO UPDATE SET
    read_started_at=coalesce(ainuoke_sync_audit_tables.read_started_at,excluded.read_started_at),read_completed_at=excluded.read_completed_at,
    fetched_count=excluded.fetched_count,page_count=excluded.page_count,api_requests=excluded.api_requests,status='acquired',error_code=NULL,cursor_info=excluded.cursor_info`,
   [ctx.id,reportId,definition?.name??'未登记报表 '+reportId,definition?.targets??[],starts.sort()[0]??null,ends.at(-1),starts.length?'request_trace':'page_completion_only',selected.reduce((n,p)=>n+p.rows.length,0),selected.length,contract?null:trace.length||null,
    JSON.stringify({pages:selected.map(p=>p.page),totals:[...new Set(selected.map(p=>p.total))],complete:true}),contract]);
 }
 if(diagnostics)await db.query('UPDATE ainuoke_sync_audit_batches SET api_requests=$2,login_requests=$3,requests=$4::jsonb WHERE id=$1',[ctx.id,diagnostics.length,diagnostics.filter(d=>d.kind==='login').length,JSON.stringify(diagnostics.map(safeRequest))]);
}
export async function auditCaptureFailure(db:DB,code:string,diagnostics:RequestDiagnostic[]|null){
 const ctx=context.getStore();if(!ctx)return;
 for(const reportId of new Set((diagnostics??[]).filter(d=>d.kind==='report').map(d=>String(d.reportId)))){
  if(!/^[0-9]{7}$/.test(reportId))continue;
  const trace=diagnostics!.filter(d=>String(d.reportId)===reportId),definition=SYNC_AUDIT_SOURCES[reportId];
  await db.query(`INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name,target_tables,read_started_at,read_completed_at,read_time_basis,api_requests,page_count,status,error_code,cursor_info)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,'failed',$9,$10) ON CONFLICT(batch_id,report_id,contract_no) DO NOTHING`,
   [ctx.id,reportId,definition?.name??'未登记报表 '+reportId,definition?.targets??[],trace[0].startedAt??null,null,trace[0].startedAt?'request_trace':'unavailable',trace.length,code,JSON.stringify({pages:trace.map(d=>d.page),complete:false})]);
 }
 await db.query('UPDATE ainuoke_sync_audit_batches SET error_code=$2,api_requests=coalesce($3,api_requests),login_requests=coalesce($4,login_requests),requests=coalesce($5::jsonb,requests) WHERE id=$1',[ctx.id,code,diagnostics?.length??null,diagnostics?.filter(d=>d.kind==='login').length??null,diagnostics?JSON.stringify(diagnostics.map(safeRequest)):null]);
}
/** Runs in the SAME business transaction as publication. Rollback cannot leave
 * a successful audit row or advance the comparison state. */
export async function auditPublished(db:DB,sourceKey:string,publication:string|string[],input:unknown,contract='',targets?:string[],replayed=false){
 const ctx=context.getStore();if(!ctx)return;
 const publicationIds=Array.isArray(publication)?publication:[publication],publicationId=publicationIds[0];
 if(contract)await db.query(`UPDATE ainuoke_sync_audit_batches SET contracts=ARRAY(SELECT DISTINCT unnest(contracts||ARRAY[$2::text])) WHERE id=$1`,[ctx.id,contract]);
 const pages=auditPages(input);
 for(const reportId of new Set(pages.map(p=>String(p.reportId)))){
  if((await db.query("SELECT 1 FROM ainuoke_sync_audit_tables WHERE batch_id=$1 AND report_id=$2 AND contract_no=$3 AND status='success'",[ctx.id,reportId,contract])).rowCount)continue;
  const selected=pages.filter(p=>String(p.reportId)===reportId),definition=SYNC_AUDIT_SOURCES[reportId];
  const {records,duplicates,ambiguous}=auditRecordSet(selected);
  const scope=contract||hash(selected[0].queryContext??{});
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`sync-audit:${sourceKey}:${reportId}:${scope}`]);
  let old=new Map((await db.query('SELECT record_key,content_hash FROM ainuoke_sync_audit_record_state WHERE source_key=$1 AND report_id=$2 AND scope_key=$3',[sourceKey,reportId,scope])).rows.map(r=>[r.record_key,r.content_hash]));
  if(!old.size&&definition?.targets.includes('ainuoke_material_source_snapshots')){
   const prior=(await db.query(`SELECT s.snapshots FROM ainuoke_material_source_snapshots s JOIN ainuoke_source_runs r ON r.id=s.run_id
    WHERE r.source_key=$1 AND s.sales_contract_no=$2 AND s.run_id::text<>$3 ORDER BY r.captured_at DESC LIMIT 1`,[sourceKey,contract,publicationId])).rows[0];
   if(prior){const baseline=auditRecordSet(auditPages(prior.snapshots).filter(p=>String(p.reportId)===reportId));if(!baseline.ambiguous)old=baseline.records;}
  }
  if(!old.size&&reportId==='6086103'){
   const prior=(await db.query(`SELECT CASE WHEN r.capture_evidence_id IS NOT NULL THEN e.directory ELSE r.discovery END AS pages
    FROM ainuoke_catalog_runs r LEFT JOIN ainuoke_catalog_capture_evidence e ON e.id=r.capture_evidence_id AND e.source_key=r.source_key
    WHERE r.source_key=$1 AND r.id::text<>$2 ORDER BY r.captured_at DESC LIMIT 1`,[sourceKey,publicationId])).rows[0];
   if(prior){const baseline=auditRecordSet(auditPages(prior.pages));if(!baseline.ambiguous)old=baseline.records;}
  }
  if(!old.size&&['6086997','6087105'].includes(reportId)&&contract){
   const prior=(await db.query(`SELECT o.evidence->'colors'->$2 AS pages FROM ainuoke_contract_observations o
    JOIN ainuoke_catalog_entries e USING(source_key,source_id) WHERE o.source_key=$1 AND e.sales_contract_no=$2 AND o.id::text<>$3
    ORDER BY o.captured_at DESC LIMIT 1`,[sourceKey,contract,publicationId])).rows[0];
   if(prior){const baseline=auditRecordSet(auditPages(prior.pages));if(!baseline.ambiguous)old=baseline.records;}
  }
  let inserted=0,updated=0,unchanged=0;
  if(!ambiguous)for(const [key,content]of records){if(replayed)unchanged++;else if(!old.has(key))inserted++;else if(old.get(key)===content)unchanged++;else updated++;}
  const end=selected.map(p=>p.fetchedAt).sort().at(-1);
  const creation=definition?.createdField?[...new Set(selected.flatMap(p=>p.rows.map(r=>r.values[definition.createdField!])))].filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}(?:[ T][0-9:.+Z-]{1,28})?$/.test(v)) as string[]:[];
  await db.query(`INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name,target_tables,contract_no,read_completed_at,read_time_basis,
   fetched_count,page_count,inserted_count,updated_count,unchanged_count,failed_count,duplicate_count,status,error_code,publication_ids,transaction_id,cursor_info)
   VALUES($1,$2,$3,$4,$5,$6,'page_completion_only',$7,$8,$9,$10,$11,0,$12,'write_pending',$13,$14::text[],txid_current()::text,$15)
   ON CONFLICT(batch_id,report_id,contract_no) DO UPDATE SET status='write_pending',inserted_count=excluded.inserted_count,updated_count=excluded.updated_count,
    unchanged_count=excluded.unchanged_count,failed_count=0,duplicate_count=excluded.duplicate_count,error_code=excluded.error_code,target_tables=excluded.target_tables,
    publication_ids=excluded.publication_ids,transaction_id=excluded.transaction_id,cursor_info=ainuoke_sync_audit_tables.cursor_info||excluded.cursor_info`,
   [ctx.id,reportId,definition?.name??'未登记报表 '+reportId,targets??definition?.targets??[],contract,end,selected.reduce((n,p)=>n+p.rows.length,0),selected.length,
    ambiguous?null:inserted,ambiguous?null:updated,ambiguous?null:unchanged,duplicates,ambiguous?'record_identity_ambiguous':null,publicationIds,JSON.stringify({pages:selected.map(p=>p.page),reportedTotals:[...new Set(selected.map(p=>p.total))],complete:true,coverage:'validated_requested_scope',countBasis:'distinct_source_records',
     queries:selected.map(p=>Object.fromEntries(Object.entries(p.queryContext??{}).filter(([key,value])=>['salesContractNo','insideOrderNo'].includes(key)&&typeof value==='string'&&value.length<=80))),
     ...(creation.length?{sourceCreationEvidence:{field:definition!.createdField,examples:creation.slice(0,5),moreValues:creation.length>5,timezone:'not_inferred'}}:{})})]);
  if(!ambiguous&&records.size)await db.query(`INSERT INTO ainuoke_sync_audit_record_state(source_key,report_id,scope_key,record_key,content_hash,batch_id)
   SELECT $1,$2,$3,r.key,r.content,$4 FROM jsonb_to_recordset($5::jsonb) AS r(key text,content text)
   ON CONFLICT(source_key,report_id,scope_key,record_key) DO UPDATE SET content_hash=excluded.content_hash,batch_id=excluded.batch_id`,
   [sourceKey,reportId,scope,ctx.id,JSON.stringify([...records].map(([key,content])=>({key,content})))]);
 }
}
/** Timestamp is taken by PostgreSQL AFTER a confirmed COMMIT, never on HTTP
 * 200 or before committing. Lost acknowledgements remain explicitly pending. */
export async function commitWithSyncAudit(client:PoolClient){
 const ctx=context.getStore();
 const xid=ctx?(await client.query('SELECT txid_current()::text AS id')).rows[0].id:null;
 await client.query('COMMIT');
 if(ctx)await client.query(`UPDATE ainuoke_sync_audit_tables SET status='success',write_completed_at=clock_timestamp()
  WHERE batch_id=$1 AND transaction_id=$2 AND status='write_pending'`,[ctx.id,xid]).catch(()=>undefined);
}
export async function auditPublicationFailure(db:DB,contract:string,code:string){
 const ctx=context.getStore();if(!ctx)return;
 await db.query("UPDATE ainuoke_sync_audit_tables SET status='failed',error_code=$3,failed_count=fetched_count WHERE batch_id=$1 AND contract_no=$2 AND status IN ('reading','acquired')",[ctx.id,contract,code]);
}
/** Streamed, closed metadata only; never URLs, query values or response bodies.
 * This makes in-flight per-report attempts durable even if the process dies. */
export async function auditRequestProgress(db:DB,phase:'started'|'finished',d:RequestDiagnostic){
 const ctx=context.getStore();if(!ctx)return;
 if(phase==='started')await db.query('UPDATE ainuoke_sync_audit_batches SET api_requests=coalesce(api_requests,0)+1,login_requests=coalesce(login_requests,0)+$2 WHERE id=$1',[ctx.id,d.kind==='login'?1:0]);
 if(phase==='finished')await db.query('UPDATE ainuoke_sync_audit_batches SET requests=requests||$2::jsonb WHERE id=$1',[ctx.id,JSON.stringify([safeRequest(d)])]);
 if(d.kind==='login'){
  if(phase==='finished')await db.query("INSERT INTO ainuoke_sync_audit_events(source_key,batch_id,event_type,code) VALUES($1,$2,'authentication',$3)",[ctx.sourceKey,ctx.id,d.outcome==='complete'?'authentication_accepted':'authentication_rejected']);
  return;
 }
 const id=String(d.reportId),definition=SYNC_AUDIT_SOURCES[id];
 await db.query(`INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name,target_tables,read_started_at,read_time_basis,api_requests,cursor_info)
  VALUES($1,$2,$3,$4,$5,'request_trace',$7,$6) ON CONFLICT(batch_id,report_id,contract_no) DO UPDATE SET
   read_started_at=coalesce(ainuoke_sync_audit_tables.read_started_at,excluded.read_started_at),api_requests=ainuoke_sync_audit_tables.api_requests+$7,cursor_info=excluded.cursor_info`,
  [ctx.id,id,definition?.name??'未登记报表 '+id,definition?.targets??[],d.startedAt??null,JSON.stringify({page:d.page,phase,outcome:d.outcome,complete:false}),phase==='started'?1:0]);
 if(phase==='finished'&&d.outcome!=='complete')await db.query(`UPDATE ainuoke_sync_audit_tables SET status='failed',error_code=$3 WHERE batch_id=$1 AND report_id=$2 AND contract_no=''`,[ctx.id,id,d.responseIsOk===false?'upstream_business_rejected':d.outcome]);
}
export function auditRequestHandler(db:DB){
 const owner=context.getStore();
 // The child process/stdout survives multiple batches. Its async resource may
 // still carry the FIRST batch's context; bind this capture's owner explicitly.
 return (phase:'started'|'finished',d:RequestDiagnostic)=>owner
  ?context.run(owner,()=>auditRequestProgress(db,phase,d)):Promise.resolve();
}
export async function auditMetrics(db:DB,value:unknown){
 const ctx=context.getStore();if(!ctx||!value||typeof value!=='object')return;
 const v=value as Record<string,unknown>;
 if(!Number.isSafeInteger(v.httpAttempts)||Number(v.httpAttempts)<0||Number(v.httpAttempts)>81||!Number.isSafeInteger(v.logins)||Number(v.logins)<0||Number(v.logins)>2)return;
 await db.query('UPDATE ainuoke_sync_audit_batches SET api_requests=$2,login_requests=$3 WHERE id=$1',[ctx.id,v.httpAttempts,v.logins]);
}
/** Called while holding the existing exclusive worker lease, before new IO.
 * A committed publication with a lost acknowledgement keeps its evidence and
 * unknown commit time; it is never rewritten as a failed business publication. */
export async function reconcileInterruptedAudit(db:DB,sourceKey:string){
 if(!(await db.query("SELECT to_regclass('public.ainuoke_sync_audit_batches') IS NOT NULL AS enabled")).rows[0].enabled)return;
 await db.query(`UPDATE ainuoke_sync_audit_tables t SET status=CASE WHEN t.status='write_pending' THEN 'partial' ELSE 'failed' END,
  error_code=CASE WHEN t.status='write_pending' THEN 'commit_acknowledgement_missing' ELSE 'restart_read_interrupted' END
  FROM ainuoke_sync_audit_batches b WHERE b.id=t.batch_id AND b.source_key=$1 AND b.status='running' AND (cardinality(b.job_ids)>0 OR b.sync_type='catalog') AND t.status<>'success'`,[sourceKey]);
 await db.query(`WITH interrupted AS (UPDATE ainuoke_sync_audit_batches SET status='interrupted',finished_at=clock_timestamp(),error_code='restart_read_interrupted'
  WHERE source_key=$1 AND status='running' AND (cardinality(job_ids)>0 OR sync_type='catalog') RETURNING id,source_key)
  INSERT INTO ainuoke_sync_audit_events(source_key,batch_id,event_type,code) SELECT source_key,id,'interrupted','restart_read_interrupted' FROM interrupted`,[sourceKey]);
}

/** Link a capture's explicit identity, including discovery requests whose audit
 * batch ID differs. Used by metadata backfill, never a timestamp join. */
export async function auditLinkCapture(db:DB,captureId:string){
 const owner=context.getStore();if(!owner)return;
 await db.query('UPDATE ainuoke_sync_audit_batches SET capture_ids=array_append(capture_ids,$2::uuid) WHERE id=$1 AND NOT $2::uuid=ANY(capture_ids)',[owner.id,captureId]);
}

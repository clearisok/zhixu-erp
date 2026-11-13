import type {Pool} from 'pg';
import type {AinuokeReportSnapshot,AinuokeOrderDiscoveryQuery} from '../../features/ainuoke-api/model/ainuoke-api.js';
import {hash,inspect,pagesValid,SourceError} from './contract.js';
import type {AdditionDiscoveryBundle} from './additions.js';

export type CatalogPhase='before'|'after';
export type CatalogPage=AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>;
export type CatalogCollectionOptions={
 resumePages?:CatalogPage[];
 onPage?:(phase:CatalogPhase,page:unknown)=>Promise<void>;
 onRequest?:(phase:'started'|'finished',diagnostic:import('./sync-diagnostics.js').RequestDiagnostic)=>Promise<void>;
};

/** Checkpoint data has the same fixed empty directory query as publication.
 * Its presence is not evidence of a complete directory or an existing order. */
export function validateCatalogCheckpointPage(value:unknown,now=Date.now()):CatalogPage {
 inspect(value);
 if(!value||typeof value!=='object'||Buffer.byteLength(JSON.stringify(value))>4*1024*1024)throw new SourceError('catalog_checkpoint_invalid');
 const p=value as CatalogPage;
 if(Object.keys(p).sort().join(',')!=='fetchedAt,page,pageSize,queryContext,reportId,rows,schemaVersion,snapshotHash,total'
  ||p.schemaVersion!=='ainuoke-direct-read.v2'||p.reportId!=='6086103'||!p.queryContext||Object.keys(p.queryContext).length
  ||p.pageSize!==50||!Number.isSafeInteger(p.total)||p.total<0||p.total>1400||p.page<1||p.page>28
  ||!Array.isArray(p.rows)||p.rows.length!==Math.min(50,Math.max(0,p.total-(p.page-1)*50))
  ||p.page>Math.max(1,Math.ceil(p.total/50))||typeof p.snapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(p.snapshotHash)
  ||p.rows.some(r=>!r||typeof r.sourceRowIdentity!=='string'||!r.sourceRowIdentity||!r.values||typeof r.values!=='object'))
   throw new SourceError('catalog_checkpoint_invalid');
 pagesValid([p],now,600000);
 return structuredClone(p);
}

export async function beginCatalogScan(pool:Pool,sourceKey:string,requestId:string){
 await pool.query(`INSERT INTO ainuoke_catalog_scan_state(source_key,last_request_id,status,cursor)
  VALUES($1,$2,'running','{"phase":"before","nextPage":1}'::jsonb)
  ON CONFLICT(source_key) DO UPDATE SET last_request_id=excluded.last_request_id,status='running',
  cursor=excluded.cursor,last_error_code=NULL,updated_at=now()`,[sourceKey,requestId]);
}

export async function saveCatalogScanPage(pool:Pool,sourceKey:string,requestId:string,phase:CatalogPhase,value:unknown){
 if(phase!=='before'&&phase!=='after')throw new SourceError('catalog_checkpoint_invalid');
 const page=validateCatalogCheckpointPage(value),{rows,...metadata}=page,rowsHash=hash(rows),c=await pool.connect();
 try{
  await c.query('BEGIN');
  const state=(await c.query('SELECT last_request_id,status,cursor FROM ainuoke_catalog_scan_state WHERE source_key=$1 FOR UPDATE',[sourceKey])).rows[0];
  if(state?.last_request_id!==requestId)throw new SourceError('catalog_checkpoint_changed');
  const prior=(await c.query('SELECT metadata,rows_hash FROM ainuoke_catalog_scan_pages WHERE source_key=$1 AND request_id=$2 AND phase=$3 AND page=$4',
   [sourceKey,requestId,phase,page.page])).rows[0];
  if(prior){if(hash(prior.metadata)!==hash(metadata)||prior.rows_hash!==rowsHash)throw new SourceError('catalog_checkpoint_changed');await c.query('COMMIT');return;}
  if(state.status!=='running')throw new SourceError('catalog_checkpoint_changed');
  const previous=(await c.query('SELECT count(*)::int AS n,min((metadata->>\'total\')::int) AS total FROM ainuoke_catalog_scan_pages WHERE source_key=$1 AND request_id=$2 AND phase=$3',[sourceKey,requestId,phase])).rows[0];
  if(page.page!==previous.n+1||previous.n&&previous.total!==page.total)throw new SourceError('catalog_checkpoint_pagination_changed');
  if(phase==='after'){
   const before=(await c.query("SELECT count(*)::int AS n,max((metadata->>'total')::int) AS total FROM ainuoke_catalog_scan_pages WHERE source_key=$1 AND request_id=$2 AND phase='before'",[sourceKey,requestId])).rows[0];
   if(!before.n||before.n!==Math.max(1,Math.ceil(before.total/50)))throw new SourceError('catalog_checkpoint_pagination_changed');
  }
  await c.query('INSERT INTO ainuoke_catalog_evidence_chunks(source_key,content_hash,rows) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[sourceKey,rowsHash,JSON.stringify(rows)]);
  await c.query('INSERT INTO ainuoke_catalog_scan_pages(source_key,request_id,phase,page,metadata,rows_hash,captured_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',
   [sourceKey,requestId,phase,page.page,JSON.stringify(metadata),rowsHash,page.fetchedAt]);
  await c.query(`UPDATE ainuoke_catalog_scan_state SET cursor=$3::jsonb,updated_at=now() WHERE source_key=$1 AND last_request_id=$2`,
   [sourceKey,requestId,JSON.stringify({phase,lastPage:page.page,nextPage:page.page+1,total:page.total,sourceFetchedAt:page.fetchedAt})]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{c.release();}
}

/** Reuse only a recent, same-account failed prefix. Page 1 is re-read and the
 * entire second pass is always fresh; a shifted directory cannot be spliced. */
export async function loadCatalogScanResume(pool:Pool,sourceKey:string,fingerprint:string,now=Date.now()):Promise<CatalogPage[]>{
 const request=(await pool.query(`SELECT request_id FROM ainuoke_catalog_requests WHERE source_key=$1 AND account_fingerprint=$2
  AND status='failed' AND result->>'code' IN ('source_unavailable','source_timeout','selected_source_timeout','catalog_business_content_changed')
  AND created_at>=$3 ORDER BY created_at DESC LIMIT 1`,[sourceKey,fingerprint,new Date(now-300000)])).rows[0];
 if(!request)return [];
 const rows=(await pool.query(`SELECT p.metadata,p.rows_hash,c.rows FROM ainuoke_catalog_scan_pages p
  JOIN ainuoke_catalog_evidence_chunks c ON c.source_key=p.source_key AND c.content_hash=p.rows_hash
  WHERE p.source_key=$1 AND p.request_id=$2 AND p.phase='before' ORDER BY p.page`,[sourceKey,request.request_id])).rows;
 const result:CatalogPage[]=[];
 for(const [i,row] of rows.entries()){
  if(hash(row.rows)!==row.rows_hash)throw new SourceError('catalog_checkpoint_invalid');
  const page={...row.metadata,rows:row.rows};
  if(Date.parse(page.fetchedAt)<now-300000)return [];
  const checked=validateCatalogCheckpointPage(page,now);
  if(checked.page!==i+1||result.length&&checked.total!==result[0].total)throw new SourceError('catalog_checkpoint_pagination_changed');
  result.push(checked);
 }
 return result;
}

export async function finishCatalogScan(pool:Pool,sourceKey:string,requestId:string,result:Record<string,unknown>,bundle?:AdditionDiscoveryBundle){
 if(bundle)for(const phase of ['before','after'] as const)for(const page of bundle[phase==='before'?'discoveryBefore':'discoveryAfter'])
  await saveCatalogScanPage(pool,sourceKey,requestId,phase,page);
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const state=(await c.query('SELECT last_request_id,last_success_request_id,status FROM ainuoke_catalog_scan_state WHERE source_key=$1 FOR UPDATE',[sourceKey])).rows[0];
  if(state?.last_request_id!==requestId)throw new SourceError('catalog_checkpoint_changed');
  if(state.status==='complete'&&state.last_success_request_id===requestId){await c.query('COMMIT');return;}
  const run=(await c.query('SELECT id,captured_at,content_hash FROM ainuoke_catalog_runs WHERE source_key=$1 AND request_id=$2',[sourceKey,requestId])).rows[0];
  if(!run)throw new SourceError('catalog_publication_missing');
  const pages=(await c.query('SELECT phase,page,metadata FROM ainuoke_catalog_scan_pages WHERE source_key=$1 AND request_id=$2 ORDER BY phase,page',[sourceKey,requestId])).rows;
  const total=pages.find(p=>p.phase==='after')?.metadata.total;
  const expected=Math.max(1,Math.ceil(Number(total)/50));
  if(total===undefined||['before','after'].some(phase=>pages.filter(p=>p.phase===phase).length!==expected)
   ||pages.some(p=>p.metadata.total!==total))throw new SourceError('catalog_checkpoint_incomplete');
  const policy=(await c.query('SELECT policy FROM ainuoke_sync_controls WHERE source_key=$1',[sourceKey])).rows[0]?.policy;
  const watermark={strategy:'complete-directory-overlap',timezone:'Asia/Shanghai',sourceCreatedAtAvailable:false,
   runId:run.id,contentHash:run.content_hash,contracts:total??Number(result.contracts??0),
   sourceObservedAt:new Date(run.captured_at).toISOString(),pagesBefore:pages.filter(p=>p.phase==='before').length,pagesAfter:pages.filter(p=>p.phase==='after').length};
  await c.query("UPDATE ainuoke_catalog_requests SET status='complete',result=$3::jsonb,finished_at=now() WHERE source_key=$1 AND request_id=$2",[sourceKey,requestId,JSON.stringify(result)]);
  await c.query(`UPDATE ainuoke_catalog_scan_state SET status='complete',last_success_request_id=$2,last_success_at=now(),
   next_scan_at=now()+($3::int*interval '1 minute'),watermark=$4::jsonb,cursor=$5::jsonb,last_error_code=NULL,updated_at=now()
   WHERE source_key=$1 AND last_request_id=$2`,[sourceKey,requestId,policy?.catalogMinutes??30,JSON.stringify(watermark),JSON.stringify({phase:'complete',pages:pages.length})]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{c.release();}
}

export async function failCatalogScan(pool:Pool,sourceKey:string,requestId:string,code:string,unknown=false){
 await pool.query(`UPDATE ainuoke_catalog_scan_state SET status=$3,last_error_code=$4,updated_at=now()
  WHERE source_key=$1 AND last_request_id=$2`,[sourceKey,requestId,unknown?'unknown':'failed',code]);
}

/** Independent directory clock; manual detail work cannot starve discovery. */
export async function catalogScanDue(pool:Pool,sourceKey:string,minutes:number,now:number){
 const state=(await pool.query('SELECT next_scan_at FROM ainuoke_catalog_scan_state WHERE source_key=$1',[sourceKey])).rows[0];
 if(state?.next_scan_at)return new Date(state.next_scan_at).getTime()<=now;
 const last=(await pool.query("SELECT coalesce(finished_at,created_at) AS at FROM ainuoke_catalog_requests WHERE source_key=$1 AND status='complete' ORDER BY created_at DESC LIMIT 1",[sourceKey])).rows[0];
 return !last||new Date(last.at).getTime()+minutes*60000<=now;
}

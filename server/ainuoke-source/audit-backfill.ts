import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {sourceActor} from './service.js';
import {requirePermission} from '../auth/permissions.js';
import {SourceError,sourceKeyValid,sourceUuidValid} from './contract.js';
import {SYNC_AUDIT_SOURCES} from './audit-sources.js';

type Identity=Pick<TrustedIdentity,'internalUserId'|'userId'>;
type Legacy={id:string;kind:string;source_key:string;started_at:Date|null;finished_at:Date|null;reference_at:Date|null;status:string;error_code:string|null;job_ids:string[];contracts:string[];metrics:{httpAttempts?:number;logins?:number}|null;requests:{kind?:string;reportId?:number;page?:number;outcome?:string;httpStatus?:number;elapsedMs?:number}[]|null;published:boolean;publication_id:string|null;reports:{report_id:string;rows:number|null;read_at:string|null}[]};
/** Metadata only. Does not call a collector, move a business pointer, rewrite a
 * task, replay a source read, or count imported logs as today's fresh sync. */
export async function backfillExistingSyncAudit(pool:Pool,identity:Identity,sourceKey:string,options:{limit?:number;after?:{at:string;id:string};execute?:boolean}={}){
 if(!sourceKeyValid(sourceKey))throw new SourceError('sync_audit_backfill_invalid');
 const limit=options.limit??25;
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||options.after&&(!sourceUuidValid(options.after.id)||!Number.isFinite(Date.parse(options.after.at))))throw new SourceError('sync_audit_backfill_invalid');
 const actor=await sourceActor(pool,identity,false);requirePermission(actor.permissions,'audit_log.view');requirePermission(actor.permissions,'user_permissions.manage');
 const args:unknown[]=[sourceKey,options.after?.at??'1970-01-01T00:00:00Z',options.after?.id??'00000000-0000-0000-0000-000000000000',limit];
 // Prefer explicit request/capture/publication keys. Never join old operations
 // merely because their timestamps are close.
 const records=(await pool.query<Legacy>(`WITH candidates AS MATERIALIZED (
  SELECT k.id,k.kind FROM (
   SELECT id,'capture' AS kind,started_at AS at FROM ainuoke_sync_capture_attempts WHERE source_key=$1 AND mode='catalog-contracts' AND status<>'running'
   UNION ALL SELECT request_id,'catalog',created_at FROM ainuoke_catalog_requests WHERE source_key=$1 AND status<>'running'
   UNION ALL SELECT id,'payment',created_at FROM ainuoke_payment_snapshots WHERE source_key=$1
   UNION ALL SELECT id,'garment',created_at FROM ainuoke_garment_shipment_snapshots WHERE source_key=$1) k
  WHERE (k.at,k.id)>($2::timestamptz,$3::uuid)
   AND NOT EXISTS(SELECT 1 FROM ainuoke_sync_audit_batches b WHERE b.id=k.id OR k.id=ANY(b.capture_ids))
  ORDER BY k.at,k.id LIMIT $4), legacy AS (
  SELECT a.id,'capture' AS kind,a.source_key,a.started_at,a.finished_at,a.started_at AS reference_at,a.status,a.result_code AS error_code,a.job_ids,a.metrics,a.requests,
   ARRAY(SELECT j.sales_contract_no FROM ainuoke_sync_jobs j WHERE j.id=ANY(a.job_ids)) AS contracts,
   cardinality(a.job_ids)>0 AND NOT EXISTS(SELECT 1 FROM ainuoke_sync_jobs j WHERE j.id=ANY(a.job_ids) AND (j.status<>'complete' OR NOT EXISTS(SELECT 1 FROM ainuoke_contract_observations o WHERE o.job_id=j.id AND o.source_key=j.source_key AND o.source_id=j.source_id) OR (j.result->>'orderId' IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM ainuoke_material_source_snapshots s WHERE s.run_id::text=j.result->>'publicationRunId' AND s.sales_order_id::text=j.result->>'orderId' AND s.sales_contract_no=j.sales_contract_no)))) AS published,
   NULL::text AS publication_id,
   coalesce((SELECT jsonb_agg(jsonb_build_object('report_id',r.report_id,'rows',r.n,'read_at',r.at)) FROM (
    SELECT p->>'reportId' AS report_id,sum(jsonb_array_length(p->'rows')) AS n,max(p->>'fetchedAt') AS at
    FROM ainuoke_sync_jobs j JOIN ainuoke_material_source_snapshots s ON s.run_id::text=j.result->>'publicationRunId' AND s.sales_order_id::text=j.result->>'orderId'
    CROSS JOIN LATERAL jsonb_array_elements(s.snapshots) p WHERE j.id=ANY(a.job_ids) GROUP BY p->>'reportId')r),'[]') AS reports
  FROM ainuoke_sync_capture_attempts a JOIN candidates k ON k.id=a.id AND k.kind='capture' WHERE a.source_key=$1 AND a.mode='catalog-contracts' AND a.status<>'running'
  UNION ALL
  SELECT q.request_id,'catalog',q.source_key,q.created_at,q.finished_at,q.created_at,q.status,q.result->>'code','{}'::uuid[],NULL::jsonb,NULL::jsonb,'{}'::text[],
   EXISTS(SELECT 1 FROM ainuoke_catalog_runs r WHERE r.source_key=q.source_key AND r.request_id=q.request_id),
   (SELECT id::text FROM ainuoke_catalog_runs r WHERE r.source_key=q.source_key AND r.request_id=q.request_id LIMIT 1),
   jsonb_build_array(jsonb_build_object('report_id','6086103','rows',NULL,'read_at',NULL))
  FROM ainuoke_catalog_requests q JOIN candidates k ON k.id=q.request_id AND k.kind='catalog' WHERE q.source_key=$1 AND q.status<>'running'
  UNION ALL
  SELECT s.id,'payment',s.source_key,NULL,NULL,s.created_at,'complete',NULL,'{}'::uuid[],NULL::jsonb,NULL::jsonb,ARRAY[s.sales_contract_no],true,s.id::text,
   jsonb_build_array(jsonb_build_object('report_id','6086941','rows',jsonb_array_length(s.payload->'rows'),'read_at',s.observed_through))
  FROM ainuoke_payment_snapshots s JOIN candidates k ON k.id=s.id AND k.kind='payment' WHERE s.source_key=$1
  UNION ALL
  SELECT s.id,'garment',s.source_key,NULL,NULL,s.created_at,'complete',NULL,'{}'::uuid[],NULL::jsonb,NULL::jsonb,ARRAY[s.sales_contract_no],true,s.id::text,
   jsonb_build_array(jsonb_build_object('report_id','6086979','rows',s.row_count,'read_at',s.observed_through))
  FROM ainuoke_garment_shipment_snapshots s JOIN candidates k ON k.id=s.id AND k.kind='garment' WHERE s.source_key=$1)
  SELECT * FROM legacy l WHERE (coalesce(started_at,reference_at),id)>($2::timestamptz,$3::uuid)
   AND NOT EXISTS(SELECT 1 FROM ainuoke_sync_audit_batches b WHERE b.id=l.id OR l.id=ANY(b.capture_ids))
  ORDER BY coalesce(started_at,reference_at),id LIMIT $4`,args)).rows;
 if(!options.execute)return {state:'audit_backfill_preview' as const,records:records.length,sourceRequests:0,businessWrites:0};
 let inserted=0;
 for(const row of records){
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const status=row.status==='complete'?(row.published?'success':'partial'):row.status==='unknown'?'interrupted':'failed';
   const code=row.error_code&&/^[a-z0-9_]{1,100}$/.test(row.error_code)?row.error_code:null;
   const created=await c.query(`INSERT INTO ainuoke_sync_audit_batches(id,source_key,sync_type,started_at,finished_at,reference_at,reference_basis,status,job_ids,contracts,api_requests,login_requests,error_code,origin,capture_ids)
    VALUES($1,$2,'audit_backfill',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'historical_record',$13) ON CONFLICT DO NOTHING RETURNING id`,
    [row.id,sourceKey,row.started_at,row.finished_at,row.reference_at,row.started_at?'legacy_task_record':'legacy_snapshot_row_record',status,row.job_ids,row.contracts,row.metrics?.httpAttempts??null,row.metrics?.logins??null,code,row.kind==='capture'?[row.id]:[]]);
   if(!created.rowCount){await c.query('ROLLBACK');continue;}
   const reports=new Map(row.reports.map(r=>[r.report_id,r]));
   for(const d of row.requests??[])if(d.kind==='report'&&/^[0-9]{7}$/.test(String(d.reportId))&&!reports.has(String(d.reportId)))reports.set(String(d.reportId),{report_id:String(d.reportId),rows:null,read_at:null});
   for(const [id,report]of reports){
    const definition=SYNC_AUDIT_SOURCES[id],trace=(row.requests??[]).filter(d=>String(d.reportId)===id);
    await c.query(`INSERT INTO ainuoke_sync_audit_tables(batch_id,report_id,source_name,target_tables,read_completed_at,status,error_code,api_requests,page_count,read_time_basis,cursor_info,publication_ids)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'legacy_evidence', $10::jsonb,$11)`,
     [row.id,id,definition?.name??'未登记报表 '+id,definition?.targets??[],report.read_at,
      row.status==='complete'&&row.published?'historical_published':row.status==='complete'?'partial':'failed',code,
      trace.length||null,trace.length||null,JSON.stringify({historicalRecord:true,evidenceRows:report.rows,writeTimeUnavailable:true,scope:row.contracts,
       originalCaptureStatus:row.status,publicationVerified:row.published,countsUnavailable:'not_recorded_by_legacy_runtime'}),row.publication_id?[row.publication_id]:[]]);
   }
   await c.query('COMMIT');inserted++;
  }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{c.release();}
 }
 const last=records.at(-1);
 return {state:'audit_backfill_complete' as const,inserted,next:records.length===limit&&last?{at:new Date(last.started_at??last.reference_at!).toISOString(),id:last.id}:null,sourceRequests:0,businessWrites:0};
}

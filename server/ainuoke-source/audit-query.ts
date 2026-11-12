import type {Pool} from 'pg';
import {HttpError} from '../http/errors.js';
import {SYNC_AUDIT_SOURCES} from './audit-sources.js';

export function parseAuditQuery(params:URLSearchParams){
 const get=(key:string,max=100)=>{const v=params.get(key)?.trim()??'';if(v.length>max||/[\x00-\x1f]/.test(v))throw new HttpError(400,'audit_query_invalid','查询条件无效');return v;};
 const start=get('start',10),end=get('end',10),status=get('status',20),type=get('type',30),report=get('report',80),batch=get('batch',40),contract=get('contract',80);
 for(const d of [start,end])if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))throw new HttpError(400,'audit_query_invalid','日期无效');
 if(start&&end&&start>end||status&&!['running','success','partial','failed','interrupted'].includes(status))throw new HttpError(400,'audit_query_invalid','查询条件无效');
 const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??25);
 if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new HttpError(400,'audit_query_invalid','分页无效');
 return {start,end,status,type,report,batch,contract,offset,limit};
}
export async function querySyncAudit(pool:Pool,params:URLSearchParams,exporting=false){
 const q=parseAuditQuery(params),values:unknown[]=[],conditions:string[]=[];
 const arg=(v:unknown)=>{values.push(v);return '$'+values.length;};
 if(q.start)conditions.push(`coalesce(b.started_at,b.reference_at)>=${arg(q.start+'T00:00:00+08:00')}::timestamptz`);
 if(q.end)conditions.push(`coalesce(b.started_at,b.reference_at)<(${arg(q.end+'T00:00:00+08:00')}::timestamptz+interval '1 day')`);
 if(q.status){const p=arg(q.status);conditions.push(`(b.status=${p} OR EXISTS(SELECT 1 FROM ainuoke_sync_audit_tables t WHERE t.batch_id=b.id AND t.contract_no='' AND t.status=${p}))`);}
 if(q.type)conditions.push(`b.sync_type=${arg(q.type)}`);
 if(q.batch)conditions.push(`position(${arg(q.batch)} in b.id::text)>0`);
 if(q.report){const p=arg(q.report);conditions.push(`EXISTS(SELECT 1 FROM ainuoke_sync_audit_tables t WHERE t.batch_id=b.id AND (t.report_id=${p} OR position(${p} in t.source_name)>0))`);}
 if(q.contract){const p=arg(q.contract);conditions.push(`(EXISTS(SELECT 1 FROM unnest(b.contracts) c WHERE position(${p} in c)>0) OR EXISTS(SELECT 1 FROM ainuoke_catalog_entries e WHERE e.source_key=b.source_key AND e.sales_contract_no=ANY(b.contracts) AND position(${p} in coalesce(e.inside_order_no,''))>0))`);}
 const where=conditions.length?'WHERE '+conditions.join(' AND '):'';
 const total=Number((await pool.query(`SELECT count(*) FROM ainuoke_sync_audit_batches b ${where}`,values)).rows[0].count);
 if(exporting&&total>10000)throw new HttpError(413,'audit_export_scope_too_large','请缩小日期或报表范围后导出，最多10000批次');
 if(exporting&&Number((await pool.query(`SELECT count(*) FROM ainuoke_sync_audit_batches b JOIN ainuoke_sync_audit_tables t ON t.batch_id=b.id ${where}`,values)).rows[0].count)>50000)
  throw new HttpError(413,'audit_export_scope_too_large','请缩小范围后导出，最多50000张表记录');
 const rows=(await pool.query(`SELECT b.*,coalesce((SELECT jsonb_agg(t ORDER BY t.report_id,t.contract_no) FROM ainuoke_sync_audit_tables t WHERE t.batch_id=b.id AND t.contract_no=''),'[]') AS tables,coalesce((SELECT jsonb_agg(t ORDER BY t.report_id,t.contract_no) FROM ainuoke_sync_audit_tables t WHERE t.batch_id=b.id AND t.contract_no<>''),'[]') AS contract_tables
  FROM ainuoke_sync_audit_batches b ${where} ORDER BY coalesce(b.started_at,b.reference_at) DESC,b.id DESC LIMIT ${arg(exporting?10000:q.limit)} OFFSET ${arg(exporting?0:q.offset)}`,values)).rows;
 const overview=(await pool.query(`SELECT json_build_object(
  'lastSuccessAt',(SELECT max(write_completed_at) FROM ainuoke_sync_audit_tables WHERE status='success'),
  'lastAttemptAt',(SELECT max(started_at) FROM ainuoke_sync_audit_batches),
  'todayBatches',(SELECT count(*) FROM ainuoke_sync_audit_batches WHERE origin<>'historical_record' AND started_at>=(date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')),
  'todaySuccessTables',(SELECT count(*) FROM ainuoke_sync_audit_tables WHERE contract_no='' AND status='success' AND write_completed_at>=(date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')),
  'todayFailedTables',(SELECT count(*) FROM ainuoke_sync_audit_tables t JOIN ainuoke_sync_audit_batches b ON b.id=t.batch_id WHERE t.contract_no='' AND t.status IN ('failed','partial') AND b.origin<>'historical_record' AND coalesce(b.started_at,b.reference_at)>=(date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')),
  'retryTasks',(SELECT count(*) FROM ainuoke_sync_jobs WHERE status='queued' AND retry_of IS NOT NULL),
  'pendingRecords',NULL,'pendingTasks',(SELECT count(*) FROM ainuoke_sync_jobs WHERE status IN ('queued','running','unknown')),
  'controls',(SELECT coalesce(json_agg(json_build_object('sourceKey',source_key,'enabled',enabled,'pausedReason',paused_reason,'heartbeatAt',heartbeat_at,'retryAt',catalog_retry_at)),'[]') FROM ainuoke_sync_controls)) AS value`)).rows[0].value;
 const events=(await pool.query('SELECT source_key,event_type,code,occurred_at,batch_id FROM ainuoke_sync_audit_events ORDER BY occurred_at DESC,id DESC LIMIT 50')).rows;
 const sources={...SYNC_AUDIT_SOURCES};
 for(const r of (await pool.query('SELECT report_id,min(source_name) AS name,array_agg(DISTINCT target) FILTER(WHERE target IS NOT NULL) AS targets FROM ainuoke_sync_audit_tables LEFT JOIN LATERAL unnest(target_tables) target ON true GROUP BY report_id')).rows)
  if(!sources[r.report_id])sources[r.report_id]={name:r.name,targets:r.targets??[]};
 return {rows,total,offset:q.offset,limit:q.limit,overview,events,sources};
}

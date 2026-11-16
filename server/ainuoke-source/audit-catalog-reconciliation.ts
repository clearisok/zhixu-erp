import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {sourceActor} from './service.js';
import {SourceError,hash,sourceKeyValid,sourceUuidValid} from './contract.js';
import {catalogAuditRecordSet} from './sync-audit.js';

/** Explicit, single-batch metadata correction. Preserves original counters in
 * the receipt; never changes business data, statuses, timestamps or pointers. */
export async function reconcileInitialCatalogAudit(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,
 sourceKey:string,batchId:string,options:{execute?:boolean;expectedHash?:string}={}){
 if(!sourceKeyValid(sourceKey)||!sourceUuidValid(batchId)||options.execute&&!/^[a-f0-9]{64}$/.test(options.expectedHash??''))throw new SourceError('audit_catalog_reconciliation_invalid');
 const c=await pool.connect();
 try{
  await c.query(options.execute?'BEGIN':'BEGIN READ ONLY');
  const actor=await sourceActor(c,identity,false,Boolean(options.execute));requirePermission(actor.permissions,'audit_log.view');requirePermission(actor.permissions,'user_permissions.manage');
  const row=(await c.query(`SELECT t.*,b.started_at,b.sync_type,b.status AS batch_status FROM ainuoke_sync_audit_tables t
   JOIN ainuoke_sync_audit_batches b ON b.id=t.batch_id WHERE t.batch_id=$1 AND b.source_key=$2
    AND t.report_id='6086103' AND t.contract_no='' ${options.execute?'FOR UPDATE OF t':''}`,[batchId,sourceKey])).rows[0];
  if(!row)throw new SourceError('audit_catalog_reconciliation_scope_invalid');
  const corrected=row.cursor_info?.baselineCorrection;
  if(corrected){
   if(options.execute&&options.expectedHash!==corrected.reviewHash)throw new SourceError('audit_catalog_reconciliation_preview_changed');
   await c.query('COMMIT');return {state:'audit_catalog_reconciliation_replayed' as const,reviewHash:corrected.reviewHash,counts:corrected.correctedCounts,sourceRequests:0,businessWrites:0};
  }
  if(row.sync_type!=='catalog'||row.batch_status!=='success'||row.status!=='success'||!row.write_completed_at||!row.read_completed_at||row.error_code
   ||row.publication_ids.length!==1||row.updated_count!==0||row.unchanged_count!==0)throw new SourceError('audit_catalog_reconciliation_scope_invalid');
  const current=(await c.query('SELECT * FROM ainuoke_catalog_runs WHERE source_key=$1 AND id::text=$2 AND request_id=$3',[sourceKey,row.publication_ids[0],batchId])).rows[0];
  if(!current)throw new SourceError('audit_catalog_reconciliation_scope_invalid');
  if((await c.query(`SELECT 1 FROM ainuoke_sync_audit_tables t JOIN ainuoke_sync_audit_batches b ON b.id=t.batch_id
   WHERE b.source_key=$1 AND b.started_at<$2 AND t.report_id='6086103' AND t.status IN ('success','partial','write_pending') LIMIT 1`,[sourceKey,row.started_at])).rowCount)throw new SourceError('audit_catalog_reconciliation_not_initial');
  const prior=(await c.query('SELECT * FROM ainuoke_catalog_runs WHERE source_key=$1 AND captured_at<$2 ORDER BY captured_at DESC,id DESC LIMIT 1',[sourceKey,current.captured_at])).rows[0];
  if(!prior?.capture_evidence_id||prior.account_fingerprint!==current.account_fingerprint)throw new SourceError('audit_catalog_reconciliation_baseline_unavailable');
  const old=await catalogAuditRecordSet(c,sourceKey,prior),next=await catalogAuditRecordSet(c,sourceKey,current);
  if(old.ambiguous||next.ambiguous||row.inserted_count!==next.records.size)throw new SourceError('audit_catalog_reconciliation_baseline_invalid');
  let inserted=0,updated=0,unchanged=0;
  for(const [key,content]of next.records){if(!old.records.has(key))inserted++;else if(old.records.get(key)!==content)updated++;else unchanged++;}
  const originalCounts={inserted:row.inserted_count as number,updated:0,unchanged:0},correctedCounts={inserted,updated,unchanged};
  if(hash(originalCounts)===hash(correctedCounts))throw new SourceError('audit_catalog_reconciliation_not_required');
  const reviewHash=hash({sourceKey,batchId,tableId:row.id,originalCounts,correctedCounts,priorRun:prior.id,currentRun:current.id,
   priorHash:prior.content_hash,currentHash:current.content_hash,readAt:new Date(row.read_completed_at).toISOString(),commitAt:new Date(row.write_completed_at).toISOString()});
  if(!options.execute){await c.query('COMMIT');return {state:'audit_catalog_reconciliation_preview' as const,reviewHash,originalCounts,counts:correctedCounts,priorRun:prior.id,currentRun:current.id,sourceRequests:0,businessWrites:0};}
  if(options.expectedHash!==reviewHash)throw new SourceError('audit_catalog_reconciliation_preview_changed');
  const correction={schemaVersion:'catalog-audit-baseline-correction.v1',reason:'packed_previous_catalog_evidence',reviewHash,
   originalCounts,correctedCounts,priorPublicationId:prior.id,currentPublicationId:current.id};
  await c.query(`UPDATE ainuoke_sync_audit_tables SET inserted_count=$2,updated_count=$3,unchanged_count=$4,
   cursor_info=cursor_info||jsonb_build_object('baselineCorrection',$5::jsonb||jsonb_build_object('recordedAt',clock_timestamp())) WHERE id=$1`,
   [row.id,inserted,updated,unchanged,JSON.stringify(correction)]);
  await appendOperationLog(c,actor,{module:'艾诺科同步',action:'更新合同目录',entityType:'AinuokeCatalogRun',entityId:current.id,
   metadata:{sourceOnly:true,auditMetadataOnly:true,correctionCode:'packed_catalog_audit_baseline',batchId,reviewHash,priorPublicationId:prior.id},
   beforeData:{objectName:'同步审计 '+batchId,values:originalCounts},afterData:{objectName:'同步审计 '+batchId,values:correctedCounts}});
  await c.query('COMMIT');return {state:'audit_catalog_reconciliation_complete' as const,reviewHash,counts:correctedCounts,sourceRequests:0,businessWrites:0};
 }catch(error){await c.query('ROLLBACK').catch(()=>undefined);throw error;}finally{c.release();}
}

import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import type {AdditionBundle} from './additions.js';
import type {AinuokeReportSnapshot} from '../../features/ainuoke-api/model/ainuoke-api.js';
import {previewAdditions,requireAdditionProfile} from './additions.js';
import {previewCatalog} from './catalog.js';
import {hash,inspect,SourceError,sourceUuidValid,validateBundle} from './contract.js';
import {boundOrders,sourceActor,publishMaterialSnapshotsInTransaction} from './service.js';
import {createAinuokeSalesOrderInTransaction} from '../sales-orders/service.js';
import {refreshCollectedBoundOrderInTransaction} from './bound-order-refresh.js';
import {lockEffectiveAttribution} from '../sales-orders/effective-attribution.js';
import {appendOperationLog} from '../operation-logs/repository.js';

export type MaterialArchiveRecord={sourceId:string;salesContractNo:string;observationId:string;capturedAt:string;
 evidence:{addition:AdditionBundle;materials:AinuokeReportSnapshot[]};evidenceHash:string};

/** Explicit trusted, private archive import. No network or clock rewriting. The
 * ordinary order commands and snapshot publisher own all business writes.
 * Imported evidence never completes a queued refresh or records a fresh capture. */
export async function importVerifiedMaterialArchive(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,
 scope:{sourceKey:string;accountFingerprint:string},record:MaterialArchiveRecord){
 inspect(record);
 const at=Date.parse(record.capturedAt);
 if(!Number.isFinite(at)||at>Date.now()||!sourceUuidValid(record.observationId)
  ||hash(record.evidence)!==record.evidenceHash||Buffer.byteLength(JSON.stringify(record))>32*1024*1024)
  throw new SourceError('historical_material_evidence_invalid');
 const directory=await previewCatalog({schemaVersion:'ainuoke-order-addition-discovery.v1',
  discoveryBefore:record.evidence.addition.discoveryBefore,discoveryAfter:record.evidence.addition.discoveryAfter},at);
 const row=directory.rows.find(r=>r.sourceId===record.sourceId&&r.salesContractNo===record.salesContractNo);
 if(!row)throw new SourceError('source_scope_mismatch');
 const mapped=await previewAdditions(record.evidence.addition,[record.salesContractNo],[],at,600000);
 if(mapped.candidates.length!==1||mapped.candidates[0].source.sourceId!==record.sourceId)throw new SourceError('source_scope_mismatch');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='30s'");
  await lockEffectiveAttribution(c);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ainuoke-source:'+scope.sourceKey]);
  const actor=await sourceActor(c,identity,true);await requireAdditionProfile(c,scope.sourceKey,scope.accountFingerprint,true);
  const catalog=(await c.query('SELECT sales_contract_no,visible FROM ainuoke_catalog_entries WHERE source_key=$1 AND source_id=$2 FOR SHARE',[scope.sourceKey,record.sourceId])).rows[0];
  if(!catalog?.visible||catalog.sales_contract_no!==record.salesContractNo)throw new SourceError('catalog_identity_changed');
  const created=await createAinuokeSalesOrderInTransaction(c,actor,mapped.candidates[0],{materialPublication:'same_transaction'});
  const orderId=created.salesOrder.id;
  const head=(await c.query(`SELECT h.run_id::text,h.last_error_code,r.captured_at FROM ainuoke_material_order_heads h
   LEFT JOIN ainuoke_source_runs r ON r.id=h.run_id WHERE h.source_key=$1 AND h.sales_order_id=$2 FOR UPDATE OF h`,[scope.sourceKey,orderId])).rows[0];
  if(head?.last_error_code&&/identity|account|visibility|permission|actor|scope|binding/.test(head.last_error_code))throw new SourceError('historical_material_identity_blocked');
  if(head?.run_id&&new Date(head.captured_at).getTime()>=at){
   await c.query('COMMIT');return {status:'existing_head_preserved' as const,orderId,runId:head.run_id,sourceRequests:0};
  }
  const mirror=(await c.query('SELECT fetched_at FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1',[orderId])).rows[0];
  if(new Date(mirror.fetched_at).getTime()<=at&&mapped.candidates[0].colorDetailStatus==='usable')
   await refreshCollectedBoundOrderInTransaction(pool,c,actor,{...scope,salesOrderId:orderId},record.evidence.addition,record.observationId,at);
  const targets=await boundOrders(c,true,[orderId]);
  if(targets.length!==1||targets[0].salesContractNo!==record.salesContractNo)throw new SourceError('source_binding_conflict');
  const validated=await validateBundle({schemaVersion:'ainuoke-server-source.v1',discoveryBefore:record.evidence.addition.discoveryBefore,
   discoveryAfter:record.evidence.addition.discoveryAfter,materials:{[record.salesContractNo]:record.evidence.materials}},targets,at,600000);
  if(validated.rows.length!==1)throw new SourceError('source_missing');
  const runId=await publishMaterialSnapshotsInTransaction(c,actor,scope.sourceKey,validated,targets,
   {historicalObservationId:record.observationId,replaceOlder:true});
  // Last success belongs to the original complete capture, not this import.
  // No observation/job is manufactured and failures/active recovery remain intact.
  await c.query(`INSERT INTO ainuoke_contract_sync_state(source_key,source_id,last_success_at)
   VALUES($1,$2,$3) ON CONFLICT(source_key,source_id) DO UPDATE SET
   last_success_at=greatest(ainuoke_contract_sync_state.last_success_at,excluded.last_success_at)`,[scope.sourceKey,record.sourceId,new Date(at)]);
  await appendOperationLog(c,actor,{module:'艾诺科同步',action:'采集艾诺科来源',entityType:'AinuokeSourceRun',entityId:runId,
   metadata:{sourceOnly:true,historicalPublication:true,archiveObservationId:record.observationId,evidenceHash:record.evidenceHash,sourceRequests:0},
   afterData:{objectName:record.salesContractNo,orderId,values:{sourceTime:record.capturedAt}}});
  await c.query('COMMIT');return {status:'historical_published' as const,orderId,runId,created:created.created,capturedAt:record.capturedAt,sourceRequests:0};
 }catch(error){await c.query('ROLLBACK').catch(()=>undefined);throw error;}finally{c.release();}
}

import {withSyncAudit,commitWithSyncAudit,pinSyncCall} from './sync-audit.js';
import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {sourceActor,boundOrders,publishMaterialSnapshotsInTransaction} from './service.js';
import {hydrateContractEvidence} from './catalog-evidence.js';
import {hash,sourceKeyValid,sourceUuidValid,SourceError,validateBundle} from './contract.js';
import {adaptAinuokeOrderDiscoverySnapshots} from '../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js';

/** Explicit historical recovery: accepted immutable observation, never new source
 * capture. Keeps original dates and refresh failure; does not finish queued jobs.
 * A pre-existing material head is never replaced, including on receipt replay. */
async function publishHistoricalMaterialObservationImplementation(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,
 input:{sourceKey:string;sourceId:string;orderId:string;observationId:string;expectedHash:string}){
 if(!sourceKeyValid(input.sourceKey)||!sourceUuidValid(input.orderId)||!sourceUuidValid(input.observationId)||!input.sourceId
  ||!/^[a-f0-9]{64}$/.test(input.expectedHash))throw new SourceError('historical_material_scope_invalid');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ainuoke-source:'+input.sourceKey]);
  const actor=await sourceActor(c,identity,true);
  const profile=(await c.query('SELECT enabled,account_fingerprint FROM ainuoke_source_profiles WHERE source_key=$1 FOR SHARE',[input.sourceKey])).rows[0];
  if(!profile?.enabled)throw new SourceError('source_account_mismatch');
  const orders=await boundOrders(c,true,[input.orderId]),order=orders[0];
  if(orders.length!==1)throw new SourceError('source_binding_conflict');
  const link=(await c.query('SELECT external_id,sales_contract_no FROM sales_order_source_links WHERE id=$1',[order.sourceLinkId])).rows[0];
  if(link?.external_id!==input.sourceId||link.sales_contract_no!==order.salesContractNo)throw new SourceError('source_scope_mismatch');
  const row=(await c.query(`SELECT o.*,j.status AS job_status,coalesce(a.account_fingerprint,cr.account_fingerprint) AS proof_fingerprint,
    e.sales_contract_no,e.visible
   FROM ainuoke_contract_observations o JOIN ainuoke_sync_jobs j ON j.id=o.job_id
   JOIN ainuoke_catalog_entries e ON e.source_key=o.source_key AND e.source_id=o.source_id
   LEFT JOIN ainuoke_sync_capture_attempts a ON a.id=j.capture_attempt_id
   LEFT JOIN ainuoke_catalog_runs cr ON cr.request_id=j.id AND cr.source_key=o.source_key
   WHERE o.id=$1 AND o.source_key=$2 AND o.source_id=$3`,[input.observationId,input.sourceKey,input.sourceId])).rows[0];
  if(!row||!row.visible||row.sales_contract_no!==order.salesContractNo||row.job_status!=='complete'
   ||row.proof_fingerprint!==profile.account_fingerprint||row.content_hash!==input.expectedHash||hash(row.evidence)!==input.expectedHash)
   throw new SourceError('historical_material_evidence_invalid');
  const head=(await c.query('SELECT run_id::text,last_error_code FROM ainuoke_material_order_heads WHERE source_key=$1 AND sales_order_id=$2 FOR UPDATE',[input.sourceKey,input.orderId])).rows[0];
  if(head?.last_error_code&&/identity|account|visibility|permission|actor|scope|binding/.test(head.last_error_code))throw new SourceError('historical_material_identity_blocked');
  if(head?.run_id){await commitWithSyncAudit(c);return {status:'existing_head_preserved' as const,runId:head.run_id,sourceRequests:0};}
  const evidence=await hydrateContractEvidence(c,{...row,account_fingerprint:profile.account_fingerprint});
  const directory=(await adaptAinuokeOrderDiscoverySnapshots(evidence.addition.discoveryAfter)).rows;
  if(!directory.some(x=>x.sourceId===input.sourceId&&x.salesContractNo===order.salesContractNo))throw new SourceError('source_scope_mismatch');
  const capturedAt=new Date(row.captured_at).getTime();
  if(!Number.isFinite(capturedAt)||capturedAt>Date.now())throw new SourceError('historical_material_time_invalid');
  // The persisted completed capture is the historical validation instant, not a
  // fabricated fresh timestamp. Its pages must still fit the original 10m window.
  const validated=await validateBundle({schemaVersion:'ainuoke-server-source.v1',discoveryBefore:evidence.addition.discoveryBefore,
   discoveryAfter:evidence.addition.discoveryAfter,materials:{[row.sales_contract_no]:evidence.materials}},orders,capturedAt,600000);
  if(validated.rows.length!==1)throw new SourceError('source_missing');
  const runId=await publishMaterialSnapshotsInTransaction(c,actor,input.sourceKey,validated,orders,{historicalObservationId:input.observationId});
  await commitWithSyncAudit(c);return {status:'historical_published' as const,runId,capturedAt:row.captured_at,sourceRequests:0};
 }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{c.release();}
}

export async function publishHistoricalMaterialObservation(...args:Parameters<typeof publishHistoricalMaterialObservationImplementation>){const pinned=pinSyncCall(args);return withSyncAudit(pinned[0],{sourceKey:pinned[2].sourceKey,type:'historical',historical:true},()=>publishHistoricalMaterialObservationImplementation(...pinned));}

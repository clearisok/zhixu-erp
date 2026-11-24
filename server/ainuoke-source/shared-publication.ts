import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import type { BoundSourceOrder } from './service.js';
import { hash, SourceError, type validateBundle } from './contract.js';
import { businessDigest, packContent, saveSharedPages, type ContentScope } from './shared-content.js';
import { saveCatalogEvidence } from './catalog-evidence.js';
import { auditPublished } from './sync-audit.js';
import { appendOperationLog } from '../operation-logs/repository.js';

/** Caller owns source/profile/order locks and transaction. Hash comparison never skips source validation. */
export async function publishSharedMaterialSnapshots(c:PoolClient,actor:TrustedIdentity,sourceKey:string,validated:Awaited<ReturnType<typeof validateBundle>>,current:BoundSourceOrder[],historical?:{historicalObservationId:string;replaceOlder?:boolean}) {
 const profile=(await c.query('SELECT account_fingerprint FROM ainuoke_source_profiles WHERE source_key=$1',[sourceKey])).rows[0];
 if(!profile)throw new SourceError('source_account_mismatch');
 const captureId=await saveCatalogEvidence(c,sourceKey,profile.account_fingerprint,{...validated.bundle,schemaVersion:'ainuoke-order-addition-discovery.v1'});
 let result:string|null=null;
 for(const row of validated.rows){
  const target=current.find(o=>o.id===row.order.id);
  if(!target)throw new SourceError('source_order_changed');
  const link=(await c.query('SELECT external_id FROM sales_order_source_links WHERE id=$1',[target.sourceLinkId])).rows[0];
  if(!link)throw new SourceError('source_binding_conflict');
  const scope:ContentScope={sourceKey,accountFingerprint:profile.account_fingerprint,sourceId:link.external_id,contract:row.contract,kind:'materials'};
  const packed=await saveSharedPages(c,scope,row.pages);
  // Only this contract's complete approved directory values belong to its state.
  const directoryFacts=validated.bundle.discoveryAfter.flatMap(p=>p.rows).filter(r=>String(r.values.id)===link.external_id).map(({sourceRowIdentity,...r})=>{void sourceRowIdentity;return r;});
  if(directoryFacts.length!==1)throw new SourceError('source_identity_mismatch');
  const stateHash=businessDigest({schemaVersion:'ainuoke-material-state.v1',target,bodyHash:packContent(scope,row.pages).businessHash,directoryFacts});
  const previous=(await c.query(`SELECT h.run_id::text,r.business_hash FROM ainuoke_material_order_heads h JOIN ainuoke_source_runs r ON r.id=h.run_id
   WHERE h.source_key=$1 AND h.sales_order_id=$2 FOR UPDATE OF h`,[sourceKey,target.id])).rows[0];
  const runId:string=previous?.business_hash===stateHash?previous.run_id:randomUUID();
  const changed=runId!==previous?.run_id;
  if(changed){
   await c.query(`INSERT INTO ainuoke_source_runs(id,source_key,actor_user_id,captured_at,discovery,discovery_hash,content_hash,order_scope_hash,order_scope,directory_capture_id,business_hash,origin_observation_id)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10,$11,$12)`,[runId,sourceKey,actor.internalUserId,validated.capturedAt,
    JSON.stringify([{schemaVersion:'ainuoke-shared-directory.v1',captureId}]),hash(validated.bundle.discoveryAfter),validated.contentHash,hash([target]),JSON.stringify([target]),captureId,stateHash,historical?.historicalObservationId??null]);
   await c.query(`INSERT INTO ainuoke_material_source_snapshots(run_id,sales_order_id,sales_contract_no,snapshots,content_hash,attribution_change_id,source_link_id,captured_order_version,material_content_id)
    VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)`,[runId,target.id,row.contract,JSON.stringify([packed]),row.contentHash,target.attributionChangeId,target.sourceLinkId,target.version,packed.contentId]);
   await appendOperationLog(c,actor,{module:'艾诺科同步',action:'采集艾诺科来源',entityType:'AinuokeSourceRun',entityId:runId,
    metadata:{sourceKey,sourceRunId:runId,orderCount:1,sourceOnly:true,storageVersion:2,...(historical?{historicalObservationId:historical.historicalObservationId,historicalPublication:true,sourceRequests:0}:{})}});
  }
  if(historical){
   const head=(await c.query(`SELECT r.captured_at FROM ainuoke_material_order_heads h JOIN ainuoke_source_runs r ON r.id=h.run_id WHERE h.source_key=$1 AND h.sales_order_id=$2`,[sourceKey,target.id])).rows[0];
   if(head&&(!historical.replaceOlder||head.captured_at>=validated.capturedAt)){result??=runId;continue;}
  }
  await c.query(`INSERT INTO ainuoke_material_order_heads(source_key,sales_order_id,run_id,last_error_code,last_attempt_at,last_verified_at,verified_capture_id,verified_material_manifest)
   VALUES($1,$2,$3,NULL,now(),$4,$5,$6::jsonb) ON CONFLICT(source_key,sales_order_id) DO UPDATE SET run_id=excluded.run_id,last_error_code=NULL,last_attempt_at=now(),
   last_verified_at=excluded.last_verified_at,verified_capture_id=excluded.verified_capture_id,verified_material_manifest=excluded.verified_material_manifest`,
   [sourceKey,target.id,runId,validated.capturedAt,captureId,JSON.stringify(packed)]);
  await auditPublished(c,sourceKey,runId,row.pages,row.contract,undefined,!changed);
  result??=runId;
 }
 for(const target of current.filter(o=>!validated.rows.some(r=>r.order.id===o.id)))await c.query(`UPDATE ainuoke_material_order_heads SET last_error_code='source_visibility_changed',last_attempt_at=now() WHERE source_key=$1 AND sales_order_id=$2`,[sourceKey,target.id]);
 if(!result)throw new SourceError('source_missing');
 await auditPublished(c,sourceKey,result,{discoveryBefore:validated.bundle.discoveryBefore,discoveryAfter:validated.bundle.discoveryAfter},'',['ainuoke_source_runs']);
 return result;
}

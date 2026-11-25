import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import type { BoundSourceOrder } from './service.js';
import { hash, SourceError, sourceIdText,type validateBundle } from './contract.js';
import { businessCanonical,businessDigest, saveSharedPages, type ContentScope } from './shared-content.js';
import { saveCatalogEvidence,hydrateSourceDirectory,loadContractDirectoryRows } from './catalog-evidence.js';
import { auditPublished,auditDirectoryEvidence } from './sync-audit.js';
import { appendOperationLog } from '../operation-logs/repository.js';

/** Caller owns source/profile/order locks and transaction. Hash comparison never skips source validation. */
export async function publishSharedMaterialSnapshots(c:PoolClient,actor:TrustedIdentity,sourceKey:string,validated:Awaited<ReturnType<typeof validateBundle>>,current:BoundSourceOrder[],historical?:{historicalObservationId:string;replaceOlder?:boolean;externalArchive?:boolean}) {
 const profile=(await c.query('SELECT account_fingerprint FROM ainuoke_source_profiles WHERE source_key=$1',[sourceKey])).rows[0];
 if(!profile)throw new SourceError('source_account_mismatch');
 const captureId=await saveCatalogEvidence(c,sourceKey,profile.account_fingerprint,{...validated.bundle,schemaVersion:'ainuoke-order-addition-discovery.v1'});
 await auditDirectoryEvidence(c,captureId);
 let result:string|null=null;
 for(const row of validated.rows){
  const target=current.find(o=>o.id===row.order.id);
  if(!target)throw new SourceError('source_order_changed');
  const link=(await c.query('SELECT external_id FROM sales_order_source_links WHERE id=$1',[target.sourceLinkId])).rows[0];
  if(!link)throw new SourceError('source_binding_conflict');
  const scope:ContentScope={sourceKey,accountFingerprint:profile.account_fingerprint,sourceId:link.external_id,contract:row.contract,kind:'materials'};
  const packed=await saveSharedPages(c,scope,row.pages);
  // Only this contract's complete approved directory values belong to its state.
  const directoryFacts=validated.bundle.discoveryAfter.flatMap(p=>p.rows).filter(r=>sourceIdText(r.values.id)===link.external_id).map(({sourceRowIdentity,...r})=>{void sourceRowIdentity;return r;});
  if(directoryFacts.length!==1)throw new SourceError('source_identity_mismatch');
  const bodyHash=(await c.query('SELECT business_hash FROM ainuoke_contract_contents WHERE id=$1',[packed.contentId])).rows[0]?.business_hash;
  if(!bodyHash)throw new SourceError('content_integrity_failure');
  const stateHash=businessDigest({schemaVersion:'ainuoke-material-state.v1',target,bodyHash,directoryFacts});
  const previous=(await c.query(`SELECT h.run_id::text,h.last_error_code,s.material_content_id,r.order_scope,r.discovery,r.directory_capture_id,coalesce(s.business_hash,r.business_hash) AS business_hash FROM ainuoke_material_order_heads h JOIN ainuoke_source_runs r ON r.id=h.run_id
   JOIN ainuoke_material_source_snapshots s ON s.run_id=h.run_id AND s.sales_order_id=h.sales_order_id
   WHERE h.source_key=$1 AND h.sales_order_id=$2 FOR UPDATE OF h`,[sourceKey,target.id])).rows[0];
  let sameFacts=false;
  if(previous){
   const oldRows=previous.directory_capture_id?await loadContractDirectoryRows(c,sourceKey,previous.directory_capture_id,profile.account_fingerprint,link.external_id)
    :(await hydrateSourceDirectory(c,sourceKey,previous.discovery)).flatMap(p=>p.rows).filter(r=>sourceIdText(r.values.id)===link.external_id);
   const oldFacts=oldRows.map(({sourceRowIdentity,...r})=>{void sourceRowIdentity;return r;});
   sameFacts=businessCanonical(oldFacts)===businessCanonical(directoryFacts);
   if(previous.business_hash===stateHash&&(!sameFacts||previous.material_content_id!==packed.contentId||businessCanonical(previous.order_scope.find((r:{id:string})=>r.id===target.id))!==businessCanonical(target)))throw new SourceError('content_hash_collision');
  }
  const runId:string=previous?.business_hash===stateHash&&previous.last_error_code!=='source_visibility_changed'?previous.run_id:randomUUID();
  const changed=runId!==previous?.run_id;
  const recordKind=!previous?'initial':sameFacts&&previous.material_content_id===packed.contentId?'context':'change';
  if(changed){
   await c.query(`INSERT INTO ainuoke_source_runs(id,source_key,actor_user_id,captured_at,discovery,discovery_hash,content_hash,order_scope_hash,order_scope,directory_capture_id,business_hash,origin_observation_id,record_kind)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,[runId,sourceKey,actor.internalUserId,validated.capturedAt,
    JSON.stringify([{schemaVersion:'ainuoke-shared-directory.v1',captureId}]),hash(validated.bundle.discoveryAfter),validated.contentHash,hash([target]),JSON.stringify([target]),captureId,stateHash,historical?.externalArchive?null:historical?.historicalObservationId??null,recordKind]);
   await c.query(`INSERT INTO ainuoke_material_source_snapshots(run_id,sales_order_id,sales_contract_no,snapshots,content_hash,attribution_change_id,source_link_id,captured_order_version,material_content_id,business_hash)
    VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10)`,[runId,target.id,row.contract,JSON.stringify([packed]),row.contentHash,target.attributionChangeId,target.sourceLinkId,target.version,packed.contentId,stateHash]);
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
 for(const target of current.filter(o=>!validated.rows.some(r=>r.order.id===o.id)))await c.query(`INSERT INTO ainuoke_material_order_heads(source_key,sales_order_id,run_id,last_error_code,last_attempt_at)
  VALUES($1,$2,NULL,'source_visibility_changed',now()) ON CONFLICT(source_key,sales_order_id) DO UPDATE SET last_error_code='source_visibility_changed',last_attempt_at=now()`,[sourceKey,target.id]);
 if(!result)throw new SourceError('source_visibility_changed');
 await auditPublished(c,sourceKey,result,{discoveryBefore:validated.bundle.discoveryBefore,discoveryAfter:validated.bundle.discoveryAfter},'',['ainuoke_source_runs']);
 return result;
}

import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {permissionsForUser,requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {identityUuid} from './identity-model.js';
import {readLegacyOrderCommercialEvidence} from '../confirmed-commercial-terms/service.js';
import {projectCommercialTerms} from '../confirmed-commercial-terms/read-projection.js';
import {readOrderCommercialState} from './commercial-version-service.js';
import {projectOrderCommercialState} from './commercial-projection.js';
/** Explicit bounded selection only. One read-only snapshot; never adopts or backfills historical prices. */
export async function previewLegacyCommercialCutover(pool:Pool,actor:TrustedIdentity,raw:Record<string,unknown>){
 if(Object.keys(raw).length!==1||!Array.isArray(raw.salesOrderIds)||raw.salesOrderIds.length<1||raw.salesOrderIds.length>100||raw.salesOrderIds.some(id=>typeof id!=='string'||!identityUuid.test(id)))throw new HttpError(400,'invalid_legacy_preview_scope','Select 1 to 100 explicit order IDs');
 const ids=(raw.salesOrderIds as string[]).map(id=>id.toLowerCase());if(new Set(ids).size!==ids.length)throw new HttpError(400,'duplicate_preview_order','Duplicate order ID');
 const client=await pool.connect();try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const user=(await client.query('SELECT active,public_id::text FROM app_users WHERE id=$1',[actor.internalUserId])).rows[0];if(!user?.active||user.public_id!==actor.userId)throw new HttpError(401,'authentication_required','Authentication required');
  const currentActor={...actor,permissions:await permissionsForUser(client,actor.internalUserId)};
  for(const p of ['order.view','audit_log.view','commercial.sale.view','commercial.labor.view'] as const)requirePermission(currentActor.permissions,p);
  const observedAt=(await client.query('SELECT transaction_timestamp() AS at')).rows[0].at.toISOString();
  const items=[];
  for(const id of ids){
   try{
    const legacy=await readLegacyOrderCommercialEvidence(client,id),adopted=await readOrderCommercialState(client,id);
    items.push({salesOrderId:id,status:legacy.current?'legacy_current_observed':'legacy_price_unverified',legacy:projectCommercialTerms(currentActor,legacy),adopted:projectOrderCommercialState(currentActor,adopted)});
   }catch(e){if(!(e instanceof HttpError))throw e;items.push({salesOrderId:id,status:'unverified',code:e.code});}
  }
  await client.query('COMMIT');return {schemaVersion:'order-commercial-cutover-preview.v1',observedAt,scope:'explicit-order-ids',originalOrderPrice:'not-proven',databaseWrites:'none',items};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

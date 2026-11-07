import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {hash,SourceError} from './contract.js';
import {sourceActor} from './service.js';
import {requestContractSync} from './sync-queue.js';

/** Durable recovery uses ordinary request receipts and retries. Replaying the
 * same recovery identity never starts another capture for a completed request. */
export async function requestMaterialRecovery(pool:Pool,identity:TrustedIdentity,input:{sourceKey:string;sourceIds:readonly string[];recoveryId:string}) {
 await sourceActor(pool,identity,true);
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.recoveryId)||!input.sourceIds.length||input.sourceIds.length>1400||input.sourceIds.some(id=>!id.trim())||new Set(input.sourceIds).size!==input.sourceIds.length)throw new SourceError('material_recovery_scope_invalid');
 const entries=(await pool.query(`SELECT e.source_id,e.sales_contract_no FROM ainuoke_catalog_entries e
   JOIN sales_order_source_links l ON l.external_id=e.source_id AND l.sales_contract_no=e.sales_contract_no
     AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract'
   WHERE e.source_key=$1 AND e.source_id=ANY($2::text[]) AND e.visible=true`,[input.sourceKey,input.sourceIds])).rows;
 if(entries.length!==input.sourceIds.length)throw new SourceError('material_recovery_binding_missing');
 const receipts=[];
 for(const sourceId of input.sourceIds){
  const h=hash({recoveryId:input.recoveryId,sourceKey:input.sourceKey,sourceId});
  const requestId=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
  receipts.push({sourceId,...await requestContractSync(pool,identity,{sourceKey:input.sourceKey,sourceId,requestId})});
 }
 return receipts;
}

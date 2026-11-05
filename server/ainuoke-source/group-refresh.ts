import type { Pool } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { parseCollectorConfig, accountFingerprint, type CollectorConfig } from './collector.js';
import { SourceError, hash } from './contract.js';
import { sourceActor, boundOrders, captureSource } from './service.js';
import { requireAdditionProfile, selectContracts } from './additions.js';
import { collectSelectedSourceOnce, validateSelectedSourceOnce, type SelectedSourceRequest } from './selected-source-once.js';
import { followupModes } from './followup.js';

/** One selected group, one bounded capture. Reusing the request never sends HTTP again. */
export async function refreshFollowupGroup(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,config:CollectorConfig,
 input:{contracts:string[];expectedScopeHash:string;requestId:string},
 collect?:(config:CollectorConfig,request:SelectedSourceRequest)=>Promise<unknown>) {
 const checked=parseCollectorConfig(config),contracts=selectContracts(input.contracts.join(','));
 if(!/^[a-f0-9]{64}$/.test(input.expectedScopeHash)||!/^[a-f0-9-]{36}$/i.test(input.requestId))throw new SourceError('source_group_invalid');
 const actor=await sourceActor(pool,identity,true);
 await requireAdditionProfile(pool,checked.sourceKey,accountFingerprint(checked));
 const digest=hash({sourceKey:checked.sourceKey,account:accountFingerprint(checked),contracts,scope:input.expectedScopeHash});
 const previous=(await pool.query('SELECT request_hash,status,result FROM ainuoke_material_group_requests WHERE actor_user_id=$1 AND request_id=$2',[actor.internalUserId,input.requestId])).rows[0];
 if(previous){if(previous.request_hash!==digest)throw new SourceError('source_group_request_conflict');return {status:previous.status,result:previous.result,replayed:true};}
 const targets=(await boundOrders(pool)).filter(o=>contracts.includes(o.salesContractNo!)),followups=await followupModes(pool,targets.map(o=>o.id));
 if(targets.length!==contracts.length||hash({sourceKey:checked.sourceKey,orders:targets,followups})!==input.expectedScopeHash)throw new SourceError('source_group_changed');
 const inserted=await pool.query(`INSERT INTO ainuoke_material_group_requests(actor_user_id,request_id,source_key,request_hash,status)
  VALUES($1,$2,$3,$4,'running') ON CONFLICT DO NOTHING RETURNING request_id`,[actor.internalUserId,input.requestId,checked.sourceKey,digest]);
 if(!inserted.rowCount)throw new SourceError('source_group_request_in_progress');
 try {
  const result=await captureSource(pool,identity,{sourceKey:checked.sourceKey,accountFingerprint:accountFingerprint(checked),maxAgeMs:600000,
   requireExistingProfile:true,selectedOrderIds:targets.map(o=>o.id),expectedScopeHash:input.expectedScopeHash,collect:async current=>{
    if(hash([...current].sort())!==hash(contracts))throw new SourceError('source_group_changed');
    const request:SelectedSourceRequest={mode:'bound-materials',targets};
    const captured=collect?await validateSelectedSourceOnce(await collect(checked,request),checked,request):await collectSelectedSourceOnce(checked,request);
    if(captured.result!=='complete')throw new SourceError(captured.code);
    if(captured.mode!=='bound-materials')throw new SourceError('source_group_invalid');
    return captured.bundle;
   }});
  await pool.query("UPDATE ainuoke_material_group_requests SET status='complete',result=$3::jsonb WHERE actor_user_id=$1 AND request_id=$2 AND status='running'",[actor.internalUserId,input.requestId,JSON.stringify(result)]);
  return {status:'complete',result,replayed:false};
 }catch(e){
  const result={code:e instanceof SourceError?e.code:'source_group_result_unknown'};
  await pool.query("UPDATE ainuoke_material_group_requests SET status='failed',result=$3::jsonb WHERE actor_user_id=$1 AND request_id=$2 AND status='running'",[actor.internalUserId,input.requestId,JSON.stringify(result)]).catch(()=>undefined);
  throw e;
 }
}

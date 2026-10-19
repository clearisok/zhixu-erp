import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {requireOrderCommandActor} from '../sales-orders/identity-service.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {sourceActor,boundOrders,type BoundSourceOrder} from './service.js';
import {hash,SourceError} from './contract.js';
import {parsePaymentCollectionRequest,paymentDatabaseFingerprint,type PaymentCollectionRequest} from './payment-request-collection.js';
import {assertPaymentOperatorPermitFresh,parsePaymentOperatorPermit,paymentOperatorPayloadHash,
 reservePaymentOperatorCommand,completePaymentOperatorCommand,type PaymentOperatorPermit} from './payment-operator-command-store.js';
import {assertPaymentTargetVerification,type PaymentTargetVerification} from './payment-target-verification.js';

type Identity=Pick<TrustedIdentity,'internalUserId'|'userId'>;
type Action='enable'|'disable';
type TargetRow={account_fingerprint:string;enabled:boolean;verification_sha256:string|null;version:number};
type TargetState={alias:string;salesOrderId:string;binding:BoundSourceOrder|null;target:TargetRow|null;generation:number};
const fail=(code:string):never=>{throw new SourceError(code);};
const sha=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);

async function scope(pool:Pool,client:PoolClient,caller:Identity,request:PaymentCollectionRequest,action:Action,proof:PaymentTargetVerification|null,lock:boolean){
 let actor=await sourceActor(client,caller,true,lock);
 requirePermission(actor.permissions,'ainuoke.bind');
 if(lock){await requireOrderCommandActor(client,actor,'ainuoke.bind');actor=await sourceActor(client,caller,true);}
 if(actor.username!==request.config.operatorUsername)fail('payment_collection_operator_mismatch');
 if(action!=='enable'&&action!=='disable')fail('payment_operator_invalid_action');
 const profile=(await client.query(`SELECT account_fingerprint,enabled FROM ainuoke_source_profiles WHERE source_key=$1 ${lock?'FOR SHARE':''}`,
  [request.config.sourceKey])).rows[0];
 if(!profile)fail('payment_operator_profile_missing');
 if(action==='enable'&&(!profile.enabled||profile.account_fingerprint!==request.selection.sourceFingerprint))fail('payment_operator_profile_mismatch');
 if(action==='enable'){
  assertPaymentTargetVerification(proof);
  if(!sha(proof.proofSha256)||proof.sourceFingerprint!==request.selection.sourceFingerprint||proof.selectionHash!==hash(request.selection))
   fail('payment_operator_verification_required');
 }
 if(lock){
  await client.query('SELECT lock_order_attribution_write_guard()');
  for(const target of [...request.targets].sort((a,b)=>a.salesOrderId.localeCompare(b.salesOrderId)))
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ainuoke-payment:'+request.config.sourceKey+':'+target.salesOrderId]);
 }
 // Stopping a source must not depend on unrelated binding health, historical
 // ownership or a fresh upstream proof. Enabling retains the full identity gate.
 const bound=action==='enable'?await boundOrders(client,lock):[],targets:TargetState[]=[];
 for(const [index,target] of request.targets.entries()){
  const binding=bound.find(row=>row.id===target.salesOrderId)??null;
  const current=(await client.query<TargetRow>(`SELECT account_fingerprint,enabled,verification_sha256,version FROM ainuoke_payment_source_targets
   WHERE source_key=$1 AND sales_order_id=$2::uuid ${lock?'FOR UPDATE':''}`,[request.config.sourceKey,target.salesOrderId])).rows[0]??null;
  if(action==='enable'&&(!binding||binding.salesContractNo!==request.selection.targets[index].salesContractNo))fail('payment_collection_binding_mismatch');
  if(action==='enable'&&current&&current.account_fingerprint!==request.selection.sourceFingerprint)fail('payment_operator_target_account_mismatch');
  const generation=(await client.query('SELECT generation FROM ainuoke_payment_heads WHERE source_key=$1 AND sales_order_id=$2::uuid',
   [request.config.sourceKey,target.salesOrderId])).rows[0]?.generation??0;
  targets.push({alias:target.alias,salesOrderId:target.salesOrderId,binding,target:current,generation});
 }
 const databaseFingerprint=await paymentDatabaseFingerprint(pool,client);
 return {actor,databaseFingerprint,profile,targets};
}
function reviewHash(state:Awaited<ReturnType<typeof scope>>,request:PaymentCollectionRequest,action:Action,proof:PaymentTargetVerification|null,permit:Pick<PaymentOperatorPermit,'requestId'|'expiresAt'>){
 return hash({schemaVersion:'ainuoke-payment-target-plan.v1',databaseFingerprint:state.databaseFingerprint,
  actor:{internalUserId:state.actor.internalUserId,userId:state.actor.userId},sourceKey:request.config.sourceKey,
  selection:request.selection,action,verification:action==='enable'?proof:null,profile:state.profile,targets:state.targets,
  requestId:permit.requestId,expiresAt:permit.expiresAt});
}
export async function planPaymentTargets(pool:Pool,caller:Identity,input:PaymentCollectionRequest,action:Action,proof:PaymentTargetVerification|null,
 permitInput:Pick<PaymentOperatorPermit,'requestId'|'expiresAt'>,now=Date.now()){
 const request=parsePaymentCollectionRequest(input),permit=parsePaymentOperatorPermit({...permitInput,scopeHash:'0'.repeat(64)});
 assertPaymentOperatorPermitFresh(permit,now);
 const client=await pool.connect();try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const state=await scope(pool,client,caller,request,action,proof,false);
  const result={schemaVersion:'ainuoke-payment-target-plan.v1' as const,action,sourceKey:request.config.sourceKey,
   databaseFingerprint:state.databaseFingerprint,requestId:permit.requestId,expiresAt:permit.expiresAt,
   scopeHash:reviewHash(state,request,action,proof,permit),targets:state.targets,
   sourceRead:'none' as const,databaseWrites:'none' as const,authorization:'not_granted_by_plan' as const};
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

/** Explicit, atomic two-target change. Replays return the historical receipt,
 * never re-enable a target that has since been disabled or republish old data. */
export async function applyPaymentTargets(pool:Pool,caller:Identity,input:PaymentCollectionRequest,action:Action,proof:PaymentTargetVerification|null,
 permitInput:PaymentOperatorPermit,now=Date.now()){
 const request=parsePaymentCollectionRequest(input),permit=parsePaymentOperatorPermit(permitInput);
 const command={sourceKey:request.config.sourceKey,kind:action,permit,payloadHash:paymentOperatorPayloadHash(action,permit.scopeHash,permit.expiresAt,
  {sourceKey:request.config.sourceKey,operatorUsername:request.config.operatorUsername,selection:request.selection,targets:request.targets,
   verificationSha256:action==='enable'?proof?.proofSha256:null})};
 const client=await pool.connect();let committing=false;
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
  let actor=await sourceActor(client,caller,true);await requireOrderCommandActor(client,actor,'ainuoke.bind');
  actor=await sourceActor(client,caller,true);
  if(actor.username!==request.config.operatorUsername)fail('payment_collection_operator_mismatch');
  const reserved=await reservePaymentOperatorCommand(client,actor,command,now);
  if(!reserved.reserved){
   await client.query('ROLLBACK');return {schemaVersion:'ainuoke-payment-operator-result.v1' as const,requestId:permit.requestId,
    receiptState:reserved.stored.state==='completed'?'completed' as const:'unverified_started' as const,
    replayed:true,result:reserved.stored.result,sourceRead:'none' as const,receiptIsHistorical:true};
  }
  const state=await scope(pool,client,actor,request,action,proof,true);
  if(reviewHash(state,request,action,proof,permit)!==permit.scopeHash)fail('payment_operator_scope_changed');
  const outcomes=[];
  for(const target of state.targets){
   const desired=action==='enable',before=target.target;
   const changed=desired?(!before||!before.enabled||before.verification_sha256!==proof!.proofSha256):Boolean(before?.enabled);
   let version=before?.version??0;
   if(changed){
    if(before){version=before.version+1;const updated=await client.query(`UPDATE ainuoke_payment_source_targets
     SET enabled=$3,verification_sha256=$4,version=$5 WHERE source_key=$1 AND sales_order_id=$2::uuid AND version=$6`,
     [request.config.sourceKey,target.salesOrderId,desired,desired?proof!.proofSha256:before.verification_sha256,version,before.version]);
     if(updated.rowCount!==1)fail('payment_operator_scope_changed');
    }else{version=1;await client.query(`INSERT INTO ainuoke_payment_source_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256)
     VALUES($1,$2,$3,true,$4)`,[request.config.sourceKey,target.salesOrderId,request.selection.sourceFingerprint,proof!.proofSha256]);}
   }
   outcomes.push({alias:target.alias,version,changed,enabled:desired});
  }
  const result={schemaVersion:'ainuoke-payment-target-result.v1',requestId:permit.requestId,action,targets:outcomes,
   changedTargets:outcomes.filter(row=>row.changed).length,sourceRead:'none',snapshotsPublished:0};
  await appendOperationLog(client,actor,{operationId:'payment-target-'+permit.requestId,module:'艾诺科同步',action:'启停艾诺科货款来源',
   entityType:'AinuokePaymentTarget',entityId:permit.requestId,metadata:{sourceReportId:'6086941',scopeHash:permit.scopeHash,action,
    sourceKey:request.config.sourceKey,targets:outcomes,sourceOnly:true}});
  await completePaymentOperatorCommand(client,actor.internalUserId,command,result);
  committing=true;await client.query('COMMIT');
  return {schemaVersion:'ainuoke-payment-operator-result.v1' as const,requestId:permit.requestId,receiptState:'completed' as const,
   replayed:false,result,sourceRead:'none' as const,receiptIsHistorical:false};
 }catch(error){
  await client.query('ROLLBACK').catch(()=>undefined);
  if(committing)return {schemaVersion:'ainuoke-payment-operator-result.v1' as const,requestId:permit.requestId,receiptState:'unverified_commit' as const,
   replayed:false,result:null,sourceRead:'none' as const,receiptIsHistorical:false};
  throw error;
 }finally{client.release();}
}

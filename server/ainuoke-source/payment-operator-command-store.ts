import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {SourceError,hash,sourceKeyValid} from './contract.js';
import {sourceActor} from './service.js';
import {UUID_PATTERN} from '../sales-orders/delivery-plan-model.js';

export type PaymentOperatorKind='enable'|'disable'|'collect';
export type PaymentOperatorPermit={requestId:string;scopeHash:string;expiresAt:string};
export type PaymentOperatorCommand={sourceKey:string;kind:PaymentOperatorKind;permit:PaymentOperatorPermit;payloadHash:string};
type Identity=Pick<TrustedIdentity,'internalUserId'|'userId'>;
export type PaymentOperatorStoredCommand={sourceKey:string;kind:PaymentOperatorKind;scopeHash:string;payloadHash:string;
 state:'started'|'completed';result:Record<string,unknown>|null;startedAt:string;completedAt:string|null};
const fail=(code:string):never=>{throw new SourceError(code);};
const sha=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);

export function parsePaymentOperatorPermit(value:unknown):PaymentOperatorPermit{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail('payment_operator_invalid_permit');
 const row=value as Record<string,unknown>;
 if(Object.keys(row).sort().join(',')!=='expiresAt,requestId,scopeHash'||typeof row.requestId!=='string'
  ||!UUID_PATTERN.test(row.requestId)||!sha(row.scopeHash)||typeof row.expiresAt!=='string'
  ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(row.expiresAt)
  ||!Number.isFinite(Date.parse(row.expiresAt))||new Date(row.expiresAt).toISOString()!==row.expiresAt)
  return fail('payment_operator_invalid_permit');
 return {requestId:row.requestId.toLowerCase(),scopeHash:row.scopeHash as string,expiresAt:row.expiresAt};
}
export function assertPaymentOperatorPermitFresh(permit:PaymentOperatorPermit,now:number){
 if(!Number.isFinite(now)||now<0||Date.parse(permit.expiresAt)<=now||Date.parse(permit.expiresAt)>now+600000)
  fail('payment_operator_permit_expired');
}
function checked(command:PaymentOperatorCommand){
 if(!sourceKeyValid(command.sourceKey)||!['enable','disable','collect'].includes(command.kind)||!sha(command.payloadHash))
  fail('payment_operator_invalid_command');
 return {...command,permit:parsePaymentOperatorPermit(command.permit)};
}
function map(row:Record<string,unknown>):PaymentOperatorStoredCommand{
 const startedAt=row.started_at instanceof Date?row.started_at.toISOString():String(row.started_at);
 const completedAt=row.completed_at instanceof Date?row.completed_at.toISOString():row.completed_at==null?null:String(row.completed_at);
 return {sourceKey:String(row.source_key),kind:row.kind as PaymentOperatorKind,scopeHash:String(row.scope_hash),payloadHash:String(row.payload_hash),
  state:row.state as 'started'|'completed',result:row.result as Record<string,unknown>|null,startedAt,completedAt};
}

/** The caller holds its transaction and fresh actor grants. Same request IDs
 * serialize before any worker call; a started receipt is never a retry lease. */
export async function reservePaymentOperatorCommand(client:PoolClient,actor:TrustedIdentity,input:PaymentOperatorCommand,now:number){
 const command=checked(input);
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
  ['ainuoke-payment-operator:'+actor.internalUserId+':'+command.permit.requestId]);
 const existing=(await client.query('SELECT * FROM ainuoke_payment_operator_commands WHERE actor_id=$1 AND request_id=$2::uuid FOR UPDATE',
  [actor.internalUserId,command.permit.requestId])).rows[0];
 if(existing){
  const stored=map(existing);
  if(stored.sourceKey!==command.sourceKey||stored.kind!==command.kind||stored.scopeHash!==command.permit.scopeHash||stored.payloadHash!==command.payloadHash)
   fail('payment_operator_request_conflict');
  return {reserved:false as const,stored};
 }
 assertPaymentOperatorPermitFresh(command.permit,now);
 await client.query(`INSERT INTO ainuoke_payment_operator_commands(actor_id,request_id,source_key,kind,scope_hash,payload_hash,state)
  VALUES($1,$2,$3,$4,$5,$6,'started')`,[actor.internalUserId,command.permit.requestId,command.sourceKey,command.kind,command.permit.scopeHash,command.payloadHash]);
 return {reserved:true as const,stored:null};
}

export async function completePaymentOperatorCommand(client:PoolClient,actorId:string,input:PaymentOperatorCommand,result:Record<string,unknown>){
 const command=checked(input),encoded=JSON.stringify(result);
 if(Buffer.byteLength(encoded,'utf8')>65536)fail('payment_operator_receipt_limit');
 const changed=await client.query(`UPDATE ainuoke_payment_operator_commands SET state='completed',result=$6::jsonb,completed_at=clock_timestamp()
  WHERE actor_id=$1 AND request_id=$2::uuid AND source_key=$3 AND scope_hash=$4 AND payload_hash=$5 AND state='started'`,
 [actorId,command.permit.requestId,command.sourceKey,command.permit.scopeHash,command.payloadHash,encoded]);
 if(changed.rowCount!==1)fail('payment_operator_receipt_conflict');
}

/** Scoped technical readback. It never acquires a worker lease or retries IO. */
export async function readPaymentOperatorCommand(pool:Pool,caller:Identity,sourceKey:string,requestId:string){
 if(!sourceKeyValid(sourceKey)||!UUID_PATTERN.test(requestId))fail('payment_operator_invalid_command');
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const actor=await sourceActor(client,caller,true,false);
  const row=(await client.query('SELECT * FROM ainuoke_payment_operator_commands WHERE actor_id=$1 AND request_id=$2::uuid AND source_key=$3',
   [actor.internalUserId,requestId,sourceKey])).rows[0];
  if(row&&row.kind!=='collect')requirePermission(actor.permissions,'ainuoke.bind');
  const stored=row?map(row):null;
  await client.query('COMMIT');return stored;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export function paymentOperatorPayloadHash(kind:PaymentOperatorKind,scopeHash:string,expiresAt:string){
 return hash({schemaVersion:'ainuoke-payment-operator-command.v1',kind,scopeHash,expiresAt});
}

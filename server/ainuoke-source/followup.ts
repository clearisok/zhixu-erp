import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { hash, SourceError } from './contract.js';
import { boundOrders, sourceActor } from './service.js';

export async function supportsOrderHeads(c:Pool|PoolClient) {
 return (await c.query("SELECT to_regclass('public.ainuoke_material_order_heads') IS NOT NULL AS supported")).rows[0].supported===true;
}
export async function followupModes(c:Pool|PoolClient,ids:readonly string[]) {
 const rows=(await c.query<{sales_order_id:string;mode:'active'|'history';version:number}>(
  'SELECT sales_order_id::text,mode,version FROM ainuoke_order_followups WHERE sales_order_id=ANY($1::uuid[]) ORDER BY sales_order_id',[ids])).rows;
 return ids.map(id=>{const row=rows.find(r=>r.sales_order_id===id);return {id,mode:row?.mode??'active',version:row?.version??0};});
}
export async function setFollowup(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,input:{orderId:string;mode:'active'|'history';expectedVersion:number;requestId:string}) {
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!uuid.test(input.orderId)||!uuid.test(input.requestId)||!['active','history'].includes(input.mode)
  ||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)throw new SourceError('followup_invalid');
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['ainuoke-followup-request:'+identity.internalUserId+':'+input.requestId]);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['ainuoke-followup:'+input.orderId]);
  const actor=await sourceActor(c,identity,true);requirePermission(actor.permissions,'ainuoke.bind');
  const digest=hash(input),old=(await c.query('SELECT request_hash,result FROM ainuoke_followup_receipts WHERE actor_user_id=$1 AND request_id=$2',[actor.internalUserId,input.requestId])).rows[0];
  if(old){if(old.request_hash!==digest)throw new SourceError('followup_request_conflict');await c.query('COMMIT');return {...old.result,replayed:true};}
  await c.query('SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE',[input.orderId]);
  if((await boundOrders(c,true,[input.orderId])).length!==1)throw new SourceError('followup_order_not_available');
  const before=(await followupModes(c,[input.orderId]))[0];
  if(before.version!==input.expectedVersion)throw new SourceError('followup_version_conflict');
  const result={orderId:input.orderId,mode:input.mode,version:before.version+1,requestId:input.requestId};
  await c.query(`INSERT INTO ainuoke_order_followups(sales_order_id,mode,version,updated_by) VALUES($1,$2,$3,$4)
   ON CONFLICT(sales_order_id) DO UPDATE SET mode=excluded.mode,version=excluded.version,updated_by=excluded.updated_by,updated_at=now()`,[input.orderId,input.mode,result.version,actor.internalUserId]);
  await appendOperationLog(c,actor,{module:'订单中心',action:input.mode==='active'?'加入持续跟进':'转为历史查阅',entityType:'SalesOrder',entityId:input.orderId,
   beforeData:{values:{followup:before.mode}},afterData:{values:{followup:input.mode}},metadata:{requestId:input.requestId,financialChanges:false}});
  await c.query('INSERT INTO ainuoke_followup_receipts(actor_user_id,request_id,request_hash,result) VALUES($1,$2,$3,$4::jsonb)',[actor.internalUserId,input.requestId,digest,JSON.stringify(result)]);
  await c.query('COMMIT');return {...result,replayed:false};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

/** Deterministic oldest-attempt-first groups. It makes no Source requests. */
export async function planFollowupGroups(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,sourceKey:string,batchSize=5) {
 if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>25)throw new SourceError('followup_batch_size_invalid');
 const c=await pool.connect();
 try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await sourceActor(c,identity,true,false);
  const orders=await boundOrders(c),modes=await followupModes(c,orders.map(o=>o.id));
  const attempts=(await c.query('SELECT sales_order_id::text,last_attempt_at FROM ainuoke_material_order_heads WHERE source_key=$1',[sourceKey])).rows;
  const active=orders.sort((a,b)=>{
   const time=(id:string)=>{const t=attempts.find(r=>r.sales_order_id===id)?.last_attempt_at;return t?new Date(t).getTime():0;};
   return time(a.id)-time(b.id)||a.id.localeCompare(b.id);
  });
  const groups=[];
  for(let i=0;i<active.length;i+=batchSize){const selected=active.slice(i,i+batchSize).sort((a,b)=>a.id.localeCompare(b.id)),followups=modes.filter(m=>selected.some(o=>o.id===m.id));
   groups.push({orderIds:selected.map(o=>o.id),contracts:selected.map(o=>o.salesContractNo),scopeHash:hash({sourceKey,orders:selected,followups})});}
  await c.query('COMMIT');return {boundOrders:active.length,groups,batchSize};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

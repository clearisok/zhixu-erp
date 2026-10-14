import {lockEffectiveAttribution} from './effective-attribution.js';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { identityUuid } from './identity-model.js';
import { requireNormalizationAdmin, collectNormalizationEvidenceInTransaction } from './normalization-preview.js';
import { parseCaseOpen, parseCaseEvent, caseCommandHash } from './normalization-case-model.js';
function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
function caseId(value:string){if(!identityUuid.test(value))fail(400,'invalid_normalization_case_id');return value.toLowerCase();}
type Receipt={caseId:string;eventId:string;version:number};
async function previous(client:PoolClient,actor:TrustedIdentity,requestId:string,hash:string):Promise<Receipt|null>{
 const row=(await client.query('SELECT id::text,case_id::text,version,payload_hash FROM sales_order_normalization_case_events WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,requestId])).rows[0];
 if(!row)return null;if(row.payload_hash!==hash)fail(409,'normalization_request_mismatch');return {caseId:row.case_id,eventId:row.id,version:row.version};
}
async function transaction<T>(pool:Pool,actor:TrustedIdentity,requestId:string,run:(client:PoolClient,current:TrustedIdentity)=>Promise<T>):Promise<T>{
 for(let attempt=0;attempt<3;attempt++){
  const client=await pool.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
   await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
   await lockEffectiveAttribution(client);
   const current=await requireNormalizationAdmin(client,actor,true);
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`normalization-request:${current.internalUserId}:${requestId}`]);
   const result=await run(client,current);await client.query('COMMIT');return result;
  }catch(error){
   await client.query('ROLLBACK');
   const code=(error as {code?:string}).code;
   if((code==='40001'||code==='23505')&&attempt<2)continue;
   if(code==='40001'||code==='23505'||code==='55P03')fail(409,'normalization_concurrency_conflict');
   throw error;
  }finally{client.release();}
 }
 throw new Error('Unreachable normalization transaction');
}
async function appendEvent(client:PoolClient,current:TrustedIdentity,id:string,version:number,eventType:string,requestId:string,hash:string,reason:string,evidence:unknown):Promise<Receipt>{
 const row=(await client.query(`INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`,[id,version,current.internalUserId,requestId,hash,eventType,reason,JSON.stringify(evidence)])).rows[0];
 await appendOperationLog(client,current,{module:'订单中心',action:'维护订单身份',entityType:'OrderNormalizationCase',entityId:id,afterData:{values:{caseId:id,version,eventType,reason}},metadata:{eventId:row.id,executionAuthorized:false}});
 return {caseId:id,eventId:row.id,version};
}
export async function openNormalizationCase(pool:Pool,actor:TrustedIdentity,raw:Record<string,unknown>){
 const command=parseCaseOpen(raw);const pair=[...command.orderIds].sort();const hash=caseCommandHash('open',pair.join(':'),command);
 return transaction(pool,actor,command.requestId,async(client,current)=>{
  const receipt=await previous(client,current,command.requestId,hash);if(receipt)return receipt;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`normalization-pair:${pair.join(':')}`]);
  if((await client.query('SELECT id FROM sales_order_normalization_cases WHERE first_order_id=$1 AND second_order_id=$2',pair)).rowCount)fail(409,'normalization_case_already_exists');
  const evidence=await collectNormalizationEvidenceInTransaction(client,command.orderIds);
  if(evidence.reviewHash!==command.expectedReviewHash)fail(409,'normalization_preview_changed');
  const row=(await client.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id::text',[...pair,current.internalUserId,command.requestId,hash])).rows[0];
  return appendEvent(client,current,row.id,1,'opened',command.requestId,hash,command.reason,evidence);
 });
}
export async function appendNormalizationCaseEvent(pool:Pool,actor:TrustedIdentity,id:string,raw:Record<string,unknown>){
 id=caseId(id);const command=parseCaseEvent(raw);const hash=caseCommandHash('append',id,command);
 return transaction(pool,actor,command.requestId,async(client,current)=>{
  const receipt=await previous(client,current,command.requestId,hash);if(receipt)return receipt;
  const row=(await client.query('SELECT first_order_id::text,second_order_id::text FROM sales_order_normalization_cases WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row)fail(404,'normalization_case_not_found');
  const latest=(await client.query('SELECT version,event_type FROM sales_order_normalization_case_events WHERE case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0];
  if(!latest||latest.version!==command.expectedVersion)fail(409,'normalization_case_version_conflict');
  if(latest.event_type==='withdrawn'?command.eventType!=='reopened':command.eventType==='reopened')fail(409,'normalization_case_state_conflict');
  const evidence=await collectNormalizationEvidenceInTransaction(client,[row.first_order_id,row.second_order_id]);
  return appendEvent(client,current,id,latest.version+1,command.eventType,command.requestId,hash,command.reason,evidence);
 });
}
export async function readNormalizationCase(pool:Pool,actor:TrustedIdentity,id:string,offset=0){
 id=caseId(id);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail(400,'invalid_case_offset');
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await requireNormalizationAdmin(client,actor);
  const row=(await client.query('SELECT id::text,first_order_id::text,second_order_id::text,created_at FROM sales_order_normalization_cases WHERE id=$1',[id])).rows[0];
  if(!row)fail(404,'normalization_case_not_found');
  const latest=(await client.query('SELECT version,event_type FROM sales_order_normalization_case_events WHERE case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0];
  const events=(await client.query(`SELECT e.id::text,e.version,e.event_type,e.reason,e.evidence,e.created_at,u.public_id::text AS actor_id,u.display_name AS actor_name FROM sales_order_normalization_case_events e JOIN app_users u ON u.id=e.actor_id WHERE e.case_id=$1 ORDER BY e.version DESC LIMIT 21 OFFSET $2`,[id,offset])).rows;
  await client.query('COMMIT');return {case:{...row,version:latest?.version??0,state:latest?.event_type==='withdrawn'?'withdrawn':'review_required'},events:events.slice(0,20),hasMore:events.length>20,nextOffset:events.length>20?offset+20:null,executionAuthorized:false};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function listNormalizationCases(pool:Pool,actor:TrustedIdentity,options:{offset:number;search:string;includeWithdrawn:boolean}){
 if(!Number.isSafeInteger(options.offset)||options.offset<0||options.offset>1000000||options.search.length>200)fail(400,'invalid_case_query');
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await requireNormalizationAdmin(client,actor);
  const rows=(await client.query(`SELECT c.id::text,c.first_order_id::text,c.second_order_id::text,a.order_no AS first_order_no,b.order_no AS second_order_no,c.created_at,e.version,e.event_type FROM sales_order_normalization_cases c JOIN sales_orders a ON a.id=c.first_order_id JOIN sales_orders b ON b.id=c.second_order_id JOIN LATERAL (SELECT version,event_type FROM sales_order_normalization_case_events WHERE case_id=c.id ORDER BY version DESC LIMIT 1) e ON true WHERE ($1::boolean OR e.event_type<>'withdrawn') AND ($2='' OR strpos(lower(a.order_no),lower($2))>0 OR strpos(lower(b.order_no),lower($2))>0) ORDER BY c.created_at DESC,c.id DESC LIMIT 21 OFFSET $3`,[options.includeWithdrawn,options.search.trim(),options.offset])).rows;
  await client.query('COMMIT');return {items:rows.slice(0,20),hasMore:rows.length>20,nextOffset:rows.length>20?options.offset+20:null};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export function parseNormalizationCaseQuery(query:URLSearchParams,detail=false){
 const allowed=detail?['offset']:['offset','search','includeWithdrawn'];
 for(const key of query.keys())if(!allowed.includes(key)||query.getAll(key).length!==1)fail(400,'invalid_case_query');
 const offsetText=query.get('offset')??'0';if(!/^\d{1,7}$/u.test(offsetText)||Number(offsetText)>1000000)fail(400,'invalid_case_query');
 const withdrawn=query.get('includeWithdrawn')??'false';if(!['true','false'].includes(withdrawn))fail(400,'invalid_case_query');
 const search=query.get('search')??'';if(search.length>200)fail(400,'invalid_case_query');
 return {offset:Number(offsetText),search,includeWithdrawn:withdrawn==='true'};
}

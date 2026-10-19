import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {HttpError} from '../http/errors.js';
import {permissionsForUser} from '../auth/permissions.js';
import {normalizationHash,parseAttributionProposal,uuid,digest} from './normalization-execution-model.js';
import {readNormalizationReviewAccess,normalizationReviewerFingerprint,type NormalizationReviewType} from './normalization-review-access.js';
import {previewAttributionExecution,type NormalizationExecutionOptions} from './normalization-execution-service.js';
import {readOrderCommandState,type OrderCommandMode} from './command-control.js';
import type {FullNormalizationEvidence} from './normalization-full-evidence.js';
import {supportsEffectiveAttribution} from './effective-attribution.js';
function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function list(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||value.length>max)fail(503,'normalization_proof_integrity_failed');return value;}
function pick(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!record(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail(503,'normalization_proof_integrity_failed');return Object.fromEntries(keys.map(key=>[key,value[key]]));}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** PostgreSQL jsonb reorders keys. Reconstruct the exact v1 insertion order before checking the original hash. No arbitrary metadata escapes. */
export function restoreNormalizationEvidence(raw:unknown):FullNormalizationEvidence{
 if(!record(raw)||raw.schemaVersion!=='order-normalization-full-evidence.v1'||raw.executionAuthorized!==false||raw.hashScope!=='all-bounded-declared-server-reference-rows-and-locked-adapter-inventory')fail(503,'normalization_proof_integrity_failed');
 const orders=list(raw.orders,100).map(row=>pick(row,['id','order_no','creation_source','lifecycle_state','version','source_order_id','source_quote_id','source_revision_id','source_price_version_id']));
 const currentGroups=list(raw.currentGroups,100).map(row=>pick(row,['original_order_id','effective_order_id','attribution_change_id','attribution_version']));
 const contracts=list(raw.contracts,100).map(row=>pick(row,['sales_order_id','external_id','sales_contract_no','source_hash']));
 const batches=list(raw.batches,100).map(row=>pick(row,['sales_order_id','batch_id']));
 const references=list(raw.references,5000).map(row=>pick(row,['relation','column','orderId','count','fingerprint']));
 let external:Record<string,unknown>;
 if(record(raw.external)&&raw.external.coverage==='unavailable')external=pick(raw.external,['coverage','reason']);
 else{external=pick(raw.external,['coverage','sourceKey','leaseId','expiresAt','orders','fingerprint']);if(external.coverage!=='frozen_adapter_inventory')fail(503,'normalization_proof_integrity_failed');external.orders=list(external.orders,100).map(row=>pick(row,['id','executionCount','financialCount','executionHash','financialHash']));}
 const memberIds=list(raw.memberIds,100),requiredReviews=list(raw.requiredReviews,2),blockers=list(raw.blockers,1000),unknownReferences=list(raw.unknownReferences,1000);
 if(memberIds.some(id=>typeof id!=='string')||requiredReviews.some(type=>!['production','finance'].includes(String(type)))||blockers.some(value=>typeof value!=='string')||unknownReferences.some(value=>typeof value!=='string'))fail(503,'normalization_proof_integrity_failed');
 for(const row of orders)if(typeof row.id!=='string'||typeof row.order_no!=='string'||typeof row.creation_source!=='string'||typeof row.lifecycle_state!=='string'||!Number.isSafeInteger(row.version))fail(503,'normalization_proof_integrity_failed');
 for(const row of references)if(typeof row.relation!=='string'||typeof row.column!=='string'||typeof row.orderId!=='string'||!Number.isSafeInteger(row.count)||Number(row.count)<0||typeof row.fingerprint!=='string')fail(503,'normalization_proof_integrity_failed');
 const content={schemaVersion:raw.schemaVersion,caseId:raw.caseId,caseVersion:raw.caseVersion,targetFingerprint:raw.targetFingerprint,proposalHash:raw.proposalHash,memberIds,orders,currentGroups,contracts,batches,references,unknownReferences,external,requiredReviews,blockers,lineageHash:raw.lineageHash,hashScope:raw.hashScope};
 if(normalizationHash(content)!==raw.evidenceHash)fail(503,'normalization_proof_integrity_failed');
 const metrics=pick(raw.metrics,['rows','bytes']);if(!Number.isSafeInteger(metrics.rows)||Number(metrics.rows)!==references.reduce((n,row)=>n+Number(row.count),0)||!Number.isSafeInteger(metrics.bytes)||Number(metrics.bytes)<0||Number(metrics.bytes)>33554432)fail(503,'normalization_proof_integrity_failed');
 return {...content,evidenceHash:raw.evidenceHash,metrics,executionAuthorized:false} as FullNormalizationEvidence;
}
async function readonly<T>(pool:Pool,actor:TrustedIdentity,run:(client:PoolClient,access:Awaited<ReturnType<typeof readNormalizationReviewAccess>>)=>Promise<T>,required=true){
 const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const access=await readNormalizationReviewAccess(client,actor,required);const result=await run(client,access);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>undefined);if(error instanceof HttpError)throw error;fail(503,'normalization_workspace_unavailable');}finally{client.release();}
}
export async function readNormalizationReviewCapabilities(pool:Pool,actor:TrustedIdentity){return readonly(pool,actor,async(_client,access)=>({schemaVersion:'order-normalization-review-access.v1',...access}),false);}
export type ReviewInboxQuery={search:string;cursor:string|null;includeHistory:boolean};
export function parseReviewInboxQuery(params:URLSearchParams):ReviewInboxQuery{
 for(const key of params.keys())if(!['search','cursor','includeHistory'].includes(key)||params.getAll(key).length!==1)fail(400,'invalid_normalization_inbox_query');
 const search=params.get('search')??'',cursor=params.get('cursor'),history=params.get('includeHistory')??'false';if(search.length>200||!['true','false'].includes(history))fail(400,'invalid_normalization_inbox_query');if(cursor)uuid(cursor);else if(cursor!==null)fail(400,'invalid_normalization_inbox_query');
 return {search:search.trim(),cursor:cursor?.toLowerCase()??null,includeHistory:history==='true'};
}
export async function listNormalizationReviewInbox(pool:Pool,actor:TrustedIdentity,query:ReviewInboxQuery){
 if(query.search.length>200||typeof query.includeHistory!=='boolean')fail(400,'invalid_normalization_inbox_query');if(query.cursor)uuid(query.cursor);
 return readonly(pool,actor,async(client,access)=>{
  const cursor=query.cursor?(await client.query('SELECT created_at,id FROM sales_order_normalization_proofs WHERE id=$1',[query.cursor])).rows[0]:null;if(query.cursor&&!cursor)fail(400,'invalid_normalization_inbox_cursor');
  const rows=(await client.query(`SELECT p.id::text AS proof_id,p.case_id::text,p.case_version,p.created_at,a.order_no AS first_order_no,b.order_no AS second_order_no,e.version AS current_case_version,e.event_type,EXISTS(SELECT 1 FROM sales_order_attribution_changes change WHERE change.review_proof_id=p.id) AS executed
   FROM sales_order_normalization_proofs p JOIN sales_order_normalization_cases c ON c.id=p.case_id JOIN sales_orders a ON a.id=c.first_order_id JOIN sales_orders b ON b.id=c.second_order_id JOIN LATERAL(SELECT version,event_type FROM sales_order_normalization_case_events WHERE case_id=c.id ORDER BY version DESC LIMIT 1)e ON true
   WHERE ($1 OR (e.event_type<>'withdrawn' AND e.version=p.case_version AND NOT EXISTS(SELECT 1 FROM sales_order_attribution_changes change WHERE change.review_proof_id=p.id))) AND ($2='' OR strpos(lower(a.order_no),lower($2))>0 OR strpos(lower(b.order_no),lower($2))>0) AND ($3::uuid IS NULL OR (p.created_at,p.id)<(SELECT created_at,id FROM sales_order_normalization_proofs WHERE id=$3)) ORDER BY p.created_at DESC,p.id DESC LIMIT 21`,[query.includeHistory,query.search.toLowerCase(),query.cursor])).rows;
  return {schemaVersion:'order-normalization-inbox.v1',access,items:rows.slice(0,20),hasMore:rows.length>20,nextCursor:rows.length>20?rows[19].proof_id:null};
 });
}
export async function readNormalizationProposalContext(pool:Pool,actor:TrustedIdentity,id:string){
 id=uuid(id);return readonly(pool,actor,async(client,access)=>{
  if(!access.canPublish)fail(403,'normalization_admin_required');if(!await supportsEffectiveAttribution(client))fail(503,'normalization_workspace_unavailable');
  const c=(await client.query('SELECT first_order_id::text,second_order_id::text FROM sales_order_normalization_cases WHERE id=$1',[id])).rows[0];if(!c)fail(404,'normalization_case_not_found');const latest=(await client.query('SELECT version,event_type FROM sales_order_normalization_case_events WHERE case_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0];
  const rows=(await client.query(`SELECT v.original_order_id::text AS id,o.order_no,o.creation_source,o.lifecycle_state,v.effective_order_id::text,v.attribution_version FROM sales_order_effective_identities v JOIN sales_orders o ON o.id=v.original_order_id WHERE v.effective_order_id IN(SELECT effective_order_id FROM sales_order_effective_identities WHERE original_order_id=ANY($1::uuid[])) ORDER BY v.original_order_id LIMIT 101`,[[c.first_order_id,c.second_order_id]])).rows;
  if(rows.length<2||rows.length>100)fail(409,'attribution_group_limit');return {schemaVersion:'order-normalization-context.v1',caseId:id,caseVersion:latest.version,state:latest.event_type==='withdrawn'?'withdrawn':'review_required',changeType:rows.some(row=>row.attribution_version>0)?'correct':'normalize',orders:rows,executionAuthorized:false};
 });
}
type ProofRow={id:string;case_id:string;case_version:number;target_fingerprint:string;evidence_hash:string;proposal_hash:string;proposal:unknown;evidence_summary:unknown;created_at:Date;current_version:number;event_type:string;executed:boolean};
function proof(row:ProofRow){
 const proposal=parseAttributionProposal(row.proposal),evidence=restoreNormalizationEvidence(row.evidence_summary);
 if(row.case_id!==evidence.caseId||row.case_version!==evidence.caseVersion||row.evidence_hash!==evidence.evidenceHash||row.proposal_hash!==normalizationHash(proposal)||row.proposal_hash!==evidence.proposalHash||row.target_fingerprint!==evidence.targetFingerprint||proposal.caseVersion!==row.case_version||!same(evidence.memberIds,proposal.assignments.map(member=>member.originalOrderId)))fail(503,'normalization_proof_integrity_failed');return {proposal,evidence};
}
function evidenceView(e:FullNormalizationEvidence){return {orders:e.orders.map(o=>({id:o.id,orderNo:o.order_no,creationSource:o.creation_source,lifecycleState:o.lifecycle_state,version:o.version})),currentGroups:e.currentGroups,contracts:e.contracts.map(c=>({orderId:c.sales_order_id,salesContractNo:c.sales_contract_no,sourceId:c.external_id})),references:e.references,unknownReferences:e.unknownReferences,coverage:e.external.coverage,externalOrders:e.external.coverage==='unavailable'?null:e.external.orders,requiredReviews:e.requiredReviews,reviewRequirementsKnown:e.external.coverage!=='unavailable',blockers:e.blockers,metrics:e.metrics};}
export async function readPublishedNormalizationProposal(pool:Pool,actor:TrustedIdentity,proofId:string,options:NormalizationExecutionOptions={},runtime:OrderCommandMode='enabled'){
 const checkedClock=(options.now??Date.now)();if(!Number.isFinite(checkedClock))fail(503,'normalization_clock_unavailable');
 proofId=uuid(proofId);
 const stored=await readonly(pool,actor,async(client,access)=>{
  const meta=(await client.query('SELECT octet_length(proposal::text)+octet_length(evidence_summary::text) AS bytes FROM sales_order_normalization_proofs WHERE id=$1',[proofId])).rows[0];if(!meta)fail(404,'normalization_proof_not_found');if(meta.bytes>16777216)fail(413,'normalization_proof_limit');
  const row=(await client.query<ProofRow>(`SELECT p.id::text,p.case_id::text,p.case_version,p.target_fingerprint,p.evidence_hash,p.proposal_hash,p.proposal,p.evidence_summary,p.created_at,e.version AS current_version,e.event_type,EXISTS(SELECT 1 FROM sales_order_attribution_changes change WHERE change.review_proof_id=p.id) AS executed FROM sales_order_normalization_proofs p JOIN LATERAL(SELECT version,event_type FROM sales_order_normalization_case_events WHERE case_id=p.case_id ORDER BY version DESC LIMIT 1)e ON true WHERE p.id=$1`,[proofId])).rows[0];const restored=proof(row);
  const signed=(await client.query<{review_type:NormalizationReviewType;decision:'approve'|'reject';created_at:Date;actor_id:string;public_id:string;display_name:string;authorization_fingerprint:string}>(`SELECT DISTINCT ON(r.review_type) r.review_type,r.decision,r.created_at,r.actor_id::text,u.public_id::text,u.display_name,r.authorization_fingerprint FROM sales_order_normalization_reviews r JOIN app_users u ON u.id=r.actor_id WHERE r.proof_id=$1 ORDER BY r.review_type,r.sequence DESC`,[proofId])).rows;
  const reviews=[];for(const r of signed){let authorizationCurrent=false;try{authorizationCurrent=await normalizationReviewerFingerprint(client,{internalUserId:r.actor_id,userId:r.public_id,username:'',userName:'',permissions:[]},r.review_type)===r.authorization_fingerprint;}catch(error){if(!(error instanceof HttpError)||![401,403].includes(error.status))throw error;}reviews.push({reviewType:r.review_type,decision:r.decision,signedAt:r.created_at.toISOString(),actorId:r.public_id,actorName:r.display_name,authorizationCurrent});}
  return {row,...restored,access,reviews};
 });
 let current:FullNormalizationEvidence|null=null;let currentError:string|null=null;
 if(stored.row.event_type==='withdrawn')currentError='normalization_case_withdrawn';else if(stored.row.current_version!==stored.row.case_version)currentError='normalization_case_version_conflict';else if(stored.row.executed)currentError='normalization_proposal_already_executed';else try{current=await previewAttributionExecution(pool,actor,stored.row.case_id,stored.proposal,options);}catch(error){if(error instanceof HttpError&&[401,403].includes(error.status))throw error;currentError=error instanceof HttpError?error.code:'normalization_workspace_unavailable';}
 const matches=current?.evidenceHash===stored.row.evidence_hash;
 const reasons:string[]=[];if(currentError)reasons.push(currentError);else if(!matches)reasons.push('normalization_full_evidence_changed');if(current)reasons.push(...current.blockers);
 const commandState=await readOrderCommandState(pool,actor,runtime);if(commandState.mode==='frozen')reasons.push('order_commands_frozen');
 if(!options.permit)reasons.push('normalization_execution_disabled');else{
  const p=options.permit,now=checkedClock;
  if(!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=now||Date.parse(p.expiresAt)>now+3600000)reasons.push('normalization_execution_permit_expired');
  if(p.caseId!==stored.row.case_id||p.targetFingerprint!==stored.row.target_fingerprint||p.proposalHash!==stored.row.proposal_hash||p.evidenceHash!==stored.row.evidence_hash||p.recoveryPlanHash!==stored.proposal.recoveryPlanHash)reasons.push('normalization_execution_scope_mismatch');
  try{digest(p.backupSha256);digest(p.restoreRehearsalSha256);}catch{reasons.push('normalization_execution_permit_invalid');}
 }
 const required=current?.requiredReviews??stored.evidence.requiredReviews;
 for(const type of required){const signed=stored.reviews.find(row=>row.reviewType===type);if(!signed||signed.decision!=='approve')reasons.push('normalization_review_required');else if(!signed.authorizationCurrent)reasons.push('normalization_reviewer_authorization_changed');else if(signed.actorId===actor.userId)reasons.push('normalization_independent_reviewers_required');}
 const approved=stored.reviews.filter(r=>required.includes(r.reviewType)&&r.decision==='approve'&&r.authorizationCurrent);if(new Set(approved.map(r=>r.actorId)).size!==approved.length)reasons.push('normalization_independent_reviewers_required');
 if(!stored.access.canPublish)reasons.push('normalization_admin_required');
 const evidence=current&&matches?current:stored.evidence;
 return {schemaVersion:'order-normalization-review.v1',proof:{id:proofId,caseId:stored.row.case_id,caseVersion:stored.row.case_version,createdAt:stored.row.created_at.toISOString(),evidenceHash:stored.row.evidence_hash,proposalHash:stored.row.proposal_hash},proposal:stored.proposal,evidence:evidenceView(evidence),reviews:stored.reviews,access:stored.access,status:{currentEvidenceMatches:matches,currentError,canApprove:!!current&&matches&&!current.blockers.length,canReject:!!current&&matches,commandMode:commandState.mode,executionAvailable:reasons.length===0,reasons:[...new Set(reasons)],checkedAt:new Date(checkedClock).toISOString()},executionAuthorized:false};
}

export function parseReviewHistoryQuery(params:URLSearchParams){
 for(const key of params.keys())if(key!=='cursor'||params.getAll(key).length!==1)fail(400,'invalid_normalization_review_history_query');
 const cursor=params.get('cursor');if(cursor!==null&&(!/^[1-9][0-9]{0,18}$/.test(cursor)||BigInt(cursor)>BigInt('9223372036854775807')))fail(400,'invalid_normalization_review_history_query');return cursor;
}
export async function listNormalizationReviewHistory(pool:Pool,actor:TrustedIdentity,proofId:string,cursor:string|null){
 proofId=uuid(proofId);if(cursor!==null)parseReviewHistoryQuery(new URLSearchParams({cursor}));
 return readonly(pool,actor,async client=>{
  if(!(await client.query('SELECT 1 FROM sales_order_normalization_proofs WHERE id=$1',[proofId])).rowCount)fail(404,'normalization_proof_not_found');
  if(cursor&&!(await client.query('SELECT 1 FROM sales_order_normalization_reviews WHERE proof_id=$1 AND sequence=$2::bigint',[proofId,cursor])).rowCount)fail(400,'invalid_normalization_review_history_cursor');
  const permissions=await permissionsForUser(client,actor.internalUserId),seeOthers=['commercial.sale.view','commercial.labor.view','quote.cost.view'].every(key=>permissions.includes(key as typeof permissions[number]));
  const rows=(await client.query<{id:string;sequence:string;review_type:NormalizationReviewType;decision:string;reason:string;created_at:Date;actor_id:string;public_id:string;display_name:string}>(`SELECT r.id::text,r.sequence::text,r.review_type,r.decision,r.reason,r.created_at,r.actor_id::text,u.public_id::text,u.display_name FROM sales_order_normalization_reviews r JOIN app_users u ON u.id=r.actor_id WHERE r.proof_id=$1 AND ($2::bigint IS NULL OR r.sequence<$2::bigint) ORDER BY r.sequence DESC LIMIT 21`,[proofId,cursor])).rows;
  const items=rows.slice(0,20).map(row=>({id:row.id,sequence:row.sequence,reviewType:row.review_type,decision:row.decision,actorId:row.public_id,actorName:row.display_name,signedAt:row.created_at.toISOString(),reason:seeOthers||row.review_type==='production'&&row.actor_id===actor.internalUserId?row.reason:null,reasonVisibility:seeOthers||row.review_type==='production'&&row.actor_id===actor.internalUserId?'visible':'restricted'}));
  return {schemaVersion:'order-normalization-review-history.v1',proofId,items,hasMore:rows.length>20,nextCursor:rows.length>20?rows[19].sequence:null};
 });
}

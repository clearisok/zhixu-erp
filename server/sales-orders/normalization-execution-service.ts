import {readNormalizationReviewAccess,requireNormalizationReviewer as reviewActor} from './normalization-review-access.js';
import {orderCommandControlError} from './command-control.js';
import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {HttpError} from '../http/errors.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {requireNormalizationAdmin} from './normalization-preview.js';
import {lockEffectiveAttribution,writeAttributionHeadInTransaction} from './effective-attribution.js';
import {collectFullNormalizationEvidence,normalizationTargetFingerprint,type FullNormalizationEvidence} from './normalization-full-evidence.js';
import {normalizationHash,uuid,digest,exactKeys,evidenceHashPattern,parseAttributionProposal,parseAttributionReview,parseAttributionExecute,type AttributionProposal} from './normalization-execution-model.js';
import {unavailableNormalizationCoverage,type NormalizationCoverageProvider,type CoverageSnapshot} from './normalization-coverage.js';
export type NormalizationExecutionPermit={caseId:string;targetFingerprint:string;proposalHash:string;evidenceHash:string;backupSha256:string;restoreRehearsalSha256:string;recoveryPlanHash:string;expiresAt:string};
export type NormalizationExecutionOptions={coverage?:NormalizationCoverageProvider;permit?:NormalizationExecutionPermit;now?:()=>number};
function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
async function scope<T>(pool:Pool,actor:TrustedIdentity,caseId:string,proposal:AttributionProposal,options:NormalizationExecutionOptions,mode:'preview'|'review'|'execute'|'publish',run:(client:PoolClient,external:CoverageSnapshot,target:string)=>Promise<T>,reviewType?:'production'|'finance'){
 const client=await pool.connect();
 try{
  // External lease precedes the DB attribution gate. Joint source writers must use this order too.
  await requireOrderCommandActorRead(client,actor);
  const target=await normalizationTargetFingerprint(client);
  return await (options.coverage??unavailableNormalizationCoverage).withFrozenScope(proposal.assignments.map(row=>row.originalOrderId),target,async(external,revalidate)=>{
   await client.query(mode==='preview'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
   await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='15s'");
   if(mode==='execute')await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");else await lockEffectiveAttribution(client);
   if(mode==='execute'||mode==='publish')await requireNormalizationAdmin(client,actor,true);else if(mode==='review'){if(!reviewType)fail(503,'normalization_review_type_required');await reviewActor(client,actor,reviewType);}else await requireOrderCommandActorRead(client,actor);
   if(await normalizationTargetFingerprint(client)!==target)fail(409,'normalization_execution_scope_mismatch');
   if(!(await client.query('SELECT id FROM sales_order_normalization_cases WHERE id=$1',[caseId])).rowCount)fail(404,'normalization_case_not_found');
   const result=await run(client,external,target);await revalidate();await client.query('COMMIT');return result;
  });
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);if(['40001','55P03','40P01'].includes((error as {code?:string}).code??''))fail(409,'normalization_concurrency_conflict');throw orderCommandControlError(error);}
 finally{client.release();}
}

async function lockedCase(client:PoolClient,id:string){if(!(await client.query('SELECT id FROM sales_order_normalization_cases WHERE id=$1 FOR UPDATE',[id])).rowCount)fail(404,'normalization_case_not_found');}
function complete(evidence:FullNormalizationEvidence,expected:string){if(evidence.evidenceHash!==expected)fail(409,'normalization_full_evidence_changed');if(evidence.blockers.length)fail(409,'normalization_evidence_blocked');}
async function ensureProof(client:PoolClient,caseId:string,proposal:AttributionProposal,evidence:FullNormalizationEvidence){
 await client.query('INSERT INTO sales_order_normalization_proofs(case_id,case_version,target_fingerprint,evidence_hash,proposal_hash,proposal,evidence_summary) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[caseId,proposal.caseVersion,evidence.targetFingerprint,evidence.evidenceHash,evidence.proposalHash,JSON.stringify(proposal),JSON.stringify(evidence)]);
 const proof=(await client.query('SELECT id::text FROM sales_order_normalization_proofs WHERE case_id=$1 AND case_version=$2 AND target_fingerprint=$3 AND evidence_hash=$4 AND proposal_hash=$5 FOR UPDATE',[caseId,proposal.caseVersion,evidence.targetFingerprint,evidence.evidenceHash,evidence.proposalHash])).rows[0];
 if(!proof)fail(409,'normalization_proof_conflict');return proof.id as string;
}
export async function previewAttributionExecution(pool:Pool,actor:TrustedIdentity,id:string,rawProposal:unknown,options:NormalizationExecutionOptions={}){
 id=uuid(id);const proposal=parseAttributionProposal(rawProposal);
 return scope(pool,actor,id,proposal,options,'preview',async(client,external)=>collectFullNormalizationEvidence(client,id,proposal,external));
}
/** Publishing an exact immutable proof is not approval or execution. Content-key idempotency protects lost responses. */
export async function publishAttributionProposal(pool:Pool,actor:TrustedIdentity,id:string,raw:unknown,options:NormalizationExecutionOptions={}){
 id=uuid(id);const body=exactKeys(raw,['proposal','expectedEvidenceHash']);const proposal=parseAttributionProposal(body.proposal),expected=digest(body.expectedEvidenceHash);
 return scope(pool,actor,id,proposal,options,'publish',async(client,external,target)=>{
  const current=await requireNormalizationAdmin(client,actor,true);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`normalization-publish:${id}:${normalizationHash(proposal)}:${expected}`]);
  await lockedCase(client,id);
  const previous=(await client.query('SELECT id::text FROM sales_order_normalization_proofs WHERE case_id=$1 AND case_version=$2 AND target_fingerprint=$3 AND evidence_hash=$4 AND proposal_hash=$5',[id,proposal.caseVersion,target,expected,normalizationHash(proposal)])).rows[0];
  // An acknowledged old publication remains a historical receipt, even if
  // newer source facts now require a new proposal. It is never re-approved here.
  if(previous)return {proofId:previous.id,caseId:id,replayed:true};
  const evidence=await collectFullNormalizationEvidence(client,id,proposal,external,undefined,true);
  if(evidence.evidenceHash!==expected)fail(409,'normalization_full_evidence_changed');
  const proofId=await ensureProof(client,id,proposal,evidence);
  await appendOperationLog(client,current,{module:'订单中心',action:'维护订单身份',entityType:'OrderNormalizationCase',entityId:id,metadata:{operation:'publish_review_proposal',proofId,evidenceHash:evidence.evidenceHash,proposalHash:evidence.proposalHash,executionAuthorized:false}});
  return {proofId,caseId:id,replayed:false};
 });
}
export async function recordAttributionReview(pool:Pool,actor:TrustedIdentity,id:string,raw:unknown,options:NormalizationExecutionOptions={}){
 id=uuid(id);const command=parseAttributionReview(raw);const payloadHash=normalizationHash({caseId:id,...command});
 return scope(pool,actor,id,command.proposal,options,'review',async(client,external)=>{
  const current=await reviewActor(client,actor,command.reviewType);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`normalization-review-request:${current.internalUserId}:${command.requestId}`]);
  const prior=(await client.query('SELECT id::text,proof_id::text,payload_hash FROM sales_order_normalization_reviews WHERE actor_id=$1 AND request_id=$2',[current.internalUserId,command.requestId])).rows[0];
  if(prior){if(prior.payload_hash!==payloadHash)fail(409,'normalization_review_retry_mismatch');return {reviewId:prior.id,proofId:prior.proof_id,replayed:true};}
  await lockedCase(client,id);
  const evidence=await collectFullNormalizationEvidence(client,id,command.proposal,external,undefined,true);
  if(command.decision==='approve')complete(evidence,command.expectedEvidenceHash);else if(evidence.evidenceHash!==command.expectedEvidenceHash)fail(409,'normalization_full_evidence_changed');
  const proofId=await ensureProof(client,id,command.proposal,evidence);
  const other=(await client.query("SELECT actor_id::text FROM sales_order_normalization_reviews WHERE proof_id=$1 AND review_type<>$2 AND decision='approve' ORDER BY sequence DESC LIMIT 1",[proofId,command.reviewType])).rows[0];
  if(command.decision==='approve'&&other?.actor_id===current.internalUserId)fail(409,'normalization_independent_reviewers_required');
  const review=(await client.query('INSERT INTO sales_order_normalization_reviews(proof_id,actor_id,request_id,payload_hash,review_type,decision,reason,authorization_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text',[proofId,current.internalUserId,command.requestId,payloadHash,command.reviewType,command.decision,command.reason,current.authorizationFingerprint])).rows[0];
  await appendOperationLog(client,current,{module:'订单中心',action:'维护订单身份',entityType:'OrderNormalizationCase',entityId:id,metadata:{proofId,reviewId:review.id,reviewType:command.reviewType,decision:command.decision,evidenceHash:evidence.evidenceHash,proposalHash:evidence.proposalHash}});
  return {reviewId:review.id,proofId,replayed:false};
 },command.reviewType);
}
async function previousChange(client:PoolClient,actor:TrustedIdentity,requestId:string,payloadHash:string){
 const row=(await client.query('SELECT id::text,case_id::text,review_proof_id::text,payload_hash FROM sales_order_attribution_changes WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,requestId])).rows[0];
 if(!row)return null;if(row.payload_hash!==payloadHash)fail(409,'attribution_execute_retry_mismatch');
 const members=(await client.query('SELECT sales_order_id::text AS "originalOrderId",effective_order_id::text AS "effectiveOrderId" FROM sales_order_attribution_members WHERE change_id=$1 ORDER BY sales_order_id',[row.id])).rows;
 return {changeId:row.id,caseId:row.case_id,proofId:row.review_proof_id,assignments:members,replayed:true};
}
function permitBinding(permit:NormalizationExecutionPermit|undefined,caseId:string,proposal:AttributionProposal,evidenceHash:string,target:string){
 if(!permit)fail(503,'normalization_execution_disabled');
 for(const key of ['targetFingerprint','proposalHash','evidenceHash','backupSha256','restoreRehearsalSha256','recoveryPlanHash'] as const)if(typeof permit[key]!=='string'||!evidenceHashPattern.test(permit[key]))fail(503,'normalization_execution_permit_invalid');
 if(permit.caseId!==caseId||permit.targetFingerprint!==target||permit.proposalHash!==normalizationHash(proposal)||permit.evidenceHash!==evidenceHash||permit.recoveryPlanHash!==proposal.recoveryPlanHash)fail(409,'normalization_execution_scope_mismatch');
 return permit;
}
export async function executeAttributionChange(pool:Pool,actor:TrustedIdentity,id:string,raw:unknown,options:NormalizationExecutionOptions={}){
 // No mutation authority can be injected through an HTTP body. Runtime has no default permit.
 if(!options.permit)fail(503,'normalization_execution_disabled');
 id=uuid(id);const command=parseAttributionExecute(raw);const payloadHash=normalizationHash({caseId:id,...command});
 return scope(pool,actor,id,command.proposal,options,'execute',async(client,external,target)=>{
  const current=await requireNormalizationAdmin(client,actor,true);
  const permit=permitBinding(options.permit,id,command.proposal,command.expectedEvidenceHash,target);
  const prior=await previousChange(client,current,command.requestId,payloadHash);if(prior)return prior;
  const now=(options.now??Date.now)();if(!Number.isFinite(now))fail(503,'normalization_clock_unavailable');if(!Number.isFinite(Date.parse(permit.expiresAt))||Date.parse(permit.expiresAt)<=now||Date.parse(permit.expiresAt)>now+3600000)fail(409,'normalization_execution_permit_expired');
  await lockedCase(client,id);
  const evidence=await collectFullNormalizationEvidence(client,id,command.proposal,external,undefined,true);complete(evidence,command.expectedEvidenceHash);
  const proofId=await ensureProof(client,id,command.proposal,evidence);
  const reviewers=new Set<string>();
  for(const type of evidence.requiredReviews){
   const review=(await client.query('SELECT r.actor_id::text,u.public_id::text,u.username,u.display_name,r.decision,r.authorization_fingerprint FROM sales_order_normalization_reviews r JOIN app_users u ON u.id=r.actor_id WHERE r.proof_id=$1 AND r.review_type=$2 ORDER BY r.sequence DESC LIMIT 1',[proofId,type])).rows[0];
   if(!review||review.decision!=='approve')fail(409,'normalization_review_required');
   if(review.actor_id===current.internalUserId||reviewers.has(review.actor_id))fail(409,'normalization_independent_reviewers_required');
   try{const fresh=await reviewActor(client,{internalUserId:review.actor_id,userId:review.public_id,username:review.username,userName:review.display_name,permissions:[]},type);if(fresh.authorizationFingerprint!==review.authorization_fingerprint)fail(409,'normalization_reviewer_authorization_changed');}
   catch(error){if(error instanceof HttpError&&[401,403].includes(error.status))fail(409,'normalization_reviewer_authorization_changed');throw error;}
   reviewers.add(review.actor_id);
  }
  const change=(await client.query('INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason,review_proof_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text',[id,command.proposal.caseVersion,command.proposal.changeType,current.internalUserId,command.requestId,payloadHash,evidence.evidenceHash,JSON.stringify({proofId,targetFingerprint:target,proposalHash:evidence.proposalHash,backupSha256:permit.backupSha256,restoreRehearsalSha256:permit.restoreRehearsalSha256,recoveryPlanHash:permit.recoveryPlanHash,requiredReviews:evidence.requiredReviews}),command.proposal.reason,proofId])).rows[0];
  for(const assignment of command.proposal.assignments){const before=evidence.currentGroups.find(row=>row.original_order_id===assignment.originalOrderId)!;await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,$4,$5)',[change.id,assignment.originalOrderId,assignment.effectiveOrderId,before.attribution_change_id,before.attribution_version]);}
  for(const assignment of command.proposal.assignments)await writeAttributionHeadInTransaction(client,change.id,assignment.originalOrderId);
  await appendOperationLog(client,current,{module:'订单中心',action:'维护订单身份',entityType:'OrderNormalizationCase',entityId:id,metadata:{changeId:change.id,proofId,targetFingerprint:target,evidenceHash:evidence.evidenceHash,proposalHash:evidence.proposalHash,changeType:command.proposal.changeType,historyMoved:false,quantitiesAggregated:false}});
  return {changeId:change.id,caseId:id,proofId,assignments:command.proposal.assignments,replayed:false};
 });
}
export async function readAttributionExecutionReceipt(pool:Pool,actor:TrustedIdentity,requestId:string){
 requestId=uuid(requestId);const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await requireNormalizationAdmin(client,actor);const row=(await client.query('SELECT id::text,case_id::text,review_proof_id::text,evidence_hash,payload_hash,created_at FROM sales_order_attribution_changes WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,requestId])).rows[0];if(!row)fail(404,'attribution_receipt_not_found');const assignments=(await client.query('SELECT sales_order_id::text AS "originalOrderId",effective_order_id::text AS "effectiveOrderId" FROM sales_order_attribution_members WHERE change_id=$1 ORDER BY sales_order_id',[row.id])).rows;await client.query('COMMIT');return {changeId:row.id,caseId:row.case_id,proofId:row.review_proof_id,evidenceHash:row.evidence_hash,createdAt:row.created_at,assignments};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function readAttributionReviewSummary(pool:Pool,actor:TrustedIdentity,id:string,evidenceHash:string,proposalHash:string){
 id=uuid(id);evidenceHash=digest(evidenceHash);proposalHash=digest(proposalHash);const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await requireOrderCommandActorRead(client,actor);const proof=(await client.query('SELECT id::text,case_version,evidence_summary FROM sales_order_normalization_proofs WHERE case_id=$1 AND evidence_hash=$2 AND proposal_hash=$3 ORDER BY created_at DESC LIMIT 1',[id,evidenceHash,proposalHash])).rows[0];const reviews=proof?(await client.query('SELECT review_type,decision,created_at,sequence FROM sales_order_normalization_reviews WHERE proof_id=$1 ORDER BY sequence DESC LIMIT 101',[proof.id])).rows:[];await client.query('COMMIT');return {proofId:proof?.id??null,caseVersion:proof?.case_version??null,requiredReviews:proof?.evidence_summary.requiredReviews??[],evidence:proof?.evidence_summary??null,reviews:reviews.slice(0,100),hasMore:reviews.length>100};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function requireOrderCommandActorRead(client:PoolClient,actor:TrustedIdentity){await readNormalizationReviewAccess(client,actor,true);}

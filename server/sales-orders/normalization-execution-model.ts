import {createHash} from 'node:crypto';
import {HttpError} from '../http/errors.js';
import {identityUuid} from './identity-model.js';
export const evidenceHashPattern=/^[0-9a-f]{64}$/u;
export type AttributionAssignment={originalOrderId:string;effectiveOrderId:string};
export type AttributionProposal={changeType:'normalize'|'correct';caseVersion:number;assignments:AttributionAssignment[];reason:string;recoveryPlanHash:string};
export function normalizationHash(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function invalid():never{throw new HttpError(400,'invalid_attribution_command','Invalid attribution command');}
export function exactKeys(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();
 const body=value as Record<string,unknown>;
 if(Object.keys(body).length!==keys.length||keys.some(key=>!Object.hasOwn(body,key)))invalid();return body;
}
export function validReason(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>2000)invalid();return value.trim();}
export function uuid(value:unknown):string{if(typeof value!=='string'||!identityUuid.test(value))invalid();return value.toLowerCase();}
export function digest(value:unknown):string{if(typeof value!=='string'||!evidenceHashPattern.test(value))invalid();return value;}
export function parseAttributionProposal(raw:unknown):AttributionProposal{
 const body=exactKeys(raw,['changeType','caseVersion','assignments','reason','recoveryPlanHash']);
 if(!['normalize','correct'].includes(String(body.changeType))||!Number.isSafeInteger(body.caseVersion)||Number(body.caseVersion)<1||!Array.isArray(body.assignments)||body.assignments.length<2||body.assignments.length>100)invalid();
 const assignments=body.assignments.map(value=>{const row=exactKeys(value,['originalOrderId','effectiveOrderId']);return {originalOrderId:uuid(row.originalOrderId),effectiveOrderId:uuid(row.effectiveOrderId)};}).sort((a,b)=>a.originalOrderId.localeCompare(b.originalOrderId));
 const ids=new Set(assignments.map(row=>row.originalOrderId));if(ids.size!==assignments.length)invalid();
 const roots=new Set(assignments.map(row=>row.effectiveOrderId));
 for(const root of roots)if(!ids.has(root)||!assignments.some(row=>row.originalOrderId===root&&row.effectiveOrderId===root))invalid();
 if(body.changeType==='normalize'&&roots.size!==1)invalid();
 return {changeType:body.changeType as AttributionProposal['changeType'],caseVersion:Number(body.caseVersion),assignments,reason:validReason(body.reason),recoveryPlanHash:digest(body.recoveryPlanHash)};
}
export function parseAttributionExecute(raw:unknown){const body=exactKeys(raw,['requestId','expectedEvidenceHash','proposal']);return {requestId:uuid(body.requestId),expectedEvidenceHash:digest(body.expectedEvidenceHash),proposal:parseAttributionProposal(body.proposal)};}
export function parseAttributionReview(raw:unknown){const body=exactKeys(raw,['requestId','expectedEvidenceHash','proposal','reviewType','decision','reason']);if(!['production','finance'].includes(String(body.reviewType))||!['approve','reject'].includes(String(body.decision)))invalid();return {...parseAttributionExecute({requestId:body.requestId,expectedEvidenceHash:body.expectedEvidenceHash,proposal:body.proposal}),reviewType:body.reviewType as 'production'|'finance',decision:body.decision as 'approve'|'reject',reason:validReason(body.reason)};}

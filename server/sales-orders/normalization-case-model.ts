import { createHash } from 'node:crypto';
import { HttpError } from '../http/errors.js';
import { identityUuid } from './identity-model.js';
import { validateNormalizationPair } from './normalization-preview.js';
export type CaseOpenCommand={requestId:string;orderIds:[string,string];expectedReviewHash:string;reason:string};
export type CaseEventCommand={requestId:string;expectedVersion:number;eventType:'review_note'|'withdrawn'|'reopened';reason:string};
function invalid():never{throw new HttpError(400,'invalid_normalization_case_command','Invalid normalization case command');}
function fields(raw:Record<string,unknown>,keys:string[]){if(Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))invalid();}
function common(raw:Record<string,unknown>){if(typeof raw.requestId!=='string'||!identityUuid.test(raw.requestId)||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>2000)invalid();return {requestId:raw.requestId.toLowerCase(),reason:raw.reason.trim()};}
export function parseCaseOpen(raw:Record<string,unknown>):CaseOpenCommand {
 fields(raw,['requestId','orderIds','expectedReviewHash','reason']);const value=common(raw);
 if(!Array.isArray(raw.orderIds)||raw.orderIds.some(id=>typeof id!=='string')||typeof raw.expectedReviewHash!=='string'||!/^[0-9a-f]{64}$/u.test(raw.expectedReviewHash))invalid();
 validateNormalizationPair(raw.orderIds);return {...value,orderIds:raw.orderIds.map(id=>id.toLowerCase()) as [string,string],expectedReviewHash:raw.expectedReviewHash};
}
export function parseCaseEvent(raw:Record<string,unknown>):CaseEventCommand {
 fields(raw,['requestId','expectedVersion','eventType','reason']);const value=common(raw);
 if(!Number.isSafeInteger(raw.expectedVersion)||Number(raw.expectedVersion)<1||Number(raw.expectedVersion)>=2147483647||!['review_note','withdrawn','reopened'].includes(String(raw.eventType)))invalid();
 return {...value,expectedVersion:Number(raw.expectedVersion),eventType:raw.eventType as CaseEventCommand['eventType']};
}
export function caseCommandHash(operation:string,scope:string,command:CaseOpenCommand|CaseEventCommand){return createHash('sha256').update(JSON.stringify([operation,scope,command])).digest('hex');}

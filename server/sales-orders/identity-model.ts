import {parseCommercialProvenance} from './commercial-source.js';
import type {QuoteProvenance} from '../confirmed-commercial-terms/repository.js';
import { HttpError } from '../http/errors.js';
export const identityUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export type IdentityCommand = {expectedVersion:number} & (
 {action:'claim'} | {action:'transfer';ownerId:string;reason:string} |
 {action:'lineage';lineage:'pending'|'first'|'reorder';referenceOrderId:string|null;specificationChanges:string});
function invalid():never {throw new HttpError(400,'invalid_order_identity_command','Invalid order identity command');}
export function parseIdentityCommand(raw:Record<string,unknown>):IdentityCommand {
 const fields=raw.action==='claim'?['action','expectedVersion']:raw.action==='transfer'?['action','expectedVersion','ownerId','reason']:raw.action==='lineage'?['action','expectedVersion','lineage','referenceOrderId','specificationChanges']:[];
 if(!fields.length||Object.keys(raw).length!==fields.length||fields.some(k=>!Object.hasOwn(raw,k))||!Number.isSafeInteger(raw.expectedVersion)||Number(raw.expectedVersion)<0)invalid();
 if(raw.action==='transfer'&&(typeof raw.ownerId!=='string'||!identityUuid.test(raw.ownerId)||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>1000))invalid();
 if(raw.action==='lineage'){
  if(!['pending','first','reorder'].includes(String(raw.lineage))||typeof raw.specificationChanges!=='string'||raw.specificationChanges.length>4000)invalid();
  if(raw.lineage==='reorder'?(typeof raw.referenceOrderId!=='string'||!identityUuid.test(raw.referenceOrderId)):raw.referenceOrderId!==null)invalid();
 }
 return raw as IdentityCommand;
}
export type PreparationCommand={requestId:string;referenceOrderId:string;quantity:string;deliveryDate:string|null;specificationChanges:string;proposedCommercialSource?:QuoteProvenance|null};
export function parsePreparation(raw:Record<string,unknown>):PreparationCommand {
 const keys=['requestId','referenceOrderId','quantity','deliveryDate','specificationChanges'];
 if(Object.keys(raw).some(k=>!keys.includes(k)&&k!=='proposedCommercialSource')||keys.some(k=>!Object.hasOwn(raw,k)))invalid();
 if(raw.proposedCommercialSource!==undefined&&raw.proposedCommercialSource!==null){if(typeof raw.proposedCommercialSource!=='object'||Array.isArray(raw.proposedCommercialSource))invalid();parseCommercialProvenance(raw.proposedCommercialSource as Record<string,unknown>);}
 if(typeof raw.requestId!=='string'||!identityUuid.test(raw.requestId)||typeof raw.referenceOrderId!=='string'||!identityUuid.test(raw.referenceOrderId)||typeof raw.quantity!=='string'||!/^\d{1,12}(?:\.\d{1,6})?$/u.test(raw.quantity)||Number(raw.quantity)<=0||typeof raw.specificationChanges!=='string'||raw.specificationChanges.length>4000)invalid();
 if(raw.deliveryDate!==null&&(typeof raw.deliveryDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(raw.deliveryDate)||!Number.isFinite(Date.parse(raw.deliveryDate))||new Date(raw.deliveryDate).toISOString().slice(0,10)!==raw.deliveryDate))invalid();
 return raw as PreparationCommand;
}

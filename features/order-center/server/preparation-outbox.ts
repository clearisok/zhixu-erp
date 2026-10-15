import type {PreparationCommand,PreparationAdoptionCommand} from './preparation-client';
export type PreparationPending={kind:'create';body:PreparationCommand}|{kind:'adopt';body:PreparationAdoptionCommand};
export type PreparationScope={userId:string;orderId:string;kind:PreparationPending['kind']};
type Envelope={schemaVersion:1;userId:string;orderId:string;kind:PreparationPending['kind'];savedAt:string;body:PreparationPending['body']};
const pattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value:unknown):value is string{return typeof value==='string'&&pattern.test(value);}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function invalid():never{throw Error('preparation_pending_record_unavailable');}
export function preparationPendingKey(scope:PreparationScope){if(!uuid(scope.userId)||!uuid(scope.orderId)||!['create','adopt'].includes(scope.kind))invalid();return 'zhixu.server.order-preparation.pending.v1.'+scope.userId.toLowerCase()+'.'+scope.orderId.toLowerCase()+'.'+scope.kind;}
function bodyValid(kind:PreparationPending['kind'],body:unknown,orderId:string){
 if(!object(body)||!uuid(body.requestId))return false;
 const keys=kind==='create'?['requestId','referenceOrderId','quantity','deliveryDate','specificationChanges','proposedCommercialSource']:['requestId','preparationId','expectedVersion','reason'];
 if(Object.keys(body).some(key=>!keys.includes(key)))return false;
 if(kind==='adopt')return keys.every(key=>Object.hasOwn(body,key))&&uuid(body.preparationId)&&Number.isSafeInteger(body.expectedVersion)&&Number(body.expectedVersion)>=0&&typeof body.reason==='string'&&!!body.reason.trim()&&body.reason.length<=2000;
 if(!keys.slice(0,5).every(key=>Object.hasOwn(body,key))||!uuid(body.referenceOrderId)||body.referenceOrderId.toLowerCase()!==orderId.toLowerCase()||typeof body.quantity!=='string'||!/^\d{1,12}(?:\.\d{1,6})?$/.test(body.quantity)||Number(body.quantity)<=0||typeof body.specificationChanges!=='string'||body.specificationChanges.length>4000)return false;
 if(body.deliveryDate!==null&&(typeof body.deliveryDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.deliveryDate)||!Number.isFinite(Date.parse(body.deliveryDate))||new Date(body.deliveryDate).toISOString().slice(0,10)!==body.deliveryDate))return false;
 const source=body.proposedCommercialSource;
 return source===undefined||source===null||object(source)&&Object.keys(source).length===3&&['quoteId','revisionId','priceVersionId'].every(key=>typeof source[key]==='string'&&!!(source[key] as string).trim()&&(source[key] as string).length<=256);
}
/** Tab-scoped unresolved command only. Never reads or initializes any Browser business key. */
export function readPreparationPending(storage:Pick<Storage,'getItem'>,scope:PreparationScope):PreparationPending|null{
 const raw=storage.getItem(preparationPendingKey(scope));if(raw===null)return null;if(new TextEncoder().encode(raw).byteLength>16384)invalid();let record:unknown;try{record=JSON.parse(raw);}catch{invalid();}
 if(!object(record)||Object.keys(record).length!==6||record.schemaVersion!==1||record.userId!==scope.userId.toLowerCase()||record.orderId!==scope.orderId.toLowerCase()||record.kind!==scope.kind||typeof record.savedAt!=='string'||!Number.isFinite(Date.parse(record.savedAt))||!bodyValid(scope.kind,record.body,scope.orderId))invalid();return {kind:scope.kind,body:record.body} as PreparationPending;
}
export function savePreparationPending(storage:Pick<Storage,'getItem'|'setItem'>,scope:PreparationScope,pending:PreparationPending){if(scope.kind!==pending.kind||!bodyValid(pending.kind,pending.body,scope.orderId))invalid();if(new TextEncoder().encode(JSON.stringify(pending.body)).byteLength>8192)throw Error('preparation_command_too_large');const previous=readPreparationPending(storage,scope);if(previous&&JSON.stringify(previous)!==JSON.stringify(pending))throw Error('preparation_pending_request_locked');if(previous)return;const record:Envelope={schemaVersion:1,userId:scope.userId.toLowerCase(),orderId:scope.orderId.toLowerCase(),kind:scope.kind,savedAt:new Date().toISOString(),body:pending.body};const raw=JSON.stringify(record);storage.setItem(preparationPendingKey(scope),raw);if(storage.getItem(preparationPendingKey(scope))!==raw)invalid();}
export function acknowledgePreparationPending(storage:Pick<Storage,'getItem'|'removeItem'>,scope:PreparationScope,requestId:string){const pending=readPreparationPending(storage,scope);if(!pending)return;if(pending.body.requestId.toLowerCase()!==requestId.toLowerCase())throw Error('preparation_pending_request_locked');storage.removeItem(preparationPendingKey(scope));if(storage.getItem(preparationPendingKey(scope))!==null)invalid();}

import type {MaterialHistoryPage,MaterialHistoryDetail,MaterialHistoryRecord} from '../../../server/ainuoke-source/history';
export type {MaterialHistoryPage,MaterialHistoryDetail};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class MaterialHistoryError extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const date=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function invalid():never{throw new MaterialHistoryError(502,'invalid_material_history_response');}
function record(value:unknown,orderId:string):value is MaterialHistoryRecord{
 if(!object(value)||typeof value.runId!=='string'||!uuid.test(value.runId)||value.capturedTargetOrderId!==orderId||!date(value.capturedAt)||!date(value.recordedAt)||typeof value.salesContractNo!=='string')return false;
 if(value.capturedAttributionChangeId!==null&&(typeof value.capturedAttributionChangeId!=='string'||!uuid.test(value.capturedAttributionChangeId)))return false;
 return value.identityEvidence==='recorded_context'?Number.isSafeInteger(value.capturedOrderVersion)&&Number(value.capturedOrderVersion)>0&&typeof value.capturedSourceOwnerOrderId==='string'&&uuid.test(value.capturedSourceOwnerOrderId):value.identityEvidence==='legacy_context_unavailable'&&value.capturedOrderVersion===null&&value.capturedSourceOwnerOrderId===null;
}
function original(value:unknown,id:string):value is Record<string,unknown>{return object(value)&&value.originalOrderId===id&&typeof value.originalOrderNo==='string'&&typeof value.currentEffectiveOrderId==='string'&&uuid.test(value.currentEffectiveOrderId);}
export function validateHistoryPage(value:unknown,id:string):MaterialHistoryPage{
 if(!original(value,id)||value.schemaVersion!=='order-material-history-list.v1'||!Array.isArray(value.items)||value.items.length>50||value.items.some(row=>!record(row,id))||new Set(value.items.map(row=>(row as MaterialHistoryRecord).runId)).size!==value.items.length||typeof value.hasMore!=='boolean')invalid();
 if(value.hasMore?value.items.length===0||value.nextCursor!==(value.items.at(-1) as MaterialHistoryRecord).runId:value.nextCursor!==null)invalid();
 return value as unknown as MaterialHistoryPage;
}
export function validateHistoryDetail(value:unknown,id:string,runId:string):MaterialHistoryDetail{
 if(!original(value,id)||value.schemaVersion!=='order-material-history.v1'||value.usage!=='historical_only'||value.currentStatusApplicable!==false||value.projectionBasis!=='current-parser-on-captured-source'||!record(value.record,id)||value.record.runId!==runId||!object(value.progress))invalid();
 const progress=value.progress;
 const number=(n:unknown)=>n===null||typeof n==='number'&&Number.isFinite(n);
 if(progress.schemaVersion!=='order-material-history-progress.v1'||progress.sourceStatus!=='historical'||!object(progress.order)||typeof progress.order.styleNo!=='string'||typeof progress.order.insideOrderNo!=='string'||String(progress.order.salesContractNo).trim().toUpperCase()!==value.record.salesContractNo.trim().toUpperCase()||!Array.isArray(progress.rows)||!Array.isArray(progress.groups)||progress.rows.length>100000||!object(progress.summary))invalid();
 for(const row of progress.rows){if(!object(row)||row.status!==null||!object(row.demand)||typeof row.demand.id!=='string'||typeof row.demand.materialName!=='string'||!Array.isArray(row.purchases)||!Array.isArray(row.inbounds)||!Array.isArray(row.shipments)||!Array.isArray(row.outbounds)||!Array.isArray(row.issues)||row.issues.some(issue=>typeof issue!=='string')||typeof row.demand.materialColor!=='string'||typeof row.demand.specification!=='string'||!number(row.demand.requiredQuantity)||['purchased','inbound','shipped','outbound'].some(key=>!number(row[key]))||row.unit!==null&&typeof row.unit!=='string'||!['known','missing','conflict'].includes(String(row.unitStatus)))invalid();for(const key of ['purchases','inbounds','shipments','outbounds'])for(const event of row[key] as unknown[]){if(!object(event)||typeof event.id!=='string'||typeof event.quantity!=='number'||!Number.isFinite(event.quantity)||(key==='purchases'?( !object(event)||typeof event.purchaseOrderNo!=='string'||event.purchaseDate!==null&&typeof event.purchaseDate!=='string'):( !object(event)||typeof event.documentNo!=='string'||event.eventDate!==null&&typeof event.eventDate!=='string')))invalid();}}
 for(const type of ['fabric','trim']){const summary=progress.summary[type];if(!object(summary)||!object(summary.states)||['not_purchased','purchasing','pending_inbound','ready'].some(key=>!object(summary.states)||summary.states[key]!==0)||!Number.isSafeInteger(summary.demands)||summary.unknown!==summary.demands)invalid();}
 return value as unknown as MaterialHistoryDetail;
}
export function createMaterialHistoryClient(fetchImpl:typeof fetch=fetch){
 async function get(path:string,signal?:AbortSignal){const response=await fetchImpl(path,{method:'GET',credentials:'include',cache:'no-store',signal});let value:unknown;try{value=await response.json();}catch{invalid();}if(!response.ok){const code=object(value)&&object(value.error)&&typeof value.error.code==='string'&&/^[a-z_]{1,80}$/.test(value.error.code)?value.error.code:'material_history_read_failed';throw new MaterialHistoryError(response.status,code);}return value;}
 function path(id:string){if(!uuid.test(id))throw new MaterialHistoryError(400,'invalid_order_request');return '/api/v1/sales-orders/'+id.toLowerCase()+'/material-history';}
 return {list:async(id:string,cursor:string|null=null,signal?:AbortSignal)=>{const url=path(id);if(cursor&&!uuid.test(cursor))throw new MaterialHistoryError(400,'invalid_material_history_query');return validateHistoryPage(await get(url+'?'+new URLSearchParams({limit:'20',...(cursor?{cursor}: {})}),signal),id.toLowerCase());},read:async(id:string,runId:string,signal?:AbortSignal)=>{const url=path(id);if(!uuid.test(runId))throw new MaterialHistoryError(400,'invalid_material_history_request');return validateHistoryDetail(await get(url+'/'+runId.toLowerCase(),signal),id.toLowerCase(),runId.toLowerCase());}};
}
export const materialHistoryClient=createMaterialHistoryClient();

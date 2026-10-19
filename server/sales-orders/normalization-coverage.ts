import {HttpError} from '../http/errors.js';
import {normalizationHash,evidenceHashPattern} from './normalization-execution-model.js';
/** Supplied by a trusted server adapter, never by an HTTP command or actor claim.
 * Adapter owns a read/freeze lease through the callback INCLUDING database COMMIT.
 * A historical export with live writers cannot implement this contract. */
export type BusinessInventoryRecord={id:string;kind:'schedule'|'completion'|'purchase'|'shipment'|'tracking'|'closing'|'frozen_transaction';facts:Record<string,unknown>};
export type FrozenBusinessInventory={schemaVersion:'order-business-inventory.v1';targetFingerprint:string;memberOrderIds:string[];sourceKey:string;leaseId:string;expiresAt:string;orders:{id:string;execution:BusinessInventoryRecord[];financial:BusinessInventoryRecord[]}[]};
export type CoverageSnapshot={coverage:'unavailable';reason:string}|{coverage:'frozen_adapter_inventory';fingerprint:string;leaseId:string;expiresAt:string;sourceKey:string;orders:{id:string;executionCount:number;financialCount:number;executionHash:string;financialHash:string}[]};
export interface NormalizationCoverageProvider {
 withFrozenScope<T>(orderIds:readonly string[],targetFingerprint:string,run:(snapshot:CoverageSnapshot,revalidate:()=>Promise<void>)=>Promise<T>):Promise<T>;
}
export const unavailableNormalizationCoverage:NormalizationCoverageProvider={async withFrozenScope(_ids,_target,run){return run({coverage:'unavailable',reason:'no_trusted_frozen_production_finance_adapter'},async()=>undefined);}};
function invalid():never{throw new HttpError(409,'normalization_external_coverage_invalid','External inventory is invalid or incomplete');}
export function validateFrozenBusinessInventory(raw:unknown,ids:readonly string[],target:string,now=Date.now()):CoverageSnapshot{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Buffer.byteLength(JSON.stringify(raw))>33554432)invalid();
 const value=raw as FrozenBusinessInventory;
 if(!Number.isFinite(now)||value.schemaVersion!=='order-business-inventory.v1'||value.targetFingerprint!==target||!evidenceHashPattern.test(target)||typeof value.sourceKey!=='string'||!value.sourceKey.trim()||value.sourceKey.length>200||typeof value.leaseId!=='string'||!value.leaseId.trim()||value.leaseId.length>200||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)>now+3600000||!Array.isArray(value.memberOrderIds)||JSON.stringify([...value.memberOrderIds].sort())!==JSON.stringify([...ids].sort())||!Array.isArray(value.orders)||value.orders.length!==ids.length)invalid();
 const seen=new Set<string>();let count=0;
 const orders=value.orders.map(order=>{
  if(!order||!ids.includes(order.id)||seen.has(order.id)||!Array.isArray(order.execution)||!Array.isArray(order.financial))invalid();seen.add(order.id);
  const records=(rows:BusinessInventoryRecord[],finance:boolean)=>{const keys=new Set<string>();return rows.map(row=>{
   if(!row||typeof row.id!=='string'||!row.id.trim()||row.id.length>256||!row.facts||typeof row.facts!=='object'||Array.isArray(row.facts)||!(finance?['closing','frozen_transaction']:['schedule','completion','purchase','shipment','tracking']).includes(row.kind))invalid();
   const key=row.kind+':'+row.id;if(keys.has(key))invalid();keys.add(key);if(++count>100000)invalid();return {id:row.id,kind:row.kind,facts:row.facts};
  }).sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id));};
  const execution=records(order.execution,false),financial=records(order.financial,true);
  return {id:order.id,executionCount:execution.length,financialCount:financial.length,executionHash:normalizationHash(execution),financialHash:normalizationHash(financial)};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return {coverage:'frozen_adapter_inventory',sourceKey:value.sourceKey,leaseId:value.leaseId,expiresAt:value.expiresAt,orders,fingerprint:normalizationHash({target,sourceKey:value.sourceKey,leaseId:value.leaseId,expiresAt:value.expiresAt,orders})};
}
/** Adapter read is repeated before commit while its source lease is held. */
export function createFrozenInventoryCoverageProvider(ports:{read:(ids:readonly string[],target:string)=>Promise<unknown>;withReadLease:<T>(ids:readonly string[],run:()=>Promise<T>)=>Promise<T>;now?:()=>number}):NormalizationCoverageProvider{
 return {withFrozenScope(ids,target,run){return ports.withReadLease(ids,async()=>{
  const initial=validateFrozenBusinessInventory(await ports.read(ids,target),ids,target,(ports.now??Date.now)());
  return run(initial,async()=>{const current=validateFrozenBusinessInventory(await ports.read(ids,target),ids,target,(ports.now??Date.now)());if(normalizationHash(current)!==normalizationHash(initial))throw new HttpError(409,'normalization_external_coverage_changed','Frozen inventory changed');});
 });}};
}

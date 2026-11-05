import type { Pool, PoolClient } from 'pg';
import { collectWithPython, parseCollectorConfig, type CollectorConfig } from './collector.js';
import { SELECTED_SOURCE_LIMITS, validateSelectedSourceOnce, type SelectedSourceRequest } from './selected-source-once.js';
import { SourceError } from './contract.js';

export type RequestDiagnostic = { kind:'login'|'report'; reportId:6086103|6087105|6087050|null;
 page:number|null; elapsedMs:number; outcome:string; httpStatus:number|null };
const outcomes=new Set(['complete','http_error','timeout','dns_error','tls_error','connection_refused','connection_reset','network_error','auth_error','schema_error','unknown_error']);
/** A rejected payload is never publishable. Preserve only the independently
 * checked request trace, not its raw response, credentials or unverified metrics. */
export class CatalogDiagnosticValidationError extends SourceError {
 readonly diagnostics:RequestDiagnostic[];
 constructor(code:string,diagnostics:RequestDiagnostic[]) {
  super(code);this.diagnostics=validateRequestDiagnostics(diagnostics);
 }
}
export function validateRequestDiagnostics(input:unknown):RequestDiagnostic[] {
 if(!Array.isArray(input)||input.length>81)throw new SourceError('sync_diagnostics_invalid');
 return input.map(value=>{
  if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='elapsedMs,httpStatus,kind,outcome,page,reportId')throw new SourceError('sync_diagnostics_invalid');
  const d=value as RequestDiagnostic;
  if(!['login','report'].includes(d.kind)||!outcomes.has(d.outcome)||!Number.isSafeInteger(d.elapsedMs)||d.elapsedMs<0||d.elapsedMs>180000
   ||d.httpStatus!==null&&(!Number.isSafeInteger(d.httpStatus)||d.httpStatus<100||d.httpStatus>599)
   ||d.kind==='login'&&(d.reportId!==null||d.page!==null)
   ||d.kind==='report'&&(typeof d.reportId!=='number'||![6086103,6087105,6087050].includes(d.reportId)||!Number.isSafeInteger(d.page)||Number(d.page)<1||Number(d.page)>20))throw new SourceError('sync_diagnostics_invalid');
  return {...d};
 });
}
export async function collectCatalogDiagnostic(config:CollectorConfig,request:SelectedSourceRequest,now=Date.now()) {
 if(request.mode!=='catalog-discovery'&&request.mode!=='catalog-contracts')throw new SourceError('selected_source_scope_invalid');
 const cfg=parseCollectorConfig(config);
 // Reject invalid scopes through the normal preflight BEFORE spawning Python.
 if(request.mode==='catalog-contracts'&&(!Array.isArray(request.contracts)||request.contracts.length<1||request.contracts.length>25
  ||new Set(request.contracts).size!==request.contracts.length||request.contracts.some(c=>!/^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(c))))throw new SourceError('selected_source_scope_invalid');
 const value=await collectWithPython(cfg,request.contracts,{mode:request.mode,timeoutMs:SELECTED_SOURCE_LIMITS.timeoutMs,diagnostics:true});
 return validateCatalogDiagnostic(value,cfg,request,Math.max(now,Date.now()));
}
export async function validateCatalogDiagnostic(value:unknown,cfg:CollectorConfig,request:SelectedSourceRequest,now:number) {
 if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='capture,requests,schemaVersion')throw new SourceError('sync_diagnostics_invalid');
 const wrapped=value as {schemaVersion:string;capture:unknown;requests:unknown};
 if(wrapped.schemaVersion!=='ainuoke-request-diagnostics.v1')throw new SourceError('sync_diagnostics_invalid');
 const diagnostics=validateRequestDiagnostics(wrapped.requests);
 let capture;
 try {capture=await validateSelectedSourceOnce(wrapped.capture,cfg,request,now);}
 catch(error){
  // A retryable domain rejection occurs only after envelope/metrics validation.
  // Do not let a contradictory transport trace turn auth/schema failures into retries.
  if(error instanceof SourceError&&error.code==='catalog_business_content_changed'){
   const metrics=(wrapped.capture as {metrics:{httpAttempts:number}}).metrics;
   if(diagnostics.length!==metrics.httpAttempts||diagnostics.some(d=>d.outcome!=='complete'))
    throw new CatalogDiagnosticValidationError('sync_diagnostics_invalid',diagnostics);
  }
  if(error instanceof SourceError)throw new CatalogDiagnosticValidationError(error.code,diagnostics);
  throw error;
 }
 if(diagnostics.length!==capture.metrics.httpAttempts||capture.result==='complete'&&diagnostics.some(d=>d.outcome!=='complete'))throw new SourceError('sync_diagnostics_invalid');
 return {capture,diagnostics};
}
export const retryDelayMs=(attempt:number)=>attempt===1?60000:attempt===2?300000:null;
export function retryableCapture(code:string,diagnostics:RequestDiagnostic[]|null) {
 if(code==='catalog_business_content_changed')return true;
 if(code==='selected_source_timeout'||code==='source_timeout')return true;
 if(code!=='source_unavailable'||!diagnostics?.length)return false;
 const last=diagnostics.at(-1)!;
 return ['timeout','dns_error','connection_refused','connection_reset','network_error'].includes(last.outcome)
  ||last.outcome==='http_error'&&(last.httpStatus===429||Number(last.httpStatus)>=500);
}
export const diagnosticSummary=(items:RequestDiagnostic[]|null)=>{
 const last=items?.find(d=>d.outcome!=='complete');
 return last?{kind:last.kind,reportId:last.reportId,page:last.page,elapsedMs:last.elapsedMs,outcome:last.outcome,httpStatus:last.httpStatus}:null;
};
export async function finishCaptureAttempt(c:Pick<Pool|PoolClient,'query'>,id:string,code:string|null,diagnostics:RequestDiagnostic[]|null,metrics:unknown,now:number) {
 await c.query(`UPDATE ainuoke_sync_capture_attempts SET status=$2,finished_at=$3,result_code=$4,requests=$5::jsonb,metrics=$6::jsonb WHERE id=$1 AND status='running'`,
  [id,code?'failed':'complete',new Date(now),code,diagnostics?JSON.stringify(validateRequestDiagnostics(diagnostics)):null,metrics?JSON.stringify(metrics):null]);
}

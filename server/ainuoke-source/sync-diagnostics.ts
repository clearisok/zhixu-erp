import type { Pool, PoolClient } from 'pg';
import { collectWithPython, parseCollectorConfig, type CollectorConfig } from './collector.js';
import { SELECTED_SOURCE_LIMITS, validateSelectedSourceOnce, type SelectedSourceRequest } from './selected-source-once.js';
import { SourceError } from './contract.js';
import type {CatalogPage} from './catalog-checkpoints.js';

export type LoginEvidence = { responseShape:'data_object'|'object_without_data_object'|'non_object'; result:'accepted'|'rejected'|'malformed'; serverCode:'absent'|'cover_confirmation'|'unrecognized'; serverHint:'unclassified'|'session_exists'|'verification_required'|'credentials_rejected'|'account_unavailable'|'throttling_hint'|'cover_confirmation_required'|'user_capacity_exhausted' };
export type LoginDetails = {at:string;interface:'loginsys2';isOk:boolean|null;businessCode:string|null;text1:string|null;message:string|null;errorMsg?:string|null};
export type RequestDiagnostic = { kind:'login'|'report'; reportId:6086103|6087105|6087050|6087051|6086405|6086408|6086875|6086354|null;
 page:number|null; elapsedMs:number; outcome:string; httpStatus:number|null; loginEvidence?:LoginEvidence;loginDetails?:LoginDetails };
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
  if(!value||typeof value!=='object'||!['elapsedMs,httpStatus,kind,outcome,page,reportId','elapsedMs,httpStatus,kind,loginEvidence,outcome,page,reportId','elapsedMs,httpStatus,kind,loginDetails,loginEvidence,outcome,page,reportId'].includes(Object.keys(value).sort().join(',')))throw new SourceError('sync_diagnostics_invalid');
  const d=value as RequestDiagnostic;
  if(!['login','report'].includes(d.kind)||!outcomes.has(d.outcome)||!Number.isSafeInteger(d.elapsedMs)||d.elapsedMs<0||d.elapsedMs>180000
   ||d.httpStatus!==null&&(!Number.isSafeInteger(d.httpStatus)||d.httpStatus<100||d.httpStatus>599)
   ||d.kind==='login'&&(d.reportId!==null||d.page!==null)
   ||d.kind==='report'&&(typeof d.reportId!=='number'||![6086103,6087105,6087050,6087051,6086405,6086408,6086875,6086354].includes(d.reportId)||!Number.isSafeInteger(d.page)||Number(d.page)<1||Number(d.page)>(d.reportId===6086103?28:20)))throw new SourceError('sync_diagnostics_invalid');
  if('loginDetails' in d){
   const e=d.loginDetails;
   if(d.kind!=='login'||!e||!['at,businessCode,interface,isOk,message,text1','at,businessCode,errorMsg,interface,isOk,message,text1'].includes(Object.keys(e).sort().join(','))
    ||e.interface!=='loginsys2'||typeof e.at!=='string'||e.at.length>40||!Number.isFinite(Date.parse(e.at))
    ||e.isOk!==null&&typeof e.isOk!=='boolean'
    ||[e.businessCode,e.text1,e.message,...('errorMsg' in e?[e.errorMsg]:[])].some(v=>v!==null&&(typeof v!=='string'||v.length>256||/[\r\n\x00-\x1f]/u.test(v))))throw new SourceError('sync_diagnostics_invalid');
  }
  if('loginEvidence' in d){
   const e=d.loginEvidence;
   if(d.kind!=='login'||!e||typeof e!=='object'||Object.keys(e).sort().join(',')!=='responseShape,result,serverCode,serverHint'
    ||!['data_object','object_without_data_object','non_object'].includes(e.responseShape)
    ||!['accepted','rejected','malformed'].includes(e.result)
    ||!['absent','cover_confirmation','unrecognized'].includes(e.serverCode)
    ||!['unclassified','session_exists','verification_required','credentials_rejected','account_unavailable','throttling_hint','cover_confirmation_required','user_capacity_exhausted'].includes(e.serverHint)
    ||e.result==='rejected'&&d.outcome!=='auth_error')throw new SourceError('sync_diagnostics_invalid');
   return {...d,loginEvidence:{...e}};
  }
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
export async function validateCatalogDiagnostic(value:unknown,cfg:CollectorConfig,request:SelectedSourceRequest,now:number,resumePages:readonly CatalogPage[]=[]) {
 if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='capture,requests,schemaVersion')throw new SourceError('sync_diagnostics_invalid');
 const wrapped=value as {schemaVersion:string;capture:unknown;requests:unknown};
 const sessionReuse=wrapped.schemaVersion==='ainuoke-session-diagnostics.v1';
 if(!sessionReuse&&wrapped.schemaVersion!=='ainuoke-request-diagnostics.v1')throw new SourceError('sync_diagnostics_invalid');
 const diagnostics=validateRequestDiagnostics(wrapped.requests);
 let capture;
 try {capture=await validateSelectedSourceOnce(wrapped.capture,cfg,request,now,sessionReuse,resumePages);}
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
 const errors=diagnostics.filter(d=>d.outcome!=='complete');
 if(diagnostics.length!==capture.metrics.httpAttempts||diagnostics.filter(d=>d.kind==='login').length!==capture.metrics.logins
 ||capture.result==='complete'&&(errors.length!==capture.metrics.authRenewals||errors.some(d=>!sessionReuse||d.kind!=='report'||d.outcome!=='auth_error')))throw new SourceError('sync_diagnostics_invalid');
 if(capture.result==='complete'&&capture.metrics.authRenewals===1){
  const i=diagnostics.findIndex(d=>d.outcome==='auth_error'),failed=diagnostics[i],login=diagnostics[i+1],retry=diagnostics[i+2];
  if(i<0||login?.kind!=='login'||login.outcome!=='complete'||login.loginEvidence?.result!=='accepted'
   ||retry?.kind!=='report'||retry.outcome!=='complete'||retry.reportId!==failed.reportId||retry.page!==failed.page)
   throw new SourceError('sync_diagnostics_invalid');
 }
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

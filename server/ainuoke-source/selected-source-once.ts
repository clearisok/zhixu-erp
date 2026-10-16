import type { VisibleMaterialOrder } from '../../features/ainuoke-material-progress/read-service.js';
import { accountFingerprint, APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, collectWithPython,
  parseCollectorConfig, type CollectorConfig } from './collector.js';
import { SourceError, hash, inspect, validateBundle } from './contract.js';
import { previewSelectedBindings } from './binding.js';
import type { AdditionBundle } from './additions.js';
import {normalizeAinuokeSalesContractNo} from '../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js';

/** Fixed engineering budget, not human authorization or a scheduler lease. */
export const SELECTED_SOURCE_LIMITS = Object.freeze({contracts:2,logins:1,reportRequests:80,httpAttempts:81,
  pageSize:50,pagesPerReport:20,rowsPerReport:1000,sourceRows:4000,responseBytes:4*1024*1024,
  workerBytes:32*1024*1024,timeoutMs:180000});
const failureCodes = new Set(['selected_source_timeout','selected_source_request_limit','selected_source_endpoint_refused',
  'selected_source_response_limit','selected_source_page_limit','selected_source_row_limit','selected_source_query_refused',
  'selected_source_secret_reflection','invalid_credential','auth_expired','source_unavailable','selected_source_invalid']);
export type SelectedSourceRequest = {mode:'selected-bindings';contracts:string[]}
  | {mode:'selected-materials';targets:VisibleMaterialOrder[]};
export type SelectedSourceMetrics = {logins:number;reportRequests:number;httpAttempts:number;networkRetries:0;authRenewals:0};
const keys = (o:object) => Object.keys(o).sort().join(',');
function object(input:unknown):Record<string,unknown> {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new SourceError('selected_source_invalid');
  return input as Record<string,unknown>;
}
function scope(config:CollectorConfig,request:SelectedSourceRequest) {
  const checked=parseCollectorConfig(config),r=object(request);
  if(!['selected-bindings','selected-materials'].includes(String(r.mode))
    || keys(r)!==(r.mode==='selected-bindings'?'contracts,mode':'mode,targets'))
    throw new SourceError('selected_source_scope_invalid');
  // Generic legacy loopback transport is deliberately outside this fixed permit.
  if(checked.baseUrl.startsWith('http:')&&(checked.baseUrl!==APPROVED_HTTP_ORIGIN||checked.transportPolicy!==APPROVED_HTTP_POLICY))
    throw new SourceError('protected_source_transport_required');
  const values=r.mode==='selected-bindings'?r.contracts:Array.isArray(r.targets)?r.targets.map(t=>object(t).salesContractNo):null;
  if(!Array.isArray(values)||values.length!==2||values.some(c=>typeof c!=='string'||!/^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(c))
    ||new Set(values).size!==2)throw new SourceError('selected_source_scope_invalid');
  return {config:checked,contracts:[...values].sort() as string[],request:structuredClone(request)};
}

/** Revalidate untrusted child output before handing it to the existing domain mappers.
 * No database access, persistence, credentials-file loader, or source enable operation.
 */
export async function validateSelectedSourceOnce(input:unknown,config:CollectorConfig,request:SelectedSourceRequest,now=Date.now()) {
  const checked=scope(config,request);
  try {
    const serialized=JSON.stringify(input);
    if(!serialized||Buffer.byteLength(serialized)>SELECTED_SOURCE_LIMITS.workerBytes||serialized.includes(checked.config.password))
      throw new SourceError('selected_source_invalid');
    inspect(input);
    const value=object(structuredClone(input));
    if(keys(value)!=='bundle,code,databaseAccess,limits,metrics,mode,result,schemaVersion,selectedContracts,sourceActivation,sourceFingerprint'
      ||value.schemaVersion!=='ainuoke-selected-source-once.v1'||value.mode!==checked.request.mode
      ||value.databaseAccess!=='none'||value.sourceActivation!=='not-activated'
      ||hash(value.limits)!==hash(SELECTED_SOURCE_LIMITS)||value.sourceFingerprint!==accountFingerprint(checked.config)
      ||hash(value.selectedContracts)!==hash(checked.contracts))throw new SourceError('selected_source_scope_mismatch');
    const m=object(value.metrics);
    if(keys(m)!=='authRenewals,httpAttempts,logins,networkRetries,reportRequests'||m.networkRetries!==0||m.authRenewals!==0
      ||!Number.isSafeInteger(m.logins)||!Number.isSafeInteger(m.reportRequests)||!Number.isSafeInteger(m.httpAttempts)
      ||Number(m.logins)<0||Number(m.logins)>1||Number(m.reportRequests)<0||Number(m.reportRequests)>80
      ||m.httpAttempts!==Number(m.logins)+Number(m.reportRequests)||(m.logins===0&&m.reportRequests!==0))
      throw new SourceError('selected_source_metrics_invalid');
    const metrics=m as SelectedSourceMetrics;
    if(value.result==='failed') {
      if(value.bundle!==null||typeof value.code!=='string'||!failureCodes.has(value.code))throw new SourceError('selected_source_invalid');
      return {result:'failed' as const,code:value.code,metrics};
    }
    if(value.result!=='complete'||value.code!==null||metrics.logins!==1)throw new SourceError('selected_source_invalid');
    const b=object(value.bundle),detail=object(checked.request.mode==='selected-bindings'?b.colors:b.materials);
    if(hash(Object.keys(detail).sort())!==hash([...checked.contracts].sort()))throw new SourceError('selected_source_scope_mismatch');
    // 6087105's existing catalog uses contains. Do not mistake a successful
    // query for proof that every returned row belongs to the requested contract.
    for(const [contract,pages] of Object.entries(detail)) {
      if(!Array.isArray(pages))throw new SourceError('selected_source_invalid');
      for(const page of pages) {
        const rows=object(page).rows;if(!Array.isArray(rows))throw new SourceError('selected_source_invalid');
        for(const row of rows) {
          const values=object(object(row).values),raw=values[checked.request.mode==='selected-bindings'?'BillNo':'ExpContractNo'];
          if(typeof raw!=='string'||normalizeAinuokeSalesContractNo(raw)!==contract)throw new SourceError('selected_source_row_scope_mismatch');
        }
      }
    }
    let pageCount=0,rowCount=0;
    for(const group of [b.discoveryBefore,b.discoveryAfter,...Object.values(detail)]) {
      if(!Array.isArray(group)||group.length<1||group.length>20)throw new SourceError('selected_source_page_limit');
      const first=object(group[0]),total=first.total;
      if(!Number.isSafeInteger(total)||Number(total)<0||Number(total)>1000||group.length!==Math.max(1,Math.ceil(Number(total)/50)))
        throw new SourceError('selected_source_page_limit');
      for(const [i,raw] of group.entries()) {
        const p=object(raw);
        if(p.page!==i+1||p.pageSize!==50||p.total!==total||!Array.isArray(p.rows)
          ||p.rows.length!==Math.min(50,Math.max(0,Number(total)-i*50)))throw new SourceError('selected_source_paging_invalid');
        pageCount++;rowCount+=p.rows.length;
      }
    }
    if(pageCount!==metrics.reportRequests||rowCount>4000)throw new SourceError('selected_source_metrics_invalid');
    if(checked.request.mode==='selected-bindings') {
      const preview=await previewSelectedBindings(value.bundle,checked.contracts,now,600000);
      return {result:'complete' as const,mode:'selected-bindings' as const,metrics,bundle:value.bundle as AdditionBundle,preview};
    }
    const validated=await validateBundle(value.bundle,checked.request.targets,now,600000);
    if(validated.rows.length!==2)throw new SourceError('selected_source_scope_mismatch');
    return {result:'complete' as const,mode:'selected-materials' as const,metrics,bundle:validated.bundle,validated};
  } catch(error) {throw error instanceof SourceError?error:new SourceError('selected_source_invalid');}
}

export async function collectSelectedSourceOnce(config:CollectorConfig,request:SelectedSourceRequest,
  options:{python?:string;timeoutMs?:number;now?:()=>number}={}) {
  const checked=scope(config,request),timeout=options.timeoutMs??SELECTED_SOURCE_LIMITS.timeoutMs;
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>SELECTED_SOURCE_LIMITS.timeoutMs)throw new SourceError('selected_source_timeout_invalid');
  const input=await collectWithPython(checked.config,checked.contracts,{mode:checked.request.mode,timeoutMs:timeout,python:options.python});
  return validateSelectedSourceOnce(input,checked.config,checked.request,options.now?.()??Date.now());
}

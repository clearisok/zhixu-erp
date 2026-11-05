import { previewCatalog } from './catalog.js';
import type { VisibleMaterialOrder } from '../../features/ainuoke-material-progress/read-service.js';
import { accountFingerprint, APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, collectWithPython,
  parseCollectorConfig, type CollectorConfig } from './collector.js';
import { SourceError, hash, inspect, validateBundle } from './contract.js';
import { previewSelectedBindings } from './binding.js';
import { previewAdditions, type AdditionBundle } from './additions.js';
import {normalizeAinuokeSalesContractNo} from '../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js';

/** Fixed engineering budget, not human authorization or a scheduler lease. */
export const SELECTED_SOURCE_LIMITS = Object.freeze({contracts:2,logins:1,reportRequests:80,httpAttempts:81,
  pageSize:50,pagesPerReport:20,rowsPerReport:1000,sourceRows:4000,responseBytes:4*1024*1024,
  workerBytes:32*1024*1024,timeoutMs:180000});
/** Separate protocol: an explicit bound-order scope, with the SAME aggregate
 * request/row/time budget. Existing two-contract v1 permits stay unchanged. */
export const BOUND_MATERIAL_LIMITS = Object.freeze({...SELECTED_SOURCE_LIMITS,contracts:25});
const failureCodes = new Set(['selected_source_timeout','selected_source_request_limit','selected_source_endpoint_refused',
  'selected_source_response_limit','selected_source_page_limit','selected_source_row_limit','selected_source_query_refused',
  'selected_source_secret_reflection','invalid_credential','auth_expired','source_unavailable','selected_source_invalid']);
export const CATALOG_LIMITS = Object.freeze({...SELECTED_SOURCE_LIMITS,contracts:0,reportRequests:56,httpAttempts:57,pagesPerReport:28,rowsPerReport:1400});
export const CATALOG_CONTRACT_LIMITS = Object.freeze({...BOUND_MATERIAL_LIMITS,pagesPerReport:28,rowsPerReport:1400});
export type SelectedSourceRequest = {mode:'catalog-discovery';contracts:[]}
  | {mode:'catalog-contracts';contracts:string[]}
  | {mode:'selected-bindings';contracts:string[]}
  | {mode:'selected-materials'|'bound-materials';targets:VisibleMaterialOrder[]};
export type SelectedSourceMetrics = {logins:number;reportRequests:number;httpAttempts:number;networkRetries:0;authRenewals:0};
const keys = (o:object) => Object.keys(o).sort().join(',');
function object(input:unknown):Record<string,unknown> {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new SourceError('selected_source_invalid');
  return input as Record<string,unknown>;
}
function rejectSecretValue(value:unknown,secret:string,depth=0):void {
  if(depth>12)throw new SourceError('selected_source_invalid');
  if(typeof value==='string'&&value.includes(secret))throw new SourceError('source_secret_field');
  if(Array.isArray(value))for(const item of value)rejectSecretValue(item,secret,depth+1);
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
    rejectSecretValue(key,secret,depth+1);rejectSecretValue(item,secret,depth+1);
  }
}
function scope(config:CollectorConfig,request:SelectedSourceRequest) {
  const checked=parseCollectorConfig(config),r=object(request);
  if(!['selected-bindings','selected-materials','bound-materials','catalog-discovery','catalog-contracts'].includes(String(r.mode))
    || keys(r)!==(['selected-bindings','catalog-discovery','catalog-contracts'].includes(String(r.mode))?'contracts,mode':'mode,targets'))
    throw new SourceError('selected_source_scope_invalid');
  // Generic legacy loopback transport is deliberately outside this fixed permit.
  if(checked.baseUrl.startsWith('http:')&&(checked.baseUrl!==APPROVED_HTTP_ORIGIN||checked.transportPolicy!==APPROVED_HTTP_POLICY))
    throw new SourceError('protected_source_transport_required');
  const values=['selected-bindings','catalog-discovery','catalog-contracts'].includes(String(r.mode))?r.contracts:Array.isArray(r.targets)?r.targets.map(t=>object(t).salesContractNo):null;
  const bounded=r.mode==='bound-materials'||r.mode==='catalog-contracts', catalog=r.mode==='catalog-discovery';
  if(!Array.isArray(values)||(catalog ? values.length!==0 : bounded ? values.length<1||values.length>25 : values.length!==2)
    ||values.some(c=>typeof c!=='string'||!/^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(c))
    ||new Set(values).size!==values.length)throw new SourceError('selected_source_scope_invalid');
  return {config:checked,contracts:[...values].sort() as string[],request:structuredClone(request),
    limits:catalog?CATALOG_LIMITS:r.mode==='catalog-contracts'?CATALOG_CONTRACT_LIMITS:bounded?BOUND_MATERIAL_LIMITS:SELECTED_SOURCE_LIMITS,
    schemaVersion:r.mode==='catalog-contracts'?'ainuoke-catalog-contracts.v1':catalog?'ainuoke-catalog-discovery.v1':bounded?'ainuoke-bound-materials-once.v1':'ainuoke-selected-source-once.v1'};
}

/** Revalidate untrusted child output before handing it to the existing domain mappers.
 * No database access, persistence, credentials-file loader, or source enable operation.
 */
export async function validateSelectedSourceOnce(input:unknown,config:CollectorConfig,request:SelectedSourceRequest,now=Date.now()) {
  const checked=scope(config,request);
  try {
    const serialized=JSON.stringify(input);
    if(!serialized||Buffer.byteLength(serialized)>SELECTED_SOURCE_LIMITS.workerBytes)
      throw new SourceError('selected_source_invalid');
    inspect(input);
    rejectSecretValue(input,checked.config.password);
    const value=object(structuredClone(input));
    if(keys(value)!=='bundle,code,databaseAccess,limits,metrics,mode,result,schemaVersion,selectedContracts,sourceActivation,sourceFingerprint'
      ||value.schemaVersion!==checked.schemaVersion||value.mode!==checked.request.mode
      ||value.databaseAccess!=='none'||value.sourceActivation!=='not-activated'
      ||hash(value.limits)!==hash(checked.limits)||value.sourceFingerprint!==accountFingerprint(checked.config)
      ||hash(value.selectedContracts)!==hash(checked.contracts))throw new SourceError('selected_source_scope_mismatch');
    const m=object(value.metrics);
    if(keys(m)!=='authRenewals,httpAttempts,logins,networkRetries,reportRequests'||m.networkRetries!==0||m.authRenewals!==0
      ||!Number.isSafeInteger(m.logins)||!Number.isSafeInteger(m.reportRequests)||!Number.isSafeInteger(m.httpAttempts)
      ||Number(m.logins)<0||Number(m.logins)>1||Number(m.reportRequests)<0||Number(m.reportRequests)>checked.limits.reportRequests
      ||m.httpAttempts!==Number(m.logins)+Number(m.reportRequests)||(m.logins===0&&m.reportRequests!==0))
      throw new SourceError('selected_source_metrics_invalid');
    const metrics=m as SelectedSourceMetrics;
    if(value.result==='failed') {
      if(value.bundle!==null||typeof value.code!=='string'||!failureCodes.has(value.code))throw new SourceError('selected_source_invalid');
      return {result:'failed' as const,code:value.code,metrics};
    }
    if(value.result!=='complete'||value.code!==null||metrics.logins!==1)throw new SourceError('selected_source_invalid');
    const b=object(value.bundle),detail=checked.request.mode==='catalog-discovery'?{}:object(checked.request.mode==='selected-bindings'?b.colors:b.materials);
    if(hash(Object.keys(detail).sort())!==hash([...checked.contracts].sort()))throw new SourceError('selected_source_scope_mismatch');
    // 6087105's existing catalog uses contains. Do not mistake a successful
    // query for proof that every returned row belongs to the requested contract.
    const details=checked.request.mode==='catalog-contracts'?[{value:detail,field:'ExpContractNo'},{value:object(b.colors),field:'BillNo'}]
      :[{value:detail,field:checked.request.mode==='selected-bindings'?'BillNo':'ExpContractNo'}];
    for(const item of details) {
     if(hash(Object.keys(item.value).sort())!==hash([...checked.contracts].sort()))throw new SourceError('selected_source_scope_mismatch');
     for(const [contract,pages] of Object.entries(item.value)) {
      if(!Array.isArray(pages))throw new SourceError('selected_source_invalid');
      for(const page of pages) {
        const rows=object(page).rows;if(!Array.isArray(rows))throw new SourceError('selected_source_invalid');
        for(const row of rows) {
          const values=object(object(row).values),raw=values[item.field];
          if(typeof raw!=='string'||normalizeAinuokeSalesContractNo(raw)!==contract)throw new SourceError('selected_source_row_scope_mismatch');
        }
      }
     }
    }
    let pageCount=0,rowCount=0;
    for(const [groupIndex,group] of [b.discoveryBefore,b.discoveryAfter,...details.flatMap(d=>Object.values(d.value))].entries()) {
      const extendedDirectory=groupIndex<2&&['catalog-discovery','catalog-contracts'].includes(checked.request.mode);
      const maximumRows=extendedDirectory?1400:1000,maximumPages=extendedDirectory?28:20;
      if(!Array.isArray(group)||group.length<1||group.length>maximumPages)throw new SourceError('selected_source_page_limit');
      const first=object(group[0]),total=first.total;
      if(!Number.isSafeInteger(total)||Number(total)<0||Number(total)>maximumRows||group.length!==Math.max(1,Math.ceil(Number(total)/50)))
        throw new SourceError('selected_source_page_limit');
      for(const [i,raw] of group.entries()) {
        const p=object(raw);
        if(p.page!==i+1||p.pageSize!==50||p.total!==total||!Array.isArray(p.rows)
          ||p.rows.length!==Math.min(50,Math.max(0,Number(total)-i*50)))throw new SourceError('selected_source_paging_invalid');
        pageCount++;rowCount+=p.rows.length;
      }
    }
    if(pageCount!==metrics.reportRequests||rowCount>4000)throw new SourceError('selected_source_metrics_invalid');
    if(checked.request.mode==='catalog-discovery'){
      const preview=await previewCatalog(value.bundle,now);
      return {result:'complete' as const,mode:'catalog-discovery' as const,metrics,bundle:preview.bundle,preview};
    }
    if(checked.request.mode==='catalog-contracts'){
      if(b.schemaVersion!=='ainuoke-contract-details.v1'||keys(b)!=='colors,discoveryAfter,discoveryBefore,materials,schemaVersion')throw new SourceError('selected_source_invalid');
      const directory=await previewCatalog({schemaVersion:'ainuoke-order-addition-discovery.v1',discoveryBefore:b.discoveryBefore,discoveryAfter:b.discoveryAfter},now);
      const addition={schemaVersion:'ainuoke-order-addition.v1',discoveryBefore:b.discoveryBefore,discoveryAfter:b.discoveryAfter,colors:b.colors} as AdditionBundle;
      const selected=directory.rows.filter(r=>checked.contracts.includes(r.salesContractNo));
      if(selected.length!==checked.contracts.length)throw new SourceError('selected_source_scope_mismatch');
      const contracts:Record<string,{code:string}|{addition:AdditionBundle;candidates:Awaited<ReturnType<typeof previewAdditions>>;materials:Awaited<ReturnType<typeof validateBundle>>}>={};
      // Transport scope, all rows, pagination and stable directory were checked
      // above. A historical contract's invalid business facts must not reject
      // another valid contract from this same already-spent network request.
      for(const row of selected){
        const contract=row.salesContractNo;
        try {
          const oneAddition={...addition,colors:{[contract]:addition.colors[contract]}};
          const candidates=await previewAdditions(oneAddition,[contract],[],now,600000);
          if(candidates.candidates.some(c=>c.colorDetailStatus!=='usable'))throw new SourceError('source_color_incomplete');
          const materials=await validateBundle({schemaVersion:'ainuoke-server-source.v1',discoveryBefore:b.discoveryBefore,discoveryAfter:b.discoveryAfter,materials:{[contract]:detail[contract]}},
            [{id:row.sourceId,version:1,salesContractNo:contract,styleNo:row.styleNo,insideOrderNo:row.insideOrderNo}],now,600000);
          contracts[contract]={addition:oneAddition,candidates,materials};
        }catch(e){contracts[contract]={code:e instanceof SourceError?e.code:'source_contract_invalid'};}
      }
      return {result:'complete' as const,mode:'catalog-contracts' as const,metrics,directory,contracts};
    }
    if(checked.request.mode==='selected-bindings') {
      const preview=await previewSelectedBindings(value.bundle,checked.contracts,now,600000);
      return {result:'complete' as const,mode:'selected-bindings' as const,metrics,bundle:value.bundle as AdditionBundle,preview};
    }
    const validated=await validateBundle(value.bundle,checked.request.targets,now,600000);
    if(validated.rows.length!==checked.contracts.length)throw new SourceError('selected_source_scope_mismatch');
    return {result:'complete' as const,mode:checked.request.mode,metrics,bundle:validated.bundle,validated};
  } catch(error) {throw error instanceof SourceError?error:new SourceError('selected_source_invalid');}
}

export async function collectSelectedSourceOnce(config:CollectorConfig,request:SelectedSourceRequest,
  options:{python?:string;timeoutMs?:number;now?:()=>number}={}) {
  const checked=scope(config,request),timeout=options.timeoutMs??SELECTED_SOURCE_LIMITS.timeoutMs;
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>SELECTED_SOURCE_LIMITS.timeoutMs)throw new SourceError('selected_source_timeout_invalid');
  const input=await collectWithPython(checked.config,checked.contracts,{mode:checked.request.mode,timeoutMs:timeout,python:options.python});
  return validateSelectedSourceOnce(input,checked.config,checked.request,options.now?.()??Date.now());
}

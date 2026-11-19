import type {AdditionDiscoveryBundle} from './additions.js';
import {hash,SourceError} from './contract.js';
import type {CatalogPage} from './catalog-checkpoints.js';

// These fields feed business mirrors, never the id/BillNo binding. Price is
// source business data, not a Quote/PV/CCT price or a contract identity.
export const mutableCatalogFields=new Set(['DeliveryDate','ContractDate','Num','Status','GoodsDesc','Brand','CustomerName','Price']);
export type CatalogFieldDifference={reportId:'6086103';page:number;afterPage:number;rowId:string;salesContractNo:string;field:string;
 beforeExists:boolean;afterExists:boolean;beforeType:string;afterType:string;beforeValue:unknown;afterValue:unknown;
 beforeHash:string;afterHash:string;beforeFetchedAt:string;afterFetchedAt:string;classification:string;valuesRedacted:boolean};
const state=(v:Record<string,unknown>,key:string)=>({exists:Object.hasOwn(v,key),type:!Object.hasOwn(v,key)?'missing':v[key]===null?'null':Array.isArray(v[key])?'array':typeof v[key],value:v[key]??null});
// Diagnostic equality only. It NEVER normalizes a published source value or
// equates absence/null/empty with zero. Bounded decimal text avoids rounding.
function decimal(v:unknown):string|null{
 if(typeof v!=='number'&&typeof v!=='string')return null;
 const s=String(v).trim();if(s.length>256)return null;
 const m=/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d{1,4}))?$/.exec(s);if(!m)return null;
 const digits=(m[2]+(m[3]??'')).replace(/^0+/,'').replace(/0+$/,'');
 if(!digits)return '0';
 const raw=(m[2]+(m[3]??'')).replace(/^0+/,'');
 return `${m[1]==='-'?'-':''}${digits}e${Number(m[4]??0)-(m[3]?.length??0)+(raw.length-digits.length)}`;
}
export function classifyCatalogField(before:Record<string,unknown>,after:Record<string,unknown>,field:string){
 const a=state(before,field),b=state(after,field);
 if(!a.exists)return 'field_appeared';if(!b.exists)return 'field_disappeared';
 if(a.type==='null'||b.type==='null')return a.type==='null'?'null_to_value':'value_to_null';
 if(a.value===''||b.value==='')return a.value===''?'empty_to_value':'value_to_empty';
 if(a.type!==b.type)return 'type_changed';
 const x=decimal(a.value),y=decimal(b.value);
 return x!==null&&x===y?'numeric_format_or_precision_changed':'value_changed';
}
export type CatalogChangeDiagnostic={beforeRows:number;afterRows:number;added:number;removed:number;identityChanges:number;changedFields:string[];scopeChanged:boolean};
export class CatalogConsistencyError extends SourceError {
 constructor(code:string,readonly catalogChange:CatalogChangeDiagnostic,readonly differences:CatalogFieldDifference[]=[],readonly recaptured:CatalogPage[]=[]){super(code);}
}

/** Both passes must already have passed complete pagination, row identity and
 * secret checks. A benign addition is a reason to recapture, never to publish
 * the mismatching pair or reuse its business details. */
export function catalogChangeEvidence(bundle:AdditionDiscoveryBundle){
 const before=bundle.discoveryBefore.flatMap(p=>p.rows),after=bundle.discoveryAfter.flatMap(p=>p.rows);
 const byId=new Map(after.map(r=>[String(r.values.id).trim(),r]));
 const oldIds=new Set(before.map(r=>String(r.values.id).trim()));
 const scope=(page:typeof bundle.discoveryBefore[number])=>{
  const {rows,fetchedAt,snapshotHash,page:number,total,...rest}=page;
  void rows;void fetchedAt;void snapshotHash;void number;void total;return hash(rest);
 };
 const scopeChanged=[...bundle.discoveryBefore,...bundle.discoveryAfter].some(p=>scope(p)!==scope(bundle.discoveryBefore[0]));
 let removed=0,identityChanges=0;
 // Unknown envelope metadata must not gain retry permission merely because a
 // normal new contract was added in the same capture.
 let fixedChanged=[...before,...after].some(r=>Object.keys(r).sort().join(',')!=='sourceRowIdentity,values');
 const changedFields=new Set<string>(),differences:CatalogFieldDifference[]=[];
 const beforePages=new Map(bundle.discoveryBefore.flatMap(p=>p.rows.map(r=>[String(r.values.id).trim(),p] as const)));
 const afterPages=new Map(bundle.discoveryAfter.flatMap(p=>p.rows.map(r=>[String(r.values.id).trim(),p] as const)));
 for(const row of before){
  const next=byId.get(String(row.values.id).trim());
  if(!next){removed++;continue;}
  if(row.values.BillNo!==next.values.BillNo)identityChanges++;
  const fixed=(values:typeof row.values)=>Object.fromEntries(Object.entries(values).filter(([key])=>!mutableCatalogFields.has(key)));
  if(hash(fixed(row.values))!==hash(fixed(next.values)))fixedChanged=true;
  for(const key of new Set([...Object.keys(row.values),...Object.keys(next.values)])){
   if(hash(state(row.values,key))!==hash(state(next.values,key))){
    const field=/^[A-Za-z0-9_]{1,64}$/.test(key)?key:'unrecognized_field';changedFields.add(field);
    const a=state(row.values,key),b=state(next.values,key),p=beforePages.get(String(row.values.id).trim())!,q=afterPages.get(String(next.values.id).trim())!;
    // Names/unknown fields can contain personal or credential material. Keep
    // exact type/existence/hash, but raw values only for approved non-PII data.
    const redacted=!['Price','Num','Status','DeliveryDate','ContractDate','GoodsDesc','Brand','id','BillNo','InsideOrderNo','hsid'].includes(field);
    differences.push({reportId:'6086103',page:p.page,afterPage:q.page,rowId:String(row.values.id).trim(),salesContractNo:String(row.values.BillNo),field,
     beforeExists:a.exists,afterExists:b.exists,beforeType:a.type,afterType:b.type,beforeValue:redacted?null:a.value,afterValue:redacted?null:b.value,
     beforeHash:hash(a),afterHash:hash(b),beforeFetchedAt:p.fetchedAt,afterFetchedAt:q.fetchedAt,
     classification:classifyCatalogField(row.values,next.values,key),valuesRedacted:redacted});
   }
  }
  if(hash(row.values)===hash(next.values)&&row.sourceRowIdentity!==next.sourceRowIdentity)fixedChanged=true;
 }
 const added=after.filter(r=>!oldIds.has(String(r.values.id).trim())).length;
 const diagnostic:CatalogChangeDiagnostic={beforeRows:before.length,afterRows:after.length,added,removed,identityChanges,changedFields:[...changedFields].sort().slice(0,32),scopeChanged};
 const additionsOnly=added>0&&after.length>before.length&&!removed&&!identityChanges&&!fixedChanged&&!scopeChanged;
 // This permits a NEW capture, never acceptance of either inconsistent pass.
 // Schema, envelope, scope and contractual identity must remain identical.
 const sameSchema=before.every(row=>{const next=byId.get(String(row.values.id).trim());return next&&Object.keys(row.values).sort().join(',')===Object.keys(next.values).sort().join(',');});
 const nonIdentityOnly=before.length===after.length&&!added&&!removed&&!identityChanges&&!scopeChanged&&sameSchema
  &&[...before,...after].every(r=>!('Price' in r.values)||r.values.Price===null||['string','number'].includes(typeof r.values.Price))
  &&changedFields.size>0&&[...changedFields].every(k=>mutableCatalogFields.has(k)||k.toLowerCase()==='hsid')
  &&[...before,...after].every(r=>Object.keys(r).sort().join(',')==='sourceRowIdentity,values');
 return {diagnostic,additionsOnly,nonIdentityOnly,differences};
}

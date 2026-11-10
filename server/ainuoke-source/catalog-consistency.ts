import type {AdditionDiscoveryBundle} from './additions.js';
import {hash,SourceError} from './contract.js';

export const mutableCatalogFields=new Set(['DeliveryDate','ContractDate','Num','Status','GoodsDesc','Brand','CustomerName']);
export type CatalogChangeDiagnostic={beforeRows:number;afterRows:number;added:number;removed:number;identityChanges:number;changedFields:string[];scopeChanged:boolean};
export class CatalogConsistencyError extends SourceError {
 constructor(code:string,readonly catalogChange:CatalogChangeDiagnostic){super(code);}
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
 const changedFields=new Set<string>();
 for(const row of before){
  const next=byId.get(String(row.values.id).trim());
  if(!next){removed++;continue;}
  if(row.values.BillNo!==next.values.BillNo)identityChanges++;
  const fixed=(values:typeof row.values)=>Object.fromEntries(Object.entries(values).filter(([key])=>!mutableCatalogFields.has(key)));
  if(hash(fixed(row.values))!==hash(fixed(next.values)))fixedChanged=true;
  for(const key of new Set([...Object.keys(row.values),...Object.keys(next.values)])){
   if(hash({present:key in row.values,value:row.values[key]??null})!==hash({present:key in next.values,value:next.values[key]??null}))
    changedFields.add(/^[A-Za-z0-9_]{1,64}$/.test(key)?key:'unrecognized_field');
  }
  if(hash(row.values)===hash(next.values)&&row.sourceRowIdentity!==next.sourceRowIdentity)fixedChanged=true;
 }
 const added=after.filter(r=>!oldIds.has(String(r.values.id).trim())).length;
 const diagnostic:CatalogChangeDiagnostic={beforeRows:before.length,afterRows:after.length,added,removed,identityChanges,changedFields:[...changedFields].sort().slice(0,32),scopeChanged};
 const additionsOnly=added>0&&after.length>before.length&&!removed&&!identityChanges&&!fixedChanged&&!scopeChanged;
 return {diagnostic,additionsOnly};
}

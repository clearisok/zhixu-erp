import {closingAmount,sumClosingAmounts} from './contract.js';
import type {ClosingYearQuery} from './annual-contract.js';
import type {ClosingExecutionReference} from './basis-model.js';

export type ClosingYearAmount={visibility:'restricted'}|{visibility:'allowed';currency:'CNY'|'USD';state:'known';price:string;amount:ReturnType<typeof closingAmount>}
 |{visibility:'allowed';currency:'CNY'|'USD';state:'blocked';reason:string}|{visibility:'allowed';currency:'CNY';state:'not_applicable'};
export function closingReferenceStatus(quantity:string|null,completed:string,references:readonly ClosingExecutionReference[]):Exclude<ClosingYearQuery['production'],'all'>{
 // Exact aggregate comparison; a plan alone never means production has started.
 const amount=(value:string)=>closingAmount(value,'1',null);
 if(quantity!==null&&/[1-9]/u.test(quantity)){const q=amount(quantity),c=amount(completed);
  if(BigInt(c.numerator)*BigInt(q.denominator)>=BigInt(q.numerator)*BigInt(c.denominator))return 'completed';}
 return references.some(ref=>ref.execution!==null)||/[1-9]/u.test(completed)?'in_progress':'not_started';
}
export function summarizeYearAmounts(values:readonly ClosingYearAmount[],currency:'CNY'|'USD',allowed:boolean){
 if(!allowed)return {visibility:'restricted' as const};
 const known:ReturnType<typeof closingAmount>[]=[],reasons=new Map<string,number>();let blocked=0,applicable=0;
 for(const value of values){
  if(value.visibility==='restricted')throw Error('Allowed annual dimension received a restricted price');
  if(value.state==='not_applicable')continue;
  applicable++;
  if(value.currency!==currency)throw Error('Annual currency must not be converted');
  if(value.state==='known')known.push(value.amount);
  else{blocked++;reasons.set(value.reason,(reasons.get(value.reason)??0)+1);}
 }
 return {visibility:'allowed' as const,currency,state:blocked?'incomplete' as const:'complete' as const,
  amount:blocked?null:sumClosingAmounts(known),knownSubtotal:sumClosingAmounts(known),applicablePortions:applicable,blockedPortions:blocked,
  blockers:[...reasons].sort(([a],[b])=>a.localeCompare(b)).map(([reason,count])=>({reason,count}))};
}

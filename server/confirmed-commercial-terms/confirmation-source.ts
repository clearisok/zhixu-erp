import {canonicalDecimal} from '../quotes/model.js';

export type ConfirmationSourceInput = {
 terms: {id:string;version:number;labor:string|null;sale:string|null;currency:'CNY'|'USD'|null;confirmedAt:string} | null;
 snapshot: {labor:string|null;sale:string|null;currency:'CNY'|'USD'|null;confirmedAt:string|null} | null;
};
/** Existence of CCT, including an empty CCT, decides authority. Order usage never decides price authority. */
export function resolveConfirmationSource({terms,snapshot}:ConfirmationSourceInput){
 const value=terms??snapshot;
 const decimal=(v:string|null|undefined)=>v===null||v===undefined?null:canonicalDecimal(v);
 return {source:terms?'cct' as const:snapshot?'quote_confirmation' as const:'none' as const,
  labor:decimal(value?.labor),sale:decimal(value?.sale),currency:value?.currency??null,
  confirmedAt:value?.confirmedAt??null,cctId:terms?.id??null,cctVersion:terms?.version??null};
}

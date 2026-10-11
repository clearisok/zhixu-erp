import { HttpError } from "../http/errors.js";
import type { ServerQuote } from "./model.js";
import { costRestrictedQuote, type QuoteSaveContent } from "./quote-response.js";

const invalid=()=>new HttpError(400,"invalid_quote","Restricted Quote metadata is invalid");
const protectedFields=new Set(["fabrics","trims","labor","otherCosts","pricingParameters","confirmation","activeEstimateCost","estimateCostHistory"]);
function checkShape(input:unknown,expected:unknown):void {
 if(Array.isArray(expected)){
  if(!Array.isArray(input)||input.length!==expected.length)throw invalid();
  input.forEach((item,index)=>checkShape(item,expected[index]));return;
 }
 if(expected&&typeof expected==="object"){
  if(!input||typeof input!=="object"||Array.isArray(input))throw invalid();
  const row=input as Record<string,unknown>,model=expected as Record<string,unknown>;
  for(const key of Object.keys(row)) {
   if(protectedFields.has(key))throw new HttpError(403,"quote_cost_fields_restricted","Internal cost fields are restricted");
   if(!Object.hasOwn(model,key))throw invalid();
  }
  if(Object.keys(model).some(key=>!Object.hasOwn(row,key)))throw invalid();
  for(const key of Object.keys(model))checkShape(row[key],model[key]);
 }
}
/** Reconstruct only after CAS/version check. Missing cost is never empty data. */
export function restoreRestrictedQuoteCosts(content:QuoteSaveContent,before:ServerQuote):ServerQuote {
 const view=costRestrictedQuote(before);checkShape(content,view);
 if(content.revisions.some((r,i)=>r.revisionId!==before.revisions[i].revisionId||r.priceVersions.some((p,j)=>p.id!==before.revisions[i].priceVersions[j].id)))throw invalid();
 return{...before,...content,revisions:content.revisions.map((r,i)=>({
  ...before.revisions[i],...r,priceVersions:r.priceVersions.map((p,j)=>({...before.revisions[i].priceVersions[j],...p})),
 })),activeEstimateCost:before.activeEstimateCost,estimateCostHistory:before.estimateCostHistory};
}
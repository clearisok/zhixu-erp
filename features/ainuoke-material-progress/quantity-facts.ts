/** Read-only source arithmetic candidate, never a replacement for requiredQuantity or readiness. */
export type QuantityComparison = { theoreticalUsageCandidate:number|null; actualPurchase:number|null; relativeDifference:number|null;
  basis:"Num*(1+Lost/100)*StyleNum"; verification:"source-calculation-unverified"; interpretation:"observation-only" };
function nonnegative(value:unknown):number|null {
  if(value===null||value===undefined||typeof value!=="number"&&typeof value!=="string"||typeof value==="string"&&!value.trim())return null;
  const n=Number(typeof value==="string"?value.replaceAll(",",""):value);return Number.isFinite(n)&&n>=0?n:null;
}
const rounded=(value:number)=>Number(value.toFixed(9));
/** All source rows must agree. QtyUnit conflict/missing blocks a common-unit comparison. */
export function compareMaterialQuantityFacts(rows:Array<{plannedConsumption?:unknown;lossRate?:unknown;garmentQuantity?:unknown}>,actualPurchase:number|null,unitStatus:"known"|"missing"|"conflict"):QuantityComparison {
  const candidates=rows.map(row=>{const usage=nonnegative(row.plannedConsumption),loss=nonnegative(row.lossRate),garments=nonnegative(row.garmentQuantity);
    if(usage===null||loss===null||garments===null)return null;const n=usage*(1+loss/100)*garments;return Number.isFinite(n)?rounded(n):null;});
  const unique=new Set(candidates);
  const theoreticalUsageCandidate=unitStatus==="known"&&candidates.length>0&&candidates.every(n=>n!==null)&&unique.size===1?candidates[0]:null;
  return {theoreticalUsageCandidate,actualPurchase,relativeDifference:theoreticalUsageCandidate===null||actualPurchase===null?null:rounded(actualPurchase-theoreticalUsageCandidate),
    basis:"Num*(1+Lost/100)*StyleNum",verification:"source-calculation-unverified",interpretation:"observation-only"};
}

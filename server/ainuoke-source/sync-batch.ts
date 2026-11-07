/** Share one complete two-pass directory across a bounded automatic group.
 * Historical page counts are conservative admission estimates; the collector's
 * real 80-request/4000-row/180s limits remain authoritative. */
export function boundedSyncBatch<T extends {kind:string;retry_of:unknown;detail_pages:number}>(rows:T[],maximum:number,directoryRows:number):T[]{
 if(!rows.length)return [];
 if(rows[0].kind==='manual'||rows[0].retry_of)return rows.slice(0,1);
 let pages=2*Math.max(1,Math.ceil(directoryRows/50))+2,sourceRows=2*directoryRows+100;
 const result:T[]=[];
 for(const row of rows){
  if(row.kind!=='automatic'||row.retry_of)continue;
  const details=Math.max(2,Number(row.detail_pages)||12);
  if(result.length&&(pages+details>80||sourceRows+details*50>4000))break;
  result.push(row);pages+=details;sourceRows+=details*50;
  if(result.length===maximum)break;
 }
 return result;
}

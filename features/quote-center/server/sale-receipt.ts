import type { readSaleAdjustmentReceipt } from '../../../server/sales-orders/sale-adjustment-service';
type Receipt=Awaited<ReturnType<typeof readSaleAdjustmentReceipt>>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const invalid=():never=>{throw Error('sale_receipt_mismatch');};
export function saleOriginalTargets(value:object):string[]{
 const items=(value as {items?:unknown}).items;if(!Array.isArray(items)||!items.length||items.length>25)return invalid();
 const ids=items.map(item=>{const id=item?.salesOrderId;if(typeof id!=='string'||!uuid.test(id))return invalid();return id;});
 if(new Set(ids).size!==ids.length)return invalid();return ids;
}
export function saleReceipt(value:unknown,requestId:string,expected?:{operationId:string;orderIds:string[]}):Receipt{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const row=value as Record<string,unknown>;
 if(row.requestId!==requestId||!uuid.test(requestId)||!Array.isArray(row.items)||row.items.length>25)return invalid();
 if(row.state==='not_found'){if(Object.keys(row).sort().join(',')!=='items,requestId,state'||row.items.length)return invalid();return row as unknown as Receipt;}
 if(!['recorded','pending'].includes(String(row.state))||Object.keys(row).sort().join(',')!=='items,operationId,requestId,state'
  ||typeof row.operationId!=='string'||!uuid.test(row.operationId)||!row.items.length||expected&&row.operationId!==expected.operationId)return invalid();
 const ids:string[]=[];let pending=false;
 for(const value of row.items){if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const item=value as Record<string,unknown>;
  if(Object.keys(item).some(key=>!['salesOrderId','status','code','commercialVersionId','replayed'].includes(key))||typeof item.salesOrderId!=='string'||!uuid.test(item.salesOrderId)
   ||!['updated','unchanged','failed','pending'].includes(String(item.status)))return invalid();
  ids.push(item.salesOrderId);pending ||= item.status==='pending';
  if(item.status==='updated'||item.status==='unchanged'){if(typeof item.commercialVersionId!=='string'||!uuid.test(item.commercialVersionId))return invalid();}
  else if(item.commercialVersionId!==undefined&&item.commercialVersionId!==null&&(!uuid.test(String(item.commercialVersionId))))return invalid();
  if(item.code!==undefined&&item.code!==null&&(typeof item.code!=='string'||!/^[a-z][a-z0-9_]{1,100}$/u.test(item.code)))return invalid();
  if(item.replayed!==undefined&&typeof item.replayed!=='boolean')return invalid();
 }
 if(new Set(ids).size!==ids.length||(row.state==='pending')!==pending)return invalid();
 if(expected&&(ids.length!==expected.orderIds.length||new Set(expected.orderIds).size!==expected.orderIds.length||ids.some(id=>!expected.orderIds.includes(id))))return invalid();
 return row as unknown as Receipt;
}
export const saleReceiptComplete=(receipt:Receipt)=>receipt.state==='recorded'&&receipt.items.length>0&&receipt.items.every(item=>item.status==='updated'||item.status==='unchanged');

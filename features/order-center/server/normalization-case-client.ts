import type { previewOrderNormalization } from '../../../server/sales-orders/normalization-preview';
export type NormalizationPreview=Awaited<ReturnType<typeof previewOrderNormalization>>;
export type NormalizationCaseItem={id:string;first_order_id:string;second_order_id:string;first_order_no:string;second_order_no:string;version:number;event_type:string;created_at:string};
export type NormalizationCasePage={items:NormalizationCaseItem[];hasMore:boolean;nextOffset:number|null};
export type NormalizationCaseDetail={case:{id:string;first_order_id:string;second_order_id:string;version:number;state:'withdrawn'|'review_required';created_at:string};events:{id:string;version:number;event_type:string;reason:string;actor_id:string;actor_name:string;created_at:string;evidence:NormalizationPreview}[];hasMore:boolean;nextOffset:number|null;executionAuthorized:false};
export type NormalizationReceipt={caseId:string;eventId:string;version:number};
export class NormalizationApiError extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
export async function normalizationRequest<T>(path:string,body?:object,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/v1/'+path,{method:body?'POST':'GET',credentials:'include',cache:'no-store',signal,...(body?{headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)}:{})});
 const payload=await response.json();if(!response.ok)throw new NormalizationApiError(response.status,payload.error?.code??'request_failed');return payload;
}

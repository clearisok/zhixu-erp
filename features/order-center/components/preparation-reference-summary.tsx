"use client";
import type {PreparationItem} from '../server/preparation-client';
export function PreparationReferenceSummary({item}:{item:PreparationItem}){
 const source=item.proposedCommercialSource;
 return <div style={{overflowWrap:'anywhere'}}><p>原始参考订单：{item.referenceOrderNo} · 准备需求 {item.quantity} 件 · 交期 {item.deliveryDate??'待定'}</p><p>{item.specificationChanges||'未填写规格、版型、工艺或材料变化'}</p>{item.proposedCommercialSourceVisibility==='restricted'?<p>拟用报价版本：当前权限不可查看</p>:source?<><p>拟用报价：{source.quoteCode??'原报价记录'} · {source.revisionLabel??'原修订'} · {source.priceVersionName??'原价格方案'}</p>{source.sourceState!=='observed'&&<p role="status">{source.sourceState==='deleted'?'拟用报价已删除；保留原版本参考。':source.sourceState==='context_missing'?'拟用修订或价格方案已不可选；保留原参考。':source.sourceState==='type_changed'?'拟用版本的业务类型已变化，请重新核对。':'报价已有修改，请重新核对拟用版本。'}实际价格需要另行确认并采用。</p>}<details><summary>查看拟用版本身份</summary><small>{source.quoteId} / {source.revisionId} / {source.priceVersionId} · 观察版本 {source.observedQuoteVersion}</small></details></>:<p>尚未指定拟用报价版本</p>}{item.referencedOrderCount>0&&<p>已有 {item.referencedOrderCount} 张不同订单参考这份准备；请核对本次是否为真实下单。</p>}</div>;
}

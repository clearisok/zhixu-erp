"use client";
import {useEffect,useState} from 'react';
import {Button} from '@/components/foundation';
import {useServerSession} from '@/features/server-auth';
import {orderPricingRequest} from './order-business-source-button';
import type {readOrderBusinessSource} from '../../../server/sales-orders/business-source-service';
type State=Awaited<ReturnType<typeof readOrderBusinessSource>>;
export function OrderColorPrices({orderId,colors,processing=false}:{orderId:string;colors:{sourceLineIdentity:string;colorName:string;quantity:number}[];processing?:boolean}){
 const session=useServerSession(),[state,setState]=useState<State|null>(null),[expanded,setExpanded]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const scope=JSON.stringify([orderId,session.user?.id,session.permissions]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active){setState(null);setError('');}});void orderPricingRequest<State>(`/api/v1/sales-orders/${encodeURIComponent(orderId)}/business-source`).then(data=>{if(active)setState(data);}).catch(()=>{if(active)setError('价格依据暂不可用，颜色来源仍可查看。');});return()=>{active=false;};},[scope,refresh,orderId]);
 useEffect(()=>{const changed=(event:Event)=>{if((event as CustomEvent).detail===orderId)setRefresh(v=>v+1);};window.addEventListener('order-pricing-changed',changed);return()=>window.removeEventListener('order-pricing-changed',changed);},[orderId]);
 const current=state?.commercial.current,lines=current?.lines??[],allMapped=Boolean(state&&state.colors.every(c=>!c.ambiguous&&lines.some(l=>l.colorId===c.id)));
 const byColor=current?.pricingMode==='by_color',showPrices=byColor||expanded;
 const price=(v:{visibility:string;value?:{price:string|null;currency:string}}|undefined)=>!v?'待匹配':v.visibility==='restricted'?'无权查看':v.value?.price===null?'不适用':`${v.value?.price} ${v.value?.currency}/件`;
 return <>{error&&<p role="status">{error}</p>}{current&&<div className="oc-price-summary"><strong>{processing?'确认工价':byColor?'按颜色成交价':'统一成交价'} {price(processing?current.labor:current.sale)}</strong>{!byColor&&<Button size="compact" variant="text" onClick={()=>setExpanded(!expanded)}>{expanded?'收起价格明细':'查看价格明细'}</Button>}{!allMapped&&lines.length>0&&<span>部分颜色待匹配，原价格历史保留</span>}</div>}
 {colors.length>0?<div className="oc-server-color-table" role="region" aria-label="正式订单颜色明细"><table><thead><tr><th>颜色</th><th>数量</th>{showPrices&&<><th>价格方案</th><th>{processing?'工价':'实际成交价'}</th></>}</tr></thead><tbody>{colors.map(c=>{const identity=state?.colors.find(x=>x.sourceLineIdentity===c.sourceLineIdentity),line=identity&&!identity.ambiguous?lines.find(l=>l.colorId===identity.id):undefined;return <tr key={c.sourceLineIdentity}><td>{c.colorName}</td><td>{c.quantity.toLocaleString('zh-CN')}</td>{showPrices&&<><td>{line?.priceVersionName??(lines.length?'待匹配':'历史全单价格')}</td><td>{line?price(processing?line.labor:line.sale):lines.length?'待匹配':price(processing?current?.labor:current?.sale)}</td></>}</tr>;})}</tbody></table></div>:<p>暂无颜色明细；全单价格依据可单独查看。</p>}
 {byColor&&<details><summary>按价格方案查看颜色</summary>{[...new Set(lines.map(l=>l.priceVersionId))].map(id=>{const group=lines.filter(l=>l.priceVersionId===id);return <p key={id}>{group[0].priceVersionName} · {price(group[0].sale)}：{group.map(l=>l.colorName).join('、')}</p>;})}</details>}
 </>;
}

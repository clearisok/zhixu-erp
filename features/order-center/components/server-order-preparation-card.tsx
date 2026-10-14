"use client";
import { useEffect, useState } from 'react';
import { Button, FormItem, Modal } from '@/components/foundation';
type Preparation={id:string;quantity:string;deliveryDate:string|null;specificationChanges:string;createdBy:string};
export function ServerOrderPreparationCard({orderId}:{orderId:string}){
 const [items,setItems]=useState<Preparation[]>([]);const [offset,setOffset]=useState(0);const [more,setMore]=useState(false);const [open,setOpen]=useState(false);const [quantity,setQuantity]=useState('');const [date,setDate]=useState('');const [changes,setChanges]=useState('');const [requestId,setRequestId]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [uncertain,setUncertain]=useState(false);const [refresh,setRefresh]=useState(0);
 useEffect(()=>{const abort=new AbortController();fetch('/api/v1/order-preparations?referenceOrderId='+encodeURIComponent(orderId)+'&offset='+offset,{credentials:'include',cache:'no-store',signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(!abort.signal.aborted){setItems(data.items);setMore(data.hasMore);setError('');}}).catch(()=>{if(!abort.signal.aborted)setError('翻单准备读取失败');});return()=>abort.abort();},[orderId,offset,refresh]);
 async function save(){setBusy(true);setError('');setUncertain(true);try{const r=await fetch('/api/v1/order-preparations',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({requestId,referenceOrderId:orderId,quantity,deliveryDate:date||null,specificationChanges:changes})});if(!r.ok)throw Error();await r.json();setOpen(false);setUncertain(false);setOffset(0);setRefresh(v=>v+1);}catch{setError('保存结果尚未确认。请用原内容重试；同一准备不会重复创建。');}finally{setBusy(false);}}
 return <section aria-label="翻单准备"><h3>翻单准备</h3><p>准备记录不生成正式订单；合同接纳后再认领并补充血统。规格改变需另建报价修订。</p>{error&&<p role="alert">{error}</p>}
 <Button variant="secondary" onClick={()=>{setQuantity('');setDate('');setChanges('');setRequestId(crypto.randomUUID());setUncertain(false);setOpen(true);}}>以本单建立翻单准备</Button>
 {items.map(p=><p key={p.id}>{p.quantity} 件 · {p.deliveryDate??'交期待定'} · {p.createdBy} · {p.specificationChanges||'未填写规格变化'}</p>)}
 <Button variant="secondary" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-20))}>上一页准备</Button><Button variant="secondary" disabled={!more} onClick={()=>setOffset(v=>v+20)}>下一页准备</Button>
 <Modal open={open} title="建立翻单准备" onClose={()=>{if(!busy)setOpen(false);}} footer={<Button disabled={busy||!/^\d{1,12}(?:\.\d{1,6})?$/u.test(quantity)||Number(quantity)<=0} onClick={()=>void save()}>{uncertain?'原请求重试':'保存准备'}</Button>}>
 <FormItem label="需求数量"><input className="qc-control" disabled={uncertain} inputMode="decimal" value={quantity} onChange={e=>setQuantity(e.target.value)}/></FormItem>
 <FormItem label="需求交期"><input className="qc-control" disabled={uncertain} type="date" value={date} onChange={e=>setDate(e.target.value)}/></FormItem>
 <FormItem label="规格、版型、工艺或材料变化"><textarea className="qc-control" disabled={uncertain} maxLength={4000} value={changes} onChange={e=>setChanges(e.target.value)}/></FormItem>
 </Modal></section>;
}

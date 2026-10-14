"use client";
import { useEffect, useState } from 'react';
import { Button, Card, Modal, FormItem } from '@/components/foundation';
import { ServerOrderPreparationCard } from './server-order-preparation-card';
import { useServerSession } from '@/features/server-auth';
type Identity={salesOrderId:string;businessType:string;version:number;ownerId:string|null;ownerName:string|null;lineage:'pending'|'first'|'reorder';referenceOrderId:string|null;specificationChanges:string};
type Option={id:string;orderNo:string;styleNo:string};
async function request<T>(url:string,body?:object):Promise<T>{
 const response=await fetch(url,{method:body?'PATCH':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw new Error(data.error?.code??'order_identity_request_failed');return data as T;
}
export function ServerOrderIdentityCard({orderId,historical=false}:{orderId:string;historical?:boolean}){
 const session=useServerSession();const [identity,setIdentity]=useState<Identity|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [editing,setEditing]=useState(false);
 const [lineage,setLineage]=useState<Identity['lineage']>('pending');const [reference,setReference]=useState('');const [changes,setChanges]=useState('');const [search,setSearch]=useState('');const [options,setOptions]=useState<Option[]>([]);
 const [transfer,setTransfer]=useState(false);const [claimants,setClaimants]=useState<{id:string;name:string}[]>([]);const [owner,setOwner]=useState('');const [reason,setReason]=useState('');
 const scope=orderId+'/'+session.user?.id+'/'+session.permissions.join(',');
 useEffect(()=>{let current=true;request<{identity:Identity}>(`/api/v1/sales-orders/${encodeURIComponent(orderId)}/identity`).then(data=>{if(current){setIdentity(data.identity);setError('');}}).catch(()=>{if(current)setError('订单身份信息暂时不可读取');});return()=>{current=false;};},[scope,orderId]);
 async function mutate(body:object){if(historical)return;setBusy(true);setError('');try{const next=await request<Identity>(`/api/v1/sales-orders/${encodeURIComponent(orderId)}/identity`,body);setIdentity(next);setEditing(false);setTransfer(false);}catch{setError('操作未确认成功，请重新读取状态后核对；不会自动重试。');try{const data=await request<{identity:Identity}>(`/api/v1/sales-orders/${encodeURIComponent(orderId)}/identity`);setIdentity(data.identity);}catch{setIdentity(null);}}finally{setBusy(false);}}
 async function openTransfer(){setBusy(true);try{const data=await request<{users:{id:string;name:string}[]}>('/api/v1/order-claimants');setClaimants(data.users);setOwner('');setReason('');setTransfer(true);}catch{setError('可认领人员读取失败');}finally{setBusy(false);}}
 async function find(){setBusy(true);try{const data=await request<{salesOrders:Option[]}>(`/api/v1/sales-orders?limit=50&offset=0&search=${encodeURIComponent(search)}`);setOptions(data.salesOrders.filter(o=>o.id!==orderId));}catch{setError('参考订单查询失败');}finally{setBusy(false);}}
 const canEdit=!historical&&['ainuoke_contract','processing'].includes(identity?.businessType??'')&&session.hasPermission('order.lineage.edit')&&(identity?.ownerId===session.user?.id||session.hasPermission('order.transfer'));
 return <Card className="oc-server-detail-section"><header><div><h2>订单认领与血统</h2></div></header><div style={{padding:18}}>{error&&<p role="alert">{error}</p>}{identity&&identity.salesOrderId===orderId?<><p>{identity.businessType==='ainuoke_contract'?'艾诺科合同类':identity.businessType==='processing'?'加工类':'历史类型待核实'} · {identity.ownerName??'待认领'} · {{pending:'血统待确认',first:'首单',reorder:'翻单'}[identity.lineage]}</p>{identity.specificationChanges&&<p>{identity.specificationChanges}</p>}{!historical&&['ainuoke_contract','processing'].includes(identity.businessType)&&!identity.ownerId&&session.hasPermission('order.claim')&&<Button disabled={busy} onClick={()=>void mutate({action:'claim',expectedVersion:identity.version})}>认领订单</Button>}{!historical&&['ainuoke_contract','processing'].includes(identity.businessType)&&session.hasPermission('order.transfer')&&<Button variant="secondary" disabled={busy} onClick={()=>void openTransfer()}>转交负责人</Button>}{canEdit&&<Button variant="secondary" disabled={busy} onClick={()=>{setLineage(identity.lineage);setReference(identity.referenceOrderId??'');setChanges(identity.specificationChanges);setEditing(true);}}>维护首单 / 翻单血统</Button>}</>:!error&&<p>读取订单身份…</p>}
 <Modal open={editing} title="维护订单血统" description="只修改业务参考关系，不改变原合同、创建历史或执行流水。" onClose={()=>setEditing(false)} footer={<><Button variant="secondary" disabled={busy} onClick={()=>setEditing(false)}>取消</Button><Button disabled={busy||!identity||(lineage==='reorder'&&!reference)} onClick={()=>identity&&void mutate({action:'lineage',expectedVersion:identity.version,lineage,referenceOrderId:lineage==='reorder'?reference:null,specificationChanges:changes})}>保存血统</Button></>}>
 <FormItem label="业务血统"><select className="qc-control" value={lineage} onChange={e=>setLineage(e.target.value as Identity['lineage'])}><option value="pending">待确认</option><option value="first">首单</option><option value="reorder">翻单</option></select></FormItem>
 {lineage==='reorder'&&<FormItem label="原始参考订单"><input className="qc-control" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索订单号、款号或客户"/><Button variant="secondary" disabled={busy} onClick={()=>void find()}>搜索原订单</Button><select className="qc-control" value={reference} onChange={e=>setReference(e.target.value)}><option value="">请选择</option>{reference&&!options.some(o=>o.id===reference)&&<option value={reference}>已关联原订单（保留）</option>}{options.map(o=><option key={o.id} value={o.id}>{o.orderNo} · {o.styleNo}</option>)}</select><small>最多显示50项；可缩小搜索范围。</small></FormItem>}
 <FormItem label="规格、版型、工艺或材料变化说明"><textarea className="qc-control" maxLength={4000} value={changes} onChange={e=>setChanges(e.target.value)}/></FormItem>
 </Modal>
 <Modal open={transfer} title="转交订单负责人" onClose={()=>setTransfer(false)} footer={<Button disabled={busy||!owner||!reason.trim()||!identity} onClick={()=>identity&&void mutate({action:'transfer',expectedVersion:identity.version,ownerId:owner,reason})}>确认转交</Button>}>
 <FormItem label="跟单负责人"><select className="qc-control" value={owner} onChange={e=>setOwner(e.target.value)}><option value="">请选择</option>{claimants.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></FormItem>
 <FormItem label="转交原因"><textarea className="qc-control" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></FormItem>
 </Modal>
 {session.hasPermission('order.preparation.create')&&<ServerOrderPreparationCard key={scope} orderId={orderId}/>}
 </div></Card>;
}

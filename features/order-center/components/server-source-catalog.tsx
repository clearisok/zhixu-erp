"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, DataTable, EmptyState, AlertBanner, type DataColumn } from '@/components/foundation';
import { useProtectedRouter } from '@/components/foundation/server-navigation-protection';

type Row={sourceKey:string;sourceId:string;salesContractNo:string;styleNo:string;insideOrderNo:string;customerName:string|null;brandName:string|null;
 quantity:string|null;deliveryDate:string|null;sourceStatus:string;observedAt:string;visible:boolean;orderId:string|null;active:boolean;followupVersion:number};
type Result={rows:Row[];total:number;offset:number;limit:number;sources:{runId:string|null}[]};
async function read<T>(path:string,body?:unknown):Promise<T>{
 const r=await fetch(path,{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)}:{})});
 const value=await r.json();if(!r.ok)throw new Error(r.status===401?'登录已过期，请重新登录。':r.status===403?'没有此操作权限。':'操作未完成，请核对当前状态。');return value;
}
export function ServerSourceCatalog({canManage,onChanged}:{canManage:boolean;onChanged:()=>void}){
 const router=useProtectedRouter(),[search,setSearch]=useState(''),[applied,setApplied]=useState(''),[scope,setScope]=useState('all'),[offset,setOffset]=useState(0);
 const [result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[pending,setPending]=useState<{row:Row;requestId:string;mode:'active'|'history'}|null>(null),[unknown,setUnknown]=useState(false),[saving,setSaving]=useState(false);
 const epoch=useRef(0);
 const fetchRows=useCallback(()=>read<Result>('/api/v1/ainuoke/catalog?'+new URLSearchParams({search:applied,scope,offset:String(offset),limit:'50'})),[applied,scope,offset]);
 const load=useCallback(async()=>{const current=++epoch.current;setLoading(true);try{const value=await fetchRows();if(current===epoch.current){setResult(value);setError(null);}}catch(e){if(current===epoch.current){setResult(null);setError((e as Error).message);}}finally{if(current===epoch.current)setLoading(false);}},[fetchRows]);
 useEffect(()=>{let current=true;const version=++epoch.current;fetchRows().then(value=>{if(current&&version===epoch.current){setResult(value);setError(null);}},e=>{if(current&&version===epoch.current){setResult(null);setError((e as Error).message);}}).finally(()=>{if(current&&version===epoch.current)setLoading(false);});return()=>{current=false;};},[fetchRows]);
 const save=async()=>{if(!pending||saving||unknown)return;setSaving(true);setError(null);try{
  await read('/api/v1/ainuoke/catalog/followup',{orderId:pending.row.orderId,mode:pending.mode,expectedVersion:pending.row.followupVersion,requestId:pending.requestId});
  setPending(null);onChanged();await load();
 }catch{setUnknown(true);setError('保存结果尚未核实，请先核对本次操作，不要重复提交。');}finally{setSaving(false);}};
 const receipt=async()=>{if(!pending)return;setSaving(true);try{const r=await read<{status:string}>('/api/v1/ainuoke/catalog/receipts/'+pending.requestId);
  if(r.status==='complete'){setPending(null);setUnknown(false);setError(null);onChanged();await load();}
  else setError('尚未查到成功回执。请稍后再核对；本页不会自动重试提交。');
 }catch(e){setError((e as Error).message);}finally{setSaving(false);}};
 const columns:DataColumn<Row>[]=[
  {key:'contract',header:'合同 / 款号',render:r=><><strong>{r.salesContractNo}</strong><div>{r.styleNo}</div><small>{r.insideOrderNo}</small></>},
  {key:'customer',header:'客户 / 品牌',render:r=><>{r.customerName??'—'}<div>{r.brandName??'—'}</div></>},
  {key:'quantity',header:'数量 / 合同交期',render:r=><>{r.quantity??'待核对'}<div>{r.deliveryDate??'待核对'}</div></>},
  {key:'status',header:'跟进范围',render:r=><>{r.active?'当前跟进':'历史查阅'}<div>{r.visible?`艾诺科：${r.sourceStatus}`:'本次目录未见，保留上次资料'}</div></>},
  {key:'observed',header:'资料读取时间',render:r=>new Date(r.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})},
  {key:'actions',header:'操作',render:r=><>{r.orderId?<><Button variant="text" onClick={()=>router.push('/order-center/server-detail?id='+r.orderId)}>查看订单</Button>
   {canManage&&<Button variant="text" disabled={!!pending} onClick={()=>{setPending({row:r,requestId:crypto.randomUUID(),mode:r.active?'history':'active'});setUnknown(false);}}>{r.active?'停止跟进':'继续跟进'}</Button>}</>:<span>尚未接纳为正式订单</span>}</>},
 ];
 return <Card><h2>艾诺科合同目录</h2><p>全部资料可查询；历史查阅不代表订单已完成。合同目录不会自动建立报价、生产或关账记录。</p>
  <form className="oc-server-pagination" onSubmit={e=>{e.preventDefault();setOffset(0);setApplied(search);}}>
   <input className="qc-control" aria-label="搜索合同目录" placeholder="合同号、款号、客户、品牌；空格表示同时匹配" value={search} onChange={e=>setSearch(e.target.value)} maxLength={200}/>
   <select className="qc-control" aria-label="合同跟进范围" value={scope} onChange={e=>{setScope(e.target.value);setOffset(0);}}><option value="all">全部合同</option><option value="active">当前跟进</option><option value="history">历史查阅</option></select><Button type="submit">查询</Button>
  </form>
  {error&&<AlertBanner title="请核对操作状态" tone="warning">{error}</AlertBanner>}
  {pending&&<div role="dialog" aria-label="确认跟进范围"><p>{pending.row.salesContractNo}：{pending.mode==='active'?'加入持续跟进':'停止持续跟进，保留为历史查阅'}。已有生产、价格和关账记录保持不变。</p>
   <Button disabled={saving} onClick={()=>void(unknown?receipt():save())}>{unknown?'核对本次操作':'确认'}</Button>
   <Button variant="secondary" disabled={saving||unknown} onClick={()=>setPending(null)}>取消</Button></div>}
  <DataTable rows={loading?[]:result?.rows??[]} columns={columns} rowKey={r=>r.sourceKey+':'+r.sourceId} loading={loading} loadingLabel="读取合同目录" ariaLabel="艾诺科全部合同" empty={<EmptyState title={result?.sources.some(s=>s.runId)?'没有匹配的合同':'尚未读取全量合同目录'} description="现有正式订单仍可使用；目录接入后可在这里查询全部资料。"/>}/>
  <div className="oc-server-pagination"><Button variant="secondary" disabled={loading||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>上一页</Button><span>共 {result?.total??0} 张</span><Button variant="secondary" disabled={loading||offset+50>=(result?.total??0)} onClick={()=>setOffset(offset+50)}>下一页</Button></div>
 </Card>;
}

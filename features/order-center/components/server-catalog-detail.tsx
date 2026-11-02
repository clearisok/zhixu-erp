"use client";
import { useEffect, useState } from 'react';
import { Button, Drawer, DataTable, type DataColumn } from '@/components/foundation';
import { useServerSession } from '@/features/server-auth';
import { ServerContractRefresh } from './server-contract-refresh';
type Scope={sourceKey:string;sourceId:string};
type Color={id:string;colorName:string;quantity:number|null;sizes:{name:string;quantity:number|null}[]};
type Material={key:string;name:string;color:string;type:string;unit:string|null;required:number|null;purchased:number|null;inbound:number|null;shipped:number|null;outbound:number|null};
type Detail={salesContractNo:string;status:string;observedAt:string|null;colors:Color[];materials:Material[]};
type Preview={observationId:string;expectedPreview:string;salesContractNo:string;quantity:number;deliveryDate:string|null;colors:{colorName:string;quantity:number}[];effects:string[]};
type Command=Scope&{observationId:string;expectedPreview:string;requestId:string};
async function request<T>(path:string,body?:unknown):Promise<T>{
 const r=await fetch('/api/v1/ainuoke/catalog/'+path,{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)}:{})});
 const value=await r.json();if(!r.ok){const error=new Error(r.status===403?'没有接纳合同权限。':'资料暂不可用或已更新，请先刷新来源，再重新预览。');Object.assign(error,{status:r.status});throw error;}return value as T;
}
export function ServerCatalogDetail({scope,adopted,canManage,onClose,onChanged}:{scope:Scope;adopted:boolean;canManage:boolean;onClose:()=>void;onChanged:()=>void}){
 const session=useServerSession(),scopeKey=JSON.stringify(scope),storageKey='weaveops-catalog-intake:'+session.user?.id+':'+scopeKey;
 const [detail,setDetail]=useState<Detail|null>(null),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[pending,setPending]=useState<Command|null>(null),[generation,setGeneration]=useState(0),[notFound,setNotFound]=useState(false);
 useEffect(()=>{let active=true;request<Detail>('detail?'+new URLSearchParams(JSON.parse(scopeKey))).then(v=>{if(active)setDetail(v);},e=>{if(active)setError((e as Error).message);});
  Promise.resolve().then(()=>{if(!active)return;try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null') as Command|null;if(saved&&/^[a-f0-9-]{36}$/i.test(saved.requestId))setPending(saved);}catch{setError('无法恢复上次接纳操作，请核对记录。');}});
  return()=>{active=false;};},[scopeKey,storageKey,generation]);
 const loadPreview=async()=>{setBusy(true);setError(null);try{setPreview(await request<Preview>('intake-preview?'+new URLSearchParams(scope)));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const verify=async()=>{if(!pending)return;setBusy(true);try{const result=await request<{status:string}>('intake/'+pending.requestId);if(result.status==='complete'){sessionStorage.removeItem(storageKey);setPending(null);onChanged();onClose();}else {setNotFound(true);setError('尚未查到接纳回执；可以核对或安全重送原请求。');}}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const adopt=async(resend?:Command)=>{if(busy||!resend&&(!preview||pending))return;const command=resend??{...scope,observationId:preview!.observationId,expectedPreview:preview!.expectedPreview,requestId:crypto.randomUUID()};setBusy(true);setError(null);
  try{sessionStorage.setItem(storageKey,JSON.stringify(command));}catch{setError('无法保存操作编号，未提交接纳。');setBusy(false);return;}
  try{await request('intake',command);sessionStorage.removeItem(storageKey);onChanged();onClose();}
  catch(e){const status=(e as Error&{status?:number}).status;if(status&&status>=400&&status<500){sessionStorage.removeItem(storageKey);setPending(null);setNotFound(false);setPreview(null);}else setPending(command);setError((e as Error).message);}
  finally{setBusy(false);}
 };
 const materialColumns:DataColumn<Material>[]=[{key:'name',header:'物料',render:r=><>{r.name}<small>{r.color}</small></>},
  ...(['required','purchased','inbound','shipped','outbound'] as const).map((key,index)=>({key,header:['需求','已采购','已入库','已出运','已出库'][index],render:(r:Material)=>r[key]??'待核对'})),{key:'unit',header:'单位',render:r=>r.unit??'待核对'}];
 return <Drawer open title={detail?.salesContractNo??'合同资料'} description="来源资料按读取时点展示，查阅不会建立正式订单。" onClose={()=>{if(!busy)onClose();}} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>关闭</Button>{pending?<Button disabled={busy} onClick={()=>void verify()}>核对接纳结果</Button>:!adopted&&canManage?<Button disabled={busy} onClick={()=>void(preview?adopt():loadPreview())}>{preview?'确认加入当前跟进':'预览加入跟进'}</Button>:null}</>}>
  {error&&<p role="status">{error}</p>}{pending&&notFound&&<Button disabled={busy} onClick={()=>void adopt(pending)}>重送原接纳请求</Button>}
  {detail?.status==='last_attempt_failed'&&<p role="status">最近一次同步未成功；以下是上次成功读取的资料，并非当前实时状态。</p>}
  <ServerContractRefresh scope={scope} lastSuccessAt={detail?.observedAt} onComplete={()=>{setPreview(null);setGeneration(g=>g+1);}} />
  {preview&&<section><h3>接纳预览</h3><p>{preview.salesContractNo} · {preview.quantity.toLocaleString()} 件 · 交期 {preview.deliveryDate??'待核对'}</p><ul>{preview.effects.map(e=><li key={e}>{e}</li>)}</ul><p>此操作建立正式业务订单；不会填入报价、生产完成或财务金额。</p></section>}
  {detail?.status==='not_fetched'?<p>尚未同步合同详情，请点击“刷新来源”。</p>:detail?<>
   <h3>颜色尺码</h3><DataTable rows={detail.colors} columns={[{key:'color',header:'颜色',render:r=>r.colorName},{key:'quantity',header:'数量',render:r=>r.quantity??'待核对'},{key:'sizes',header:'尺码数量',render:r=>r.sizes.map(s=>s.name+'：'+(s.quantity??'待核对')).join('；')||'当时未记录'}]} rowKey={r=>r.id} ariaLabel="来源颜色尺码" renderRecord={r=><div className="oc-source-record"><strong>{r.colorName}</strong><span>数量：{r.quantity??'待核对'}</span><span>{r.sizes.map(s=>s.name+'：'+(s.quantity??'待核对')).join('；')||'尺码当时未记录'}</span></div>}/>
   <h3>物料四流</h3><DataTable rows={detail.materials} columns={materialColumns} rowKey={r=>r.key} ariaLabel="来源物料四流" renderRecord={r=><div className="oc-source-record">{materialColumns.map(column=><div key={column.key}><small>{column.header}</small><div>{column.render(r)}</div></div>)}</div>} />
  </>:<p>正在读取合同资料…</p>}
 </Drawer>;
}

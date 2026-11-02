"use client";
import { useEffect, useRef, useState } from 'react';
import { useServerSession } from '@/features/server-auth';
import { Button } from '@/components/foundation';

type Scope = {orderId:string} | {sourceKey:string;sourceId:string};
type Receipt = {status:string;result?:{code?:string;observedAt?:string};requestId?:string};
type Pending = {requestId:string;scope:Scope};
const prefix='/api/v1/ainuoke/catalog';
const labels:Record<string,string>={queued:'已提交，等待同步',running:'正在同步当前订单',complete:'同步成功',failed:'同步未成功，可重新刷新',unknown:'结果待核对，请勿重复提交',not_found:'尚未查到回执，请继续核对'};
const format=(date:string)=>new Date(date).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
async function api<T>(url:string,body?:unknown):Promise<T>{
 const response=await fetch(url,{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)}:{})});
 const value=await response.json();
 if(!response.ok){const error=new Error(response.status===403?'没有来源同步权限。':response.status===401?'登录已过期。':value?.error?.code==='sync_worker_not_enabled'?'来源同步服务尚未启用。':value?.error?.code==='sync_worker_paused'?'来源同步已暂停，请联系管理员核对。':value?.error?.code==='sync_catalog_not_ready'?'合同目录尚未接通，暂不能主动同步。':'暂时无法提交同步，请核对回执。');Object.assign(error,{status:response.status});throw error;}
 return value as T;
}
/** Persist only the actor-scoped request identifier/target, never source data or credentials. */
type Props={scope:Scope;lastSuccessAt?:string|null;onComplete?:()=>void;showLastSuccess?:boolean};
export function ServerContractRefresh(props:Props){const session=useServerSession();return <RefreshControl key={session.user?.id+':'+JSON.stringify(props.scope)} {...props}/>;}
function RefreshControl({scope,lastSuccessAt,onComplete,showLastSuccess=true}:Props){
 const session=useServerSession(),scopeKey=JSON.stringify(scope),key='weaveops-source-sync:'+session.user?.id+':'+scopeKey;
 const [pending,setPending]=useState<Pending|null>(null),[receipt,setReceipt]=useState<Receipt|null>(null),[message,setMessage]=useState<string|null>(null),[busy,setBusy]=useState(false),[success,setSuccess]=useState<string|null>(lastSuccessAt??null);
 const epoch=useRef(0),complete=useRef(onComplete);useEffect(()=>{complete.current=onComplete;},[onComplete]);
 const allowed=session.permissions.includes('ainuoke.sync')&&session.permissions.includes('style_progress.import');
 useEffect(()=>{
  let active=true;const epochs=epoch;
  // Restoration runs asynchronously and is guarded against a user/session switch.
  Promise.resolve().then(()=>{
   if(!active)return;
   try{const saved=JSON.parse(sessionStorage.getItem(key)??'null') as Pending|null;
    if(saved&&/^[a-f0-9-]{36}$/i.test(saved.requestId)&&JSON.stringify(saved.scope)===scopeKey){setPending(saved);setReceipt({status:'unknown'});}
   }catch{setMessage('无法恢复上次操作，请联系管理员核对。');}
  });
  return()=>{active=false;epochs.current++;};
 },[key,scopeKey]);
 useEffect(()=>{
  const selected=JSON.parse(scopeKey) as Scope;if(!('orderId' in selected))return;
  let active=true;api<{lastSuccessAt:string|null}>(prefix+'/sync-status?'+new URLSearchParams({orderId:selected.orderId})).then(result=>{if(active)setSuccess(result.lastSuccessAt);}).catch(()=>undefined);
  return()=>{active=false;};
 },[scopeKey,key]);
 const check=async(current:Pending)=>{
  const generation=epoch.current;setBusy(true);
  try{const result=await api<Receipt>(prefix+'/sync/'+current.requestId);if(generation!==epoch.current)return;setReceipt(result);setMessage(null);
   if(result.status==='complete'||result.status==='failed'){
    sessionStorage.removeItem(key);setPending(null);
    if(result.status==='complete'){setSuccess(result.result?.observedAt??null);complete.current?.();}
   }
  }catch(e){if(generation===epoch.current)setMessage((e as Error).message);}finally{if(generation===epoch.current)setBusy(false);}
 };
 useEffect(()=>{
  if(!pending)return;
  let active=true;const generation=epoch.current;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const result=await api<Receipt>(prefix+'/sync/'+pending.requestId);if(!active||generation!==epoch.current)return;setReceipt(result);
    if(result.status==='complete'||result.status==='failed'){sessionStorage.removeItem(key);setPending(null);setMessage(null);if(result.status==='complete'){setSuccess(result.result?.observedAt??null);complete.current?.();}return;}
    if(['queued','running'].includes(result.status))timer=setTimeout(()=>void poll(),2000);
   }catch{if(active)setMessage('暂时无法核对同步结果；不会重复提交。');}};
  void poll();return()=>{active=false;clearTimeout(timer);};
 },[pending,key]);
 const submit=async(resend?:Pending)=>{
  if(busy||pending&&!resend)return;
  const request=resend??{requestId:crypto.randomUUID(),scope};setBusy(true);setMessage(null);
  try{sessionStorage.setItem(key,JSON.stringify(request));}catch{setMessage('无法保存本次操作编号，未发起同步。');setBusy(false);return;}
  try{
   await api(prefix+('orderId' in scope?'/sync-order':'/sync'),{...scope,requestId:request.requestId});
   setPending(request);setReceipt({status:'queued'});
  }catch(e){
   const status=(e as Error&{status?:number}).status;
   if(status&&status>=400&&status<500){sessionStorage.removeItem(key);setPending(null);}else{setPending(request);setReceipt({status:'unknown'});}
   setMessage((e as Error).message);
  }finally{setBusy(false);}
 };
 return <div className="oc-source-refresh"><div>
  {allowed?<Button variant="text" disabled={busy} onClick={()=>void(pending?check(pending):submit())}>{pending?'核对同步结果':'刷新来源'}</Button>:<span>没有来源同步权限</span>}
  {pending&&receipt?.status==='not_found'&&allowed&&<Button variant="text" disabled={busy} onClick={()=>void submit(pending)}>重送原请求</Button>}
  {receipt&&<span role="status">{labels[receipt.status]??'正在核对同步结果'}</span>}
  </div>{showLastSuccess&&(success??lastSuccessAt)&&<small>最近同步成功：{format((success??lastSuccessAt)!)}（北京时间）</small>}
  {message&&<p role="status">{message}</p>}
 </div>;
}

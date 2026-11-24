"use client";
import { useEffect, useState } from 'react';
import { useServerSession } from '@/features/server-auth';
import { ServerContractRefresh } from '@/features/order-center/components/server-contract-refresh';
import { Card } from '@/components/foundation/card';
import { Button } from '@/components/foundation/button';
import { materialReadFeedback, materialReadTime } from './material-read-feedback';
import { readOrderMaterial } from './http-client';
import { orderMaterialNavigation } from './order-navigation';
import type { OrderMaterialReadModel } from './read-service';
export const materialStateLabels = {not_purchased:'未采购',purchasing:'采购中',pending_inbound:'已采购待入库',ready:'已齐套'} as const;
export const MATERIAL_REFRESH_MS=30000;
export function useOrderMaterial(id: string) {
  const session=useServerSession();
  const scope=id+"/"+(session.user?.id??"")+"/"+session.status+"/"+session.permissions.join("|");
  const [state,setState]=useState<{id:string;model:OrderMaterialReadModel|null;error:string|null;loading:boolean}>({id:scope,model:null,error:null,loading:true});
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let pending=false;
    const read=async()=>{
      if(pending||controller.signal.aborted)return;
      clearTimeout(timer);pending=true;
      try{const model=await readOrderMaterial(id,controller.signal);if(!controller.signal.aborted)setState({id:scope,model,error:null,loading:false});}
      catch(error){if(!controller.signal.aborted)setState({id:scope,model:null,error:materialReadFeedback(error),loading:false});}
      finally{pending=false;if(!controller.signal.aborted)timer=setTimeout(()=>{if(document.visibilityState==='visible')void read();else timer=setTimeout(onVisible,MATERIAL_REFRESH_MS);},MATERIAL_REFRESH_MS);}
    };
    const onVisible=()=>{if(document.visibilityState==='visible')void read();};
    void read();document.addEventListener('visibilitychange',onVisible);window.addEventListener('focus',onVisible);
    return()=>{controller.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible);};
  },[id,scope,refresh]);
  return {model:state.id===scope?state.model:null,error:state.id===scope?state.error:null,loading:state.id!==scope||state.loading,
    completion:state.id===scope&&!state.loading?state:null,
    reload:()=>{setState({id:scope,model:null,error:null,loading:true});setRefresh(n=>n+1);}};
}
export function OrderMaterialSummary({salesOrderId}:{salesOrderId:string}) {
  const state=useOrderMaterial(salesOrderId); const route=orderMaterialNavigation(salesOrderId);const view=state.model?.progress;
  return <Card className="oc-server-detail-section oc-server-detail-material-summary"><header><div><small>EXECUTION FACTS · READ ONLY</small><h2>物料采购汇总</h2></div>{route&&<a className="qc-button qc-button-text" href={route.detailHref}>查看物料跟进 →</a>}</header>
    {state.loading?<p>读取物料来源…</p>:state.error?<div><p role="alert">{state.error}</p><Button variant="secondary" onClick={state.reload}>重新读取物料</Button></div>:view&&<><p role="status">{view.message} · 来源读取（北京时间） <time dateTime={view.fetchedAt??undefined}>{materialReadTime(view.fetchedAt)}</time></p>{view.fetchedAt&&<details><summary>来源时间详情</summary><time dateTime={view.fetchedAt}>{view.fetchedAt}</time></details>}{view.sourceStatus==='ready'?<div className="sp-server-summary">{(['fabric','trim'] as const).map(type=><section key={type}><strong>{type==='fabric'?'面料':'辅料'} {view.summary[type].demands} 项</strong><span>{Object.entries(materialStateLabels).map(([key,label])=><small key={key}>{label} {view.summary[type].states[key as keyof typeof materialStateLabels]}　</small>)}<small>未知 {view.summary[type].unknown}</small></span></section>)}</div>:<p>当前采购数量待核对；这不表示没有采购。可刷新来源，或查看历史物料来源。</p>}</>}
    <ServerContractRefresh key={salesOrderId} scope={{orderId:salesOrderId}} onComplete={state.reload} />
  </Card>;
}

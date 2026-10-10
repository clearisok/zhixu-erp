"use client";
import { useEffect, useState } from 'react';
import { Card } from '@/components/foundation/card';
import { readOrderMaterial } from './http-client';
import { orderMaterialNavigation } from './order-navigation';
import type { OrderMaterialReadModel } from './read-service';
export const materialStateLabels = {not_purchased:'未采购',purchasing:'采购中',pending_inbound:'已采购待入库',ready:'已齐套'} as const;
export function useOrderMaterial(id: string) {
  const [state,setState]=useState<{id:string;model:OrderMaterialReadModel|null;error:string|null;loading:boolean}>({id,model:null,error:null,loading:true});
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{const controller=new AbortController();
    void readOrderMaterial(id,controller.signal).then(model=>{if(!controller.signal.aborted)setState({id,model,error:null,loading:false});},()=>{if(!controller.signal.aborted)setState({id,model:null,error:'正式物料来源未接通或不可读取；不会回退 Browser。',loading:false});});
    return()=>controller.abort();
  },[id,refresh]);
  return {model:state.id===id?state.model:null,error:state.id===id?state.error:null,loading:state.id!==id||state.loading,reload:()=>{setState({id,model:null,error:null,loading:true});setRefresh(n=>n+1);}};
}
export function OrderMaterialSummary({salesOrderId}:{salesOrderId:string}) {
  const state=useOrderMaterial(salesOrderId); const route=orderMaterialNavigation(salesOrderId);const view=state.model?.progress;
  return <Card className="oc-server-detail-section"><header><div><small>EXECUTION FACTS · READ ONLY</small><h2>物料采购汇总</h2></div>{route&&<a className="qc-button qc-button-text" href={route.detailHref}>查看物料跟进 →</a>}</header>
    {state.loading?<p>读取物料来源…</p>:state.error?<p role="status">{state.error}</p>:view&&<><p role="status">{view.message} · 来源读取 {view.fetchedAt??'—'}</p><div className="sp-server-summary">{(['fabric','trim'] as const).map(type=><section key={type}><strong>{type==='fabric'?'面料':'辅料'} {view.summary[type].demands} 项</strong><span>{Object.entries(materialStateLabels).map(([key,label])=><small key={key}>{label} {view.summary[type].states[key as keyof typeof materialStateLabels]}　</small>)}<small>未知 {view.summary[type].unknown}</small></span></section>)}</div></>}
    <button className="qc-button qc-button-text" onClick={state.reload}>刷新来源</button>
  </Card>;
}

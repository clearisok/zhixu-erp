"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { useServerSession } from '@/features/server-auth';
import { ServerContractRefresh } from '@/features/order-center/components/server-contract-refresh';
import { Card } from '@/components/foundation/card';
import { Button } from '@/components/foundation/button';
import { materialReadFeedback, materialReadTime } from './material-read-feedback';
import { readOrderMaterial } from './http-client';
import { orderMaterialNavigation } from './order-navigation';
import type { OrderMaterialReadModel } from './read-service';
import { materialSummaryItems } from './material-summary-items';
export const materialStateLabels = {not_purchased:'未采购',purchasing:'采购中',pending_inbound:'已采购待入库',ready:'已齐套'} as const;
export const MATERIAL_REFRESH_MS=30000;
export type MaterialSummaryReadState = { status: string; message: string; fetchedAt: string | null; reviewItems?: number | null };
function sourceTime(value: string | null) {
  if (!value) return '未记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value + '（时间待核对）' : new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium',hour12:false}).format(date) + '（北京时间）';
}
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
export function OrderMaterialSummary({salesOrderId,history,onReadState}:{salesOrderId:string;history?:ReactNode;onReadState?:(state:MaterialSummaryReadState)=>void}) {
  const state=useOrderMaterial(salesOrderId); const route=orderMaterialNavigation(salesOrderId);const view=state.model?.progress;
  const items = materialSummaryItems(state.model), reviewItems = items?.reviewItems ?? null;
  useEffect(()=>{onReadState?.({status:state.loading?'loading':state.error?'unavailable':view?.sourceStatus??'unavailable',message:state.error??view?.message??'',fetchedAt:view?.fetchedAt??null,reviewItems});},[onReadState,state.loading,state.error,view?.sourceStatus,view?.message,view?.fetchedAt,reviewItems]);
  const rate = (value: number | null | undefined) => value == null ? items?.demands === 0 ? '不适用' : '待核对' : new Intl.NumberFormat('zh-CN',{style:'percent',maximumFractionDigits:1}).format(value);
  return <Card className="oc-server-detail-section oc-server-detail-material-summary"><header><h2>物料采购汇总</h2><div className="ow-module-actions">{history && items?.historical && <span className="ow-data-warning">上次来源 · 当前待核对</span>}{history}{route&&<a className="qc-button qc-button-text" href={route.detailHref}>查看物料跟进 →</a>}</div></header>
    {history ? <div className="ow-material-business" data-material-business>
      {state.loading ? <p role="status">读取物料来源…</p> : <>
        <dl className="ow-material-metrics">
          <div><dt>自购需求项</dt><dd data-unknown={!items || undefined}>{items?.demands ?? '待核对'}</dd>{items && <small>面料 {items.fabric} · 辅料 {items.trim}</small>}</div>
          <div><dt title="有来源采购记录，不表示采购已完成">有采购记录</dt><dd data-unknown={!items || undefined}>{items?.purchaseRecords ?? '待核对'}</dd><small>按需求项统计</small></div>
          <div><dt>采购齐套率</dt><dd data-unknown={items?.procurementRate == null || undefined}>{rate(items?.procurementRate)}</dd>{items && <small>{items.procurementUnknown ? `${items.procurementUnknown} 项待核对` : `${items.procurementComplete} / ${items.demands} 项`}</small>}</div>
          <div><dt title="有来源入库记录，不表示需求已全部入库">有入库记录</dt><dd data-unknown={!items || undefined}>{items?.inboundRecords ?? '待核对'}</dd><small>按需求项统计</small></div>
          <div><dt>入库齐套率</dt><dd data-unknown={items?.inboundRate == null || undefined}>{rate(items?.inboundRate)}</dd>{items && <small>{items.inboundUnknown ? `${items.inboundUnknown} 项待核对` : `${items.inboundComplete} / ${items.demands} 项`}</small>}</div>
        </dl>
        <div className="ow-material-pending" role="status"><span>待采购<strong>{!items || items.procurementUnknown ? '待核对' : `${items.pendingPurchase} 项`}</strong>{Boolean(items?.procurementUnknown && items.pendingPurchase) && `（已确认 ${items!.pendingPurchase} 项）`}</span><span title="沿用来源已采购数量减已入库数量的逐需求缺口；不等同需求入库齐套">待入库（已采购）<strong>{!items || items.historical ? '待核对' : items.pendingInboundUnknown ? `已确认 ${items.pendingInbound.length} 项 · ${items.pendingInboundUnknown} 项待核对` : `${items.pendingInbound.length} 项`}</strong></span></div>
        {items?.pendingInbound.length ? <details className="ow-material-pending-details"><summary>{items.historical ? "查看上次来源待入库物料" : "查看待入库物料"}（{items.pendingInbound.length} 项）</summary><ul>{items.pendingInbound.map(row => <li key={row.demand.id}><span>{row.demand.materialName}{row.demand.materialColor && ` · ${row.demand.materialColor}`}{row.demand.specification && ` · ${row.demand.specification}`}</span><strong>{row.business!.pendingInbound.quantity?.toLocaleString('zh-CN',{maximumFractionDigits:9})} {row.business!.pendingInbound.unit}</strong></li>)}</ul></details> : null}
      </>}
    </div> : state.loading?<p>读取物料来源…</p>:state.error?<div><p role="alert">{state.error}</p><Button variant="secondary" onClick={state.reload}>重新读取物料</Button></div>:view&&<><p role="status">{view.message} · 来源读取（北京时间） <time dateTime={view.fetchedAt??undefined}>{materialReadTime(view.fetchedAt)}</time></p>{view.fetchedAt&&<details><summary>来源时间详情</summary><time dateTime={view.fetchedAt}>{view.fetchedAt}</time></details>}{view.sourceStatus==='ready'?<div className="sp-server-summary">{(['fabric','trim'] as const).map(type=><section key={type}><strong>{type==='fabric'?'面料':'辅料'} {view.summary[type].demands} 项</strong><span>{Object.entries(materialStateLabels).map(([key,label])=><small key={key}>{label} {view.summary[type].states[key as keyof typeof materialStateLabels]}　</small>)}<small>未知 {view.summary[type].unknown}</small></span></section>)}</div>:<p>当前采购数量待核对；这不表示没有采购。可刷新来源，或查看历史物料来源。</p>}</>}
    {history?<details className="ow-refresh"><summary>数据来源、统计口径与刷新</summary>{state.error&&<Button variant="secondary" onClick={state.reload}>重新读取物料</Button>}<p>{state.error ?? view?.message ?? '暂未取得物料来源。'} · 来源读取 {sourceTime(view?.fetchedAt ?? null)}</p><p>按自购物料需求明细项统计，不跨单位累计数量。有采购或入库记录不代表已完成；齐套率仅在全部需求项均可判定时显示。采购完成沿用已核实的采购缺口为零，入库完成沿用原齐套状态，分母均为自购需求项。待入库明细沿用已采购未入库的来源缺口，不代表需求齐套。</p>{items && items.otherSupply > 0 && <p>另有 {items.otherSupply} 项厂供或其他供料，保留在物料跟进中，不计入自购摘要。</p>}<ServerContractRefresh key={salesOrderId} scope={{orderId:salesOrderId}} onComplete={state.reload} /></details>:<ServerContractRefresh key={salesOrderId} scope={{orderId:salesOrderId}} onComplete={state.reload} />}
  </Card>;
}

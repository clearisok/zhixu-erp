"use client";
import {useEffect,useRef} from 'react';
import {ServerContractRefresh} from '@/features/order-center/components/server-contract-refresh';
import { useSearchParams } from 'next/navigation';
import {useProtectedRouter} from '@/components/foundation/server-navigation-protection';
import { useMaterialProgressSettings } from '../server/use-material-progress-settings';
import { AppShell, PageContainer, PageHeader, AlertBanner } from '@/components/foundation';
import { useServerSession, ServerLoginCard } from '@/features/server-auth';
import { orderMaterialNavigation } from '@/features/ainuoke-material-progress/order-navigation';
import { useOrderMaterial } from '@/features/ainuoke-material-progress/order-material-summary';
import { ReadOnlyMaterialControlTower, type MaterialSourceHandle } from './material-control-tower-read-only';
import {useMaterialArrivals} from '../server/use-material-arrivals';
import {ServerMaterialArrivalWorkspace} from './server-material-arrivals';
function MaterialBody({id}:{id:string}) {
  const state=useOrderMaterial(id),settings=useMaterialProgressSettings(),session=useServerSession(),router=useProtectedRouter(),arrivals=useMaterialArrivals(id);
  const sourcePanel=useRef<MaterialSourceHandle>(null);
  const completion=state.completion,reloadArrivals=arrivals.reload;
  useEffect(()=>{
    if(!completion)return;let active=true;
    queueMicrotask(()=>{if(active)void reloadArrivals().catch(()=>undefined);});
    return()=>{active=false;};
  },[completion,reloadArrivals]);
  const headerActions=<>{session.hasPermission('style_progress.settings.edit')&&<button className="qc-button qc-button-secondary" onClick={()=>router.push('/system-settings/progress-settings?orderId='+id)}>辅料排列设置</button>}{session.hasPermission('ainuoke.sync')&&session.hasPermission('style_progress.import')?<ServerContractRefresh scope={{orderId:id}} showLastSuccess={false} onComplete={()=>{state.reload();settings.reload();void arrivals.reload().catch(()=>undefined);}}/>:<button className="qc-button qc-button-secondary" onClick={()=>{state.reload();settings.reload();void arrivals.reload().catch(()=>undefined);}}>刷新页面</button>}</>;
  return <div data-server-sales-order-id={id}><div className="sp-dense-page-header"><PageHeader title={state.model?state.model.progress.order.insideOrderNo||state.model.progress.order.styleNo||"款式物料跟进":"款式物料跟进"} description={state.model?"销售合同 "+state.model.progress.order.salesContractNo:undefined} actions={<>{headerActions}<button type="button" className="qc-button qc-button-secondary" disabled={!state.model||state.loading} onClick={()=>sourcePanel.current?.open()}>来源与核实项</button></>}/></div>
    {state.model?.provenance==='synthetic'&&<AlertBanner tone="warning" title="合成隔离验收数据">不是实时艾诺科同步记录。</AlertBanner>}
    <ServerMaterialArrivalWorkspace controller={arrivals} currentKeys={state.model?.progress.groups.map(group=>group.key)??[]}>
      {slots=>state.loading?<div className="sp-business-skeleton" role="status" aria-label="正在读取物料"><div/><div/><div/><span>正在读取物料…</span></div>:state.error?<AlertBanner tone="warning" title="物料暂时无法读取">请稍后刷新页面，已有数据不会被覆盖。</AlertBanner>:state.model&&<ReadOnlyMaterialControlTower view={state.model.progress} sourcePanelRef={sourcePanel} materialActions={slots.actions} materialPlan={slots.summary} paymentScope={{salesOrderId:state.model.salesOrderId,identityKey:(session.user?.id??'')+'/'+session.status+'/'+session.permissions.join('|')}} trimPriorityKeywords={settings.settings?.trimPriorityKeywords??[]} settingsNotice={settings.error?"辅料排序设置暂不可用，保持来源顺序":undefined}/>}
    </ServerMaterialArrivalWorkspace></div>;
}
export function ServerStyleProgressDetailPage() {
  const params=useSearchParams();const route=orderMaterialNavigation(params.get('orderId'));const session=useServerSession();
  return <AppShell title="款式物料跟进" identityMode="server" backTarget={route ? {href:route.returnHref,label:"返回订单详情"} : {href:"/order-center",label:"返回订单列表"}}><PageContainer className="oc-order-center-page sp-v4-page sp-server-material">
    {!route?<p role="alert">仅接受正式订单 UUID。</p>:session.status==='anonymous'?<ServerLoginCard/>:session.status!=='authenticated'?<p>确认 Server 身份…</p>:!session.hasPermission('order.view')||!session.hasPermission('style_progress.read')?<p role="alert">没有订单或物料查看权限。</p>:<MaterialBody id={route.salesOrderId}/>}</PageContainer></AppShell>;
}

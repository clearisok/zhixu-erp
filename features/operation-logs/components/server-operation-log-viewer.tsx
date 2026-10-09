"use client";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Button, DataTable, Drawer, ErrorState, FormItem, LoadingState, PageContainer, PageHeader, type DataColumn } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import type { ServerOperationLog } from "../../../server/operation-logs/repository";
import type { OperationLog } from "../model/operation-log";
import { groupOperationLogs, type OperationLogGroup } from "../model/operation-log-presentation";
import { OperationLogGroupList } from "./operation-log-group-list";

const workflowLabels:Record<string,OperationLog["action"]>={"confirmation.save":"确认报价","revision.create":"创建报价版本",
  "price.create":"创建价格版本","price.update":"修改价格版本","price.delete":"删除价格版本",
  "estimate.generate":"生成估算成本","estimate.regenerate":"生成估算成本","estimate.restore":"恢复历史估算成本"};
const workflowNotes:Record<string,string>={"estimate.update":"保存当前估算","estimate.ignore":"忽略当前来源的估算过期提示"};
type DisplayEvent=OperationLog & Pick<ServerOperationLog,"context"|"metadata">;
function displayEvent(log:ServerOperationLog):OperationLog & Pick<ServerOperationLog,"context"|"metadata">{
  return{...log,userId:log.actorUserId,userName:log.actorName,module:log.module as OperationLog["module"],
    action:workflowLabels[String(log.metadata.workflowAction)]??log.action as OperationLog["action"],entityType:log.entityType as OperationLog["entityType"],
    quoteId:log.quoteId};
}
export function ServerOperationLogViewer({quoteId}:{quoteId?:string}){
  const session=useServerSession(),allowed=session.hasPermission("audit_log.view")&&(!quoteId||session.hasPermission("quote.view"));
  const [logs,setLogs]=useState<DisplayEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [query,setQuery]=useState({offset:0,module:"",action:"",from:"",to:""}),[retry,setRetry]=useState(0);
  const [page,setPage]=useState<{total:number;count:number;hasMore:boolean}|null>(null);
  const [selected,setSelected]=useState<OperationLogGroup|null>(null);
  const groups=useMemo(()=>groupOperationLogs(logs),[logs]);
  const columns:DataColumn<DisplayEvent>[]=[{key:"time",header:"时间",render:log=>log.createdAt},
    {key:"actor",header:"操作者快照",render:log=>log.userName},{key:"module",header:"模块",render:log=>log.module},
    {key:"action",header:"操作",render:log=><>{log.action}{workflowNotes[String(log.metadata.workflowAction)]&&<small> · {workflowNotes[String(log.metadata.workflowAction)]}</small>}</>},
    {key:"target",header:"目标",render:log=>log.quoteId??log.entityId},
    {key:"detail",header:"详情",render:log=><Button variant="text" onClick={()=>setSelected(groups.find(g=>g.events.some(e=>e.id===log.id))??null)}>技术详情</Button>}];
  useEffect(()=>{
    if(!allowed)return;let active=true;
    void Promise.resolve().then(()=>{if(active){setLoading(true);setError("");setLogs([]);setSelected(null);}});
    const params=new URLSearchParams({limit:"25",offset:String(query.offset)});if(quoteId)params.set("quoteId",quoteId);
    for(const key of ["module","action"] as const)if(query[key])params.set(key,query[key]);
    for(const key of ["from","to"] as const)if(query[key])params.set(key,new Date(query[key]).toISOString());
    void fetch(`/api/v1/operation-logs?${params}`,{credentials:"include",cache:"no-store"}).then(async response=>{
      if(!response.ok)throw new Error(`Server HTTP ${response.status}；操作记录不可用，无 Browser fallback。`);
      return await response.json() as {logs:ServerOperationLog[];page:{total:number;count:number;hasMore:boolean}};
    }).then(result=>{if(active){setLogs(result.logs.map(displayEvent));setPage(result.page);}})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Server 操作记录读取失败");})
      .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
  },[allowed,quoteId,query,retry]);
  if(!allowed)return <ErrorState permission title="Server HTTP 403 · 需要 audit_log.view / Quote access" />;
  return <section aria-label="Server 操作记录"><p>只读 Server 事件；本页聚合不保证包含一次操作的全部事件，不从当前报价反推历史。</p>
    <div className="qc-batch-selection-toolbar">
      <FormItem label="模块"><input className="qc-control" value={query.module} maxLength={128} onChange={e=>setQuery({...query,module:e.target.value,offset:0})} /></FormItem>
      <FormItem label="操作"><input className="qc-control" value={query.action} maxLength={128} onChange={e=>setQuery({...query,action:e.target.value,offset:0})} /></FormItem>
      <FormItem label="开始时间"><input className="qc-control" type="datetime-local" value={query.from} onChange={e=>setQuery({...query,from:e.target.value,offset:0})} /></FormItem>
      <FormItem label="结束时间"><input className="qc-control" type="datetime-local" value={query.to} onChange={e=>setQuery({...query,to:e.target.value,offset:0})} /></FormItem>
      <Button disabled={loading} onClick={()=>setRetry(retry+1)}>刷新记录</Button>
    </div>
    {loading?<LoadingState label="读取 Server 事件" />:error?<ErrorState title="操作记录读取失败" description={error} onRetry={()=>setRetry(retry+1)} />:<>{quoteId?<OperationLogGroupList groups={groups} onTechnicalDetails={setSelected} compact />:<DataTable columns={columns} rows={logs} rowKey={log=>log.id} ariaLabel="Server 操作记录" emptyTitle="暂无匹配的 Server 事件" />}<div className="qc-batch-selection-toolbar"><Button disabled={!query.offset} onClick={()=>setQuery({...query,offset:Math.max(0,query.offset-25)})}>上一页事件</Button><span>本页事件 {page?.count} / 总计 {page?.total}</span><Button disabled={!page?.hasMore} onClick={()=>setQuery({...query,offset:query.offset+25})}>下一页事件</Button></div></>}
    <Drawer open={Boolean(selected)} title="Server 事件快照" onClose={()=>setSelected(null)}>
      {selected&&<><OperationLogGroupList groups={[selected]} compact />{selected.events.map(log=>{const event=log as OperationLog & Pick<ServerOperationLog,"context"|"metadata">;return <section key={log.id}><p>{log.userName} · {log.createdAt} · {log.quoteId??log.entityId}</p>{!log.changes?.length&&<p>该事件未记录字段明细</p>}<pre>{JSON.stringify({context:event.context,metadata:event.metadata,before:log.beforeData,after:log.afterData},null,2)}</pre></section>;})}</>}
    </Drawer>
  </section>;
}
export function ServerGlobalOperationLogPage(){return <AppShell title="操作日志"><PageContainer><PageHeader title="操作日志" description="可信 Server 只读事件" /><ServerOperationLogViewer /></PageContainer></AppShell>;}

"use client";
import {useEffect,useRef,useState} from "react";
import {AppShell,Button,Card,DataTable,Drawer,ErrorState,LoadingState,PageContainer,PageHeader,SearchField,type DataColumn} from "@/components/foundation";
import {useServerSession} from "@/features/server-auth";
import type {ServerOperationLog,ServerOperationLogPage} from "../../../server/operation-logs/repository";
import {logAction,logChanges,logTarget,logTime} from "../model/server-log-presentation";
import "../server-operation-logs.css";
type Filters={q:string;actorId:string;module:string;action:string;from:string;to:string;offset:number};
const empty:Filters={q:"",actorId:"",module:"",action:"",from:"",to:"",offset:0};
async function readLogs(params:URLSearchParams):Promise<ServerOperationLogPage>{
 const r=await fetch("/api/v1/operation-logs?"+params,{credentials:"include",cache:"no-store"});
 if(!r.ok)throw Error(r.status===403?"没有查看这些记录的权限。":"记录暂时无法读取，请稍后重试。");
 const d=await r.json();if(!Array.isArray(d.logs)||!d.page)throw Error("记录格式不可用，请重新读取。");return d;
}
function parameters(query:Filters,quoteId?:string){
 const p=new URLSearchParams({limit:"25",offset:String(query.offset)});if(quoteId)p.set("quoteId",quoteId);
 for(const k of ["q","actorId","module","action"] as const)if(query[k])p.set(k,query[k]);
 // Inputs explicitly represent Beijing wall time, independently of browser timezone.
 if(query.from)p.set("from",new Date(query.from+"T00:00:00+08:00").toISOString());
 if(query.to)p.set("to",new Date(query.to+"T23:59:59.999+08:00").toISOString());
 return p;
}
export function ServerOperationLogViewer(props:{quoteId?:string}){
 const s=useServerSession();return <LogViewer key={s.user?.id+":"+s.permissions.join("|")+":"+props.quoteId} {...props}/>;
}
function LogViewer({quoteId}:{quoteId?:string}){
 const session=useServerSession(),allowed=session.hasPermission("audit_log.view")&&(!quoteId||session.hasPermission("quote.view"));
 const [query,setQuery]=useState(empty),[draft,setDraft]=useState(empty),[retry,setRetry]=useState(0);
 const [result,setResult]=useState<ServerOperationLogPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [selected,setSelected]=useState<ServerOperationLog|null>(null),[detail,setDetail]=useState<ServerOperationLogPage|null>(null),[detailBusy,setDetailBusy]=useState(false),[detailError,setDetailError]=useState("");
 const detailSerial=useRef(0),detailLock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!allowed)return;let active=true;queueMicrotask(()=>{if(active){setLoading(true);setError("");setSelected(null);setDetail(null);detailSerial.current++;}});
  void readLogs(parameters(query,quoteId)).then(d=>{if(active)setResult(d);},()=>{if(active)setError("记录暂时无法读取，请重新查询。");}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[allowed,query,quoteId,retry]);
 async function details(log:ServerOperationLog,append=false){
  if(detailLock.current)return;detailLock.current=true;const ticket=++detailSerial.current;setSelected(log);setDetailBusy(true);setDetailError("");if(!append)setDetail(null);
  const p=new URLSearchParams({operationId:log.operationId,limit:"100",offset:String(append?detail?.logs.length??0:0)});if(quoteId)p.set("quoteId",quoteId);
  try{const d=await readLogs(p);if(alive.current&&ticket===detailSerial.current)setDetail(old=>append&&old?{...d,logs:[...old.logs,...d.logs]}:d);}
  catch{if(alive.current&&ticket===detailSerial.current)setDetailError("操作详情暂时无法读取，请重新打开。");}
  finally{detailLock.current=false;if(alive.current&&ticket===detailSerial.current)setDetailBusy(false);}
 }
 const columns:DataColumn<ServerOperationLog>[]=[
  {key:"time",header:"时间（北京时间）",render:l=><time dateTime={l.createdAt} title={logTime(l.createdAt,true)}>{logTime(l.createdAt)}</time>},
  {key:"actor",header:"操作人",render:l=>l.actorName||"当时未记录"},
  {key:"action",header:"操作内容",render:l=><span className="qc-log-action"><strong>{logAction(l)}</strong><small>{l.module}</small></span>},
  {key:"target",header:"业务对象",render:logTarget},
  {key:"detail",header:"详情",render:l=><Button variant="text" disabled={detailBusy} onClick={()=>void details(l)}>查看详情</Button>}
 ];
 const facets=result?.facets;
 if(!allowed)return <ErrorState permission title="暂无权限" description="需要操作日志查看权限。"/>;
 return <section aria-label="操作记录" className="qc-business-logs">
  <Card className="qc-log-filters">
   <SearchField value={draft.q} onChange={q=>setDraft({...draft,q})} placeholder="搜索操作人、款号、订单号或名称" label="日志关键词"/>
   <label>操作人<select className="qc-control" aria-label="操作人" value={draft.actorId} onChange={e=>setDraft({...draft,actorId:e.target.value})}><option value="">全部操作人</option>{facets?.actors.map(a=><option key={a.id+":"+a.name} value={a.id}>{a.name}</option>)}</select></label>
   <label>模块<select className="qc-control" aria-label="模块" value={draft.module} onChange={e=>setDraft({...draft,module:e.target.value,action:""})}><option value="">全部模块</option>{facets?.modules.map(m=><option key={m}>{m}</option>)}</select></label>
   <label>操作类型<select className="qc-control" aria-label="操作类型" value={draft.action} onChange={e=>setDraft({...draft,action:e.target.value})}><option value="">全部操作</option>{facets?.actions.map(a=><option key={a} value={a}>{a==="创建账号"?"创建用户":a==="修改账号"?"修改用户":a}</option>)}</select></label>
   <label>开始日期<input className="qc-control" aria-label="开始日期" type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
   <label>结束日期<input className="qc-control" aria-label="结束日期" type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
   <Button disabled={loading||Boolean(draft.from&&draft.to&&draft.from>draft.to)} onClick={()=>setQuery({...draft,offset:0})}>查询</Button><Button variant="text" onClick={()=>{setDraft(empty);setQuery(empty);setRetry(n=>n+1);}}>重置筛选</Button><Button variant="text" disabled={loading} onClick={()=>setRetry(n=>n+1)}>刷新记录</Button>
  </Card>
  {draft.from&&draft.to&&draft.from>draft.to&&<p role="alert">结束日期不能早于开始日期。</p>}
  {loading?<LoadingState label="正在读取操作记录"/>:error?<ErrorState title="操作记录读取失败" description={error} onRetry={()=>setRetry(n=>n+1)}/>:<>
   <Card><DataTable columns={columns} rows={result?.logs??[]} rowKey={l=>l.id} ariaLabel="操作记录" emptyTitle="暂无匹配的操作记录" renderRecord={l=><div className="qc-log-mobile"><small>{logTime(l.createdAt)} · {l.actorName}</small><strong>{logAction(l)}</strong><span>{logTarget(l)}</span><Button variant="text" onClick={()=>void details(l)}>查看详情</Button></div>}/></Card>
   <div className="qc-log-pagination"><Button variant="secondary" disabled={!query.offset} onClick={()=>setQuery({...query,offset:Math.max(0,query.offset-25)})}>上一页</Button><span>本页 {result?.page.count??0} 条 / 共 {result?.page.total??0} 条</span><Button variant="secondary" disabled={!result?.page.hasMore} onClick={()=>setQuery({...query,offset:query.offset+25})}>下一页</Button></div>
  </>}
  <Drawer open={Boolean(selected)} title="操作详情" onClose={()=>{detailSerial.current++;setSelected(null);setDetail(null);setDetailBusy(false);}}>
   {selected&&<><div className="qc-log-summary"><small>{logTime(selected.createdAt,true)} · 北京时间</small><h3>{selected.actorName||"当时未记录"} · {logAction(selected)}</h3><p>{logTarget(selected)}</p></div>
    {detailBusy&&!detail?<LoadingState label="读取本次操作的记录"/>:detailError?<ErrorState title={detailError}/>:detail&&<>
     <p className="qc-log-detail-count">已读取 {detail.logs.length} / {detail.page.total} 条可查看记录{detail.page.hasMore?"，还有记录未加载。":"，本次操作记录已完整读取。"}</p>
     {detail.logs.map(l=>{const changes=logChanges(l);return <section className="qc-log-event" key={l.id}><h4>{logAction(l)} · {logTarget(l)}</h4>{l.action==="重置密码"?<p>密码已重置，原有会话已失效。</p>:changes.length?<table className="qc-log-differences"><thead><tr><th>修改项目</th><th>修改前</th><th>修改后</th></tr></thead><tbody>{changes.map((c,i)=><tr key={i}><th>{c.field}</th><td>{c.before}</td><td>{c.after}</td></tr>)}</tbody></table>:<p>当时未记录可展示的字段差异。</p>}</section>;})}
     {detail.page.hasMore&&<Button disabled={detailBusy} onClick={()=>void details(selected,true)}>{detailBusy?"读取中…":"读取其余记录"}</Button>}
     {detail.technicalAllowed&&<details className="qc-log-technical"><summary>技术信息</summary><p>操作编号：{selected.operationId}</p><pre>{JSON.stringify(detail.logs,null,2)}</pre></details>}
    </>}
   </>}
  </Drawer>
 </section>;
}
export function ServerGlobalOperationLogPage(){return <AppShell title="操作日志"><PageContainer><PageHeader title="操作日志" description="查看团队操作与修改前后的记录。"/><ServerOperationLogViewer/></PageContainer></AppShell>;}

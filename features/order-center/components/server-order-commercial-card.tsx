"use client";
import {useEffect,useRef,useState} from 'react';
import {Button,Card,DescriptionList,FormItem,Modal} from '@/components/foundation';
import {useServerSession} from '@/features/server-auth';
import {quoteServerClient,type QuoteServerListItem} from '@/features/quote-center/server/quote-server-client';
import type {projectOrderCommercialState,projectCommercialCandidate} from '../../../server/sales-orders/commercial-projection';

type State=ReturnType<typeof projectOrderCommercialState>;
type Candidate=ReturnType<typeof projectCommercialCandidate>;
type Preview={current:State;candidate:Candidate};
type Source={quoteId:string;revisionId:string;priceVersionId:string};
type Command=Source&{requestId:string;expectedVersion:number;sourceFingerprint:string;reason:string};
type Revision={revisionId:string;revisionLabel:string;priceVersions:{id:string;name:string}[]};
class RequestError extends Error{constructor(readonly status:number,readonly code:string){super(code);}}
async function request<T>(url:string,body?:object):Promise<T>{const r=await fetch(url,{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new RequestError(r.status,data.error?.code??'request_failed');return data;}
function amount(field:Candidate['sale']|Candidate['labor']|undefined){return !field?'待采用':field.visibility==='restricted'?'无权查看':field.value.price===null?'不适用':`${field.value.price} ${field.value.currency} / 件`;}
export function ServerOrderCommercialCard({orderId,frozen}:{orderId:string;frozen:boolean}){
 const session=useServerSession(),alive=useRef(true);const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[options,setOptions]=useState<QuoteServerListItem[]>([]),[hasMore,setHasMore]=useState(false),[revisions,setRevisions]=useState<Revision[]>([]);
 const [source,setSource]=useState<Source>({quoteId:'',revisionId:'',priceVersionId:''}),[preview,setPreview]=useState<Preview|null>(null),[reason,setReason]=useState(''),[pending,setPending]=useState<Command|null>(null);
 const path=`/api/v1/sales-orders/${encodeURIComponent(orderId)}/commercial-versions`;
 const allowed=!frozen&&['order.commercial.adopt','quote.view','commercial.sale.view','commercial.labor.view'].every(p=>session.permissions.includes(p as typeof session.permissions[number]));
 useEffect(()=>{alive.current=true;request<State>(path).then(x=>{if(alive.current)setState(x);}).catch(()=>{if(alive.current)setError('订单商业版本读取失败');});return()=>{alive.current=false;};},[path]);
 async function action(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){if(alive.current){if(e instanceof RequestError&&e.status===401)session.invalidate();setError(e instanceof RequestError?`操作未完成：${e.code}。请核对后重试。`:'服务响应未确认，请保留本次请求重试。');}}finally{if(alive.current)setBusy(false);}}
 async function list(nextOffset:number){await action(async()=>{const data=await quoteServerClient.list({limit:20,offset:nextOffset,search});if(!alive.current)return;setOptions(data.quotes);setOffset(nextOffset);setHasMore(data.page.total!==undefined?nextOffset+data.quotes.length<data.page.total:data.quotes.length===20);});}
 async function selectQuote(id:string){setSource({quoteId:id,revisionId:'',priceVersionId:''});setRevisions([]);setPreview(null);if(!id)return;await action(async()=>{const r=await quoteServerClient.getById(id);if(alive.current)setRevisions(r.quote.revisions);});}
 async function inspect(){await action(async()=>{const data=await request<Preview>(path+'/preview',source);if(alive.current)setPreview(data);});}
 async function adopt(){if(!preview?.candidate.fingerprint||!reason.trim())return;const cmd=pending??{...source,requestId:crypto.randomUUID(),expectedVersion:preview.current.version,sourceFingerprint:preview.candidate.fingerprint,reason:reason.trim()};setPending(cmd);await action(async()=>{
  try{await request(path,cmd);}catch(e){if(e instanceof RequestError&&e.status<500&&alive.current){setPending(null);setPreview(null);}throw e;}
  const next=await request<State>(path);if(alive.current){setState(next);setPending(null);setPreview(null);setOpen(false);}
 });}
 return <Card className="oc-server-detail-section oc-server-detail-commercial-terms"><header><div><h2>订单商业依据</h2></div><span>已采用版本 v{state?.version??0}</span></header><div style={{padding:18}}>
 {error&&<p role="alert">{error}</p>}
 <DescriptionList columns={3} items={[{key:'sale',label:'实际采用售价',value:amount(state?.current?.sale)},{key:'labor',label:'实际采用工价',value:amount(state?.current?.labor)},{key:'version',label:'商业依据',value:state?.current?`${state.current.quoteId} / ${state.current.revisionId} / ${state.current.priceVersionId}`:'待补充 / 历史价格待核实'}]}/>
 {state?.current&&<p>采用时间：{state.current.adoptedAt}。报价后续修改不会自动更新此订单。</p>}
 {allowed&&<Button variant="secondary" disabled={busy} onClick={()=>{setOpen(true);if(!pending){setPreview(null);setReason('');}void list(0);}}>选择并采用报价版本</Button>}
 {frozen&&<p>已完成或取消的订单不可改价。</p>}
 <Modal open={open} title="采用订单商业版本" description="选择明确的报价修订和价格方案，核对差异后采用。原订单版本和已冻结记录保留。" onClose={()=>{if(!busy&&!pending)setOpen(false);}} footer={<><Button variant="secondary" disabled={busy||!!pending} onClick={()=>setOpen(false)}>取消</Button><Button disabled={busy||!preview||!reason.trim()} onClick={()=>void adopt()}>{pending?'重试本次采用':'确认采用'}</Button></>}>
 <div className="qc-modal-form"><FormItem label="搜索报价"><input className="qc-control" value={search} disabled={busy||!!pending} onChange={e=>setSearch(e.target.value)} placeholder="报价编号、款号或客户"/><Button variant="secondary" disabled={busy||!!pending} onClick={()=>void list(0)}>搜索报价</Button></FormItem>
 <FormItem label="报价"><select className="qc-control" disabled={busy||!!pending} value={source.quoteId} onChange={e=>void selectQuote(e.target.value)}><option value="">请选择报价</option>{source.quoteId&&!options.some(q=>q.id===source.quoteId)&&<option value={source.quoteId}>已选报价</option>}{options.map(q=><option key={q.id} value={q.id}>{q.quoteCode} · {q.summary?.quoteStyleNo??''}</option>)}</select></FormItem>
 <div><Button variant="secondary" disabled={busy||!!pending||offset===0} onClick={()=>void list(Math.max(0,offset-20))}>上一页</Button><Button variant="secondary" disabled={busy||!!pending||!hasMore} onClick={()=>void list(offset+20)}>下一页</Button></div>
 <FormItem label="报价修订"><select className="qc-control" disabled={busy||!!pending} value={source.revisionId} onChange={e=>{setSource({...source,revisionId:e.target.value,priceVersionId:''});setPreview(null);}}><option value="">请选择修订</option>{revisions.map(r=><option key={r.revisionId} value={r.revisionId}>{r.revisionLabel}</option>)}</select></FormItem>
 <FormItem label="价格方案"><select className="qc-control" disabled={busy||!!pending} value={source.priceVersionId} onChange={e=>{setSource({...source,priceVersionId:e.target.value});setPreview(null);}}><option value="">请选择价格方案</option>{revisions.find(r=>r.revisionId===source.revisionId)?.priceVersions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></FormItem>
 <Button variant="secondary" disabled={busy||!!pending||!source.priceVersionId} onClick={()=>void inspect()}>预览采用差异</Button>
 {preview&&<DescriptionList columns={2} items={[{key:'old-sale',label:'当前售价',value:amount(preview.current.current?.sale)},{key:'new-sale',label:'拟采用售价',value:amount(preview.candidate.sale)},{key:'old-labor',label:'当前工价',value:amount(preview.current.current?.labor)},{key:'new-labor',label:'拟采用工价',value:amount(preview.candidate.labor)}]}/>}
 <FormItem label="采用原因"><textarea className="qc-control" maxLength={2000} disabled={busy||!!pending} value={reason} onChange={e=>setReason(e.target.value)}/></FormItem>
 {pending&&<p role="status">保留原请求等待核验，重试不会重复创建商业版本。</p>}{error&&<p role="alert">{error}</p>}</div>
 </Modal></div></Card>;
}

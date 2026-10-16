"use client";
import {useRef,useState} from 'react';
import {Button,FormItem,Modal} from '@/components/foundation';
import {useServerSession} from '@/features/server-auth';
import {quoteServerClient,type QuoteServerListItem} from '@/features/quote-center/server/quote-server-client';
import {createSalesOrderServerClient,SalesOrderServerReadError} from '../server/sales-order-server-client';
import type {ServerSalesOrderReadDto,ServerSalesOrderPage} from '../server/sales-order-server-model';
import type {listProcessingBatches,previewProcessingBatch} from '../../../server/sales-orders/processing-batch-service';
const orderClient=createSalesOrderServerClient();
type Page=Awaited<ReturnType<typeof listProcessingBatches>>;
type Preview=Awaited<ReturnType<typeof previewProcessingBatch>>;
type Revision={revisionId:string;revisionLabel:string;baseInfo:{quoteType:string};priceVersions:{id:string;name:string}[]};
type Result={batchId:string;status:string;salesOrderId?:string;orderNo?:string;code?:string};
type Pending={path:string;body:object;kind:'create'|'confirm'|'consume'|'cancel'};
class ApiError extends Error{constructor(readonly status:number,readonly code:string){super(code);}}
async function api<T>(path:string,body?:object):Promise<T>{
 const response=await fetch('/api/v1/processing-order-batches'+path,{method:body?'POST':'GET',credentials:'include',cache:'no-store',...(body?{headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw new ApiError(response.status,data.error?.code??'request_failed');return data;
}
function BatchQuoteLabel({batch,labels}:{batch:Preview['batch'];labels:Preview['labels']}){
 return <div><small>报价 {labels.quoteCode||'来源编号待核实'} · {labels.revisionLabel||'修订名称不可用'} · {labels.priceVersionName||'价格方案名称不可用'}</small><details><summary>查看精确版本标识</summary><small style={{overflowWrap:'anywhere'}}>Quote：{batch.quoteId}<br/>Revision：{batch.revisionId}<br/>PriceVersion：{batch.priceVersionId}</small></details></div>;
}
function SimilarBatchNotice({similar}:{similar:Preview['similar']}){
 if(!similar.items.length)return null;
 return <details><summary>发现 {similar.items.length}{similar.hasMore?'＋':''} 个相似下单，请核对是否为客户再次下单</summary><p>相同客户下，PO相同或报价与数量相同仅作提醒，不阻止真实再次下单。</p><ul>{similar.items.map(item=><li key={item.batchId}>{item.businessStyleNo} · {item.quantity} 件 · {item.orderDate} · {item.sameReference?'相同PO':'相同报价与数量'} {item.salesOrderId?<a href={'/order-center/server-detail?id='+encodeURIComponent(item.salesOrderId)}>查看已有订单 {item.orderNo}</a>:<span>未生成订单 · 批次 {item.batchId}</span>}</li>)}</ul>{similar.hasMore&&<p>这里只显示最近20项，请按客户或PO搜索更多记录。</p>}</details>;
}
export function ProcessingBatchDialog({mode}:{mode:'import'|'push'}){
 const session=useServerSession();
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[history,setHistory]=useState(false),[page,setPage]=useState<Page|null>(null),[selected,setSelected]=useState<Record<string,number>>({}),[preview,setPreview]=useState<Preview|null>(null),[results,setResults]=useState<Result[]>([]);
 const [creating,setCreating]=useState(false),[quoteSearch,setQuoteSearch]=useState(''),[quotes,setQuotes]=useState<QuoteServerListItem[]>([]),[revisions,setRevisions]=useState<Revision[]>([]),[quoteOffset,setQuoteOffset]=useState(0),[moreQuotes,setMoreQuotes]=useState(false);
 const [referenceSearch,setReferenceSearch]=useState(''),[referenceOptions,setReferenceOptions]=useState<ServerSalesOrderReadDto[]>([]),[referencePage,setReferencePage]=useState<ServerSalesOrderPage|null>(null),[referenceSelection,setReferenceSelection]=useState<ServerSalesOrderReadDto|null>(null);
 const [draft,setDraft]=useState({quoteId:'',revisionId:'',priceVersionId:'',customerName:'',businessStyleNo:'',quantity:'',orderDate:new Date().toLocaleDateString('en-CA'),deliveryDate:'',customerReference:'',deliveryRequirements:'',referenceOrderId:''});
 const [pending,setPending]=useState<Pending|null>(null),[failedRetry,setFailedRetry]=useState<Pending|null>(null),[cancelling,setCancelling]=useState<Page['items'][number]['batch']|null>(null),[cancelReason,setCancelReason]=useState(''),lock=useRef(false);
 const canManage=session.hasPermission('order.processing.batch.manage'),canConsume=session.hasPermission('order.processing.consume');
 const allowed=(canManage||canConsume)&&session.hasPermission('order.view')&&session.hasPermission('quote.view')&&session.hasPermission('commercial.labor.view');
 async function action(run:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await run();}catch(e){if((e instanceof ApiError||e instanceof SalesOrderServerReadError)&&e.status===401)session.invalidate();setError(e instanceof SalesOrderServerReadError?'参考订单查询失败，请重新搜索。':e instanceof ApiError?`操作未完成：${e.code}`:'服务响应尚未确认，请重试原请求。');}finally{lock.current=false;setBusy(false);}}
 async function load(offset=0,include=history){const query=new URLSearchParams({search,offset:String(offset),includeProcessed:String(include)});setPage(await api<Page>('?'+query));}
 async function mutate(command:Pending){setPending(command);let value:Result|{results:Result[]};try{value=await api(command.path,command.body);}catch(e){if(e instanceof ApiError&&e.status<500)setPending(null);throw e;}
  setPending(null);setPreview(null);setSelected({});
  if(command.kind==='consume'){
   const received=(value as {results:Result[]}).results,body=command.body as {requestId:string;items:{batchId:string;expectedVersion:number}[]};
   const failed=new Set(received.filter(r=>r.status==='failed').map(r=>r.batchId));
   setFailedRetry(failed.size?{...command,body:{...body,items:body.items.filter(item=>failed.has(item.batchId))}}:null);
   setResults(previous=>[...previous.filter(old=>!received.some(r=>r.batchId===old.batchId)),...received]);
  }
  else{setResults([value as Result]);setFailedRetry(null);setHistory(true);setCreating(false);setCancelling(null);setCancelReason('');}
  await load(0,command.kind==='consume'?history:true);
 }
 async function searchQuotes(offset:number){const value=await quoteServerClient.list({limit:20,offset,search:quoteSearch,type:'processing'});setQuotes(value.quotes);setQuoteOffset(offset);setMoreQuotes(value.page.total===undefined?value.quotes.length===20:offset+value.quotes.length<value.page.total);}
 async function chooseQuote(id:string){setDraft({...draft,quoteId:id,revisionId:'',priceVersionId:''});setRevisions([]);if(id){const q=await quoteServerClient.getById(id);setRevisions(q.quote.revisions.filter(r=>r.baseInfo.quoteType==='processing'));}}
 async function searchReferenceOrders(offset=0){const result=await orderClient.list({search:referenceSearch,offset,limit:20,sortBy:'orderNo',sortDirection:'desc'});setReferenceOptions(result.salesOrders);setReferencePage(result.page);}
 const set=(key:keyof typeof draft,value:string)=>setDraft({...draft,[key]:value});
 if(!allowed)return null;
 return <><Button variant="secondary" size="compact" onClick={()=>{setOpen(true);void action(()=>load());}}>{mode==='import'?'导入加工订单':'推送加工订单'}</Button>
 <Modal open={open} title={mode==='import'?'导入加工订单':'推送加工订单'} description="一次客户下单对应一个批次。同一报价可以用于不同下单；已处理批次会返回原正式订单。" onClose={()=>{if(!busy&&!pending)setOpen(false);}} footer={<><Button variant="secondary" disabled={busy||!!pending} onClick={()=>setOpen(false)}>关闭</Button>{pending?<Button disabled={busy} onClick={()=>void action(()=>mutate(pending))}>重试原请求</Button>:<Button disabled={busy||!canConsume||!Object.keys(selected).length} onClick={()=>void action(()=>mutate({path:'/consume',kind:'consume',body:{requestId:crypto.randomUUID(),items:Object.entries(selected).map(([batchId,expectedVersion])=>({batchId,expectedVersion}))}}))}>确认{mode==='import'?'导入':'推送'}所选 {Object.keys(selected).length} 项</Button>}</>}>
 <div className="qc-modal-form">
 {error&&<p role="alert">{error}</p>}{pending&&<p role="status">正在核验上次提交结果。请重试原请求，不要重复登记下单。</p>}
 <FormItem label="搜索批次"><input className="qc-control" value={search} disabled={busy||!!pending} onChange={e=>setSearch(e.target.value)} placeholder="客户、业务款号、PO或批次号"/><Button disabled={busy||!!pending} onClick={()=>void action(()=>load())}>搜索批次</Button></FormItem>
 <label><input type="checkbox" checked={history} disabled={busy||!!pending} onChange={e=>{setHistory(e.target.checked);void action(()=>load(0,e.target.checked));}}/>包含已处理及未确认批次</label>
 {mode==='push'&&canManage&&<Button variant="secondary" disabled={busy||!!pending} onClick={()=>{setCreating(!creating);if(!creating)void action(()=>searchQuotes(0));}}>登记新的加工下单 / 再次下单</Button>}
 {creating&&<fieldset disabled={busy||!!pending}><legend>新的客户加工下单</legend>
 <FormItem label="搜索加工报价"><input className="qc-control" value={quoteSearch} onChange={e=>setQuoteSearch(e.target.value)}/><Button variant="secondary" onClick={()=>void action(()=>searchQuotes(0))}>搜索加工报价</Button></FormItem>
 <FormItem label="报价"><select className="qc-control" value={draft.quoteId} onChange={e=>void action(()=>chooseQuote(e.target.value))}><option value="">请选择</option>{quotes.map(q=><option key={q.id} value={q.id}>{q.quoteCode} · {q.summary?.quoteStyleNo}</option>)}</select></FormItem>
 <Button variant="text" disabled={quoteOffset===0} onClick={()=>void action(()=>searchQuotes(Math.max(0,quoteOffset-20)))}>上一页报价</Button><Button variant="text" disabled={!moreQuotes} onClick={()=>void action(()=>searchQuotes(quoteOffset+20))}>下一页报价</Button>
 <FormItem label="报价修订"><select className="qc-control" value={draft.revisionId} onChange={e=>setDraft({...draft,revisionId:e.target.value,priceVersionId:''})}><option value="">请选择</option>{revisions.map(r=><option key={r.revisionId} value={r.revisionId}>{r.revisionLabel}</option>)}</select></FormItem>
 <FormItem label="价格方案"><select className="qc-control" value={draft.priceVersionId} onChange={e=>set('priceVersionId',e.target.value)}><option value="">请选择</option>{revisions.find(r=>r.revisionId===draft.revisionId)?.priceVersions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></FormItem>
 {([['customerName','客户'],['businessStyleNo','业务款号'],['quantity','本次下单数量'],['orderDate','下单日期'],['deliveryDate','交期（可空）'],['customerReference','PO / 客户参考号'],['deliveryRequirements','交付要求']] as const).map(([key,label])=><FormItem key={key} label={label}><input className="qc-control" type={key==='orderDate'||key==='deliveryDate'?'date':'text'} value={draft[key]} onChange={e=>set(key,e.target.value)}/></FormItem>)}
 <FormItem label="搜索参考订单"><input className="qc-control" value={referenceSearch} onChange={e=>setReferenceSearch(e.target.value)} placeholder="正式订单号、业务款号、工厂款号或合同号"/><Button variant="secondary" onClick={()=>void action(()=>searchReferenceOrders())}>搜索参考订单</Button></FormItem>
 <FormItem label="翻单参考订单（可不选）"><select className="qc-control" value={draft.referenceOrderId} onChange={e=>{const id=e.target.value;set('referenceOrderId',id);setReferenceSelection(referenceOptions.find(o=>o.id===id)??null);}}><option value="">不关联原订单，血统待确认</option>{referenceSelection&&!referenceOptions.some(o=>o.id===referenceSelection.id)&&<option value={referenceSelection.id}>{referenceSelection.orderNo} · {referenceSelection.styleNo} · {referenceSelection.customerName}</option>}{referenceOptions.map(o=><option key={o.id} value={o.id}>{o.orderNo} · {o.styleNo||o.insideOrderNo||'款号待补'} · {o.customerName||'客户待补'}</option>)}</select></FormItem>
 {referenceSelection&&<p>已选原订单：{referenceSelection.orderNo} · {referenceSelection.styleNo}。仅保留翻单血统，不复制采购、排单或价格；本次商业依据仍采用上方所选报价版本。</p>}
 {referencePage&&<div><small>共 {referencePage.total} 张参考订单</small><Button variant="text" disabled={referencePage.offset===0} onClick={()=>void action(()=>searchReferenceOrders(Math.max(0,referencePage.offset-20)))}>上一页参考订单</Button><Button variant="text" disabled={!referencePage.hasMore} onClick={()=>void action(()=>searchReferenceOrders(referencePage.offset+20))}>下一页参考订单</Button></div>}
 <Button disabled={!draft.priceVersionId||!draft.customerName.trim()||!draft.businessStyleNo.trim()||!draft.quantity} onClick={()=>void action(()=>mutate({path:'',kind:'create',body:{...draft,requestId:crypto.randomUUID(),deliveryDate:draft.deliveryDate||null,referenceOrderId:draft.referenceOrderId||null}}))}>登记批次（尚不创建 SO）</Button>
 </fieldset>}
 {page?.items.map(item=><div key={item.batch.id} style={{borderBottom:'1px solid var(--qc-border, #dde5e1)',padding:'12px 0'}}>
 <label><input type="checkbox" aria-label={`选择批次 ${item.batch.businessStyleNo}`} disabled={busy||!!pending||!canConsume||!item.eligible||(!selected[item.batch.id]&&Object.keys(selected).length>=25)} checked={Object.hasOwn(selected,item.batch.id)} onChange={e=>setSelected(current=>{const next={...current};if(e.target.checked)next[item.batch.id]=item.batch.version;else delete next[item.batch.id];return next;})}/><strong>{item.batch.businessStyleNo}</strong> · {item.batch.customerName} · {item.batch.quantity} 件</label>
 <p>{item.batch.customerReference||'未填客户参考号'} · {item.batch.orderDate} · {item.batch.deliveryDate||'交期待定'} · {item.batch.state==='consumed'?'已生成订单':item.batch.state==='draft'?'待下单确认':item.batch.state==='cancelled'?'已取消':item.eligible?'待导入':`需重新核对：${item.unavailableReason}`}</p>
 <BatchQuoteLabel batch={item.batch} labels={item.labels}/><SimilarBatchNotice similar={item.similar}/>
 {item.salesOrderId?<p><a href={'/order-center/server-detail?id='+encodeURIComponent(item.salesOrderId)}>查看已有订单 {item.orderNo}</a></p>:['draft','confirmed'].includes(item.batch.state)&&<Button variant="text" disabled={busy||!!pending} onClick={()=>void action(async()=>setPreview(await api<Preview>('/'+item.batch.id+'/preview',{})))}>预览下单与工价</Button>}
 {canManage&&['draft','confirmed'].includes(item.batch.state)&&<Button variant="text" disabled={busy||!!pending} onClick={()=>{setCancelling(item.batch);setCancelReason('');}}>取消批次 {item.batch.businessStyleNo}</Button>}
 </div>)}
 {cancelling&&<section aria-label="取消加工批次"><h3>取消未生成订单的批次</h3><p>{cancelling.customerName} · {cancelling.businessStyleNo} · {cancelling.quantity} 件。取消后保留记录，不能再导入。已经生成的正式订单不受此操作处理。</p><FormItem label="取消原因"><input className="qc-control" value={cancelReason} disabled={busy||!!pending} onChange={e=>setCancelReason(e.target.value)} maxLength={2000}/></FormItem><Button variant="secondary" disabled={busy||!!pending} onClick={()=>setCancelling(null)}>保留批次</Button><Button disabled={busy||!!pending||!cancelReason.trim()} onClick={()=>void action(()=>mutate({path:'/'+cancelling.id+'/cancel',kind:'cancel',body:{requestId:crypto.randomUUID(),expectedVersion:cancelling.version,reason:cancelReason}}))}>确认取消批次</Button></section>}
 {page&&!page.items.length&&<p>本页没有可用批次。{page.hasMore?'可继续下一页。':'可包含已处理批次查看记录。'}</p>}
 <div><Button variant="text" disabled={busy||!!pending||!page||page.offset===0} onClick={()=>void action(()=>load(Math.max(0,(page?.offset??0)-20)))}>上一页批次</Button><Button variant="text" disabled={busy||!!pending||!page?.hasMore} onClick={()=>void action(()=>load(page!.nextOffset))}>下一页批次</Button></div>
 {preview&&<section><h3>下单确认预览</h3><SimilarBatchNotice similar={preview.similar}/><p>{preview.batch.customerName} · {preview.batch.businessStyleNo} · {preview.batch.quantity} 件</p><p>确认工价：{preview.candidate.laborPrice} {preview.candidate.laborCurrency} / 件；交期：{preview.batch.deliveryDate||'待定'}</p><BatchQuoteLabel batch={preview.batch} labels={preview.labels}/><p>确认后仍需导入或推送，才生成正式订单。</p>{canManage&&<Button disabled={busy||!!pending} onClick={()=>void action(()=>mutate({path:'/'+preview.batch.id+'/confirm',kind:'confirm',body:{requestId:crypto.randomUUID(),expectedVersion:preview.batch.version,sourceFingerprint:preview.candidate.fingerprint}}))}>确认本次下单</Button>}</section>}
 {failedRetry&&<div><p>成功项已保留，只重试未完成项。若报价或批次版本已变化，请重新预览确认后选择批次。</p><Button disabled={busy||!!pending} onClick={()=>void action(()=>mutate(failedRetry))}>仅重试失败项</Button></div>}
 {results.length>0&&<section aria-label="加工订单处理结果"><h3>处理结果</h3>{results.map(r=><p key={r.batchId}>{r.status==='failed'?`未完成：${r.code}`:r.status==='created'?'已创建正式订单':r.status==='existing'?'已处理，返回原订单':r.status==='draft'?'已登记，请预览并确认下单':r.status==='cancelled'?'批次已取消':'下单已确认'} {r.orderNo}{r.salesOrderId&&<a href={'/order-center/server-detail?id='+encodeURIComponent(r.salesOrderId)}>查看订单</a>}</p>)}</section>}
 </div></Modal></>;
}

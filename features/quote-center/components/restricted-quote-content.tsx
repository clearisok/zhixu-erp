"use client";
import { useState } from "react";
import { AppShell, Button, Card, DescriptionList, FormItem, PageContainer, PageHeader } from "@/components/foundation";
import type { CostRestrictedRecord } from "../../../server/quotes/quote-response";
import { quoteServerClient } from "../server/quote-server-client";

/** Metadata-only consumer: no calculator, full Editor, Estimate or cost cache. */
export function RestrictedQuoteContent({ initial, editable=false }: {initial:CostRestrictedRecord;editable?:boolean}) {
 const [record,setRecord]=useState(initial);const [draft,setDraft]=useState(()=>structuredClone(initial.quote));
 const [busy,setBusy]=useState(false);const [blocked,setBlocked]=useState(false);const [message,setMessage]=useState("");
 const revision=draft.revisions.find(r=>r.revisionId===draft.defaultRevisionId)!;
 const save=async()=>{setBusy(true);setMessage("");try{
  const next=await quoteServerClient.save(draft,record.version);
  if(next.costVisibility!=="restricted")throw new Error("Read scope changed; reload the Quote");
  setRecord(next);setDraft(structuredClone(next.quote));setMessage("已保存基础信息");
 }catch{setBlocked(true);setMessage("保存未完成，请重新读取核对版本；隐藏成本没有作为空值提交。");}finally{setBusy(false);}};
 return <AppShell title="报价详情"><PageContainer><PageHeader title={draft.quoteCode} back={<a className="qc-button qc-button-secondary" href="/quote-center">返回报价列表</a>}/>
  <Card><p role="status">内部成本受限（restricted）：没有 quote.cost.view；金额不是空值或零。基础资料仍可查看。</p>
   <DescriptionList columns={3} items={[{key:"style",label:"款号",value:revision.baseInfo.quoteStyleNo},{key:"name",label:"款名",value:revision.baseInfo.styleName},{key:"brand",label:"品牌",value:revision.baseInfo.brandName},{key:"salesperson",label:"业务员",value:revision.baseInfo.salespersonName},{key:"type",label:"类型",value:revision.baseInfo.quoteType},{key:"version",label:"数据版本",value:record.version}]}/>
   {editable&&<fieldset disabled={busy||blocked}>{(["quoteStyleNo","styleName","note"] as const).map(key=><FormItem key={key} label={{quoteStyleNo:"款号",styleName:"款名",note:"备注"}[key]}><input className="qc-control" value={revision.baseInfo[key]} onChange={event=>setDraft(current=>({...current,revisions:current.revisions.map(r=>r.revisionId===revision.revisionId?{...r,baseInfo:{...r.baseInfo,[key]:event.target.value}}:r)}))}/></FormItem>)}<Button onClick={()=>void save()}>保存基础信息</Button></fieldset>}
   {message&&<p role="status">{message}</p>}
  </Card><Card><h3>版本与数量</h3>{draft.revisions.map(r=><section key={r.revisionId}><h4>{r.revisionLabel} · {r.readOnly?"历史只读":"当前"}</h4>{r.priceVersions.map(p=><p key={p.id}>{p.name} · 数量 {p.quantity===null?"未填写":p.quantity}</p>)}</section>)}</Card>
 </PageContainer></AppShell>;
}
"use client";
import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import {AppShell, Button, Card, PageContainer, PageHeader} from "@/components/foundation";
import {useServerSession} from "@/features/server-auth";
import {quoteCreationClient} from "../server/quote-creation-client";
import type {CreationReceipt} from "../../../server/quotes/creation-contract";

export function DirectQuoteCreateButton() {
  const router=useRouter(); const busy=useRef(false); const [pending,setPending]=useState(false);
  const hydrated=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
  return <Button permission="quote.create" disabled={!hydrated||pending} onClick={()=>{
    if(busy.current)return;
    busy.current=true;setPending(true);
    const id=crypto.randomUUID();
    // Persist the recovery address BEFORE submitting. Route mount/back/refresh
    // only reads this receipt; never issues a second business command.
    // A full exported-route navigation can unload/abort the outgoing POST.
    // Record its recoverable URL without navigating until the response is known.
    window.history.replaceState(null,"",`/quote-center/new?creationRequestId=${id}`);
    void quoteCreationClient.defaults(id).then(receipt=>{
      if(receipt.state==="committed"&&receipt.result)router.replace(`/quote-center/detail?id=${encodeURIComponent(receipt.result.quoteId)}&created=1`);
    }).catch(error=>{ const status=error&&typeof error==="object"&&"status"in error?String(error.status):"network";router.replace(`/quote-center/new?creationRequestId=${id}&failed=${encodeURIComponent(status)}`); });
  }}>{pending?"正在创建草稿…":"＋ 新建报价"}</Button>;
}
const subscribeHydration=()=>()=>{};

export function QuoteCreationRecovery() {
  const router=useRouter(); const params=useSearchParams(); const session=useServerSession();
  const requestId=params.get("creationRequestId");
  const [receipt,setReceipt]=useState<CreationReceipt|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const check=async()=>{
    if(!requestId)return;setBusy(true);setError("");
    try{const next=await quoteCreationClient.receipt(requestId);setReceipt(next);
      if(next.state==="committed"&&next.result)router.replace(`/quote-center/detail?id=${encodeURIComponent(next.result.quoteId)}&created=1`);
    }catch{setError("创建结果无法核对，请保留此地址；不会自动再次创建。");}finally{setBusy(false);}
  };
  // Read-only on mount. No effect, refresh or back/forward creates a Quote.
  useEffect(()=>{
    if(!requestId)return;
    let active=true;
    void quoteCreationClient.receipt(requestId).then(next=>{
      if(!active)return;setReceipt(next);
      if(next.state==="committed"&&next.result)router.replace(`/quote-center/detail?id=${encodeURIComponent(next.result.quoteId)}&created=1`);
    }).catch(()=>{if(active)setError("创建结果无法核对；原请求已保留，不会再次创建。");});
    return()=>{active=false;};
  },[requestId,session.user?.id,router]);
  return <AppShell title="新建报价" identityMode="server"><PageContainer><PageHeader title="新建报价" description="点击新建即保留一张有编号的草稿；返回不会删除。"/><Card title={requestId?"核对草稿创建结果":"创建报价草稿"}>
    {!requestId?<><p>使用 Server 报价设置的默认类型及制作方案，创建后直接填写款式报价明细。</p><DirectQuoteCreateButton/></>:<>
      <p role="status">{receipt?.state==="rejected"?"创建被拒绝，请检查报价默认设置。":"草稿正在创建或结果尚未确认。请核对原请求，不要重复新建。"}</p>
      {params.has("failed")&&<p role="alert">创建请求失败或结果不确定（{params.get("failed")==="409"?"409":"未确认"}）；不会自动重试，请核对原请求。</p>}
      {error&&<p role="alert">{error}</p>}<Button disabled={busy} onClick={()=>void check()}>核对创建结果</Button>
    </>}<Button variant="secondary" onClick={()=>router.push("/quote-center")}>返回报价列表</Button>
  </Card></PageContainer></AppShell>;
}

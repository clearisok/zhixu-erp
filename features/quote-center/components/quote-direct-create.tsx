"use client";
import {useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore} from "react";
import {useSearchParams} from "next/navigation";
import {useProtectedRouter as useRouter, useServerNavigationProtection} from "@/components/foundation/server-navigation-protection";
import {AppShell, Button, Card, PageContainer, PageHeader} from "@/components/foundation";
import {useServerSession} from "@/features/server-auth";
import {quoteCreationClient} from "../server/quote-creation-client";
import {QuoteServerError} from "../server/quote-server-client";
import type {CreationReceipt} from "../../../server/quotes/creation-contract";

type CreationOutcome={receipt:CreationReceipt}|{failure:string};
type CreationNavigationOwner={started:(id:string)=>void;finished:(id:string,outcome:CreationOutcome)=>void};
export function DirectQuoteCreateButton({navigationOwner}:{navigationOwner?:CreationNavigationOwner}={}) {
  const router=useRouter(); const session=useServerSession(); const busy=useRef(false); const [pending,setPending]=useState(false);
  const confirmedNavigation=useServerNavigationProtection({blocked:pending&&!navigationOwner,message:"草稿创建结果尚未确认，请先核对原创建请求。"});
  const hydrated=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
  return <Button permission="quote.create" disabled={!hydrated||pending} onClick={()=>{
    if(busy.current)return;
    busy.current=true;setPending(true);
    const id=crypto.randomUUID();
    navigationOwner?.started(id);
    // Persist the recovery address BEFORE submitting. Route mount/back/refresh
    // only reads this receipt; never issues a second business command.
    // A full exported-route navigation can unload/abort the outgoing POST.
    // Record its recoverable URL without navigating until the response is known.
    window.history.replaceState(window.history.state,"",`/quote-center/new?creationRequestId=${id}`);
    void quoteCreationClient.defaults(id).then(receipt=>{
      if(navigationOwner){navigationOwner.finished(id,{receipt});return;}
      if(receipt.state==="committed"&&receipt.result){const href=`/quote-center/detail?id=${encodeURIComponent(receipt.result.quoteId)}&created=1`;confirmedNavigation(()=>router.replace(href));}
    }).catch(error=>{ const status=error&&typeof error==="object"&&"status"in error?String(error.status):"network";if(navigationOwner){navigationOwner.finished(id,{failure:status});return;}if(error instanceof QuoteServerError&&error.status===401){confirmedNavigation(()=>session.invalidate());return;}confirmedNavigation(()=>router.replace(`/quote-center/new?creationRequestId=${id}&failed=${encodeURIComponent(status)}`)); });
  }}>{pending?"正在创建草稿…":"＋ 新建报价"}</Button>;
}
const subscribeHydration=()=>()=>{};

export function QuoteCreationRecovery() {
  const router=useRouter(); const params=useSearchParams(); const session=useServerSession();
  const requestId=params.get("creationRequestId");
  const scope=JSON.stringify([session.user?.id,session.permissions]);
  const scopeRef=useRef(scope),mounted=useRef(true),activeRequest=useRef<{id:string;scope:string}|null>(null);
  useLayoutEffect(()=>{scopeRef.current=scope;},[scope]);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;activeRequest.current=null;};},[]);
  const [creatingId,setCreatingId]=useState<string|null>(null);
  const [savedReceipt,setSavedReceipt]=useState<{id:string;value:CreationReceipt}|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const receipt=savedReceipt?.id===requestId?savedReceipt.value:null;
  const confirmedNavigation=useServerNavigationProtection({blocked:Boolean(creatingId)||Boolean(requestId)&&receipt?.state!=="committed"&&receipt?.state!=="rejected",message:"草稿创建结果尚未确认，请先核对原请求。此地址可用于恢复核对。"});
  const current=useCallback((id:string,expectedScope:string)=>mounted.current&&scopeRef.current===expectedScope&&location.pathname==="/quote-center/new"&&new URLSearchParams(location.search).get("creationRequestId")===id,[]);
  const remember=useCallback((id:string,next:CreationReceipt)=>setSavedReceipt(previous=>previous?.id===id&&(previous.value.state==="committed"||previous.value.state==="rejected"&&next.state==="pending")?previous:{id,value:next}),[]);
  const goToReceipt=useCallback((next:CreationReceipt)=>{
    if(next.state==="committed"&&next.result){const href=`/quote-center/detail?id=${encodeURIComponent(next.result.quoteId)}&created=1`;confirmedNavigation(()=>router.replace(href));}
  },[confirmedNavigation,router]);
  // The same mounted Recovery owns the request before and after replaceState
  // removes its child button. Never grant a generic unmounted-owner bypass.
  const navigationOwner:CreationNavigationOwner={
    started:id=>{activeRequest.current={id,scope};setCreatingId(id);},
    finished:(id,outcome)=>{
      if(activeRequest.current?.id!==id||activeRequest.current.scope!==scope||!current(id,scope))return;
      setCreatingId(null);
      if("receipt"in outcome){remember(id,outcome.receipt);goToReceipt(outcome.receipt);}
      else if(outcome.failure==="401")session.invalidate();
      else confirmedNavigation(()=>router.replace(`/quote-center/new?creationRequestId=${id}&failed=${encodeURIComponent(outcome.failure)}`));
    },
  };
  const check=async()=>{
    if(!requestId)return;setBusy(true);setError("");
    try{const next=await quoteCreationClient.receipt(requestId);if(!current(requestId,scope))return;remember(requestId,next);goToReceipt(next);
    }catch(error){if(current(requestId,scope)){if(error instanceof QuoteServerError&&error.status===401)session.invalidate();else setError("创建结果无法核对，请保留此地址；不会自动再次创建。");}}finally{if(current(requestId,scope))setBusy(false);}
  };
  // Read-only on mount. No effect, refresh or back/forward creates a Quote.
  useEffect(()=>{
    if(!requestId)return;
    let active=true;
    void quoteCreationClient.receipt(requestId).then(next=>{
      if(!active||!current(requestId,scope))return;remember(requestId,next);goToReceipt(next);
    }).catch(error=>{if(active&&current(requestId,scope)){if(error instanceof QuoteServerError&&error.status===401)session.invalidate();else setError("创建结果无法核对；原请求已保留，不会再次创建。");}});
    return()=>{active=false;};
  },[requestId,scope,session,current,remember,goToReceipt]);
  return <AppShell title="新建报价" identityMode="server"><PageContainer><PageHeader title="新建报价" description="点击新建即保留一张有编号的草稿；返回不会删除。"/><Card title={requestId?"核对草稿创建结果":"创建报价草稿"}>
    {!requestId?<><p>使用 Server 报价设置的默认类型及制作方案，创建后直接填写款式报价明细。</p><DirectQuoteCreateButton navigationOwner={navigationOwner}/></>:<>
      <p role="status">{receipt?.state==="rejected"?"创建被拒绝，请检查报价默认设置。":"草稿正在创建或结果尚未确认。请核对原请求，不要重复新建。"}</p>
      {params.has("failed")&&<p role="alert">创建请求失败或结果不确定（{params.get("failed")==="409"?"409":"未确认"}）；不会自动重试，请核对原请求。</p>}
      {error&&<p role="alert">{error}</p>}<Button disabled={busy} onClick={()=>void check()}>核对创建结果</Button>
    </>}<Button variant="secondary" onClick={()=>router.push("/quote-center")}>返回报价列表</Button>
  </Card></PageContainer></AppShell>;
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell, ErrorState, LoadingState, PageContainer } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { quoteAuthority } from "../authority/quote-authority";
import { quoteServerClient, QuoteServerError } from "../server/quote-server-client";
import { editableRecord, type EditableServerQuoteRecord } from "../server/quote-server-editor-adapter";
import type { CostRestrictedRecord } from "../../../server/quotes/quote-response";
import { RestrictedQuoteContent } from "./restricted-quote-content";
import { createQuoteEditorPersistence } from "../server/quote-editor-persistence";
import { QuoteDetailLoader, QuoteEditor, QuoteNewLoader } from "./quote-editor";
import { QuoteCreationRecovery } from "./quote-direct-create";

const safeError = (error: unknown) => error && typeof error === "object" && "status" in error ? `Server HTTP ${String(error.status)}；无 Browser fallback。` : "Server 读取失败或数值无法安全转换；无 Browser fallback。";
function ServerNew() {
  const session = useServerSession();
  return <QuoteCreationRecovery key={session.user?.id ?? "anonymous"} />;
}
function ServerDetail() {
  const id = useSearchParams().get("id") ?? "";
  const session = useServerSession();
  const [record, setRecord] = useState<EditableServerQuoteRecord | null>(null);
  const [error, setError] = useState({ id: "", message: "" });
  const [restricted,setRestricted]=useState<CostRestrictedRecord|null>(null);
  const [loadedScope,setLoadedScope]=useState("");
  const scope=`${id}/${session.user?.id??""}/${session.permissions.join("|")}`;
  useEffect(() => {
    let active = true;
    if (!id) { void Promise.resolve().then(() => setError({ id, message: "Server HTTP 404 · 缺少报价 ID" })); return; }
    void quoteServerClient.getById(id).then((result) => { if (active) { setLoadedScope(scope);setRestricted(result.costVisibility==="restricted"?result:null);setRecord(result.costVisibility==="restricted"?null:editableRecord(result));setError({ id, message: "" }); } }).catch((cause) => { if (active) {if(cause instanceof QuoteServerError&&cause.status===401)session.invalidate();setLoadedScope(scope);setError({ id, message: safeError(cause) });} });
    return () => { active = false; };
  }, [id,scope,session]);
  const persistence = useMemo(() => record ? createQuoteEditorPersistence(record) : undefined, [record]);
  if (!session.hasPermission("quote.view")) return <ErrorState permission title="Server HTTP 403 · 需要 quote.view" />;
  if (loadedScope!==scope) return <LoadingState label="读取 Server 报价" />;
  if (error.id === id && error.message) return <AppShell title="报价详情不可用"><PageContainer><ErrorState title="Server 报价读取失败" description={error.message} /></PageContainer></AppShell>;
  if (restricted?.quote.id===id) return <RestrictedQuoteContent key={scope} initial={restricted} editable={session.hasPermission("quote.edit")}/>;
  if (!record || !persistence || record.quote.id !== id) return <LoadingState label="读取 Server 报价" />;
  return <QuoteEditor key={record.quote.id} initialQuote={record.quote} persistence={persistence} />;
}
export function ProductionQuoteNew() { return quoteAuthority() === "server" ? <ServerNew /> : <QuoteNewLoader />; }
export function ProductionQuoteDetail() { return quoteAuthority() === "server" ? <ServerDetail /> : <QuoteDetailLoader />; }

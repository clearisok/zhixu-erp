"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useProtectedRouter as useRouter, useServerNavigationProtection } from "@/components/foundation/server-navigation-protection";
import { AppShell, Button, Card, DescriptionList, FormSection, PageContainer, PageHeader } from "@/components/foundation";
import { useServerSession } from "@/features/server-auth";
import { quoteCreationClient } from "../server/quote-creation-client";
import { QuoteServerError } from "../server/quote-server-client";
import type { CreationReceipt } from "../../../server/quotes/creation-contract";
import type { CreationOrderContext } from "../../../server/quotes/creation-order-context";

type CreationOutcome = { receipt: CreationReceipt } | { failure: string };
type CreationNavigationOwner = { started: (id: string) => void; finished: (id: string, outcome: CreationOutcome) => void };
const subscribeHydration = () => () => {};
const recoveryHref = (id: string, sourceOrderId?: string | null, failure?: string) => `/quote-center/new?${new URLSearchParams({ creationRequestId: id, ...(sourceOrderId ? { sourceOrderId } : {}), ...(failure ? { failed: failure } : {}) })}`;

export function DirectQuoteCreateButton({ navigationOwner, orderContext }: { navigationOwner?: CreationNavigationOwner; orderContext?: CreationOrderContext } = {}) {
  const router = useRouter(), session = useServerSession(), busy = useRef(false);
  const [pending, setPending] = useState(false);
  const confirmedNavigation = useServerNavigationProtection({ blocked: pending && !navigationOwner, message: "草稿创建结果尚未确认，请先核对原创建请求。" });
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  return <Button permission="quote.create" disabled={!hydrated || pending} onClick={() => {
    if (busy.current) return;
    busy.current = true; setPending(true);
    const id = crypto.randomUUID(), sourceOrderId = orderContext?.snapshot.salesOrderId;
    navigationOwner?.started(id);
    // Persist the receipt address before POST. The mounted Recovery owns this
    // request even after replaceState removes its child button. Mount never POSTs.
    window.history.replaceState(window.history.state, "", recoveryHref(id, sourceOrderId));
    void quoteCreationClient.defaults(id, orderContext ? { salesOrderId: orderContext.snapshot.salesOrderId, fingerprint: orderContext.fingerprint } : undefined).then(receipt => {
      if (navigationOwner) { navigationOwner.finished(id, { receipt }); return; }
      if (receipt.state === "committed" && receipt.result) confirmedNavigation(() => router.replace(`/quote-center/detail?id=${encodeURIComponent(receipt.result!.quoteId)}&created=1`));
    }).catch(error => {
      const status = error && typeof error === "object" && "status" in error ? String(error.status) : "network";
      if (navigationOwner) { navigationOwner.finished(id, { failure: status }); return; }
      if (error instanceof QuoteServerError && error.status === 401) { confirmedNavigation(() => session.invalidate()); return; }
      confirmedNavigation(() => router.replace(recoveryHref(id, sourceOrderId, status)));
    });
  }}>{pending ? "正在创建草稿…" : orderContext ? "创建经销报价草稿" : "＋ 新建报价"}</Button>;
}

const contextError = (error: unknown) => {
  const code = error instanceof QuoteServerError ? error.code : "network";
  return ({ creation_order_already_adopted: "这张订单已有报价依据，请在报价中心查看关联订单。", processing_order_source_fixed_by_batch: "加工订单来源由下单批次固定，请从报价中心登记新的加工下单。", creation_order_frozen: "已完成或已取消订单不能从此入口创建报价。", trusted_contract_required: "未找到可核实的合同来源。", sales_order_not_found: "订单不存在或当前不可读取。", permission_denied: "需要创建报价及查看订单的权限。" } as Record<string, string>)[code] ?? "订单来源暂时无法核对。没有创建报价，请重新读取后再试。";
};
function OrderContextDraft({ sourceOrderId, navigationOwner }: { sourceOrderId: string; navigationOwner: CreationNavigationOwner }) {
  const session = useServerSession(), [attempt, retry] = useState(0);
  const scope = JSON.stringify([sourceOrderId, session.user?.id, session.permissions, attempt]);
  const lease = useMemo(() => ({ scope, session }), [scope, session]), committed = useRef<typeof lease | null>(null);
  useLayoutEffect(() => { committed.current = lease; return () => { committed.current = null; }; }, [lease]);
  const [state, setState] = useState<{ lease: typeof lease; value?: CreationOrderContext; error?: string }>();
  useEffect(() => {
    let active = true;
    void quoteCreationClient.orderContext(sourceOrderId).then(value => {
      if (!active || committed.current !== lease) return;
      if (value.snapshot.salesOrderId !== sourceOrderId || value.snapshot.quoteType !== "distribution") { setState({ lease, error: "订单来源身份不一致，请重新读取。" }); return; }
      setState({ lease, value });
    }).catch(error => {
      if (!active || committed.current !== lease) return;
      if (error instanceof QuoteServerError && error.status === 401) session.invalidate();
      else setState({ lease, error: contextError(error) });
    });
    return () => { active = false; };
  }, [sourceOrderId, lease, session]);
  if (state?.lease !== lease) return <p role="status">正在核对订单来源…</p>;
  if (state.error) return <><p role="alert">{state.error}</p><Button variant="secondary" onClick={() => retry(value => value + 1)}>重新读取订单来源</Button></>;
  const value = state.value;
  if (!value) return null;
  const source = value.snapshot;
  return <>
    <DescriptionList columns={2} items={[
      { key: "order", label: "参考订单", value: source.orderNo }, { key: "contract", label: "销售合同", value: source.contract.salesContractNo },
      { key: "style", label: "来源款号", value: source.fields.styleNo || "未记录" }, { key: "type", label: "报价类型", value: "经销报价（合同订单）" },
      { key: "quantity", label: "来源数量", value: source.fields.quantity }, { key: "date", label: "成衣交期", value: source.fields.garmentLeadDate ?? "未记录" },
      { key: "customer", label: "来源客户", value: source.fields.customerName || "未记录" }, { key: "brand", label: "来源品牌", value: source.fields.brandName || "未记录" },
    ]} />
    <p>使用已保存的合同资料预填款号、数量和交期；品牌与业务员请在报价中选择。制作方案沿用报价设置。创建后仍需完成客户确认，再回订单选择报价来源。</p>
    <DirectQuoteCreateButton navigationOwner={navigationOwner} orderContext={value} />
  </>;
}

export function QuoteCreationRecovery() {
  const router = useRouter(), params = useSearchParams(), session = useServerSession();
  const requestId = params.get("creationRequestId"), sourceOrderId = params.get("sourceOrderId");
  const failure = params.get("failed");
  const scope = JSON.stringify([session.user?.id, session.permissions, sourceOrderId]);
  const lease = useMemo(() => ({ scope, sourceOrderId, session }), [scope, sourceOrderId, session]), committed = useRef<typeof lease | null>(null), mounted = useRef(true);
  const activeRequest = useRef<{ id: string; lease: typeof lease } | null>(null);
  useLayoutEffect(() => { committed.current = lease; return () => { committed.current = null; }; }, [lease]);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; activeRequest.current = null; }; }, []);
  const [creating, setCreating] = useState<{ id: string; lease: typeof lease } | null>(null);
  const [savedReceipt, setSavedReceipt] = useState<{ id: string; lease: typeof lease; value: CreationReceipt } | null>(null);
  const [error, setError] = useState<{ lease: typeof lease; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const receipt = savedReceipt?.id === requestId && savedReceipt.lease === lease ? savedReceipt.value : null;
  const confirmedNavigation = useServerNavigationProtection({ blocked: creating?.lease === lease || Boolean(requestId) && receipt?.state !== "committed" && receipt?.state !== "rejected", message: "草稿创建结果尚未确认，请先核对原请求。此地址可用于恢复核对。" });
  const current = useCallback((id: string, expected: typeof lease) => mounted.current && committed.current === expected && location.pathname === "/quote-center/new" && new URLSearchParams(location.search).get("creationRequestId") === id && new URLSearchParams(location.search).get("sourceOrderId") === expected.sourceOrderId, []);
  const remember = useCallback((id: string, next: CreationReceipt) => setSavedReceipt(previous => previous?.id === id && previous.lease === lease && (previous.value.state === "committed" || previous.value.state === "rejected" && next.state === "pending") ? previous : { id, lease, value: next }), [lease]);
  const goToReceipt = useCallback((next: CreationReceipt) => {
    if (next.state === "committed" && next.result) confirmedNavigation(() => router.replace(`/quote-center/detail?id=${encodeURIComponent(next.result!.quoteId)}&created=1`));
  }, [confirmedNavigation, router]);
  const navigationOwner: CreationNavigationOwner = {
    started: id => { activeRequest.current = { id, lease }; setCreating({ id, lease }); },
    finished: (id, outcome) => {
      if (activeRequest.current?.id !== id || activeRequest.current.lease !== lease || !current(id, lease)) return;
      setCreating(null);
      if ("receipt" in outcome) { remember(id, outcome.receipt); goToReceipt(outcome.receipt); }
      else if (outcome.failure === "401") session.invalidate();
      else confirmedNavigation(() => router.replace(recoveryHref(id, sourceOrderId, outcome.failure)));
    },
  };
  const check = async () => {
    if (!requestId) return; setBusy(true); setError(null);
    try { const next = await quoteCreationClient.receipt(requestId); if (!current(requestId, lease)) return; remember(requestId, next); goToReceipt(next); }
    catch (cause) { if (current(requestId, lease)) { if (cause instanceof QuoteServerError && cause.status === 401) session.invalidate(); else setError({ lease, message: "创建结果无法核对，请保留此地址；不会自动再次创建。" }); } }
    finally { if (current(requestId, lease)) setBusy(false); }
  };
  // Read-only on mount, refresh and history restoration; never re-POST.
  useEffect(() => {
    if (!requestId) return;
    let active = true;
    void quoteCreationClient.receipt(requestId).then(next => {
      if (!active || !current(requestId, lease)) return; remember(requestId, next); goToReceipt(next);
    }).catch(cause => { if (active && current(requestId, lease)) { if (cause instanceof QuoteServerError && cause.status === 401) session.invalidate(); else setError({ lease, message: "创建结果无法核对；原请求已保留，不会再次创建。" }); } });
    return () => { active = false; };
  }, [requestId, failure, lease, session, current, remember, goToReceipt]);
  const content = <>
    {!requestId ? sourceOrderId ? <OrderContextDraft sourceOrderId={sourceOrderId} navigationOwner={navigationOwner} /> : <><p>使用 Server 报价设置的默认类型及制作方案，创建后直接填写款式报价明细。</p><DirectQuoteCreateButton navigationOwner={navigationOwner} /></> : <>
      <p role="status">{receipt?.state === "rejected" ? "创建被拒绝，请检查来源及报价默认设置。" : "草稿正在创建或结果尚未确认。请核对原请求，不要重复新建。"}</p>
      {params.has("failed") && <p role="alert">创建请求失败或结果不确定（{params.get("failed") === "409" ? "409" : "未确认"}）；不会自动重试，请核对原请求。</p>}
      {error?.lease === lease && <p role="alert">{error.message}</p>}<Button disabled={busy} onClick={() => void check()}>核对创建结果</Button>
    </>}
    {sourceOrderId && <Button variant="secondary" onClick={() => router.push(`/order-center/server-detail?id=${encodeURIComponent(sourceOrderId)}`)}>返回订单</Button>}
    <Button variant="secondary" onClick={() => router.push("/quote-center")}>返回报价列表</Button>
  </>;
  const title = requestId ? "核对草稿创建结果" : sourceOrderId ? "从合同订单创建报价" : "创建报价草稿";
  return <AppShell title="新建报价" identityMode="server"><PageContainer><PageHeader title="新建报价" description="点击创建后保留一张有编号的草稿；返回不会删除。" />
    {sourceOrderId ? <FormSection title={title} columns={1}><div>{content}</div></FormSection> : <Card title={title}>{content}</Card>}
  </PageContainer></AppShell>;
}

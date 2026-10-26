"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/foundation";
import { useProtectedRouter } from "@/components/foundation/server-navigation-protection";
import { useServerSession } from "@/features/server-auth";
import type { CreationOrderContext } from "../../../server/quotes/creation-order-context";
import { quoteCreationClient } from "../server/quote-creation-client";
import { QuoteServerError } from "../server/quote-server-client";

/** Original creation reference only. It is never the adopted commercial source. */
export function QuoteCreationOrigin({ quoteId }: { quoteId: string }) {
  const session = useServerSession(), router = useProtectedRouter();
  const [attempt, retry] = useState(0);
  const scope = JSON.stringify([quoteId, session.user?.id, session.permissions, attempt]);
  const lease = useMemo(() => ({ scope, session }), [scope, session]), committed = useRef<typeof lease | null>(null);
  useLayoutEffect(() => { committed.current = lease; return () => { committed.current = null; }; }, [lease]);
  const [state, setState] = useState<{ lease: typeof lease; context?: CreationOrderContext | null; error?: boolean }>();
  const allowed = session.hasPermission("quote.view") && session.hasPermission("order.view");
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void quoteCreationClient.origin(quoteId).then(result => {
      if (active && committed.current === lease) setState({ lease, context: result.context });
    }).catch(error => {
      if (!active || committed.current !== lease) return;
      if (error instanceof QuoteServerError && error.status === 401) session.invalidate();
      else setState({ lease, error: true });
    });
    return () => { active = false; };
  }, [allowed, quoteId, lease, attempt, session]);
  if (!allowed || state?.lease !== lease) return null;
  if (state.error) return <span>创建参考暂时无法核对 <Button size="compact" variant="text" onClick={() => retry(value => value + 1)}>重新读取</Button></span>;
  const source = state.context?.snapshot;
  if (!source) return null;
  return <span data-quote-creation-origin={quoteId}>创建时参考 {source.orderNo} · 合同 {source.contract.salesContractNo}
    <Button variant="text" size="compact" onClick={() => router.push(`/order-center/server-detail?id=${encodeURIComponent(source.salesOrderId)}`)}>返回订单维护来源</Button>
  </span>;
}

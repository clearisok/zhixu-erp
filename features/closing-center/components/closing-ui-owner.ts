"use client";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useServerSession } from "@/features/server-auth";
import { createClosingClient } from "../server/closing-client";
import { messages } from "../server/closing-projection";
import { ServerAuthError } from "@/features/server-auth/server-auth-client";

export function useClosingOwner(context: string) {
  const session = useServerSession(), owner = useMemo(() => ({ session, context }), [session, context]);
  const committed = useRef<typeof owner | null>(null);
  useLayoutEffect(() => { committed.current = owner; return () => { committed.current = null; }; }, [owner]);
  const owns = useCallback(() => committed.current === owner && session.status === "authenticated", [owner, session]);
  const currentOwner = useCallback(() => owns() ? committed.current : null, [owns]);
  const client = useMemo(() => createClosingClient({ visibility: () => ({ sale: session.hasPermission("commercial.sale.view"), work: session.hasPermission("commercial.labor.view") }) }), [session]);
  return { session, owner, owns, currentOwner, client };
}
export const closingUiError = (value: unknown) => value instanceof ServerAuthError ? value.message : messages[(value as { code?: string })?.code ?? ""] ?? "暂时无法完成，请重新读取或核对原请求。";
export const productionLabel = { not_started: "未制作", in_progress: "制作中", completed: "制作完成" };
export function closingNumber(value: string | null) { if (value === null) return "待确认"; const [whole, fraction] = value.split("."); return whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ",") + (fraction ? "." + fraction : ""); }

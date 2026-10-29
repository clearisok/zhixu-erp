"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/components/foundation";
import { useServerNavigationProtection } from "@/components/foundation/server-navigation-protection";
import { createClosingController, type ClosingControlState } from "../server/closing-controller";
import { createClosingMonthController, type ClosingMonthControlState } from "../server/closing-month-controller";
import type { ClosingCommand } from "../server/closing-client";
import type { ClosingMonthCommand } from "@/server/closing/month-plan-model";
import { closingActionPermission } from "@/server/closing/contract";
import { useClosingOwner } from "./closing-ui-owner";

export type ClosingRecovery = { kind: "month"; command: ClosingMonthCommand } | { kind: "financial"; command: ClosingCommand };
export function ServerClosingRecoveryDialog({ original, onClose }: { original: ClosingRecovery; onClose: () => void }) {
  const { session, owner, owns, currentOwner, client } = useClosingOwner("recovery:" + original.kind + ":" + original.command.requestId);
  const controller = useRef<ReturnType<typeof createClosingController> | ReturnType<typeof createClosingMonthController> | null>(null);
  const [owned, setOwned] = useState<{ owner: object; value: ClosingControlState | ClosingMonthControlState }>();
  const state = owned?.owner === owner ? owned.value : null, blocked = Boolean(state?.busy || state?.pending || state?.pendingUnavailable);
  useServerNavigationProtection({ blocked, message: "原请求结果尚未确认，请先核对。" });
  useEffect(() => {
    let active = true; void Promise.resolve().then(() => {
      if (!active || !owns() || !session.user) return;
      const common = { userId: session.user.id, owner, currentOwner, permissions: () => session.permissions, storage: () => window.sessionStorage, client,
        onChange: (value: ClosingControlState | ClosingMonthControlState) => { if (active && owns()) setOwned({ owner, value }); }, onUnauthorized: () => { if (active && owns()) session.invalidate(); } };
      const c = original.kind === "month" ? createClosingMonthController({ ...common, orderId: original.command.intent.orderId })
        : createClosingController({ ...common, periodId: "periodId" in original.command.intent ? original.command.intent.periodId : null });
      controller.current = c; setOwned({ owner, value: c.snapshot() });
    }); return () => { active = false; controller.current?.dispose(); controller.current = null; };
  }, [client, currentOwner, original, owner, owns, session]);
  const permission = original.kind === "month" ? "closing.edit" : closingActionPermission(original.command.intent);
  return <Modal open title="核对原请求" description={original.kind === "month" ? "核对此前的订单月份调整，不依赖当前列表是否仍显示该订单。" : "核对此前的月份财务操作；不会生成新的命令。"} closeDisabled={Boolean(state?.busy)}
    onClose={() => { if (!state?.busy) onClose(); }} footer={<><div className="sc-command-status" aria-live="polite">{state?.error && <p role="alert">{state.error}</p>}{state?.message && <p>{state.message}</p>}</div><div className="sc-footer-actions">
      <Button variant="secondary" disabled={state?.busy} onClick={onClose}>返回</Button><Button disabled={!state || state.busy || !state.pending} onClick={() => void controller.current?.check()}>核对原请求</Button>
      {state?.retryAllowed && session.hasPermission(permission) && <Button variant="secondary" disabled={state.busy} onClick={() => { if (window.confirm("只重试同一个原ID和完全相同的内容？")) void controller.current?.retry(true); }}>重试原请求</Button>}
    </div></>}>
    <p>打开或刷新只恢复原请求，不会自动提交。只有核实服务端终态后，才释放本机原请求。</p>
    {blocked && <p>在结果核实前，原内容会继续保留。撤销编辑权限后仍可核对原回执。</p>}
  </Modal>;
}

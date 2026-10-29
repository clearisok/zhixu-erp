"use client";
import { useEffect, useRef, useState } from "react";
import { Button, FormItem, Modal } from "@/components/foundation";
import { useServerNavigationProtection } from "@/components/foundation/server-navigation-protection";
import { createClosingController, type ClosingControlState } from "../server/closing-controller";
import type { ClosingIntent } from "../server/closing-client";
import type { ClosingYear } from "../server/closing-year-projection";
import { closingUiError, useClosingOwner } from "./closing-ui-owner";

type Month = ClosingYear["months"][number];
const labels = { create_period: "建立月份", sync_month_outputs: "采用本月数量与价格", confirm_period: "确认月份", unconfirm_period: "取消确认", lock_period: "锁定月份", reopen_period: "重开月份" };
type Action = keyof typeof labels;
export function ServerClosingPeriodDialog({ month, onClose, onChanged }: { month: Month; onClose: () => void; onChanged: () => void }) {
  const { session, owner, owns, currentOwner, client } = useClosingOwner("period:" + month.month + ":" + (month.period?.id ?? "new"));
  const controller = useRef<ReturnType<typeof createClosingController> | null>(null), callback = useRef(onChanged);
  useEffect(() => { callback.current = onChanged; }, [onChanged]);
  const [owned, setOwned] = useState<{ owner: object; value: ClosingControlState }>();
  const state = owned?.owner === owner ? owned.value : null;
  const [action, setAction] = useState<Action>(month.period ? "sync_month_outputs" : "create_period"), [tax, setTax] = useState(""), [confirmed, setConfirmed] = useState(false), [reason, setReason] = useState("");
  const [sales, setSales] = useState(false), [work, setWork] = useState(false), [error, setError] = useState("");
  const blocked = Boolean(state?.busy || state?.pending || state?.pendingUnavailable), saved = state?.stage === "saved";
  const dirty = !saved && Boolean(reason || tax || confirmed || sales || work || state?.preview);
  useServerNavigationProtection({ blocked, dirty, message: "月份操作结果尚未确认，请先核对原请求。" });
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || !owns() || !session.user) return;
      const c = createClosingController({ userId: session.user.id, periodId: month.period?.id ?? null, owner, currentOwner,
        permissions: () => session.permissions, storage: () => window.sessionStorage, client,
        onChange: value => { if (active && owns()) setOwned({ owner, value }); }, onUnauthorized: () => { if (active && owns()) session.invalidate(); },
        onApplied: () => { if (active && owns()) callback.current(); } });
      controller.current = c; setOwned({ owner, value: c.snapshot() });
    }); return () => { active = false; controller.current?.dispose(); controller.current = null; };
  }, [client, currentOwner, month.period?.id, owner, owns, session]);
  const edit = (run: () => void) => { if (blocked) return; controller.current?.discardPreview(); setError(""); run(); };
  const close = () => { if (blocked || dirty && !window.confirm("放弃本次未保存的月份输入？")) return; onClose(); };
  const actions: Action[] = !month.period ? ["create_period"] : month.period.status === "locked" ? ["reopen_period"] : month.period.status === "confirmed" ? ["unconfirm_period", "lock_period"] : ["sync_month_outputs", "confirm_period"];
  const selected = actions.includes(action) ? action : actions[0];
  const required = selected === "lock_period" ? "closing.lock" : selected === "reopen_period" ? "closing.reopen" : selected === "confirm_period" || selected === "unconfirm_period" ? "closing.confirm" : "closing.edit";
  const preview = async () => {
    if (!owns() || blocked) return;
    try {
      let intent: ClosingIntent;
      if (selected === "create_period") {
        if (!confirmed) { setError("请明确确认本月税率。税率不会自动继承其他月份。"); return; }
        intent = { action: "create_period", month: month.month, taxRatePercent: tax, taxRateConfirmed: true, remark: reason };
      } else { if (!month.period) return;
        intent = selected === "sync_month_outputs" ? { action: selected, periodId: month.period.id, expectedPeriodVersion: month.period.version, channels: { sales, work }, reason }
          : { action: selected, periodId: month.period.id, expectedPeriodVersion: month.period.version, reason };
      }
      await controller.current?.preview(intent);
    } catch (value) { if (owns()) setError(closingUiError(value)); }
  };
  return <Modal open title={`${month.month} 月份管理`} description="关账数量来自订单月份分配；价格采用与确认、锁定均需明确操作。" className="sc-period-dialog" onClose={close} closeDisabled={blocked} footer={<>
    <div className="sc-command-status" aria-live="polite">{error && <p role="alert">{error}</p>}{state?.error && <p role="alert">{state.error}</p>}{state?.message && <p>{state.message}</p>}
      {(state?.pending || state?.pendingUnavailable) && <Button variant="secondary" size="compact" disabled={state.busy} onClick={() => void controller.current?.check()}>核对原请求</Button>}
      {state?.retryAllowed && <Button variant="secondary" size="compact" disabled={state.busy} onClick={() => { if (window.confirm("仅重试同一原请求？")) void controller.current?.retry(true); }}>重试原请求</Button>}
    </div><div className="sc-footer-actions"><Button variant="secondary" disabled={blocked} onClick={close}>关闭</Button>{state?.preview
      ? <Button disabled={blocked || !session.hasPermission(required)} onClick={() => void controller.current?.apply()}>确认执行</Button>
      : <Button disabled={blocked || !session.hasPermission(required)} onClick={() => void preview()}>预览操作</Button>}</div>
  </>}>
    <fieldset disabled={blocked} className="sc-adjustment-fields"><div className="sc-form-grid"><FormItem label="操作"><select aria-label="月份操作" value={selected} onChange={e => edit(() => setAction(e.target.value as Action))}>{actions.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></FormItem>
      {month.period ? <FormItem label="期间税率"><input value={month.period.taxRatePercent + "%"} readOnly /></FormItem> : <FormItem label="期间税率 %" required><input aria-label="期间税率" inputMode="decimal" value={tax} placeholder="请明确填写" onChange={e => edit(() => setTax(e.target.value))} /></FormItem>}
    </div>{!month.period && <label className="sc-check"><input type="checkbox" checked={confirmed} onChange={e => edit(() => setConfirmed(e.target.checked))} />我已核对并确认本月税率</label>}
      {selected === "sync_month_outputs" && <div className="sc-channel-options">{session.hasPermission("commercial.sale.view") && <label className="sc-check"><input type="checkbox" checked={sales} onChange={e => edit(() => setSales(e.target.checked))} />成衣销售产值 CNY</label>}{session.hasPermission("commercial.labor.view") && <label className="sc-check"><input type="checkbox" checked={work} onChange={e => edit(() => setWork(e.target.checked))} />加工产值 USD</label>}<p>仅采用已确认、适用币种的订单商业版本。缺少USD工价时不会自动换汇。</p></div>}
      <FormItem label="原因 / 备注"><textarea aria-label="月份操作原因" rows={3} maxLength={2000} value={reason} onChange={e => edit(() => setReason(e.target.value))} /></FormItem></fieldset>
    {state?.preview && <section className="sc-preview"><h3>{labels[selected]} · 待确认</h3><p>{month.month} → {state.preview.nextStatus === "locked" ? "已锁定" : state.preview.nextStatus === "confirmed" ? "已确认" : "开放中"}</p>
      {"monthSync" in state.preview && state.preview.monthSync && <p>新增 {state.preview.monthSync.counts.created} 项，更新 {state.preview.monthSync.counts.updated} 项，作废 {state.preview.monthSync.counts.voided} 项，不变 {state.preview.monthSync.counts.unchanged} 项。两个金额渠道的数量不相加。</p>}
      <p>本次不修改报价、生产完成量或成衣出货。</p></section>}
  </Modal>;
}

"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, FormItem, Modal } from '@/components/foundation';
import { useServerNavigationProtection } from '@/components/foundation/server-navigation-protection';
import { useServerSession } from '@/features/server-auth';
import { createLaborAdoptionClient, LaborAdoptionClientError, type LaborOptions, type LaborHistory, type LaborOrderPage } from '../server/labor-adoption-client';
import { createLaborAdoptionController, type LaborControlState } from '../server/labor-adoption-controller';
import { priceOperationLocks } from '../server/price-operation-locks';

const lifecycle = (value: string) => ({ draft: '草稿', confirmed: '已确认', completed: '已完成', cancelled: '已取消' }[value] ?? '执行中');
const errorText = (error: unknown) => error instanceof LaborAdoptionClientError ? error.message : '资料暂不可用，请重新读取；原请求保持。';
type Owned<T> = { owner: object; value: T };
export function QuoteOrderLaborDialog({ quoteId, onClose, onSale, saleAvailable }: {
  quoteId: string; onClose: () => void; onSale: () => void; saleAvailable: boolean;
}) {
  const session = useServerSession(), owner = useMemo(() => ({ session, quoteId }), [session, quoteId]);
  const committed = useRef<object | null>(null), controller = useRef<ReturnType<typeof createLaborAdoptionController> | null>(null);
  useLayoutEffect(() => { committed.current = owner; return () => { committed.current = null; }; }, [owner]);
  const read = ['quote.view', 'order.view', 'commercial.labor.view'].every(key => session.permissions.includes(key as typeof session.permissions[number]));
  const write = read && session.hasPermission('order.commercial.adopt') && session.hasPermission('commercial.labor.edit');
  const owns = useCallback(() => committed.current === owner && session.status === 'authenticated' && read, [owner, session, read]);
  const client = useMemo(() => createLaborAdoptionClient(), []);
  const [control, setControl] = useState<Owned<LaborControlState>>(), [orderPage, setOrderPage] = useState<Owned<LaborOrderPage>>();
  const [optionPage, setOptionPage] = useState<Owned<LaborOptions>>(), [historyPage, setHistoryPage] = useState<Owned<LaborHistory>>();
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [selected, setSelected] = useState('');
  const [revisionOffset, setRevisionOffset] = useState(0), [revision, setRevision] = useState(''), [colors, setColors] = useState<(string | null)[]>([]);
  const [acknowledged, setAcknowledged] = useState(false), [reason, setReason] = useState(''), [tab, setTab] = useState<'adopt' | 'history'>('adopt');
  const [historyOffset, setHistoryOffset] = useState(0), [refresh, setRefresh] = useState(0), [failure, setFailure] = useState<Owned<string>>();
  const [reading, setReading] = useState<Owned<boolean>>(), [foreignPending, setForeignPending] = useState<Owned<boolean>>();
  const state = control?.owner === owner ? control.value : null, page = orderPage?.owner === owner ? orderPage.value : null;
  const options = optionPage?.owner === owner && optionPage.value.orderId === selected ? optionPage.value : null;
  const history = historyPage?.owner === owner && historyPage.value.orderId === selected ? historyPage.value : null;
  const loading = reading?.owner === owner && reading.value, blocked = Boolean(state?.busy || state?.pending || state?.pendingUnavailable);
  const done = state?.stage === 'saved', dirty = !done && Boolean(reason || colors.length || acknowledged || state?.preview);
  const foreign = foreignPending?.owner === owner && foreignPending.value;
  const permitted = page?.items.find(row => row.id === selected)?.editable === true;
  const currentRevision = options?.revisions.find(row => row.revisionId === revision);
  const source = (pv: string) => currentRevision?.priceVersions.find(value => value.priceVersionId === pv);
  const edit = (fn: () => void) => { if (blocked || done) return; controller.current?.discardPreview(); setFailure(undefined); fn(); };
  const guard = (fn: () => void) => { if (blocked || dirty && !window.confirm('放弃未保存的工价采用输入？')) return; controller.current?.discardPreview(); fn(); };
  useServerNavigationProtection({ blocked, dirty, message: '工价采用尚未核实，请先核对原请求。' });
  useEffect(() => {
    let active = true; const lease = () => active && owns();
    void Promise.resolve().then(() => {
      if (!lease() || !session.user) return;
      setForeignPending({ owner, value: priceOperationLocks(window.sessionStorage, session.user.id).sale });
      const c = createLaborAdoptionController({ userId: session.user.id, quoteId, owner, currentOwner: () => lease() ? owner : null,
        access: () => ({ read: lease(), write: lease() && write }), storage: () => window.sessionStorage, client,
        onChange: value => { if (lease()) setControl({ owner, value }); }, onUnauthorized: () => { if (lease()) session.invalidate(); }, onForbidden: () => { if (lease()) void session.refresh(); },
        onApplied: () => { if (lease()) setRefresh(value => value + 1); } });
      controller.current = c; setControl({ owner, value: c.snapshot() });
    });
    return () => { active = false; controller.current?.dispose(); controller.current = null; };
  }, [client, owner, owns, quoteId, read, session, write]);
  useEffect(() => {
    let active = true; const abort = new AbortController(), lease = () => active && owns();
    void Promise.resolve().then(async () => {
      if (!lease()) return; setReading({ owner, value: true });
      try { const result = await client.orders(quoteId, query, offset, lease, abort.signal); if (lease()) setOrderPage({ owner, value: result }); }
      catch (error) { if (lease()) { setFailure({ owner, value: errorText(error) }); if ((error as { status?: number }).status === 401) session.invalidate(); else if ((error as { status?: number }).status === 403) void session.refresh(); } }
      finally { if (lease()) setReading({ owner, value: false }); }
    });
    return () => { active = false; abort.abort(); };
  }, [client, offset, owner, owns, query, quoteId, refresh, session]);
  useEffect(() => {
    if (!selected) return;
    let active = true; const abort = new AbortController(), lease = () => active && owns();
    void Promise.resolve().then(async () => {
      if (!lease()) return; setOptionPage(undefined); setHistoryPage(undefined);
      try {
        if (tab === 'history') { const result = await client.history(selected, historyOffset, lease, abort.signal); if (lease()) setHistoryPage({ owner, value: result }); }
        else { const result = await client.options(quoteId, selected, revisionOffset, lease, abort.signal); if (lease()) setOptionPage({ owner, value: result }); }
      } catch (error) { if (lease()) { setFailure({ owner, value: errorText(error) }); if ((error as { status?: number }).status === 401) session.invalidate(); else if ((error as { status?: number }).status === 403) void session.refresh(); } }
    });
    return () => { active = false; abort.abort(); };
  }, [client, historyOffset, owner, owns, quoteId, refresh, revisionOffset, selected, session, tab]);
  const select = (id: string) => guard(() => { setSelected(id); setRevision(''); setColors([]); setReason(''); setAcknowledged(false); setRevisionOffset(0); setHistoryOffset(0); setFailure(undefined); });
  const preview = async () => {
    if (!owns() || blocked || !write || !options || !session.user || !acknowledged) return;
    if (priceOperationLocks(window.sessionStorage, session.user.id).sale) { setForeignPending({ owner, value: true }); return; }
    await controller.current?.preview({ orderId: selected, expectedVersion: options.version, targetRevisionId: revision,
      colorIds: colors, productUnchangedConfirmed: true, reason });
  };
  const apply = () => { if (!owns() || !session.user || priceOperationLocks(window.sessionStorage, session.user.id).sale) { setForeignPending({ owner, value: true }); return; } void controller.current?.apply(); };
  const pendingQuote = state?.pending?.quoteId;
  const unavailable = (code: string) => ({ labor_usd_confirmation_required: '尚未确认 USD 工价', labor_confirmation_currency_evidence_required: '缺少确认币种依据', order_quote_business_type_conflict: '业务类型不匹配' }[code] ?? '该方案暂无可用 USD 确认，请返回报价核对');
  return <Modal open title="关联订单与工价" description="明确采用报价中已确认的 USD 工价，不换汇、不自由填价。" className="oc-source-modal" onClose={() => guard(onClose)} closeDisabled={blocked} footer={<>
    <div aria-live="polite">{failure?.owner === owner && <p role="alert">{failure.value}</p>}{state?.error && <p role="alert">{state.error}</p>}{state?.message && <p>{state.message}</p>}
      {(state?.pending || state?.pendingUnavailable) && <Button size="compact" variant="secondary" disabled={state.busy} onClick={() => void controller.current?.check()}>核对原工价请求</Button>}
      {state?.retryAllowed && <Button size="compact" variant="secondary" disabled={state.busy || !write || foreign} onClick={() => { if (window.confirm('仅重试完全相同的原工价命令？')) void controller.current?.retry(true); }}>重试原工价请求</Button>}
    </div><div className="oc-business-source-search"><Button variant="secondary" disabled={blocked} onClick={() => guard(onClose)}>{done ? '完成' : '关闭'}</Button>
      {tab === 'adopt' && !done && (state?.preview ? <Button disabled={blocked || !write || foreign} onClick={apply}>确认采用 USD 工价</Button>
        : <Button disabled={blocked || loading || !options || !permitted || !write || foreign || !colors.length || !revision || !acknowledged || !reason.trim()} onClick={() => void preview()}>预览 USD 工价</Button>)}
    </div></>}>
    <div className="oc-business-source-search">{saleAvailable && <Button variant="text" disabled={blocked} onClick={() => guard(onSale)}>订单成交价</Button>}
      <Button variant={tab === 'adopt' ? 'secondary' : 'text'} disabled={blocked} onClick={() => guard(() => setTab('adopt'))}>采用 USD 工价</Button>
      <Button variant={tab === 'history' ? 'secondary' : 'text'} disabled={blocked} onClick={() => guard(() => setTab('history'))}>工价采用历史</Button></div>
    {!read ? <p>当前账号无权查看订单工价。</p> : <>
      {foreign && <p role="alert">存在未核实的成衣调价请求，请先返回订单成交价核对；不能同时开始工价采用。</p>}
      {pendingQuote && pendingQuote !== quoteId && <p role="alert">原工价请求属于另一张报价。请先核对原请求，本窗口不会建立第二笔采用。</p>}
      <fieldset disabled={blocked || Boolean(state?.preview)} className="oc-source-form"><FormItem label="搜索关联订单"><div className="oc-business-source-search">
        <input className="qc-control" aria-label="搜索工价关联订单" value={search} maxLength={200} placeholder="订单号、合同或款号" onChange={event => setSearch(event.target.value)} />
        <Button disabled={loading} onClick={() => guard(() => { setQuery(search); setOffset(0); })}>查询工价订单</Button></div></FormItem>
        <div className="oc-source-table"><table aria-label="工价关联订单"><thead><tr><th>选择</th><th>订单 / 合同 / 款号</th><th>当前工价</th><th>状态</th></tr></thead><tbody>
          {page?.items.map(row => <tr key={row.id}><td><input type="radio" name="usd-order" aria-label={'选择工价订单 ' + row.orderNo} checked={selected === row.id} onChange={() => select(row.id)} /></td>
            <td>{row.orderNo}<small>{row.contractNo ?? row.styleNo ?? '加工业务'}</small></td><td>{row.work.map((value, i) => <div key={i}>{value.price} {value.currency}</div>)}</td>
            <td>{row.historical ? '历史订单 · 只读' : lifecycle(row.lifecycle)}{!row.editable && ' · 不可采用'}</td></tr>)}</tbody></table></div>
        {loading && <p role="status">正在读取关联订单…</p>}{page && !page.items.length && <p>暂无采用本报价的订单。</p>}
        <div className="oc-business-source-search"><Button variant="text" size="compact" disabled={!offset || loading} onClick={() => guard(() => setOffset(Math.max(0, offset - 20)))}>上一页工价订单</Button>
          <Button variant="text" size="compact" disabled={!page?.hasMore || loading} onClick={() => guard(() => setOffset(offset + 20))}>下一页工价订单</Button></div>
      </fieldset>
      {selected && tab === 'history' && <section aria-label="工价采用历史"><h3>工价采用历史</h3>{history?.items.map(item => <article key={item.actorUserId + item.requestId}>
        <p>{new Date(item.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} · {item.actorName ?? '当时未记录姓名'} · {item.result.status === 'applied' ? '已采用' : item.result.status === 'unchanged' ? '相同依据' : '未采用'}</p>
        {item.after.map(line => <p key={line.colorId ?? 'whole'}>{line.colorName ?? '整单'} · {line.priceVersionName}：{item.before.find(old => old.colorId === line.colorId)?.laborPrice ?? '当时未记录'} {item.before.find(old => old.colorId === line.colorId)?.laborCurrency ?? ''} → {line.laborPrice} {line.laborCurrency}</p>)}
      </article>)}{history && !history.items.length && <p>暂无工价采用记录。</p>}<div className="oc-business-source-search">
        <Button variant="text" disabled={!historyOffset || blocked} onClick={() => setHistoryOffset(Math.max(0, historyOffset - 20))}>上一页工价历史</Button><Button variant="text" disabled={!history?.hasMore || blocked} onClick={() => setHistoryOffset(historyOffset + 20)}>下一页工价历史</Button></div></section>}
      {selected && tab === 'adopt' && options && !state?.preview && !done && <fieldset disabled={blocked || !write || !permitted || foreign} className="oc-source-form">
        <h3>选择已确认 USD 的报价修订</h3><p>保持原价格方案身份，产品规格、工艺和材料必须不变。缺少可用修订时，请先回报价建立和确认修订。</p>
        <FormItem label="报价修订"><select className="qc-control" aria-label="USD 工价报价修订" value={revision} onChange={event => edit(() => { setRevision(event.target.value); setColors([]); })}><option value="">请选择修订</option>
          {options.revisions.map(value => <option key={value.revisionId} value={value.revisionId}>{value.label}</option>)}</select></FormItem>
        <div className="oc-business-source-search"><Button variant="text" disabled={!revisionOffset} onClick={() => edit(() => { setRevisionOffset(Math.max(0, revisionOffset - 20)); setRevision(''); setColors([]); })}>上一页修订</Button><Button variant="text" disabled={!options.hasMoreRevisions} onClick={() => edit(() => { setRevisionOffset(revisionOffset + 20); setRevision(''); setColors([]); })}>下一页修订</Button></div>
        <div className="oc-source-table"><table aria-label="USD 工价颜色匹配"><thead><tr><th>选择</th><th>颜色 / 原方案</th><th>当前工价</th><th>已确认 USD 工价</th></tr></thead><tbody>{options.lines.map(line => {
          const candidate = source(line.priceVersionId), available = line.laborCurrency === 'CNY' && candidate?.available;
          return <tr key={line.colorId ?? 'whole'}><td><input type="checkbox" aria-label={'采用工价颜色 ' + (line.colorName ?? '整单')} disabled={!available} checked={colors.includes(line.colorId)} onChange={event => edit(() => setColors(current => event.target.checked ? [...current, line.colorId] : current.filter(value => value !== line.colorId)))} /></td>
            <td>{line.colorName ?? '整单'} · {line.priceVersionName}</td><td>{line.laborPrice} {line.laborCurrency}</td><td>{line.laborCurrency === 'USD' ? '已经采用 USD' : candidate?.available ? candidate.laborPrice + ' USD' : candidate ? unavailable(candidate.code) : revision ? '本修订未包含原方案' : '请选择修订'}</td></tr>;
        })}</tbody></table></div>
        <label><input type="checkbox" aria-label="确认产品条件不变" checked={acknowledged} onChange={event => edit(() => setAcknowledged(event.target.checked))} />我确认产品规格、生产工艺和材料保持不变</label>
        <FormItem label="采用原因" required><textarea className="qc-control" aria-label="USD 工价采用原因" value={reason} maxLength={2000} onChange={event => edit(() => setReason(event.target.value))} /></FormItem>
      </fieldset>}
      {state?.preview && <section aria-label="USD 工价采用预览"><h3>{state.preview.revisionLabel} · 工价采用预览</h3>
        <div className="oc-source-table"><table><thead><tr><th>颜色 / 方案</th><th>当前工价</th><th>拟采用工价</th><th>确认依据</th></tr></thead><tbody>{state.preview.after.map(line => {
          const old = state.preview!.before.find(value => value.colorId === line.colorId); return <tr key={line.colorId ?? 'whole'}><td>{line.colorName ?? '整单'} · {line.priceVersionName}</td><td>{old?.laborPrice} {old?.laborCurrency}</td><td>{line.laborPrice} USD</td><td>{line.confirmation?.sourceKind === 'cct' ? '客户确认记录' : '报价确认快照'} · {line.confirmation?.confirmedAt ? new Date(line.confirmation.confirmedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '当时未记录'}</td></tr>;
        })}</tbody></table></div><p>仅追加本订单工价版本；售价、未选颜色、产品条件与已关账历史保留。关账开放月份需回关账中心明确同步。</p>
        {state.preview.warnings.length > 0 && <p role="alert">修订说明发生变化，请再次核对产品条件。</p>}<Button variant="secondary" disabled={blocked} onClick={() => controller.current?.discardPreview()}>返回工价匹配</Button>
      </section>}
      {done && <p role="status">工价采用已核实。可查看采用历史；关账中心将按明确同步采用新依据。</p>}
    </>}
  </Modal>;
}

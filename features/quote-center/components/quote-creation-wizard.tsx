"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Card, ErrorState, FormItem, PageContainer, PageHeader } from "../../../components/foundation";
import { useServerSession } from "../../server-auth/components/server-session-provider";
import type { CreationInput, CreationCommand, CreationReceipt } from "../../../server/quotes/creation-contract";
import type { CreationOptions, CreationPreview } from "../../../server/quotes/creation-workflows";
import { quoteCreationClient } from "../server/quote-creation-client";
import { QuoteServerError } from "../server/quote-server-client";

const initial: CreationInput = { source: null, quoteType: "distribution", selection: { country: null, presetId: null }, fields: { brandId: null, salespersonId: null, styleNo: "", styleName: "", quantity: null, garmentLeadDate: null, note: "" }, parameterOverrides: {} };
const errorText = (error: unknown) => error instanceof QuoteServerError ? `Server HTTP ${error.status} · ${error.code}。输入已保留，请重新核对资料。` : "网络结果未确认。输入已保留，不自动重试创建。";
const fieldNames: Record<string, string> = { manufacturingCountry: "制作国家", laborCurrency: "工价币种", usdCnyRate: "汇率", markupRate: "加成", freight: "运费策略" };
const sourceNames = { unset: "待设置", technical_default: "技术结构默认（未确认）", explicit: "本次明确选择", preset: "已选制作预设", accepted_default: "已有默认值（本次核对接受）" };
/** Ordinary creation today; future Intake must reuse this UI with an explicit authorised source adapter. */
export function QuoteCreationWizard({ initialFields }: { initialFields?: Partial<CreationInput["fields"]> } = {}) {
  const router = useRouter(); const session = useServerSession();
  const existingRequestId = useSearchParams().get("creationRequestId");
  const [input, setInput] = useState<CreationInput>(() => ({ ...structuredClone(initial), fields: { ...initial.fields, ...initialFields } }));
  const [step, setStep] = useState(1); const [options, setOptions] = useState<CreationOptions | null>(null);
  const [preview, setPreview] = useState<CreationPreview | null>(null);
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const [error, setError] = useState(""); const [unknown, setUnknown] = useState(Boolean(existingRequestId));
  const [submitted, setSubmitted] = useState(Boolean(existingRequestId));
  const requestId = useRef<string | null>(existingRequestId);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!unknown) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [unknown]);
  const refresh = async (query = "") => {
    if (pending.current || unknown) return;
    pending.current = true; setBusy(true); setPreview(null);
    try { setOptions(await quoteCreationClient.options(query)); setError(""); }
    catch (cause) { setError(errorText(cause)); }
    finally { pending.current = false; setBusy(false); }
  };
  useEffect(() => { let active = true; void quoteCreationClient.options().then(data => { if (active) setOptions(data); }).catch(cause => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, []);
  const change = (next: CreationInput) => { if (busy || unknown) return; setInput(next); setPreview(null); setError(""); };
  const field = (key: keyof CreationInput["fields"], value: string | null) => change({ ...input, fields: { ...input.fields, [key]: value } });
  const review = async () => {
    if (pending.current || unknown) return;
    pending.current = true; setBusy(true); setPreview(null);
    try { setPreview(await quoteCreationClient.preview(input)); setError(""); }
    catch (cause) { setError(errorText(cause)); }
    finally { pending.current = false; setBusy(false); }
  };
  const finish = (receipt: CreationReceipt) => {
    if (receipt.state === "committed" && receipt.result) router.replace(`/quote-center/detail?id=${encodeURIComponent(receipt.result.quoteId)}`);
    else if (receipt.state === "rejected") { setUnknown(false); setSubmitted(false); setPreview(null); requestId.current = null; window.history.replaceState(window.history.state, "", "/quote-center/new"); setError(`创建已拒绝 · ${receipt.errorCode ?? "creation_rejected"}。输入保留；请重新核对参数。`); }
    else setError("创建结果仍待核对。不会重新 POST 或生成新编号，请稍后再次显式核对原请求。");
  };
  const create = async () => {
    if (pending.current || requestId.current || unknown || !preview) return;
    pending.current = true; setBusy(true);
    const command: CreationCommand = { ...structuredClone(input), clientRequestId: crypto.randomUUID(), previewId: preview.previewId, imageSelection: null };
    requestId.current = command.clientRequestId;
    setSubmitted(true);
    window.history.replaceState(window.history.state, "", `/quote-center/new?creationRequestId=${encodeURIComponent(command.clientRequestId)}`);
    try { finish(await quoteCreationClient.execute(command)); }
    catch (cause) {
      setError(errorText(cause));
      // Any submitted command is reconciled via its receipt before another token can be used.
      setUnknown(true);
    } finally { pending.current = false; setBusy(false); }
  };
  const reconcile = async () => {
    if (pending.current || !requestId.current) return;
    pending.current = true; setBusy(true);
    try { finish(await quoteCreationClient.receipt(requestId.current)); }
    catch (cause) { setError(errorText(cause)); }
    finally { pending.current = false; setBusy(false); }
  };
  const p = preview?.pricingParameters;
  const missingSelection = Boolean(options && (
    input.fields.brandId && !options.brands.some(item => item.id === input.fields.brandId) ||
    input.fields.salespersonId && !options.salespeople.some(item => item.id === input.fields.salespersonId) ||
    input.selection.presetId && !options.presets.some(item => item.id === input.selection.presetId)
  ));
  return <AppShell title="新建报价" backTarget={{ href: "/quote-center", label: "返回报价中心" }}><PageContainer className="qc-server-new qc-original-quote-new">
    <PageHeader eyebrow="CREATE QUOTE" title="新建报价" count={unknown ? "创建结果待核对" : submitted ? "创建结果处理中" : `第 ${step} / 2 步 · 尚未创建`} description="最后确认前不创建报价、不分配编号。制作参数待完善也可保存为正式草稿。" />
    {error && <ErrorState title="Server 创建未确认" description={error} />}
    {!session.hasPermission("quote.create") ? <ErrorState permission title="需要 quote.create" /> : <Card className="qc-base-card qc-server-create-panel">
      <header><div><span className="qc-section-index">0{step}</span><h2>{step === 1 ? "报价类型与制作方案" : "报价基础信息"}</h2></div></header>
      <fieldset disabled={busy || unknown || !options} className="qc-server-create-fields qc-two-step-fields">
        {step === 1 ? <>
          <FormItem label="报价类型" required><select className="qc-control" value={input.quoteType} onChange={event => change({ ...input, quoteType: event.target.value as CreationInput["quoteType"] })}><option value="processing">加工报价</option><option value="distribution">经销报价</option></select></FormItem>
          <FormItem label="制作国家"><input className="qc-control" list="creation-countries" value={input.selection.country ?? ""} placeholder="待设置，或输入制作国家" onChange={event => change({ ...input, selection: { country: event.target.value || null, presetId: null } })} /><datalist id="creation-countries">{[...new Set(options?.presets.map(item => item.country))].map(country => <option key={country} value={country} />)}</datalist></FormItem>
          <FormItem label="制作预设"><select className="qc-control" value={input.selection.presetId ?? ""} onChange={event => change({ ...input, selection: { ...input.selection, presetId: event.target.value || null } })}><option value="">不使用预设 · 参数待完善</option>{input.selection.presetId && !options?.presets.some(item => item.id === input.selection.presetId) && <option value={input.selection.presetId} disabled>已选预设未在当前候选中 · 请刷新核对</option>}{options?.presets.filter(item => item.country === input.selection.country).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem>
          <p>多个预设请明确选择；无预设不会自动补汇率、加成或运费。加工默认隐藏面辅料编辑，但内部成本数据与计算仍保留。</p>
        </> : <>
          <FormItem label="品牌"><select className="qc-control" value={input.fields.brandId ?? ""} onChange={event => change({ ...input, fields: { ...input.fields, brandId: event.target.value || null, salespersonId: null } })}><option value="">待填写</option>{input.fields.brandId && !options?.brands.some(item => item.id === input.fields.brandId) && <option value={input.fields.brandId} disabled>已选品牌未在当前候选中 · 请刷新核对</option>}{options?.brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem>
          <FormItem label="客户业务员"><select className="qc-control" value={input.fields.salespersonId ?? ""} onChange={event => field("salespersonId", event.target.value || null)}><option value="">待填写</option>{input.fields.salespersonId && !options?.salespeople.some(item => item.id === input.fields.salespersonId) && <option value={input.fields.salespersonId} disabled>已选业务员未在当前候选中 · 请刷新核对</option>}{options?.salespeople.filter(item => item.brandId === input.fields.brandId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormItem>
          <FormItem label="款号"><input className="qc-control" value={input.fields.styleNo} maxLength={200} onChange={event => field("styleNo", event.target.value)} /></FormItem>
          <FormItem label="款式名称"><input className="qc-control" value={input.fields.styleName} maxLength={200} onChange={event => field("styleName", event.target.value)} /></FormItem>
          <FormItem label="数量"><input className="qc-control" inputMode="decimal" value={input.fields.quantity ?? ""} placeholder="待填写；0 是明确的零" onChange={event => field("quantity", event.target.value || null)} /></FormItem>
          <FormItem label="成衣交期"><input className="qc-control" type="date" value={input.fields.garmentLeadDate ?? ""} onChange={event => field("garmentLeadDate", event.target.value || null)} /></FormItem>
          <FormItem label="备注"><textarea className="qc-control" value={input.fields.note} maxLength={2000} onChange={event => field("note", event.target.value)} /></FormItem>
          <p>{input.quoteType === "processing" ? "加工报价" : "经销报价"} · {input.selection.country || "制作国家待设置"} · {options?.presets.find(item => item.id === input.selection.presetId)?.name ?? "无预设"}</p>
          {preview && <div role="status" data-creation-preview><strong>{preview.configuration.status === "configured" ? "制作参数已配置" : "制作参数待完善"}</strong>{p ? <p>币种 {p.laborCurrency} · 汇率 {p.usdCnyRate ?? "待设置"} · 加成 {p.markupRate ?? "待设置"} · {p.includeFreight ? `运费 ${p.freightName} ${p.freightAmount ?? "待设置"}` : input.selection.presetId ? "预设不含运费" : "运费策略待设置"}</p> : <p>无报价成本/设置查看权限；不返回受保护参数数值。</p>}<p>{preview.configuration.sources.map(item => `${fieldNames[item.field] ?? item.field}：${sourceNames[item.source]}`).join(" · ")}</p>{preview.missingFields.length > 0 && <p>草稿待完善：{preview.missingFields.join("、")}</p>}</div>}
        </>}
        <FormItem label="查找可用资料"><input className="qc-control" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /><Button variant="text" onClick={() => void refresh(search)}>搜索 / 刷新可用资料</Button></FormItem>
        {options?.truncated && <p>候选已限量，请输入名称搜索；不会加载无限主数据。</p>}
        {missingSelection && <p role="status">候选搜索或状态变化未包含已选资料；输入仍保留，未冒充“未选择”。请刷新核对，最终创建由 Server 重新校验。</p>}
        {session.hasPermission("settings.global.edit") && <a href="/system-settings/quote-settings" target="_blank" rel="noopener noreferrer">在独立页面维护制作预设（返回后主动刷新）</a>}
      </fieldset>
      <footer className="qc-server-create-actions"><Button variant="secondary" disabled={busy || unknown} onClick={() => router.push("/quote-center")}>取消</Button>{step === 2 && <Button variant="secondary" disabled={busy || unknown} onClick={() => { setStep(1); setPreview(null); }}>上一步</Button>}{unknown ? <Button disabled={busy} onClick={() => void reconcile()}>核对创建结果</Button> : step === 1 ? <Button disabled={busy || !options} onClick={() => setStep(2)}>下一步</Button> : preview ? <Button disabled={busy} onClick={() => void create()}>{busy ? "创建中…" : "创建报价"}</Button> : <Button disabled={busy || !options} onClick={() => void review()}>核对制作参数</Button>}</footer>
    </Card>}
  </PageContainer></AppShell>;
}

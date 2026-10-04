"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertBanner,
  AppShell,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  ErrorState,
  FormItem,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
  StatusTag,
} from "@/components/foundation";
import { PermissionAuthorityProvider } from "@/features/permissions";
import { ServerLoginCard, ServerLogoutAction, useServerSession } from "@/features/server-auth";
import type { FabricCostLine, OtherCostLine, PriceVersion, Quote, QuoteRevision, TrimCostLine } from "../model/quote-view-model";
import { QuoteServerError } from "../server/quote-server-client";
import {
  UnsafeServerQuoteDecimalError,
  browserNumberFromExactDecimal,
  quoteServerEditorAdapter,
  type EditableServerQuoteRecord,
} from "../server/quote-server-editor-adapter";

type LosslessNumberInputProps = {
  fieldId: string;
  value: number | null;
  disabled?: boolean;
  onValueChange(value: number | null): void;
  onSafetyChange(fieldId: string, unsafe: boolean): void;
};

function LosslessNumberInput({ fieldId, value, disabled, onValueChange, onSafetyChange }: LosslessNumberInputProps) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value === null ? "" : String(value));
  }, [fieldId, value]);

  return <input
    className="qc-control"
    type="text"
    inputMode="decimal"
    value={draft}
    disabled={disabled}
    onFocus={() => { editing.current = true; }}
    onBlur={() => {
      editing.current = false;
      setDraft(value === null ? "" : String(value));
      onSafetyChange(fieldId, false);
    }}
    onChange={(event) => {
      const next = event.target.value;
      if (!/^-?\d*(?:\.\d*)?$/u.test(next)) return;
      setDraft(next);
      if (next === "") {
        onSafetyChange(fieldId, false);
        onValueChange(null);
        return;
      }
      if (!/^-?\d+(?:\.\d+)?$/u.test(next)) {
        onSafetyChange(fieldId, true);
        return;
      }
      try {
        const exact = browserNumberFromExactDecimal(next, fieldId);
        onSafetyChange(fieldId, false);
        onValueChange(exact);
      } catch {
        onSafetyChange(fieldId, true);
      }
    }}
  />;
}

function WriterFrame({ children, quote, onNavigate }: { children: ReactNode; quote: Quote | null; onNavigate(target: string): void }) {
  return <AppShell
    title={quote?.quoteCode ?? "Server 报价编辑工作区"}
    identityMode="server"
    onRequestNavigation={onNavigate}
    backTarget={{ href: quote ? `/quote-center/server-detail?id=${encodeURIComponent(quote.id)}` : "/quote-center/server-preview", label: "返回 Server 报价只读区" }}
  >
    <PageContainer className="qc-server-writer-page">
      <PageHeader
        eyebrow="Q2B2A · SERVER WRITER TEST WORKSPACE"
        title={quote?.quoteCode ?? "Server 报价编辑工作区"}
        status={<StatusTag tone="warning">Production cutover = NOT ACTIVE</StatusTag>}
        description="Source = PostgreSQL · Identity = Server · Attachments = unavailable · Masters = snapshot-only"
        back={<button type="button" className="qc-server-quote-link qc-server-writer-back" onClick={() => onNavigate(quote ? `/quote-center/server-detail?id=${encodeURIComponent(quote.id)}` : "/quote-center/server-preview")}>← 返回 Server 只读区</button>}
      />
      {children}
    </PageContainer>
  </AppShell>;
}

function currentRevision(quote: Quote): QuoteRevision {
  return quote.revisions.find((revision) => revision.revisionId === quote.defaultRevisionId)
    ?? quote.revisions.find((revision) => revision.revisionId === quote.currentRevisionId)
    ?? quote.revisions[quote.revisions.length - 1];
}

function cloneQuote(quote: Quote): Quote {
  return structuredClone(quote);
}

function isDirty(record: EditableServerQuoteRecord | null, baseline: Quote | null): boolean {
  return Boolean(record && baseline && JSON.stringify(record.quote) !== JSON.stringify(baseline));
}

type NumberFieldProps = Omit<LosslessNumberInputProps, "onSafetyChange">;

function FabricRows({ scope, rows, disabled, update, numberField }: { scope: string; rows: FabricCostLine[]; disabled: boolean; update(id: string, transform: (row: FabricCostLine) => FabricCostLine): void; numberField(props: NumberFieldProps): ReactNode }) {
  if (!rows.length) return <EmptyState compact title="无面料成本行" />;
  return <div className="qc-server-writer-rows">{rows.map((row) => <article key={row.id}>
    <header><strong>{row.name || "未命名面料"}</strong><code>{row.id}</code></header>
    <div className="qc-server-writer-grid">
      <FormItem label="名称"><input className="qc-control" value={row.name} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, name: event.target.value }))} /></FormItem>
      <FormItem label="成分"><input className="qc-control" value={row.composition} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, composition: event.target.value }))} /></FormItem>
      <FormItem label="供应商"><input className="qc-control" value={row.supplier} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, supplier: event.target.value }))} /></FormItem>
      <FormItem label="采购单位"><select className="qc-control" value={row.purchaseUnit} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, purchaseUnit: event.target.value as FabricCostLine["purchaseUnit"] }))}><option value="kg">kg</option><option value="meter">meter</option></select></FormItem>
      <FormItem label="段长 cm">{numberField({ fieldId: `${scope}.${row.id}.segmentLengthCm`, value: row.segmentLengthCm, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, segmentLengthCm: value })) })}</FormItem>
      <FormItem label="净门幅 cm">{numberField({ fieldId: `${scope}.${row.id}.netWidthCm`, value: row.netWidthCm, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, netWidthCm: value })) })}</FormItem>
      <FormItem label="克重 gsm">{numberField({ fieldId: `${scope}.${row.id}.gsm`, value: row.gsm, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, gsm: value })) })}</FormItem>
      <FormItem label="损耗率">{numberField({ fieldId: `${scope}.${row.id}.lossRate`, value: row.lossRate, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, lossRate: value })) })}</FormItem>
      <FormItem label="单价">{numberField({ fieldId: `${scope}.${row.id}.unitPrice`, value: row.unitPrice, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, unitPrice: value })) })}</FormItem>
    </div>
    <small>Library reference：{row.sourceLibraryItemId ?? "null"}（snapshot-only，不解析 Browser master）</small>
  </article>)}</div>;
}

function TrimRows({ scope, rows, disabled, update, numberField }: { scope: string; rows: TrimCostLine[]; disabled: boolean; update(id: string, transform: (row: TrimCostLine) => TrimCostLine): void; numberField(props: NumberFieldProps): ReactNode }) {
  if (!rows.length) return <EmptyState compact title="无辅料成本行" />;
  return <div className="qc-server-writer-rows">{rows.map((row) => <article key={row.id}>
    <header><strong>{row.name || "未命名辅料"}</strong><code>{row.id}</code></header>
    <div className="qc-server-writer-grid">
      <FormItem label="名称"><input className="qc-control" value={row.name} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, name: event.target.value }))} /></FormItem>
      <FormItem label="规格"><input className="qc-control" value={row.specification} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, specification: event.target.value }))} /></FormItem>
      <FormItem label="单位"><input className="qc-control" value={row.unit} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, unit: event.target.value }))} /></FormItem>
      <FormItem label="供应商"><input className="qc-control" value={row.supplier} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, supplier: event.target.value }))} /></FormItem>
      <FormItem label="用量">{numberField({ fieldId: `${scope}.${row.id}.usage`, value: row.usage, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, usage: value })) })}</FormItem>
      <FormItem label="损耗率">{numberField({ fieldId: `${scope}.${row.id}.lossRate`, value: row.lossRate, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, lossRate: value })) })}</FormItem>
      <FormItem label="单价">{numberField({ fieldId: `${scope}.${row.id}.unitPrice`, value: row.unitPrice, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, unitPrice: value })) })}</FormItem>
    </div>
    <small>Library reference：{row.sourceLibraryItemId ?? "null"}（snapshot-only，不解析 Browser master）</small>
  </article>)}</div>;
}

function OtherCostRows({ scope, rows, disabled, update, numberField }: { scope: string; rows: OtherCostLine[]; disabled: boolean; update(id: string, transform: (row: OtherCostLine) => OtherCostLine): void; numberField(props: NumberFieldProps): ReactNode }) {
  if (!rows.length) return <EmptyState compact title="无其他成本行" />;
  return <div className="qc-server-writer-rows">{rows.map((row) => <article key={row.id}>
    <header><strong>{row.name || "未命名费用"}</strong><code>{row.id}</code></header>
    <div className="qc-server-writer-grid">
      <FormItem label="名称"><input className="qc-control" value={row.name} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, name: event.target.value }))} /></FormItem>
      <FormItem label="说明"><input className="qc-control" value={row.specification} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, specification: event.target.value }))} /></FormItem>
      <FormItem label="单位"><input className="qc-control" value={row.unit} disabled={disabled} onChange={(event) => update(row.id, (item) => ({ ...item, unit: event.target.value }))} /></FormItem>
      <FormItem label="金额">{numberField({ fieldId: `${scope}.${row.id}.amount`, value: row.amount, disabled, onValueChange: (value) => update(row.id, (item) => ({ ...item, amount: value })) })}</FormItem>
    </div>
  </article>)}</div>;
}

function ServerQuoteWriterWorkspace() {
  const router = useRouter();
  const quoteId = useSearchParams().get("id")?.normalize("NFKC").trim() ?? "";
  const serverSession = useServerSession();
  const [record, setRecord] = useState<EditableServerQuoteRecord | null>(null);
  const [baseline, setBaseline] = useState<Quote | null>(null);
  const [activePriceVersionId, setActivePriceVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [unsafeAggregate, setUnsafeAggregate] = useState<UnsafeServerQuoteDecimalError | null>(null);
  const [unsafeDraftFields, setUnsafeDraftFields] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const dirty = isDirty(record, baseline);
  const quote = record?.quote ?? null;
  const revision = quote ? currentRevision(quote) : null;
  const activeVersion = revision?.priceVersions.find((version) => version.id === activePriceVersionId) ?? revision?.priceVersions[0] ?? null;
  const canEdit = serverSession.status === "authenticated" && serverSession.hasPermission("quote.edit");
  const canEditCost = canEdit && serverSession.hasPermission("quote.cost.edit");
  const canEditSettings = canEdit && serverSession.hasPermission("quote.settings.edit");

  const load = useCallback(async () => {
    if (serverSession.status !== "authenticated" || !serverSession.hasPermission("quote.view")) return;
    if (!quoteId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    setPermissionDenied(false);
    setUnsafeAggregate(null);
    try {
      const next = await quoteServerEditorAdapter.load(quoteId);
      setRecord(next);
      setBaseline(cloneQuote(next.quote));
      setActivePriceVersionId(currentRevision(next.quote).priceVersions[0]?.id ?? "");
      setUnsafeDraftFields(new Set());
      setConflict(false);
      setSaveError(null);
      setSaveMessage(null);
      setSessionExpired(false);
    } catch (nextError) {
      if (nextError instanceof UnsafeServerQuoteDecimalError) {
        setUnsafeAggregate(nextError);
      } else if (nextError instanceof QuoteServerError && nextError.status === 401) {
        serverSession.invalidate();
      } else if (nextError instanceof QuoteServerError && nextError.status === 403) {
        setPermissionDenied(true);
      } else if (nextError instanceof QuoteServerError && nextError.status === 404) {
        setNotFound(true);
      } else {
        setError(nextError instanceof QuoteServerError ? `${nextError.code}（HTTP ${nextError.status}）` : "Quote Server 读取失败，请稍后重试。");
      }
    } finally {
      setLoading(false);
    }
  }, [quoteId, serverSession]);

  useEffect(() => {
    if (serverSession.status === "authenticated" && serverSession.hasPermission("quote.view") && !record && !unsafeAggregate) {
      void Promise.resolve().then(load);
    }
  }, [load, record, serverSession, unsafeAggregate]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const setUnsafeField = useCallback((fieldId: string, unsafe: boolean) => {
    setUnsafeDraftFields((current) => {
      const next = new Set(current);
      if (unsafe) next.add(fieldId); else next.delete(fieldId);
      return next;
    });
  }, []);

  const updateQuote = (transform: (quote: Quote) => Quote) => {
    setRecord((current) => current ? { ...current, quote: transform(current.quote) } : current);
    setSaveMessage(null);
  };
  const updateRevision = (transform: (revision: QuoteRevision) => QuoteRevision) => updateQuote((current) => ({
    ...current,
    revisions: current.revisions.map((item) => item.revisionId === current.defaultRevisionId ? transform(item) : item),
  }));
  const updatePriceVersion = (id: string, transform: (version: PriceVersion) => PriceVersion) => updateRevision((current) => ({
    ...current,
    priceVersions: current.priceVersions.map((version) => version.id === id ? transform(version) : version),
  }));

  const save = async (navigateAfter?: string) => {
    if (!record || !dirty || conflict || unsafeDraftFields.size > 0 || !canEdit) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const saved = await quoteServerEditorAdapter.save(record.quote, record.expectedVersion);
      setRecord(saved);
      setBaseline(cloneQuote(saved.quote));
      setActivePriceVersionId((current) => currentRevision(saved.quote).priceVersions.some((version) => version.id === current) ? current : currentRevision(saved.quote).priceVersions[0]?.id ?? "");
      setConflict(false);
      setSessionExpired(false);
      setSaveMessage(`Server 保存成功 · aggregate v${saved.expectedVersion}`);
      if (navigateAfter) router.push(navigateAfter);
    } catch (nextError) {
      if (nextError instanceof QuoteServerError && nextError.status === 401) {
        setSessionExpired(true);
        serverSession.invalidate();
        setSaveError("Server 会话已失效；未清除当前未保存内容。请重新登录后重试保存。");
      } else if (nextError instanceof QuoteServerError && nextError.status === 409 && nextError.code === "quote_version_conflict") {
        setConflict(true);
        setSaveError("Server 版本已变化（409）。未覆盖、未自动重试；请核对后显式重新读取当前版本。");
      } else if (nextError instanceof QuoteServerError && nextError.status === 403) {
        setSaveError("Server 拒绝本次修改（403）。请核对 quote.edit 及本次变更所需的细粒度权限。");
      } else {
        setSaveError(nextError instanceof QuoteServerError ? `${nextError.code}（HTTP ${nextError.status}）；Server 未接受本次保存。` : "Server 保存失败；本地未执行任何 fallback 或 dual write。");
      }
    } finally {
      setSaving(false);
      setPendingNavigation(null);
    }
  };

  const requestNavigation = (target: string) => {
    if (dirty) setPendingNavigation(target);
    else router.push(target);
  };

  const logout = async () => {
    setSessionActionError(null);
    try {
      await serverSession.logout();
      if (!dirty) {
        setRecord(null);
        setBaseline(null);
      }
    } catch {
      setSessionActionError("无法退出 Server 会话，请稍后重试。");
    }
  };

  if (serverSession.status === "checking") return <WriterFrame quote={quote} onNavigate={requestNavigation}><LoadingState label="确认织序 Server 登录状态" /></WriterFrame>;
  if (serverSession.status === "error") return <WriterFrame quote={quote} onNavigate={requestNavigation}><ErrorState title="无法确认 Server 登录状态" description={serverSession.error} onRetry={() => void serverSession.refresh()} /></WriterFrame>;
  if (serverSession.status === "anonymous" && !record) return <WriterFrame quote={null} onNavigate={requestNavigation}><AlertBanner tone="info" title="请登录织序 Server">Writer workspace 只接受 trusted Server identity；Browser 测试账号不能授予编辑权限。</AlertBanner><ServerLoginCard defaultUsername={process.env.NODE_ENV === "development" ? "admin" : ""} description="请登录织序 Server 以加载已有 PostgreSQL Quote。" /></WriterFrame>;
  if (serverSession.status === "authenticated" && (permissionDenied || !serverSession.hasPermission("quote.view"))) return <WriterFrame quote={null} onNavigate={requestNavigation}><ErrorState permission title="Server 权限不足（403）" description="需要 quote.view 才能加载已有 Server Quote。" /></WriterFrame>;
  if (unsafeAggregate) return <WriterFrame quote={null} onNavigate={requestNavigation}><AlertBanner tone="danger" title="此 Quote 不能安全进入 Browser 数字编辑模型">字段 {unsafeAggregate.fieldPath} 的 decimal `{unsafeAggregate.decimalValue}` 无法精确 round-trip。工作区保持只读且不会 PUT；请使用 Server 只读详情核对。</AlertBanner><Link className="qc-server-quote-link" href={`/quote-center/server-detail?id=${encodeURIComponent(quoteId)}`}>打开 Server 只读详情</Link></WriterFrame>;

  const numberField = (props: NumberFieldProps) => <LosslessNumberInput {...props} onSafetyChange={setUnsafeField} />;

  return <WriterFrame quote={quote} onNavigate={requestNavigation}>
    {serverSession.status === "anonymous" && record && <><AlertBanner tone="danger" title="Server 会话已失效">当前未保存内容仍保留在内存，未写入 localStorage。请重新登录后再保存；不要刷新页面。</AlertBanner><ServerLoginCard description="重新登录织序 Server；当前内存中的未保存 Quote 不会被自动替换。" /></>}
    {serverSession.status === "authenticated" && sessionExpired && <AlertBanner tone="warning" title="Server 会话已恢复">未保存内容仍保留；请重新执行保存，Server 会再次验证版本与权限。</AlertBanner>}
    {sessionActionError && <ErrorState title="Server 会话操作失败" description={sessionActionError} />}
    <section className="qc-server-writer-boundary">
      <span>Source <strong>PostgreSQL</strong></span><span>Identity <strong>Server</strong></span><span>Attachments <strong>unavailable</strong></span><span>Masters <strong>snapshot-only</strong></span><span>Cutover <strong>NOT ACTIVE</strong></span>
    </section>
    {loading ? <LoadingState label="加载 Server Quote 编辑快照" />
      : notFound ? <ErrorState title="Server Quote 不存在（404）" description="Quote ID 缺失、不存在或链接无效。" />
        : error ? <ErrorState title="Quote Server 暂时不可用" description={`${error}；没有 Browser fallback。`} onRetry={() => void load()} />
          : quote && revision && activeVersion && record ? <div className="qc-server-writer-stack">
            <AlertBanner tone="info" title={`Server aggregate v${record.expectedVersion}`} actions={<ServerLogoutAction onLogout={() => void logout()} />}>
              只编辑已有 default Revision；Server 负责 optimistic lock、细粒度权限、历史不可变校验、transaction 与可信 OperationLog。
            </AlertBanner>
            {!canEdit && <AlertBanner tone="warning" title="当前账号为只读">加载需要 quote.view；保存还需要 quote.edit，成本/报价设置变更分别需要 quote.cost.edit / quote.settings.edit。</AlertBanner>}
            {unsafeDraftFields.size > 0 && <AlertBanner tone="danger" title="存在不能精确表示的数字输入">{unsafeDraftFields.size} 个输入无法在 decimal string 与 Browser number 间精确 round-trip；保存已禁用。</AlertBanner>}
            {conflict && <AlertBanner tone="danger" title="检测到 optimistic version conflict" actions={<Button variant="secondary" onClick={() => setReloadConfirmOpen(true)}>重新读取 Server 当前版本</Button>}>未自动覆盖、未自动合并、未自动重试，当前 dirty 内容仍保留。</AlertBanner>}
            {saveError && <ErrorState title="Server 保存未完成" description={saveError} />}
            {saveMessage && <AlertBanner tone="info" title={saveMessage}>返回版本完全来自 Server response；前端未自行推算版本号。</AlertBanner>}

            <Card className="qc-server-writer-section">
              <header><div><small>AGGREGATE IDENTITY</small><h2>Server Quote</h2></div><StatusTag tone={dirty ? "warning" : "active"}>{dirty ? "未保存" : "已同步"}</StatusTag></header>
              <DescriptionList columns={3} items={[
                { key: "quoteCode", label: "报价编号", value: quote.quoteCode },
                { key: "quoteId", label: "Quote ID", value: <code>{quote.id}</code> },
                { key: "version", label: "Expected version", value: record.expectedVersion },
                { key: "status", label: "聚合状态", value: quote.aggregateStatus },
                { key: "revision", label: "Default Revision", value: <code>{revision.revisionId}</code>, secondary: revision.revisionLabel },
                { key: "history", label: "历史 Revision", value: `${quote.revisions.filter((item) => item.readOnly).length} 个（只读保留）` },
              ]} />
            </Card>

            <Card className="qc-server-writer-section">
              <header><div><small>CURRENT DEFAULT REVISION</small><h2>基础信息</h2></div><span>brand / salesperson snapshot-only</span></header>
              <DescriptionList columns={2} items={[
                { key: "brand", label: "品牌快照（只读）", value: revision.baseInfo.brandName || "—", secondary: revision.baseInfo.brandId || "ID 未设置" },
                { key: "salesperson", label: "客户业务员快照（只读）", value: revision.baseInfo.salespersonName || "—", secondary: revision.baseInfo.salespersonId || "ID 未设置" },
              ]} />
              <div className="qc-server-writer-grid">
                <FormItem label="报价类型"><select className="qc-control" value={revision.baseInfo.quoteType} disabled={!canEdit} onChange={(event) => updateRevision((item) => ({ ...item, baseInfo: { ...item.baseInfo, quoteType: event.target.value as QuoteRevision["baseInfo"]["quoteType"] } }))}><option value="processing">加工报价</option><option value="distribution">经销报价</option></select></FormItem>
                <FormItem label="款号"><input className="qc-control" value={revision.baseInfo.quoteStyleNo} disabled={!canEdit} onChange={(event) => updateRevision((item) => ({ ...item, baseInfo: { ...item.baseInfo, quoteStyleNo: event.target.value } }))} /></FormItem>
                <FormItem label="款名"><input className="qc-control" value={revision.baseInfo.styleName} disabled={!canEdit} onChange={(event) => updateRevision((item) => ({ ...item, baseInfo: { ...item.baseInfo, styleName: event.target.value } }))} /></FormItem>
                <FormItem label="报价日期"><input className="qc-control" type="date" value={revision.baseInfo.quoteDate ?? ""} disabled={!canEdit} onChange={(event) => updateRevision((item) => ({ ...item, baseInfo: { ...item.baseInfo, quoteDate: event.target.value || null } }))} /></FormItem>
                <FormItem label="面料交期"><input className="qc-control" type="date" value={revision.baseInfo.fabricLeadDate ?? ""} disabled={!canEdit} onChange={(event) => updateRevision((item) => ({ ...item, baseInfo: { ...item.baseInfo, fabricLeadDate: event.target.value || null } }))} /></FormItem>
                <FormItem label="成衣交期"><input className="qc-control" type="date" value={revision.baseInfo.garmentLeadDate ?? ""} disabled={!canEdit} onChange={(event) => updateRevision((item) => ({ ...item, baseInfo: { ...item.baseInfo, garmentLeadDate: event.target.value || null } }))} /></FormItem>
                <FormItem label="基础备注"><textarea className="qc-control" value={revision.baseInfo.note} disabled={!canEdit} onChange={(event) => updateRevision((item) => ({ ...item, baseInfo: { ...item.baseInfo, note: event.target.value } }))} /></FormItem>
                <FormItem label="Revision 备注"><textarea className="qc-control" value={revision.note} disabled={!canEdit} onChange={(event) => updateRevision((item) => ({ ...item, note: event.target.value }))} /></FormItem>
              </div>
            </Card>

            <Card className="qc-server-writer-section">
              <header><div><small>EXISTING PRICE VERSIONS</small><h2>当前价格版本</h2></div><span>不允许新增 / 删除</span></header>
              <div className="qc-server-writer-tabs">{revision.priceVersions.map((version) => <button key={version.id} type="button" className={version.id === activeVersion.id ? "active" : ""} onClick={() => setActivePriceVersionId(version.id)}>{version.name}</button>)}</div>
              <div className="qc-server-writer-grid">
                <FormItem label="名称"><input className="qc-control" value={activeVersion.name} disabled={!canEdit} onChange={(event) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, name: event.target.value }))} /></FormItem>
                <FormItem label="数量">{numberField({ fieldId: `${activeVersion.id}.quantity`, value: activeVersion.quantity, disabled: !canEdit, onValueChange: (value) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, quantity: value })) })}</FormItem>
                <FormItem label="说明"><textarea className="qc-control" value={activeVersion.description} disabled={!canEdit} onChange={(event) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, description: event.target.value }))} /></FormItem>
              </div>
            </Card>

            <Card className="qc-server-writer-section">
              <header><div><small>PRICING PARAMETERS</small><h2>报价设置</h2></div><span>需要 quote.settings.edit</span></header>
              <DescriptionList columns={2} items={[
                { key: "country", label: "制作国家快照（只读）", value: activeVersion.pricingParameters.manufacturingCountry || "—" },
                { key: "preset", label: "制作预设快照（只读）", value: activeVersion.pricingParameters.manufacturingPresetName || "—", secondary: activeVersion.pricingParameters.manufacturingPresetId ?? "ID = null" },
              ]} />
              <div className="qc-server-writer-grid">
                <FormItem label="工价币种"><select className="qc-control" value={activeVersion.pricingParameters.laborCurrency} disabled={!canEditSettings} onChange={(event) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, pricingParameters: { ...version.pricingParameters, laborCurrency: event.target.value as PriceVersion["pricingParameters"]["laborCurrency"] } }))}><option value="CNY">CNY</option><option value="USD">USD</option></select></FormItem>
                <FormItem label="USD/CNY 汇率">{numberField({ fieldId: `${activeVersion.id}.usdCnyRate`, value: activeVersion.pricingParameters.usdCnyRate, disabled: !canEditSettings, onValueChange: (value) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, pricingParameters: { ...version.pricingParameters, usdCnyRate: value } })) })}</FormItem>
                <FormItem label="加价率">{numberField({ fieldId: `${activeVersion.id}.markupRate`, value: activeVersion.pricingParameters.markupRate, disabled: !canEditSettings, onValueChange: (value) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, pricingParameters: { ...version.pricingParameters, markupRate: value } })) })}</FormItem>
                <FormItem label="运费名称"><input className="qc-control" value={activeVersion.pricingParameters.freightName} disabled={!canEditSettings} onChange={(event) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, pricingParameters: { ...version.pricingParameters, freightName: event.target.value } }))} /></FormItem>
                <FormItem label="运费金额">{numberField({ fieldId: `${activeVersion.id}.freightAmount`, value: activeVersion.pricingParameters.freightAmount, disabled: !canEditSettings, onValueChange: (value) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, pricingParameters: { ...version.pricingParameters, freightAmount: value } })) })}</FormItem>
                <FormItem label="包含运费"><label className="qc-server-writer-check"><input type="checkbox" checked={activeVersion.pricingParameters.includeFreight} disabled={!canEditSettings} onChange={(event) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, pricingParameters: { ...version.pricingParameters, includeFreight: event.target.checked } }))} />是</label></FormItem>
              </div>
            </Card>

            <Card className="qc-server-writer-section">
              <header><div><small>COST SNAPSHOT</small><h2>工价与既有成本行</h2></div><span>需要 quote.cost.edit · 不新增/删除行</span></header>
              <div className="qc-server-writer-grid">
                <FormItem label="工价">{numberField({ fieldId: `${activeVersion.id}.labor.value`, value: activeVersion.labor.value, disabled: !canEditCost, onValueChange: (value) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, labor: { ...version.labor, value } })) })}</FormItem>
                <FormItem label="工价说明"><input className="qc-control" value={activeVersion.labor.description} disabled={!canEditCost} onChange={(event) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, labor: { ...version.labor, description: event.target.value } }))} /></FormItem>
              </div>
              <h3>面料</h3><FabricRows scope={activeVersion.id} rows={activeVersion.fabrics} disabled={!canEditCost} numberField={numberField} update={(id, transform) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, fabrics: version.fabrics.map((row) => row.id === id ? transform(row) : row) }))} />
              <h3>辅料</h3><TrimRows scope={activeVersion.id} rows={activeVersion.trims} disabled={!canEditCost} numberField={numberField} update={(id, transform) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, trims: version.trims.map((row) => row.id === id ? transform(row) : row) }))} />
              <h3>其他费用</h3><OtherCostRows scope={activeVersion.id} rows={activeVersion.otherCosts} disabled={!canEditCost} numberField={numberField} update={(id, transform) => updatePriceVersion(activeVersion.id, (version) => ({ ...version, otherCosts: version.otherCosts.map((row) => row.id === id ? transform(row) : row) }))} />
            </Card>

            <Card className="qc-server-writer-section qc-server-writer-deferred">
              <header><div><small>INTENTIONALLY DEFERRED</small><h2>未接入动作</h2></div><span>Q2B2A safety boundary</span></header>
              <ul><li>附件：Server 附件将在 Q4 接入；现有引用原样保留。</li><li>品牌/业务员/面辅料 master：只显示 snapshot，不加载 Browser Basic Settings。</li><li>删除、导出、生成订单、新建 Quote：不可用。</li><li>Revision / Estimate / PriceVersion destructive actions：不可用。</li><li>客户确认 mutation：不可用；C4.2 current terms 仍是唯一共享 current authority。</li></ul>
            </Card>

            <div className="qc-server-writer-savebar">
              <span>{dirty ? "有未保存修改" : "已与 Server baseline 同步"} · expectedVersion {record.expectedVersion}</span>
              <Button permission="quote.edit" disabled={!dirty || saving || conflict || unsafeDraftFields.size > 0 || serverSession.status !== "authenticated"} onClick={() => void save()}>{saving ? "保存中…" : "保存到 Server"}</Button>
            </div>
          </div> : <EmptyState title="未加载 Server Quote 编辑快照" />}

    <Modal open={Boolean(pendingNavigation)} title="有未保存的 Server Quote 修改" description="离开不会写入 Browser localStorage；请选择继续编辑、放弃，或先执行一次 Server PUT。" onClose={() => setPendingNavigation(null)} footer={<><Button variant="secondary" onClick={() => setPendingNavigation(null)}>继续编辑</Button><Button variant="danger" onClick={() => { const target = pendingNavigation; setPendingNavigation(null); if (target) router.push(target); }}>放弃修改并离开</Button><Button permission="quote.edit" disabled={saving || conflict || unsafeDraftFields.size > 0} onClick={() => { if (pendingNavigation) void save(pendingNavigation); }}>保存并离开</Button></>}><p className="qc-unsaved-message">保存失败、401 或 409 时保持当前页面和 dirty 内容，不会自动 fallback。</p></Modal>
    <Modal open={reloadConfirmOpen} title="重新读取 Server 当前版本？" description="这会明确放弃当前内存中的未保存修改；不会删除任何 Server 或 Browser 数据。" onClose={() => setReloadConfirmOpen(false)} footer={<><Button variant="secondary" onClick={() => setReloadConfirmOpen(false)}>取消</Button><Button variant="danger" onClick={() => { setReloadConfirmOpen(false); setRecord(null); setBaseline(null); setUnsafeAggregate(null); setConflict(false); void load(); }}>确认放弃并重新读取</Button></>}><p className="qc-unsaved-message">系统不会自动合并或重试 PUT。</p></Modal>
  </WriterFrame>;
}

export function ServerQuoteWriterPage() {
  const serverSession = useServerSession();
  return <PermissionAuthorityProvider can={serverSession.hasPermission}><ServerQuoteWriterWorkspace /></PermissionAuthorityProvider>;
}

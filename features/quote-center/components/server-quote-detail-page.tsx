"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertBanner,
  AppShell,
  Card,
  DescriptionList,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  StatusTag,
} from "@/components/foundation";
import { ServerLoginCard, ServerLogoutAction, useServerSession } from "@/features/server-auth";
import type { QuoteRecord, ServerQuote } from "../../../server/quotes/model";
import { quoteServerRepository } from "../server/quote-server-repository";
import { classifyQuoteServerReadFailure, displayServerDecimal, quoteServerReadErrorLabel } from "../server/quote-server-read-model";

type Revision = ServerQuote["revisions"][number];
type PriceVersion = Revision["priceVersions"][number];
type Estimate = NonNullable<ServerQuote["activeEstimateCost"]>;

function ServerQuoteDetailFrame({ quote, children }: { quote: QuoteRecord | null; children: ReactNode }) {
  return (
    <AppShell title={quote?.quote.quoteCode ?? "Server 报价详情"} identityMode="server" backTarget={{ href: "/quote-center/server-preview", label: "返回 Server 报价预览" }}>
      <PageContainer className="qc-server-quote-page">
        <PageHeader
          eyebrow="Q2B1 · SERVER AGGREGATE"
          title={quote?.quote.quoteCode ?? "Server 报价详情"}
          status={quote ? <StatusTag tone="active">只读</StatusTag> : undefined}
          description="完整聚合来自 Quote Server；所有历史数值按存储值展示，不重新计算。"
          back={<Link className="qc-server-quote-link" href="/quote-center/server-preview">← 返回只读预览</Link>}
        />
        {children}
      </PageContainer>
    </AppShell>
  );
}

function DecimalValue({ value }: { value: string | null }) {
  return <code className={value === null ? "is-null" : ""}>{displayServerDecimal(value)}</code>;
}

function CostTable({ title, rows, kind }: { title: string; rows: PriceVersion["fabrics"] | PriceVersion["trims"] | PriceVersion["otherCosts"]; kind: "fabric" | "trim" | "other" }) {
  if (rows.length === 0) return <EmptyState compact title={`${title}为空`} />;
  return (
    <section className="qc-server-quote-subsection">
      <h4>{title}</h4>
      <div className="qc-server-quote-table-wrap"><table>
        <thead><tr><th>行 ID</th><th>名称</th><th>{kind === "fabric" ? "面料参数" : "用量"}</th><th>损耗率</th><th>单价</th>{kind === "other" && <th>金额</th>}</tr></thead>
        <tbody>{rows.map((row) => {
          const usage = "usage" in row ? row.usage : null;
          const fabricParameters = "segmentLengthCm" in row
            ? <>段长 <DecimalValue value={row.segmentLengthCm} /> · 净幅 <DecimalValue value={row.netWidthCm} /> · 克重 <DecimalValue value={row.gsm} /></>
            : null;
          return <tr key={row.id}>
            <td><code>{row.id}</code></td><td>{row.name}</td>
            <td>{fabricParameters ?? <DecimalValue value={usage} />}</td><td><DecimalValue value={row.lossRate} /></td><td><DecimalValue value={row.unitPrice} /></td>
            {kind === "other" && <td><DecimalValue value={(row as PriceVersion["otherCosts"][number]).amount} /></td>}
          </tr>;
        })}</tbody>
      </table></div>
    </section>
  );
}

function PriceVersionCard({ version }: { version: PriceVersion }) {
  const parameters = version.pricingParameters;
  return (
    <Card className="qc-server-quote-version">
      <header><div><small>PRICE VERSION</small><h3>{version.name}</h3></div><code>{version.id}</code></header>
      <DescriptionList columns={3} items={[
        { key: "quantity", label: "数量", value: <DecimalValue value={version.quantity} /> },
        { key: "country", label: "生产国家", value: parameters.manufacturingCountry || "未设置" },
        { key: "preset", label: "生产预设快照", value: parameters.manufacturingPresetName || "未设置", secondary: parameters.manufacturingPresetId ?? "ID = null" },
        { key: "currency", label: "工价币种", value: parameters.laborCurrency },
        { key: "labor", label: "工价", value: <DecimalValue value={version.labor.value} />, secondary: version.labor.description || undefined },
        { key: "rate", label: "USD/CNY 汇率", value: <DecimalValue value={parameters.usdCnyRate} /> },
        { key: "markup", label: "加价率", value: <DecimalValue value={parameters.markupRate} /> },
        { key: "freight", label: "运费设置", value: parameters.includeFreight ? parameters.freightName || "包含运费" : "不包含运费", secondary: <DecimalValue value={parameters.freightAmount} /> },
        { key: "description", label: "说明", value: version.description || "—" },
      ]} />
      <CostTable title="面料快照" rows={version.fabrics} kind="fabric" />
      <CostTable title="辅料快照" rows={version.trims} kind="trim" />
      <CostTable title="其他成本快照" rows={version.otherCosts} kind="other" />
      <section className="qc-server-quote-confirmation">
        <h4>历史确认快照</h4>
        {version.confirmation ? <DescriptionList columns={2} items={[
          { key: "quotedGarment", label: "报价成衣价", value: <DecimalValue value={version.confirmation.quotedGarmentPrice} /> },
          { key: "confirmedGarment", label: "历史确认成衣价", value: <DecimalValue value={version.confirmation.confirmedGarmentPrice} /> },
          { key: "quotedLabor", label: "报价工价", value: <DecimalValue value={version.confirmation.quotedLaborPrice} /> },
          { key: "confirmedLabor", label: "历史确认工价", value: <DecimalValue value={version.confirmation.confirmedLaborPrice} /> },
          { key: "confirmedAt", label: "确认时间", value: version.confirmation.confirmedAt ?? "未记录（null）" },
          { key: "note", label: "确认备注", value: version.confirmation.note || "—" },
        ]} /> : <p>无历史确认快照（null）。</p>}
        <small>C4.2 ConfirmedCommercialTerms 是独立的当前共享业务事实；本页只展示 Quote 聚合内的历史快照，不读取或修改 current terms。</small>
      </section>
    </Card>
  );
}

function EstimateSummary({ estimate }: { estimate: Estimate }) {
  return <DescriptionList columns={3} items={[
    { key: "id", label: "Estimate ID", value: <code>{estimate.id}</code> },
    { key: "revision", label: "基于 Revision", value: <code>{estimate.basedOnRevisionId}</code> },
    { key: "version", label: "来源 PriceVersion", value: <code>{estimate.sourcePriceVersionId}</code> },
    { key: "generatedAt", label: "生成时间", value: estimate.generatedAt },
    { key: "generatedBy", label: "生成人", value: estimate.generatedBy },
    { key: "ignored", label: "忽略于 Revision", value: estimate.ignoredForRevisionId ?? "未忽略（null）" },
  ]} />;
}

export function ServerQuoteDetailPage() {
  const quoteId = useSearchParams().get("id")?.normalize("NFKC").trim() ?? "";
  const serverSession = useServerSession();
  const [record, setRecord] = useState<QuoteRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);

  const loadQuote = useCallback(async () => {
    if (serverSession.status !== "authenticated" || !serverSession.hasPermission("quote.view")) return;
    if (!quoteId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setRecord(null);
    setPermissionDenied(false);
    setNotFound(false);
    setError(null);
    try {
      setRecord(await quoteServerRepository.getById(quoteId));
    } catch (nextError) {
      const failure = classifyQuoteServerReadFailure(nextError);
      if (failure === "unauthorized") {
        setSessionExpired(true);
        serverSession.invalidate();
      } else if (failure === "forbidden") {
        setPermissionDenied(true);
      } else if (failure === "not-found") {
        setNotFound(true);
      } else {
        setError(quoteServerReadErrorLabel(nextError));
      }
    } finally {
      setLoading(false);
    }
  }, [quoteId, serverSession]);

  useEffect(() => {
    if (serverSession.status === "authenticated" && serverSession.hasPermission("quote.view")) {
      void Promise.resolve().then(loadQuote);
    }
  }, [loadQuote, serverSession]);

  const logout = async () => {
    setSessionActionError(null);
    try {
      await serverSession.logout();
      setRecord(null);
    } catch {
      setSessionActionError("无法退出 Server 会话，请稍后重试。");
    }
  };

  if (serverSession.status === "checking") return <ServerQuoteDetailFrame quote={null}><LoadingState label="确认织序 Server 登录状态" /></ServerQuoteDetailFrame>;
  if (serverSession.status === "error") return <ServerQuoteDetailFrame quote={null}><ErrorState title="无法确认 Server 登录状态" description={serverSession.error} onRetry={() => void serverSession.refresh()} /></ServerQuoteDetailFrame>;
  if (serverSession.status === "anonymous") return (
    <ServerQuoteDetailFrame quote={null}>
      <AlertBanner tone="info" title={sessionExpired ? "Server 会话已失效，请重新登录" : "登录后查看 Server Quote 详情"}>详情只使用可信 Server session；不会读取或回退到 Browser 报价。</AlertBanner>
      <ServerLoginCard defaultUsername={process.env.NODE_ENV === "development" ? "admin" : ""} description="请登录织序 Server 以读取 PostgreSQL Quote 详情。" />
    </ServerQuoteDetailFrame>
  );

  const trustedIdentity = `${serverSession.user.name}（${serverSession.user.username}）`;
  if (permissionDenied || !serverSession.hasPermission("quote.view")) return (
    <ServerQuoteDetailFrame quote={null}>
      <AlertBanner tone="warning" title="当前 Server 账号没有报价查看权限" actions={<ServerLogoutAction variant="secondary" onLogout={() => void logout()} />}>已登录为 {trustedIdentity}；读取详情需要 quote.view。</AlertBanner>
      {sessionActionError && <ErrorState description={sessionActionError} />}
      <ErrorState permission title="Server 权限不足（403）" description="请联系管理员分配 quote.view 权限。" />
    </ServerQuoteDetailFrame>
  );

  const quote = record?.quote;
  const revision = quote?.revisions.find((item) => item.revisionId === quote.defaultRevisionId)
    ?? quote?.revisions.find((item) => item.revisionId === quote.currentRevisionId)
    ?? quote?.revisions[quote.revisions.length - 1];
  const attachmentCount = revision ? revision.imageAttachmentIds.length + revision.fileAttachmentIds.length + (revision.garmentMedia?.length ?? 0) + (revision.quoteDocuments?.length ?? 0) : 0;

  return (
    <ServerQuoteDetailFrame quote={record}>
      <AlertBanner tone="info" title="Read only · source = PostgreSQL" actions={<><Link className="qc-server-quote-link" href={`/quote-center/server-edit?id=${encodeURIComponent(quoteId)}`}>打开 Server 编辑工作区</Link><ServerLogoutAction onLogout={() => void logout()} /></>}>Server identity：{trustedIdentity}。本页没有 Quote POST、PUT 或 DELETE；编辑入口仍是隔离测试工作区。</AlertBanner>
      {sessionActionError && <ErrorState description={sessionActionError} />}
      {loading ? <LoadingState label="读取完整 Server Quote 聚合" />
        : notFound ? <ErrorState title="Server Quote 不存在（404）" description="Quote ID 缺失、不存在或链接无效。" />
          : error ? <ErrorState title="Quote Server 暂时不可用" description={`${error}；未回退到 Browser 报价。`} onRetry={() => void loadQuote()} />
            : quote && revision && record ? <div className="qc-server-quote-detail">
              <Card className="qc-server-quote-section">
                <header><div><small>QUOTE IDENTITY</small><h2>报价聚合</h2></div><StatusTag tone="neutral">v{record.version}</StatusTag></header>
                <DescriptionList columns={3} items={[
                  { key: "code", label: "报价编号", value: quote.quoteCode },
                  { key: "id", label: "Quote ID", value: <code>{quote.id}</code> },
                  { key: "status", label: "聚合状态", value: quote.aggregateStatus },
                  { key: "version", label: "乐观锁版本", value: record.version },
                  { key: "default", label: "默认 Revision", value: <code>{quote.defaultRevisionId}</code> },
                  { key: "deleted", label: "删除时间", value: quote.deletedAt ?? "未删除（null）" },
                ]} />
              </Card>

              <Card className="qc-server-quote-section">
                <header><div><small>DEFAULT REVISION</small><h2>{revision.revisionLabel}</h2></div><StatusTag tone={revision.readOnly ? "warning" : "active"}>{revision.readOnly ? "历史只读" : "当前默认"}</StatusTag></header>
                <DescriptionList columns={3} items={[
                  { key: "revisionId", label: "Revision ID", value: <code>{revision.revisionId}</code> },
                  { key: "label", label: "Revision 标签", value: revision.revisionLabel },
                  { key: "reason", label: "Revision 原因", value: revision.reason },
                  { key: "type", label: "报价类型", value: revision.baseInfo.quoteType },
                  { key: "brand", label: "品牌快照", value: revision.baseInfo.brandName || "—", secondary: revision.baseInfo.brandId || "ID 未设置" },
                  { key: "salesperson", label: "客户业务员快照", value: revision.baseInfo.salespersonName || "—", secondary: revision.baseInfo.salespersonId || "ID 未设置" },
                  { key: "styleNo", label: "款号", value: revision.baseInfo.quoteStyleNo || "—" },
                  { key: "styleName", label: "款名", value: revision.baseInfo.styleName || "—" },
                  { key: "quoteDate", label: "报价日期", value: revision.baseInfo.quoteDate ?? "未填写（null）" },
                  { key: "fabricLead", label: "面料交期", value: revision.baseInfo.fabricLeadDate ?? "未填写（null）" },
                  { key: "garmentLead", label: "成衣交期", value: revision.baseInfo.garmentLeadDate ?? "未填写（null）" },
                  { key: "baseNote", label: "基础信息备注", value: revision.baseInfo.note || "—" },
                  { key: "created", label: "创建信息", value: revision.createdAt, secondary: revision.createdBy },
                ]} />
              </Card>

              <section className="qc-server-quote-version-list">
                <header><div><small>PRICE VERSIONS</small><h2>价格版本快照</h2></div><span>{revision.priceVersions.length} 个</span></header>
                {revision.priceVersions.map((version) => <PriceVersionCard key={version.id} version={version} />)}
              </section>

              <Card className="qc-server-quote-section">
                <header><div><small>REVISION HISTORY</small><h2>Revision 历史</h2></div><span>{quote.revisions.length} 个</span></header>
                <div className="qc-server-quote-table-wrap"><table><thead><tr><th>Revision ID</th><th>标签</th><th>原因</th><th>状态</th></tr></thead><tbody>{quote.revisions.map((item) => <tr key={item.revisionId}><td><code>{item.revisionId}</code></td><td>{item.revisionLabel}</td><td>{item.reason}</td><td>{item.readOnly ? "历史只读" : item.revisionId === quote.defaultRevisionId ? "当前默认" : "非默认"}</td></tr>)}</tbody></table></div>
                <small>历史 Revision 在 Server domain 中不可变；本页不提供任何编辑入口。</small>
              </Card>

              <Card className="qc-server-quote-section">
                <header><div><small>ESTIMATE COST</small><h2>估算成本</h2></div><span>历史 {quote.estimateCostHistory.length} 个</span></header>
                {quote.activeEstimateCost ? <EstimateSummary estimate={quote.activeEstimateCost} /> : <EmptyState compact title="当前无 active Estimate（null）" />}
                {quote.estimateCostHistory.length > 0 && <div className="qc-server-quote-history-ids"><strong>历史 Estimate IDs</strong>{quote.estimateCostHistory.map((estimate) => <code key={estimate.id}>{estimate.id}</code>)}</div>}
              </Card>

              <Card className="qc-server-quote-section">
                <header><div><small>ATTACHMENT BOUNDARY</small><h2>附件引用</h2></div><span>{attachmentCount} 个引用</span></header>
                <p>Server attachment binary 尚未迁移。本页不会通过 Browser IndexedDB 解析或加载这些引用。</p>
              </Card>
            </div> : <EmptyState title="未读取到 Server Quote 详情" />}
    </ServerQuoteDetailFrame>
  );
}

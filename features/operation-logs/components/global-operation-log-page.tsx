"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Button, Card, Modal, PageContainer, PageHeader } from "@/components/foundation";
import { PermissionGuard } from "@/features/permissions";
import { getDefaultRevision, type Quote } from "@/features/quote-center/model/quote-view-model";
import { mockQuoteRepository } from "@/features/quote-center/repository/mock-quote-repository";
import type { OperationLog, OperationLogData } from "../model/operation-log";
import { operationLogRepository } from "../repository/operation-log-repository";

const formatTime = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date(iso)).replaceAll("/", "-");

const formatValue = (value: string | number | null | undefined) => value === null || value === undefined || value === ""
  ? "—"
  : typeof value === "number" ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value) : value;

const moduleLabel = (log: OperationLog) => {
  if (log.module === "模板设置") return "模板";
  if (log.module === "权限管理") return "权限";
  if (log.entityType === "Export") return "导出";
  if (log.entityType === "EstimateCost") return "估算成本";
  if (log.entityType === "Attachment") return "附件";
  if (["FabricCostLine", "TrimCostLine", "LaborCost", "OtherCostLine"].includes(log.entityType)) return "成本";
  if (log.entityType === "QuoteRevision") return "报价版本";
  if (log.entityType === "PriceVersion") return log.action === "确认报价" ? "客户确认" : "价格版本";
  return "报价";
};

const contextText = (data: OperationLogData | null) => data
  ? [data.revisionLabel, data.priceVersionName, data.rowName].filter(Boolean).join(" · ")
  : "";

function ChangeGrid({ log }: { log: OperationLog }) {
  const before = log.beforeData?.values ?? {};
  const after = log.afterData?.values ?? {};
  const labels = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  if (!labels.length && (log.beforeData?.attachmentId !== undefined || log.afterData?.attachmentId !== undefined)) {
    return <div className="qc-audit-change-row"><strong>附件</strong><span>{formatValue(log.beforeData?.attachmentId)}</span><i>→</i><b>{formatValue(log.afterData?.attachmentId)}</b></div>;
  }
  if (!labels.length) return <p className="qc-audit-no-change">该操作没有结构化字段差异。</p>;
  return <div className="qc-audit-change-grid">{labels.map((label) => <div className="qc-audit-change-row" key={label}>
    <strong>{label}</strong><span>{Object.hasOwn(before, label) ? formatValue(before[label]) : "新增"}</span><i>→</i><b>{Object.hasOwn(after, label) ? formatValue(after[label]) : "已删除"}</b>
  </div>)}</div>;
}

export function GlobalOperationLogPage() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("all");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<OperationLog | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([operationLogRepository.list(), mockQuoteRepository.list()])
      .then(([nextLogs, nextQuotes]) => { if (active) { setLogs(nextLogs); setQuotes(nextQuotes); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const targets = useMemo(() => new Map(quotes.map((quote) => {
    const revision = getDefaultRevision(quote);
    return [quote.id, {
      title: revision.baseInfo.quoteStyleNo.trim() || "未填写款号",
      subtitle: revision.baseInfo.styleName.trim() || "未填写款式名称",
      searchable: [quote.quoteCode, revision.baseInfo.quoteStyleNo, revision.baseInfo.styleName, revision.baseInfo.brandName, revision.baseInfo.salespersonName].join(" "),
    }];
  })), [quotes]);
  const users = useMemo(() => [...new Map(logs.map((log) => [log.userId, log.userName])).entries()], [logs]);
  const modules = useMemo(() => [...new Set(logs.map(moduleLabel))], [logs]);
  const actions = useMemo(() => [...new Set(logs.map((log) => log.action))], [logs]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return logs.filter((log) => {
      const target = log.quoteId ? targets.get(log.quoteId) : undefined;
      const haystack = [log.userName, log.userId, log.action, log.module, moduleLabel(log), log.entityType, target?.title, target?.subtitle, target?.searchable, contextText(log.afterData ?? log.beforeData), JSON.stringify(log.beforeData), JSON.stringify(log.afterData)].join(" ").toLocaleLowerCase();
      const created = new Date(log.createdAt).getTime();
      return (!needle || haystack.includes(needle))
        && (userId === "all" || log.userId === userId)
        && (module === "all" || moduleLabel(log) === module)
        && (action === "all" || log.action === action)
        && created >= fromTime && created <= toTime;
    });
  }, [action, from, logs, module, query, targets, to, userId]);

  return <AppShell title="操作日志"><PageContainer>
    <PageHeader eyebrow="AUDIT LOG" title="操作日志" description="统一查询 Quote Center 已真实发生并成功保存的追加式业务记录。" />
    <PermissionGuard permission="audit_log.view">
      <Card className="qc-audit-filter-card">
        <div className="qc-audit-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索款号、款式、用户、操作或对象" /></div>
        <label><span>开始日期</span><input className="qc-control" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>结束日期</span><input className="qc-control" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label><span>用户</span><select className="qc-control" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="all">全部用户</option>{users.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label><span>模块</span><select className="qc-control" value={module} onChange={(event) => setModule(event.target.value)}><option value="all">全部模块</option>{modules.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>操作类型</span><select className="qc-control" value={action} onChange={(event) => setAction(event.target.value)}><option value="all">全部操作</option>{actions.map((item) => <option key={item}>{item}</option>)}</select></label>
      </Card>
      <Card className="qc-audit-table-card">
        <header><strong>{filtered.length} 条记录</strong><small>日志仅可查看，不提供编辑或删除</small></header>
        {loading ? <div className="qc-operation-log-empty">正在载入操作日志…</div> : <div className="qc-audit-table-wrap"><table><thead><tr><th>时间</th><th>用户</th><th>模块</th><th>操作</th><th>对象</th></tr></thead><tbody>{filtered.map((log) => {
          const target = log.quoteId ? targets.get(log.quoteId) : undefined;
          return <tr key={log.id} tabIndex={0} onClick={() => setSelected(log)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(log); }}><td><time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time></td><td><strong>{log.userName}</strong><small>{log.userId}</small></td><td><span className="qc-audit-module">{moduleLabel(log)}</span></td><td><strong>{log.action}</strong><small>{contextText(log.afterData ?? log.beforeData)}</small></td><td><strong>{target?.title ?? log.entityId}</strong><small>{target?.subtitle ?? log.entityType}</small></td></tr>;
        })}</tbody></table>{!filtered.length && <div className="qc-operation-log-empty"><strong>没有匹配记录</strong><p>调整搜索词或筛选条件后重试。</p></div>}</div>}
      </Card>
      <Modal open={Boolean(selected)} className="qc-audit-detail-modal" title="操作日志详情" description="结构化展示操作上下文与修改前后值。" onClose={() => setSelected(null)} footer={<Button variant="secondary" onClick={() => setSelected(null)}>关闭</Button>}>
        {selected && <><dl className="qc-audit-detail-meta"><div><dt>时间</dt><dd>{formatTime(selected.createdAt)}</dd></div><div><dt>用户</dt><dd>{selected.userName}</dd></div><div><dt>模块</dt><dd>{moduleLabel(selected)}</dd></div><div><dt>操作</dt><dd>{selected.action}</dd></div><div><dt>对象</dt><dd>{(selected.quoteId ? targets.get(selected.quoteId)?.title : undefined) ?? selected.entityId}</dd></div><div><dt>对象类型</dt><dd>{selected.entityType}</dd></div></dl><ChangeGrid log={selected} /></>}
      </Modal>
    </PermissionGuard>
  </PageContainer></AppShell>;
}

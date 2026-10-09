"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Button, Card, DataTable, Drawer, PageContainer, PageHeader, SearchField, StatusTag, Toolbar, type DataColumn } from "@/components/foundation";
import { PermissionGuard } from "@/features/permissions";
import { getDefaultRevision, type Quote } from "@/features/quote-center/model/quote-view-model";
import { mockQuoteRepository } from "@/features/quote-center/repository/mock-quote-repository";
import type { OperationLog } from "../model/operation-log";
import {
  groupOperationLogs,
  operationLogCategory,
  operationLogGroupSearchText,
  operationLogSections,
  type OperationLogGroup,
  type OperationLogQuoteTarget,
} from "../model/operation-log-presentation";
import { operationLogRepository } from "../repository/operation-log-repository";
import { OperationLogGroupList } from "./operation-log-group-list";
import { quoteAuthority } from "@/features/quote-center/authority/quote-authority";
import { ServerGlobalOperationLogPage } from "./server-operation-log-viewer";

const formatTime = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date(iso)).replaceAll("/", "-");

function TechnicalDetails({ group }: { group: OperationLogGroup }) {
  return <div className="qc-audit-technical-list">{group.events.map((log) => <section key={log.id}>
    <header><strong>{log.action}</strong><span>{operationLogCategory(log)}</span></header>
    <dl>
      <div><dt>日志 ID</dt><dd>{log.id}</dd></div>
      <div><dt>Operation ID</dt><dd>{log.operationId ?? "旧日志未记录"}</dd></div>
      <div><dt>组内顺序</dt><dd>{log.operationSequence ?? "旧日志未记录"}</dd></div>
      <div><dt>技术对象类型</dt><dd>{log.entityType}</dd></div>
      <div><dt>Entity ID</dt><dd>{log.entityId}</dd></div>
      <div><dt>Quote ID</dt><dd>{log.quoteId ?? "—"}</dd></div>
      <div><dt>Order ID</dt><dd>{(log.afterData ?? log.beforeData)?.orderId ?? "—"}</dd></div>
      <div><dt>Legacy Order Item ID（旧日志）</dt><dd>{(log.afterData ?? log.beforeData)?.orderItemId ?? "—"}</dd></div>
      <div><dt>Production Plan ID</dt><dd>{(log.afterData ?? log.beforeData)?.productionPlanId ?? "—"}</dd></div>
      <div><dt>Schedule Assignment ID</dt><dd>{(log.afterData ?? log.beforeData)?.scheduleAssignmentId ?? "—"}</dd></div>
      <div><dt>Closing Period ID</dt><dd>{(log.afterData ?? log.beforeData)?.closingPeriodId ?? "—"}</dd></div>
      <div><dt>Closing Allocation ID</dt><dd>{(log.afterData ?? log.beforeData)?.closingAllocationId ?? "—"}</dd></div>
      <div><dt>原因</dt><dd>{(log.afterData ?? log.beforeData)?.reason ?? "—"}</dd></div>
      <div><dt>对象来源</dt><dd>{(log.afterData ?? log.beforeData)?.objectSource === "brand-default" ? "品牌默认资料" : (log.afterData ?? log.beforeData)?.objectSource === "salesperson-default" ? "客户业务员默认资料" : (log.afterData ?? log.beforeData)?.objectSource === "order" ? "具体订单" : (log.afterData ?? log.beforeData)?.objectSource === "quote" ? "具体报价" : "旧日志未记录"}</dd></div>
      <div><dt>对象名称</dt><dd>{(log.afterData ?? log.beforeData)?.objectName ?? "—"}</dd></div>
      <div><dt>报价编号</dt><dd>{(log.afterData ?? log.beforeData)?.quoteCode ?? "—"}</dd></div>
      <div><dt>QuoteRevision</dt><dd>{(log.afterData ?? log.beforeData)?.revisionLabel ?? "—"} · {(log.afterData ?? log.beforeData)?.revisionId ?? "—"}</dd></div>
      <div><dt>PriceVersion</dt><dd>{(log.afterData ?? log.beforeData)?.priceVersionName ?? "—"} · {(log.afterData ?? log.beforeData)?.priceVersionId ?? "—"}</dd></div>
    </dl>
    <details><summary>查看原始 Before / After</summary><pre>{JSON.stringify({ beforeData: log.beforeData, afterData: log.afterData }, null, 2)}</pre></details>
  </section>)}</div>;
}

function BrowserGlobalOperationLogPage() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("all");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<OperationLogGroup | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([operationLogRepository.list(), mockQuoteRepository.list()])
      .then(([nextLogs, nextQuotes]) => { if (active) { setLogs(nextLogs); setQuotes(nextQuotes); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const targets = useMemo(() => new Map<string, OperationLogQuoteTarget>(quotes.map((quote) => {
    const revision = getDefaultRevision(quote);
    return [quote.id, { quoteStyleNo: revision.baseInfo.quoteStyleNo, styleName: revision.baseInfo.styleName }];
  })), [quotes]);
  const groups = useMemo(() => groupOperationLogs(logs, targets), [logs, targets]);
  const users = useMemo(() => [...new Map(groups.map((group) => [group.userId, group.userName])).entries()], [groups]);
  const modules = useMemo(() => [...new Set(logs.map(operationLogCategory))], [logs]);
  const actions = useMemo(() => [...new Set(groups.map((group) => group.action))], [groups]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return groups.filter((group) => {
      const created = new Date(group.createdAt).getTime();
      return (!needle || operationLogGroupSearchText(group).includes(needle))
        && (userId === "all" || group.userId === userId)
        && (module === "all" || group.events.some((event) => operationLogCategory(event) === module))
        && (action === "all" || group.action === action)
        && created >= fromTime && created <= toTime;
    });
  }, [action, from, groups, module, query, to, userId]);

  const columns = useMemo<DataColumn<OperationLogGroup>[]>(() => [
    { key: "time", header: "时间 / 操作人", width: 160, render: (group) => <div className="qc-audit-cell-stack"><time>{formatTime(group.createdAt)}</time><small>{group.userName}</small></div> },
    { key: "event", header: "业务事件", minWidth: 210, render: (group) => <div className="qc-audit-cell-stack"><strong>{group.action}</strong><small>{group.targetLabel}</small></div> },
    { key: "entity", header: "实体 / Context", width: 150, render: (group) => <div className="qc-audit-cell-stack"><StatusTag tone="neutral">{group.badge}</StatusTag><small>{group.events[0]?.entityType}</small></div> },
    { key: "changes", header: "关键变化", minWidth: 190, render: (group) => {
      const sections = operationLogSections(group);
      const changes = sections.flatMap((section) => section.items.flatMap((item) => item.changes));
      return <div className="qc-audit-cell-stack"><strong>{changes.length ? `${changes.length} 项字段变化` : `${group.events.length} 个事件`}</strong><small>{changes.slice(0, 2).map((item) => item.field).join("、") || "业务操作记录"}</small></div>;
    } },
    { key: "action", header: "操作", width: 88, sticky: "right", render: (group) => <Button variant="text" onClick={() => setSelected(group)}>查看详情</Button> },
  ], []);

  const record = (group: OperationLogGroup) => {
    const changes = operationLogSections(group).flatMap((section) => section.items.flatMap((item) => item.changes));
    return <button type="button" className="qc-audit-mobile-record" onClick={() => setSelected(group)}><header><strong>{group.action}</strong><StatusTag tone="neutral">{group.badge}</StatusTag></header><p>{group.targetLabel}</p><footer><span>{group.userName}</span><time>{formatTime(group.createdAt)}</time><span>{changes.length ? `${changes.length} 项变化` : `${group.events.length} 个事件`}</span></footer></button>;
  };

  return <AppShell title="OperationLog"><PageContainer>
    <PageHeader eyebrow="OPERATION LOG" title="操作日志" description="按业务事件扫描不可变 OperationLog；字段变化优先，原始数据收纳在技术详情中。" />
    <PermissionGuard permission="audit_log.view">
      <Toolbar search={<SearchField value={query} onChange={setQuery} placeholder="搜索对象、操作人、业务动作或款号" />} filters={<><label className="qc-toolbar-field"><span>用户</span><select className="qc-control" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="all">全部用户</option>{users.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="qc-toolbar-field"><span>模块</span><select className="qc-control" value={module} onChange={(event) => setModule(event.target.value)}><option value="all">全部模块</option>{modules.map((item) => <option key={item}>{item}</option>)}</select></label></>} moreFilters={<><label className="qc-toolbar-field"><span>操作</span><select className="qc-control" value={action} onChange={(event) => setAction(event.target.value)}><option value="all">全部操作</option>{actions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="qc-toolbar-field"><span>开始日期</span><input className="qc-control" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="qc-toolbar-field"><span>结束日期</span><input className="qc-control" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></>} resultSummary={`${filtered.length} 次业务操作`} />
      <Card className="qc-audit-event-list"><DataTable rows={filtered} columns={columns} rowKey={(group) => group.id} loading={loading} onRowActivate={setSelected} renderRecord={record} ariaLabel="OperationLog 业务事件" emptyTitle="没有匹配的操作记录" /></Card>
      <Drawer open={Boolean(selected)} className="qc-audit-detail-drawer" title={selected?.action ?? "操作日志详情"} eyebrow="OPERATION LOG DETAIL" description={selected?.targetLabel} onClose={() => setSelected(null)} footer={<Button variant="secondary" onClick={() => setSelected(null)}>关闭</Button>}>
        {selected && <><dl className="qc-audit-detail-meta"><div><dt>时间</dt><dd>{formatTime(selected.createdAt)}</dd></div><div><dt>操作人</dt><dd>{selected.userName}</dd></div><div><dt>实体</dt><dd>{selected.badge}</dd></div><div><dt>业务 Context</dt><dd>{selected.targetLabel}</dd></div><div><dt>Operation ID</dt><dd>{selected.operationId ?? "旧日志未记录"}</dd></div><div><dt>Event 数量</dt><dd>{selected.events.length}</dd></div></dl><OperationLogGroupList groups={[selected]} compact /><details className="qc-audit-technical"><summary>技术详情与原始 Before / After</summary><TechnicalDetails group={selected} /></details></>}
      </Drawer>
    </PermissionGuard>
  </PageContainer></AppShell>;
}
export function GlobalOperationLogPage(){return quoteAuthority()==="server"?<ServerGlobalOperationLogPage />:<BrowserGlobalOperationLogPage />;}

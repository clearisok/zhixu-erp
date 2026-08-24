"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "@/components/foundation";
import type { OperationLog, OperationLogData } from "../model/operation-log";
import { operationLogRepository } from "../repository/operation-log-repository";

const formatTime = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date(iso)).replaceAll("/", "-");

const formatValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "number" ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value) : value;
};

function contextText(data: OperationLogData | null) {
  if (!data) return "";
  return [data.revisionLabel, data.priceVersionName, data.rowName].filter(Boolean).join(" · ");
}

function LogChanges({ log }: { log: OperationLog }) {
  const beforeValues = log.beforeData?.values ?? {};
  const afterValues = log.afterData?.values ?? {};
  const labels = [...new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)])];
  if (!labels.length && (log.beforeData?.attachmentId !== undefined || log.afterData?.attachmentId !== undefined)) {
    return <div className="qc-operation-log-change"><span>附件</span><del>{formatValue(log.beforeData?.attachmentId)}</del><i>→</i><ins>{formatValue(log.afterData?.attachmentId)}</ins></div>;
  }
  return <div className="qc-operation-log-changes">{labels.map((label) => {
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeValues, label);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterValues, label);
    return <div className="qc-operation-log-change" key={label}>
      <span>{label}</span>
      <del>{hasBefore ? formatValue(beforeValues[label]) : "新增"}</del>
      <i>→</i>
      <ins>{hasAfter ? formatValue(afterValues[label]) : "已删除"}</ins>
    </div>;
  })}</div>;
}

export function OperationLogModal({ open, quoteId, onClose }: { open: boolean; quoteId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoading(true);
      return operationLogRepository.listByQuoteId(quoteId);
    }).then((items) => { if (active) setLogs(items); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, quoteId]);

  return <Modal open={open} className="qc-operation-log-modal" title="操作记录" description="关键报价行为按保存时间追加记录，历史日志不可编辑或删除。" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    {loading ? <div className="qc-operation-log-empty">正在载入操作记录…</div> : logs.length === 0 ? <div className="qc-operation-log-empty"><strong>暂无操作记录</strong><p>本次功能启用后的关键报价操作会显示在这里。</p></div> : <ol className="qc-operation-log-timeline">
      {logs.map((log) => <li key={log.id}>
        <span className="qc-operation-log-dot" aria-hidden="true" />
        <article>
          <header><div><strong>{log.action}</strong><small>{contextText(log.afterData ?? log.beforeData)}</small></div><time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time></header>
          <p><b>{log.userName}</b><span>账号快照 · {log.userId}</span></p>
          <LogChanges log={log} />
        </article>
      </li>)}
    </ol>}
  </Modal>;
}

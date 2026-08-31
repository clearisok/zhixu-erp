"use client";

import { Button } from "@/components/foundation";
import {
  formatOperationLogValue,
  operationLogSections,
  type OperationLogGroup,
  type OperationLogPresentationItem,
} from "../model/operation-log-presentation";

const formatTime = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(new Date(iso)).replaceAll("/", "-");

function ChangeRows({ item }: { item: OperationLogPresentationItem }) {
  if (item.mode === "change") return <div className="qc-operation-group-changes">
    <div className="qc-operation-group-change qc-operation-group-change-head"><strong>字段</strong><span>变更前</span><i /><b>变更后</b></div>
    {item.changes.map((change) => <div className="qc-operation-group-change" key={change.field}>
      <strong>{change.field}</strong>
      <span>{formatOperationLogValue(change.field, change.beforeValue, item.log.beforeData)}</span>
      <i>→</i>
      <b>{formatOperationLogValue(change.field, change.afterValue, item.log.afterData)}</b>
    </div>)}
  </div>;

  const exportQuotes = item.data?.exportQuotes ?? [];
  if (item.values.length || exportQuotes.length) return <>
    {item.values.length > 0 && <div className="qc-operation-group-values">
      {item.values.map(([field, value]) => <div key={field}><span>{field}</span><b>{formatOperationLogValue(field, value, item.data)}</b></div>)}
    </div>}
    {exportQuotes.length > 0 && <div className="qc-operation-export-quotes">
      <strong>导出款式 · {exportQuotes.length} 款</strong>
      <details open={exportQuotes.length <= 6}>
        <summary>{exportQuotes.length <= 6 ? "款式清单" : "显示全部款式"}</summary>
        <ol>{exportQuotes.map((quote) => <li key={`${quote.quoteId}:${quote.revisionId}`}>
          <div><b>{quote.styleNo || "未填写款号"}</b><span>{quote.styleName || "未填写款式名称"}</span><small>{quote.revisionLabel || "未标注报价版本"}</small>{quote.exportStatus && <em className={`is-${quote.exportStatus}`}>{quote.exportStatus === "success" ? "成功" : `失败${quote.failureReason ? ` · ${quote.failureReason}` : ""}`}</em>}</div>
          {quote.priceVersions.length > 0 && <ul>{quote.priceVersions.map((version) => <li key={version.priceVersionId}>
            <span>{version.priceVersionName}</span><small>{[version.productionPresetName, version.productionCountry].filter(Boolean).join(" · ") || "未设置制作预设"}</small>
          </li>)}</ul>}
        </li>)}</ol>
      </details>
    </div>}
  </>;

  return <p className="qc-operation-group-summary">{item.log.action}</p>;
}

export function OperationLogGroupList({
  groups,
  compact = false,
  onTechnicalDetails,
}: {
  groups: OperationLogGroup[];
  compact?: boolean;
  onTechnicalDetails?: (group: OperationLogGroup) => void;
}) {
  if (!groups.length) return <div className="qc-operation-log-empty"><strong>暂无操作记录</strong><p>关键业务操作将在成功保存后显示在这里。</p></div>;

  return <ol className={`qc-operation-group-list ${compact ? "is-compact" : ""}`}>
    {groups.map((group) => {
      const sections = operationLogSections(group);
      return <li key={group.id} className="qc-operation-group">
        <header className="qc-operation-group-header">
          <div className="qc-operation-group-actor"><time dateTime={group.createdAt}>{formatTime(group.createdAt)}</time><strong>{group.userName}</strong><small>{group.userId}</small></div>
          <div className="qc-operation-group-title"><strong>{group.action}</strong><span>{group.targetLabel}</span></div>
          <div className="qc-operation-group-tools"><span className="qc-operation-group-badge">{group.badge}</span>{onTechnicalDetails && <Button variant="text" onClick={() => onTechnicalDetails(group)}>技术详情</Button>}</div>
        </header>
        <div className="qc-operation-group-body">
          {sections.length ? sections.map((section) => <section key={section.category} className="qc-operation-group-section">
            <h3>{section.category}</h3>
            <div>{section.items.map((item) => <article key={item.id} className={`qc-operation-group-item is-${item.mode}`}>
              {(section.items.length > 1 || item.title !== group.action || item.mode === "create" || item.mode === "delete") && <h4>{item.title}</h4>}
              <ChangeRows item={item} />
            </article>)}</div>
          </section>) : <p className="qc-operation-group-summary">本次业务操作已完成。</p>}
        </div>
      </li>;
    })}
  </ol>;
}

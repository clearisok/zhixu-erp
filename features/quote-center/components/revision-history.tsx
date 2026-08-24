"use client";

import { Button, StatusTag } from "@/components/foundation";
import type { QuoteRevision } from "../model/quote-view-model";

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function RevisionHistory({ revisions, currentRevisionId, viewedRevisionId, onSelect, onCreateFromHistory }: {
  revisions: QuoteRevision[];
  currentRevisionId: string;
  viewedRevisionId: string;
  onSelect: (revision: QuoteRevision) => void;
  onCreateFromHistory: (revision: QuoteRevision) => void;
}) {
  return <section className="qc-revision-history" aria-label="报价版本历史">
    <header><div><span className="eyebrow">QUOTE REVISION</span><h2>报价版本历史</h2><p>每个报价版本都是整张报价的完整快照；历史版本只读。</p></div></header>
    <div className="qc-revision-timeline">{[...revisions].reverse().map((revision) => {
      const current = revision.revisionId === currentRevisionId;
      const viewed = revision.revisionId === viewedRevisionId;
      return <article key={revision.revisionId} className={`qc-revision-card ${viewed ? "active" : ""}`}>
        <button type="button" className="qc-revision-card-main" onClick={() => onSelect(revision)} aria-pressed={viewed}>
          <span className="qc-revision-card-top"><strong>{revision.revisionLabel}</strong><StatusTag tone={current ? "success" : "neutral"}>{current ? "当前报价版本" : "历史只读"}</StatusTag></span>
          <b>{revision.reason || "其他"}</b>
          <small>{dateTime(revision.createdAt)} · {revision.createdBy}</small>
          {revision.note && <p>{revision.note}</p>}
        </button>
        {!current && viewed && <Button variant="text" onClick={() => onCreateFromHistory(revision)}>基于 {revision.revisionLabel} 创建新报价版本</Button>}
      </article>;
    })}</div>
  </section>;
}

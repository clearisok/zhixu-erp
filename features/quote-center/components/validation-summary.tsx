"use client";

import { useState } from "react";
import type { QuoteValidationIssue } from "../model/quote-validation";

export function ValidationSummary({ title = "请先完成以下内容", issues, onSelect, initiallyExpanded = false }: {
  title?: string;
  issues: QuoteValidationIssue[];
  onSelect?: (issue: QuoteValidationIssue) => void;
  initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  if (!issues.length) return null;

  return <section className={`qc-validation-summary ${expanded ? "is-expanded" : ""}`} role="alert">
    <header>
      <span>!</span>
      <div><strong>{title}</strong><small>共 {issues.length} 项未完成</small></div>
      <button type="button" className="qc-validation-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "收起" : "展开"}</button>
    </header>
    {expanded && <ol>{issues.map((issue, index) => <li key={`${issue.code}-${issue.priceVersionId ?? "quote"}-${index}`}>
      {onSelect
        ? <button type="button" onClick={() => onSelect(issue)}><span>{issue.message}</span><b>定位 →</b></button>
        : <div><span>{issue.message}</span></div>}
    </li>)}</ol>}
  </section>;
}
